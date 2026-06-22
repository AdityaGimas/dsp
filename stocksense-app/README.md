# StockSense LQ45

Dashboard analisis saham LQ45 (IDX) dengan analisis teknikal, prediksi harga (ML),
berita & sentimen, data makro ekonomi, dan asisten **Chat AI** yang bisa membaca
gambar grafik. Repo ini berisi dua bagian:

```
stocksense-app/
  backend/    # API FastAPI (Python) — data saham, indikator, berita, sentimen, makro, Groq LLM, Chat AI
  frontend/   # Aplikasi React (Vite) — UI dashboard
```

## Fitur utama

- **Overview saham** — harga real-time (yfinance), ringkasan teknikal + analisis Groq LLM.
- **Forecasting** — prediksi harga memakai model **XGBoost** (`routers/prediction.py`),
  lengkap dengan rekomendasi BUY/SELL/HOLD berbasis expected return & RSI.
- **Indikator Teknikal** — RSI, MACD, Moving Average / golden cross, dll. (library `ta`).
- **Berita & Sentimen** — scraping berita + **analisis sentimen dual-model**:
  IndoBERT finetuned (via Hugging Face Space) digabung dengan Groq LLM.
- **Makro Ekonomi** — data **nyata**: BI Rate, Inflasi, PDB, plus IHSG/USD-IDR/
  komoditas via yfinance (`services/macro_data.py`, `routers/macro.py`).
- **Chat AI** 🆕 — halaman chat dengan AI yang **sadar konteks saham aktif**
  (harga, RSI, MACD, golden cross, rekomendasi ML) dan bisa menerima **upload
  gambar** grafik/candlestick untuk dianalisis teknikalnya (model vision Groq).
- **Multi-key Groq + rotasi otomatis** — beberapa API key dipakai bergiliran
  (round-robin) dengan fallback saat kena limit, plus **JSON mode** agar output LLM valid.
- **Cache + tombol Refresh** — data di-cache (TTL) supaya hemat & cepat; tiap
  halaman punya tombol **↻ Refresh** untuk menembus cache dan menarik data terbaru.

## 1. Menjalankan backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# buat file .env lalu isi key (lihat bagian "Konfigurasi .env" di bawah)
uvicorn main:app --reload --port 8000
```

Backend jalan di http://localhost:8000 (dokumentasi otomatis di `/docs`).

> Catatan: prediksi harga (XGBoost), sentimen (IndoBERT + LLM), dan data makro
> kini sudah memakai data/model **nyata** — tidak lagi dummy seperti versi awal.

## 2. Menjalankan frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend jalan di http://localhost:5173. Request ke `/api/...` otomatis di-proxy
ke http://localhost:8000 (lihat `frontend/vite.config.js`), jadi tidak ada masalah
CORS saat development. Jalankan backend lebih dulu.

## 3. Konfigurasi .env (backend/.env)

Buat file `backend/.env` dan isi sesuai kebutuhan:

```dotenv
# ── Groq LLM ──
# Boleh satu key, atau BANYAK key sekaligus (dipakai bergiliran + fallback limit).
GROQ_API_KEY=gsk_xxx                  # cara lama (1 key) — tetap didukung
# atau beberapa key dipisah koma:
GROQ_API_KEYS=gsk_a,gsk_b,gsk_c
# atau bernomor:
# GROQ_API_KEY_1=gsk_a
# GROQ_API_KEY_2=gsk_b

# Model khusus Chat AI (multimodal/vision). Opsional — ada default.
GROQ_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# ── Sentimen (Hugging Face Space — IndoBERT) ──
HF_SPACE_URL=https://reehandn-sentiment-api.hf.space   # default sudah diisi
HF_API_TOKEN=hf_xxx                  # opsional, hanya bila Space-mu privat
```

Key Groq juga bisa diisi lewat tombol **"Groq API Key"** di UI (dikirim ke backend
per request). Panggilan Groq selalu lewat backend (proxy), tidak pernah dari browser.

## 4. Ringkasan endpoint API

| Prefix | Fungsi |
|--------|--------|
| `/api/stocks` | Daftar saham, info harga, riwayat, indikator teknikal (dukung `?refresh=true`) |
| `/api/prediction/{ticker}` | Prediksi harga + rekomendasi (XGBoost) |
| `/api/news/{ticker}` | Berita terbaru hasil scraping |
| `/api/sentiment/predict` | Analisis sentimen (IndoBERT + Groq LLM) |
| `/api/grok/*` | Analisis teknikal, ringkasan berita, rekomendasi akhir (Groq LLM, JSON mode) |
| `/api/macro` | Data makro: BI Rate, Inflasi, PDB, IHSG, kurs, komoditas (dukung `?refresh=true`) |
| `/api/chat` 🆕 | Chat AI (teks + gambar), sadar konteks saham aktif |

## 5. Build produksi & hosting

```bash
cd frontend
npm run build      # hasil di frontend/dist/
```

Dua pilihan hosting (detail lengkap ada di `frontend/README.md`):

- **Satu host (paling murah):** backend FastAPI sekaligus menyajikan hasil build
  React. Lihat `frontend/backend_serve_snippet.md`.
- **Terpisah:** frontend di Vercel/Netlify/Cloudflare Pages (gratis), backend di
  Render/Railway/Fly.io/Hugging Face Spaces. Set `VITE_API_BASE` ke URL backend.

## Struktur kode singkat

```
backend/
  main.py                     # registrasi router & CORS
  routers/
    stocks.py                 # harga, info, riwayat, indikator (cache + refresh)
    prediction.py             # prediksi harga XGBoost
    news.py                   # scraping berita
    sentiment.py              # sentimen: IndoBERT (HF Space) + Groq LLM
    grok.py                   # proxy Groq: multi-key rotate, JSON mode, prompt anti-bias
    macro.py                  # endpoint makro
    chat.py                   # 🆕 Chat AI (teks + gambar / vision)
  services/
    market_data.py            # ambil & olah data pasar (yfinance)
    macro_data.py             # data makro nyata (BI Rate/Inflasi/PDB + yfinance)
    news_scraper.py           # util scraping berita
    cache.py                  # ttl_cache + bypass saat refresh
  hf_space/                   # Dockerfile + app.py untuk HF Space (model IndoBERT)
frontend/
  src/
    pages/                    # Overview, Forecasting, BeritaSentimen, IndikatorTeknikal, MakroEkonomi, ChatAI 🆕, LandingPage
    components/               # Sidebar, Topbar, Layout, TickerSearchBar
    context/AppContext.jsx    # state global (saham aktif, watchlist)
    api/client.js             # client API terpusat
    styles/                   # style.css + pages.css
```
