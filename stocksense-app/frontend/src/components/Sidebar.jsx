import { useState } from "react"
import { NavLink } from "react-router-dom"
import { useApp } from "../context/AppContext.jsx"

const NAV = [
  { to: "/", icon: "◉", label: "Overview", end: true },
  { to: "/forecasting", icon: "⌬", label: "Forecasting" },
  { to: "/berita", icon: "❚❚", label: "Berita & Sentimen" },
  { to: "/indikator", icon: "⚡", label: "Indikator Teknikal" },
  { to: "/makro", icon: "📊", label: "Makro Ekonomi" },
  { to: "/chat", icon: "💬", label: "Chat AI" },
]

const S = {
  secLabel0: { marginBottom: 0 },
  stockSection: { flex: 1, display: "flex", flexDirection: "column", gap: 6, minHeight: 0 },
  rowHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" },
  notFound: { padding: "12px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" },
  wlSection: { flexShrink: 0 },
  wlHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 4 },
  wlCount: { fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" },
  wlContainer: { display: "flex", flexDirection: "column", gap: 1 },
  wlEmpty: { padding: "10px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 },
}

export default function Sidebar() {
  const {
    allStocks,
    currentTicker,
    setCurrentTicker,
    watchlist,
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
  } = useApp()
  const [query, setQuery] = useState("")

  const filtered = allStocks.filter((s) => {
    const q = query.toLowerCase()
    return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  })

  return (
    <aside className="sidebar">
      <div>
        <div className="sec-label">Analisis</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <span className="nav-icon">{n.icon}</span> {n.label}
          </NavLink>
        ))}
      </div>

      <div style={S.stockSection}>
        <div style={S.rowHead}>
          <div className="sec-label" style={S.secLabel0}>
            Semua Saham LQ45
          </div>
        </div>
        <input
          className="wl-search"
          placeholder="Cari saham..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="wl-list">
          {allStocks.length === 0 ? (
            <div className="loading-overlay">
              <span className="spinner" /> Memuat...
            </div>
          ) : filtered.length === 0 ? (
            <div style={S.notFound}>Tidak ditemukan.</div>
          ) : (
            filtered.map((s) => {
              const inWl = isWatchlisted(s.ticker)
              return (
                <div
                  key={s.ticker}
                  className={`wl-item ${s.ticker === currentTicker ? "active-stock" : ""}`}
                  onClick={() => setCurrentTicker(s.ticker)}
                >
                  <span className="wl-ticker">{s.code}</span>
                  <span className="wl-name">{s.name}</span>
                  <button
                    className={`wl-star ${inWl ? "starred" : ""}`}
                    title={inWl ? "Hapus dari watchlist" : "Tambah ke watchlist"}
                    onClick={(e) => {
                      e.stopPropagation()
                      inWl ? removeFromWatchlist(s.ticker) : addToWatchlist(s.ticker)
                    }}
                  >
                    {inWl ? "★" : "☆"}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={S.wlSection}>
        <div style={S.wlHead}>
          <div className="sec-label" style={S.secLabel0}>
            Watchlist Saya
          </div>
          <span style={S.wlCount}>{watchlist.length}</span>
        </div>
        <div style={S.wlContainer}>
          {watchlist.length === 0 ? (
            <div style={S.wlEmpty}>
              Belum ada saham.
              <br />
              Klik ☆ untuk menambahkan.
            </div>
          ) : (
            watchlist.map((t) => {
              const s = allStocks.find((x) => x.ticker === t)
              const code = t.replace(".JK", "")
              return (
                <div
                  key={t}
                  className={`wl-item ${t === currentTicker ? "active-stock" : ""}`}
                  onClick={() => setCurrentTicker(t)}
                >
                  <span className="wl-ticker">{code}</span>
                  <span className="wl-name">{s ? s.name : code}</span>
                  <button
                    className="wl-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromWatchlist(t)
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}
