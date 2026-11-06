# STOCKMIX

Aplikasi stock opname material Injection. Validasi database dan alur operasional tetap diperlukan sebelum penggunaan produksi.

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

Impor master mengenali satu baris ringkasan pada akhir file FINAC jika Code dan Name kosong, kolom identitas lain kosong atau berlabel TOTAL/GRAND TOTAL, dan kolom angka memenuhi pola footer. Footer tanpa label memerlukan sedikitnya dua nilai numerik; baris ambigu tetap dilaporkan bermasalah. Nama atau kode berisi TOTAL tetap diperlakukan sebagai data, sehingga tidak dilewati otomatis. Periksa jumlah dan detail ringkasan pada preview sebelum impor.

## Standar material dan harga PPIC

Tinjau dan uji `202611050007_default_material_standard.sql` lalu `202611050008_ppic_price_reference.sql` pada database Supabase sementara setelah migrasi 001–006. Migrasi 007 mengisi 25 kg/zak hanya untuk material Mixing yang masih NULL dan memberi 25 pada material baru; standar opname yang sudah tersimpan tidak berubah. Jalankan `psql "$DATABASE_URL" -f supabase/tests/default_material_standard.sql` dan `psql "$DATABASE_URL" -f supabase/tests/ppic_price_reference.sql` setelah migrasi. Untuk menguji backfill 007 itu sendiri, mulai dengan database sementara yang hanya memiliki 001–006 lalu jalankan `psql "$DATABASE_URL" -f supabase/tests/default_standard_migration.sql`; skrip itu menerapkan 007 dan meninggalkan fixture sehingga **hanya untuk database yang dapat dibuang**. Tes konkurensi `OPNAME_ALLOW_DESTRUCTIVE_TEST=yes SUPABASE_TEST_DATABASE_URL=... bash supabase/tests/concurrent_ppic_prices.sh` juga hanya untuk database sementara.

Admin memilih file XLSX, worksheet, dan tanggal sumber di Referensi Harga PPIC; nama berbeda harus diperiksa satu per satu, dan satuan serta perubahan harga harus dikonfirmasi. Nilai numerik Excel dipakai sesuai nilai sel; teks seperti `23.561` yang ambigu ditolak. Nomor kode yang disimpan Excel sebagai angka hanya diterima jika aman; kode dengan nol depan harus berupa teks. Harga yang sama tidak menambah versi. Di Rekonsiliasi, Admin menetapkan PPIC atau secara eksplisit memilih Average FINAC untuk membuat snapshot harga sesi. Pilihan dapat direvisi hanya selama sesi OPEN; harga yang hilang tetap kosong dan tidak otomatis memakai FINAC. Sesi CLOSED yang sudah ada saat migrasi dibekukan memakai harga FINAC yang sebelumnya terkonfirmasi untuk menjaga laporan lama. Jangan jalankan migrasi atau tes destruktif pada database pengguna secara otomatis.

### Integritas versi harga sesi

Impor FINAC baru membuat pilihan harga sesi sebelumnya tidak sinkron, baik sumber PPIC maupun FINAC. Harga lama tidak digunakan dan ekspor final diblokir sampai Admin menetapkan ulang sumber harga untuk snapshot FINAC terbaru. Penetapan ulang memeriksa versi yang dilihat Admin; sesi CLOSED menolak impor FINAC dan perubahan harga. Laporan membaca snapshot FINAC dan pilihan harga melalui satu RPC yang konsisten.

Migrasi 008 pada branch ini diperbarui dengan asumsi **belum pernah diterapkan** pada database tujuan. Jika 008 sudah diterapkan pada database lain, jangan jalankan ulang file yang telah diubah: siapkan migrasi koreksi baru untuk database tersebut. Uji perubahan dan `supabase/tests/ppic_price_reference.sql` pada database sementara sebelum deployment.

### Mesin Tidak Jalan (migrasi 009)

Setelah migrasi 001–008, tinjau dan terapkan `supabase/migrations/202611060009_machine_not_running.sql` secara manual pada proyek khusus yang benar. Jangan menjalankannya pada database produksi tanpa proses perubahan yang disetujui. Mandor dapat menyatakan mesin yang belum memiliki material sebagai Tidak Jalan; identitas, waktu, dan perubahan status dicatat. Mesin tersebut dihitung sebagai ditangani untuk penutupan sesi, tetapi bukan sebagai pengukuran fisik dan tidak menghasilkan item stok nol. Rekap dan workbook mencantumkan mesin yang tidak diukur. Pembatalan oleh penanggung jawab atau pembukaan ulang oleh Admin hanya tersedia saat sesi terbuka.

Untuk pengujian database, gunakan **database Supabase sementara khusus tes** yang sudah menerapkan migrasi 001–009; jangan gunakan database pengguna. Jalankan `psql "$SUPABASE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/machine_not_running.sql` untuk tes transaksi yang di-rollback. Tes persaingan `OPNAME_ALLOW_DESTRUCTIVE_TEST=yes bash supabase/tests/concurrent_not_running.sh` membuat dan menghapus fixture sintetis pada database sementara dan memerlukan `SUPABASE_TEST_DATABASE_URL`; pastikan tidak ada sesi OPEN. Tes tersebut tidak boleh dijalankan pada database produksi.
