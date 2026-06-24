// Formatting + cache helpers ported from the original script.js

export function fmt(n, d = 0) {
  if (n == null) return "—"
  return Number(n).toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
}

export function fmtBig(n) {
  if (n == null) return "—"
  if (n >= 1e12) return "Rp " + (n / 1e12).toFixed(1) + " T"
  if (n >= 1e9) return "Rp " + (n / 1e9).toFixed(1) + " M"
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " Jt"
  return fmt(n)
}

export function fmtVol(n) {
  if (n == null) return "—"
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " M"
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " J"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " rb"
  return String(n)
}

export function recColor(r) {
  return r === "BUY" ? "var(--green)" : r === "SELL" ? "var(--red)" : "var(--amber)"
}

export function recLabel(r) {
  return r === "BUY" ? "BELI" : r === "SELL" ? "JUAL" : "TAHAN"
}

export function indColor(s) {
  if (!s) return "var(--text-muted)"
  const l = s.toLowerCase()
  if (l.includes("beli") || l.includes("buy") || l.includes("bullish") || l.includes("atas") || l.includes("oversold") || l.includes("positif") || l.includes("positive") || l.includes("kondusif"))
    return "var(--green)"
  if (l.includes("jual") || l.includes("sell") || l.includes("bearish") || l.includes("overbought") || l.includes("negatif") || l.includes("negative"))
    return "var(--red)"
  return "var(--amber)"
}

export const DAY_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
export const MON_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

export function fmtAge(ts) {
  if (!ts) return ""
  const diffMin = Math.round((Date.now() - ts) / 60000)
  if (diffMin < 2) return "Baru saja"
  if (diffMin < 60) return `${diffMin} mnt lalu`
  const diffH = Math.floor(diffMin / 60)
  const d = new Date(ts)
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (diffH < 24) return `${diffH}j lalu · ${hhmm}`
  return `${d.getDate()} ${MON_ID[d.getMonth()]} · ${hhmm}`
}

// ── localStorage cache per ticker ──────────────────────────────
const CACHE_VER = "ss2"
const ck = (t) => `ss_${t.replace(".", "_")}`

export function saveCache(ticker, section, data) {
  try {
    const key = ck(ticker)
    let c = {}
    try {
      c = JSON.parse(localStorage.getItem(key) || "{}")
    } catch (e) {}
    if (c._v !== CACHE_VER) c = {}
    c._v = CACHE_VER
    c[section] = { d: data, ts: Date.now() }
    localStorage.setItem(key, JSON.stringify(c))
  } catch (e) {}
}

export function loadCache(ticker) {
  try {
    const raw = localStorage.getItem(ck(ticker))
    if (!raw) return null
    const c = JSON.parse(raw)
    return c._v === CACHE_VER ? c : null
  } catch (e) {
    return null
  }
}
