# KOELSTUDIO – Deploy ke GitHub + Cloudflare Pages

Struktur:
```
public/index.html     -> website
public/def.json       -> data awal (22 produk, metode bayar, popup)
functions/api/[[path]].js -> API (Cloudflare Pages Functions + D1)
```

## Langkah
1. Upload semua isi folder ini ke repository GitHub.
2. Cloudflare Dashboard -> **Workers & Pages -> Create -> Pages -> Connect to Git** -> pilih repo.
   - Framework preset: None
   - Build command: *(kosongkan)*
   - Build output directory: `public`
3. Buat database: **Storage & Databases -> D1 -> Create** (nama bebas, mis. `koelstudio`).
4. Buka project Pages -> **Settings -> Bindings -> Add -> D1 database**
   - Variable name: `DB`  -> pilih database tadi.
5. **Settings -> Variables and Secrets -> Add** -> `ADMIN_PIN` (type Secret), isi PIN admin kamu.
6. **Deployments -> Retry deployment** (agar binding aktif).
7. Buka websitenya, klik **Admin**, masukkan PIN. Ganti nomor WhatsApp di tab Pengaturan, lalu atur harga, rekening, banner, dll.

Tabel database dibuat otomatis saat API pertama kali dipanggil.

## Uji lokal (opsional)
Buat file `.dev.vars` berisi `ADMIN_PIN=123456`, lalu:
`npx wrangler pages dev public --d1=DB`

## Catatan keamanan
- PIN diperiksa di server (bukan di browser). Tambahkan **Rate limiting rule** di Cloudflare (Security -> WAF) untuk path `/api/admin/*` dan `/api/order`.
- Kode akses dibuat admin per invoice dan divalidasi server; satu kode hanya membuka produk yang dibeli.
