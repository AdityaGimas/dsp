"""
prediction_store.py — penyimpanan hasil prediksi harga ke SQLite.

Model penyimpanan: KEEP-FIRST per tanggal target, KECUALI data HARI INI.
- Untuk tiap (ticker, model, tanggal_target), prediksi yang dibuat pada hari
  SEBELUMNYA tidak pernah ditimpa (keep-first) — supaya jejak prediksi jauh-hari
  tetap utuh.
- Tapi prediksi yang dibuat HARI INI selalu di-overwrite dengan run terbaru,
  supaya isi database selalu cocok dengan angka yang sedang ditampilkan (Overview
  & Forecasting memprediksi ulang tiap dibuka, dan hasil LLM tidak deterministik).
- Di hari baru, hanya tanggal target baru yang ditambahkan.
  Contoh: run 6 Juli simpan 7,8,9. Run lagi tgl 6 -> 7,8,9 di-overwrite.
  Run 7 Juli -> 7,8,9 (dibuat tgl 6) dibiarkan, hanya 10 yang ditambahkan.

Struktur tabel:
- predictions       : metadata per run (rekomendasi/confidence per tanggal prediksi).
- prediction_points : 1 baris per (ticker, model, tanggal_target) — inti riwayat & akurasi.

DB disimpan di backend/data/predictions.db (dibuat otomatis).
"""
import os
import json
import sqlite3
import threading
import datetime

from .market_data import get_stock_history

_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_DB_PATH = os.path.join(_DB_DIR, "predictions.db")
_lock = threading.Lock()
_initialized = False

_POINTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS prediction_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    model TEXT NOT NULL,
    pred_date TEXT NOT NULL,
    horizon INTEGER,
    target_date TEXT NOT NULL,
    base_price REAL,
    predicted_price REAL,
    predicted_low REAL,
    predicted_high REAL,
    actual_price REAL,
    UNIQUE(ticker, model, target_date)
)
"""


def _conn():
    os.makedirs(_DB_DIR, exist_ok=True)
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    global _initialized
    with _lock:
        conn = _conn()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT NOT NULL,
                    pred_date TEXT NOT NULL,
                    base_price REAL,
                    xgb_json TEXT,
                    llm_json TEXT,
                    xgb_reco TEXT,
                    llm_reco TEXT,
                    created_at TEXT,
                    UNIQUE(ticker, pred_date)
                )
                """
            )
            # Migrasi: kalau tabel prediction_points masih pakai skema lama
            # (kunci unik lama berbasis pred_date), buat ulang dengan kunci baru
            # berbasis target_date. DB ini hanya cache riwayat, aman dibuat ulang.
            row = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='prediction_points'"
            ).fetchone()
            if row and "UNIQUE(ticker, model, target_date)" not in (row["sql"] or ""):
                conn.execute("DROP TABLE prediction_points")
            conn.execute(_POINTS_SCHEMA)
            conn.commit()
            _initialized = True
        finally:
            conn.close()


def _ensure():
    if not _initialized:
        init_db()


def _today():
    return datetime.date.today().strftime("%Y-%m-%d")


def save_prediction(ticker, base_price, xgb, llm, pred_date=None):
    """Simpan prediksi: overwrite utk data hari ini, keep-first utk hari sebelumnya.

    - Tanggal target yang tersimpan dari hari SEBELUMNYA tidak ditimpa.
    - Tanggal target yang tersimpan HARI INI di-overwrite dengan nilai terbaru.
    - Tanggal target baru ditambahkan.

    Mengembalikan jumlah titik yang ditambah & di-overwrite.
    """
    _ensure()
    pred_date = pred_date or _today()
    now = datetime.datetime.now().isoformat(timespec="seconds")
    xgb = xgb or {}
    llm = llm or {}
    added = 0
    updated = 0
    with _lock:
        conn = _conn()
        try:
            # Metadata run (rekomendasi/confidence) — selalu diperbarui per hari.
            conn.execute(
                """
                INSERT INTO predictions
                    (ticker, pred_date, base_price, xgb_json, llm_json, xgb_reco, llm_reco, created_at)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(ticker, pred_date) DO UPDATE SET
                    base_price=excluded.base_price,
                    xgb_json=excluded.xgb_json,
                    llm_json=excluded.llm_json,
                    xgb_reco=excluded.xgb_reco,
                    llm_reco=excluded.llm_reco,
                    created_at=excluded.created_at
                """,
                (
                    ticker, pred_date, base_price,
                    json.dumps(xgb), json.dumps(llm),
                    xgb.get("recommendation"), llm.get("recommendation"),
                    now,
                ),
            )
            # Titik prediksi — overwrite kalau dibuat hari ini, keep-first kalau dari hari lalu.
            for model, payload in (("xgb", xgb), ("llm", llm)):
                for pt in (payload.get("points") or []):
                    td = pt.get("date")
                    if not td:
                        continue
                    row = conn.execute(
                        "SELECT pred_date FROM prediction_points WHERE ticker=? AND model=? AND target_date=?",
                        (ticker, model, td),
                    ).fetchone()
                    if row is not None:
                        # Sudah ada. Overwrite HANYA jika dibuat hari ini (pred_date sama).
                        # Kalau dibuat hari sebelumnya -> keep-first, jangan diubah.
                        if row["pred_date"] == pred_date:
                            conn.execute(
                                """
                                UPDATE prediction_points SET
                                    horizon=?, base_price=?, predicted_price=?,
                                    predicted_low=?, predicted_high=?
                                WHERE ticker=? AND model=? AND target_date=?
                                """,
                                (
                                    pt.get("horizon"), base_price, pt.get("price"),
                                    pt.get("low"), pt.get("high"), ticker, model, td,
                                ),
                            )
                            updated += 1
                        continue
                    conn.execute(
                        """
                        INSERT INTO prediction_points
                            (ticker, model, pred_date, horizon, target_date, base_price,
                             predicted_price, predicted_low, predicted_high, actual_price)
                        VALUES (?,?,?,?,?,?,?,?,?, NULL)
                        """,
                        (
                            ticker, model, pred_date, pt.get("horizon"), td,
                            base_price, pt.get("price"), pt.get("low"), pt.get("high"),
                        ),
                    )
                    added += 1
            conn.commit()
        finally:
            conn.close()
    return {
        "ticker": ticker,
        "pred_date": pred_date,
        "saved": True,
        "added_points": added,
        "updated_points": updated,
    }


def _resolve_actuals(ticker):
    """Isi actual_price untuk titik yang target_date-nya sudah lewat & masih kosong."""
    today = _today()
    with _lock:
        conn = _conn()
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT target_date FROM prediction_points
                WHERE ticker=? AND actual_price IS NULL AND target_date < ?
                """,
                (ticker, today),
            ).fetchall()
        finally:
            conn.close()
    pending = [r["target_date"] for r in rows]
    if not pending:
        return
    try:
        hist = get_stock_history(ticker, "1y")
    except Exception:
        hist = []
    close_by_date = {h["date"]: h["close"] for h in (hist or [])}
    if not close_by_date:
        return
    updates = [(close_by_date[td], ticker, td) for td in pending if td in close_by_date]
    if not updates:
        return
    with _lock:
        conn = _conn()
        try:
            conn.executemany(
                """
                UPDATE prediction_points SET actual_price=?
                WHERE ticker=? AND target_date=? AND actual_price IS NULL
                """,
                updates,
            )
            conn.commit()
        finally:
            conn.close()


def _point_dict(p):
    predicted = p["predicted_price"]
    actual = p["actual_price"]
    base = p["base_price"]
    err_pct = None
    abs_err_pct = None
    dir_hit = None
    if actual is not None and predicted is not None and actual != 0:
        err_pct = round((predicted - actual) / actual * 100, 2)
        abs_err_pct = abs(err_pct)
        if base is not None:
            dir_hit = (1 if predicted >= base else -1) == (1 if actual >= base else -1)
    return {
        "pred_date": p["pred_date"],
        "horizon": p["horizon"],
        "target_date": p["target_date"],
        "base_price": base,
        "predicted_price": predicted,
        "predicted_low": p["predicted_low"],
        "predicted_high": p["predicted_high"],
        "actual_price": actual,
        "error_pct": err_pct,
        "abs_error_pct": abs_err_pct,
        "direction_hit": dir_hit,
    }


def _accuracy_for(conn, ticker, model):
    rows = conn.execute(
        """
        SELECT base_price, predicted_price, actual_price FROM prediction_points
        WHERE ticker=? AND model=? AND actual_price IS NOT NULL AND predicted_price IS NOT NULL
        """,
        (ticker, model),
    ).fetchall()
    n = 0
    mape_sum = 0.0
    dir_hits = 0
    dir_total = 0
    for r in rows:
        actual = r["actual_price"]
        pred = r["predicted_price"]
        if actual is None or actual == 0 or pred is None:
            continue
        n += 1
        mape_sum += abs((pred - actual) / actual) * 100
        base = r["base_price"]
        if base is not None:
            dir_total += 1
            if (1 if pred >= base else -1) == (1 if actual >= base else -1):
                dir_hits += 1
    if n == 0:
        return {"count": 0, "mape": None, "accuracy": None, "direction_hit_rate": None}
    mape = mape_sum / n
    return {
        "count": n,
        "mape": round(mape, 2),
        "accuracy": round(max(0.0, 100 - mape), 2),
        "direction_hit_rate": round(dir_hits / dir_total * 100, 1) if dir_total else None,
    }


def get_history(ticker, limit=30):
    """Kembalikan riwayat prediksi per TANGGAL TARGET + akurasi.

    Bentuk: { ticker, history: [ { target_date, xgb, llm } ], accuracy }
    Tiap target_date punya maksimum satu titik XGBoost dan satu LLM,
    diurutkan dari target terbaru.
    """
    _ensure()
    _resolve_actuals(ticker)
    with _lock:
        conn = _conn()
        try:
            pts = conn.execute(
                "SELECT * FROM prediction_points WHERE ticker=? ORDER BY target_date DESC, model",
                (ticker,),
            ).fetchall()
            recos = conn.execute(
                "SELECT pred_date, xgb_reco, llm_reco FROM predictions WHERE ticker=?",
                (ticker,),
            ).fetchall()
            accuracy = {
                "xgb": _accuracy_for(conn, ticker, "xgb"),
                "llm": _accuracy_for(conn, ticker, "llm"),
            }
        finally:
            conn.close()

    reco_map = {r["pred_date"]: r for r in recos}

    grouped = {}
    order = []
    for p in pts:
        td = p["target_date"]
        if td not in grouped:
            grouped[td] = {"target_date": td, "xgb": None, "llm": None}
            order.append(td)
        d = _point_dict(p)
        rr = reco_map.get(p["pred_date"])
        if rr is not None:
            d["recommendation"] = rr["xgb_reco"] if p["model"] == "xgb" else rr["llm_reco"]
        grouped[td][p["model"]] = d

    history = [grouped[td] for td in order[:limit]]
    return {"ticker": ticker, "history": history, "accuracy": accuracy}
