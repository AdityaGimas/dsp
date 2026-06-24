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
        <div className="live-badge">
          <span className="live-dot" />
          Live Market
        </div>
      </div>
    </nav>
  )
}
