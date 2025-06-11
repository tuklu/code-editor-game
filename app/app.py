from flask import Flask, render_template, request, jsonify, session
import secrets
import subprocess
import os
import json
import tempfile
import shutil
from datetime import datetime
import uuid
import signal
import threading
import time
import fcntl
import termios
import struct
import logging
import sys
# SocketIO and PTY imports for real-time terminal functionality
from flask_socketio import SocketIO, emit, disconnect, join_room, leave_room
import threading, pty, select

# Configure logging for Docker deployment
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/app/logs/app.log') if os.path.exists('/app/logs') else logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

# SocketIO configuration optimized for Docker environments
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    # Disable debug logging to reduce noise
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=30,
    # Threading mode for better Docker compatibility
    transports=['polling', 'websocket'],
    allow_upgrades=True
)

# Global session management
active_sessions = {}
session_lock = threading.Lock()

# Directory paths with Docker/local fallbacks
TEMP_DIR = '/app/temp' if os.path.exists('/app/temp') else './temp'
LOGS_DIR = '/app/logs' if os.path.exists('/app/logs') else './logs'
DATA_DIR = '/app/data' if os.path.exists('/app/data') else './data'
MAX_SESSIONS = int(os.environ.get('MAX_SESSIONS', '30'))
COMPILE_TIMEOUT = int(os.environ.get('COMPILE_TIMEOUT', '15'))
EXECUTION_TIMEOUT = int(os.environ.get('EXECUTION_TIMEOUT', '30'))

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

class PTYSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.master_fd = None
        self.process = None
        self.reader_thread = None
        self.monitor_thread = None
        self.active = False
        self.lock = threading.Lock()
        self.temp_dir = None
        
    def cleanup(self):
        """Clean up all session resources including processes and temp files"""
        with self.lock:
            if not self.active:
                return
                
            logger.info(f"Cleaning up PTY session {self.session_id}")
            self.active = False
            
            # Kill process group to ensure all child processes are terminated
            if self.process:
                try:
                    if self.process.poll() is None:
                        pgid = os.getpgid(self.process.pid)
                        os.killpg(pgid, signal.SIGTERM)
                        time.sleep(0.5)
                        
                        if self.process.poll() is None:
                            os.killpg(pgid, signal.SIGKILL)
                            
                    self.process.wait(timeout=2)
                except Exception as e:
                    logger.warning(f"Error killing process for session {self.session_id}: {e}")
                finally:
                    self.process = None
                    
            # Close PTY file descriptor
            if self.master_fd:
                try:
                    os.close(self.master_fd)
                except Exception as e:
                    logger.warning(f"Error closing PTY for session {self.session_id}: {e}")
                finally:
                    self.master_fd = None
                    
            # Remove session-specific temporary directory
            if self.temp_dir and os.path.exists(self.temp_dir):
                try:
                    shutil.rmtree(self.temp_dir)
                except Exception as e:
                    logger.warning(f"Error cleaning temp dir for session {self.session_id}: {e}")
                    
            self.reader_thread = None
            self.monitor_thread = None
            logger.info(f"Session {self.session_id} cleaned up")

# Teacher authentication credentials
TEACHER_USERNAME = 'tuklu15'
TEACHER_PASSWORD = 'AdJk@1526'
PROGRESS_FILE = os.path.join(DATA_DIR, 'progress.json')
GAME_STATE_FILE = os.path.join(DATA_DIR, 'game_state.json')

# In-memory game state structure
current_game = {
    'active': False,
    'current_question': None,
    'question_index': 0,
    'questions': [],
    'timer': 0,
    'start_time': None,
    'participants': {}
}

def load_progress():
    try:
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_progress(progress):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

def load_game_state():
    global current_game
    try:
        with open(GAME_STATE_FILE, 'r') as f:
            current_game.update(json.load(f))
    except FileNotFoundError:
        pass

def save_game_state():
    with open(GAME_STATE_FILE, 'w') as f:
        json.dump(current_game, f, indent=2)

def validate_output(expected, actual):
    if expected == "variable":
        return len(actual.strip()) > 0
    return expected.strip() == actual.strip()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return app.send_static_file(filename)

@app.route('/teacher')
def teacher_panel():
    if not session.get('is_teacher'):
        return render_template('teacher_login.html')
    return render_template('teacher_panel.html')

@app.route('/api/teacher/login', methods=['POST'])
def teacher_login():
    data = request.json
    username = data.get('username', '')
    password = data.get('password', '')
    
    if username == TEACHER_USERNAME and password == TEACHER_PASSWORD:
        session['is_teacher'] = True
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'message': 'Invalid credentials'})

@app.route('/api/teacher/logout', methods=['POST'])
def teacher_logout():
    session.pop('is_teacher', None)
    return jsonify({'success': True})

@app.route('/api/teacher/status', methods=['GET'])
def teacher_status():
    return jsonify({'authenticated': session.get('is_teacher', False)})

@app.route('/api/game/start', methods=['POST'])
def start_game():
    if not session.get('is_teacher'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    questions = data.get('questions', [])
    timer = data.get('timer', 0)
    
    global current_game
    current_game = {
        'active': True,
        'current_question': questions[0] if questions else None,
        'question_index': 0,
        'questions': questions,
        'timer': timer,
        'start_time': datetime.now().isoformat(),
        'participants': {}
    }
    
    save_game_state()
    socketio.emit('game_started', {
        'question': current_game['current_question'],
        'timer': timer
    }, namespace='/')
    
    return jsonify({'success': True})

@app.route('/api/game/stop', methods=['POST'])
def stop_game():
    if not session.get('is_teacher'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    global current_game
    current_game['active'] = False
    save_game_state()
    socketio.emit('game_stopped', {}, namespace='/')
    return jsonify({'success': True})

@app.route('/api/game/next', methods=['POST'])
def next_question():
    if not session.get('is_teacher'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    global current_game
    if current_game['active'] and current_game['question_index'] < len(current_game['questions']) - 1:
        current_game['question_index'] += 1
        current_game['current_question'] = current_game['questions'][current_game['question_index']]
        save_game_state()
        
        socketio.emit('new_question', {
            'question': current_game['current_question'],
            'question_index': current_game['question_index']
        }, namespace='/')
    
    return jsonify({'success': True, 'question': current_game['current_question']})

@app.route('/api/game/status')
def game_status():
    return jsonify({
        'active': current_game['active'],
        'current_question': current_game['current_question'],
        'question_index': current_game['question_index'],
        'total_questions': len(current_game['questions']),
        'timer': current_game['timer']
    })

@app.route('/api/game/join', methods=['POST'])
def join_game():
    data = request.json
    nickname = data.get('nickname', '')
    
    if not current_game['active']:
        return jsonify({'error': 'No active game'})
    
    current_game['participants'][nickname] = {
        'joined_at': datetime.now().isoformat(),
        'current_score': 0,
        'submissions': []
    }
    
    save_game_state()
    socketio.emit('participant_joined', {
        'nickname': nickname,
        'participants_count': len(current_game['participants'])
    }, namespace='/')
    
    return jsonify({'success': True, 'question': current_game['current_question']})

@app.route('/api/leaderboard')
def get_leaderboard():
    if not current_game['active']:
        return jsonify([])
    
    leaderboard = []
    for nickname, data in current_game['participants'].items():
        leaderboard.append({
            'nickname': nickname,
            'score': data['current_score'],
            'submissions': len(data['submissions'])
        })
    
    leaderboard.sort(key=lambda x: -x['score'])
    return jsonify(leaderboard)

@app.route('/leaderboard')
def leaderboard_page():
    return render_template('leaderboard.html')

def pty_reader(session_id, master_fd):
    """Read PTY output and emit to client via SocketIO"""
    logger.info(f"PTY reader started for session {session_id}")
    
    with session_lock:
        session = active_sessions.get(session_id)
    
    if not session:
        logger.error(f"No session found for PTY reader {session_id}")
        return
        
    try:
        while session.active:
            try:
                # Non-blocking read with select
                r, _, _ = select.select([master_fd], [], [], 0.1)
                
                if master_fd in r:
                    data = os.read(master_fd, 8192)
                    if data:
                        try:
                            decoded_data = data.decode('utf-8', errors='replace')
                            socketio.emit('pty-output', decoded_data, namespace='/pty', room=session_id)
                        except Exception as e:
                            logger.warning(f"Decode error for session {session_id}: {e}")
                    else:
                        logger.info(f"PTY EOF for session {session_id}")
                        break
                        
            except OSError as e:
                if e.errno == 5:  # Input/output error indicates PTY closed
                    logger.info(f"PTY closed for session {session_id}")
                    break
                else:
                    logger.error(f"PTY read error for session {session_id}: {e}")
                    break
            except Exception as e:
                logger.error(f"Unexpected PTY error for session {session_id}: {e}")
                break
                
    except Exception as e:
        logger.error(f"PTY reader exception for session {session_id}: {e}")
    finally:
        logger.info(f"PTY reader ended for session {session_id}")

def process_monitor(session_id):
    """Monitor process execution and handle timeouts"""
    logger.info(f"Process monitor started for session {session_id}")
    
    with session_lock:
        session = active_sessions.get(session_id)
    
    if not session or not session.process:
        logger.error(f"No process to monitor for session {session_id}")
        return
    
    try:
        return_code = session.process.wait(timeout=EXECUTION_TIMEOUT)
        time.sleep(0.5)  # Brief delay to ensure all output is captured
        
        if return_code == 0:
            socketio.emit('pty-output', f'\nProgram completed successfully (exit code: {return_code})\n',
                        namespace='/pty', room=session_id)
        else:
            socketio.emit('pty-output', f'\nProgram exited with code: {return_code}\n',
                        namespace='/pty', room=session_id)
                        
    except subprocess.TimeoutExpired:
        logger.warning(f"Process timeout for session {session_id}")
        socketio.emit('pty-output', f'\nProgram execution timed out ({EXECUTION_TIMEOUT}s limit)\n',
                    namespace='/pty', room=session_id)
        
        # Force kill the process group
        try:
            if session.process and session.process.poll() is None:
                pgid = os.getpgid(session.process.pid)
                os.killpg(pgid, signal.SIGKILL)
        except Exception as e:
            logger.error(f"Error killing timed out process: {e}")
            
    except Exception as e:
        logger.error(f"Process monitor error for session {session_id}: {e}")
        socketio.emit('pty-output', f'\nMonitor error: {str(e)}\n',
                    namespace='/pty', room=session_id)
    finally:
        socketio.emit('pty-output', '-' * 50 + '\n', namespace='/pty', room=session_id)
        time.sleep(0.1)
        
        # Clean up session when process ends
        with session_lock:
            if session_id in active_sessions:
                active_sessions[session_id].cleanup()
        
        logger.info(f"Process monitor ended for session {session_id}")

@socketio.on('connect', namespace='/pty')
def handle_pty_connect():
    session_id = request.sid
    logger.info(f"PTY client connected: {session_id}")
    
    # Enforce session limit to prevent resource exhaustion
    if len(active_sessions) >= MAX_SESSIONS:
        emit('pty-output', f'Server at capacity ({MAX_SESSIONS} sessions). Try again later.\n')
        disconnect()
        return
    
    with session_lock:
        # Clean up any existing session with same ID
        if session_id in active_sessions:
            active_sessions[session_id].cleanup()
            del active_sessions[session_id]
        
        active_sessions[session_id] = PTYSession(session_id)
    
    join_room(session_id)
    
    emit('pty-output', 'Connected to C Programming Environment!\n')
    emit('pty-output', 'Write your C code and click "Run Code" to execute it!\n')
    emit('pty-output', 'Interactive input (scanf) is fully supported.\n')
    emit('pty-output', '-' * 50 + '\n')

@socketio.on('disconnect', namespace='/pty')
def handle_pty_disconnect():
    session_id = request.sid
    logger.info(f"PTY client disconnected: {session_id}")
    
    leave_room(session_id)
    
    with session_lock:
        if session_id in active_sessions:
            active_sessions[session_id].cleanup()
            del active_sessions[session_id]

@socketio.on('run', namespace='/pty')
def handle_run(message):
    """Compile and execute C code in isolated environment"""
    session_id = request.sid
    
    with session_lock:
        session = active_sessions.get(session_id)
    
    if not session:
        emit('pty-output', 'Session not found. Please refresh the page.\n')
        return
    
    code = message.get('code', '').strip()
    
    if not code:
        emit('pty-output', 'No code provided\n')
        return
    
    # Clean up any previous execution
    session.cleanup()
    
    try:
        # Create isolated temporary directory for this execution
        session.temp_dir = tempfile.mkdtemp(dir=TEMP_DIR, prefix=f'session_{session_id}_')
        c_file = os.path.join(session.temp_dir, 'program.c')
        exe_file = os.path.join(session.temp_dir, 'program')
        
        with open(c_file, 'w', encoding='utf-8') as f:
            f.write(code)
        
        emit('pty-output', 'Compiling your code...\n')
        
        # Compile with warnings enabled for better learning
        compile_result = subprocess.run(
            ['gcc', '-Wall', '-Wextra', '-std=c99', '-g', '-O1', '-o', exe_file, c_file],
            capture_output=True,
            text=True,
            timeout=COMPILE_TIMEOUT,
            cwd=session.temp_dir
        )
        
        if compile_result.returncode != 0:
            emit('pty-output', 'Compilation failed:\n')
            emit('pty-output', compile_result.stderr)
            emit('pty-output', '\nCheck your syntax and try again.\n')
            emit('pty-output', '-' * 50 + '\n')
            return
        
        # Show warnings if any (non-blocking)
        if compile_result.stderr.strip():
            emit('pty-output', 'Compilation warnings:\n')
            emit('pty-output', compile_result.stderr)
            emit('pty-output', '\n')
        
        emit('pty-output', 'Compilation successful!\n')
        emit('pty-output', 'Running your program...\n')
        
        # Detect interactive input requirements
        if 'scanf' in code or 'gets' in code or 'getchar' in code:
            emit('pty-output', 'Input handling ready - type in the input field when prompted.\n')
        
        emit('pty-output', '-' * 50 + '\n')
        
        # Create PTY for interactive I/O
        master, slave = pty.openpty()
        
        session.master_fd = master
        session.active = True
        
        # Start process in new process group for clean termination
        session.process = subprocess.Popen(
            [exe_file],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            preexec_fn=os.setsid,  # Create new process group
            cwd=session.temp_dir
        )
        
        os.close(slave)  # Close slave end in parent process
        
        # Start background threads for I/O handling
        session.reader_thread = threading.Thread(
            target=pty_reader,
            args=(session_id, master),
            daemon=True
        )
        session.reader_thread.start()
        
        session.monitor_thread = threading.Thread(
            target=process_monitor,
            args=(session_id,),
            daemon=True
        )
        session.monitor_thread.start()
        
    except subprocess.TimeoutExpired:
        emit('pty-output', f'Compilation timed out ({COMPILE_TIMEOUT}s limit)\n')
        emit('pty-output', '-' * 50 + '\n')
    except Exception as e:
        emit('pty-output', f'Execution error: {str(e)}\n')
        emit('pty-output', '-' * 50 + '\n')
        logger.error(f"Run handler error for session {session_id}: {e}")

@socketio.on('input', namespace='/pty')
def handle_input(message):
    """Send user input to running C program via PTY"""
    session_id = request.sid
    
    with session_lock:
        session = active_sessions.get(session_id)
    
    if not session or not session.master_fd or not session.active:
        emit('pty-output', 'No active program to send input to\n')
        return
    
    data = message.get('data', '')
    logger.info(f"Session {session_id} sending input: {repr(data)}")
    
    try:
        bytes_written = os.write(session.master_fd, data.encode('utf-8'))
        logger.info(f"Successfully sent {bytes_written} bytes to session {session_id}")
    except OSError as e:
        logger.error(f"OSError sending input to session {session_id}: {e}")
        emit('pty-output', 'Failed to send input - program may have terminated\n')
        session.cleanup()
    except Exception as e:
        logger.error(f"Input error for session {session_id}: {e}")
        emit('pty-output', f'Input error: {str(e)}\n')

@socketio.on('kill', namespace='/pty')
def handle_kill():
    """Forcefully terminate running program"""
    session_id = request.sid
    
    with session_lock:
        session = active_sessions.get(session_id)
    
    if session and session.process:
        try:
            emit('pty-output', '\nTerminating program...\n')
            # Kill entire process group to handle child processes
            pgid = os.getpgid(session.process.pid)
            os.killpg(pgid, signal.SIGTERM)
            time.sleep(0.5)
            
            # Force kill if still running
            if session.process.poll() is None:
                os.killpg(pgid, signal.SIGKILL)
                
            emit('pty-output', 'Program terminated\n')
            emit('pty-output', '-' * 50 + '\n')
        except Exception as e:
            emit('pty-output', f'\nFailed to terminate: {str(e)}\n')
            emit('pty-output', '-' * 50 + '\n')
        finally:
            session.cleanup()
    else:
        emit('pty-output', 'No running program to terminate\n')

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

import atexit

def cleanup_all_sessions():
    """Emergency cleanup for all active sessions"""
    logger.info("Cleaning up all sessions...")
    with session_lock:
        for session in active_sessions.values():
            session.cleanup()
        active_sessions.clear()
    
    # Clean up orphaned temp directories
    try:
        for item in os.listdir(TEMP_DIR):
            item_path = os.path.join(TEMP_DIR, item)
            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
    except Exception as e:
        logger.warning(f"Error cleaning temp directories: {e}")
    
    logger.info("All sessions cleaned up")

# Register cleanup to run on process exit
atexit.register(cleanup_all_sessions)

if __name__ == '__main__':
    # Load persistent game state on startup
    load_game_state()
    logger.info("Starting Enhanced C Programming Practice Server...")
    logger.info("Threading-mode SocketIO enabled for Docker compatibility")
    logger.info("Game functionality enabled")
    logger.info("Enhanced resource management")
    logger.info("-" * 50)
    
    try:
        # Run server with production settings
        socketio.run(
            app, 
            host='0.0.0.0',  # Accept connections from any IP
            port=5000,
            debug=False,     # Disable debug mode for production
            use_reloader=False  # Prevent duplicate processes
        )
    except KeyboardInterrupt:
        logger.info("\nServer shutting down...")
        cleanup_all_sessions()
    except Exception as e:
        logger.error(f"Server error: {e}")
        cleanup_all_sessions()