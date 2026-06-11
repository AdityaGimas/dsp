# Menyajikan frontend React dari backend FastAPI (Pola A — satu host)

Gunakan ini kalau kamu mau deploy hanya SATU layanan (backend), dan backend
sekaligus menyajikan hasil build React. Ini opsi paling hemat untuk hosting.

## Langkah

1. Build frontend:
   ```bash
   npm install
   npm run build
   ```
   Hasilnya ada di folder `dist/`.

2. Salin folder `dist/` ke dalam proyek backend, misalnya jadi `backend/static/`:
   ```bash
   cp -r dist ../backend/static
   ```

3. Tambahkan kode berikut di `backend/main.py` (TARUH SETELAH semua
   `app.include_router(...)`, supaya route /api tetap diprioritaskan):

   ```python
   from fastapi.staticfiles import StaticFiles
   from fastapi.responses import FileResponse
   import os

   STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

   # Sajikan asset hasil build (js, css, dll)
   app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

   # Fallback SPA: semua path non-/api dikembalikan ke index.html
   @app.get("/{full_path:path}")
   def serve_spa(full_path: str):
       index_file = os.path.join(STATIC_DIR, "index.html")
       return FileResponse(index_file)
   ```

   Pastikan route catch-all ini berada PALING BAWAH di file, setelah
   `@app.get("/")` dan semua `include_router`. Karena router /api didaftarkan
   lebih dulu, request ke /api/... tidak akan tertangkap catch-all.

4. Karena frontend dan backend kini satu domain, biarkan `VITE_API_BASE=/api`
   (default). Tidak perlu set ulang.

5. Deploy backend ke Render / Railway / Fly.io / Hugging Face Spaces. Selesai —
   satu layanan menyajikan API dan UI sekaligus.

## Catatan

- Kalau kamu lebih suka frontend dan backend terpisah (Vercel/Netlify untuk
  frontend), lewati snippet ini dan ikuti "Pola B" di README.md.
- Saat memakai Pola A, CORS tidak jadi masalah karena sama-sama satu origin,
  tapi setting `allow_origins=["*"]` di main.py kamu tetap aman dibiarkan.
