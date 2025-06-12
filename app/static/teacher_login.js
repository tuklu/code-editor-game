        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const button = document.getElementById('loginButton');
            const errorDiv = document.getElementById('errorMessage');
            
            button.disabled = true;
            button.textContent = 'Logging in...';
            errorDiv.style.display = 'none';
            
            try {
                const response = await fetch('/api/teacher/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.location.href = '/teacher';
                } else {
                    errorDiv.textContent = result.message || 'Invalid credentials';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Login failed. Please try again.';
                errorDiv.style.display = 'block';
            }
            
            button.disabled = false;
            button.textContent = 'Login';
        });

        // Focus username field on load
        document.getElementById('username').focus();