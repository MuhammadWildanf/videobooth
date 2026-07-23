    <script>
        // Check Login Status
        const token = localStorage.getItem('adminToken');
        if (!token) {
            window.location.href = '/login.html';
        } else {
            // Verify token with backend
            fetch('/api/verify-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            }).then(res => {
                if (!res.ok) {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/login.html';
                } else {
                    document.getElementById('main-content').style.display = 'block';
                    fetchTransactions();
                    setInterval(fetchTransactions, 5000);
                }
            }).catch(() => {
                document.getElementById('main-content').style.display = 'block';
                fetchTransactions();
            });
        }

        function logout() {
            localStorage.removeItem('adminToken');
            window.location.href = '/login.html';
        }

        async function fetchTransactions() {
            try {
                const res = await fetch('/api/admin/transactions');
                const result = await res.json();
                
                if (result.success) {
                    renderTable(result.data);
                    calculateStats(result.data);
                }
            } catch (err) {
                console.error("Gagal menarik data:", err);
            }
        }

        function calculateStats(data) {
            let totalRevenue = 0;
            let successCount = 0;
            let pendingCount = 0;

            data.forEach(tx => {
                if (tx.status === 'settlement' || tx.status === 'capture') {
                    totalRevenue += parseInt(tx.price) || 0;
                    successCount++;
                } else if (tx.status === 'pending') {
                    pendingCount++;
                }
            });

            document.getElementById('stat-revenue').innerText = 'Rp ' + totalRevenue.toLocaleString('id-ID');
            document.getElementById('stat-success').innerText = successCount;
            document.getElementById('stat-pending').innerText = pendingCount;
        }

        function renderTable(data) {
            const tbody = document.getElementById('tx-body');
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Belum ada transaksi.</td></tr>';
                return;
            }

            let html = '';
            data.forEach(tx => {
                const dateObj = new Date(tx.createdAt);
                const dateStr = dateObj.toLocaleString('id-ID', { 
                    day: '2-digit', month: 'short', year: 'numeric', 
                    hour: '2-digit', minute: '2-digit'
                });

                let badgeClass = 'badge-danger';
                let statusText = 'Gagal';
                
                if (tx.status === 'settlement' || tx.status === 'capture') {
                    badgeClass = 'badge-success';
                    statusText = 'Berhasil';
                } else if (tx.status === 'pending') {
                    badgeClass = 'badge-warning';
                    statusText = 'Pending';
                }

                html += `
                    <tr>
                        <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                        <td style="font-family: monospace; font-size: 12px; color: var(--primary);">${tx.orderId}</td>
                        <td style="font-weight: 500;">${tx.name}</td>
                        <td style="color: var(--text-muted); font-size: 13px;">${tx.phone}</td>
                        <td style="font-weight: 600;">Rp ${(parseInt(tx.price)||0).toLocaleString('id-ID')}</td>
                        <td><span class="badge ${badgeClass}">${statusText}</span></td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        }

        // --- EXPORT TO CSV FUNCTION ---
        function exportToCSV() {
            const table = document.querySelector("table");
            let csvContent = "";
            const rows = table.querySelectorAll("tr");
            
            rows.forEach((row, i) => {
                let rowData = [];
                const cols = row.querySelectorAll("th, td");
                cols.forEach(col => {
                    let text = col.innerText.replace(/"/g, '""'); // escape double quotes
                    rowData.push('"' + text + '"');
                });
                csvContent += rowData.join(",") + "\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "Laporan_Transaksi_Videobooth.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    </script>
