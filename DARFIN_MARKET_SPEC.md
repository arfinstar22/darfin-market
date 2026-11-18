# DARFIN MARKET

> **Dokumen spesifikasi produk dan implementasi untuk Antigravity**  
> Versi: 1.0  
> Tanggal: 18 November 2026  
> Status: Rancangan MVP — siap diimplementasikan  
> Platform utama: Telegram Bot + VPS  
> Bahasa antarmuka: Bahasa Indonesia  
> Zona waktu default: `Asia/Makassar` (dapat diubah per pengguna)

---

## 0. Instruksi utama untuk Antigravity

Bangun **DARFIN MARKET**, sebuah bot Telegram untuk memantau informasi pasar finansial dengan fokus awal pada cryptocurrency, pasangan crypto/IDR di INDODAX, kurs mata uang, watchlist, grafik sederhana, dan notifikasi perubahan harga.

Ikuti prinsip berikut selama pengembangan:

1. **Implementasikan MVP terlebih dahulu.** Jangan langsung membuat fitur trading, integrasi akun exchange, atau fitur saham yang sumber datanya belum tervalidasi.
2. **Gunakan API publik read-only.** DARFIN MARKET tidak boleh melakukan pembelian, penjualan, transfer, penarikan, atau tindakan finansial apa pun.
3. **Jangan mengarang data.** Jika API gagal, data kosong, simbol tidak dikenal, atau data kedaluwarsa, tampilkan status yang jelas. Jangan membuat angka pengganti.
4. **Tampilkan sumber dan waktu data.** Setiap harga harus menyebutkan sumber, mata uang kuotasi, dan waktu pembaruan/pengambilan data.
5. **Pisahkan provider.** Buat adapter untuk setiap sumber data agar provider dapat diganti tanpa mengubah command handler Telegram.
6. **Hormati batas API dan lisensi.** Cache hasil API, lakukan rate limiting, dan jangan menganggap API gratis berarti bebas untuk redistribusi publik.
7. **Keamanan lebih penting daripada banyak fitur.** Token bot dan API key hanya disimpan di environment variables. Jangan pernah menaruh secret di source code, log, README, atau pesan Telegram.
8. **Jangan menggunakan API tidak resmi sebagai fondasi.** Jangan menjadikan scraping Yahoo Finance, Stockbit, atau situs lain sebagai provider inti.
9. **Tulis test untuk parsing, kalkulasi, cache, alert, dan kegagalan provider.** Jangan hanya memastikan bot bisa `/start`.
10. Pertahankan desain kode modular, mudah diuji, dan mudah dikembangkan ke modul saham/komoditas pada fase berikutnya.

Jika ada detail implementasi yang tidak ditentukan, pilih default paling sederhana yang memenuhi dokumen ini. Jangan menghentikan pekerjaan hanya untuk menanyakan preferensi kosmetik.

---

# 1. Ringkasan produk

## 1.1 Nama

**DARFIN MARKET**

Tagline: **Market data, watchlist, and alerts — langsung dari Telegram.**

## 1.2 Deskripsi

DARFIN MARKET adalah asisten informasi pasar berbasis Telegram. Pengguna dapat memeriksa harga crypto, memantau pasangan crypto/IDR dari INDODAX, melihat statistik pasar crypto global, mengonversi mata uang, membuat watchlist, melihat grafik historis yang tersedia, dan memasang alert harga.

Bot berfungsi sebagai **market information dashboard**, bukan broker, exchange, penasihat investasi, atau sistem trading otomatis.

## 1.3 Masalah yang ingin diselesaikan

Pengguna biasanya harus membuka banyak aplikasi untuk:

- Memeriksa harga Bitcoin dan aset crypto lain.
- Membandingkan harga crypto dalam IDR dan USD.
- Melihat pergerakan pasar crypto global.
- Mengecek kurs USD/IDR dan mata uang lain.
- Mengingat aset yang sedang dipantau.
- Menunggu harga menyentuh nilai tertentu.

DARFIN MARKET menyatukan fungsi-fungsi tersebut dalam percakapan Telegram.

## 1.4 Target pengguna

- Pengguna Telegram yang ingin memantau pasar tanpa membuka banyak aplikasi.
- Pengguna crypto yang ingin melihat harga global dan harga pasangan IDR.
- Pengguna yang membutuhkan konversi kurs referensi.
- Pengguna yang ingin menerima notifikasi harga berdasarkan ambang yang mereka tentukan.

## 1.5 Prinsip produk

- **Minimalis:** tampilan Telegram rapi, mudah dibaca, tidak terlalu banyak emoji.
- **Transparan:** sumber, timestamp, mata uang, dan sifat data harus jelas.
- **Read-only:** tidak ada eksekusi transaksi.
- **Mobile-first:** seluruh hasil harus nyaman dibaca dari Telegram Android/iOS.
- **Reliable:** kegagalan satu provider tidak boleh merusak seluruh bot.
- **Cost-conscious:** prioritaskan endpoint gratis yang memang sesuai lisensinya.

---

# 2. Ruang lingkup dan batasan

## 2.1 Fitur MVP — wajib dibangun

1. Telegram bot dengan `/start`, `/help`, dan menu utama.
2. Harga crypto global dari CoinPaprika.
3. Harga pasangan crypto/IDR dari INDODAX.
4. Ringkasan pasar crypto global.
5. Pencarian aset crypto.
6. Daftar top gainers dan losers berdasarkan data provider.
7. Kurs referensi mata uang menggunakan Frankfurter.
8. Kalkulator konversi mata uang.
9. Watchlist per pengguna.
10. Alert harga di atas/di bawah nilai tertentu.
11. Daftar, hapus, aktifkan, dan nonaktifkan alert.
12. Grafik historis berdasarkan data historis yang benar-benar tersedia.
13. Cache, rate limiting, retry, dan penanganan error provider.
14. Penyimpanan konfigurasi pengguna dan alert secara persisten.
15. Docker deployment untuk VPS.
16. Logging, health check, dan automated tests.

## 2.2 Fitur fase berikutnya — jangan dianggap selesai pada MVP

- Data saham global melalui Alpha Vantage.
- Dukungan saham Indonesia/IDX setelah cakupan simbol dan ketentuan lisensi diverifikasi.
- Harga emas, perak, minyak, dan komoditas lain melalui provider yang mendukungnya.
- Market news dan kalender ekonomi.
- Telegram Mini App/WebApp dashboard.
- Multi-provider comparison untuk aset yang tersedia pada beberapa exchange.
- Personal portfolio tracker (tanpa koneksi akun exchange pada fase awal).

## 2.3 Di luar ruang lingkup

- Trading otomatis atau manual.
- Menghubungkan private API key INDODAX/Binance milik pengguna.
- Menyimpan password, seed phrase, private key, atau data wallet sensitif.
- Memberikan sinyal beli/jual atau menjamin keuntungan.
- Mengklaim harga sebagai real-time apabila provider hanya memberikan data berkala, referensi, atau delayed.
- Menampilkan data saham IDX sebelum provider dan simbolnya benar-benar tervalidasi.

---

# 3. Sumber API yang digunakan

## 3.1 Ringkasan keputusan provider

| Kebutuhan | Provider | API key | Peran di MVP | Catatan penting |
|---|---|---:|---|---|
| Harga crypto Indonesia | INDODAX Public REST API | Tidak | **Utama** | Harga pasangan di exchange INDODAX, termasuk pasangan IDR yang tersedia. |
| Harga crypto global | CoinPaprika API | Tidak untuk free tier | **Utama** | Data global dan statistik pasar. Free tier memiliki batas dan ketentuan penggunaan personal. |
| Kurs mata uang | Frankfurter API v2 | Tidak | **Utama** | Kurs referensi dari sumber resmi; bukan kuotasi forex trading real-time. |
| Saham global | Alpha Vantage | Ya | Fase berikutnya / opsional | Free service 25 request per hari; mayoritas quote default end-of-day. |

**Keputusan MVP:** jangan membuat ketergantungan terhadap API saham berbayar. Selesaikan crypto dan FX terlebih dahulu. Alpha Vantage hanya disiapkan sebagai adapter fase lanjutan.

## 3.2 INDODAX Public REST API — harga crypto/IDR

Dokumentasi resmi:

- Dokumentasi API: https://github.com/btcid/indodax-official-api-docs
- Public REST API: https://github.com/btcid/indodax-official-api-docs/blob/master/Public-RestAPI.md
- Website: https://indodax.com/

Base URL:

```text
https://indodax.com
```

Endpoint publik yang relevan:

| Fungsi | Method dan endpoint |
|---|---|
| Waktu server | `GET /api/server_time` |
| Daftar pair | `GET /api/pairs` |
| Semua ticker | `GET /api/ticker_all` |
| Ticker satu pair | `GET /api/ticker/{pair_id}` |
| Ringkasan pasar | `GET /api/summaries` |
| Riwayat transaksi terbaru | `GET /api/trades/{pair_id}` |
| Order book/depth | `GET /api/depth/{pair_id}` |

Contoh request:

```http
GET https://indodax.com/api/ticker/btcidr
```

Contoh pair ID yang mungkin tersedia:

```text
btcidr
ethidr
usdtidr
```

Jangan mengasumsikan seluruh contoh pair selalu aktif. Ambil daftar pair dari `/api/pairs` dan validasi `pair_id` sebelum memanggil ticker.

### Pemakaian dalam aplikasi

- Menyediakan harga lokal pasangan crypto/IDR.
- Menampilkan high, low, last price, buy, sell, volume, dan timestamp jika field tersebut tersedia pada respons provider.
- Menampilkan sumber sebagai `INDODAX`.
- Mengambil `/api/ticker_all` untuk mengurangi jumlah request ketika banyak pair diperlukan.
- Gunakan `/api/ticker/{pair_id}` untuk detail satu pair jika diperlukan.

### Batas request

Dokumentasi Public REST API menyatakan batas publik sekitar **180 request per menit**. Jangan mendekati batas tersebut. Terapkan cache dan pembatasan internal yang lebih konservatif.

### Aturan implementasi

- Data INDODAX merepresentasikan harga di INDODAX, bukan harga global seluruh exchange.
- Simpan nilai numerik sebagai decimal/string presisi, jangan menggunakan floating point untuk operasi keuangan yang memerlukan presisi.
- Validasi struktur respons sebelum digunakan.
- Jika pair tidak ditemukan, berikan pesan pair tidak tersedia; jangan mengganti diam-diam dengan pair lain.
- Jangan memakai endpoint private/trade API pada MVP.

## 3.3 CoinPaprika API — pasar crypto global

Dokumentasi:

- Developer hub: https://coinpaprika.com/developers
- API overview, endpoint, dan ketentuan: https://coinpaprika.com/api
- Pricing/limits: https://coinpaprika.com/api/pricing
- Base URL free: `https://api.coinpaprika.com/v1`

Free tier tidak memerlukan API key.

Endpoint utama:

| Kebutuhan | Endpoint |
|---|---|
| Semua ticker yang tersedia pada free tier | `GET /tickers` |
| Detail ticker satu aset | `GET /tickers/{coin_id}` |
| Daftar aset | `GET /coins` |
| Detail aset | `GET /coins/{coin_id}` |
| Pencarian | `GET /search?q={keyword}` |
| Statistik pasar global | `GET /global` |
| OHLCV harian terbaru | `GET /coins/{coin_id}/ohlcv/latest` |
| Data OHLCV historis | `GET /coins/{coin_id}/ohlcv/historical` |
| Pasar/exchange untuk aset | `GET /coins/{coin_id}/markets` |

Contoh request:

```http
GET https://api.coinpaprika.com/v1/tickers/btc-bitcoin
GET https://api.coinpaprika.com/v1/global
GET https://api.coinpaprika.com/v1/search?q=bitcoin
```

### Ketentuan free tier yang harus dipatuhi

Berdasarkan informasi paket API yang dipublikasikan CoinPaprika saat penyusunan dokumen:

- Tanpa API key dan tanpa registrasi untuk akses free tier.
- Maksimal sekitar **20.000 request per bulan per IP**.
- Free tier dibatasi hingga sekitar **2.000 aset**.
- Pembaruan harga dapat mencapai interval hingga sekitar **10 menit** pada free tier.
- Rate limit teknis yang dipublikasikan: hingga **10 request per detik per IP**.
- Free tier dinyatakan untuk **penggunaan personal** dan mensyaratkan atribusi/credit `Powered by CoinPaprika`.
- Penggunaan komersial atau redistribusi data kepada pengguna produk dapat memerlukan paket/lisensi berbayar, termasuk ketentuan Enterprise.

**PENTING:** gunakan free tier untuk pengembangan dan penggunaan personal/private testing saja. Sebelum membuka DARFIN MARKET sebagai bot publik untuk banyak pengguna, memonetisasi bot, atau mendistribusikan ulang data CoinPaprika, tinjau kembali terms terbaru dan dapatkan lisensi yang sesuai atau ganti provider. Jangan mengasumsikan free tier dapat dipakai untuk layanan publik hanya karena endpoint-nya dapat diakses tanpa API key.

### Aturan implementasi

- Gunakan `coin_id` dari hasil pencarian/daftar koin; jangan menganggap simbol ticker selalu unik.
- Harga CoinPaprika adalah data agregat global dan dapat berbeda dari harga di INDODAX.
- Jangan mencampur harga dari dua provider menjadi satu angka tanpa label.
- Baca `last_updated` atau field waktu yang disediakan untuk mengukur freshness.
- Cantumkan credit `Powered by CoinPaprika` pada tampilan data yang menggunakan CoinPaprika, sesuai ketentuan provider.
- Simpan nilai `market_cap`, `volume_24h`, `percent_change_24h`, dan `price` sebagai decimal/string yang aman.
- Jangan melakukan polling setiap detik. Cache global ticker dan aset populer.

## 3.4 Frankfurter API v2 — kurs referensi mata uang

Dokumentasi:

- Website dan dokumentasi: https://frankfurter.dev/
- Dokumentasi versi Indonesia: https://frankfurter.dev/id/
- Base URL: `https://api.frankfurter.dev/v2`

Frankfurter menyediakan API kurs tanpa API key, berbasis data dari bank sentral dan sumber resmi. Dokumentasi menyebutkan cakupan 219 mata uang dan 39 aset lainnya.

Endpoint utama:

| Fungsi | Endpoint |
|---|---|
| Rate terbaru | `GET /rates` |
| Rate dengan base tertentu | `GET /rates?base=USD` |
| Filter mata uang tujuan | `GET /rates?base=USD&quotes=IDR,EUR,SGD` |
| Rate tanggal tertentu | `GET /rates?date=2026-11-17&base=USD&quotes=IDR` |
| Time series | `GET /rates?from=2026-11-01&to=2026-11-18&base=USD&quotes=IDR` |
| Daftar mata uang | `GET /currencies` |

Contoh request:

```http
GET https://api.frankfurter.dev/v2/rates?base=USD&quotes=IDR
```

### Makna data

- Frankfurter memberikan **reference rates**, bukan harga forex bid/ask yang diperdagangkan secara real-time.
- Setiap sumber menerbitkan rate satu kali atau beberapa kali per hari sesuai jadwalnya.
- Tampilkan label `Kurs referensi`, bukan `Harga forex real-time`.
- Simpan tanggal referensi rate sesuai field yang dikembalikan API.

### Validasi mata uang

Saat bootstrap atau saat pertama kali dipakai:

1. Ambil `/currencies`.
2. Pastikan kode `IDR` tersedia.
3. Jika `IDR` tidak tersedia dari provider, nonaktifkan pasangan tersebut dengan pesan yang jelas; jangan memakai angka hardcoded.
4. Simpan hasil daftar mata uang dengan cache panjang.

### Aturan cache

Cache kurs sekurang-kurangnya 6 jam, atau lebih lama sesuai timestamp dan kebijakan provider. Jangan meminta kurs berulang untuk setiap pesan jika cache masih valid.

## 3.5 Alpha Vantage — saham, fase berikutnya

Dokumentasi:

- API docs: https://www.alphavantage.co/documentation/
- Free API key: https://www.alphavantage.co/support/#api-key
- FAQ/limit: https://www.alphavantage.co/support/#support

Alpha Vantage menyediakan stock time series, forex, crypto, fundamental data, dan indikator teknikal. API key diperlukan.

### Batasan paket gratis yang diketahui saat penyusunan dokumen

- Mayoritas dataset gratis memiliki batas **25 request per hari**.
- Data quote saham secara default diperbarui pada akhir hari untuk pengguna free.
- Realtime dan 15-minute delayed US stock quote memerlukan paket premium menurut dokumentasi mereka.
- Coverage ticker global harus diperiksa per simbol; jangan berasumsi seluruh saham Indonesia/IDX tersedia.

### Keputusan implementasi

- Jangan jadikan Alpha Vantage bagian dari alur wajib MVP.
- Buat `AlphaVantageProvider` sebagai adapter opsional pada fase saham.
- Tambahkan fitur hanya setelah simbol yang diperlukan berhasil diuji dan sumber waktu/datanya dipahami.
- Untuk saham Indonesia, jangan menyatakan dukungan IDX sebelum contoh ticker IDX yang dibutuhkan berhasil diuji dari API secara konsisten.
- Jangan menampilkan saham dengan label real-time jika data yang diperoleh adalah EOD/delayed.

Environment variable untuk fase berikutnya:

```env
ALPHA_VANTAGE_API_KEY=
```

## 3.6 API yang tidak boleh dijadikan dependensi MVP

- Yahoo Finance melalui endpoint tidak resmi atau scraping.
- Endpoint internal aplikasi finansial yang tidak didokumentasikan sebagai API publik.
- API key/private API pengguna exchange.
- Provider yang tidak jelas ketentuan penggunaan, freshness, dan kuotanya.

Provider alternatif boleh diteliti kemudian, tetapi wajib melalui proses verifikasi dokumentasi, rate limit, freshness, coverage, dan lisensi.

---

# 4. Fitur dan perilaku bot

## 4.1 Navigasi utama

Gunakan Telegram inline keyboard dengan menu:

- `Market Overview`
- `Crypto Prices`
- `Top Gainers`
- `Top Losers`
- `Currency Converter`
- `My Watchlist`
- `Price Alerts`
- `Settings`

Menu harus sederhana dan konsisten. Command tetap dapat digunakan tanpa menekan tombol.

## 4.2 Daftar command

| Command | Fungsi | Contoh |
|---|---|---|
| `/start` | Registrasi otomatis dan menu utama | `/start` |
| `/help` | Bantuan command | `/help` |
| `/market` | Ringkasan pasar crypto | `/market` |
| `/crypto` | Harga crypto berdasarkan simbol/nama | `/crypto BTC` |
| `/search` | Cari aset crypto | `/search bitcoin` |
| `/top` | Top gainers/losers | `/top gainers` |
| `/fx` | Kurs referensi mata uang | `/fx USD` |
| `/convert` | Konversi kurs | `/convert 100 USD IDR` |
| `/chart` | Grafik historis aset | `/chart BTC 7d` |
| `/watchlist` | Lihat daftar pantauan | `/watchlist` |
| `/watchadd` | Tambah aset ke watchlist | `/watchadd BTC` |
| `/watchremove` | Hapus aset dari watchlist | `/watchremove BTC` |
| `/alert` | Buat alert harga | `/alert add BTC above 2000000000 IDR` |
| `/alerts` | Lihat alert pengguna | `/alerts` |
| `/alertremove` | Hapus alert | `/alertremove 12` |
| `/settings` | Pengaturan | `/settings` |
| `/status` | Status layanan dan provider | `/status` |

Command dapat disederhanakan atau ditambah alias selama semua operasi tetap tersedia melalui inline keyboard.

## 4.3 `/start`

Perilaku:

1. Baca `from.id`, `username`, `first_name`, dan `language_code` dari Telegram.
2. Buat atau perbarui record pengguna secara idempotent.
3. Terapkan timezone default `Asia/Makassar`.
4. Tampilkan sambutan singkat dan menu.
5. Jelaskan bahwa bot hanya menyajikan informasi pasar dan tidak melakukan trading.

Jangan mengumpulkan nama lengkap, nomor telepon, email, atau data finansial yang tidak diperlukan.

## 4.4 `/market` — market overview

Tampilkan ringkasan seperti:

```text
📊 DARFIN MARKET — MARKET OVERVIEW

CRYPTO GLOBAL
• Total market cap: [nilai + mata uang]
• Volume 24 jam: [nilai + mata uang]
• BTC dominance: [nilai %]
• Sumber: CoinPaprika
• Data diperbarui: [timestamp provider]

INDODAX
• BTC/IDR: Rp [harga]
• ETH/IDR: Rp [harga]
• USDT/IDR: Rp [harga]
• Sumber: INDODAX
• Diambil pada: [timestamp]

FX REFERENCE
• USD/IDR: Rp [rate]
• Tanggal referensi: [tanggal]
• Sumber: Frankfurter

Data pasar merupakan informasi, bukan rekomendasi investasi.
```

Aturan:

- Setiap blok memiliki label sumber sendiri.
- Jangan menggabungkan statistik CoinPaprika, ticker INDODAX, dan kurs Frankfurter menjadi seolah-olah satu feed.
- Jika salah satu provider gagal, tampilkan blok lain yang masih berhasil dan tandai bagian yang gagal.
- Jangan menampilkan `0` sebagai nilai pengganti untuk data kosong.

## 4.5 `/crypto SYMBOL`

Contoh:

```text
/crypto BTC
/crypto ETH
/crypto SOL
```

Alur:

1. Normalisasi input (trim, uppercase).
2. Cari pair INDODAX dari daftar pair, misalnya `BTC/IDR`.
3. Cari `coin_id` CoinPaprika berdasarkan symbol/name.
4. Tampilkan hasil lokal dan global dalam bagian terpisah jika keduanya tersedia.
5. Tampilkan harga, perubahan 24 jam, volume, high/low bila tersedia, sumber, dan waktu data.
6. Jika hanya satu provider yang menyediakan aset, tampilkan provider itu saja.
7. Jika banyak aset mempunyai simbol sama, minta pengguna memilih dari daftar; jangan menebak.

Contoh hasil:

```text
₿ BITCOIN (BTC)

INDODAX — BTC/IDR
Harga terakhir : Rp [nilai]
24 jam         : [persentase jika tersedia]
High / Low     : [nilai jika tersedia]

GLOBAL — COINPAPRIKA
Harga          : $ [nilai]
Market cap     : $ [nilai]
Volume 24 jam  : $ [nilai]
Perubahan 24h  : [persentase]

Catatan: harga INDODAX dan harga agregat global dapat berbeda karena sumber pasar berbeda.
Data diperbarui: [waktu masing-masing sumber]
Powered by CoinPaprika
```

## 4.6 `/search KEYWORD`

- Gunakan CoinPaprika search endpoint.
- Batasi hasil misalnya 5–10 item.
- Tampilkan nama, symbol, dan `coin_id` internal.
- Pengguna memilih hasil melalui inline keyboard.
- Hindari mengandalkan symbol saja karena simbol tidak selalu unik.

## 4.7 `/top gainers` dan `/top losers`

- Gunakan ticker list dari CoinPaprika.
- Urutkan berdasarkan perubahan 24 jam sesuai field yang valid.
- Abaikan aset yang datanya null atau tidak memiliki perubahan 24 jam.
- Beri label bahwa daftar berasal dari CoinPaprika dan hanya cakupan aset yang tersedia di free tier.
- Batasi hasil 10 aset per halaman.
- Cache respons; jangan memanggil endpoint seluruh ticker setiap kali setiap pengguna membuka menu.

## 4.8 `/fx` dan `/convert`

Contoh:

```text
/fx USD
/convert 100 USD IDR
/convert 50 EUR IDR
/convert 250000 IDR USD
```

Perilaku:

- Gunakan Frankfurter v2.
- Konversi dilakukan di backend: `amount * rate`.
- Validasi amount positif dan kode mata uang tersedia.
- Format IDR dengan pemisah ribuan Indonesia.
- Tampilkan tanggal referensi data.
- Beri keterangan bahwa kurs adalah kurs referensi, bukan harga jual/beli bank atau broker.

Contoh hasil:

```text
💱 KONVERSI MATA UANG

100 USD ≈ Rp [hasil] IDR

Kurs: 1 USD = Rp [rate] IDR
Sumber: Frankfurter
Tanggal referensi: [tanggal]

Catatan: kurs referensi dapat berbeda dari kurs jual/beli bank dan money changer.
```

## 4.9 `/chart SYMBOL PERIOD`

Periode awal:

- `1d`
- `7d`
- `30d`
- `90d` jika data historis provider tersedia.

Aturan:

- Untuk crypto global, gunakan OHLCV CoinPaprika sesuai keterbatasan paket free.
- Untuk chart harga INDODAX dalam IDR, gunakan data lokal yang dikumpulkan dari endpoint ticker dengan interval konservatif, atau sumber historis resmi jika tersedia.
- Jangan mengubah data USD menjadi IDR untuk lalu memberi label sebagai harga INDODAX.
- Tampilkan timestamp awal/akhir dan sumber.
- Jika resolusi/periode tidak didukung, sampaikan periode yang tersedia.
- Render chart sebagai gambar lokal menggunakan library chart server-side; jangan mengirim secret atau data ke layanan chart pihak ketiga.

Rekomendasi teknis chart:

- `chart.js` + `chartjs-node-canvas`, atau library Node.js sejenis yang dapat dirender secara lokal.
- Chart sederhana, label tidak bertumpuk, dan format angka sesuai mata uang.

## 4.10 Watchlist

Setiap pengguna mempunyai watchlist sendiri.

Kemampuan:

- Tambah aset.
- Hapus aset.
- Lihat harga terakhir dari sumber yang tersedia.
- Menampilkan perubahan 24 jam bila tersedia.
- Membatasi jumlah item awal, misalnya 20 aset per user.
- Mencegah duplikasi kombinasi `user_id + asset + provider/quote`.

Watchlist tidak sama dengan portofolio. Jangan meminta jumlah kepemilikan atau harga beli pada MVP.

## 4.11 Price alerts

Jenis alert MVP:

- Harga `above` ambang tertentu.
- Harga `below` ambang tertentu.

Contoh format:

```text
/alert add BTC above 2000000000 IDR
/alert add BTC below 1500000000 IDR
```

Ketentuan:

- Pengguna harus menentukan provider/market atau sistem harus memilih dan menyebutkan sumbernya dengan jelas.
- Untuk pasangan lokal, alert dapat menggunakan pair INDODAX seperti `BTC/IDR`.
- Untuk crypto global, alert menggunakan quote currency yang tersedia dari CoinPaprika; bila alert dikonversi ke IDR, kurs dan sumber konversi juga harus jelas.
- Harga ambang harus positif.
- Simpan alert dengan status `active`, `triggered`, `paused`, atau `deleted`.
- Kirim notifikasi hanya ketika kondisi benar-benar melintasi ambang, bukan setiap polling selama kondisi masih terpenuhi.
- Setelah trigger, alert menjadi `triggered` dan tidak mengirim pesan berulang. Pengguna dapat membuat ulang atau mengaktifkan kembali.
- Terapkan cooldown dan batas jumlah alert per user.
- Jika data provider stale atau gagal, jangan trigger berdasarkan data lama.
- Isi notifikasi dengan harga aktual yang terbaca, sumber, waktu, dan ambang alert.

Contoh notifikasi:

```text
🔔 DARFIN MARKET ALERT

BTC/IDR telah melewati target yang kamu tentukan.
Harga terbaca : Rp [harga]
Target        : Rp [target]
Sumber        : INDODAX
Waktu         : [tanggal dan jam]

Ini adalah notifikasi harga, bukan rekomendasi transaksi.
```

## 4.12 `/status`

Menampilkan:

- Status bot.
- Status database.
- Status Redis/queue jika digunakan.
- Status terakhir setiap provider.
- Waktu request terakhir yang berhasil.
- Status cache (hit/miss bila relevan).

Jangan menampilkan token, API key, connection string, atau detail internal sensitif.

---

# 5. Arsitektur sistem

## 5.1 Stack yang direkomendasikan

| Komponen | Pilihan | Tujuan |
|---|---|---|
| Runtime | Node.js 24+ | Backend runtime |
| Bahasa | TypeScript | Type safety dan maintainability |
| Telegram framework | grammY | Telegram Bot API |
| HTTP client | Native `fetch` / `undici` | Pemanggilan API provider |
| Validation | Zod | Validasi input dan respons |
| Database | PostgreSQL | User, watchlist, alerts, snapshots |
| ORM/query | Drizzle ORM | Schema dan migration |
| Cache | Redis | Cache, rate limit, queue |
| Job queue | BullMQ | Polling dan alert worker |
| Logging | Pino | Structured logs |
| Chart | Chart.js + chartjs-node-canvas | Render grafik lokal |
| Tests | Vitest | Unit/integration tests |
| Deployment | Docker Compose | VPS deployment |

Jika VPS sangat terbatas, Redis dapat dihilangkan pada tahap pertama dan diganti scheduler/database-backed jobs, tetapi arsitektur harus tetap memisahkan worker dari command handler. Pilihan default proyek adalah PostgreSQL + Redis.

## 5.2 Diagram arsitektur

```text
Telegram User
     |
     v
Telegram Bot API
     |
     v
DARFIN MARKET BOT (grammY)
     |
     +------ Command Handlers
     |          |
     |          +---- Market Service
     |          +---- FX Service
     |          +---- Watchlist Service
     |          +---- Alert Service
     |          +---- Chart Service
     |
     v
Provider Layer
     |
     +---- IndodaxProvider ------> INDODAX Public REST API
     |
     +---- CoinPaprikaProvider --> CoinPaprika API
     |
     +---- FrankfurterProvider -> Frankfurter API v2
     |
     +---- AlphaVantageProvider -> (future / optional)
     |
     v
Cache + Queue Layer
     |
     +---- Redis cache
     +---- BullMQ jobs
     |
     v
PostgreSQL
     |
     +---- users
     +---- watchlist_items
     +---- price_alerts
     +---- market_snapshots
     +---- provider_health
```

## 5.3 Prinsip modularitas

Command handler tidak boleh memanggil API pihak ketiga secara langsung. Handler hanya memanggil service. Service menggunakan provider interface.

Contoh interface konseptual:

```ts
interface CryptoMarketProvider {
  getTicker(asset: AssetIdentifier, quote?: string): Promise<MarketTicker | null>;
  searchAssets(query: string): Promise<AssetSearchResult[]>;
  getHistoricalData?(asset: AssetIdentifier, range: ChartRange): Promise<Candle[]>;
  getProviderStatus(): Promise<ProviderStatus>;
}

interface FxProvider {
  getRate(base: string, quote: string): Promise<FxRate | null>;
  getHistoricalRate?(base: string, quote: string, date: string): Promise<FxRate | null>;
  getCurrencies(): Promise<CurrencyInfo[]>;
}
```

Gunakan adapter terpisah:

```text
IndodaxProvider
CoinPaprikaProvider
FrankfurterProvider
AlphaVantageProvider (future)
```

Jangan membuat satu service besar yang mencampur parsing API, command Telegram, query database, dan kalkulasi alert.

---

# 6. Struktur folder yang diharapkan

Gunakan struktur modular berikut atau struktur setara yang lebih baik tanpa menghilangkan pemisahan tanggung jawab:

```text
darfin-market/
├── src/
│   ├── app.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── constants.ts
│   ├── bot/
│   │   ├── bot.ts
│   │   ├── commands/
│   │   │   ├── start.ts
│   │   │   ├── help.ts
│   │   │   ├── market.ts
│   │   │   ├── crypto.ts
│   │   │   ├── search.ts
│   │   │   ├── top.ts
│   │   │   ├── fx.ts
│   │   │   ├── convert.ts
│   │   │   ├── chart.ts
│   │   │   ├── watchlist.ts
│   │   │   ├── alert.ts
│   │   │   ├── settings.ts
│   │   │   └── status.ts
│   │   ├── keyboards/
│   │   │   ├── main-menu.ts
│   │   │   ├── market-menu.ts
│   │   │   └── pagination.ts
│   │   ├── middleware/
│   │   │   ├── rate-limit.ts
│   │   │   ├── user-registration.ts
│   │   │   └── error-handler.ts
│   │   └── formatters/
│   │       ├── number.ts
│   │       ├── currency.ts
│   │       └── messages.ts
│   ├── providers/
│   │   ├── interfaces/
│   │   │   ├── crypto-provider.ts
│   │   │   └── fx-provider.ts
│   │   ├── indodax/
│   │   │   ├── client.ts
│   │   │   ├── provider.ts
│   │   │   └── schemas.ts
│   │   ├── coinpaprika/
│   │   │   ├── client.ts
│   │   │   ├── provider.ts
│   │   │   └── schemas.ts
│   │   ├── frankfurter/
│   │   │   ├── client.ts
│   │   │   ├── provider.ts
│   │   │   └── schemas.ts
│   │   └── alphavantage/          # future / optional
│   │       ├── client.ts
│   │       └── provider.ts
│   ├── services/
│   │   ├── market.service.ts
│   │   ├── fx.service.ts
│   │   ├── search.service.ts
│   │   ├── watchlist.service.ts
│   │   ├── alert.service.ts
│   │   ├── chart.service.ts
│   │   └── provider-health.service.ts
│   ├── workers/
│   │   ├── worker.ts
│   │   ├── market-refresh.worker.ts
│   │   ├── alert-check.worker.ts
│   │   └── snapshot.worker.ts
│   ├── db/
│   │   ├── schema/
│   │   ├── migrations/
│   │   ├── client.ts
│   │   └── repositories/
│   ├── cache/
│   │   ├── redis.ts
│   │   └── cache-keys.ts
│   ├── charts/
│   │   └── renderer.ts
│   ├── utils/
│   │   ├── decimal.ts
│   │   ├── dates.ts
│   │   ├── retry.ts
│   │   └── errors.ts
│   └── types/
│       ├── market.ts
│       ├── alert.ts
│       └── provider.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── scripts/
│   ├── healthcheck.ts
│   └── seed.ts
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── README.md
└── LICENSE
```

Struktur dapat disesuaikan, tetapi provider, service, bot handler, worker, dan database wajib tetap terpisah.

---

# 7. Database schema

Gunakan PostgreSQL. Buat migration, index, foreign key, dan timestamp UTC.

## 7.1 `users`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `telegram_user_id` | BIGINT | Unique Telegram user ID |
| `username` | TEXT nullable | Username saat terakhir terlihat |
| `first_name` | TEXT nullable | Nama tampilan Telegram |
| `timezone` | TEXT | Default `Asia/Makassar` |
| `language` | TEXT | Default `id` |
| `created_at` | TIMESTAMPTZ | Waktu dibuat |
| `updated_at` | TIMESTAMPTZ | Waktu diubah |

Unique index pada `telegram_user_id`.

## 7.2 `watchlist_items`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK ke users |
| `asset_id` | TEXT | Internal provider asset ID atau canonical asset ID |
| `symbol` | TEXT | Simbol tampilan |
| `name` | TEXT nullable | Nama aset |
| `provider` | TEXT | `indodax` atau `coinpaprika` |
| `market_pair` | TEXT nullable | Contoh `btcidr` |
| `quote_currency` | TEXT | Contoh `IDR` atau `USD` |
| `created_at` | TIMESTAMPTZ | Waktu dibuat |

Unique constraint harus mencegah item duplikat per user/provider/market.

## 7.3 `price_alerts`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK ke users |
| `asset_id` | TEXT | ID aset provider |
| `symbol` | TEXT | Simbol tampilan |
| `provider` | TEXT | Provider sumber harga |
| `market_pair` | TEXT nullable | Contoh `btcidr` |
| `quote_currency` | TEXT | Mata uang ambang |
| `condition` | TEXT | `above` atau `below` |
| `target_price` | NUMERIC(38, 18) | Nilai ambang |
| `status` | TEXT | `active`, `triggered`, `paused`, `deleted` |
| `last_observed_price` | NUMERIC(38, 18) nullable | Harga terakhir yang diperiksa |
| `last_observed_at` | TIMESTAMPTZ nullable | Waktu observasi |
| `triggered_at` | TIMESTAMPTZ nullable | Waktu trigger |
| `created_at` | TIMESTAMPTZ | Waktu dibuat |
| `updated_at` | TIMESTAMPTZ | Waktu diubah |

Index minimal:

- `(status, provider, symbol)`
- `(user_id, status)`

## 7.4 `market_snapshots`

Digunakan untuk menyimpan snapshot lokal agar dapat menampilkan grafik historis yang dikumpulkan sendiri.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGSERIAL | Primary key |
| `provider` | TEXT | `indodax` atau `coinpaprika` |
| `asset_id` | TEXT | ID provider |
| `symbol` | TEXT | Simbol |
| `market_pair` | TEXT nullable | Pair exchange |
| `quote_currency` | TEXT | IDR/USD/dll. |
| `price` | NUMERIC(38, 18) | Harga |
| `observed_at` | TIMESTAMPTZ | Waktu observasi |

Index `(provider, asset_id, quote_currency, observed_at DESC)`.

Buat retention policy agar snapshot lama dapat dihapus/diarsipkan. Default awal: 30–90 hari, configurable.

## 7.5 `provider_health`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `provider` | TEXT | Primary key |
| `status` | TEXT | `healthy`, `degraded`, `down` |
| `last_success_at` | TIMESTAMPTZ nullable | Request sukses terakhir |
| `last_error_at` | TIMESTAMPTZ nullable | Error terakhir |
| `last_error_code` | TEXT nullable | HTTP/error code tanpa secret |
| `latency_ms` | INTEGER nullable | Latency terakhir |
| `updated_at` | TIMESTAMPTZ | Waktu update |

---

# 8. Cache, request policy, dan background jobs

## 8.1 Prinsip cache

Jangan mengirim satu request API untuk setiap pengguna. Satu hasil provider dapat dibagikan secara internal melalui cache selama masih valid.

Rekomendasi TTL awal:

| Data | Provider | TTL awal |
|---|---|---:|
| Daftar pair | INDODAX | 6 jam |
| Semua ticker | INDODAX | 15–30 detik untuk request interaktif; polling worker lebih konservatif |
| Ticker satu pair | INDODAX | 15–30 detik |
| Coin ticker | CoinPaprika | 5–10 menit |
| Global market statistics | CoinPaprika | 5–10 menit |
| Coin search | CoinPaprika | 1 jam |
| Currency list | Frankfurter | 24 jam |
| FX rates | Frankfurter | 6–12 jam atau sampai update referensi berikutnya |
| Chart historical data | Provider | 15–60 menit sesuai jenis data |

TTL adalah kebijakan cache aplikasi, bukan klaim bahwa provider menjamin interval pembaruan tersebut. Selalu gunakan timestamp provider bila tersedia.

## 8.2 Polling untuk alert

Rekomendasi awal:

- INDODAX pair yang memiliki alert aktif: cek setiap 30–60 detik, dengan satu request `/api/ticker_all` atau batch yang efisien.
- CoinPaprika free tier: jangan cek lebih cepat dari pembaruan data yang masuk akal; gunakan interval minimal 5–10 menit dan cache bersama.
- Frankfurter: tidak dipakai untuk alert forex real-time. Kurs referensi terlalu jarang untuk notifikasi ambang trading.

Jangan membuat satu job polling per pengguna. Buat satu worker untuk setiap provider/market dan evaluasi semua alert aktif yang relevan terhadap snapshot yang sama.

## 8.3 Pengendalian kuota CoinPaprika

Free tier sekitar 20.000 request/bulan berarti secara rata-rata sekitar 666 request/hari. Buat counter penggunaan per hari/bulan dan alert internal ketika:

- 70% kuota terpakai.
- 85% kuota terpakai.
- 95% kuota terpakai.

Saat mendekati batas, turunkan refresh, prioritaskan request yang benar-benar diperlukan, dan hentikan pengambilan data massal yang tidak esensial.

## 8.4 Retry dan circuit breaker

- Timeout request provider: default 5–10 detik.
- Retry hanya untuk kegagalan sementara seperti network error, 429, dan 5xx.
- Gunakan exponential backoff dengan jitter.
- Hormati header `Retry-After` jika ada.
- Jangan retry terus-menerus untuk 400/401/403/404.
- Setelah sejumlah kegagalan beruntun, tandai provider `degraded` atau `down` dan hentikan request agresif sementara.
- Jangan menampilkan cache stale seolah-olah data terbaru.
- Jika tetap menampilkan cache lama, beri label `data tersimpan, terakhir diperbarui ...`.

## 8.5 Snapshot lokal

Untuk grafik INDODAX IDR:

- Opsional ambil snapshot setiap 5 menit untuk aset populer yang dipantau.
- Ambil data ticker batch jika endpoint menyediakan semuanya.
- Hindari membuat request per pair jika satu endpoint dapat memenuhi kebutuhan.
- Simpan `observed_at` secara UTC.
- Chart lokal harus menyebut `Data dikumpulkan DARFIN MARKET dari INDODAX mulai [tanggal]`, bukan mengklaim memiliki histori exchange yang tidak dimiliki.

---

# 9. Format dan kualitas data

## 9.1 Canonical market ticker

Normalisasi semua sumber menjadi model internal yang konsisten, misalnya:

```ts
type MarketTicker = {
  provider: "indodax" | "coinpaprika" | "alphavantage";
  assetId: string;
  symbol: string;
  name?: string;
  marketPair?: string;
  baseCurrency?: string;
  quoteCurrency: string;
  price: string;                 // Decimal string
  change24hPercent?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
  marketCap?: string;
  sourceUpdatedAt?: string;
  fetchedAt: string;
  isStale: boolean;
};
```

Simpan angka desimal sebagai string atau PostgreSQL `NUMERIC`; gunakan library decimal seperti `decimal.js` untuk kalkulasi.

## 9.2 Waktu

- Simpan timestamp database dalam UTC.
- Konversi tampilan ke timezone pengguna.
- Default `Asia/Makassar`.
- Bedakan `sourceUpdatedAt` dari `fetchedAt`.
- Jika provider tidak menyediakan timestamp, tampilkan waktu pengambilan data oleh sistem dan jangan mengklaim timestamp tersebut berasal dari market.

## 9.3 Freshness/staleness

Buat konfigurasi batas stale per provider dan jenis data. Jika waktu sumber melebihi batas:

- `isStale = true`.
- Jangan trigger alert.
- Jangan menyebutnya harga terkini.
- Tampilkan penjelasan data terakhir yang berhasil.

## 9.4 Perhitungan persentase

Gunakan formula:

```text
change_percent = ((current_price - previous_price) / previous_price) * 100
```

Pastikan `previous_price` bukan nol/null. Bila provider menyediakan persentase perubahan, gunakan nilai provider dan beri label sesuai sumber. Jangan membandingkan harga dari provider berbeda untuk menyimpulkan perubahan 24 jam tanpa menyamakan sumber, pasangan, dan periode.

---

# 10. Keamanan dan privasi

1. Simpan `TELEGRAM_BOT_TOKEN` di `.env` atau secret manager.
2. Jangan commit `.env`.
3. Buat `.env.example` berisi placeholder saja.
4. Jangan log token Telegram, API key, database URL dengan password, atau data sensitif.
5. Validasi seluruh command input menggunakan Zod atau parser ketat.
6. Batasi panjang input dan jumlah request per user.
7. Jangan membuat endpoint HTTP yang bisa fetch URL bebas dari pengguna; MVP hanya menerima symbol/asset identifier sehingga mengurangi risiko SSRF.
8. Gunakan parameterized query/ORM; jangan membangun SQL dari string mentah pengguna.
9. Batasi ukuran hasil Telegram dan gunakan pagination.
10. Terapkan Telegram error handling agar kegagalan send message tidak menjatuhkan worker.
11. Pisahkan akses admin dari akses pengguna biasa.
12. Jangan meminta API key exchange dari pengguna pada MVP.
13. Sediakan command `/delete_my_data` atau mekanisme penghapusan data pengguna sebelum layanan dibuka secara publik.
14. Simpan hanya Telegram ID dan data konfigurasi yang dibutuhkan.

---

# 11. Pengaturan konfigurasi

Buat `.env.example` seperti berikut:

```env
# Application
NODE_ENV=production
APP_NAME=DARFIN MARKET
APP_TIMEZONE=Asia/Makassar
LOG_LEVEL=info

# Telegram
TELEGRAM_BOT_TOKEN=replace_me
TELEGRAM_ADMIN_IDS=123456789

# Database
DATABASE_URL=postgresql://darfin:change_me@postgres:5432/darfin_market

# Redis
REDIS_URL=redis://redis:6379

# Provider settings
INDODAX_BASE_URL=https://indodax.com
COINPAPRIKA_BASE_URL=https://api.coinpaprika.com/v1
FRANKFURTER_BASE_URL=https://api.frankfurter.dev/v2

# Optional future provider — not needed for MVP
ALPHA_VANTAGE_API_KEY=

# Cache TTL (seconds)
INDODAX_TICKER_TTL=20
COINPAPRIKA_TICKER_TTL=600
FRANKFURTER_RATE_TTL=21600

# Worker settings
INDODAX_ALERT_INTERVAL_SECONDS=60
COINPAPRIKA_ALERT_INTERVAL_SECONDS=600
SNAPSHOT_INTERVAL_SECONDS=300

# Limits
MAX_WATCHLIST_ITEMS=20
MAX_ACTIVE_ALERTS_PER_USER=20
USER_COMMANDS_PER_MINUTE=20
```

Catatan:

- `TELEGRAM_ADMIN_IDS` boleh berisi daftar ID dipisahkan koma.
- Jangan menaruh nilai asli token/API key ke dokumen, screenshot, atau chat publik.
- Env var TTL dan interval harus divalidasi saat startup.

---

# 12. Deployment VPS

## 12.1 Docker services

Minimal service:

1. `bot` — menerima update Telegram dan mengirim jawaban.
2. `worker` — menjalankan polling market, snapshot, dan alert.
3. `postgres` — database.
4. `redis` — cache dan queue.

Gunakan Docker Compose dengan:

- restart policy `unless-stopped`.
- health checks.
- persistent volume untuk PostgreSQL.
- password database yang kuat.
- internal network untuk database/Redis (jangan expose ke internet publik).
- log rotation.

## 12.2 Telegram update mode

Untuk MVP di satu VPS, long polling dapat digunakan karena deployment lebih sederhana dan tidak memerlukan public webhook endpoint. Webhook dapat dipertimbangkan jika arsitektur berkembang.

Pastikan hanya satu instance polling aktif untuk satu bot token agar tidak terjadi konflik update.

## 12.3 Backup

- Buat backup PostgreSQL berkala.
- Jangan backup file `.env` ke lokasi publik.
- Simpan retention backup yang wajar.
- Dokumentasikan langkah restore.

## 12.4 Monitoring

- Health endpoint atau healthcheck script internal.
- Log JSON.
- Status provider.
- Counter penggunaan API.
- Queue depth dan job failures.
- Memory/CPU/disk usage.

---

# 13. UX dan desain pesan

## 13.1 Gaya antarmuka

- Minimalis, elegan, dan profesional.
- Gunakan emoji hanya untuk memperjelas kategori.
- Hindari pesan panjang yang tidak perlu.
- Gunakan format angka Indonesia untuk IDR.
- Gunakan inline keyboard untuk navigasi dan pagination.
- Pastikan semua informasi penting dapat dibaca tanpa membuka WebApp.

## 13.2 Konsistensi label sumber

Gunakan label berikut secara konsisten:

- `Sumber: INDODAX`
- `Sumber: CoinPaprika`
- `Sumber: Frankfurter — kurs referensi`
- `Sumber: Alpha Vantage — EOD/delayed` (jika kelak diaktifkan)

Jangan menulis `real-time` kecuali sumber dan lisensi data benar-benar memberikan data real-time serta hak penggunaannya sudah dipastikan.

## 13.3 Pesan error

Contoh bahasa error:

- `Aset tidak ditemukan. Coba simbol atau nama lain.`
- `Pair ini belum tersedia di INDODAX.`
- `Provider sedang tidak dapat dihubungi. Coba kembali beberapa saat lagi.`
- `Data terakhir terlalu lama untuk digunakan sebagai alert.`
- `Kurs referensi untuk mata uang tersebut belum tersedia.`
- `Batas permintaan sementara tercapai. Data tersimpan masih dapat ditampilkan dengan label waktu pembaruan.`

Jangan tampilkan stack trace atau error internal mentah ke pengguna.

---

# 14. Tahapan implementasi

Antigravity harus menyelesaikan tahap secara berurutan dan melakukan test setiap tahap.

## TASK 0 — Project foundation

- [ ] Inisialisasi TypeScript project.
- [ ] Setup linting/formatting.
- [ ] Setup Zod env validation.
- [ ] Setup Pino logging.
- [ ] Setup Docker Compose PostgreSQL dan Redis.
- [ ] Setup Drizzle ORM dan migration awal.
- [ ] Setup grammY bot dengan `/start` dan `/help`.
- [ ] Tambahkan graceful shutdown.

**Definition of Done:** bot dapat berjalan di lokal dan Docker; database terkoneksi; secret tidak tersimpan di source code.

## TASK 1 — Provider layer

- [ ] Buat HTTP client dengan timeout dan retry.
- [ ] Implementasi `IndodaxProvider`.
- [ ] Implementasi `CoinPaprikaProvider`.
- [ ] Implementasi `FrankfurterProvider`.
- [ ] Validasi payload provider.
- [ ] Buat normalisasi `MarketTicker`, `FxRate`, `AssetSearchResult`.
- [ ] Tambahkan unit test dengan fixture respons API.
- [ ] Buat health check provider.

**Definition of Done:** ketiga provider dapat dipanggil melalui service internal; error satu provider tidak menjatuhkan aplikasi.

## TASK 2 — Market commands

- [ ] Implementasi `/market`.
- [ ] Implementasi `/crypto`.
- [ ] Implementasi `/search`.
- [ ] Implementasi `/top gainers` dan `/top losers`.
- [ ] Buat format angka, persentase, dan timestamp.
- [ ] Pastikan semua pesan menunjukkan provider dan freshness.

**Definition of Done:** pengguna bisa memeriksa aset lokal INDODAX dan aset global CoinPaprika; data tidak dicampur tanpa label.

## TASK 3 — FX commands

- [ ] Implementasi currency catalog cache.
- [ ] Validasi `IDR` pada katalog provider.
- [ ] Implementasi `/fx`.
- [ ] Implementasi `/convert`.
- [ ] Format kurs dan tanggal referensi.
- [ ] Test amount invalid, currency unsupported, dan provider error.

**Definition of Done:** konversi berjalan dengan kurs referensi yang memiliki tanggal sumber.

## TASK 4 — Watchlist

- [ ] Buat schema dan repository watchlist.
- [ ] Implementasi `/watchlist`.
- [ ] Implementasi `/watchadd`.
- [ ] Implementasi `/watchremove`.
- [ ] Tambahkan inline buttons.
- [ ] Terapkan batas jumlah item dan unique constraint.

**Definition of Done:** watchlist tiap pengguna terisolasi dan tetap tersimpan setelah bot restart.

## TASK 5 — Price alerts

- [ ] Buat schema alert.
- [ ] Implementasi create/list/delete/pause/resume.
- [ ] Setup BullMQ worker.
- [ ] Poll ticker secara batch per provider.
- [ ] Implementasi threshold crossing state machine.
- [ ] Implementasi anti-spam/cooldown.
- [ ] Cegah trigger dari stale data.
- [ ] Tangani Telegram send failure dan retry.

**Definition of Done:** alert hanya dikirim saat kondisi melintasi ambang, tidak spam setiap polling, dan bertahan setelah restart.

## TASK 6 — Charts and snapshots

- [ ] Setup snapshot worker untuk pair INDODAX populer.
- [ ] Simpan snapshot pada interval konservatif.
- [ ] Gunakan OHLCV CoinPaprika sesuai hak akses free tier.
- [ ] Render chart lokal.
- [ ] Implementasi `/chart`.
- [ ] Tambahkan retention policy.

**Definition of Done:** chart menunjukkan sumber, periode, mata uang, dan data aktual yang memang tersedia.

## TASK 7 — Hardening and deployment

- [ ] Tambahkan rate limiting per user.
- [ ] Tambahkan provider circuit breaker.
- [ ] Tambahkan usage counter CoinPaprika.
- [ ] Tambahkan `/status`.
- [ ] Tambahkan backup dan restore instructions.
- [ ] Test restart bot/worker.
- [ ] Test provider outage.
- [ ] Test limit API dan stale data.
- [ ] Deploy ke VPS.

**Definition of Done:** bot berjalan stabil, data tidak menyesatkan, dan layanan dapat dipantau serta dipulihkan.

---

# 15. Acceptance criteria keseluruhan

Proyek dianggap memenuhi MVP bila:

1. `/start` membuat user record dengan benar dan menampilkan menu.
2. `/market` menggabungkan data tiga sumber secara terpisah dan menampilkan sumber/waktu masing-masing.
3. `/crypto BTC` dapat menampilkan ticker INDODAX BTC/IDR dan data CoinPaprika jika keduanya tersedia.
4. Jika salah satu provider gagal, provider lain tetap dapat digunakan.
5. `/search` tidak salah memilih aset ketika simbol duplikat.
6. `/top gainers` dan `/top losers` tidak menampilkan aset dengan nilai perubahan kosong.
7. `/convert 100 USD IDR` menggunakan Frankfurter dan menampilkan tanggal referensi serta disclaimer kurs.
8. Watchlist bersifat personal dan tersimpan permanen di database.
9. Alert hanya trigger sekali saat kondisi melintasi ambang.
10. Alert tidak dikirim dari data stale.
11. API cache benar-benar mencegah request berlebihan.
12. Bot tidak pernah meminta atau menyimpan private API key exchange pengguna.
13. Token dan secret tidak ada di Git repository maupun log.
14. Bot dan worker pulih setelah restart tanpa kehilangan user/watchlist/alert.
15. Semua kalkulasi harga dan kurs menggunakan decimal-safe arithmetic.
16. Test unit dan integration berjalan; tidak ada test kritis yang di-skip tanpa alasan terdokumentasi.
17. Pesan harga tidak pernah menyebut data sebagai real-time tanpa dasar provider yang valid.
18. Ketentuan CoinPaprika dipenuhi untuk mode penggunaan yang dipilih; akses publik tidak dibuka sebelum lisensi diverifikasi.

---

# 16. Rencana fase lanjutan

## Fase 2 — Stock market

Kandidat awal: Alpha Vantage.

Yang perlu dikerjakan:

- Verifikasi ticker yang dibutuhkan.
- Uji dukungan pasar AS dan pasar internasional.
- Uji apakah saham Indonesia/IDX yang dibutuhkan tersedia.
- Tampilkan data EOD/delayed sesuai plan.
- Tambahkan cache yang ketat karena free tier hanya 25 request/hari.
- Jangan aktifkan polling real-time.
- Buat provider adapter dan command `/stock` hanya setelah coverage terbukti.

Jika saham IDX tidak tersedia atau penggunaan free tier tidak sesuai, cari provider resmi/berlisensi lain. Jangan mengganti dengan scraping website secara diam-diam.

## Fase 3 — Commodity and macro

Tambahkan emas, perak, minyak, indeks ekonomi, inflasi, dan suku bunga setelah provider dan unit datanya diverifikasi. Bedakan data spot, futures, reference, dan end-of-day.

## Fase 4 — DARFIN MARKET WebApp

Buat dashboard web/mobile:

- Market overview.
- Search assets.
- Watchlist.
- Alerts management.
- Historical charts.
- Provider status.
- Pengaturan timezone dan mata uang.

Bot tetap menjadi interface notifikasi utama.

## Fase 5 — Public product readiness

Sebelum bot dibuka untuk publik:

- Evaluasi lisensi setiap provider, terutama CoinPaprika.
- Pastikan hak redistribusi/penayangan data kepada pengguna.
- Perbarui privacy policy dan terms of use.
- Tambahkan admin controls dan abuse prevention.
- Review biaya/kuota API untuk skala pengguna yang ditargetkan.
- Uji load dan database retention.

---

# 17. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| API provider down | Harga tidak tersedia | Provider health, cache berlabel stale, graceful degradation |
| Data update tidak secepat yang diharapkan | Alert terlambat | Tampilkan timestamp dan freshness; jangan menjanjikan real-time |
| Kuota CoinPaprika habis | Data global gagal | Cache, usage counter, batasi polling, evaluasi lisensi/provider alternatif |
| Lisensi CoinPaprika free tier tidak sesuai bot publik | Risiko penggunaan data tidak sah | Private testing dahulu; verifikasi terms/lisensi sebelum public launch |
| Pair INDODAX tidak aktif | Simbol tidak ditemukan | Sync `/api/pairs`, validasi pair aktif |
| Simbol aset duplikat | Harga aset salah | Gunakan provider `coin_id` dan selection flow |
| Kurs reference dianggap kurs bank | Salah persepsi pengguna | Label reference rate dan tampilkan tanggal sumber |
| Worker mengirim alert berulang | Spam Telegram | Crossing state machine, triggered status, cooldown |
| API response berubah | Parser gagal | Zod schema validation, fixtures, alert provider health |
| Presisi decimal salah | Nilai harga/konversi keliru | Decimal strings dan decimal library |

---

# 18. Referensi resmi

Sumber dokumentasi yang harus dijadikan acuan saat coding:

1. **INDODAX Official API Documentation**  
   https://github.com/btcid/indodax-official-api-docs  
   https://github.com/btcid/indodax-official-api-docs/blob/master/Public-RestAPI.md

2. **CoinPaprika Developer Hub**  
   https://coinpaprika.com/developers

3. **CoinPaprika API plans, limits, and terms**  
   https://coinpaprika.com/api  
   https://coinpaprika.com/api/pricing

4. **Frankfurter API v2 documentation**  
   https://frankfurter.dev/  
   https://frankfurter.dev/id/

5. **Alpha Vantage API documentation**  
   https://www.alphavantage.co/documentation/

6. **Alpha Vantage free key and usage limit**  
   https://www.alphavantage.co/support/#api-key

7. **grammY documentation**  
   https://grammy.dev/

8. **Telegram Bot API**  
   https://core.telegram.org/bots/api

9. **Drizzle ORM documentation**  
   https://orm.drizzle.team/docs/overview

10. **BullMQ documentation**  
    https://docs.bullmq.io/

11. **PostgreSQL documentation**  
    https://www.postgresql.org/docs/

12. **Redis documentation**  
    https://redis.io/docs/latest/

---

# 19. Arahan final untuk Antigravity

Mulai dari **TASK 0**, kemudian lanjutkan secara bertahap sampai MVP selesai. Jangan hanya membuat mockup atau contoh command; implementasikan koneksi API sungguhan, database, worker, cache, dan alert sesuai kebutuhan.

Sebelum menyatakan sebuah task selesai:

1. Jalankan test terkait.
2. Periksa log untuk memastikan tidak ada secret yang bocor.
3. Verifikasi struktur respons API dengan data sungguhan bila akses jaringan tersedia.
4. Catat keterbatasan provider yang ditemukan.
5. Perbarui README dengan cara setup dan menjalankan sistem.
6. Jangan tandai fitur selesai jika baru berupa placeholder.

**Prioritas paling penting:** data harus akurat secara sumber, tidak stale tanpa label, tidak mencampur harga antar-market, dan tidak melampaui batas/lisensi provider. Bangun fondasi yang benar terlebih dahulu; fitur tambahan dapat menyusul.

---

**DARFIN MARKET — Built by DARFIN**
