// Teacher Panel Namespace
window.TeacherPanel = {
    questions: [],
    gameActive: false,
    currentQuestionIndex: -1,
    isTeacher: false,
    quizTimer: null,
    timeRemaining: 0,
    modalCallback: null
};

// Initialize
window.addEventListener('load', function() {
    checkTeacherAuth();
    setupQuizModeListeners();
});

// Custom Modal System
function showModal(title, message, confirmText = 'Confirm', confirmCallback = null, type = 'danger') {
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirm = document.getElementById('modalConfirm');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirm.textContent = confirmText;
    modalConfirm.className = `modal-btn modal-btn-${type}`;
    
    window.TeacherPanel.modalCallback = confirmCallback;
    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('customModal');
    modal.classList.remove('show');
    window.TeacherPanel.modalCallback = null;
}

function confirmModal() {
    if (window.TeacherPanel.modalCallback) {
        window.TeacherPanel.modalCallback();
    }
    closeModal();
}

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Trigger show animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => container.removeChild(toast), 300);
    }, 4000);
}

// Quiz Mode Management
function setupQuizModeListeners() {
    const modeRadios = document.querySelectorAll('input[name="quizMode"]');
    const timerSettings = document.getElementById('timerSettings');
    
    modeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            const selectedMode = this.value;
            
            // Show/hide timer settings based on mode
            if (selectedMode === 'timed-total' || selectedMode === 'timed-per-question') {
                timerSettings.style.display = 'block';
                
                // Update label based on mode
                const label = timerSettings.querySelector('label');
                if (selectedMode === 'timed-total') {
                    label.textContent = 'Total time (minutes):';
                } else {
                    label.textContent = 'Per question (minutes):';
                }
            } else {
                timerSettings.style.display = 'none';
            }
        });
    });
}

function getSelectedQuizMode() {
    const selectedRadio = document.querySelector('input[name="quizMode"]:checked');
    return selectedRadio ? selectedRadio.value : 'manual';
}

function getTimerMinutes() {
    const timerInput = document.getElementById('timerMinutes');
    return parseInt(timerInput.value) || 10;
}

// Timer Management
function startQuizTimer() {
    const mode = getSelectedQuizMode();
    const timerDisplay = document.getElementById('timerDisplay');
    const timeRemainingSpan = document.getElementById('timeRemaining');
    
    if (mode === 'timed-total') {
        window.TeacherPanel.timeRemaining = getTimerMinutes() * 60; // Convert to seconds
        timerDisplay.style.display = 'block';
        
        window.TeacherPanel.quizTimer = setInterval(() => {
            window.TeacherPanel.timeRemaining--;
            
            const minutes = Math.floor(window.TeacherPanel.timeRemaining / 60);
            const seconds = window.TeacherPanel.timeRemaining % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            timeRemainingSpan.textContent = timeString;
            
            // Color coding for urgency
            if (window.TeacherPanel.timeRemaining <= 60) {
                timeRemainingSpan.className = 'danger';
            } else if (window.TeacherPanel.timeRemaining <= 300) {
                timeRemainingSpan.className = 'warning';
            } else {
                timeRemainingSpan.className = '';
            }
            
            if (window.TeacherPanel.timeRemaining <= 0) {
                clearInterval(window.TeacherPanel.quizTimer);
                showToast('Quiz time has ended!', 'warning');
                stopGame();
            }
        }, 1000);
    } else {
        timerDisplay.style.display = 'none';
    }
}

function stopQuizTimer() {
    if (window.TeacherPanel.quizTimer) {
        clearInterval(window.TeacherPanel.quizTimer);
        window.TeacherPanel.quizTimer = null;
    }
    document.getElementById('timerDisplay').style.display = 'none';
}

async function checkTeacherAuth() {
    try {
        // Check if user is authenticated as teacher
        const response = await fetch('/api/teacher/status');
        if (response.ok) {
            const result = await response.json();
            if (result.authenticated) {
                window.TeacherPanel.isTeacher = true;
                loadQuestions();
                updateGameStatus();
                setInterval(updateLeaderboard, 3000); // Update every 3 seconds
            } else {
                // Redirect to login if not authenticated
                window.location.href = '/teacher';
            }
        } else {
            // Redirect to login if check fails
            window.location.href = '/teacher';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/teacher';
    }
}

function loadQuestions() {
    // Start with empty question bank
    window.TeacherPanel.questions = [];
    displayQuestions();
    updateQuestionCounter();
}

function updateQuestionCounter() {
    const questionCount = document.getElementById('questionCount');
    if (questionCount) {
        questionCount.textContent = window.TeacherPanel.questions.length;
    }
}

function displayQuestions() {
    const container = document.getElementById('questionsList');
    container.innerHTML = '';

    if (window.TeacherPanel.questions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Questions Yet</h3>
                <p>Start by importing questions from a JSON file, loading sample questions, or adding new questions manually.</p>
            </div>
        `;
        return;
    }

    window.TeacherPanel.questions.forEach((question, index) => {
        const isCurrent = window.TeacherPanel.gameActive && index === window.TeacherPanel.currentQuestionIndex;
        const questionDiv = document.createElement('div');
        questionDiv.className = `question-item ${isCurrent ? 'current' : ''}`;
        
        questionDiv.innerHTML = `
            <div class="question-header">
                <div class="question-title">${question.title}</div>
                <div class="question-actions">
                    <button class="button button-danger" onclick="confirmDeleteQuestion(${question.id})" style="padding: 5px 10px; font-size: 12px;">Delete</button>
                </div>
            </div>
            <div class="question-description">${question.description}</div>
            <div class="question-hint">Hint: ${question.hint}</div>
            <div class="expected-output">Expected: ${question.expected_output === 'variable' ? '(Any output)' : question.expected_output}</div>
        `;
        
        container.appendChild(questionDiv);
    });
}

function addQuestion() {
    const title = document.getElementById('questionTitle').value.trim();
    const description = document.getElementById('questionDescription').value.trim();
    const hint = document.getElementById('questionHint').value.trim();
    const expectedOutput = document.getElementById('expectedOutput').value;

    if (!title || !description || !hint) {
        showToast('Please fill in all required fields (Title, Description, Hint)', 'error');
        return;
    }

    const newQuestion = {
        id: Date.now(), // Simple ID generation
        title: title,
        description: description,
        hint: hint,
        expected_output: expectedOutput || 'variable'
    };

    window.TeacherPanel.questions.push(newQuestion);
    displayQuestions();
    updateQuestionCounter();

    // Clear form
    document.getElementById('questionTitle').value = '';
    document.getElementById('questionDescription').value = '';
    document.getElementById('questionHint').value = '';
    document.getElementById('expectedOutput').value = '';

    showToast('Question added successfully!');
}

function confirmDeleteQuestion(id) {
    const question = window.TeacherPanel.questions.find(q => q.id === id);
    if (!question) return;
    
    showModal(
        'Delete Question',
        `Are you sure you want to delete "${question.title}"? This action cannot be undone.`,
        'Delete',
        () => deleteQuestion(id),
        'danger'
    );
}

function deleteQuestion(id) {
    window.TeacherPanel.questions = window.TeacherPanel.questions.filter(q => q.id !== id);
    displayQuestions();
    updateQuestionCounter();
    updateGameStatus(); // Update buttons if current question was deleted
    showToast('Question deleted successfully!');
}

function confirmClearAllQuestions() {
    if (window.TeacherPanel.questions.length === 0) {
        showToast('No questions to clear', 'info');
        return;
    }

    // Prevent clearing questions during an active game
    if (window.TeacherPanel.gameActive) {
        showToast('Cannot clear questions while a game is active. Please stop the game first.', 'error');
        return;
    }

    showModal(
        'Clear All Questions',
        `Are you sure you want to delete all ${window.TeacherPanel.questions.length} questions? This action cannot be undone.`,
        'Clear All',
        () => clearAllQuestions(),
        'danger'
    );
}

function clearAllQuestions() {
    window.TeacherPanel.questions = [];
    displayQuestions();
    updateQuestionCounter();
    updateGameStatus(); // Update the UI state
    showToast('All questions cleared successfully!');
}

// Import/Export Functions
function importQuestions(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedQuestions = JSON.parse(e.target.result);
            
            // Validate the format
            if (!Array.isArray(importedQuestions)) {
                throw new Error('JSON must be an array of questions');
            }

            // Validate each question
            const validQuestions = [];
            for (let i = 0; i < importedQuestions.length; i++) {
                const q = importedQuestions[i];
                if (!q.title || !q.description || !q.hint) {
                    console.warn(`Skipping question ${i + 1}: missing required fields`);
                    continue;
                }
                
                // Ensure unique ID
                const newQuestion = {
                    id: q.id || Date.now() + Math.random(),
                    title: q.title,
                    description: q.description,
                    hint: q.hint,
                    expected_output: q.expected_output || 'variable'
                };
                validQuestions.push(newQuestion);
            }

            if (validQuestions.length === 0) {
                showToast('No valid questions found in the file', 'error');
                return;
            }

            // Ask user whether to replace or append
            showModal(
                'Import Questions',
                `Found ${validQuestions.length} valid questions. Do you want to replace all current questions or add to existing ones?`,
                'Replace All',
                () => {
                    window.TeacherPanel.questions = validQuestions;
                    displayQuestions();
                    updateQuestionCounter();
                    updateGameStatus();
                    showToast(`Successfully imported ${validQuestions.length} questions!`);
                },
                'warning'
            );
            
        } catch (error) {
            showToast('Error importing questions: ' + error.message, 'error');
        }
    };
    
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
}

function exportQuestions() {
    if (window.TeacherPanel.questions.length === 0) {
        showToast('No questions to export', 'info');
        return;
    }

    const dataStr = JSON.stringify(window.TeacherPanel.questions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `c_programming_questions_${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(link.href);
    showToast('Questions exported successfully!');
}

function loadSampleQuestions() {
    const sampleQuestions = [
        {
            id: 1,
            title: "Hello World",
            description: "Write a program that prints 'Hello, World!' to the screen.",
            hint: "Use printf() to print text",
            expected_output: "Hello, World!\\n"
        },
        {
            id: 2,
            title: "Simple Addition",
            description: "Write a program that prints the result of 5 + 3.",
            hint: "Calculate 5 + 3 and print the result",
            expected_output: "8\\n"
        },
        {
            id: 3,
            title: "Variables Demo",
            description: "Create two integer variables (a=10, b=20) and print their sum.",
            hint: "Declare int variables and use printf to show their sum",
            expected_output: "30\\n"
        },
        {
            id: 4,
            title: "Simple Loop",
            description: "Print numbers 1 to 5, each on a new line.",
            hint: "Use a for loop from 1 to 5",
            expected_output: "1\\n2\\n3\\n4\\n5\\n"
        },
        {
            id: 5,
            title: "Print Your Name",
            description: "Write a program that prints your name.",
            hint: "Use printf() with any name",
            expected_output: "variable"
        },
        {
            id: 6,
            title: "Even Numbers",
            description: "Print all even numbers from 2 to 10.",
            hint: "Use a loop and check if number % 2 == 0",
            expected_output: "2\\n4\\n6\\n8\\n10\\n"
        },
        {
            id: 7,
            title: "Simple Calculator",
            description: "Create variables for two numbers (12 and 8) and print their sum, difference, product, and quotient on separate lines.",
            hint: "Use multiple printf statements for each operation",
            expected_output: "20\\n4\\n96\\n1\\n"
        },
        {
            id: 8,
            title: "Character Variables",
            description: "Declare a character variable with value 'A' and print it.",
            hint: "Use char data type and %c format specifier",
            expected_output: "A\\n"
        },
        {
            id: 9,
            title: "Float Addition",
            description: "Add two floating point numbers (3.5 + 2.7) and print the result with 1 decimal place.",
            hint: "Use float variables and %.1f format specifier",
            expected_output: "6.2\\n"
        },
        {
            id: 10,
            title: "Simple If Statement",
            description: "Create an integer variable with value 15. If it's greater than 10, print 'Big number'.",
            hint: "Use if statement to check condition",
            expected_output: "Big number\\n"
        }
    ];

    if (window.TeacherPanel.questions.length > 0) {
        showModal(
            'Load Sample Questions',
            `This will load ${sampleQuestions.length} sample questions. Do you want to replace all current questions or add to existing ones?`,
            'Replace All',
            () => {
                window.TeacherPanel.questions = [...sampleQuestions];
                displayQuestions();
                updateQuestionCounter();
                updateGameStatus();
                showToast(`Successfully loaded ${sampleQuestions.length} sample questions!`);
            },
            'warning'
        );
    } else {
        window.TeacherPanel.questions = [...sampleQuestions];
        displayQuestions();
        updateQuestionCounter();
        updateGameStatus();
        showToast(`Successfully loaded ${sampleQuestions.length} sample questions!`);
    }
}

async function startGame() {
    if (window.TeacherPanel.questions.length === 0) {
        showToast('Please add at least one question before starting a game', 'error');
        return;
    }

    const selectedMode = getSelectedQuizMode();
    const timerMinutes = getTimerMinutes();

    try {
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questions: window.TeacherPanel.questions,
                mode: selectedMode,
                timer: timerMinutes
            })
        });

        const result = await response.json();
        if (result.success) {
            window.TeacherPanel.gameActive = true;
            window.TeacherPanel.currentQuestionIndex = 0;
            updateGameStatus();
            displayQuestions();
            startQuizTimer();
            showToast('Game started! Students can now join.');
        }
    } catch (error) {
        showToast('Failed to start game: ' + error.message, 'error');
    }
}

async function nextQuestion() {
    if (window.TeacherPanel.currentQuestionIndex >= window.TeacherPanel.questions.length - 1) {
        showToast('This is the last question!', 'info');
        return;
    }

    try {
        const response = await fetch('/api/game/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            window.TeacherPanel.currentQuestionIndex++;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${window.TeacherPanel.currentQuestionIndex + 1}`);
        }
    } catch (error) {
        showToast('Failed to go to next question: ' + error.message, 'error');
    }
}

async function previousQuestion() {
    if (window.TeacherPanel.currentQuestionIndex <= 0) {
        showToast('This is the first question!', 'info');
        return;
    }

    try {
        // Call API to go to previous question (you may need to implement this endpoint)
        const response = await fetch('/api/game/previous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            window.TeacherPanel.currentQuestionIndex--;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${window.TeacherPanel.currentQuestionIndex + 1}`);
        } else {
            // Fallback if API doesn't exist yet
            window.TeacherPanel.currentQuestionIndex--;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${window.TeacherPanel.currentQuestionIndex + 1} (client-side)`);
        }
    } catch (error) {
        // Fallback if API doesn't exist yet
        window.TeacherPanel.currentQuestionIndex--;
        updateGameStatus();
        displayQuestions();
        console.log(`Moved to question ${window.TeacherPanel.currentQuestionIndex + 1} (fallback)`);
    }
}

async function stopGame() {
    try {
        const response = await fetch('/api/game/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            window.TeacherPanel.gameActive = false;
            window.TeacherPanel.currentQuestionIndex = -1;
            stopQuizTimer();
            updateGameStatus();
            displayQuestions();
            showToast('Game stopped successfully!');
        }
    } catch (error) {
        showToast('Failed to stop game: ' + error.message, 'error');
    }
}

function updateGameStatus() {
    const statusDiv = document.getElementById('gameStatus');
    const startBtn = document.getElementById('startGameBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const prevBtn = document.getElementById('prevQuestionBtn');
    const stopBtn = document.getElementById('stopGameBtn');

    if (window.TeacherPanel.gameActive && window.TeacherPanel.questions.length > 0) {
        statusDiv.className = 'game-status status-active';
        statusDiv.textContent = `Active - Question ${window.TeacherPanel.currentQuestionIndex + 1} of ${window.TeacherPanel.questions.length}: "${window.TeacherPanel.questions[window.TeacherPanel.currentQuestionIndex]?.title || 'Unknown'}"`;
        
        // Button states during active game
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Navigation button states
        prevBtn.disabled = window.TeacherPanel.currentQuestionIndex <= 0;
        nextBtn.disabled = window.TeacherPanel.currentQuestionIndex >= window.TeacherPanel.questions.length - 1;
        
    } else {
        statusDiv.className = 'game-status status-inactive';
        statusDiv.textContent = 'No active game';
        
        // Button states when no game
        startBtn.disabled = window.TeacherPanel.questions.length === 0;
        nextBtn.disabled = true;
        prevBtn.disabled = true;
        stopBtn.disabled = true;
    }
}

async function updateLeaderboard() {
    if (!window.TeacherPanel.gameActive) return;

    try {
        const response = await fetch('/api/leaderboard');
        const leaderboard = await response.json();
        displayLeaderboard(leaderboard);
    } catch (error) {
        console.error('Failed to update leaderboard:', error);
    }
}

function displayLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">No participants yet</td></tr>';
        return;
    }

    leaderboard.forEach((student, index) => {
        const row = document.createElement('tr');
        
        // Determine student status
        let statusClass = 'waiting';
        let statusText = 'Waiting';
        
        if (student.current_question !== undefined) {
            if (student.current_question === window.TeacherPanel.currentQuestionIndex) {
                statusClass = 'coding';
                statusText = 'Coding';
            } else if (student.current_question > window.TeacherPanel.currentQuestionIndex) {
                statusClass = 'completed';
                statusText = 'Completed';
            }
        }
        
        row.innerHTML = `
            <td class="rank">#${index + 1}</td>
            <td>${student.nickname}</td>
            <td>${student.score}</td>
            <td><span class="student-status ${statusClass}">${statusText}</span></td>
        `;
        tbody.appendChild(row);
    });
}

async function logout() {
    try {
        const response = await fetch('/api/teacher/logout', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            // Clear local state
            window.TeacherPanel.isTeacher = false;
            window.TeacherPanel.questions = [];
            window.TeacherPanel.gameActive = false;
            window.TeacherPanel.currentQuestionIndex = -1;
            stopQuizTimer();
            
            // Force redirect to login page
            window.location.replace('/teacher');
        } else {
            // Force redirect even if API call failed
            window.location.replace('/teacher');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect even if network error
        window.location.replace('/teacher');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('customModal');
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// Initialize
window.addEventListener('load', function() {
    checkTeacherAuth();
    setupQuizModeListeners();
});

// Custom Modal System
function showModal(title, message, confirmText = 'Confirm', confirmCallback = null, type = 'danger') {
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirm = document.getElementById('modalConfirm');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirm.textContent = confirmText;
    modalConfirm.className = `modal-btn modal-btn-${type}`;
    
    modalCallback = confirmCallback;
    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('customModal');
    modal.classList.remove('show');
    modalCallback = null;
}

function confirmModal() {
    if (modalCallback) {
        modalCallback();
    }
    closeModal();
}

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Trigger show animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => container.removeChild(toast), 300);
    }, 4000);
}

// Quiz Mode Management
function setupQuizModeListeners() {
    const modeRadios = document.querySelectorAll('input[name="quizMode"]');
    const timerSettings = document.getElementById('timerSettings');
    
    modeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            const selectedMode = this.value;
            
            // Show/hide timer settings based on mode
            if (selectedMode === 'timed-total' || selectedMode === 'timed-per-question') {
                timerSettings.style.display = 'block';
                
                // Update label based on mode
                const label = timerSettings.querySelector('label');
                if (selectedMode === 'timed-total') {
                    label.textContent = 'Total time (minutes):';
                } else {
                    label.textContent = 'Per question (minutes):';
                }
            } else {
                timerSettings.style.display = 'none';
            }
        });
    });
}

function getSelectedQuizMode() {
    const selectedRadio = document.querySelector('input[name="quizMode"]:checked');
    return selectedRadio ? selectedRadio.value : 'manual';
}

function getTimerMinutes() {
    const timerInput = document.getElementById('timerMinutes');
    return parseInt(timerInput.value) || 10;
}

// Timer Management
function startQuizTimer() {
    const mode = getSelectedQuizMode();
    const timerDisplay = document.getElementById('timerDisplay');
    const timeRemainingSpan = document.getElementById('timeRemaining');
    
    if (mode === 'timed-total') {
        timeRemaining = getTimerMinutes() * 60; // Convert to seconds
        timerDisplay.style.display = 'block';
        
        quizTimer = setInterval(() => {
            timeRemaining--;
            
            const minutes = Math.floor(timeRemaining / 60);
            const seconds = timeRemaining % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            timeRemainingSpan.textContent = timeString;
            
            // Color coding for urgency
            if (timeRemaining <= 60) {
                timeRemainingSpan.className = 'danger';
            } else if (timeRemaining <= 300) {
                timeRemainingSpan.className = 'warning';
            } else {
                timeRemainingSpan.className = '';
            }
            
            if (timeRemaining <= 0) {
                clearInterval(quizTimer);
                showToast('Quiz time has ended!', 'warning');
                stopGame();
            }
        }, 1000);
    } else {
        timerDisplay.style.display = 'none';
    }
}

function stopQuizTimer() {
    if (quizTimer) {
        clearInterval(quizTimer);
        quizTimer = null;
    }
    document.getElementById('timerDisplay').style.display = 'none';
}

async function checkTeacherAuth() {
    try {
        // Check if user is authenticated as teacher
        const response = await fetch('/api/teacher/status');
        if (response.ok) {
            const result = await response.json();
            if (result.authenticated) {
                isTeacher = true;
                loadQuestions();
                updateGameStatus();
                setInterval(updateLeaderboard, 3000); // Update every 3 seconds
            } else {
                // Redirect to login if not authenticated
                window.location.href = '/teacher';
            }
        } else {
            // Redirect to login if check fails
            window.location.href = '/teacher';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/teacher';
    }
}

function loadQuestions() {
    // Start with empty question bank
    questions = [];
    displayQuestions();
    updateQuestionCounter();
}

function updateQuestionCounter() {
    const questionCount = document.getElementById('questionCount');
    if (questionCount) {
        questionCount.textContent = questions.length;
    }
}

function displayQuestions() {
    const container = document.getElementById('questionsList');
    container.innerHTML = '';

    if (questions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Questions Yet</h3>
                <p>Start by importing questions from a JSON file, loading sample questions, or adding new questions manually.</p>
            </div>
        `;
        return;
    }

    questions.forEach((question, index) => {
        const isCurrent = gameActive && index === currentQuestionIndex;
        const questionDiv = document.createElement('div');
        questionDiv.className = `question-item ${isCurrent ? 'current' : ''}`;
        
        questionDiv.innerHTML = `
            <div class="question-header">
                <div class="question-title">${question.title}</div>
                <div class="question-actions">
                    <button class="button button-danger" onclick="confirmDeleteQuestion(${question.id})" style="padding: 5px 10px; font-size: 12px;">Delete</button>
                </div>
            </div>
            <div class="question-description">${question.description}</div>
            <div class="question-hint">Hint: ${question.hint}</div>
            <div class="expected-output">Expected: ${question.expected_output === 'variable' ? '(Any output)' : question.expected_output}</div>
        `;
        
        container.appendChild(questionDiv);
    });
}

function addQuestion() {
    const title = document.getElementById('questionTitle').value.trim();
    const description = document.getElementById('questionDescription').value.trim();
    const hint = document.getElementById('questionHint').value.trim();
    const expectedOutput = document.getElementById('expectedOutput').value;

    if (!title || !description || !hint) {
        showToast('Please fill in all required fields (Title, Description, Hint)', 'error');
        return;
    }

    const newQuestion = {
        id: Date.now(), // Simple ID generation
        title: title,
        description: description,
        hint: hint,
        expected_output: expectedOutput || 'variable'
    };

    questions.push(newQuestion);
    displayQuestions();
    updateQuestionCounter();

    // Clear form
    document.getElementById('questionTitle').value = '';
    document.getElementById('questionDescription').value = '';
    document.getElementById('questionHint').value = '';
    document.getElementById('expectedOutput').value = '';

    showToast('Question added successfully!');
}

function confirmDeleteQuestion(id) {
    const question = questions.find(q => q.id === id);
    if (!question) return;
    
    showModal(
        'Delete Question',
        `Are you sure you want to delete "${question.title}"? This action cannot be undone.`,
        'Delete',
        () => deleteQuestion(id),
        'danger'
    );
}

function deleteQuestion(id) {
    questions = questions.filter(q => q.id !== id);
    displayQuestions();
    updateQuestionCounter();
    updateGameStatus(); // Update buttons if current question was deleted
    showToast('Question deleted successfully!');
}

function confirmClearAllQuestions() {
    if (questions.length === 0) {
        showToast('No questions to clear', 'info');
        return;
    }

    // Prevent clearing questions during an active game
    if (gameActive) {
        showToast('Cannot clear questions while a game is active. Please stop the game first.', 'error');
        return;
    }

    showModal(
        'Clear All Questions',
        `Are you sure you want to delete all ${questions.length} questions? This action cannot be undone.`,
        'Clear All',
        () => clearAllQuestions(),
        'danger'
    );
}

function clearAllQuestions() {
    questions = [];
    displayQuestions();
    updateQuestionCounter();
    updateGameStatus(); // Update the UI state
    showToast('All questions cleared successfully!');
}

// Import/Export Functions
function importQuestions(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedQuestions = JSON.parse(e.target.result);
            
            // Validate the format
            if (!Array.isArray(importedQuestions)) {
                throw new Error('JSON must be an array of questions');
            }

            // Validate each question
            const validQuestions = [];
            for (let i = 0; i < importedQuestions.length; i++) {
                const q = importedQuestions[i];
                if (!q.title || !q.description || !q.hint) {
                    console.warn(`Skipping question ${i + 1}: missing required fields`);
                    continue;
                }
                
                // Ensure unique ID
                const newQuestion = {
                    id: q.id || Date.now() + Math.random(),
                    title: q.title,
                    description: q.description,
                    hint: q.hint,
                    expected_output: q.expected_output || 'variable'
                };
                validQuestions.push(newQuestion);
            }

            if (validQuestions.length === 0) {
                showToast('No valid questions found in the file', 'error');
                return;
            }

            // Ask user whether to replace or append
            showModal(
                'Import Questions',
                `Found ${validQuestions.length} valid questions. Do you want to replace all current questions or add to existing ones?`,
                'Replace All',
                () => {
                    questions = validQuestions;
                    displayQuestions();
                    updateQuestionCounter();
                    updateGameStatus();
                    showToast(`Successfully imported ${validQuestions.length} questions!`);
                },
                'warning'
            );
            
        } catch (error) {
            showToast('Error importing questions: ' + error.message, 'error');
        }
    };
    
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
}

function exportQuestions() {
    if (questions.length === 0) {
        showToast('No questions to export', 'info');
        return;
    }

    const dataStr = JSON.stringify(questions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `c_programming_questions_${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(link.href);
    showToast('Questions exported successfully!');
}

function loadSampleQuestions() {
    const sampleQuestions = [
        {
            id: 1,
            title: "Hello World",
            description: "Write a program that prints 'Hello, World!' to the screen.",
            hint: "Use printf() to print text",
            expected_output: "Hello, World!\\n"
        },
        {
            id: 2,
            title: "Simple Addition",
            description: "Write a program that prints the result of 5 + 3.",
            hint: "Calculate 5 + 3 and print the result",
            expected_output: "8\\n"
        },
        {
            id: 3,
            title: "Variables Demo",
            description: "Create two integer variables (a=10, b=20) and print their sum.",
            hint: "Declare int variables and use printf to show their sum",
            expected_output: "30\\n"
        },
        {
            id: 4,
            title: "Simple Loop",
            description: "Print numbers 1 to 5, each on a new line.",
            hint: "Use a for loop from 1 to 5",
            expected_output: "1\\n2\\n3\\n4\\n5\\n"
        },
        {
            id: 5,
            title: "Print Your Name",
            description: "Write a program that prints your name.",
            hint: "Use printf() with any name",
            expected_output: "variable"
        },
        {
            id: 6,
            title: "Even Numbers",
            description: "Print all even numbers from 2 to 10.",
            hint: "Use a loop and check if number % 2 == 0",
            expected_output: "2\\n4\\n6\\n8\\n10\\n"
        },
        {
            id: 7,
            title: "Simple Calculator",
            description: "Create variables for two numbers (12 and 8) and print their sum, difference, product, and quotient on separate lines.",
            hint: "Use multiple printf statements for each operation",
            expected_output: "20\\n4\\n96\\n1\\n"
        },
        {
            id: 8,
            title: "Character Variables",
            description: "Declare a character variable with value 'A' and print it.",
            hint: "Use char data type and %c format specifier",
            expected_output: "A\\n"
        },
        {
            id: 9,
            title: "Float Addition",
            description: "Add two floating point numbers (3.5 + 2.7) and print the result with 1 decimal place.",
            hint: "Use float variables and %.1f format specifier",
            expected_output: "6.2\\n"
        },
        {
            id: 10,
            title: "Simple If Statement",
            description: "Create an integer variable with value 15. If it's greater than 10, print 'Big number'.",
            hint: "Use if statement to check condition",
            expected_output: "Big number\\n"
        }
    ];

    if (questions.length > 0) {
        showModal(
            'Load Sample Questions',
            `This will load ${sampleQuestions.length} sample questions. Do you want to replace all current questions or add to existing ones?`,
            'Replace All',
            () => {
                questions = [...sampleQuestions];
                displayQuestions();
                updateQuestionCounter();
                updateGameStatus();
                showToast(`Successfully loaded ${sampleQuestions.length} sample questions!`);
            },
            'warning'
        );
    } else {
        questions = [...sampleQuestions];
        displayQuestions();
        updateQuestionCounter();
        updateGameStatus();
        showToast(`Successfully loaded ${sampleQuestions.length} sample questions!`);
    }
}

async function startGame() {
    if (questions.length === 0) {
        showToast('Please add at least one question before starting a game', 'error');
        return;
    }

    const selectedMode = getSelectedQuizMode();
    const timerMinutes = getTimerMinutes();

    try {
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questions: questions,
                mode: selectedMode,
                timer: timerMinutes
            })
        });

        const result = await response.json();
        if (result.success) {
            gameActive = true;
            currentQuestionIndex = 0;
            updateGameStatus();
            displayQuestions();
            startQuizTimer();
            showToast('Game started! Students can now join.');
        }
    } catch (error) {
        showToast('Failed to start game: ' + error.message, 'error');
    }
}

async function nextQuestion() {
    if (currentQuestionIndex >= questions.length - 1) {
        showToast('This is the last question!', 'info');
        return;
    }

    try {
        const response = await fetch('/api/game/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            currentQuestionIndex++;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${currentQuestionIndex + 1}`);
        }
    } catch (error) {
        showToast('Failed to go to next question: ' + error.message, 'error');
    }
}

async function previousQuestion() {
    if (currentQuestionIndex <= 0) {
        showToast('This is the first question!', 'info');
        return;
    }

    try {
        // Call API to go to previous question (you may need to implement this endpoint)
        const response = await fetch('/api/game/previous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            currentQuestionIndex--;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${currentQuestionIndex + 1}`);
        } else {
            // Fallback if API doesn't exist yet
            currentQuestionIndex--;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${currentQuestionIndex + 1} (client-side)`);
        }
    } catch (error) {
        // Fallback if API doesn't exist yet
        currentQuestionIndex--;
        updateGameStatus();
        displayQuestions();
        console.log(`Moved to question ${currentQuestionIndex + 1} (fallback)`);
    }
}

async function stopGame() {
    try {
        const response = await fetch('/api/game/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            gameActive = false;
            currentQuestionIndex = -1;
            stopQuizTimer();
            updateGameStatus();
            displayQuestions();
            showToast('Game stopped successfully!');
        }
    } catch (error) {
        showToast('Failed to stop game: ' + error.message, 'error');
    }
}

function updateGameStatus() {
    const statusDiv = document.getElementById('gameStatus');
    const startBtn = document.getElementById('startGameBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const prevBtn = document.getElementById('prevQuestionBtn');
    const stopBtn = document.getElementById('stopGameBtn');

    if (gameActive && questions.length > 0) {
        statusDiv.className = 'game-status status-active';
        statusDiv.textContent = `Active - Question ${currentQuestionIndex + 1} of ${questions.length}: "${questions[currentQuestionIndex]?.title || 'Unknown'}"`;
        
        // Button states during active game
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Navigation button states
        prevBtn.disabled = currentQuestionIndex <= 0;
        nextBtn.disabled = currentQuestionIndex >= questions.length - 1;
        
    } else {
        statusDiv.className = 'game-status status-inactive';
        statusDiv.textContent = 'No active game';
        
        // Button states when no game
        startBtn.disabled = questions.length === 0;
        nextBtn.disabled = true;
        prevBtn.disabled = true;
        stopBtn.disabled = true;
    }
}

async function updateLeaderboard() {
    if (!gameActive) return;

    try {
        const response = await fetch('/api/leaderboard');
        const leaderboard = await response.json();
        displayLeaderboard(leaderboard);
    } catch (error) {
        console.error('Failed to update leaderboard:', error);
    }
}

function displayLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">No participants yet</td></tr>';
        return;
    }

    leaderboard.forEach((student, index) => {
        const row = document.createElement('tr');
        
        // Determine student status
        let statusClass = 'waiting';
        let statusText = 'Waiting';
        
        if (student.current_question !== undefined) {
            if (student.current_question === currentQuestionIndex) {
                statusClass = 'coding';
                statusText = 'Coding';
            } else if (student.current_question > currentQuestionIndex) {
                statusClass = 'completed';
                statusText = 'Completed';
            }
        }
        
        row.innerHTML = `
            <td class="rank">#${index + 1}</td>
            <td>${student.nickname}</td>
            <td>${student.score}</td>
            <td><span class="student-status ${statusClass}">${statusText}</span></td>
        `;
        tbody.appendChild(row);
    });
}

async function logout() {
    try {
        const response = await fetch('/api/teacher/logout', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            // Clear local state
            isTeacher = false;
            questions = [];
            gameActive = false;
            currentQuestionIndex = -1;
            stopQuizTimer();
            
            // Force redirect to login page
            window.location.replace('/teacher');
        } else {
            // Force redirect even if API call failed
            window.location.replace('/teacher');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect even if network error
        window.location.replace('/teacher');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('customModal');
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});let questions = [];
let gameActive = false;
let currentQuestionIndex = -1;
let isTeacher = false;

// Initialize
window.addEventListener('load', function() {
    checkTeacherAuth();
});

async function checkTeacherAuth() {
    try {
        // Check if user is authenticated as teacher
        const response = await fetch('/api/teacher/status');
        if (response.ok) {
            const result = await response.json();
            if (result.authenticated) {
                isTeacher = true;
                loadQuestions();
                updateGameStatus();
                setInterval(updateLeaderboard, 3000); // Update every 3 seconds
            } else {
                // Redirect to login if not authenticated
                window.location.href = '/teacher';
            }
        } else {
            // Redirect to login if check fails
            window.location.href = '/teacher';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/teacher';
    }
}

function loadQuestions() {
    // Start with empty question bank
    questions = [];
    displayQuestions();
    updateQuestionCounter();
}

function updateQuestionCounter() {
    const questionCount = document.getElementById('questionCount');
    if (questionCount) {
        questionCount.textContent = questions.length;
    }
}

function displayQuestions() {
    const container = document.getElementById('questionsList');
    container.innerHTML = '';

    if (questions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Questions Yet</h3>
                <p>Start by importing questions from a JSON file, loading sample questions, or adding new questions manually.</p>
            </div>
        `;
        return;
    }

    questions.forEach((question, index) => {
        const isCurrent = gameActive && index === currentQuestionIndex;
        const questionDiv = document.createElement('div');
        questionDiv.className = `question-item ${isCurrent ? 'current' : ''}`;
        
        questionDiv.innerHTML = `
            <div class="question-header">
                <div class="question-title">${question.title}</div>
                <div class="question-actions">
                    <button class="button button-danger" onclick="deleteQuestion(${question.id})" style="padding: 5px 10px; font-size: 12px;">Delete</button>
                </div>
            </div>
            <div class="question-description">${question.description}</div>
            <div class="question-hint">Hint: ${question.hint}</div>
            <div class="expected-output">Expected: ${question.expected_output === 'variable' ? '(Any output)' : question.expected_output}</div>
        `;
        
        container.appendChild(questionDiv);
    });
}

function addQuestion() {
    const title = document.getElementById('questionTitle').value.trim();
    const description = document.getElementById('questionDescription').value.trim();
    const hint = document.getElementById('questionHint').value.trim();
    const expectedOutput = document.getElementById('expectedOutput').value;

    if (!title || !description || !hint) {
        alert('Please fill in all required fields (Title, Description, Hint)');
        return;
    }

    const newQuestion = {
        id: Date.now(), // Simple ID generation
        title: title,
        description: description,
        hint: hint,
        expected_output: expectedOutput || 'variable'
    };

    questions.push(newQuestion);
    displayQuestions();
    updateQuestionCounter();

    // Clear form
    document.getElementById('questionTitle').value = '';
    document.getElementById('questionDescription').value = '';
    document.getElementById('questionHint').value = '';
    document.getElementById('expectedOutput').value = '';

    alert('Question added successfully!');
}

function deleteQuestion(id) {
    if (confirm('Are you sure you want to delete this question?')) {
        questions = questions.filter(q => q.id !== id);
        displayQuestions();
        updateQuestionCounter();
        updateGameStatus(); // Update buttons if current question was deleted
    }
}

function clearAllQuestions() {
    if (questions.length === 0) {
        alert('No questions to clear');
        return;
    }

    // Prevent clearing questions during an active game
    if (gameActive) {
        alert('Cannot clear questions while a game is active. Please stop the game first.');
        return;
    }

    if (confirm(`Are you sure you want to delete all ${questions.length} questions? This cannot be undone.`)) {
        questions = [];
        displayQuestions();
        updateQuestionCounter();
        updateGameStatus(); // Update the UI state
        alert('All questions cleared successfully!');
    }
}

// Import/Export Functions
function importQuestions(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedQuestions = JSON.parse(e.target.result);
            
            // Validate the format
            if (!Array.isArray(importedQuestions)) {
                throw new Error('JSON must be an array of questions');
            }

            // Validate each question
            const validQuestions = [];
            for (let i = 0; i < importedQuestions.length; i++) {
                const q = importedQuestions[i];
                if (!q.title || !q.description || !q.hint) {
                    console.warn(`Skipping question ${i + 1}: missing required fields`);
                    continue;
                }
                
                // Ensure unique ID
                const newQuestion = {
                    id: q.id || Date.now() + Math.random(),
                    title: q.title,
                    description: q.description,
                    hint: q.hint,
                    expected_output: q.expected_output || 'variable'
                };
                validQuestions.push(newQuestion);
            }

            if (validQuestions.length === 0) {
                alert('No valid questions found in the file');
                return;
            }

            // Ask user whether to replace or append
            const replace = confirm(
                `Found ${validQuestions.length} valid questions.\\n\\n` +
                `Click OK to REPLACE all current questions\\n` +
                `Click Cancel to ADD to current questions`
            );

            if (replace) {
                questions = validQuestions;
            } else {
                // Append and ensure unique IDs
                validQuestions.forEach(newQ => {
                    while (questions.some(existingQ => existingQ.id === newQ.id)) {
                        newQ.id = Date.now() + Math.random();
                    }
                    questions.push(newQ);
                });
            }

            displayQuestions();
            updateQuestionCounter();
            updateGameStatus();
            alert(`Successfully imported ${validQuestions.length} questions!`);
            
        } catch (error) {
            alert('Error importing questions: ' + error.message);
        }
    };
    
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
}

function exportQuestions() {
    if (questions.length === 0) {
        alert('No questions to export');
        return;
    }

    const dataStr = JSON.stringify(questions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `c_programming_questions_${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(link.href);
    alert('Questions exported successfully!');
}

function loadSampleQuestions() {
    const sampleQuestions = [
        {
            id: 1,
            title: "Hello World",
            description: "Write a program that prints 'Hello, World!' to the screen.",
            hint: "Use printf() to print text",
            expected_output: "Hello, World!\\n"
        },
        {
            id: 2,
            title: "Simple Addition",
            description: "Write a program that prints the result of 5 + 3.",
            hint: "Calculate 5 + 3 and print the result",
            expected_output: "8\\n"
        },
        {
            id: 3,
            title: "Variables Demo",
            description: "Create two integer variables (a=10, b=20) and print their sum.",
            hint: "Declare int variables and use printf to show their sum",
            expected_output: "30\\n"
        },
        {
            id: 4,
            title: "Simple Loop",
            description: "Print numbers 1 to 5, each on a new line.",
            hint: "Use a for loop from 1 to 5",
            expected_output: "1\\n2\\n3\\n4\\n5\\n"
        },
        {
            id: 5,
            title: "Print Your Name",
            description: "Write a program that prints your name.",
            hint: "Use printf() with any name",
            expected_output: "variable"
        },
        {
            id: 6,
            title: "Even Numbers",
            description: "Print all even numbers from 2 to 10.",
            hint: "Use a loop and check if number % 2 == 0",
            expected_output: "2\\n4\\n6\\n8\\n10\\n"
        },
        {
            id: 7,
            title: "Simple Calculator",
            description: "Create variables for two numbers (12 and 8) and print their sum, difference, product, and quotient on separate lines.",
            hint: "Use multiple printf statements for each operation",
            expected_output: "20\\n4\\n96\\n1\\n"
        },
        {
            id: 8,
            title: "Character Variables",
            description: "Declare a character variable with value 'A' and print it.",
            hint: "Use char data type and %c format specifier",
            expected_output: "A\\n"
        },
        {
            id: 9,
            title: "Float Addition",
            description: "Add two floating point numbers (3.5 + 2.7) and print the result with 1 decimal place.",
            hint: "Use float variables and %.1f format specifier",
            expected_output: "6.2\\n"
        },
        {
            id: 10,
            title: "Simple If Statement",
            description: "Create an integer variable with value 15. If it's greater than 10, print 'Big number'.",
            hint: "Use if statement to check condition",
            expected_output: "Big number\\n"
        }
    ];

    if (questions.length > 0) {
        const replace = confirm(
            `This will load ${sampleQuestions.length} sample questions.\\n\\n` +
            `Click OK to REPLACE all current questions\\n` +
            `Click Cancel to ADD to current questions`
        );

        if (replace) {
            questions = [...sampleQuestions];
        } else {
            // Add sample questions with unique IDs
            sampleQuestions.forEach(sampleQ => {
                const newQ = { ...sampleQ };
                while (questions.some(existingQ => existingQ.id === newQ.id)) {
                    newQ.id = Date.now() + Math.random();
                }
                questions.push(newQ);
            });
        }
    } else {
        questions = [...sampleQuestions];
    }

    displayQuestions();
    updateQuestionCounter();
    updateGameStatus();
    alert(`Successfully loaded ${sampleQuestions.length} sample questions!`);
}

async function startGame() {
    if (questions.length === 0) {
        alert('Please add at least one question before starting a game');
        return;
    }

    try {
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questions: questions,
                timer: 0 // No timer for manual progression
            })
        });

        const result = await response.json();
        if (result.success) {
            gameActive = true;
            currentQuestionIndex = 0;
            updateGameStatus();
            displayQuestions();
            alert('Game started! Students can now join.');
        }
    } catch (error) {
        alert('Failed to start game: ' + error.message);
    }
}

async function nextQuestion() {
    if (currentQuestionIndex >= questions.length - 1) {
        alert('This is the last question!');
        return;
    }

    try {
        const response = await fetch('/api/game/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            currentQuestionIndex++;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${currentQuestionIndex + 1}`);
        }
    } catch (error) {
        alert('Failed to go to next question: ' + error.message);
    }
}

async function previousQuestion() {
    if (currentQuestionIndex <= 0) {
        alert('This is the first question!');
        return;
    }

    try {
        // Call API to go to previous question (you may need to implement this endpoint)
        const response = await fetch('/api/game/previous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            currentQuestionIndex--;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${currentQuestionIndex + 1}`);
        } else {
            // Fallback if API doesn't exist yet
            currentQuestionIndex--;
            updateGameStatus();
            displayQuestions();
            console.log(`Moved to question ${currentQuestionIndex + 1} (client-side)`);
        }
    } catch (error) {
        // Fallback if API doesn't exist yet
        currentQuestionIndex--;
        updateGameStatus();
        displayQuestions();
        console.log(`Moved to question ${currentQuestionIndex + 1} (fallback)`);
    }
}

async function stopGame() {
    if (confirm('Are you sure you want to stop the current game?')) {
        try {
            const response = await fetch('/api/game/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            if (result.success) {
                gameActive = false;
                currentQuestionIndex = -1;
                updateGameStatus();
                displayQuestions();
                alert('Game stopped.');
            }
        } catch (error) {
            alert('Failed to stop game: ' + error.message);
        }
    }
}

function updateGameStatus() {
    const statusDiv = document.getElementById('gameStatus');
    const startBtn = document.getElementById('startGameBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const prevBtn = document.getElementById('prevQuestionBtn');
    const stopBtn = document.getElementById('stopGameBtn');

    if (gameActive && questions.length > 0) {
        statusDiv.className = 'game-status status-active';
        statusDiv.textContent = `Active - Question ${currentQuestionIndex + 1} of ${questions.length}: "${questions[currentQuestionIndex]?.title || 'Unknown'}"`;
        
        // Button states during active game
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Navigation button states
        prevBtn.disabled = currentQuestionIndex <= 0;
        nextBtn.disabled = currentQuestionIndex >= questions.length - 1;
        
    } else {
        statusDiv.className = 'game-status status-inactive';
        statusDiv.textContent = 'No active game';
        
        // Button states when no game
        startBtn.disabled = questions.length === 0;
        nextBtn.disabled = true;
        prevBtn.disabled = true;
        stopBtn.disabled = true;
    }
}

async function updateLeaderboard() {
    if (!gameActive) return;

    try {
        const response = await fetch('/api/leaderboard');
        const leaderboard = await response.json();
        displayLeaderboard(leaderboard);
    } catch (error) {
        console.error('Failed to update leaderboard:', error);
    }
}

function displayLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #666;">No participants yet</td></tr>';
        return;
    }

    leaderboard.forEach((student, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="rank">#${index + 1}</td>
            <td>${student.nickname}</td>
            <td>${student.score}</td>
        `;
        tbody.appendChild(row);
    });
}

async function logout() {
    try {
        const response = await fetch('/api/teacher/logout', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            // Clear local state
            isTeacher = false;
            questions = [];
            gameActive = false;
            currentQuestionIndex = -1;
            
            // Force redirect to login page
            window.location.replace('/teacher');
        } else {
            // Force redirect even if API call failed
            window.location.replace('/teacher');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect even if network error
        window.location.replace('/teacher');
    }
}