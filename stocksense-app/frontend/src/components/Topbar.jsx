import { NavLink, useNavigate } from "react-router-dom"
import { useApp } from "../context/AppContext.jsx"

export default function Topbar() {
  const navigate = useNavigate()
  const { currentTicker, setCurrentTicker } = useApp()
  const code = currentTicker ? currentTicker.replace(".JK", "") : ""

  const handleChangeTicker = () => {
    setCurrentTicker(null)
    navigate("/landing")
  }

  return (
    <nav className="topbar">
      <div className="logo">
        <span className="logo-dot" />
        StockSense
      </div>
      <div className="topbar-nav">
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <a>Watchlist</a>
        <a>Portofolio</a>
        <NavLink to="/berita">Berita Pasar</NavLink>
      </div>
      {code && (
        <button className="topbar-ticker-btn" onClick={handleChangeTicker} title="Ganti saham yang dianalisis">
          <span className="topbar-ticker-code">{code}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Ganti
        </button>
      )}
      <div className="live-badge">
        <span className="live-dot" />
        Live Market
      </div>
      <div className="avatar">AR</div>
    </nav>
  )
}
