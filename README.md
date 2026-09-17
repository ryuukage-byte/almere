# Almere & Co — Portofolio Investasi Publik

Website portofolio investasi publik milik Almere & Co. Menghadirkan transparansi kepemilikan aset secara objektif, analitis, dan apa adanya tanpa mengekspos raw wallet address.

## ✨ Fitur Utama

- **Ringkasan Portofolio & Live Sync**: Menampilkan total valuasi aktif dengan animasi *odometer*, live sync status, dan indikator performa bulanan.
- **Rincian Aset Terintegrasi (Sistem Tab)**:
  - ☰ **Daftar Aset**: Rincian kepemilikan aset (Bitcoin, Hyperliquid, Kas Tunai) dengan nilai terkonversi dan alokasi.
  - ◔ **Distribusi Portofolio**: Diagram donat interaktif dan persentase pembagian alokasi aset.
  - 📈 **Historis Performa**: Grafik garis interaktif (High-DPI Canvas) dengan pemilih rentang waktu 7H, 30H, 90H, dan 1T serta tooltip detail tanggal.
  - 🛡️ **Bukti Verifikasi**: Pembuktian integritas data aset melalui *Institutional Custody Attestation*, *Zero-Knowledge Merkle Proof*, dan *Signed Message On-Chain*.
- **Konversi Multi-Mata Uang (Searchable Dropdown)**: Dropdown vertikal yang mendukung 22 mata uang global (USD, IDR, SGD, EUR, GBP, JPY, dll.) lengkap dengan fitur pencarian instan.
- **Desain Mewah & Responsif**: Dark luxury aesthetic yang elegan, modern, dan sepenuhnya responsif di semua perangkat.

## 🚀 Menjalankan Secara Lokal

Pastikan [Node.js](https://nodejs.org/) sudah terinstal di komputer Anda.

1. Clone repositori ini:
   ```bash
   git clone https://github.com/ryuukage-byte/almere.git
   cd almere
   ```

2. Jalankan server lokal:
   ```bash
   node server.js
   ```

3. Buka browser dan akses:
   ```
   http://127.0.0.1:4173
   ```

## 🛠️ Teknologi

- HTML5 (Semantik & Aksesibel)
- Vanilla CSS3 (Custom Design System, Glassmorphism, Micro-animations)
- Vanilla JavaScript (High-DPI Canvas Rendering, Odometer Easing Engine)
- Node.js (Local HTTP Server)
