import { NavLink } from "react-router-dom"

export default function Topbar() {
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
      <div className="avatar">AR</div>
    </nav>
  )
}
