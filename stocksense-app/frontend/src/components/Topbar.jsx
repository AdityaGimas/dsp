import { NavLink } from "react-router-dom"
import { useApp } from "../context/AppContext.jsx"

export default function Topbar() {
  const { groqKey, setGrokModalOpen } = useApp()
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
      <div className="live-badge">
        <span className="live-dot" />
        Live Market
      </div>
      <div className="grok-key-btn" onClick={() => setGrokModalOpen(true)}>
        <span className={`grok-key-dot ${groqKey ? "connected" : ""}`} />
        <span>{groqKey ? "Groq: Terhubung" : "Groq API Key"}</span>
      </div>
      <div className="avatar">AR</div>
    </nav>
  )
}
