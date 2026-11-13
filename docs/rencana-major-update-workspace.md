# Rencana Major Update: Workspace Alvian vs FORIOR

Status: **disimpan, belum dikerjakan.** Dikerjakan setelah revisi Photo Delivery selesai.
Dicatat: 13 Nov 2026, dari permintaan Alvian.

## Permintaan (ringkas)
- Isi aplikasi berbeda tergantung **siapa yang login** dan **workspace yang aktif**.
- **Alvian** (fotografer & founder): fokus branding pribadi, terutama modul sosmed. Boleh punya akses Photo Delivery, tapi harus **pindah ke workspace FORIOR** untuk membukanya.
- **FORIOR** (tim, bisa beberapa orang): menu dibagi dua kelompok besar: **Sosmed** dan **Project** (Photo Delivery, Photo Planner, Calendar, dll.).
- Halaman awal **hub.forior.id langsung form login**. Tidak ada yang bisa masuk tanpa izin.

## Kondisi kode sekarang (13 Nov 2026)
- Login: Supabase Auth, satu akun (Alvian). Pendaftaran publik masih terbuka di Supabase.
- Data sosmed: tabel `app_state` (key/value) **per user**, disalin ke `localStorage` dengan prefix `forior-os:` (tanpa pembeda workspace).
- Photo Delivery: tabel `galleries`, RLS **per owner (user)**.
- API key (Anthropic, Google, Meta): Supabase Vault **per user**, dipakai Edge Function `creator-api`.
- Pemilih workspace di sidebar ("Alvian · Personal Brand" / "FORIOR · Business") **hanya tampilan**, `useState` tanpa efek ke data atau menu.
- Halaman publik yang **harus tetap tanpa login**: galeri klien `/gallery/<slug>` (dan `?g=`), link share campaign `#share=`.

## 1. Alur awal yang diusulkan
1. Buka hub.forior.id → **belum login: tampil layar login penuh** (email + kata sandi, link email, lupa kata sandi). Tanpa tombol daftar.
2. Akun baru hanya lewat **undangan** dari owner/admin. Matikan "Allow new users to sign up" di Supabase.
3. Setelah login:
   - Anggota **1 workspace** → langsung masuk workspace itu.
   - Anggota **>1 workspace** (Alvian) → masuk workspace terakhir dipakai; pemilih workspace di sidebar hanya berisi workspace yang dia ikuti.
4. Pengecualian gerbang login: `/gallery/*`, `?g=`, `#share=`.

## 2. Pengelompokan fitur (usulan)

| Modul | Alvian (Personal Brand) | FORIOR (Business) |
|---|---|---|
| Dashboard | Ringkasan sosmed pribadi | Ringkasan bisnis: sosmed + project berjalan |
| **Sosmed** | | |
| Research & Insight | ✓ | ✓ |
| Content Plan | ✓ (akun pribadi) | ✓ (akun FORIOR, klien seperti Intragama?) |
| Production Studio | ✓ | ✓ |
| AI Agent Team | ✓ | ✓ |
| Analytics | ✓ | ✓ |
| Asset Library | ✓ (folder Drive pribadi) | ✓ (folder Drive FORIOR) |
| Inbox & Leads | DM personal | Leads klien → masuk kelompok Project |
| **Project** | — | |
| Photo Delivery | — (akses lewat switch ke FORIOR) | ✓ |
| Photo Planner | — | ✓ (pindahan dari app.forior.id) |
| Calendar (jadwal shoot) | — | ✓ |
| Clients / Projects / Quotation / Invoice | — | Tahap berikutnya, pindah satu per satu |
| Settings | Akun & AI pribadi | Workspace, anggota tim, peran, AI & biaya |

## 3. Model data (fondasi supaya tidak bentrok)
- Tabel `workspaces` (id, slug `alvian` / `forior`, nama, jenis).
- Tabel `workspace_members` (workspace_id, user_id, role: `owner` / `admin` / `editor` / `viewer`).
- Fungsi `is_member(workspace_id, min_role)` untuk semua RLS.
- Setiap data diberi `workspace_id`:
  - `app_state` → kunci menjadi (workspace_id, key), bukan per user.
  - `galleries` → `workspace_id` = FORIOR, RLS lewat keanggotaan (bukan owner).
  - Vault/API key → per workspace, supaya biaya AI FORIOR dan Alvian terpisah.
- `localStorage` diberi namespace per workspace: `forior-os:<workspace>:<key>`.
- Edge Function `creator-api` memeriksa keanggotaan + peran sebelum memakai key workspace.
- Edge Function `gallery` (publik) **tidak berubah**: tetap berbasis slug.

## 4. Risiko konflik dan penanganannya
1. **Data bercampur antar workspace** (paling berbahaya): store lokal dan cloud sync sekarang tidak tahu workspace. Wajib namespace + `workspace_id` sebelum menu dibedakan.
2. **Migrasi data lama**: campaign di Content Plan saat ini mencampur akun Alvian / FORIOR / Intragama Villa. Perlu keputusan campaign mana pindah ke workspace FORIOR.
3. **Galeri yang sudah ada** (owner = akun Alvian) dipindah ke workspace FORIOR dalam satu migrasi.
4. **Menyembunyikan menu bukan pengamanan.** Keamanan tetap di RLS/Edge Function; UI hanya menyesuaikan.
5. **Halaman klien ikut terkunci**: gerbang login harus mengecualikan `/gallery/*` dan `#share=`.
6. **Anggota tim melihat API key / biaya**: hanya owner/admin yang bisa mengubah key dan melihat biaya.
7. **Satu orang di dua workspace**: pastikan pindah workspace memuat ulang data yang benar (bukan sisa cache).
8. **app.forior.id masih berjalan** selama transisi: tidak menulis ke database Workspace lama.

## 5. Urutan pengerjaan yang disarankan
- **Tahap A: gerbang login** (kecil, bisa lebih dulu): layar login penuh, tanpa daftar, lupa kata sandi, pengecualian halaman publik; matikan sign-up di Supabase.
- **Tahap B: fondasi workspace**: tabel workspaces/members, RLS, `workspace_id`, namespace store, migrasi data lama.
- **Tahap C: menu per workspace**: sidebar dua kelompok untuk FORIOR, pemilih workspace yang nyata.
- **Tahap D: tim**: undang anggota lewat email, peran, kelola anggota di Settings.
- **Tahap E: modul Project**: Photo Planner, Calendar, Clients dipindah dari app.forior.id.

## 6. Pertanyaan yang perlu dijawab sebelum mulai
1. Campaign dengan akun FORIOR dan Intragama Villa: pindah ke workspace FORIOR?
2. API key AI: satu untuk semua, atau terpisah per workspace (biaya terpisah)?
3. Peran tim yang dibutuhkan: cukup Admin + Editor, atau perlu Viewer (mis. klien/freelancer)?
4. Dashboard FORIOR: lebih ke project (jadwal shoot, delivery berjalan) atau gabungan sosmed + project?
5. Tim FORIOR boleh melihat workspace Alvian? (usulan: tidak).
