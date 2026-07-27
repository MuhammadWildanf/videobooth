// Global Data State for Pagination & Filtering
let allTransactionsData = [];
let filteredTransactionsData = [];
let currentPage = 1;
let pageSize = 10;

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
            allTransactionsData = result.data || [];
            calculateStats(allTransactionsData);
            applyFilters();
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
        if (tx.status === 'settlement' || tx.status === 'capture' || tx.status === 'PAID' || tx.status === 'Voucher Redeemed') {
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

// --- FILTER & SEARCH LOGIC ---
function handleFilterChange() {
    currentPage = 1;
    applyFilters();
}

function handlePageSizeChange() {
    const sizeSelect = document.getElementById('page-size-select');
    pageSize = parseInt(sizeSelect.value) || 10;
    currentPage = 1;
    applyFilters();
}

function applyFilters() {
    const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('status-filter')?.value || 'all';

    filteredTransactionsData = allTransactionsData.filter(tx => {
        // Status Filter Check
        let matchesStatus = true;
        if (statusFilter === 'settlement') {
            matchesStatus = (tx.status === 'settlement' || tx.status === 'capture' || tx.status === 'PAID' || tx.status === 'Voucher Redeemed');
        } else if (statusFilter === 'pending') {
            matchesStatus = (tx.status === 'pending');
        } else if (statusFilter === 'failed') {
            matchesStatus = (tx.status === 'failed' || tx.status === 'deny' || tx.status === 'cancel' || tx.status === 'expire');
        }

        // Search Query Check (Name, Phone, Order ID)
        let matchesSearch = true;
        if (searchQuery) {
            const nameStr = (tx.name || '').toLowerCase();
            const phoneStr = (tx.phone || '').toLowerCase();
            const orderIdStr = (tx.orderId || '').toLowerCase();
            matchesSearch = nameStr.includes(searchQuery) || phoneStr.includes(searchQuery) || orderIdStr.includes(searchQuery);
        }

        return matchesStatus && matchesSearch;
    });

    renderCurrentPageTable();
}

// --- PAGINATION RENDER LOGIC ---
function renderCurrentPageTable() {
    const tbody = document.getElementById('tx-body');
    const totalCount = filteredTransactionsData.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalCount);
    const pageData = filteredTransactionsData.slice(startIdx, endIdx);

    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Tidak ada transaksi yang cocok dengan filter.</td></tr>';
    } else {
        let html = '';
        pageData.forEach(tx => {
            const dateObj = new Date(tx.createdAt);
            const dateStr = isNaN(dateObj.getTime()) ? '-' : dateObj.toLocaleString('id-ID', { 
                day: '2-digit', month: 'short', year: 'numeric', 
                hour: '2-digit', minute: '2-digit'
            });

            let badgeClass = 'badge-danger';
            let statusText = 'Gagal';
            
            if (tx.status === 'settlement' || tx.status === 'capture' || tx.status === 'PAID' || tx.status === 'Voucher Redeemed') {
                badgeClass = 'badge-success';
                statusText = 'Berhasil';
            } else if (tx.status === 'pending') {
                badgeClass = 'badge-warning';
                statusText = 'Pending';
            }

            html += `
                <tr>
                    <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                    <td style="font-family: monospace; font-size: 13px; color: var(--primary); white-space: nowrap;">${tx.orderId}</td>
                    <td style="font-weight: 500;">${tx.name}</td>
                    <td style="color: var(--text-muted); font-size: 13px;">${tx.phone}</td>
                    <td style="font-weight: 600;">Rp ${(parseInt(tx.price)||0).toLocaleString('id-ID')}</td>
                    <td style="font-size: 13px; color: var(--text-main);">${tx.paymentMethod || '-'}</td>
                    <td><span class="badge ${badgeClass}">${statusText}</span></td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // Update Pagination Controls Info & State
    const infoSpan = document.getElementById('pagination-info');
    if (infoSpan) {
        const displayStart = totalCount === 0 ? 0 : startIdx + 1;
        infoSpan.innerText = `Menampilkan ${displayStart} - ${endIdx} dari ${totalCount} transaksi`;
    }

    const indicatorSpan = document.getElementById('page-indicator');
    if (indicatorSpan) {
        indicatorSpan.innerText = `Halaman ${currentPage} dari ${totalPages}`;
    }

    // Update Button Disabled States
    const btnFirst = document.getElementById('btn-first');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnLast = document.getElementById('btn-last');

    if (btnFirst) btnFirst.disabled = (currentPage <= 1);
    if (btnPrev) btnPrev.disabled = (currentPage <= 1);
    if (btnNext) btnNext.disabled = (currentPage >= totalPages);
    if (btnLast) btnLast.disabled = (currentPage >= totalPages);
}

// --- PAGINATION NAVIGATION FUNCTIONS ---
function goToPage(page) {
    const totalPages = Math.ceil(filteredTransactionsData.length / pageSize) || 1;
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderCurrentPageTable();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderCurrentPageTable();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredTransactionsData.length / pageSize) || 1;
    if (currentPage < totalPages) {
        currentPage++;
        renderCurrentPageTable();
    }
}

function goToLastPage() {
    const totalPages = Math.ceil(filteredTransactionsData.length / pageSize) || 1;
    currentPage = totalPages;
    renderCurrentPageTable();
}

// --- EXPORT TO CSV FUNCTION ---
function exportToCSV() {
    if (allTransactionsData.length === 0) {
        alert("Tidak ada data transaksi untuk diunduh.");
        return;
    }

    let csvContent = "Waktu (WIB),Order ID,Nama Tamu,Kontak (WA),Nominal,Metode Pembayaran,Status\n";
    
    filteredTransactionsData.forEach(tx => {
        const dateObj = new Date(tx.createdAt);
        const dateStr = isNaN(dateObj.getTime()) ? '-' : dateObj.toLocaleString('id-ID', { 
            day: '2-digit', month: 'short', year: 'numeric', 
            hour: '2-digit', minute: '2-digit'
        });
        
        let statusText = 'Gagal';
        if (tx.status === 'settlement' || tx.status === 'capture' || tx.status === 'PAID' || tx.status === 'Voucher Redeemed') statusText = 'Berhasil';
        else if (tx.status === 'pending') statusText = 'Pending';

        const row = [
            `"${dateStr}"`,
            `"${tx.orderId || ''}"`,
            `"${(tx.name || '').replace(/"/g, '""')}"`,
            `"${tx.phone || ''}"`,
            `"${tx.price || 0}"`,
            `"${tx.paymentMethod || ''}"`,
            `"${statusText}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Transaksi_Videobooth_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
