// Student Panel Namespace
window.StudentPanel = {
    currentNickname: '',
    gameJoined: false,
    lastGameStatus: null,
    programRunning: false,
    connectionAttempts: 0,
    maxRetries: 3,
    
    // Enhanced UI state variables
    isMaximized: false,
    isOutputHidden: false,
    isWordWrapEnabled: true,
    currentMobileTab: 'editor',
    keyboardVisible: false,
    mobileHeaderHeight: 150,
    
    // Socket.IO connection
    socket: null
};

// Main Application Variables - Reference DOM elements
const runButton = document.getElementById('runButton');
const reconnectButton = document.getElementById('reconnectButton');
const output = document.getElementById('output');
const inputField = document.getElementById('inputField');
const connectionStatus = document.getElementById('connectionStatus');

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
    if (window.StudentPanel.socket) {
        window.StudentPanel.socket.disconnect();
    }
    
    console.log('Initializing socket connection...');
    
    window.StudentPanel.socket = io('/pty', {
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
    window.StudentPanel.socket.on('connect', () => {
        console.log('Socket.IO PTY connected - ID:', window.StudentPanel.socket.id);
        window.StudentPanel.connectionAttempts = 0;
        
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
        if (!window.StudentPanel.programRunning) {
            resetUIState();
        }
    });
    
    window.StudentPanel.socket.on('pty-output', (data) => {
        console.log('Received PTY output length:', data.length);
        if (output) {
            output.textContent += data;
            output.scrollTop = output.scrollHeight;
        }
        
        // Input detection - highlight input field but preserve stop button functionality
        // This prevents race conditions where users lose the ability to stop hung programs
        if ((data.includes('Enter') || data.includes('input') || data.includes('scanf')) && 
            (data.includes(':') || data.includes('?')) && 
            window.StudentPanel.programRunning && inputField) {
            inputField.style.borderColor = '#FFD700';
            inputField.placeholder = "Program waiting for input - type here and press Enter";
            inputField.focus();
            
            console.log('Program asking for input, keeping stop button active');
        }
        
        // Only reset UI on confirmed program termination to prevent premature state changes
        if (isProgramComplete(data)) {
            // Auto-submit IIFE for game mode (inserted block)
            (async () => {
                // Poll for latest game status before auto-submit
                const resp = await fetch('/api/game/status');
                const status = await resp.json();
                if (!status.active) return;
                if (!window.StudentPanel.gameJoined) return;
                const nickname = sessionStorage.getItem('nickname');
                const code = getCodeFromEditor();
                const submitResp = await fetch('/api/game/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname, code })
                });
                const result = await submitResp.json();
                if (result.correct) {
                    alert('Correct! Score: ' + result.score);
                } else {
                    output.textContent += '\nWrong answer. Try again.\n';
                }
            })();
            setTimeout(resetUIState, 500);
        }
    });
    
    window.StudentPanel.socket.on('disconnect', (reason) => {
        console.log('Socket.IO PTY disconnected:', reason);
        
        if (window.StudentPanel.connectionAttempts < window.StudentPanel.maxRetries && output) {
            output.textContent += `\nConnection lost (${reason}), reconnecting...\n`;
        }
        
        if (runButton) runButton.disabled = true;
        if (inputField) {
            inputField.disabled = true;
            inputField.style.borderColor = '#ff6b6b';
        }
        window.StudentPanel.connectionAttempts++;
    });
    
    window.StudentPanel.socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        window.StudentPanel.connectionAttempts++;
        
        if (window.StudentPanel.connectionAttempts >= window.StudentPanel.maxRetries && output) {
            output.textContent += `\nFailed to connect after ${window.StudentPanel.maxRetries} attempts.\n`;
            output.textContent += 'Click the Reconnect button to try again.\n';
            if (reconnectButton) reconnectButton.style.display = 'inline-block';
            if (runButton) runButton.disabled = true;
            if (inputField) inputField.disabled = true;
        } else if (output) {
            output.textContent += `\nConnection attempt ${window.StudentPanel.connectionAttempts} failed, retrying...\n`;
        }
    });
    
    window.StudentPanel.socket.on('reconnect', (attemptNumber) => {
        console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
        window.StudentPanel.connectionAttempts = 0;
        
        if (!window.StudentPanel.programRunning && output) {
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
    window.StudentPanel.programRunning = false;
    
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
    window.StudentPanel.connectionAttempts = 0;
    
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
    if (window.StudentPanel.programRunning) {
        stopProgram();
        return;
    }
    
    console.log('runCode called');
    
    const code = getCodeFromEditor().trim();
    
    if (!code) {
        if (output) output.textContent += 'No code to run\n';
        return;
    }
    
    if (!window.StudentPanel.socket || !window.StudentPanel.socket.connected) {
        if (output) output.textContent += 'Not connected to server. Attempting to reconnect...\n';
        initializeSocket();
        
        // Retry mechanism with reasonable timeout
        setTimeout(() => {
            if (window.StudentPanel.socket && window.StudentPanel.socket.connected) {
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
    window.StudentPanel.programRunning = true;
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
    window.StudentPanel.socket.emit('run', { code: code });
    
    // Failsafe timeout for programs that may hang without proper termination signals
    setTimeout(() => {
        if (window.StudentPanel.programRunning && output) {
            console.log('Failsafe timeout triggered - program may have hung');
            output.textContent += '\nProgram execution seems to be taking too long.\n';
            output.textContent += 'Click "Stop Program" to terminate it.\n';
        }
    }, 35000);
}

function stopProgram() {
    if (!window.StudentPanel.socket || !window.StudentPanel.socket.connected) {
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
    
    window.StudentPanel.socket.emit('kill');
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
        
        if (!window.StudentPanel.socket || !window.StudentPanel.socket.connected) {
            if (output) output.textContent += 'Not connected to server\n';
            return;
        }
        
        if (!window.StudentPanel.programRunning) {
            console.log('No program running to send input to');
            return;
        }
        
        // Send input with newline (required for most C programs)
        const inputData = input + '\n';
        window.StudentPanel.socket.emit('input', { data: inputData });
        
        // REMOVED: No longer echo input to output artificially
        // The terminal echo will handle showing the input naturally
        
        inputField.value = '';
        inputField.focus();
        
        // Reset styling but preserve stop button functionality
        inputField.style.borderColor = '#4CAF50';
        inputField.placeholder = "Program may ask for more input...";
        
        // Ensure stop button remains active since program continues running
        if (runButton && window.StudentPanel.programRunning) {
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
        window.StudentPanel.currentNickname = nickname;
        sessionStorage.setItem('nickname', nickname);
        
        if (nicknameModal) nicknameModal.style.display = 'none';
        if (nicknameDisplay) nicknameDisplay.textContent = window.StudentPanel.currentNickname;
        
        checkGameStatus();
        console.log('Nickname set:', window.StudentPanel.currentNickname);
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
            if (!window.StudentPanel.lastGameStatus || 
                window.StudentPanel.lastGameStatus.active !== status.active || 
                window.StudentPanel.lastGameStatus.current_question !== status.current_question) {
                
                window.StudentPanel.lastGameStatus = status;
                
                const gameAlert = document.getElementById('gameAlert');
                const questionCard = document.getElementById('questionCard');
                
                if (status.active === true && !window.StudentPanel.gameJoined && gameAlert) {
                    gameAlert.style.display = 'block';
                } else if (gameAlert) {
                    gameAlert.style.display = 'none';
                }
                
                if (status.active === false && questionCard) {
                    questionCard.classList.remove('active');
                    window.StudentPanel.gameJoined = false;
                }
                
                if (window.StudentPanel.gameJoined && status.current_question) {
                    displayQuestion(status.current_question);
                }
            }
        } else {
            if (!window.StudentPanel.lastGameStatus || window.StudentPanel.lastGameStatus.active !== false) {
                const gameAlert = document.getElementById('gameAlert');
                if (gameAlert) gameAlert.style.display = 'none';
                window.StudentPanel.lastGameStatus = { active: false };
            }
        }
        
    } catch (error) {
        if (!window.StudentPanel.lastGameStatus || window.StudentPanel.lastGameStatus.active !== false) {
            const gameAlert = document.getElementById('gameAlert');
            if (gameAlert) gameAlert.style.display = 'none';
            window.StudentPanel.lastGameStatus = { active: false };
        }
    }
}

async function joinGame() {
    try {
        const response = await fetch('/api/game/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: window.StudentPanel.currentNickname })
        });
        
        const result = await response.json();
        if (result.success) {
            window.StudentPanel.gameJoined = true;
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
            
            // Trigger mobile auto-scroll when inserting text
            autoScrollOnMobile();
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
        
        // Trigger mobile auto-scroll when inserting text
        autoScrollOnMobile();
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
        output.className = window.StudentPanel.isWordWrapEnabled ? 'output word-wrap' : 'output no-wrap';
    }
}

// NEW ENHANCED UI FUNCTIONS

// Maximize/Restore Editor
function toggleMaximize() {
    const container = document.getElementById('editorContainer');
    const btn = document.getElementById('maximizeBtn');
    
    if (!container || !btn) return;
    
    window.StudentPanel.isMaximized = !window.StudentPanel.isMaximized;
    
    if (window.StudentPanel.isMaximized) {
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

// FIXED: Hide/Show Output Panel (separate from maximize)
function toggleOutput() {
    const container = document.getElementById('editorContainer');
    const btn = document.getElementById('hideBtn');
    
    if (!container || !btn) return;
    
    window.StudentPanel.isOutputHidden = !window.StudentPanel.isOutputHidden;
    
    if (window.StudentPanel.isOutputHidden) {
        container.classList.add('hide-output');
        btn.innerHTML = '👁️ Show';
        btn.title = 'Show Output Panel';
    } else {
        container.classList.remove('hide-output');
        btn.innerHTML = '👁️ Hide';
        btn.title = 'Hide Output Panel';
    }
    
    // Trigger Monaco resize
    if (window.monacoEditor && window.monacoEditor.layout) {
        setTimeout(() => window.monacoEditor.layout(), 100);
    }
}

// FIXED: Toggle Word Wrap in Editor (moved from output)
function toggleWordWrap() {
    const btn = document.getElementById('wrapBtn');
    
    if (!btn) return;
    
    window.StudentPanel.isWordWrapEnabled = !window.StudentPanel.isWordWrapEnabled;
    
    if (window.StudentPanel.isWordWrapEnabled) {
        btn.innerHTML = '📄 Wrap';
        btn.classList.remove('active');
        btn.title = 'Word Wrap Enabled';
    } else {
        btn.innerHTML = '📜 No Wrap';
        btn.classList.add('active');
        btn.title = 'Word Wrap Disabled';
    }
    
    // Apply word wrap to Monaco editor if available
    if (window.monacoEditor && window.monacoEditor.updateOptions) {
        try {
            window.monacoEditor.updateOptions({
                wordWrap: window.StudentPanel.isWordWrapEnabled ? 'on' : 'off'
            });
        } catch (e) {
            console.log('Could not update Monaco word wrap');
        }
    }
}

// Mobile Tab Switching
function switchTab(tab) {
    const editorSection = document.getElementById('editorSection');
    const outputSection = document.getElementById('outputSection');
    const tabButtons = document.querySelectorAll('.tab-button');
    
    if (!editorSection || !outputSection) return;
    
    window.StudentPanel.currentMobileTab = tab;
    
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
    if (window.innerWidth <= 768 && window.StudentPanel.currentMobileTab === 'editor') {
        setTimeout(() => switchTab('output'), 500);
    }
}

// MOBILE KEYBOARD AND LAYOUT OPTIMIZATION

// Detect virtual keyboard on mobile
function detectMobileKeyboard() {
    if (window.innerWidth > 768) return;
    
    let initialViewportHeight = window.innerHeight;
    let isKeyboardOpen = false;
    
    function handleViewportChange() {
        const currentHeight = window.innerHeight;
        const heightDifference = initialViewportHeight - currentHeight;
        
        // If viewport height decreased by more than 150px, keyboard is likely visible
        if (heightDifference > 150 && !isKeyboardOpen) {
            isKeyboardOpen = true;
            window.StudentPanel.keyboardVisible = true;
            document.body.classList.add('keyboard-visible');
            console.log('Virtual keyboard detected, height difference:', heightDifference);
            
            // Immediate scroll to editor
            setTimeout(() => {
                scrollToEditor();
            }, 100);
            
        } else if (heightDifference <= 100 && isKeyboardOpen) {
            isKeyboardOpen = false;
            window.StudentPanel.keyboardVisible = false;
            document.body.classList.remove('keyboard-visible');
            console.log('Virtual keyboard hidden');
        }
        
        updateMobileLayout();
    }
    
    // Use multiple event listeners for better detection
    window.addEventListener('resize', handleViewportChange);
    
    // Also listen to visual viewport if available (more accurate)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange);
    }
    
    // Listen to focus/blur events on input elements
    document.addEventListener('focusin', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
            setTimeout(() => {
                const heightDiff = initialViewportHeight - window.innerHeight;
                if (heightDiff > 150) {
                    isKeyboardOpen = true;
                    window.StudentPanel.keyboardVisible = true;
                    document.body.classList.add('keyboard-visible');
                    scrollToEditor();
                }
            }, 300);
        }
    });
    
    document.addEventListener('focusout', function(e) {
        setTimeout(() => {
            const heightDiff = initialViewportHeight - window.innerHeight;
            if (heightDiff <= 100) {
                isKeyboardOpen = false;
                window.StudentPanel.keyboardVisible = false;
                document.body.classList.remove('keyboard-visible');
            }
        }, 300);
    });
}

// Scroll to bring editor into view when keyboard appears
function scrollToEditor() {
    if (window.innerWidth > 768) return;
    
    const editorContainer = document.getElementById('editorContainer');
    const mobileTabs = document.getElementById('mobileTabs');
    
    if (editorContainer && mobileTabs) {
        // Calculate the position to scroll to - align with top of mobile tabs
        const tabsRect = mobileTabs.getBoundingClientRect();
        const targetScrollPosition = window.scrollY + tabsRect.top - 10; // 10px padding from top
        
        // Smooth scroll to position
        window.scrollTo({
            top: Math.max(0, targetScrollPosition),
            behavior: 'smooth'
        });
        
        console.log('Scrolled to editor position, target:', targetScrollPosition);
    }
}

// Update mobile layout based on current state
function updateMobileLayout() {
    if (window.innerWidth > 768) return;
    
    // Calculate dynamic header height
    const header = document.getElementById('header');
    const gameAlert = document.getElementById('gameAlert');
    const questionCard = document.getElementById('questionCard');
    const mobileTabs = document.getElementById('mobileTabs');
    
    let totalHeaderHeight = 0;
    
    if (header && header.offsetHeight) totalHeaderHeight += header.offsetHeight + 8;
    if (gameAlert && gameAlert.style.display !== 'none') totalHeaderHeight += gameAlert.offsetHeight + 5;
    if (questionCard && questionCard.classList.contains('active')) totalHeaderHeight += questionCard.offsetHeight + 5;
    if (mobileTabs && mobileTabs.offsetHeight) totalHeaderHeight += mobileTabs.offsetHeight;
    
    window.StudentPanel.mobileHeaderHeight = totalHeaderHeight;
    document.documentElement.style.setProperty('--mobile-header-height', window.StudentPanel.mobileHeaderHeight + 'px');
}

// Mobile-specific undo/redo functions
function undoCode() {
    if (window.monacoEditor && window.monacoEditor.trigger) {
        try {
            window.monacoEditor.trigger('keyboard', 'undo', null);
            return;
        } catch (e) {
            console.log('Monaco undo not available');
        }
    }
    
    // Fallback for textarea
    const textarea = document.getElementById('fallbackEditor');
    if (textarea && textarea.focus) {
        textarea.focus();
        document.execCommand('undo');
    }
}

function redoCode() {
    if (window.monacoEditor && window.monacoEditor.trigger) {
        try {
            window.monacoEditor.trigger('keyboard', 'redo', null);
            return;
        } catch (e) {
            console.log('Monaco redo not available');
        }
    }
    
    // Fallback for textarea
    const textarea = document.getElementById('fallbackEditor');
    if (textarea && textarea.focus) {
        textarea.focus();
        document.execCommand('redo');
    }
}

// Simple mobile auto-scroll function
function autoScrollOnMobile() {
    // Only on mobile
    if (window.innerWidth > 768) return;
    
    const header = document.querySelector('.header');
    if (!header) return;
    
    // Calculate scroll distance to hide header
    const scrollDistance = header.offsetHeight + 30; // Include margins
    
    // Only scroll if we're not already scrolled past header
    if (window.scrollY < scrollDistance) {
        // Smooth scroll up
        window.scrollTo({
            top: scrollDistance,
            behavior: 'smooth'
        });
    }
}

// Setup mobile editor click listeners and optimizations
function setupMobileAutoScroll() {
    if (window.innerWidth > 768) return;
    
    console.log('Setting up mobile optimizations...');
    
    // Initialize keyboard detection
    detectMobileKeyboard();
    
    // Update layout when elements change
    updateMobileLayout();
    
    // Watch for game status changes that affect layout
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' || mutation.type === 'childList') {
                setTimeout(updateMobileLayout, 100);
            }
        });
    });
    
    // Observe game alert and question card changes
    const gameAlert = document.getElementById('gameAlert');
    const questionCard = document.getElementById('questionCard');
    
    if (gameAlert) observer.observe(gameAlert, { attributes: true, attributeFilter: ['style', 'class'] });
    if (questionCard) observer.observe(questionCard, { attributes: true, attributeFilter: ['class'] });
    
    // Get editor elements
    const editorSection = document.getElementById('editorSection');
    const editor = document.getElementById('editor');
    const mobileKeyboard = document.getElementById('mobileKeyboard');
    
    // Add focus listeners to editor elements
    if (editor) {
        editor.addEventListener('click', function() {
            console.log('Editor clicked');
            setTimeout(() => {
                scrollToEditor();
                updateMobileLayout();
            }, 300);
        });
        editor.addEventListener('touchstart', function() {
            console.log('Editor touched');
            setTimeout(() => {
                scrollToEditor();
                updateMobileLayout();
            }, 300);
        });
        console.log('Added mobile optimization to editor');
    }
    
    if (mobileKeyboard) {
        mobileKeyboard.addEventListener('click', function() {
            setTimeout(updateMobileLayout, 100);
        });
        console.log('Added mobile optimization to mobile keyboard');
    }
    
    // Monaco editor focus (wait for it to be ready)
    setTimeout(() => {
        if (window.monacoEditor) {
            try {
                window.monacoEditor.onDidFocusEditorText(function() {
                    console.log('Monaco editor focused');
                    setTimeout(() => {
                        scrollToEditor();
                        updateMobileLayout();
                    }, 300);
                });
                
                // Also listen to when user clicks in Monaco
                window.monacoEditor.onMouseDown(function() {
                    console.log('Monaco editor mouse down');
                    setTimeout(() => {
                        scrollToEditor();
                        updateMobileLayout();
                    }, 300);
                });
                
                console.log('Added mobile optimization to Monaco focus');
            } catch (e) {
                console.log('Monaco not ready for focus listener');
            }
        }
    }, 1000);
    
    // Fallback editor
    const fallbackEditor = document.getElementById('fallbackEditor');
    if (fallbackEditor) {
        fallbackEditor.addEventListener('focus', function() {
            console.log('Fallback editor focused');
            setTimeout(() => {
                scrollToEditor();
                updateMobileLayout();
            }, 300);
        });
        fallbackEditor.addEventListener('click', function() {
            console.log('Fallback editor clicked');
            setTimeout(() => {
                scrollToEditor();
                updateMobileLayout();
            }, 300);
        });
        fallbackEditor.addEventListener('blur', function() {
            setTimeout(updateMobileLayout, 300);
        });
        console.log('Added mobile optimization to fallback editor');
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
        window.StudentPanel.currentNickname = savedNickname;
        if (nicknameModal) nicknameModal.style.display = 'none';
        if (nicknameDisplay) nicknameDisplay.textContent = window.StudentPanel.currentNickname;
        console.log('Loaded saved nickname:', window.StudentPanel.currentNickname);
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
    
    // Initialize mobile optimizations (wait for everything to load)
    setTimeout(setupMobileAutoScroll, 1000);
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
        
        // Re-setup mobile optimizations on resize
        if (window.innerWidth <= 768) {
            setTimeout(setupMobileAutoScroll, 200);
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

// Export mobile optimization functions
window.autoScrollOnMobile = autoScrollOnMobile;
window.setupMobileAutoScroll = setupMobileAutoScroll;
window.undoCode = undoCode;
window.redoCode = redoCode;
window.detectMobileKeyboard = detectMobileKeyboard;
window.updateMobileLayout = updateMobileLayout;
window.scrollToEditor = scrollToEditor;