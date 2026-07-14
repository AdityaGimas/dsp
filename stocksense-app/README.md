# 📈 StockSense LQ45

![StockSense Banner](https://img.shields.io/badge/StockSense-Dashboard-blue?style=for-the-badge&logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-XGBoost-orange?style=for-the-badge)

**StockSense LQ45** adalah dashboard analisis saham komprehensif yang dikhususkan untuk indeks saham LQ45 (Bursa Efek Indonesia / IDX). Aplikasi ini menyediakan analisis teknikal, prediksi harga menggunakan Machine Learning, analisis sentimen berita, data makro ekonomi, dan dilengkapi dengan asisten **Chat AI** cerdas yang mampu menganalisis grafik candlestick (multimodal vision).

Proyek ini dibangun menggunakan arsitektur monorepo yang memisahkan antara frontend (React/Vite) dan backend (FastAPI/Python).

---

## ✨ Fitur Utama

- 📊 **Overview Saham Real-Time:** Menampilkan data harga saham secara live menggunakan `yfinance`, lengkap dengan metrik kunci, ringkasan teknikal, dan kesimpulan cerdas dari **Groq LLM**.
- 🤖 **Forecasting Harga (Dual-Model):** Memprediksi pergerakan harga saham 3 hari ke depan menggunakan dua pendekatan paralel: model Machine Learning **XGBoost** dan penalaran teknikal **Groq LLM**. Keduanya memberikan prediksi harga (dengan rentang *high/low*) serta sinyal rekomendasi (BUY/SELL/HOLD) untuk komparasi yang lebih mantap.
- 📉 **Indikator Teknikal Lengkap:** Kalkulasi otomatis untuk berbagai indikator teknikal seperti RSI (Relative Strength Index), MACD, Moving Average (untuk deteksi *golden/death cross*), dan indikator lainnya menggunakan pustaka `ta`.
- 📰 **Analisis Berita & Sentimen:** Secara otomatis melakukan scraping berita terbaru terkait saham yang dipilih dan menganalisis sentimen pasar menggunakan arsitektur **Tri-Model** (3 Pendekatan): Model **IndoBERT** yang di-finetune (di-hosting via Hugging Face Space) digabungkan dengan dua model berbeda dari **Groq LLM** secara paralel untuk memberikan komparasi sentimen yang lebih komprehensif.
- 🌍 **Data Makro Ekonomi Nyata:** Menyajikan gambaran ekonomi makro yang mempengaruhi pasar seperti BI Rate, tingkat Inflasi, PDB Indonesia, serta data IHSG, nilai tukar USD-IDR, dan harga komoditas utama dunia.
- 💬 **Chat AI Multimodal 🆕:** Asisten virtual cerdas yang memahami konteks saham aktif (harga saat ini, RSI, MACD, sinyal ML). AI ini juga mendukung **analisis gambar** (upload screenshot chart/candlestick) yang diproses menggunakan model vision dari Groq untuk memberikan pandangan teknikal secara instan.
- 🔑 **Sistem Rotasi API Key (Groq):** Mendukung penggunaan banyak API Key Groq secara bergantian (round-robin) untuk menghindari limitasi rate-limit (fallback system), dan memaksakan output menggunakan **JSON Mode** untuk integrasi yang stabil.
- ⚡ **Sistem Caching Cerdas:** Data disajikan dengan cepat berkat sistem cache (TTL) di backend. Dilengkapi tombol **↻ Refresh** di antarmuka pengguna untuk mengambil pembaruan data secara instan saat dibutuhkan.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React.js 18 + Vite
- **Routing:** React Router DOM
- **Data Visualization:** Chart.js + React-Chartjs-2
- **Styling:** CSS3 Vanilla

### Backend
- **Framework:** FastAPI + Uvicorn
- **Data Fetching:** yfinance, pandas, numpy
- **Technical Analysis:** `ta` library
- **Web Scraping:** BeautifulSoup4, Newspaper3k, Trafilatura, DuckDuckGo Search
- **Machine Learning:** XGBoost, Scikit-Learn (Predictive Modeling)
- **NLP & AI:** Hugging Face Hub (IndoBERT), Groq API (LLaMA 3/4)

---

## 📂 Struktur Proyek

```text
stocksense-app/
├── backend/                  # API Server (FastAPI / Python)
│   ├── main.py               # Entry point aplikasi & konfigurasi CORS
│   ├── routers/              # Endpoint API terpisah berdasar fitur
│   │   ├── stocks.py         # Data harga, history, indikator teknikal
│   │   ├── prediction.py     # Endpoint Machine Learning (XGBoost)
│   │   ├── news.py           # Endpoint Scraping berita pasar
│   │   ├── sentiment.py      # Endpoint Analisis Sentimen (IndoBERT + Groq)
│   │   ├── grok.py           # Proxy & rotasi Groq LLM API
│   │   ├── macro.py          # Endpoint data makro ekonomi
│   │   └── chat.py           # Endpoint Chat AI Multimodal (Teks + Gambar)
│   ├── services/             # Logika bisnis dan pengolahan data
│   │   ├── market_data.py    # Modul yfinance
│   │   ├── macro_data.py     # Modul agregasi data makro
│   │   ├── news_scraper.py   # Modul utilitas scraping berita web
│   │   └── cache.py          # Modul TTL Cache kustom
│   ├── hf_space/             # Dockerfile & app.py untuk deployment HF Space IndoBERT
│   └── requirements.txt      # Dependensi Python
│
├── frontend/                 # Client UI (React / Vite)
│   ├── src/
│   │   ├── pages/            # Halaman UI (Overview, Forecasting, Chat AI, dll.)
│   │   ├── components/       # Komponen Reusable (Sidebar, Topbar, Search)
│   │   ├── context/          # State management global
│   │   ├── api/              # Konfigurasi client API (Axios/Fetch)
│   │   └── styles/           # CSS Utama
│   ├── package.json          # Dependensi NPM
│   └── vite.config.js        # Konfigurasi Vite & Proxy API
└── README.md                 # Dokumentasi utama (File ini)
```

---

## 🚀 Panduan Instalasi & Menjalankan Aplikasi

Ikuti panduan langkah demi langkah di bawah ini untuk menjalankan **StockSense LQ45** di mesin lokal Anda.

### 1. Prasyarat Sistem
Pastikan perangkat Anda sudah terinstal beberapa perangkat lunak berikut:
- **Node.js (v18+)** dan **NPM**. Anda dapat mengeceknya dengan membuka terminal dan menjalankan perintah:
  ```bash
  node -v
  npm -v
  ```
- **Python (v3.9 atau lebih baru)**. Cek versinya dengan perintah:
  ```bash
  python --version
  ```
- Akun dan API Key [Groq](https://console.groq.com/keys) (Gratis).
- **Git** (Opsional, untuk melakukan *clone* repository).

### 2. Unduh Repository
Pertama, *clone* repository ini ke komputer Anda, lalu masuk ke foldernya:
```bash
git clone https://github.com/username/stocksense-app.git
cd stocksense-app
```

---

### 3. Setup & Menjalankan Backend (Python FastAPI)

Backend membutuhkan *virtual environment* agar dependensi Python (seperti yfinance, XGBoost, dll) tidak bentrok dengan *environment* global di komputer Anda.

1. **Buka terminal** di dalam folder root aplikasi, kemudian masuk ke direktori `backend`:
   ```bash
   cd backend
   ```
2. **Buat Virtual Environment**:
   ```bash
   python -m venv .venv
   ```
3. **Aktifkan Virtual Environment**:
   - 🪟 **Pengguna Windows:**
     ```bash
     .venv\Scripts\activate
     ```
     *(Jika muncul error terkait 'Execution Policy' di PowerShell, jalankan `Set-ExecutionPolicy Unrestricted -Scope CurrentUser` sebagai Administrator terlebih dahulu).*
   - 🍏/🐧 **Pengguna macOS / Linux:**
     ```bash
     source .venv/bin/activate
     ```
4. **Instal Dependensi**:
   Pastikan tanda `(.venv)` muncul di awal prompt terminal Anda, lalu instal library yang dibutuhkan:
   ```bash
   pip install -r requirements.txt
   ```
5. **Konfigurasi Environment Variable (`.env`)**:
   Untuk dapat menjalankan fitur AI dan Analisis Sentimen, Anda memerlukan API Key.
   - Buat sebuah file baru dengan nama `.env` persis di dalam folder `backend/` (sejajar dengan file `main.py`).
   - Buka file `.env` tersebut dan masukkan konfigurasi berikut:

   ```dotenv
   # ── Groq LLM Configuration ──
   # Cara mendapatkan Groq API Key (Gratis):
   # 1. Buka https://console.groq.com/keys dan login
   # 2. Klik tombol "Create API Key", copy key yang berawalan "gsk_"
   # Anda bisa menaruh satu key, atau beberapa key dipisah koma untuk mencegah rate limit.
   GROQ_API_KEYS=gsk_key_pertama,gsk_key_kedua
   
   # [Opsional] Model khusus Chat AI (mendukung Vision/Gambar)
   GROQ_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
   
   # ── Sentiment Model (Hugging Face Space) ──
   # Cara mendapatkan Hugging Face Token (Hanya jika Space Anda di-setting Private):
   # 1. Buka https://huggingface.co/settings/tokens
   # 2. Buat token baru dengan akses "Read"
   HF_SPACE_URL=https://reehandn-sentiment-api.hf.space   # Biarkan default jika memakai API publik ini
   HF_API_TOKEN=hf_xxxxxx                                 # Kosongkan atau hapus baris ini jika HF_SPACE_URL di atas bersifat Public
   ```
   
   *(💡 **Tips Alternatif:** Anda juga dapat memasukkan API Key Groq secara instan melalui pop-up di UI Frontend tanpa perlu menyentuh file `.env`. Key tersebut akan dikirimkan secara aman ke backend).*

6. **Jalankan Server Backend**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   🚀 API Backend kini berjalan di `http://localhost:8000`. Anda dapat melihat dokumentasi interaktif API di `http://localhost:8000/docs`.

---

### 4. Setup & Menjalankan Frontend (React/Vite)

Setelah backend berhasil berjalan, buka **tab/jendela terminal baru** (biarkan terminal backend tetap berjalan).

1. **Masuk ke folder `frontend`**:
   ```bash
   cd frontend
   ```
2. **Instal paket NPM**:
   Langkah ini akan mengunduh React, Chart.js, Vite, dan semua dependensi UI.
   ```bash
   npm install
   ```
3. **Jalankan Server Development Vite**:
   ```bash
   npm run dev
   ```
   ✨ Aplikasi UI (Frontend) akan berjalan di `http://localhost:5173`. 
   
> **Info Penting**: Berkat konfigurasi di `vite.config.js`, setiap *request* yang mengarah ke `/api/...` akan secara otomatis di-proxy ke backend (`http://localhost:8000`). Hal ini akan membebaskan Anda dari kendala CORS selama proses development.

---

### 🛠️ Troubleshooting (Masalah Umum)

- **Port 8000 (Backend) atau 5173 (Frontend) sudah digunakan:**
  Ubah port backend saat menjalankannya: `uvicorn main:app --reload --port 8080`. Namun, pastikan Anda juga memperbarui file `vite.config.js` di frontend agar `proxy` mengarah ke port yang baru.
- **ModuleNotFoundError di Backend:**
  Pastikan Anda telah mengaktifkan *virtual environment* (`.venv\Scripts\activate`) SEBELUM menjalankan `uvicorn main:app`.
- **Gagal menginstal XGBoost (Python):**
  Untuk pengguna Windows, terkadang XGBoost membutuhkan *C++ Build Tools*. Anda dapat mengunduhnya dari [Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

---

## 📡 Dokumentasi Endpoint API (Ringkasan)

Aplikasi memiliki berbagai endpoint yang melayani kebutuhan dashboard:

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/api/stocks` | GET | Daftar saham LQ45, harga terkini, data historis, & indikator teknikal (Mendukung parameter `?refresh=true` untuk bypass cache). |
| `/api/prediction/{ticker}` | GET | Memuat prediksi pergerakan harga saham ke depan & rekomendasi cerdas dari XGBoost. |
| `/api/news/{ticker}` | GET | Melakukan scraping berita terbaru terkait saham yang bersangkutan. |
| `/api/sentiment/predict` | POST | Menganalisis sentimen (Positif/Negatif/Netral) dari teks berita (IndoBERT + Groq LLM). |
| `/api/grok/*` | POST | Meringkas berita teknikal dan menyimpulkan insight akhir berbasis JSON menggunakan Groq LLM. |
| `/api/macro` | GET | Mengambil data makro terkini (Inflasi, BI Rate, PDB, dll). (Mendukung parameter `?refresh=true`). |
| `/api/chat` | POST | 🆕 Endpoint Chat AI multimodal yang kontekstual dan mendukung input teks beserta gambar (vision). |

---

## 🌐 Build Produksi & Deployment

Untuk mendeploy aplikasi ke production:

1. Build aplikasi Frontend:
   ```bash
   cd frontend
   npm run build
   ```
   Hasil build statis akan berada di dalam direktori `frontend/dist/`.

2. **Opsi Deployment:**
   - **Single Server (Murah/Praktis):** Gunakan backend FastAPI untuk sekaligus melayani file statis hasil build dari React (referensi kode ada di `frontend/backend_serve_snippet.md`).
   - **Split Hosting (Direkomendasikan):** 
     - **Frontend:** Deploy folder `frontend/` ke layanan gratis seperti Vercel, Netlify, atau Cloudflare Pages.
     - **Backend:** Deploy folder `backend/` ke Render, Railway, Fly.io, atau DigitalOcean. Pastikan mengatur *Environment Variable* `VITE_API_BASE` di frontend agar mengarah ke URL backend live Anda.

---

<div align="center">
  <b>StockSense LQ45</b> didesain untuk menyatukan kekuatan data pasar, analisis kuantitatif (Machine Learning), dan kecerdasan generatif buatan (LLM) dalam satu genggaman investor. 🚀
</div>
