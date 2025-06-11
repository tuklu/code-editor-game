// Main Application Variables
const runButton = document.getElementById('runButton');
const reconnectButton = document.getElementById('reconnectButton');
const output = document.getElementById('output');
const inputField = document.getElementById('inputField');
const connectionStatus = document.getElementById('connectionStatus');

let currentNickname = '';
let gameJoined = false;
let lastGameStatus = null;
let programRunning = false;
let connectionAttempts = 0;
const maxRetries = 3;

// Socket.IO connection
let socket;

// Enhanced UI state variables
let isMaximized = false;
let isOutputHidden = false;
let isWordWrapEnabled = true;
let currentMobileTab = 'editor';

// Editor abstraction - handles Monaco/fallback gracefully to avoid recursion
function getCodeFromEditor() {
    // Try Monaco editor first
    if (window.monacoEditor && window.monacoEditor.getValue) {
        try {
            return window.monacoEditor.getValue();
        } catch (e) {
            console.log('Monaco editor not ready, trying fallback');
        }
    }
    
    // Fallback to textarea
    const textarea = document.getElementById('fallbackEditor');
    if (textarea) {
        return textarea.value;
    }
    
    console.warn('No editor found');
    return '';
}

// Initialize Socket.IO PTY namespace with production-grade retry configuration
function initializeSocket() {
    if (socket) {
        socket.disconnect();
    }
    
    console.log('Initializing socket connection...');
    
    socket = io('/pty', {
        transports: ['polling', 'websocket'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        forceNew: true // Prevents connection reuse issues in Docker environments
    });
    
    setupSocketListeners();
}

// Detects actual program completion to prevent premature UI state changes
// Required because partial output can contain misleading completion-like text
function isProgramComplete(data) {
    const completionIndicators = [
        'Program completed successfully',
        'Program exited with code',
        'Program execution timed out',
        'Program terminated',
        'Compilation failed'
    ];
    
    // Check for separator line that indicates end of server-side execution
    const hasSeparator = data.includes('─'.repeat(20)) || data.includes('─'.repeat(50));
    
    const hasCompletionIndicator = completionIndicators.some(indicator => 
        data.includes(indicator)
    );
    
    // Conservative approach: require both separator and indicator for most cases
    // Strong indicators can trigger completion alone for reliability
    return (hasSeparator && hasCompletionIndicator) || 
           data.includes('Program completed successfully') ||
           data.includes('Program exited with code') ||
           data.includes('Compilation failed');
}

// Socket event handlers with enhanced state management for production reliability
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Socket.IO PTY connected - ID:', socket.id);
        connectionAttempts = 0;
        
        if (runButton) runButton.disabled = false;
        if (inputField) {
            inputField.disabled = false;
            inputField.style.borderColor = '#4CAF50';
        }
        if (reconnectButton) reconnectButton.style.display = 'none';
        
        // Show temporary connection status for user feedback
        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
            connectionStatus.style.display = 'block';
            setTimeout(() => {
                connectionStatus.style.display = 'none';
            }, 3000);
        }
        
        // Reset UI state only if no program is currently running
        if (!programRunning) {
            resetUIState();
        }
    });
    
    socket.on('pty-output', (data) => {
        console.log('Received PTY output length:', data.length);
        if (output) {
            output.textContent += data;
            output.scrollTop = output.scrollHeight;
        }
        
        // Input detection - highlight input field but preserve stop button functionality
        // This prevents race conditions where users lose the ability to stop hung programs
        if ((data.includes('Enter') || data.includes('input') || data.includes('scanf')) && 
            (data.includes(':') || data.includes('?')) && 
            programRunning && inputField) {
            inputField.style.borderColor = '#FFD700';
            inputField.placeholder = "Program waiting for input - type here and press Enter";
            inputField.focus();
            
            console.log('Program asking for input, keeping stop button active');
        }
        
        // Only reset UI on confirmed program termination to prevent premature state changes
        if (isProgramComplete(data)) {
            console.log('Program completion detected, resetting UI state');
            setTimeout(resetUIState, 500);
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Socket.IO PTY disconnected:', reason);
        
        if (connectionAttempts < maxRetries && output) {
            output.textContent += `\nConnection lost (${reason}), reconnecting...\n`;
        }
        
        if (runButton) runButton.disabled = true;
        if (inputField) {
            inputField.disabled = true;
            inputField.style.borderColor = '#ff6b6b';
        }
        connectionAttempts++;
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        connectionAttempts++;
        
        if (connectionAttempts >= maxRetries && output) {
            output.textContent += `\nFailed to connect after ${maxRetries} attempts.\n`;
            output.textContent += 'Click the Reconnect button to try again.\n';
            if (reconnectButton) reconnectButton.style.display = 'inline-block';
            if (runButton) runButton.disabled = true;
            if (inputField) inputField.disabled = true;
        } else if (output) {
            output.textContent += `\nConnection attempt ${connectionAttempts} failed, retrying...\n`;
        }
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
        connectionAttempts = 0;
        
        if (!programRunning && output) {
            output.textContent += `\nReconnected successfully!\n`;
        }
        
        if (runButton) runButton.disabled = false;
        if (inputField) {
            inputField.disabled = false;
            inputField.style.borderColor = '#4CAF50';
        }
    });
}

// Resets UI to initial state after confirmed program termination
function resetUIState() {
    console.log('Resetting UI state - Program terminated');
    programRunning = false;
    
    // Toggle button back to run state
    if (runButton) {
        runButton.disabled = false;
        runButton.textContent = 'Run Code';
        runButton.className = 'run-button';
        runButton.style.background = '#4CAF50';
        console.log('Button reset to Run Code state');
    }
    
    if (inputField) {
        inputField.style.borderColor = '#4CAF50';
        inputField.placeholder = "Type input here and press Enter...";
    }
    
    // Clear focus to prevent accidental input
    if (inputField && document.activeElement === inputField) {
        inputField.blur();
    }
}

function reconnectSocket() {
    if (output) output.textContent += '\nManually reconnecting...\n';
    if (reconnectButton) reconnectButton.style.display = 'none';
    connectionAttempts = 0;
    
    if (connectionStatus) {
        connectionStatus.textContent = 'Reconnecting...';
        connectionStatus.className = 'connection-status connecting';
        connectionStatus.style.display = 'block';
    }
    
    initializeSocket();
}

// Enhanced toggle-based code execution with mobile auto-switch
function runCode() {
    // Toggle: if program running, stop it instead
    if (programRunning) {
        stopProgram();
        return;
    }
    
    console.log('runCode called');
    
    const code = getCodeFromEditor().trim();
    
    if (!code) {
        if (output) output.textContent += 'No code to run\n';
        return;
    }
    
    if (!socket || !socket.connected) {
        if (output) output.textContent += 'Not connected to server. Attempting to reconnect...\n';
        initializeSocket();
        
        // Retry mechanism with reasonable timeout
        setTimeout(() => {
            if (socket && socket.connected) {
                runCode();
            } else if (output) {
                output.textContent += 'Failed to reconnect. Please try the Reconnect button or refresh the page.\n';
            }
        }, 3000);
        return;
    }
    
    // Prepare UI for program execution
    if (output) {
        output.textContent = 'Compiling and running your code...\n';
        output.textContent += '─'.repeat(50) + '\n';
    }
    
    // Auto-switch to output tab on mobile when running code
    autoSwitchToOutput();
    
    // Update UI to stop mode - allows user to terminate hung programs
    programRunning = true;
    if (runButton) {
        runButton.disabled = false;
        runButton.textContent = 'Stop Program';
        runButton.className = 'run-button stop-button';
        runButton.style.background = '#ff6b6b';
        console.log('Button changed to Stop Program state');
    }
    
    if (inputField) {
        inputField.style.borderColor = '#4CAF50';
        inputField.placeholder = "Program will prompt if input needed...";
    }
    
    console.log('Emitting run event with code length:', code.length);
    socket.emit('run', { code: code });
    
    // Failsafe timeout for programs that may hang without proper termination signals
    setTimeout(() => {
        if (programRunning && output) {
            console.log('Failsafe timeout triggered - program may have hung');
            output.textContent += '\nProgram execution seems to be taking too long.\n';
            output.textContent += 'Click "Stop Program" to terminate it.\n';
        }
    }, 35000);
}

function stopProgram() {
    if (!socket || !socket.connected) {
        if (output) output.textContent += 'Not connected to server\n';
        reconnectSocket();
        return;
    }
    
    console.log('Stopping program');
    
    // Show stopping state to prevent multiple stop requests
    if (runButton) {
        runButton.disabled = true;
        runButton.textContent = 'Stopping...';
        runButton.className = 'run-button stopping';
        runButton.style.background = '#666';
    }
    
    socket.emit('kill');
    if (output) output.textContent += '\nStopping program...\n';
    
    // Reset UI after brief delay to allow server cleanup
    setTimeout(resetUIState, 1000);
}

function killProgram() {
    stopProgram();
}

// Enhanced input handling - removed client-side echo
function sendInput(event) {
    if (event.key === 'Enter') {
        const input = inputField.value;
        
        console.log('Sending input:', input);
        
        if (!socket || !socket.connected) {
            if (output) output.textContent += 'Not connected to server\n';
            return;
        }
        
        if (!programRunning) {
            console.log('No program running to send input to');
            return;
        }
        
        // Send input with newline (required for most C programs)
        const inputData = input + '\n';
        socket.emit('input', { data: inputData });
        
        // REMOVED: No longer echo input to output artificially
        // The terminal echo will handle showing the input naturally
        
        inputField.value = '';
        inputField.focus();
        
        // Reset styling but preserve stop button functionality
        inputField.style.borderColor = '#4CAF50';
        inputField.placeholder = "Program may ask for more input...";
        
        // Ensure stop button remains active since program continues running
        if (runButton && programRunning) {
            runButton.disabled = false;
            runButton.textContent = 'Stop Program';
            runButton.className = 'run-button stop-button';
            runButton.style.background = '#ff6b6b';
            console.log('Input sent, keeping stop button active');
        }
    }
}

// Nickname Management
function setNickname() {
    const nicknameInput = document.getElementById('nicknameInput');
    const nicknameModal = document.getElementById('nicknameModal');
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    
    if (!nicknameInput) {
        console.error('Nickname input not found');
        return;
    }
    
    const nickname = nicknameInput.value.trim();
    if (nickname) {
        currentNickname = nickname;
        sessionStorage.setItem('nickname', nickname);
        
        if (nicknameModal) nicknameModal.style.display = 'none';
        if (nicknameDisplay) nicknameDisplay.textContent = currentNickname;
        
        checkGameStatus();
        console.log('Nickname set:', currentNickname);
    } else {
        alert('Please enter a valid nickname');
    }
}

// Game status polling with change detection to minimize DOM updates
async function checkGameStatus() {
    try {
        const response = await fetch('/api/game/status');
        
        if (response.ok) {
            const status = await response.json();
            
            // Only update DOM if status actually changed to prevent unnecessary reflows
            if (!lastGameStatus || 
                lastGameStatus.active !== status.active || 
                lastGameStatus.current_question !== status.current_question) {
                
                lastGameStatus = status;
                
                const gameAlert = document.getElementById('gameAlert');
                const questionCard = document.getElementById('questionCard');
                
                if (status.active === true && !gameJoined && gameAlert) {
                    gameAlert.style.display = 'block';
                } else if (gameAlert) {
                    gameAlert.style.display = 'none';
                }
                
                if (status.active === false && questionCard) {
                    questionCard.classList.remove('active');
                    gameJoined = false;
                }
                
                if (gameJoined && status.current_question) {
                    displayQuestion(status.current_question);
                }
            }
        } else {
            if (!lastGameStatus || lastGameStatus.active !== false) {
                const gameAlert = document.getElementById('gameAlert');
                if (gameAlert) gameAlert.style.display = 'none';
                lastGameStatus = { active: false };
            }
        }
        
    } catch (error) {
        if (!lastGameStatus || lastGameStatus.active !== false) {
            const gameAlert = document.getElementById('gameAlert');
            if (gameAlert) gameAlert.style.display = 'none';
            lastGameStatus = { active: false };
        }
    }
}

async function joinGame() {
    try {
        const response = await fetch('/api/game/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname })
        });
        
        const result = await response.json();
        if (result.success) {
            gameJoined = true;
            const gameAlert = document.getElementById('gameAlert');
            if (gameAlert) gameAlert.style.display = 'none';
            
            if (result.question) {
                displayQuestion(result.question);
            }
        } else {
            alert(result.error || 'Failed to join game');
        }
    } catch (error) {
        console.error('Failed to join game:', error);
        alert('Failed to join game. Server not available.');
    }
}

function displayQuestion(question) {
    const questionTitle = document.getElementById('questionTitle');
    const questionDescription = document.getElementById('questionDescription');
    const questionHint = document.getElementById('questionHint');
    const questionCard = document.getElementById('questionCard');
    
    if (questionTitle) questionTitle.textContent = question.title;
    if (questionDescription) questionDescription.textContent = question.description;
    if (questionHint) questionHint.textContent = question.hint || 'No hint available';
    if (questionCard) questionCard.classList.add('active');
}

// Mobile keyboard helper functions for touch devices
function insertText(text) {
    // Try Monaco editor first
    if (window.monacoEditor && window.monacoEditor.getSelection) {
        try {
            const selection = window.monacoEditor.getSelection();
            const id = { major: 1, minor: 1 };
            const op = {
                identifier: id,
                range: selection,
                text: text,
                forceMoveMarkers: true
            };
            window.monacoEditor.executeEdits("my-source", [op]);
            window.monacoEditor.focus();
            return;
        } catch (e) {
            console.log('Monaco not ready, using fallback');
        }
    }
    
    // Fallback to textarea
    const textarea = document.getElementById('fallbackEditor');
    if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
    }
}

// Enhanced clearCode with word wrap class preservation
function clearCode() {
    // Try Monaco editor first
    if (window.monacoEditor && window.monacoEditor.setValue) {
        try {
            window.monacoEditor.setValue('');
            return;
        } catch (e) {
            console.log('Monaco not ready, using fallback');
        }
    }
    
    // Fallback to textarea
    const textarea = document.getElementById('fallbackEditor');
    if (textarea) {
        textarea.value = '';
    }
    
    if (output) {
        output.textContent = 'Code cleared. Write some C code and run it!';
        // Preserve word wrap class
        output.className = isWordWrapEnabled ? 'output word-wrap' : 'output no-wrap';
    }
}

// NEW ENHANCED UI FUNCTIONS

// Maximize/Restore Editor
function toggleMaximize() {
    const container = document.getElementById('editorContainer');
    const btn = document.getElementById('maximizeBtn');
    
    if (!container || !btn) return;
    
    isMaximized = !isMaximized;
    
    if (isMaximized) {
        container.classList.add('maximized');
        btn.innerHTML = '⬌ Restore';
        btn.title = 'Restore Split View';
    } else {
        container.classList.remove('maximized');
        btn.innerHTML = '⛶ Maximize';
        btn.title = 'Maximize Editor';
    }
    
    // Trigger Monaco resize if available
    if (window.monacoEditor && window.monacoEditor.layout) {
        setTimeout(() => window.monacoEditor.layout(), 100);
    }
}

// Hide/Show Output Panel
function toggleOutput() {
    const outputSection = document.getElementById('outputSection');
    const btn = document.getElementById('hideBtn');
    const container = document.getElementById('editorContainer');
    
    if (!outputSection || !btn || !container) return;
    
    isOutputHidden = !isOutputHidden;
    
    if (isOutputHidden) {
        container.classList.add('maximized');
        btn.innerHTML = '👁️ Show';
        btn.title = 'Show Output Panel';
    } else {
        container.classList.remove('maximized');
        btn.innerHTML = '👁️ Hide';
        btn.title = 'Hide Output Panel';
    }
    
    // Trigger Monaco resize
    if (window.monacoEditor && window.monacoEditor.layout) {
        setTimeout(() => window.monacoEditor.layout(), 100);
    }
}

// Toggle Word Wrap in Output
function toggleWordWrap() {
    const output = document.getElementById('output');
    const btn = document.getElementById('wrapBtn');
    
    if (!output || !btn) return;
    
    isWordWrapEnabled = !isWordWrapEnabled;
    
    if (isWordWrapEnabled) {
        output.classList.remove('no-wrap');
        output.classList.add('word-wrap');
        btn.innerHTML = '📄 Wrap';
        btn.classList.remove('active');
    } else {
        output.classList.remove('word-wrap');
        output.classList.add('no-wrap');
        btn.innerHTML = '📜 No Wrap';
        btn.classList.add('active');
    }
}

// Mobile Tab Switching
function switchTab(tab) {
    const editorSection = document.getElementById('editorSection');
    const outputSection = document.getElementById('outputSection');
    const tabButtons = document.querySelectorAll('.tab-button');
    
    if (!editorSection || !outputSection) return;
    
    currentMobileTab = tab;
    
    // Remove active class from all tabs
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'editor') {
        editorSection.classList.remove('hidden');
        outputSection.classList.add('hidden');
        if (tabButtons[0]) tabButtons[0].classList.add('active');
        
        // Trigger Monaco resize when switching to editor
        if (window.monacoEditor && window.monacoEditor.layout) {
            setTimeout(() => window.monacoEditor.layout(), 100);
        }
    } else {
        editorSection.classList.add('hidden');
        outputSection.classList.remove('hidden');
        if (tabButtons[1]) tabButtons[1].classList.add('active');
    }
}

// Auto-switch to output tab when program runs (mobile only)
function autoSwitchToOutput() {
    if (window.innerWidth <= 768 && currentMobileTab === 'editor') {
        setTimeout(() => switchTab('output'), 500);
    }
}

// Application initialization with proper sequencing for production reliability
window.addEventListener('load', function() {
    console.log('App loading...');
    
    // Restore user session
    const savedNickname = sessionStorage.getItem('nickname');
    const nicknameModal = document.getElementById('nicknameModal');
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameInput = document.getElementById('nicknameInput');
    
    if (savedNickname) {
        currentNickname = savedNickname;
        if (nicknameModal) nicknameModal.style.display = 'none';
        if (nicknameDisplay) nicknameDisplay.textContent = currentNickname;
        console.log('Loaded saved nickname:', currentNickname);
    } else {
        console.log('No saved nickname, showing modal');
        if (nicknameInput) nicknameInput.focus();
    }
    
    // Initialize Monaco Editor
    console.log('Initializing Monaco Editor...');
    if (typeof initMonacoEditor === 'function') {
        initMonacoEditor();
    }
    
    // Initialize Socket connection with delay to ensure DOM readiness
    setTimeout(() => {
        console.log('Initializing socket connection...');
        if (output) output.textContent = 'Connecting to server...\n';
        initializeSocket();
    }, 1000);
    
    // Initialize game features
    const gameAlert = document.getElementById('gameAlert');
    if (gameAlert) gameAlert.style.display = 'none';
    
    // Start game status polling with staggered timing to reduce server load
    setTimeout(() => {
        checkGameStatus();
        setInterval(checkGameStatus, 10000);
    }, 2000);
    
    // Initialize enhanced UI features
    initializeEnhancedUI();
});

// Initialize enhanced UI features
function initializeEnhancedUI() {
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + M = Maximize
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
            e.preventDefault();
            toggleMaximize();
        }
        
        // Ctrl/Cmd + H = Hide Output
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            toggleOutput();
        }
        
        // Ctrl/Cmd + W = Toggle Word Wrap
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            toggleWordWrap();
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.monacoEditor && window.monacoEditor.layout) {
            window.monacoEditor.layout();
        }
    });
}

// Enable Enter key in nickname input for better UX
document.addEventListener('DOMContentLoaded', function() {
    const nicknameInput = document.getElementById('nicknameInput');
    if (nicknameInput) {
        nicknameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                setNickname();
            }
        });
    }
});

// Global function exports for onclick handlers
window.setNickname = setNickname;
window.joinGame = joinGame;
window.runCode = runCode;
window.stopProgram = stopProgram;
window.killProgram = killProgram;
window.clearCode = clearCode;
window.sendInput = sendInput;
window.insertText = insertText;
window.reconnectSocket = reconnectSocket;

// Export enhanced UI functions
window.toggleMaximize = toggleMaximize;
window.toggleOutput = toggleOutput;
window.toggleWordWrap = toggleWordWrap;
window.switchTab = switchTab;
window.autoSwitchToOutput = autoSwitchToOutput;