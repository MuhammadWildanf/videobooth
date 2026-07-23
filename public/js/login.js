    <script>
        // Check if already logged in
        if (localStorage.getItem('adminToken')) {
            window.location.href = '/dashboard.html';
        }

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('password').value;
            const btn = document.getElementById('btn-submit');
            const errorMsg = document.getElementById('error-msg');
            
            btn.innerHTML = 'Checking...';
            errorMsg.style.display = 'none';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                
                if (data.status === 'success') {
                    localStorage.setItem('adminToken', data.token);
                    window.location.href = '/dashboard.html';
                } else {
                    errorMsg.style.display = 'block';
                    errorMsg.innerText = data.message || 'Incorrect password!';
                    btn.innerHTML = 'Login to Dashboard';
                }
            } catch (err) {
                errorMsg.style.display = 'block';
                errorMsg.innerText = 'Failed to connect to server.';
                btn.innerHTML = 'Login to Dashboard';
            }
        });
    </script>
