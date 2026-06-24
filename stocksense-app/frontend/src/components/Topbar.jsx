import { useNavigate } from "react-router-dom"
import { useApp } from "../context/AppContext.jsx"

export default function Topbar() {
  const navigate = useNavigate()
  const { currentTicker, setCurrentTicker, isRefreshing, triggerRefresh } = useApp()
  const code = currentTicker ? currentTicker.replace(".JK", "") : ""

  const handleChangeTicker = () => {
    setCurrentTicker(null)
    navigate("/landing")
  }

  return (
    <nav className="topbar">
      <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div className="logo" onClick={handleChangeTicker} style={{ cursor: "pointer" }} title="Kembali ke halaman utama">
          <span className="logo-dot" />
          StockSense
        </div>
      </div>

      <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto" }}>
        
        {code ? (
          <button
            className={"fetch-news-btn " + (isRefreshing ? "loading" : "")}
            onClick={triggerRefresh}
            disabled={isRefreshing}
            style={{ height: 28, padding: "0 12px", borderRadius: 14, fontSize: 11, background: "rgba(167,139,250,0.1)", color: "var(--purple)", borderColor: "rgba(167,139,250,0.2)" }}
          >
            {isRefreshing ? <span className="spin-sm" style={{ borderTopColor: "var(--purple)", width: 12, height: 12, marginRight: 6 }} /> : <span style={{ marginRight: 4 }}>↻</span>}
            <span className="btn-txt" style={{ color: "var(--purple)" }}>{isRefreshing ? "Memuat..." : "Refresh"}</span>
          </button>
        ) : (
          <div className="live-badge">
            <span className="live-dot" />
            Live Market
          </div>
        )}
      </div>
    </nav>
  )
}
