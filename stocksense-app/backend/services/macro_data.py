import os
import yfinance as yf

from .cache import ttl_cache

# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# DATA MAKRO RESMI INDONESIA (BI Rate, Inflasi YoY, PDB YoY)
#
# BI & BPS tidak menyediakan REST API publik gratis yang stabil untuk angka
# ini, jadi SUMBER KEBENARAN ada di MACRO_OFFICIAL di bawah. Angka di sini
# adalah data RESMI (lihat field `updated` & `source`). Untuk update tinggal
# ubah satu blok ini tiap rilis BI/BPS (bulanan utk inflasi/BI Rate, kuartalan
# utk PDB).
#
# Sumber resmi:
#   - BI Rate : https://www.bi.go.id/id/fungsi-utama/moneter/bi-rate/
#   - Inflasi : https://www.bi.go.id/id/statistik/indikator/data-inflasi.aspx (BPS)
#   - PDB     : https://www.bps.go.id/id/pressrelease (Berita Resmi Statistik)
#
# Auto-refresh opsional via BPS Web API: set env BPS_API_KEY lalu lengkapi
# _try_live_bps(). Selama gagal/nonaktif, sistem otomatis pakai MACRO_OFFICIAL.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────
MACRO_OFFICIAL = {
    # Suku bunga acuan BI (BI 7-Day Reverse Repo Rate)
    "BIRate": {
        "value": 5.75,            # Jun 2026
        "prev": 5.25,             # Mei 2026
        "desc": "Naik (Jun'26)",
        "updated": "2026-06-18",
        "source": "Bank Indonesia",
        # Terverifikasi: held 4.75% Okt'25–Apr'26, +50bps Mei'26 → 5.25%,
        # +25bps off-cycle 9 Jun + +25bps 18 Jun → 5.75%.
        "history": {
            "labels": ["Okt'25", "Nov'25", "Des'25", "Jan'26", "Feb'26", "Mar'26", "Apr'26", "Mei'26", "Jun'26"],
            "data":   [4.75, 4.75, 4.75, 4.75, 4.75, 4.75, 4.75, 5.25, 5.75],
        },
    },
    # Inflasi tahunan (year-on-year)
    "Inflation": {
        "value": 3.08,            # Mei 2026 YoY
        "prev": 2.42,             # Apr 2026 YoY
        "desc": "YoY (Mei'26)",
        "updated": "2026-06-01",
        "source": "BPS",
        # Terverifikasi dari data inflasi BI/BPS (YoY).
        "history": {
            "labels": ["Agu'25", "Sep'25", "Okt'25", "Nov'25", "Des'25", "Jan'26", "Feb'26", "Mar'26", "Apr'26", "Mei'26"],
            "data":   [2.31, 2.65, 2.86, 2.72, 2.92, 3.55, 4.76, 3.48, 2.42, 3.08],
        },
    },
    # Pertumbuhan ekonomi / PDB (year-on-year)
    "GDP": {
        "value": 5.61,            # Triwulan I-2026 YoY
        "prev": 5.39,             # Triwulan IV-2025 YoY
        "desc": "YoY (Q1'26)",
        "updated": "2026-05-05",
        "source": "BPS",
        # Q4'25 (5,39%) & Q1'26 (5,61%) TERVERIFIKASI (rilis BPS Mei 2026).
        # Kuartal lebih lama = perkiraan dari rilis sebelumnya; verifikasi via
        # BPS bila ingin presisi penuh.
        "history": {
            "labels":    ["Q1'24", "Q2'24", "Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26"],
            "data":      [5.11, 5.05, 4.95, 5.02, 4.87, 5.12, 5.04, 5.39, 5.61],
            # Inflasi YoY di akhir kuartal (utk overlay di chart PDB & Inflasi).
            # null = data belum tersedia di window MACRO_OFFICIAL.
            "inflation": [None, None, None, None, None, None, 2.65, 2.92, 3.48],
        },
    },
}


def _round(x, nd=2):
    try:
        return round(float(x), nd)
    except (TypeError, ValueError):
        return x


def _build_official_macro():
    """Bangun blok makro (BI Rate, Inflasi, PDB) dari MACRO_OFFICIAL.

    Mengembalikan tuple (cards, charts) di mana:
      - cards  : dict per indikator berisi value/change/change_pct/desc/...
      - charts : dict history per indikator utk grafik di frontend.

    Tidak butuh jaringan, jadi aman dipakai sebagai fallback & mudah dites.
    """
    cards, charts = {}, {}
    for key, item in MACRO_OFFICIAL.items():
        value = item["value"]
        prev = item.get("prev", value)
        change = _round(value - prev, 2)
        # change_pct di sini = selisih poin persentase vs periode sebelumnya
        # (indikator ini sendiri sudah dalam satuan persen).
        cards[key] = {
            "value": value,
            "prev": prev,
            "change": change,
            "change_pct": change,
            "desc": item.get("desc", ""),
            "updated": item.get("updated", ""),
            "source": item.get("source", ""),
        }
        hist = item.get("history")
        if hist:
            charts[key] = {k: v for k, v in hist.items()}
    return cards, charts


def _try_live_bps():
    """(Opsional) Ambil inflasi & PDB live dari BPS Web API.

    BPS menyediakan Web API gratis (butuh API key dari webapi.bps.go.id).
    Implementasikan parsing variabel di sini bila ingin auto-refresh; jika
    BPS_API_KEY tidak diset atau request gagal, fungsi mengembalikan None
    sehingga sistem otomatis memakai MACRO_OFFICIAL.
    """
    api_key = os.getenv("BPS_API_KEY")
    if not api_key:
        return None
    try:
        # TODO: panggil endpoint BPS (mis. /list/model/data/lang/ind/domain/0000/
        # var/<id_var>/key/<api_key>) lalu map ke struktur MACRO_OFFICIAL.
        # Sengaja dibiarkan no-op + fallback agar tidak mengembalikan data
        # yang belum diverifikasi.
        return None
    except Exception as e:
        print(f"[Macro] BPS live fetch gagal, pakai data resmi statis: {e}")
        return None


@ttl_cache(600)  # cache 10 menit: data makro berubah lambat, hindari hit yfinance tiap request
def get_macro_data():
    """
    Mengembalikan data makro ekonomi:
      - Real-time market (yfinance): IHSG, USD/IDR, Minyak, Emas.
      - Indikator resmi (BI/BPS): BI Rate, Inflasi YoY, PDB YoY — dari
        MACRO_OFFICIAL (data resmi terverifikasi), atau dari BPS Web API bila
        BPS_API_KEY diset.

    Bentuk hasil mempertahankan kontrak lama:
      data.IHSG / data.USDIDR / data.CrudeOil / data.Gold
      data.BIRate / data.Inflation / data.GDP   (punya .value/.change_pct/.desc)
      data.charts.{IHSG,USDIDR,GDP,Inflation,BIRate}
    """
    tickers = {
        "IHSG": "^JKSE",
        "USDIDR": "USDIDR=X",
        "CrudeOil": "CL=F",
        "Gold": "GC=F",
    }

    results = {"charts": {}}

    for key, symbol in tickers.items():
        try:
            t = yf.Ticker(symbol)
            if key in ["USDIDR", "IHSG"]:
                hist = t.history(period="6mo")
            else:
                hist = t.history(period="5d")

            if not hist.empty:
                current_price = float(hist["Close"].iloc[-1])
                prev_price = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current_price
                change = current_price - prev_price
                change_pct = (change / prev_price * 100) if prev_price else 0
                results[key] = {
                    "value": round(current_price, 2) if key != "IHSG" else round(current_price, 0),
                    "change": round(change, 2) if key != "IHSG" else round(change, 0),
                    "change_pct": round(change_pct, 2),
                }

                if key in ["USDIDR", "IHSG"]:
                    monthly = hist["Close"].resample("ME").last()
                    labels = monthly.index.strftime("%b").tolist()
                    data = [round(x, 2) if key == "USDIDR" else round(x, 0) for x in monthly.tolist()]
                    results["charts"][key] = {"labels": labels, "data": data}
            else:
                results[key] = None
        except Exception:
            results[key] = None

    # ─── Indikator resmi BI/BPS (live BPS bila ada key, else data resmi statis) ─
    live = _try_live_bps()
    cards, charts = _build_official_macro()
    if live:
        # live diharapkan berbentuk {"BIRate": {...}, "Inflation": {...}, ...}
        for k, v in live.items():
            cards[k] = v.get("card", cards.get(k))
            if v.get("chart"):
                charts[k] = v["chart"]

    results.update(cards)
    results["charts"].update(charts)

    return results
