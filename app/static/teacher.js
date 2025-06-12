let questions = [];
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
}

function displayQuestions() {
    const container = document.getElementById('questionsList');
    container.innerHTML = '';

    if (questions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>📝 No Questions Yet</h3>
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
            <div class="question-hint">💡 ${question.hint}</div>
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
    alert(`Successfully loaded ${sampleQuestions.length} sample questions!`);
}

async function startGame() {
    if (questions.length === 0) {
        alert('Please add at least one question before starting a game');
        return;
    }

    const timer = parseInt(document.getElementById('timerInput').value) || 5;

    try {
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questions: questions,
                timer: timer
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
        }
    } catch (error) {
        alert('Failed to go to next question: ' + error.message);
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
    const stopBtn = document.getElementById('stopGameBtn');

    if (gameActive) {
        statusDiv.className = 'game-status status-active';
        statusDiv.textContent = `Active - Question ${currentQuestionIndex + 1} of ${questions.length}`;
        startBtn.disabled = true;
        nextBtn.disabled = currentQuestionIndex >= questions.length - 1;
        stopBtn.disabled = false;
    } else {
        statusDiv.className = 'game-status status-inactive';
        statusDiv.textContent = 'No active game';
        startBtn.disabled = false;
        nextBtn.disabled = true;
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

function openLeaderboard() {
    // Open leaderboard in a new window/tab for presentation
    const leaderboardWindow = window.open('/leaderboard', 'leaderboard', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    
    if (leaderboardWindow) {
        leaderboardWindow.focus();
    } else {
        // Fallback if popup blocked
        alert('Please allow popups for this site, or manually navigate to /leaderboard in a new tab');
    }
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