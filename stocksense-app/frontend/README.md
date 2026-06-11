# StockSense LQ45 — Frontend React (Vite)

Konversi React dari dashboard StockSense LQ45 (sebelumnya HTML/JS statis).
Frontend ini terhubung ke backend FastAPI kamu yang sudah ada (folder `backend/`).

## Stack

- React 18 + Vite 5
- React Router 6 (routing antar halaman)
- Chart.js 4 + react-chartjs-2 (semua grafik)
- Context API (state global: ticker aktif, watchlist, Groq API key)
- CSS murni (dipindahkan apa adanya dari `style.css` + `pages.css`), tema gelap

## Struktur folder

```
stocksense-react/
  index.html
  package.json
  vite.config.js          # proxy /api -> http://localhost:8000 (saat dev)
  .env.example
  src/
    main.jsx
    App.jsx               # definisi route
    chartSetup.js         # registrasi Chart.js
    api/client.js         # semua panggilan ke backend FastAPI
    utils/format.js       # helper format angka/tanggal + cache
    context/AppContext.jsx
    components/            # Layout, Topbar, Sidebar, TickerSearchBar, GroqModal
    pages/                # Overview, Forecasting, IndikatorTeknikal, BeritaSentimen, MakroEkonomi
    styles/               # style.css, pages.css
```

## Halaman & status data

| Halaman | Route | Sumber data |
| --- | --- | --- |
| Overview | `/` | Backend (harga, info, history, indikator, berita, sentimen, Groq) |
| Forecasting | `/forecasting` | Backend (history + prediksi) + sebagian skenario dummy |
| Indikator Teknikal | `/indikator` | Backend (indikator + info) + support/resistance dummy |
| Berita & Sentimen | `/berita` | Backend (berita + sentimen + ringkasan Groq) |
| Makro Ekonomi | `/makro` | Dummy (backend belum punya endpoint makro) |

Catatan: halaman yang dulunya mockup tetap memakai data dummy di bagian yang
belum didukung backend. Begitu kamu menambah endpoint terkait, tinggal sambungkan
lewat `src/api/client.js`.

## Cara menjalankan (development)

1. Jalankan backend FastAPI lebih dulu:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
2. Jalankan frontend:
   ```bash
   npm install
   npm run dev
   ```
   Buka http://localhost:5173. Semua request ke `/api/...` otomatis di-proxy ke
   `http://localhost:8000` (lihat `vite.config.js`), jadi tidak ada masalah CORS
   saat development.

## Build produksi

```bash
npm run build      # hasil ada di folder dist/
npm run preview    # cek hasil build secara lokal
```

## Groq API Key

Panggilan ke Groq TIDAK dilakukan dari browser. Frontend mengirim key (opsional)
ke backend, dan backend yang memanggil Groq (proxy). Key bisa diisi 2 cara:

- Lewat tombol "Groq API Key" di Topbar (disimpan di localStorage browser, lalu
  dikirim ke backend pada field `api_key`).
- Atau set `GROQ_API_KEY` di file `.env` backend (lihat `backend/.env.example`).

## Hosting (gratis / sangat murah)

Ada dua pola. Pilih salah satu.

### Pola A — Satu host (backend menyajikan frontend) — paling murah

Build frontend lalu suruh FastAPI menyajikan folder `dist/`. Cukup deploy SATU
layanan (backend saja). Lihat `backend_serve_snippet.md` untuk potongan kode
yang perlu ditambahkan ke `backend/main.py`.

Host backend gratis/murah: Render, Railway, Fly.io, atau Hugging Face Spaces.

### Pola B — Frontend dan backend terpisah

- Frontend (file statis): Vercel, Netlify, atau Cloudflare Pages (gratis).
  Saat deploy, set environment variable `VITE_API_BASE` ke URL backend kamu,
  misalnya `https://stocksense-api.onrender.com/api`.
- Backend: Render / Railway / Fly.io / Hugging Face Spaces.

Default `VITE_API_BASE` adalah `/api` (cocok untuk Pola A dan untuk dev dengan proxy).
Ganti hanya jika frontend dan backend beda domain (Pola B).

## Variabel environment frontend

Lihat `.env.example`:

```
VITE_API_BASE=/api
```
