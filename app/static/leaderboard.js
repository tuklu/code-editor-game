let gameData = null;
let lastUpdateTime = null;

window.addEventListener('load', function() {
    updateLeaderboard();
    setInterval(updateLeaderboard, 3000);
    setInterval(updateGameStatus, 5000);
});

async function updateGameStatus() {
    try {
        const response = await fetch('/api/game/status');
        if (response.ok) {
            gameData = await response.json();
            displayGameInfo();
        }
    } catch (error) {
        console.error('Failed to get game status:', error);
        displayNoGame();
    }
}

function displayGameInfo() {
    const statusElement = document.getElementById('gameStatus');
    const questionElement = document.getElementById('questionInfo');

    if (gameData && gameData.active) {
        statusElement.textContent = `🎮 Challenge Active - Question ${gameData.question_index + 1} of ${gameData.total_questions}`;
        statusElement.style.color = '#4CAF50';
        
        if (gameData.current_question) {
            questionElement.innerHTML = `
                <strong>Current Challenge:</strong> ${gameData.current_question.title}<br>
                <em>${gameData.current_question.description}</em>
            `;
        }
    } else {
        displayNoGame();
    }
}

function displayNoGame() {
    const statusElement = document.getElementById('gameStatus');
    const questionElement = document.getElementById('questionInfo');
    
    statusElement.textContent = '⏸️ No Active Challenge';
    statusElement.style.color = '#ff9800';
    questionElement.textContent = 'Waiting for teacher to start a coding challenge...';
}

async function updateLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const leaderboard = await response.json();
        
        const indicator = document.getElementById('refreshIndicator');
        indicator.classList.add('pulse');
        setTimeout(() => indicator.classList.remove('pulse'), 1000);
        
        displayLeaderboard(leaderboard);
        lastUpdateTime = new Date();
        
    } catch (error) {
        console.error('Failed to update leaderboard:', error);
        displayEmptyLeaderboard();
    }
}

function displayLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboardBody');
    const podium = document.getElementById('podium');
    
    if (!leaderboard || leaderboard.length === 0) {
        displayEmptyLeaderboard();
        return;
    }

    if (leaderboard.length >= 3) {
        displayPodium(leaderboard.slice(0, 3));
        podium.style.display = 'flex';
    } else {
        podium.style.display = 'none';
    }

    // Display full leaderboard
    tbody.innerHTML = '';
    leaderboard.forEach((student, index) => {
        const row = document.createElement('tr');
        
        let rankClass = '';
        let rankText = `#${index + 1}`;
        
        if (index === 0) {
            rankClass = 'first';
            rankText = '🥇';
        } else if (index === 1) {
            rankClass = 'second';
            rankText = '🥈';
        } else if (index === 2) {
            rankClass = 'third';
            rankText = '🥉';
        }

        const progressBar = createProgressBar(student.score, gameData ? gameData.total_questions : 10);
        
        row.innerHTML = `
            <td class="rank ${rankClass}">${rankText}</td>
            <td class="student-name">${student.nickname}</td>
            <td class="score">${student.score}</td>
            <td style="text-align: center;">${progressBar}</td>
        `;
        tbody.appendChild(row);
    });
}

function displayPodium(top3) {
    const podium = document.getElementById('podium');
    podium.innerHTML = '';

    const positions = ['second', 'first', 'third'];
    const medals = ['🥈', '🥇', '🥉'];
    
    for (let i = 0; i < 3; i++) {
        const student = top3[i];
        if (!student) continue;

        const place = document.createElement('div');
        place.className = `podium-place ${positions[i]}`;
        place.innerHTML = `
            <div class="podium-rank">${medals[i]}</div>
            <div class="podium-name">${student.nickname}</div>
            <div class="podium-score">${student.score}</div>
        `;
        podium.appendChild(place);
    }
}

function createProgressBar(score, total) {
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    return `
        <div style="background: rgba(255,255,255,0.2); border-radius: 10px; width: 80px; height: 8px; margin: 0 auto; overflow: hidden;">
            <div style="background: #4CAF50; height: 100%; width: ${percentage}%; border-radius: 10px; transition: width 0.5s ease;"></div>
        </div>
        <small>${percentage}%</small>
    `;
}

function displayEmptyLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    const podium = document.getElementById('podium');
    
    podium.style.display = 'none';
    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="empty-state">
                <h3>🎯 Waiting for Participants</h3>
                <p>The leaderboard will update automatically when students join and start solving challenges!</p>
            </td>
        </tr>
    `;
}

updateGameStatus();
