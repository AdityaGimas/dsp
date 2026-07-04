"""
foreign_flow.py - Aliran dana asing (foreign net buy/sell) pasar Indonesia.

Sumber: endpoint resmi IDX "Ringkasan Saham" (TradingSummary/GetStockSummary)
yang memuat kolom ForeignBuy & ForeignSell per saham. Dari sana kita hitung:
  - Net asing per saham   = ForeignBuy - ForeignSell
  - Net asing pasar (IHSG)= jumlah seluruh saham

Indikator status:
  - Net Buy  -> dana asing MASUK (akumulasi)
  - Net Sell -> dana asing KELUAR (distribusi)

Semua pemanggilan dibungkus try/except + cache. Bila IDX memblokir / gagal,
fungsi mengembalikan None sehingga UI menampilkan "tidak tersedia" tanpa error.

Catatan: data ini hanya bisa diuji saat backend berjalan dengan akses internet
(sandbox pengembangan tidak punya jaringan).
"""
import httpx
from datetime import datetime, timedelta

from .cache import ttl_cache

_IDX_URL = "https://www.idx.co.id/primary/TradingSummary/GetStockSummary"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/",
    "X-Requested-With": "XMLHttpRequest",
}


def _to_float(v):
    """Konversi nilai (angka/str dengan pemisah ribuan) ke float; gagal -> 0.0."""
    try:
        if v is None:
            return 0.0
        if isinstance(v, str):
            v = v.replace(",", "").replace(" ", "").strip()
            if v == "":
                return 0.0
        return float(v)
    except Exception:
        return 0.0


def _pick(row, exact, contains):
    """Ambil nilai dari row: coba nama field pasti dulu, lalu cocokkan substring
    (mis. key apa pun yang mengandung 'foreign' & 'buy'). Tahan variasi penamaan."""
    for k in exact:
        if k in row and row[k] not in (None, ""):
            return _to_float(row[k])
    for k, v in row.items():
        kl = str(k).lower()
        if all(t in kl for t in contains):
            val = _to_float(v)
            if val:
                return val
    return 0.0


def _status(net):
    if net > 0:
        return "Net Buy"
    if net < 0:
        return "Net Sell"
    return "Netral"


def _fetch(date_str):
    params = {"length": 9999, "start": 0, "date": date_str}
    with httpx.Client(timeout=15.0, headers=_HEADERS) as client:
        r = client.get(_IDX_URL, params=params)
        r.raise_for_status()
        return r.json()


@ttl_cache(1800)  # cache 30 menit: data ringkasan harian tidak berubah intraday
def get_foreign_flow():
    """
    Mengembalikan dict:
      {
        "date": "YYYY-MM-DD",
        "market": {"buy": float, "sell": float, "net": float, "status": str},
        "stocks": {"BBCA": {"buy":..,"sell":..,"net":..,"status":..}, ...},
      }
    atau None bila semua percobaan gagal (fallback aman).
    Mencoba beberapa hari bursa ke belakang (lewati akhir pekan) karena hari ini
    bisa jadi belum ada rekap.
    """
    rows = None
    used_date = None
    now = datetime.now()
    for back in range(0, 8):
        d = now - timedelta(days=back)
        if d.weekday() >= 5:  # 5=Sabtu, 6=Minggu
            continue
        try:
            j = _fetch(d.strftime("%Y%m%d"))
            data = j.get("data") or j.get("Data") or []
            if data:
                rows = data
                used_date = d.strftime("%Y-%m-%d")
                break
        except Exception:
            continue

    if not rows:
        return None

    stocks = {}
    tot_buy = 0.0
    tot_sell = 0.0
    for row in rows:
        code = str(row.get("StockCode") or row.get("Code") or "").strip().upper()
        if not code:
            continue
        # ForeignBuy/ForeignSell di IDX = VOLUME (lembar saham), bukan rupiah.
        # Konversi ke nilai rupiah pakai harga rata-rata harian (Value/Volume),
        # fallback ke harga Close bila Volume 0.
        buy_vol = _pick(row, ("ForeignBuy", "ForeignBuyVal", "FBuy"), ("foreign", "buy"))
        sell_vol = _pick(row, ("ForeignSell", "ForeignSellVal", "FSell"), ("foreign", "sell"))
        vol = _to_float(row.get("Volume"))
        val = _to_float(row.get("Value"))
        close = _to_float(row.get("Close"))
        price = (val / vol) if vol > 0 else close
        buy = buy_vol * price
        sell = sell_vol * price
        net = buy - sell
        tot_buy += buy
        tot_sell += sell
        stocks[code] = {
            "buy": buy,
            "sell": sell,
            "net": net,
            "status": _status(net),
            "buy_vol": buy_vol,
            "sell_vol": sell_vol,
        }

    net_market = tot_buy - tot_sell
    market = {
        "buy": tot_buy,
        "sell": tot_sell,
        "net": net_market,
        "status": _status(net_market),
    }
    return {"date": used_date, "market": market, "stocks": stocks}


def _fetch_market_net(date_str):
    """Net asing pasar (rupiah) untuk satu tanggal, atau None bila kosong/gagal."""
    try:
        j = _fetch(date_str)
    except Exception:
        return None
    data = j.get("data") or j.get("Data") or []
    if not data:
        return None
    tot_buy = 0.0
    tot_sell = 0.0
    for row in data:
        buy_vol = _pick(row, ("ForeignBuy", "ForeignBuyVal", "FBuy"), ("foreign", "buy"))
        sell_vol = _pick(row, ("ForeignSell", "ForeignSellVal", "FSell"), ("foreign", "sell"))
        vol = _to_float(row.get("Volume"))
        val = _to_float(row.get("Value"))
        close = _to_float(row.get("Close"))
        price = (val / vol) if vol > 0 else close
        tot_buy += buy_vol * price
        tot_sell += sell_vol * price
    return tot_buy - tot_sell


@ttl_cache(1800)
def get_foreign_flow_trend(days=5):
    """
    Tren aliran dana asing pasar selama beberapa hari bursa terakhir.

    Menilai sinyal dari TREN (bukan 1 hari): berapa hari net beli vs net jual
    dan akumulasi net sepanjang periode. Menjawab kritik "jangan menilai hanya
    dari pergerakan 1 hari".

    Return dict {
        "series": [{"date": "YYYY-MM-DD", "net": float}, ...],  # lama -> baru
        "days": int, "net_sum": float, "avg_net": float,
        "inflow_days": int, "outflow_days": int,
        "signal": 1|0|-1,          # dampak ke pasar saham
        "direction": "inflow"|"outflow"|"mixed",
    } atau None bila semua percobaan gagal.
    """
    series = []
    now = datetime.now()
    back = 0
    while len(series) < days and back < days + 12:
        d = now - timedelta(days=back)
        back += 1
        if d.weekday() >= 5:  # lewati akhir pekan
            continue
        net = _fetch_market_net(d.strftime("%Y%m%d"))
        if net is None:
            continue
        series.append({"date": d.strftime("%Y-%m-%d"), "net": net})

    if not series:
        return None

    series.reverse()  # urutkan lama -> baru
    nets = [s["net"] for s in series]
    net_sum = sum(nets)
    inflow_days = sum(1 for n in nets if n > 0)
    outflow_days = sum(1 for n in nets if n < 0)
    avg_net = net_sum / len(nets)

    if net_sum > 0 and inflow_days >= outflow_days:
        signal = 1
        direction = "inflow"
    elif net_sum < 0 and outflow_days >= inflow_days:
        signal = -1
        direction = "outflow"
    else:
        signal = 0
        direction = "mixed"

    return {
        "series": series,
        "days": len(series),
        "net_sum": net_sum,
        "avg_net": avg_net,
        "inflow_days": inflow_days,
        "outflow_days": outflow_days,
        "signal": signal,
        "direction": direction,
    }


def get_foreign_flow_summary(top_n=10):
    """
    Agregat pasar + daftar TOP net buy & net sell asing PER EMITEN (nilai rupiah).
    Dipakai halaman Makro untuk menampilkan aliran dana asing masing-masing saham.
    Return dict {buy, sell, net, status, date, top_buy:[...], top_sell:[...]} atau None.
    Tiap item top berisi: code, buy, sell, net, status, buy_vol, sell_vol.
    """
    try:
        data = get_foreign_flow()
    except Exception:
        data = None
    if not data or not data.get("market"):
        return None
    stocks = data.get("stocks", {})
    items = [dict(v, code=k) for k, v in stocks.items()]
    buys = sorted(
        (x for x in items if x.get("net", 0) > 0),
        key=lambda x: x["net"],
        reverse=True,
    )[:top_n]
    sells = sorted(
        (x for x in items if x.get("net", 0) < 0),
        key=lambda x: x["net"],
    )[:top_n]
    out = dict(data["market"])
    out["date"] = data.get("date")
    out["top_buy"] = buys
    out["top_sell"] = sells
    return out


def get_stock_foreign_flow(ticker):
    """
    ticker seperti "BBCA.JK" atau "BBCA" -> entri aliran dana asing saham itu,
    atau None bila tidak ada / gagal.
    """
    if not ticker:
        return None
    code = str(ticker).upper().split(".")[0].strip()
    try:
        data = get_foreign_flow()
    except Exception:
        data = None
    if not data:
        return None
    entry = data.get("stocks", {}).get(code)
    if entry is None:
        return None
    out = dict(entry)
    out["date"] = data.get("date")
    out["code"] = code
    return out
