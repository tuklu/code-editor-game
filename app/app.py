from flask import Flask, render_template, request, jsonify, session
import subprocess
import os
import json
import tempfile
import shutil
from datetime import datetime
import uuid

app = Flask(__name__)
app.secret_key = ''

# Configuration
TEACHER_USERNAME = 'tuklu15'
TEACHER_PASSWORD = 'AdJk@1526'
PROGRESS_FILE = 'progress.json'
GAME_STATE_FILE = 'game_state.json'

# In-memory game state
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
    """Load student progress from JSON file"""
    try:
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_progress(progress):
    """Save student progress to JSON file"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

def load_game_state():
    """Load game state from file"""
    global current_game
    try:
        with open(GAME_STATE_FILE, 'r') as f:
            current_game.update(json.load(f))
    except FileNotFoundError:
        pass

def save_game_state():
    """Save game state to file"""
    with open(GAME_STATE_FILE, 'w') as f:
        json.dump(current_game, f, indent=2)

def validate_output(expected, actual):
    """Validate if actual output matches expected output"""
    if expected == "variable":
        return len(actual.strip()) > 0
    return expected.strip() == actual.strip()

@app.route('/')
def index():
    return render_template('index.html')

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
    return jsonify({'success': True})

@app.route('/api/game/stop', methods=['POST'])
def stop_game():
    if not session.get('is_teacher'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    global current_game
    current_game['active'] = False
    save_game_state()
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
    return jsonify({'success': True, 'question': current_game['current_question']})

@app.route('/run', methods=['POST'])
def run_code():
    data = request.json
    code = data.get('code', '')
    nickname = data.get('nickname', 'Anonymous')
    
    if not code.strip():
        return jsonify({'error': 'No code provided'})
    
    # Create temporary directory for this execution
    with tempfile.TemporaryDirectory() as temp_dir:
        c_file = os.path.join(temp_dir, 'program.c')
        exe_file = os.path.join(temp_dir, 'program')
        
        try:
            # Write code to file
            with open(c_file, 'w') as f:
                f.write(code)
            
            # Compile the code with warnings enabled
            compile_result = subprocess.run(
                ['gcc', '-Wall', '-Wextra', '-o', exe_file, c_file],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            # Check for compilation errors (non-zero return code)
            if compile_result.returncode != 0:
                return jsonify({
                    'error': compile_result.stderr,
                    'type': 'compilation_error'
                })
            
            # Run the compiled program
            run_result = subprocess.run(
                [exe_file],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            output = run_result.stdout
            
            # Check if this is a game submission
            challenge_cleared = False
            if current_game['active'] and current_game['current_question'] and nickname in current_game['participants']:
                expected = current_game['current_question'].get('expected_output', '')
                if validate_output(expected, output):
                    challenge_cleared = True
                    current_game['participants'][nickname]['current_score'] += 1
                    current_game['participants'][nickname]['submissions'].append({
                        'question_id': current_game['current_question']['id'],
                        'code': code,
                        'output': output,
                        'correct': True,
                        'timestamp': datetime.now().isoformat()
                    })
                    save_game_state()
            
            response = {
                'output': output,
                'stderr': run_result.stderr,
                'challenge_cleared': challenge_cleared
            }
            
            # Include compilation warnings if any
            if compile_result.stderr.strip():
                response['warnings'] = compile_result.stderr
            
            return jsonify(response)
            
        except subprocess.TimeoutExpired:
            return jsonify({
                'error': 'Program execution timed out',
                'type': 'timeout_error'
            })
        except Exception as e:
            return jsonify({
                'error': f'Execution error: {str(e)}',
                'type': 'runtime_error'
            })

@app.route('/api/leaderboard')
def get_leaderboard():
    """Get current game leaderboard"""
    if not current_game['active']:
        return jsonify([])
    
    leaderboard = []
    for nickname, data in current_game['participants'].items():
        leaderboard.append({
            'nickname': nickname,
            'score': data['current_score'],
            'submissions': len(data['submissions'])
        })
    
    # Sort by score (descending)
    leaderboard.sort(key=lambda x: -x['score'])
    
    return jsonify(leaderboard)

if __name__ == '__main__':
    load_game_state()
    app.run(host='0.0.0.0', port=5000, debug=True)