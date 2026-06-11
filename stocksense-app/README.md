# StockSense LQ45

Dashboard analisis saham LQ45 (IDX). Repo ini berisi dua bagian:

```
stocksense-app/
  backend/    # API FastAPI (Python) — data saham, indikator, berita, sentimen, Groq LLM
  frontend/   # Aplikasi React (Vite) — UI dashboard
```

## 1. Menjalankan backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # isi GROQ_API_KEY bila ada (opsional)
uvicorn main:app --reload --port 8000
```

Backend jalan di http://localhost:8000 (dokumentasi otomatis di /docs).

Catatan: endpoint `prediction` dan `sentiment` masih memakai data dummy
(tinggal kamu isi dengan model ML/finetune kamu di `routers/prediction.py`
dan `routers/sentiment.py`). Endpoint makro ekonomi belum ada di backend,
jadi halaman Makro di frontend memakai data dummy.

## 2. Menjalankan frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend jalan di http://localhost:5173. Request ke `/api/...` otomatis
di-proxy ke http://localhost:8000 (lihat `frontend/vite.config.js`), jadi
tidak ada masalah CORS saat development. Jalankan backend lebih dulu.

## 3. Build produksi & hosting

```bash
cd frontend
npm run build      # hasil di frontend/dist/
```

Dua pilihan hosting (detail lengkap ada di `frontend/README.md`):

- **Satu host (paling murah):** backend FastAPI sekaligus menyajikan hasil
  build React. Lihat `frontend/backend_serve_snippet.md`.
- **Terpisah:** frontend di Vercel/Netlify/Cloudflare Pages (gratis), backend
  di Render/Railway/Fly.io/Hugging Face Spaces. Set `VITE_API_BASE` ke URL backend.

## Groq API Key

Panggilan Groq dilakukan dari backend (proxy), bukan dari browser. Key bisa
diisi lewat tombol "Groq API Key" di UI (dikirim ke backend per request) atau
di-set sebagai `GROQ_API_KEY` di `backend/.env`.
