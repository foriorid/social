# Share Penawaran (Quotation) — Desain

Tanggal: 2026-11-18 · Repo: `foriorid/social` · Branch: `claude/relaxed-meitner-qj6q8y`

> **Revisi 2 (2026-11-18, setelah spike PR-1).** Approach A — Vercel rewrite ke Supabase
> Edge Function yang menyajikan HTML — **terbukti tidak mungkin** dan sudah diganti
> approach E (§4). Buktinya ada di §4-A. Yang berubah hanya **pengirim dokumen HTML**;
> URL, hitungan buka, CSP bebas-script, preview WhatsApp, dan penyimpanan gambar di
> Storage semuanya tetap seperti rancangan semula.

## 1. Maksud dan alasannya

Hari ini penawaran FORIOR dikirim sebagai PDF lewat WhatsApp. Tiga akibatnya:
PDF mati (tidak bisa diklik, tidak bisa dibuka berjenjang), terlihat seperti lampiran
biasa, dan **pengirim tidak pernah tahu apakah klien membukanya.**

Alvian sudah membuat sendiri penawaran dalam bentuk HTML satu-file di luar sistem
(dibuat lewat ChatGPT karena butuh image generator). Dokumen itu bagus dan tidak
perlu diubah. Yang belum ada hanyalah **tempat menaruhnya dan link rapi untuk
mengirimkannya**, plus tanda apakah klien sudah membukanya.

Jadi fitur ini bukan pembuat penawaran. Ia **penampung dan pengantar**: upload file
HTML buatan sendiri, dapat link `hub.forior.id/quote/<slug>`, dan lihat berapa kali
klien membukanya.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Upload file HTML standalone dari dashboard, tentukan slug sendiri (`mytepro`).
2. Link publik tanpa login: `hub.forior.id/quote/mytepro`, status **HTTP 200**.
3. Dokumen tampil **persis** seperti aslinya — desain, font, layout, tanpa
   bersinggungan dengan CSS Hub.
4. Preview card WhatsApp muncul (judul, keterangan, gambar).
5. Di dashboard terlihat: sudah dibuka berapa kali dan kapan terakhir.
6. Buka cepat di kuota HP, bukan menunggu 5 MB.
7. Link yang sudah dikirim ke klien tetap hidup setelah migrasi domain ke
   `app.forior.id`.

**Non-goals** (bukan sekarang, bukan berarti tidak pernah)
- Membuat/mengedit isi penawaran di dalam Hub. File tetap dibuat di luar.
- Tombol "Setuju" untuk klien. Alvian sudah menimbang dan menolak: deal tetap
  ditutup lewat percakapan WhatsApp, tombol itu akan jadi hiasan.
- Tanda tangan digital, pembayaran, invoice.
- Mengubah Workspace lama di `app.forior.id` (repo terpisah, tidak boleh diubah).

**Anti-goals** (ini membuat fitur ini gagal walau "jalan")
- Hitungan "dibuka" yang ikut menghitung crawler. Kalau Alvian melihat
  "dibuka 1×" sedetik setelah link dikirim, angka itu kehilangan seluruh gunanya.
- Dokumen tampil berbeda dari file aslinya.
- Membahayakan sesi login Hub. Lihat §5.7 — ini risiko nyata, bukan teoretis.
- Mengubah model deploy aplikasi yang sudah live.

## 3. Batasan dari kondisi yang ada

| Batasan | Akibatnya pada desain |
|---|---|
| `next.config.ts` memakai `output: "export"` | **Dicabut di revisi 2.** Baris itu dibuang supaya Hub bisa menyajikan halaman sendiri (§4-E). Semua halaman lain `"use client"` dan tetap di-prerender. |
| Supabase tidak mau menyajikan HTML ter-render, di Functions maupun Storage | Dokumen HTML tidak boleh disajikan dari `*.supabase.co`. Gambar boleh, dan terbukti sempurna. |
| Link bersih yang ada sekarang (`/review/<token>`) balas **HTTP 404** | Jalan lewat `app/not-found.tsx` yang membaca pathname di browser. Isinya tampil, statusnya 404 → WhatsApp tidak bikin preview. Pola ini **tidak** dipakai di sini. |
| Supabase Storage belum dipakai sama sekali di repo | Bucket `quotes` adalah infrastruktur baru pertama di Storage. |
| `app.forior.id` masih milik project Vercel `forior` (Workspace lama) | Fitur ini live di `hub.forior.id` dulu. Migrasi domain menyusul, terpisah. |
| PR → `main` → auto-deploy, merge method "merge", tanpa force-push | Satu PR untuk fitur ini. |
| Test runner: `node --test app/lib/*.test.ts` | Logika murni ditaruh di `supabase/functions/quote/quote.ts` dan dites dari `app/lib/quote.test.ts`, mengikuti pola `review.ts`. |

## 4. Approaches yang ditimbang

### A. `vercel.json` rewrite → Supabase Edge Function — **TERBUKTI TIDAK MUNGKIN**

Rencana semula. Dibuktikan gagal di spike PR-1, di preview, tanpa menyentuh produksi.
Dicatat lengkap di sini supaya tidak ada yang mencobanya lagi.

Apa yang **berhasil** dan tetap berguna sebagai temuan:

- Rewrite Vercel benar-benar mencapai edge function: 200, `x-served-by: supabase-edge-runtime`
- Function berjalan **tanpa** header `apikey` maupun `Authorization`, persis seperti
  `ig-webhook` yang dipanggil Meta. Keraguan terbesar di review awal, terjawab.
- `cache-control: no-store` dan `x-vercel-cache: MISS` lolos utuh melalui proxy, jadi
  risiko caching yang bisa merusak hitungan buka memang tertangani.

Apa yang **mematikannya**, dua fakta platform yang bertumpuk:

1. **Gateway Supabase melumpuhkan respons HTML.** Function yang mengirim
   `text/html; charset=utf-8` kembali sebagai `content-type: text/plain` plus
   `content-security-policy: default-src 'none'; sandbox` yang disuntikkan Supabase.
   Dipastikan bukan gangguan proxy sesi, lewat dua kontrol: `functions/review`
   mengembalikan `application/json` utuh, dan `showcase.forior.id` mengembalikan
   `text/html` utuh. Ini proteksi anti-phishing Supabase.
2. **Vercel meneruskan header itu dan tidak memberi jalan menimpanya.** `headers` di
   `vercel.json` untuk `/quote/:path*` ternyata **tidak diterapkan sama sekali** pada
   path yang ditangani rewrite eksternal — dibuktikan dengan header canary
   `X-Probe-Override` yang tidak pernah muncul di respons.

Kenapa tidak bisa diakali: **browser menerapkan irisan dari semua header CSP.**
Menambahkan CSP yang longgar tidak pernah melonggarkan CSP yang ketat.

Varian "sajikan HTML dari Supabase Storage" juga diuji dan **gagal identik**:
`text/plain` + `default-src 'none'; sandbox`, walau `contentType` sudah disetel
eksplisit saat upload. Jadi ini kebijakan Supabase menyeluruh, bukan khusus Functions.

Yang **tidak** gagal, dan karena itu tetap dipakai: Storage menyajikan **gambar**
dengan sempurna — `content-type: image/jpeg`, tanpa CSP, `max-age=31536000`.

### E. Hub sendiri yang menyajikan halaman — **DIPILIH**

Lepas `output: "export"`, dan sajikan `/quote/<slug>` dari **route handler** Next
(`app/quote/[slug]/route.ts`) yang berjalan di server Vercel.

- ✅ URL persis seperti diminta, status **200**, preview WhatsApp jalan
- ✅ Header sepenuhnya milik kita: `Content-Type`, CSP, `no-store` — tidak ada gateway
  pihak lain yang ikut menyuntik
- ✅ Route handler membalas `Response` mentah, jadi dokumen HTML buatan Alvian keluar
  apa adanya tanpa perlu dibungkus komponen React (masalah dokumen bersarang hilang)
- ✅ Hitungan buka tetap dari sisi server
- ✅ Nol project baru, nol layanan baru, nol dependency baru
- ⚠️ Mengubah mode hosting seluruh Hub. Peredamnya: semua halaman Hub adalah
  `"use client"`, jadi Next tetap mem-prerender-nya seperti sekarang; hanya
  `/quote/[slug]` yang dinamis.
- ⚠️ Workflow GitHub Pages berhenti bisa bekerja, karena Pages memang butuh
  `output: "export"`. Penanganannya di §5.10.

Kenapa bukan B (halaman statis + iframe): statusnya 404, jadi preview WhatsApp mati —
gagal di goal yang justru jadi alasan fitur ini dipilih.
Kenapa bukan project Vercel kedua atau subdomain sendiri: dua-duanya memberi hasil yang
sama bagi klien, tapi menambah infrastruktur permanen. Alvian memilih Hub sendiri
setelah diberi tahu risikonya, dua kali.

### B. Halaman statis + iframe

Meniru `/review/<token>`: halaman Next baca slug dari pathname, tampilkan iframe.

- ✅ Nol konfigurasi baru, persis pola yang sudah jalan
- ❌ Status **404** → tidak ada preview WhatsApp (Goal 4 gagal)
- ❌ Hitungan bergantung JS browser klien, bisa luput (Goal 5 rapuh)
- ❌ Iframe dokumen full-page punya masalah scroll di mobile

Ditolak: lebih "aman" karena tanpa mekanisme baru, tapi gagal di dua goal yang
justru jadi alasan fitur ini dipilih. Aman tapi tidak menjawab kebutuhan = kerja dua kali.

### C. Commit tiap HTML ke `public/`

Ada presedennya: `public/photo-planner.html` (97 KB) disajikan di `hub.forior.id/photo-planner.html`.

- ✅ Status 200, nol infrastruktur
- ❌ Tidak ada cara menghitung yang membuka sama sekali (Goal 5 mustahil)
- ❌ 5,3 MB per penawaran masuk git selamanya
- ❌ Tiap penawaran baru butuh PR + deploy; bukan "upload dari dashboard" (Goal 1 gagal)

Ditolak: gagal di goal utama.

### D. Buang `output: "export"` — ditolak di revisi 1, **menjadi E di revisi 2**

Di revisi 1 ini ditolak: "mengubah model deploy seluruh aplikasi tepat sebelum migrasi
domain, tidak sebanding risikonya." Penilaian itu benar **selama approach A masih ada**.
Begitu A terbukti mustahil, pembandingnya hilang dan ongkos-manfaatnya berubah: sekarang
pilihannya bukan "A yang murah vs D yang berisiko", tapi "D, atau menambah project
permanen". Lihat E.

## 5. Desain

### 5.1 Routing

Tidak ada `vercel.json`, tidak ada rewrite. Halaman disajikan route handler Next:

```
app/quote/[slug]/route.ts        ->  GET /quote/<slug>/
```

`next.config.ts` kehilangan satu baris, `output: "export"`. `trailingSlash: true`
dipertahankan, jadi `/quote/mytepro` dipantulkan 308 ke `/quote/mytepro/` seperti
seluruh aplikasi, dan tombol salin link tetap menghasilkan bentuk bergaris-miring
supaya tidak ada lompatan.

**Yang tidak rusak karena perubahan ini, dan alasannya.** `/review/<token>` dan
`/gallery/<slug>` hari ini bekerja lewat `app/not-found.tsx` yang membaca pathname di
browser. Next tetap merender boundary `not-found` untuk path yang tidak dikenal saat
dirender di server, dan `not-found.tsx` tetap `"use client"`, jadi mekanismenya utuh —
status tetap 404, isinya tetap tampil. Tidak ada link klien yang mati. **Ini wajib
diverifikasi, bukan diasumsikan** (§5.11).

**Function tidak lagi menyajikan HTML.** Ia jadi API JSON (§5.4). JSON dari Supabase
memang lolos utuh sebagai `application/json` — itu salah satu kontrol yang dipakai
untuk memastikan pelumpuhan HTML tadi nyata.

### 5.2 Penyimpanan

- **HTML** (±37 KB setelah gambar dipisah) → kolom `text` di Postgres. Satu
  round-trip, tanpa mampir Storage.
- **Gambar** (±4,1 MB, 7 file) → Supabase Storage, bucket publik `quotes`,
  path `<workspace_id>/<slug>/<upload_id>/<n>.<ext>`.
- **Gambar OG** → `<workspace_id>/<slug>/<upload_id>/og.jpg`, downscale 1200 px.

**`<upload_id>` itu penting, bukan hiasan.** Gambar di-cache CDN dengan
`immutable, max-age=31536000` (§5.6). Kalau "ganti file" menulis ke path yang sama,
klien bisa terus melihat gambar lama dari cache selama berbulan-bulan. Segmen
`<upload_id>` (timestamp atau uuid pendek per upload) membuat setiap upload punya
URL sendiri, jadi penggantian file selalu benar-benar terlihat.

**Bucket dibuat lewat migrasi, bukan dashboard**, supaya ikut terversi di git:

```sql
insert into storage.buckets (id, name, public) values ('quotes', 'quotes', true)
  on conflict (id) do nothing;

-- Tulis/hapus: hanya Owner/Admin workspace yang memiliki folder itu.
-- Folder paling luar = workspace_id, jadi dicocokkan lewat (storage.foldername(name))[1].
create policy "quotes: admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'quotes'
    and (select public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'admin')));
-- idem untuk update dan delete
```

Ini perlu ditulis eksplisit karena `20261111094000_creator_os_harden_grants.sql`
sudah mencabut privilege default — tidak ada yang permisif karena kecelakaan. Tanpa
policy insert, seluruh pipeline upload di §5.5 gagal di langkah 4.

**Umur gambar saat revoke / hapus / ganti.** `revoked` mematikan HTML seketika, dan
**harga ada di HTML**, bukan di gambar. Jadi gambar yang masih tersisa di cache tidak
membocorkan apa pun yang komersial — paling banter foto show unit. "Hapus" membuang
folder `<workspace_id>/<slug>/` seluruhnya; yang sudah di cache CDN tetap bisa diakses
sampai kedaluwarsa, dan itu diterima. Kalau nanti gambar harus benar-benar mati
bersama penawaran, bucket publik adalah model yang salah dan §5.2/§5.6 harus dirombak
ke signed URL — konsekuensinya caching `immutable` hilang.

### 5.3 Skema database

Migrasi baru `supabase/migrations/20261118xxxxxx_quotes.sql`:

```sql
create table public.quotes (
  slug text primary key
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and position('--' in slug) = 0),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  client_name text check (length(client_name) <= 120),
  -- "Option 1" / "Option 2": satu klien bisa menerima beberapa opsi sekaligus.
  option_label text check (length(option_label) <= 40),
  html text not null check (length(html) <= 2000000),
  og_title text, og_description text, og_image text,
  revoked boolean not null default false,
  opens integer not null default 0,
  last_opened_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_opens (
  id bigserial primary key,
  slug text not null references public.quotes (slug) on delete cascade,
  at timestamptz not null default now(),
  ua text, referer text
);
create index quote_opens_slug_at on public.quote_opens (slug, at desc);
create index quotes_ws_client on public.quotes (workspace_id, lower(client_name));
```

**Beberapa opsi per klien tidak butuh tabel baru.** Pengelompokan dilakukan di UI
lewat `lower(client_name)`; `option_label` memberi namanya. Tabel `quote_groups`
tersendiri hanya akan menambah satu join dan satu layar form untuk sesuatu yang
sudah bisa dijawab satu kolom.

**Catatan slug:** pola `review_links` yang ada (`{6,88}`, minimal 8 karakter) akan
**menolak** `mytepro` yang cuma 7 karakter. Karena itu pola di sini 3–63 karakter.

RLS mengikuti pola `client_review.sql`, tapi satu tingkat lebih ketat karena isinya
harga:

- `select` → `has_workspace_role(workspace_id, 'admin')`
- `insert`/`update`/`delete` → `has_workspace_role(workspace_id, 'admin')`
- `revoke all ... from anon`
- `quote_opens`: tidak ada policy untuk `authenticated` selain select admin. Penulisan
  baris open dilakukan function lewat `SUPABASE_DB_URL` (bypass RLS), seperti `review`.

### 5.4 Dua bagian: route handler Next + API JSON

**`app/quote/[slug]/route.ts`** — yang dilihat klien.

1. `isSlug(slug)` gagal → 404 halaman "Penawaran tidak ditemukan".
2. Minta data ke function (di bawah), kirimkan User-Agent asli dan apakah ini kunjungan
   yang boleh dihitung: tidak dihitung bila `isCrawler(ua)` atau URL punya `preview=1`.
3. Tidak ada baris / `revoked` → 404.
4. Balas `injectMeta(html, meta)` dengan seluruh header di §5.6 dan §5.7. `og:url`
   dibangun dari header `Host`/`X-Forwarded-Host`, bukan konstanta, supaya ikut benar
   sendiri setelah migrasi domain (§5.9).

Hanya `GET` dan `HEAD`; sisanya 405.

**`supabase/functions/quote/index.ts`** — API JSON, bukan halaman.

`POST { slug, count, ua, referer }` → `{ html, title, ogTitle, ogDescription, ogImage }`
atau 404. Bila `count` benar, ia menaikkan `opens`, menyetel `last_opened_at`, dan
menulis satu baris `quote_opens`. Pencatatan tidak boleh menggagalkan respons.

**Function ini publik, dan itu disengaja.** Ide "secret bersama" dari draf revisi 2
dibatalkan: alat yang menyimpan secret Supabase memang tidak pernah memberikan nilainya
ke saya, jadi menaruh nilai yang sama di Vercel berarti Alvian harus menyetel dua
dashboard secara manual dan memastikan keduanya cocok.

Yang hilang karenanya cuma **keakuratan angka**, bukan kerahasiaan data: HTML penawaran
sudah bisa dibaca siapa pun yang punya linknya, dan `functions/review` yang sudah live
melakukan hal yang sama — menyajikan seluruh snapshot konten klien dari function publik
tanpa autentikasi. Jadi ini sejalan dengan model yang sudah berjalan, bukan pelemahan.

Yang benar-benar menentukan keterpaparan adalah **seberapa mudah slug ditebak**, dan itu
dipegang Alvian sendiri per penawaran lewat tombol "+ akhiran acak" (§8.1). Secret tidak
akan mengubah hal itu.

Pola klien `postgres` dan bentuk error mengikuti `supabase/functions/review/index.ts`.

### 5.5 Pipeline upload (di browser, saat upload)

Semua pemrosesan di browser; file 5,3 MB tidak pernah dikirim utuh ke server.

1. Pilih file `.html` (tolak > 15 MB), isi slug + nama klien (opsional).
2. `DOMParser` → dokumen.
3. Kumpulkan `img[src^="data:image/"]`, **dan** `url(data:image/…)` di dalam
   `<style>`/atribut `style` (file contoh hanya punya yang pertama, tapi tangani
   keduanya supaya file berikutnya tidak diam-diam gagal).
4. Tiap data URI → `Blob` → upload ke Storage → `src` ditulis ulang ke URL publik.
5. Gambar pertama → canvas downscale maks 1200 px, kualitas ~0.8 → `og.jpg`.
   Presedennya sudah ada: `app/brandkit.tsx` sudah melakukan resize lewat canvas.
6. `<title>` dokumen dipakai sebagai default `title` dan `og_title`. File contoh
   sudah berisi `FORIOR — Quotation Option 1 | Sentul MytePro`, jadi Alvian tidak
   perlu mengisi apa pun.
7. Serialisasi dokumen kembali ke string → `upsert` ke `public.quotes`.

**Kenapa gambar dipisah, bukan sekadar "biar kecil":** file itu sudah menulis
`loading="lazy"` di 6 dari 7 gambar, tapi itu nol efek selama gambarnya base64 di
dalam dokumen — browser tidak bisa menunda sesuatu yang sudah ikut terunduh.
Memisahkan gambar justru **menghidupkan** lazy-loading yang sudah ditulis di sana.

Mengganti file penawaran yang sudah dikirim: slug dan riwayat `opens` dipertahankan,
HTML dan gambar ditimpa.

### 5.6 Caching

- **HTML**: `Cache-Control: no-store`, disetel langsung oleh route handler. Hanya 37 KB,
  dan tiap kunjungan harus benar-benar mencapai server supaya terhitung.
- **Gambar**: dari Storage CDN, `cache-control: public, max-age=31536000` — sudah
  diverifikasi apa adanya pada respons Storage yang sebenarnya.

Jadi dua-duanya didapat: hitungan akurat *dan* buka cepat. Ini hasil dari memisahkan
gambar — tanpa itu, `no-store` berarti mengunduh 5 MB setiap kali.

Seluruh urusan `x-vercel-enable-rewrite-caching` dan caching rewrite eksternal dari
revisi 1 **tidak berlaku lagi**: tidak ada rewrite eksternal. Route handler Next bukan
rute yang di-cache CDN kecuali kita menyuruhnya, dan kita menyuruh sebaliknya.

### 5.7 Keamanan: ini bagian yang paling penting

HTML penawaran disajikan di `hub.forior.id/quote/*` — **origin yang sama** dengan
aplikasi Hub. Di origin itu ada `localStorage` berisi sesi Supabase dan seluruh state
Hub. File HTML yang dibuat lewat LLM di luar sistem, kalau mengandung script, bisa
membaca semua itu.

Mitigasinya murah dan nyaris tanpa biaya desain, karena file penawaran murni HTML+CSS:

```
Content-Security-Policy: default-src 'none'; img-src https: data:;
  style-src 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com; connect-src 'none';
  form-action 'none'; frame-ancestors 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow
```

`script-src` tidak ada → tidak ada JS yang jalan → sesi Hub tidak bisa disentuh,
apa pun isi filenya.

**Di revisi 2 CSP ini benar-benar bisa dipasang, dan itu bukan hal kecil.** Di revisi 1
ia mustahil: Supabase menyuntikkan `default-src 'none'; sandbox` sendiri dan browser
menerapkan irisan semua CSP, jadi halaman penawaran justru tidak akan tampil apa pun.
Sekarang route handler Next memiliki responsnya sepenuhnya, jadi CSP di atas adalah
satu-satunya yang berlaku.

**Allowlist CSP ini sudah diaudit terhadap file aslinya, bukan dikira-kira.**
File contoh ada di luar repo (dilampirkan Alvian di sesi ini, bukan di `public/`).
Hasil audit:

- Seluruh `<use href="…">` menunjuk fragment internal (`#i-film`, `#i-camera`, …) —
  sprite SVG inline, nol permintaan jaringan. Ini risiko CSP yang paling mudah
  terlewat, dan hasilnya bersih.
- Subresource eksternal **hanya** `fonts.googleapis.com` dan `fonts.gstatic.com`.
- Tidak ada `@import`, tidak ada `url(https://…)` di CSS.
- `wa.me` dan `www.forior.id` hanya `href` navigasi, bukan subresource — tidak
  tersentuh CSP ini.

Artinya CSP di atas tepat untuk file ini. **Tapi ia sempit dan spesifik-file:** kalau
penawaran berikutnya menarik stylesheet, icon font, atau gambar dari host lain,
dokumen tampil rusak dan **browser tidak memberi tahu siapa pun**. Karena itu
pipeline upload (§5.5) harus memindai host subresource saat upload dan
**memperingatkan di dashboard** kalau menemukan host di luar allowlist — gagal
dengan berisik, bukan diam-diam.

Yang hilang: atribut `onerror="this.remove()"` di file contoh tidak akan jalan
(efeknya hanya menyembunyikan gambar gagal — tidak penting). Link `wa.me`, hover,
dan seluruh tampilan tetap utuh.

**Konsekuensi yang perlu disadari:** kalau suatu hari penawaran ingin benar-benar
interaktif (kalkulator harga, form), script akan terblokir dan CSP ini harus diubah
secara sadar — dan saat itu masalah origin di atas kembali. Jalan keluarnya nanti:
sajikan dari subdomain terpisah, bukan melonggarkan CSP di origin Hub.

### 5.8 UI dashboard

Item nav baru di grup `PROJECT` (hanya workspace `business`, karena penawaran adalah
pekerjaan proyek — workspace personal brand tidak punya penawaran):

```ts
{ label: "PROJECT", items: [
  { name: "Photo Delivery", … }, { name: "Photo Planner", … },
  { name: "Penawaran", icon: FileText },   // baru
  { name: "Calendar", … }, { name: "Inbox & Leads", … } ] }
```

`app/quote.tsx` (`QuotePage`), di-dispatch dari `app/page.tsx` seperti modul lain:

- Daftar penawaran: judul, nama klien, slug, tanggal
- **"Dibuka 3× · terakhir Sel 14:20"**, atau "Belum dibuka" kalau `opens = 0`
- Tombol salin link, buka di tab baru
- Form upload: file, slug, nama klien, label opsi ("Option 1"), keterangan OG
- **Kolom slug bebas diisi**, dengan tombol **"+ akhiran acak"** di sebelahnya yang
  menambahkan 4 karakter acak (`mytepro` → `mytepro-k7m2`). Tidak otomatis: Alvian
  memutuskan per penawaran. Di bawahnya satu baris penjelasan singkat kenapa akhiran
  itu ada, supaya pilihannya sadar dan bukan tebak-tebakan
- **Dikelompokkan per klien.** Satu klien dengan beberapa opsi tampil sebagai satu
  blok, opsi-opsinya berjajar di dalamnya dengan angka "dibuka" masing-masing
  **berdampingan** — jadi terlihat opsi mana yang paling sering dilihat klien. Ini
  justru nilai utama dari hitungan buka saat ada beberapa opsi: bukan sekadar
  "sudah dibaca", tapi "yang mana yang dia timbang"
- Ganti file (slug tetap), nonaktifkan (`revoked`), hapus
- Dipakai kembali: kelas `.module-page`, `.panel`, `.primary-button`

**Link dibangun dari `window.location.origin`**, bukan domain hardcode. Jadi setelah
migrasi ke `app.forior.id`, tombol salin otomatis menghasilkan link domain baru tanpa
satu baris kode pun berubah.

### 5.9 Umur link setelah migrasi domain

Link yang dikirim hari ini berbentuk `hub.forior.id/quote/<slug>/`.

**Dari mana klaim ini berasal, supaya tidak dianggap sudah pasti:** rencana migrasi
yang menahan domain `hub` dan menjadikannya redirect 308 dengan path terbawa
dinyatakan **Alvian langsung di sesi ini**. Ia **tidak** ada di
`docs/rencana-major-update-workspace.md` — satu-satunya dokumen migrasi di repo, yang
isinya login gating dan pemindahan modul Tahap C–E, tanpa sepatah pun soal retensi
domain. Dokumen repo itu sudah tertinggal dan sebaiknya diperbarui saat migrasi
dikerjakan.

Konsekuensinya kalau retensi itu nanti **tidak** terjadi: setiap link penawaran yang
sudah dikirim ke klien mati saat migrasi. Itu keputusan murah hari ini dan mahal
nanti — karena itu ia jadi salah satu pertanyaan terbuka di §8.

Satu hal yang harus diingat saat migrasi nanti: `vercel.json` **tidak perlu diubah**
(rewrite-nya relatif terhadap domain apa pun yang menempel di project), tapi
`og:url` yang disisipkan function sebaiknya dibangun dari header `Host`/
`X-Forwarded-Host` permintaan, bukan konstanta — supaya ikut benar sendiri.

### 5.10 GitHub Pages: tidak bisa lagi, dan harus ditangani

`.github/workflows/deploy.yml` menjalankan `npm run build` lalu mengunggah `./out`.
Direktori `out/` **hanya ada** kalau `output: "export"` aktif. Begitu baris itu dibuang
(§4-E), workflow ini **gagal di setiap push ke `main`**.

Alvian menjawab "belum yakin" soal apakah Pages masih dipakai (§8), jadi menghapusnya
bukan keputusan saya. Yang diambil: **pemicu `push` dibuang, `workflow_dispatch`
dipertahankan.** Hasilnya workflow tidak pernah gagal sendiri, tidak ada deploy diam-diam
ke tempat yang tidak dipantau, dan tidak ada yang hilang — kalau suatu saat Pages
dibutuhkan lagi, keputusannya masih utuh di repo untuk dibahas, bukan sudah terhapus.

Dengan Pages tidak lagi auto-deploy, penanganan "sembunyikan tombol salin link di
`*.github.io`" dari revisi 1 **tetap dipasang**. Alasannya tidak berubah: `window.location.origin`
adalah yang membuat migrasi domain gratis, dan di host tanpa route handler ia akan
menyerahkan link mati. Gagal terlihat lebih murah daripada link mati di WhatsApp klien.

### 5.11 Test

Di `supabase/functions/quote/quote.ts` (logika murni, tanpa Deno API):
`isSlug`, `isCrawler`, `injectMeta`, `planDataUris` (perencana ekstraksi base64:
terima daftar data URI, hasilkan nama file + penulisan ulang src).

`app/lib/quote.test.ts` meng-import dari `../../supabase/functions/quote/quote.ts`,
persis pola `app/lib/review.test.ts`. Kasus yang wajib ada:
`mytepro` lolos, `my` ditolak, `My-Tepro` ditolak, `a--b` ditolak, UA WhatsApp
dikenali crawler, UA Chrome Android tidak, `injectMeta` meng-escape `"` dan `<`,
`injectMeta` pada HTML tanpa `</head>` tidak merusak dokumen.

**Satu verifikasi manual yang wajib, dan tidak boleh diasumsikan:** setelah
`output: "export"` dibuang, buka link review dan galeri yang sudah ada
(`/review/<token>`, `/gallery/<slug>`) dan pastikan keduanya masih menampilkan isinya
lewat `app/not-found.tsx`. Mekanisme itu bergantung pada Next merender boundary
`not-found` untuk path tak dikenal; kalau ternyata berubah, link yang sudah dikirim ke
klien mati, dan itu kerusakan yang jauh lebih mahal daripada fitur ini.

## 6. Keputusan yang saya ambil sendiri

Ditandai supaya mudah dibantah:

1. **HTML di Postgres, gambar di Storage.** Awalnya saya sempat bilang file disimpan
   di Storage dengan alasan 5 MB per baris. Begitu gambar dipisah, markup tinggal
   37 KB dan alasan itu gugur.
2. **Hanya Owner/Admin** yang bisa membuat, mengganti, menonaktifkan, dan **melihat**
   daftar penawaran. Isinya harga komersial.
3. **Setiap GET non-crawler dihitung**, termasuk reload klien yang sama. Tidak ada
   dedupe per IP — IP tidak disimpan sama sekali (privasi). Klien membuka ulang 5×
   dalam dua hari itu justru informasi yang berguna, bukan noise.
4. **Pola slug 3–63 karakter**, bukan `{6,88}` milik `review_links`, supaya
   `mytepro` lolos.
5. **CSP tanpa `script-src`** (§5.7). Keamanan menang atas kemungkinan interaktif
   di masa depan; jalan keluar masa depan sudah dicatat.
6. **Gambar OG dibuat di browser** lewat canvas, maks 1200 px. WhatsApp sering
   melewatkan thumbnail yang terlalu besar, dan gambar asli di file contoh rata-rata
   ±590 KB.
7. **Nav "Penawaran" hanya di workspace business.**
8. **`quote_opens` disimpan tanpa batas umur** untuk sekarang. Volumenya kecil; kalau
   nanti membengkak, tambahkan pembersihan.

9. **Dua PR, bukan satu** (§5.1). Preview di balik SSO memaksa verifikasi routing
   dilakukan di produksi, jadi spike-nya diisolasi supaya bisa dibuang utuh.
10. **Segmen `<upload_id>` di path gambar** (§5.2), supaya "ganti file" tidak pernah
    menyajikan gambar lama dari cache CDN.
11. **Bucket dan policy-nya dibuat lewat migrasi**, bukan klik dashboard, supaya
    terversi di git.
12. **Gambar boleh hidup lebih lama dari penawaran** (§5.2). Harga ada di HTML; gambar
    tidak membocorkan yang komersial. Ini pertukaran sadar demi caching `immutable`.
13. **`?preview=1` menekan pencatatan** (§5.4), supaya Alvian memeriksa link sendiri
    tanpa mengotori angkanya.
14. **Pipeline upload memperingatkan** kalau menemukan host subresource di luar
    allowlist CSP (§5.7) — gagal berisik.
15. **Modul menyembunyikan tombol salin link di `*.github.io`** (§5.10).
16. **Beberapa opsi per klien tanpa tabel baru** (§5.3): dikelompokkan lewat
    `lower(client_name)` + kolom `option_label`. Tabel tersendiri hanya menambah join
    dan satu layar form untuk sesuatu yang bisa dijawab satu kolom.
17. **Tombol "+ akhiran acak" tidak otomatis** (§5.8). Alvian memilih bebas per
    penawaran, jadi memaksakan akhiran akan melawan jawabannya — tapi penjelasan satu
    baris tetap ditampilkan supaya pilihannya sadar.

## 7. Yang diserahkan ke pembangun

- CSS detail daftar penawaran dan form upload
- Kata-kata persis pesan error dan halaman 404 penawaran
- Apakah daftar riwayat buka perlu paginasi (volumenya kecil, kemungkinan tidak)
- Nama file migrasi (timestamp) dan urutan commit di dalam PR

## 8. Pertanyaan yang sudah dijawab Alvian

Ketiganya dijawab pada 2026-11-18, sebelum implementasi dimulai.

1. **Bentuk slug → bebas pilih per penawaran.** Kolom slug bebas diisi, plus tombol
   "+ akhiran acak" yang tidak otomatis. Alvian menilai sendiri per kasus: klien lama
   boleh slug bersih, penawaran sensitif pakai akhiran. Lihat §5.8.
2. **Beberapa opsi per klien → ya.** "Option 1/2/3" memang dikirim ke klien yang sama.
   Berakibat pada §5.3 (kolom `option_label`, index pengelompokan) dan §5.8 (daftar
   dikelompokkan per klien, angka buka berdampingan antar opsi).
3. **GitHub Pages → belum yakin, biarkan.** Workflow tetap, penanganan aman dipasang.
   Lihat §5.10.
