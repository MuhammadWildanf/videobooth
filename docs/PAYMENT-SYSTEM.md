# Sistem Pembayaran - Videobooth Application

## Ringkasan

Aplikasi ini mendukung **3 metode pembayaran** dengan 2 alur berbeda tergantung halaman yang digunakan.

---

## Metode Pembayaran

| # | Metode | Verifikasi | Keterangan |
|---|--------|------------|------------|
| 1 | **Xendit Dynamic QRIS** | Otomatis (Webhook + Polling) | QR unik per transaksi, verified oleh Xendit |
| 2 | **Static QRIS** | Trust-based (manual) | QR statis, operator manual approve |
| 3 | **Voucher** | Trust-based (manual) | Tombol skip payment, tanpa validasi kode |

### 1. Xendit Dynamic QRIS
- Server generate QR code unik via API Xendit (`POST /qr_codes`)
- Setiap transaksi punya `reference_id` unik: `ORDER-{eventId}-{timestamp}`
- Pembayaran diverifikasi otomatis via:
  - **Webhook**: Xendit kirim notifikasi ke `POST /api/payment/callback`
  - **Polling**: Frontend cek status setiap 3 detik ke `GET /api/payment/status/:orderId`
- Status: `pending` → `settlement` (berhasil) / `failed` (gagal)
- **Aktif otomatis** kalau `XENDIT_SECRET_KEY` di `.env` valid (bukan dummy/empty)

### 2. Static QRIS
- Gambar QR statis dari `/public/qris-static.png` (atau custom via `config.staticQrisUrl`)
- **Tidak ada verifikasi otomatis** — operator/operator memverifikasi manual
- Aktif otomatis kalau:
  - `useStaticQRIS: true` di config event
  - `XENDIT_SECRET_KEY` kosong/missing/berisi "dummy"
  - API Xendit error/gagal
- Flow di `localhunt.html`: tombol "I HAVE PAID" langsung approve tanpa cek server

### 3. Voucher
- Tombol "USE VOUCHER" di halaman pembayaran
- Tidak ada validasi kode voucher di server
- Transaksi dicatat dengan status `"Voucher Redeemed"` dan harga `Rp 0`
- Cocok untuk situasi kiosk di mana operator kasih voucher fisik

---

## Alur Pembayaran

### Alur A: `index.html` (Generic/Wedding Page)

**Pembayaran SETELAH recording:**

```
Idle → Form → Ready → Recording → Review Video → Review Final → PAYMENT → Upload → Processing → Selesai
```

1. User isi form (nama, telepon, email)
2. User rekam video + foto
3. User review hasil
4. User klik "Upload" → **pembayaran muncul**
5. Sistem POST `/api/payment/create` dengan data user
6. User scan QRIS → bayar
7. Frontend poll status setiap 3 detik
8. Setelah terverifikasi (3 menit timeout):
   - Video + foto di-upload ke server
   - Server render dengan FFmpeg (tambah overlay frame)
   - Notifikasi dikirim via WhatsApp & Email

**Fitur khusus:**
- Double-click QR image → `simulatePaymentSecretly()` (dev mode, simulasi bayar)
- Timer 3 menit — jika timeout, pembayaran dibatalkan

### Alur B: `localhunt.html` (Local Hunt Event)

**Pembayaran SEBELUM recording:**

```
Idle → Payment Method Selection → [QRIS / Voucher] → Form → Ready → Recording → Review Video → Review Final → Upload → Processing → Selesai
```

1. User klik "START HERE" → pilih metode pembayaran
2. **QRIS**: Tampilkan QR statis → user klik "I HAVE PAID" → langsung lanjut
3. **Voucher**: Konfirmasi voucher → langsung lanjut
4. User isi form (nama, telepon, email)
5. User rekam video + foto
6. User review hasil
7. User klik "SUBMIT" → video + foto di-upload ke server
8. Server render + kirim notifikasi

**Fitur khusus:**
- `startPaymentPolling()` ada tapi `currentInvoiceId` selalu null → polling tidak aktif
- `simulatePaymentSecretly()` bisa dipanggil via API `/api/payment/simulate/:orderId`

---

## API Endpoints

### Payment

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/api/payment/create` | Buat pembayaran baru (QRIS) |
| `GET` | `/api/payment/status/:orderId` | Cek status pembayaran |
| `POST` | `/api/payment/callback` | Webhook dari Xendit |
| `POST` | `/api/payment/simulate/:orderId` | Simulasi pembayaran (dev only) |
| `GET` | `/api/admin/transactions` | List semua transaksi |
| `DELETE` | `/api/admin/transactions/:orderId` | Hapus transaksi |

### Videobooth

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/api/videobooth/submit` | Upload video/foto + simpan transaksi |

---

## Konfigurasi

### Environment Variables (`.env`)

```
XENDIT_SECRET_KEY=xnd_development_...   # Kunci API Xendit
```

### Event Config (`config.json` per event)

| Field | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| `sessionPrice` | Number | `30000` | Harga sesi dalam Rupiah |
| `useStaticQRIS` | Boolean | `false` | Paksa pakai QRIS statis |
| `staticQrisUrl` | String | `/qris-static.png` | Path gambar QR statis |

---

## Backend Architecture

### Payment Cache (In-Memory)
- Variable `paymentCache` di `src/services/queue.js`
- Format: `{ [orderId]: 'pending' | 'settlement' | 'failed' }`
- **Volatile**: hilang saat server restart
- Database (Firestore/JSON) jadi source of truth

### Processing Queue
- Setelah upload, task masuk ke queue (`fastq`)
- Worker proses: FFmpeg render → Upload storage → Kirim notifikasi
- Retry otomatis sampai 10x
- Failed task disimpan ke `/data/offline_queue/`
- Recovery background setiap 5 menit

### Storage Provider
- `STORAGE_PROVIDER=local` → simpan di folder `/uploads/`
- `STORAGE_PROVIDER=drive` → upload ke Google Drive
- `STORAGE_PROVIDER=gcp` → upload ke Google Cloud Storage

---

## Flow Lengkap: Request ke Server

```
1. POST /api/payment/create
   ├── Ambil sessionPrice dari event config
   ├── Generate orderId
   ├── Jika price <= 0 → bypass, return status: 'bypassed'
   ├── Jika useStaticQRIS atau Xendit error → return static QR
   ├── POST https://api.xendit.co/qr_codes → dynamic QR
   ├── Convert qr_string → base64 PNG
   ├── Simpan transaksi ke DB (status: pending)
   └── Return { orderId, qrImage, amount }

2. GET /api/payment/status/:orderId
   ├── Cek paymentCache[orderId]
   └── Return { status: 'pending' | 'settlement' | 'failed' }

3. POST /api/payment/callback (webhook dari Xendit)
   ├── Parse event: qr.payment
   ├── Jika SUCCEEDED/COMPLETED → status: settlement
   ├── Update paymentCache + Database
   └── Return 200

4. POST /api/videobooth/submit
   ├── Validasi event aktif
   ├── Simpan file video + foto
   ├── Simpan transaksi final ke DB
   ├── Push task ke processing queue
   └── Return { sessionId, status: 'queued' }
```

---

## Catatan Penting

1. **Static QRIS tidak punya verifikasi otomatis** — cocok untuk kiosk supervised, bukan untuk remote/unattended
2. **Voucher tanpa validasi kode** — hanya tombol skip, operator harus handle manual
3. **Payment cache volatile** — restart server = semua status pending hilang dari cache (tapi masih ada di DB)
4. **Xendit key masih development** — perlu ganti ke production key untuk live deployment
5. **Limit Gmail** — email notifikasi terbatas ~500/hari, pertimbangkan pakai transactional email service
