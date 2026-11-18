# DARFIN MARKET

**Market data, watchlist, and alerts langsung dari Telegram.**

Bot Telegram read-only berbasis Node.js 24 + TypeScript + grammY + PostgreSQL (Drizzle) + Redis (BullMQ) untuk memantau:
- **Crypto Indonesia (IDR)**: INDODAX Public REST API (tanpa API key)
- **Crypto Global (USD)**: CoinPaprika API (tanpa API key untuk penggunaan personal/testing; atribusi `Powered by CoinPaprika`)
- **Saham Indonesia (IDX) & Internasional (US/Global)**:
  - **Finnhub** (`FINNHUB_API_KEY`): US stocks real-time quote (free tier 60 req/menit)
  - **Twelve Data** (`TWELVE_DATA_API_KEY`): Saham IDX (`BBCA`, `BBRI`, `BMRI`, `TLKM`, `ASII`, `GOTO`, dll.) & Global + historical chart (free tier 800 req/hari)
  - **Alpha Vantage** (`ALPHA_VANTAGE_API_KEY`): Opsional fallback global EOD (free tier 25 req/hari)
- **Kurs Referensi & Konversi**: Frankfurter API v2 (tanpa API key)
- **Grafik Lokal**: Render PNG server-side dengan `@resvg/resvg-js`
- **Telegram Mini App (Live Terminal)**: Dashboard mobile interaktif dengan grafik touch-scrubber, Server-Sent Events (SSE) live ticks, switcher saham IDX & US, crypto, kurs, watchlist, dan price alerts (autentikasi HMAC-SHA256 Telegram `initData`)
- **Watchlist Personal & Price Alerts**: Threshold-crossing anti-spam & anti-stale via BullMQ worker

---

## Persiapan API Key & Environment

Salin `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Isi variabel berikut di `.env`:

1. **`TELEGRAM_BOT_TOKEN`** (wajib): Buat bot baru lewat `@BotFather` di Telegram.
2. **`FINNHUB_API_KEY`** (disarankan untuk saham US real-time): Daftar gratis di https://finnhub.io/register
3. **`TWELVE_DATA_API_KEY`** (disarankan untuk saham Indonesia IDX & grafik saham): Daftar gratis di https://twelvedata.com/pricing
4. **`ALPHA_VANTAGE_API_KEY`** (opsional fallback): https://www.alphavantage.co/support/#api-key
5. **`WEBAPP_URL`** (untuk Telegram Mini App): URL HTTPS publik yang mengarah ke port `WEBAPP_PORT` (default `3000`). Telegram mewajibkan HTTPS; gunakan Caddy/Nginx reverse proxy atau Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3000`).
6. **`DATABASE_URL`** & **`POSTGRES_PASSWORD`**: Ganti password default sebelum deploy VPS.

### Preview Mini App secara Lokal (Tanpa Bot Token / DB)

```bash
npm run dev:webapp
# Buka http://localhost:3000 di browser
```

> Jangan pernah commit file `.env` ke Git.

---

## Deploy di Render.com (1 Service + Auto HTTPS Mini App)

Repo ini menyertakan `render.yaml` siap pakai untuk Render.com Free Tier:

1. Push repo ini ke GitHub.
2. Siapkan PostgreSQL permanen gratis (disarankan **Neon.tech** atau **Supabase**, karena Render Postgres Free dihapus setelah 30 hari).
3. *(Opsional)* Siapkan **Upstash Redis** gratis (`rediss://...`), atau kosongkan `REDIS_URL` untuk memakai in-memory cache + embedded interval worker bawaan.
4. Di Render.com pilih **New → Blueprint** dan hubungkan repo ini (`RUN_EMBEDDED_WORKER=true`, `healthCheckPath: /healthz`).
5. Isi Environment Variables di dashboard Render:
   - `TELEGRAM_BOT_TOKEN`
   - `DATABASE_URL`
   - `FINNHUB_API_KEY` (saham US real-time)
   - `TWELVE_DATA_API_KEY` (saham Indonesia IDX & chart saham)
   - `REDIS_URL` *(opsional)*
   - `PORT` dan `WEBAPP_URL` otomatis dibaca dari `PORT` dan `RENDER_EXTERNAL_URL` bawaan Render.
6. **Cron Keepalive 10 Menit** (cegah sleep 15 menit):
   - Di **cron-job.org** atau **UptimeRobot**, atur ping HTTP `GET`/`HEAD` tiap **10 menit** ke:
     ```text
     https://<nama-app>.onrender.com/healthz
     ```
   - Endpoint `/healthz` merespons `<1ms` tanpa memanggil API market atau memakan kuota.

> Pastikan jumlah instance Render = **1** saat memakai Telegram long polling agar tidak terjadi konflik update.

---

## Menjalankan dengan Docker Compose (VPS)

```bash
docker compose up -d --build
```

Services yang berjalan:
- `postgres` (PostgreSQL 17, internal network, persistent volume)
- `redis` (Redis 7 AOF, internal network)
- `bot` (Telegram long polling)
- `worker` (BullMQ batch alert checker + INDODAX snapshot collector + retention cleanup)

Cek log:

```bash
docker compose logs -f bot worker
```

---

## Menjalankan secara Lokal (Development)

Pastikan PostgreSQL & Redis berjalan, lalu:

```bash
npm install
npm run db:migrate
npm run dev:bot
# Di terminal terpisah:
npm run dev:worker
```

---

## Menjalankan Test & Typecheck

```bash
npm run typecheck
npm test
npm run build
```

---

## Daftar Command Utama

| Command | Fungsi |
|---|---|
| `/start` | Registrasi & menu utama |
| `/market` | Ringkasan crypto global, INDODAX IDR, & kurs USD/IDR |
| `/crypto BTC` | Harga crypto lokal INDODAX + global CoinPaprika |
| `/stocks` | Daftar saham populer Indonesia (IDX) & Internasional (US) |
| `/stock BBCA` | Cek harga saham IDX (`BBCA`, `BBRI`, `TLKM`, `BMRI`, dll.) |
| `/stock AAPL` | Cek harga saham US/Global (`AAPL`, `NVDA`, `MSFT`, `TSLA`, dll.) |
| `/search <keyword>` | Cari aset crypto & saham |
| `/top gainers` / `/top losers` | Top movers 24 jam (CoinPaprika) |
| `/fx USD` | Kurs referensi Frankfurter |
| `/convert 100 USD IDR` | Konversi mata uang decimal-safe |
| `/chart BTC 1d` / `/chart BBCA 30d` | Grafik harga (PNG lokal) |
| `/watchlist` / `/watchadd` / `/watchremove` | Watchlist personal crypto & saham |
| `/alert add BTC above 1500000000 IDR` | Buat alert harga |
| `/alerts` / `/alertpause` / `/alertresume` / `/alertremove` | Kelola alert |
| `/settings` | Ubah zona waktu (default `Asia/Makassar`) |
| `/status` | Status bot, DB, Redis, provider, & kuota API |
| `/delete_my_data` | Hapus seluruh data akun pengguna |

---

## Backup & Restore PostgreSQL

**Backup:**
```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U darfin darfin_market > backups/darfin_$(date +%F_%H%M).sql
```

**Restore:**
```bash
cat backups/darfin_YYYY-MM-DD_HHMM.sql | docker compose exec -T postgres psql -U darfin -d darfin_market
```

---

## Catatan Keterbatasan & Lisensi Provider

- **CoinPaprika free tier**: ~20.000 request/bulan, update hingga ~10 menit, OHLCV gratis terbatas 24 jam terakhir, untuk penggunaan personal + wajib atribusi `Powered by CoinPaprika`. Evaluasi lisensi komersial sebelum dibuka sebagai bot publik massal.
- **Frankfurter v2**: Kurs referensi bank sentral (diperbarui berkala), bukan harga forex trading real-time atau kurs jual/beli bank.
- **Saham (IDX & US)**: Label sumber selalu mengikuti sifat feed aktual (`Finnhub — US real-time/last trade`, `Twelve Data (IDX) — delayed/EOD sesuai plan`, `Alpha Vantage — EOD/delayed`).
- Bot bersifat **read-only** dan tidak melakukan eksekusi transaksi atau memberikan rekomendasi investasi.
