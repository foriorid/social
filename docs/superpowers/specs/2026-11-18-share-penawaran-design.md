# Share Penawaran (Quotation) — Desain

Tanggal: 2026-11-18 · Repo: `foriorid/social` · Branch: `claude/relaxed-meitner-qj6q8y`

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
| `next.config.ts` memakai `output: "export"` | Tidak ada API route, tidak ada SSR. Rewrite **harus** di `vercel.json`; rewrite di `next.config.ts` hilang saat static export. |
| Link bersih yang ada sekarang (`/review/<token>`) balas **HTTP 404** | Jalan lewat `app/not-found.tsx` yang membaca pathname di browser. Isinya tampil, statusnya 404 → WhatsApp tidak bikin preview. Pola ini **tidak** dipakai di sini. |
| Supabase Storage belum dipakai sama sekali di repo | Bucket `quotes` adalah infrastruktur baru pertama di Storage. |
| `app.forior.id` masih milik project Vercel `forior` (Workspace lama) | Fitur ini live di `hub.forior.id` dulu. Migrasi domain menyusul, terpisah. |
| PR → `main` → auto-deploy, merge method "merge", tanpa force-push | Satu PR untuk fitur ini. |
| Test runner: `node --test app/lib/*.test.ts` | Logika murni ditaruh di `supabase/functions/quote/quote.ts` dan dites dari `app/lib/quote.test.ts`, mengikuti pola `review.ts`. |

## 4. Approaches yang ditimbang

### A. `vercel.json` rewrite → Supabase Edge Function `quote` — **DIPILIH**

Vercel mem-proxy `/quote/:slug` ke edge function. Function ambil HTML dari Postgres,
sisipkan tag OG, catat kunjungan, balas `text/html` 200.

- ✅ URL persis seperti yang diminta, status 200, preview WhatsApp jalan
- ✅ Hitungan dari sisi server — tidak bergantung JS di browser klien
- ✅ Dokumen di luar React app, nol bentrokan CSS
- ✅ Risiko terkurung: satu file config baru, satu function baru, tabel baru. Nol
  perubahan pada route/function/tabel yang sudah jalan
- ⚠️ Satu mekanisme baru (rewrite ke host eksternal) yang belum pernah dipakai repo ini

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

### D. Buang `output: "export"`, pindah ke Next server-rendered

`app/quote/[slug]/page.tsx` dengan metadata API. Paling rapi secara teknis.

- ❌ Mengubah model deploy **seluruh** aplikasi yang sudah live, tepat sebelum
  migrasi domain. `next.config.ts` masih punya jalur basePath GitHub Pages yang
  ikut terdampak. Risiko menyebar ke semua fitur demi satu fitur baru.

Ditolak: tidak sebanding risikonya.

## 5. Desain

### 5.1 Routing

`vercel.json` baru di root:

```json
{
  "rewrites": [
    { "source": "/quote/:slug",  "destination": "https://ojfezodyjvlzexxqbgak.supabase.co/functions/v1/quote/:slug" },
    { "source": "/quote/:slug/", "destination": "https://ojfezodyjvlzexxqbgak.supabase.co/functions/v1/quote/:slug" }
  ]
}
```

Project ref Supabase itu nilai publik (sudah ada di `app/lib/cloud.ts`), bukan secret.

**Redirect menang atas rewrite — sudah dipastikan, bukan dugaan.** Dokumentasi Vercel
menyebut eksplisit: *"Redirects are always processed before rewrites."* Jadi dengan
`trailingSlash: true`, `/quote/mytepro` dipantulkan 308 ke `/quote/mytepro/` lebih
dulu, baru rewrite dipertimbangkan. Dua pola source di atas menangani keduanya, dan
**tombol salin link menghasilkan URL dengan garis miring** (`…/quote/mytepro/`)
supaya tidak ada lompatan 308 sama sekali.

**Function tidak butuh header `apikey` — sudah dipastikan dari repo ini.** Rewrite
Vercel tidak mengirim `apikey`, sementara semua function publik yang ada dipanggil
lewat `supabase.functions.invoke` yang menyertakannya. Yang menyelesaikan keraguan ini
adalah `supabase/functions/ig-webhook/index.ts`: komentarnya sendiri menyatakan
*"Public (verify_jwt off): Meta calls it."* Server Meta jelas tidak mengirim apikey
Supabase. Jadi function dengan `verify_jwt` off memang bisa dipanggil tanpa header
auth apa pun. Risiko paling mahal dari approach A gugur di sini.

#### Urutan kerja: dua PR, bukan satu

`ssoProtection` project ini **aktif** dengan cakupan `all_except_custom_domains`.
Artinya seluruh URL `*.vercel.app`, preview termasuk, ada di balik login Vercel —
dan crawler WhatsApp tidak akan pernah bisa menjangkaunya. Gate verifikasi tidak bisa
dijalankan di preview. Satu-satunya permukaan publik adalah `hub.forior.id`, yaitu
produksi.

Karena itu pekerjaan dipecah dua:

**PR-1 — spike routing (kecil, bisa dibuang).** Isinya hanya `vercel.json`, edge
function `quote` versi minimal (balas HTML tetap, tanpa database), dan tidak ada yang
lain. Lalu uji di produksi: `hub.forior.id/quote/__probe/` dan `…/quote/__probe`
(tanpa garis miring), plus cek header responsnya tidak di-cache.

Kenapa aman dilakukan di produksi: `/quote/*` **hari ini 404**. PR-1 tidak menyentuh
satu pun route, function, atau tabel yang sudah jalan. Kalau rewrite-nya ternyata
tidak jalan, revert satu PR kecil dan belum ada apa pun yang dibangun di atasnya.

**PR-2 — fitur sebenarnya.** Migrasi, bucket, pipeline upload, UI, hitungan buka.
Baru dikerjakan setelah PR-1 terbukti.

Kalau PR-1 gagal, jangan diam-diam pindah ke approach B. Pilihan berikutnya, berurutan:
`/q/:slug` (menghindari kemungkinan bentrok nama), lalu Vercel route config, lalu
subdomain terpisah `quote.forior.id` yang menunjuk langsung ke function.

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
```

**Catatan slug:** pola `review_links` yang ada (`{6,88}`, minimal 8 karakter) akan
**menolak** `mytepro` yang cuma 7 karakter. Karena itu pola di sini 3–63 karakter.

RLS mengikuti pola `client_review.sql`, tapi satu tingkat lebih ketat karena isinya
harga:

- `select` → `has_workspace_role(workspace_id, 'admin')`
- `insert`/`update`/`delete` → `has_workspace_role(workspace_id, 'admin')`
- `revoke all ... from anon`
- `quote_opens`: tidak ada policy untuk `authenticated` selain select admin. Penulisan
  baris open dilakukan function lewat `SUPABASE_DB_URL` (bypass RLS), seperti `review`.

### 5.4 Edge Function `quote`

`supabase/functions/quote/index.ts`, `verify_jwt` **off** (publik, seperti `review`).
Logika murni dipisah ke `supabase/functions/quote/quote.ts` agar bisa dites.

Alur `GET /quote/<slug>`:

1. Ambil slug dari pathname. Kalau pola salah → 404 halaman "Penawaran tidak ditemukan".
2. `select` baris `where slug = $1 and not revoked`. Tidak ada → 404.
3. `isCrawler(ua)`? Kalau **bukan** crawler: `update quotes set opens = opens + 1,
   last_opened_at = now()` + `insert into quote_opens`. Crawler tetap dilayani
   penuh (justru mereka yang butuh tag OG), hanya tidak dihitung.
4. `injectMeta(html, meta)` menyisipkan sebelum `</head>`.
5. Balas 200 `text/html; charset=utf-8` dengan header di §5.6 dan §5.7.

Hanya `GET` dan `HEAD` dilayani; method lain → 405.

**Kunjungan Alvian sendiri tidak dihitung.** §5.8 menaruh tombol "buka di tab baru"
persis di sebelah angkanya, jadi tanpa ini anti-goal #1 masuk lewat pintu lain:
memeriksa link sendiri akan menaikkan hitungan. Route ini tanpa login, jadi tidak ada
cara murah mengenali dia nanti. Solusinya: tombol di dashboard menambahkan
`?preview=1`, dan function menghormatinya dengan **tidak** mencatat kunjungan.

Siapa pun bisa menambahkan parameter itu sendiri, dan itu tidak masalah — efeknya
hanya menekan pencatatan, tidak membuka data apa pun. Yang perlu dihindari justru
sebaliknya (hitungan naik tanpa klien benar-benar membuka), dan itu tertutup.

**`isCrawler(ua)`** cocokkan (case-insensitive): `whatsapp`, `facebookexternalhit`,
`facebookcatalog`, `twitterbot`, `telegrambot`, `slackbot`, `linkedinbot`,
`discordbot`, `googlebot`, `bingbot`, `applebot`, `skypeuripreview`, `embedly`,
`quora link preview`, `vkshare`, `redditbot`, `pinterest`, lalu fallback umum
`bot|crawler|spider|preview|fetcher`. UA kosong juga dianggap crawler.

**`injectMeta`** menyisipkan:

```html
<meta property="og:type" content="website">
<meta property="og:title" content="…">
<meta property="og:description" content="…">
<meta property="og:image" content="https://…/og.jpg">
<meta property="og:url" content="https://hub.forior.id/quote/…">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex, nofollow">
```

Nilai di-escape untuk atribut HTML. `og:image` **wajib URL absolut** — WhatsApp
mengabaikan path relatif.

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

- **HTML**: `Cache-Control: no-store`. Hanya 37 KB, dan tiap kunjungan harus
  benar-benar sampai ke function supaya terhitung.
- **Gambar**: dari Storage CDN dengan `cache-control: public, max-age=31536000, immutable`.

Jadi dua-duanya didapat: hitungan akurat *dan* buka cepat. Ini justru hasil dari
memisahkan gambar — tanpa itu, no-store berarti mengunduh 5 MB setiap kali.

**Header `no-store` di sini menyangga seluruh fitur hitungan, bukan penghalusan.**
Project ini dibuat ~11 November 2026, jadi ia memakai perilaku Vercel yang baru:
**rewrite ke host eksternal di-cache secara default**, menghormati `cache-control`
upstream. Kalau halaman penawaran sampai di-cache CDN, kunjungan klien tidak pernah
mencapai function dan angka "dibuka" diam-diam salah hitung — persis anti-goal #1.

Karena itu dipasang dua lapis, supaya tidak bergantung pada satu header saja:

```json
"headers": [
  { "source": "/quote/:path*",
    "headers": [{ "key": "x-vercel-enable-rewrite-caching", "value": "0" }] }
]
```

Verifikasi di PR-1 wajib mencakup pembacaan header respons (`x-vercel-cache` harus
`MISS`/`BYPASS`, bukan `HIT` pada permintaan kedua).

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
- Form upload: file, slug, nama klien, keterangan OG
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

### 5.10 GitHub Pages masih hidup — dan tidak punya rewrite

`.github/workflows/deploy.yml` masih mem-publish ke `foriorid.github.io/social/`
pada **setiap** push ke `main`, dan README menyebutnya didukung. Di sana tidak ada
lapisan rewrite Vercel, jadi `/quote/*` akan jatuh ke `app/not-found.tsx` dan 404.

Ini berbenturan langsung dengan keputusan di §5.8 yang membangun link dari
`window.location.origin` — keputusan yang membuat migrasi domain gratis, tapi di Pages
justru menghasilkan **link mati tanpa peringatan**.

Penanganannya: modul Penawaran mendeteksi host yang tidak punya lapisan rewrite
(`*.github.io`) dan **menyembunyikan tombol salin link**, diganti satu baris
penjelasan. Gagal terlihat, bukan diam-diam.

Apakah Pages memang masih dipakai adalah pertanyaan untuk Alvian (§8) — kalau tidak,
workflow-nya sebaiknya dibuang sekalian dan penanganan ini jadi tidak perlu.

### 5.11 Test

Di `supabase/functions/quote/quote.ts` (logika murni, tanpa Deno API):
`isSlug`, `isCrawler`, `injectMeta`, `planDataUris` (perencana ekstraksi base64:
terima daftar data URI, hasilkan nama file + penulisan ulang src).

`app/lib/quote.test.ts` meng-import dari `../../supabase/functions/quote/quote.ts`,
persis pola `app/lib/review.test.ts`. Kasus yang wajib ada:
`mytepro` lolos, `my` ditolak, `My-Tepro` ditolak, `a--b` ditolak, UA WhatsApp
dikenali crawler, UA Chrome Android tidak, `injectMeta` meng-escape `"` dan `<`,
`injectMeta` pada HTML tanpa `</head>` tidak merusak dokumen.

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

## 7. Yang diserahkan ke pembangun

- CSS detail daftar penawaran dan form upload
- Kata-kata persis pesan error dan halaman 404 penawaran
- Apakah daftar riwayat buka perlu paginasi (volumenya kecil, kemungkinan tidak)
- Nama file migrasi (timestamp) dan urutan commit di dalam PR

## 8. Pertanyaan terbuka — hanya Alvian yang bisa menjawab

Ketiganya memengaruhi apa yang dibangun, dan semuanya murah dijawab sekarang,
mahal nanti.

1. **Slug pendek vs slug yang tidak bisa ditebak.** `mytepro` cantik tapi mudah
   ditebak, sementara isinya daftar harga per klien. Kompetitor atau klien lain bisa
   mencoba `/quote/<nama-proyek>/` dan menemukan penawaran yang bukan untuknya.
   Pilihan: (a) persis seperti diminta, `/quote/mytepro/`; (b) tetap terbaca tapi
   tidak bisa ditebak, `/quote/mytepro-k7m2/` — ini pola yang sudah dipakai
   `review_links`; (c) bebas pilih per penawaran.
2. **Apakah satu klien dapat beberapa penawaran sekaligus?** Judul file contoh
   berbunyi "Quotation **Option 1**". Kalau Option 2 dan 3 juga dikirim, itu
   mengubah skema slug dan cara daftar dikelompokkan di dashboard.
3. **Apakah GitHub Pages masih dipakai?** (§5.10) Kalau tidak, workflow-nya dibuang
   dan satu penanganan khusus jadi tidak perlu.
