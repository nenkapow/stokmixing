# Opname Mixing — Milestone 1A

Aplikasi Vite untuk master material dan mesin Injection. Belum siap produksi; sesi dan input opname belum tersedia.

## Pengembangan

Gunakan Node.js 22+, `npm ci`, salin `.env.example` ke `.env.local`, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari proyek Supabase khusus, lalu `npm run dev`. Jangan gunakan service role key. `npm test` menjalankan tes unit dan `npm run build` membuat build.

## Supabase khusus

1. Buat proyek Supabase terpisah, nonaktifkan **Allow new users to sign up** di Auth, dan konfigurasikan URL aplikasi di pengaturan Auth. Ini wajib karena frontend tidak dapat mematikan signup di server.
2. Tinjau dan jalankan `supabase/migrations/202611040001_foundation.sql` di SQL editor proyek khusus. Jangan jalankan di proyek lain atau produksi tanpa proses review.
3. Buat akun pengguna melalui pengelolaan pengguna Supabase. Di SQL editor yang tepercaya, tambahkan profil pertama dengan `insert into public.profiles (id, role) values ('UUID-AKUN-ADMIN', 'admin');` menggunakan UUID akun yang dibuat. Tambahkan akun lain dengan cara yang sama dan role `mandor` atau `admin`. Hanya operator proyek tepercaya yang boleh mengubah tabel profil; pengguna aplikasi tidak dapat melakukannya.
4. Uji RLS pada database Supabase sementara dengan `psql "$DATABASE_URL" -f supabase/tests/rls.sql` setelah migrasi. Tes membuat akun sementara dan rollback. Jangan memasukkan connection string ke repository.

## Impor

Gunakan CSV UTF-8 dengan pemisah koma atau XLSX dengan header `code`, `name`, `qty` di baris pertama. Qty hanya divalidasi dan tidak disimpan sebagai kg. Benahi seluruh baris duplikat atau bermasalah sebelum konfirmasi. Standar kg/zak harus diisi manual; impor tidak mengubah standar yang sudah ada. Berkas perusahaan tidak boleh dikomit.

## GitHub Pages

Base path adalah `/stokmixing/`. Atur Pages ke GitHub Actions dan repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Workflow hanya dijalankan manual; tinjau konfigurasi sebelum menjalankannya.
