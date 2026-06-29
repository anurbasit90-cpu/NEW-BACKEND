# NEW-BACKEND — Instruksi Singkat

Requirement:
- Node.js >= 18
- service account JSON untuk Firebase Realtime Database (jangan commit ke repo)

Langkah jalankan lokal:
1. Tempatkan file kredensial Firebase di path aman dan jangan commit ke Git. Contoh: `/home/ubuntu/keys/serviceAccountKey.json`.
2. Buat file `.env` di root (copy dari `.env.example`) dan sesuaikan: set `SERVICE_ACCOUNT_PATH` ke lokasi file kredensial di server.
3. Install dependency:
   ```bash
   npm install
   ```
4. Jalankan server:
   ```bash
   npm start
   ```
5. Cek health:
   ```bash
   curl http://localhost:3000/health
   ```
   Response yang diharapkan: `{"status":"ok"}`

Proxy WordPress:
- Endpoint backend: `/wp/*` akan diteruskan ke `WP_API_BASE` (set di `.env` atau default ke `https://admin.aryatek.co.id/wp-json/wp/v2`).
- Untuk menghubungkan frontend (Vite), set `VITE_WP_API_BASE=http://localhost:3000/wp` di file `.env` frontend.

Catatan keamanan:
- Jangan commit `serviceAccountKey.json`. Gunakan `SERVICE_ACCOUNT_PATH` untuk menunjuk file di server atau simpan kredensial sebagai secret pada platform deploy.
- Atur `ALLOW_ORIGINS` di `.env` untuk domain frontend produksi (tidak gunakan wildcard `*` untuk production).
