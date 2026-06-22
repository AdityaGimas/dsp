"""
cache.py — TTL (time-to-live) cache sederhana & thread-safe.

Dipakai untuk membungkus fungsi yang memanggil yfinance/jaringan agar tidak
dipanggil berulang-ulang pada setiap request. Hasil disimpan di memori proses
selama `ttl_seconds`, lalu otomatis kedaluwarsa.

Contoh:
    from .cache import ttl_cache

    @ttl_cache(600)            # cache 10 menit
    def get_macro_data():
        ...

Melewati cache (force refresh):
    Setiap fungsi yang didekorasi menerima kwarg khusus `_refresh=True` untuk
    MENGABAIKAN cache dan mengambil data terbaru, lalu memperbarui cache.
    kwarg ini di-pop oleh wrapper sehingga TIDAK diteruskan ke fungsi asli.

        get_macro_data(_refresh=True)   # ambil data fresh, abaikan cache

Catatan:
- Cache disimpan per-kombinasi argumen (mis. get_stock_info("BBCA.JK") dan
  get_stock_info("TLKM.JK") punya entri terpisah).
- Hasil yang dianggap "gagal" (None) tidak di-cache agar percobaan berikutnya
  bisa mengambil data lagi.
- Setiap fungsi yang didekorasi mendapat .cache_clear() untuk mengosongkan
  cache secara manual (berguna untuk testing).
"""
import time
import threading
import functools


def ttl_cache(ttl_seconds: int):
    def decorator(func):
        store = {}
        lock = threading.Lock()

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # `_refresh=True` memaksa ambil data baru & abaikan cache.
            force_refresh = bool(kwargs.pop("_refresh", False))
            key = (args, tuple(sorted(kwargs.items())))
            now = time.time()

            if not force_refresh:
                with lock:
                    cached = store.get(key)
                    if cached is not None:
                        value, ts = cached
                        if now - ts < ttl_seconds:
                            return value

            result = func(*args, **kwargs)

            # Jangan cache kegagalan total (None) supaya bisa dicoba lagi.
            if result is not None:
                with lock:
                    store[key] = (result, now)
            return result

        def cache_clear():
            with lock:
                store.clear()

        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator
