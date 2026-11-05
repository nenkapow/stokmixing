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

Gunakan CSV UTF-8 dengan pemisah koma atau XLSX dengan header FINAC `Category`, `Description COA`, `Code`, `Name`, `Qty`, `Average`, `Total` di baris pertama (kolom wajib: `Code`, `Name`, `Qty`). Qty tidak digunakan atau disimpan dalam master. Kode yang sudah terdaftar dilewati; duplikat identik dalam file dihitung dan dilewati, sedangkan konflik nama atau baris bermasalah perlu diperbaiki sebelum konfirmasi. Standar kg/zak harus diisi manual; impor tidak mengubah standar yang sudah ada. Berkas perusahaan tidak boleh dikomit.

## GitHub Pages

Base path adalah `/stokmixing/`. Atur Pages ke GitHub Actions dan repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Workflow hanya dijalankan manual; tinjau konfigurasi sebelum menjalankannya.

## Milestone 1B — Stock opname

Migrasi baru `supabase/migrations/202611040002_opname.sql` harus diterapkan setelah migrasi 1A pada proyek Supabase khusus, melalui proses review pengguna. Migrasi tidak dijalankan otomatis. Uji pada database Supabase sementara dengan `psql "$DATABASE_URL" -f supabase/tests/opname.sql`; jangan jalankan tes pada produksi. Uji klaim bersamaan pada database yang dapat dibuang dengan `OPNAME_ALLOW_DESTRUCTIVE_TEST=yes SUPABASE_TEST_DATABASE_URL=... bash supabase/tests/concurrent_claim.sh`; tes ini membuat dan menghapus data sintetis.

Admin membuat sesi dan daftar mesin aktif disalin pada saat itu; penanggung jawab ditampilkan dengan nama profil kepada Admin. Mandor memilih mesin, mengisi material lalu mengonfirmasi selesai, termasuk mesin kosong. Input sementara disimpan di sessionStorage tab yang sama dan dihapus setelah server menerima penyimpanan; menutup tab atau menghapus data browser dapat menghilangkannya. Admin dapat membuka ulang mesin pada sesi yang masih terbuka. Sesi hanya dapat ditutup setelah semua mesin selesai; penutupan bersifat final di versi ini. Rekap hanya menghitung mesin selesai dan menandai sesi yang belum lengkap.

## Nama penanggung jawab

Sebelum deploy frontend UX V1, tinjau dan terapkan `supabase/migrations/202611040003_profile_display_name.sql` setelah migrasi 1A dan 1B. Profil lama tetap tersedia dan nama awalnya kosong; Admin dapat mengisi nama melalui menu Nama pengguna. Admin melihat profil dan dapat mengubah kolom nama saja; Mandor hanya dapat membaca profil sendiri dan tidak dapat mengubah peran. Uji pada database Supabase sementara dengan `psql "$DATABASE_URL" -f supabase/tests/profile_display_name.sql` serta tes RLS yang ada. Migrasi tidak dijalankan secara otomatis.

## Milestone 2 — Rekonsiliasi FINAC dan laporan PPIC

Tinjau `supabase/migrations/202611040004_finac_reconciliation.sql` dan terapkan setelah migrasi 001–003 melalui proses yang disetujui untuk proyek khusus; aplikasi ini tidak menjalankan migrasi. Uji terlebih dahulu pada database Supabase sementara: `psql "$DATABASE_URL" -f supabase/tests/finac_reconciliation.sql`. RLS, isolasi dan transaksi perlu diverifikasi pada Supabase nyata sebelum deployment.

Admin memilih sesi pada menu Rekonsiliasi FINAC, mengimpor CSV UTF-8 atau XLSX dengan header FINAC, dan secara eksplisit mengonfirmasi apakah Qty adalah KG serta Average adalah harga per KG. Angka FINAC menggunakan titik desimal, maksimal 18 digit sebelum dan 18 digit setelah titik; Qty kosong ditolak dan nol diterima. Setiap impor membuat versi baru yang mempertahankan snapshot sebelumnya; impor ulang memerlukan konfirmasi dan versi terakhir. Data harga hanya tersedia bagi Admin.

Ekspor final memerlukan snapshot dengan Qty terkonfirmasi KG, sedikitnya satu mesin, semua mesin selesai, dan standar kg/zak yang konsisten. Harga yang tidak dikonfirmasi atau tidak tersedia dibiarkan kosong; kode yang tidak ditemukan di FINAC diberi catatan dan selisih kosong. Kolom Pecahan mencakup hopper; sheet kedua menyimpan rincian hopper. Nilai rupiah dibulatkan dua desimal. Excel membatasi angka menjadi 15 digit signifikan: nilai numerik dibulatkan secara eksplisit dengan catatan sel dan nilai tepat tersedia sebagai teks di sheet Presisi Sumber. Total IDR dibulatkan ke dua desimal setelah perhitungan dengan nilai sumber. Hasil unduhan mengikuti spesifikasi kolom, belum dibandingkan dengan template PPIC asli. Jangan menyimpan file FINAC asli di repository.

Migrasi kompatibilitas `supabase/migrations/202611040005_mixing_compatibility.sql` harus ditinjau dan dijalankan setelah migrasi 004; 001 dan 002 tidak diubah. Uji di database Supabase sementara dengan `psql "$DATABASE_URL" -f supabase/tests/mixing_compatibility.sql`. Nilai numerik XLSX impor mengikuti presisi file Excel; gunakan CSV untuk angka sumber yang memerlukan lebih dari 15 digit signifikan.

## Impor master insert-only

Sebelum deployment frontend, tinjau dan terapkan `supabase/migrations/202611050006_master_insert_only.sql` setelah 001–005. Preview membandingkan seluruh kode master, termasuk yang nonaktif; data lama tidak diubah. Jumlah hasil adalah baris yang benar-benar ditambahkan dan dapat lebih kecil dari preview jika impor lain berjalan bersamaan. Uji di database Supabase yang dapat dibuang dengan `psql "$DATABASE_URL" -f supabase/tests/master_insert_only.sql`; tes bersamaan menggunakan `OPNAME_ALLOW_DESTRUCTIVE_TEST=yes SUPABASE_TEST_DATABASE_URL=... bash supabase/tests/concurrent_master_import.sh` dan membuat data sintetis sementara. Jangan menjalankan tes tersebut pada database produksi.
