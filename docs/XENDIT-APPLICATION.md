# Pengajuan Integrasi Payment Gateway — Xendit

## 1. Profil Bisnis

| Field | Detail |
|-------|--------|
| **Nama Bisnis** | PT Imajiwa Kreasi Visual |
| **URL Aplikasi** | https://lumea.imajiwa.id |
| **Jenis Bisnis** | Event Technology / Interactive Videobooth & Photo Services |
| **Kategori** | Entertainment & Event Services |
| **Lokasi** | Jl. Kemang Dalam IV No.K24, RT.3/RW.3, Bangka, Kec. Mampang Prpt., Kota Jakarta Selatan, DKI Jakarta 12730 |
| **Email Bisnis** | visual.lab@imajiwa.id |
| **Telepon** | +62 812-1729-2039 |
| **Model Bisnis** | B2C (Business to Consumer) — Pembayaran langsung dari pengunjung event |

---

## 2. Deskripsi Produk

### Apa itu Videobooth Application?

Videobooth adalah aplikasi interaktif berbasis web yang dijalankan di perangkat kiosk (tablet/PC touchscreen) di lokasi event. Pengunjung dapat:

1. **Merekam video** dengan durasi yang ditentukan (10-30 detik)
2. **Mengambil foto** dengan overlay frame kustom event
3. **Menggambar/menulis** di layar mirror (gesture tracking)
4. **Menerima hasil** video & foto langsung via WhatsApp dan Email

### Cara Kerja Pembayaran

```
Pengunjung mulai → Pembayaran QRIS → Rekam Video & Foto → Hasil diproses & dikirim
```

- Pembayaran dilakukan di kiosk di awal untuk membuka sesi
- Pengunjung scan QRIS yang ditampilkan di layar kiosk
- Setelah pembayaran terverifikasi, pengunjung melakukan perekaman video & foto, lalu hasil diproses dan dikirim ke WhatsApp & Email
- Durasi seluruh proses: ~2-3 menit

---

## 3. Model Pembayaran

| Aspek | Detail |
|-------|--------|
| **Metode Pembayaran** | QRIS (Quick Response Indonesian Standard) |
| **Tipe Transaksi** | Single Payment (one-time, non-recurring) |
| **Currency** | IDR (Rupiah Indonesia) |
| **Harga per Sesi** | Rp 10.000 — Rp 50.000 (dikonfigurasi per event) |
| **Estimasi Volume** | 50 — 500 transaksi per event |
| **Frekuensi Event** | 2 — 8 event per bulan |
| **Estimasi Monthly GMV** | Rp 5.000.000 — Rp 50.000.000 |

---

## 4. Alur Transaksi (Customer Journey)

### Langkah 1: Mulai
Pengunjung menekan tombol "START" di layar kiosk.

### Langkah 2: Pembayaran QRIS
- Sistem menampilkan **QRIS QR code** unik per transaksi
- Harga ditampilkan di layar
- Pengunjung scan QR dengan mobile banking/e-wallet
- Sistem otomatis memverifikasi pembayaran (via webhook Xendit) untuk membuka sesi

### Langkah 3: Rekam & Perform
Pengunjung merekam video (10-30 detik) dan mengambil foto dengan frame overlay event.

### Langkah 4: Proses & Kirim
- Video & foto diproses di server (rendering dengan FFmpeg + overlay frame)
- Hasil dikirim ke **WhatsApp** dan **Email** pengunjung
- Pengunjung selesai dalam ~2-3 menit

---

## 5. Technical Integration

### Endpoint yang Digunakan

| Endpoint | Metode | Fungsi |
|----------|--------|--------|
| `/qr_codes` | POST | Membuat QRIS QR code dinamis per transaksi |
| Webhook callback | POST | Menerima notifikasi status pembayaran dari Xendit |

### Flow Teknis

```
[Client] → POST /api/payment/create
    ↓
[Server] → POST https://api.xendit.co/qr_codes
    → {
        reference_id: "ORDER-{eventId}-{timestamp}",
        type: "DYNAMIC",
        currency: "IDR",
        amount: {sessionPrice}
      }
    ↓
[Server] → Kirim QR image ke client
    ↓
[Client] → Pengunjung scan QR & bayar
    ↓
[Xendit] → POST webhook ke /api/payment/callback
    → { event: "qr.payment", data: { status: "SUCCEEDED" } }
    ↓
[Server] → Update status transaksi → Proses video → Kirim ke pengunjung
```

### Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js + Express |
| Database | Firestore / JSON Local |
| Rendering | FFmpeg (video & photo processing) |
| Delivery | WhatsApp API (RuangWA) + Nodemailer (Email) |
| Payment | Xendit QRIS API |

---

## 6. Compliance & Keamanan

- **PCI DSS**: Tidak menyimpan data kartu kredit — semua pembayaran via QRIS (scan-to-pay)
- **Data yang disimpan**: Nama, nomor telepon, email (untuk pengiriman hasil)
- **Server**: Self-hosted, data tidak dibagikan ke pihak ketiga selain Xendit untuk pemrosesan pembayaran
- **Webhook Verification**: Menggunakan Xendit webhook signature untuk verifikasi keaslian callback
- **TLS/SSL**: Menggunakan HTTPS untuk semua komunikasi

---

## 7. Riwayat Penggunaan Xendit

| Status | Keterangan |
|--------|------------|
| **Saat ini** | Menggunakan Xendit Development/Test Mode |
| **Production** | Belum — dalam proses pengajuan |
| **Gateway sebelumnya** | Tidak ada — ini adalah integrasi payment gateway pertama |

---

## 8. Kebutuhan Produksi

| Kebutuhan | Status |
|-----------|--------|
| Xendit Production Secret Key | Diperlukan |
| Webhook URL yang bisa diakses publik | Diperlukan (untuk callback) |
| HTTPS / SSL Certificate | Diperlukan |
| Business Verification (KYC) | Akan dilengkapi |

---

## 9. Kontak Teknis

| Role | Detail |
|------|--------|
| **Tech Lead** | Imajiwa Creative Studio |
| **Email** | visual.lab@imajiwa.id |
| **Telepon** | +62 812-1729-2039 |
| **GitHub** | (opsional, untuk referensi kode) |

---

## 10. Catatan Tambahan

1. **Mode Kiosk**: Aplikasi ini berjalan di perangkat kiosk (tablet/touchscreen) yang diawasi oleh operator. Pengunjung tidak mengakses aplikasi dari device pribadi.

2. **Refund Policy**: Pembatalan/refund dilakukan secara manual oleh operator di lokasi event. Tidak ada refund otomatis.

3. **Voucher System**: Tersedia opsi voucher fisik yang diberikan oleh operator untuk melewati pembayaran (skip payment). Voucher tidak terhubung ke sistem pembayaran digital.

4. **Multi-Event**: Aplikasi mendukung multiple event sekaligus, masing-masing dengan konfigurasi harga, overlay, dan branding berbeda.
