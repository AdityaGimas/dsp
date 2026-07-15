import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useApp } from "../context/AppContext.jsx"

// ─── Full LQ45 stock catalogue with sector mapping ───────────────────────────
const SECTOR_META = {
  Perbankan:      { color: "#4f9cf9", icon: "🏦", bg: "rgba(79,156,249,0.12)"  },
  Pertambangan:   { color: "#f5b731", icon: "⛏️",  bg: "rgba(245,183,49,0.12)" },
  Teknologi:      { color: "#a78bfa", icon: "💻", bg: "rgba(167,139,250,0.12)" },
  Konsumer:       { color: "#2dd4a0", icon: "🛒", bg: "rgba(45,212,160,0.12)"  },
  Telekomunikasi: { color: "#2dd4bf", icon: "📡", bg: "rgba(45,212,191,0.12)"  },
  Energi:         { color: "#f55e5e", icon: "⚡", bg: "rgba(245,94,94,0.12)"   },
  Infrastruktur:  { color: "#fb923c", icon: "🏗️",  bg: "rgba(251,146,60,0.12)" },
  Kesehatan:      { color: "#34d399", icon: "🏥", bg: "rgba(52,211,153,0.12)"  },
  Industri:       { color: "#94a3b8", icon: "🏭", bg: "rgba(148,163,184,0.12)" },
  Media:          { color: "#e879f9", icon: "📺", bg: "rgba(232,121,249,0.12)" },
}

const LQ45_WITH_SECTORS = [
  { ticker: "BBCA.JK",  code: "BBCA",  name: "Bank Central Asia",      sector: "Perbankan",      popular: true  },
  { ticker: "BBRI.JK",  code: "BBRI",  name: "Bank Rakyat Indonesia",   sector: "Perbankan",      popular: true  },
  { ticker: "BMRI.JK",  code: "BMRI",  name: "Bank Mandiri",            sector: "Perbankan",      popular: true  },
  { ticker: "BBNI.JK",  code: "BBNI",  name: "Bank Negara Indonesia",   sector: "Perbankan",      popular: false },
  { ticker: "BBTN.JK",  code: "BBTN",  name: "Bank Tabungan Negara",    sector: "Perbankan",      popular: false },
  { ticker: "BRIS.JK",  code: "BRIS",  name: "Bank Syariah Indonesia",  sector: "Perbankan",      popular: false },
  { ticker: "ADRO.JK",  code: "ADRO",  name: "Adaro Energy",            sector: "Pertambangan",   popular: false },
  { ticker: "ANTM.JK",  code: "ANTM",  name: "Aneka Tambang",           sector: "Pertambangan",   popular: true  },
  { ticker: "PTBA.JK",  code: "PTBA",  name: "Bukit Asam",              sector: "Pertambangan",   popular: false },
  { ticker: "HRUM.JK",  code: "HRUM",  name: "Harum Energy",            sector: "Pertambangan",   popular: false },
  { ticker: "ITMG.JK",  code: "ITMG",  name: "Indo Tambangraya",        sector: "Pertambangan",   popular: false },
  { ticker: "INCO.JK",  code: "INCO",  name: "Vale Indonesia",          sector: "Pertambangan",   popular: false },
  { ticker: "MDKA.JK",  code: "MDKA",  name: "Merdeka Copper Gold",     sector: "Pertambangan",   popular: false },
  { ticker: "MBMA.JK",  code: "MBMA",  name: "Merdeka Battery",         sector: "Pertambangan",   popular: false },
  { ticker: "GOTO.JK",  code: "GOTO",  name: "GoTo Gojek Tokopedia",    sector: "Teknologi",      popular: true  },
  { ticker: "BUKA.JK",  code: "BUKA",  name: "Bukalapak",               sector: "Teknologi",      popular: false },
  { ticker: "EMTK.JK",  code: "EMTK",  name: "Elang Mahkota Teknologi", sector: "Teknologi",      popular: false },
  { ticker: "UNVR.JK",  code: "UNVR",  name: "Unilever Indonesia",      sector: "Konsumer",       popular: true  },
  { ticker: "ICBP.JK",  code: "ICBP",  name: "Indofood CBP",            sector: "Konsumer",       popular: false },
  { ticker: "INDF.JK",  code: "INDF",  name: "Indofood Sukses Makmur",  sector: "Konsumer",       popular: false },
  { ticker: "HMSP.JK",  code: "HMSP",  name: "HM Sampoerna",            sector: "Konsumer",       popular: false },
  { ticker: "GGRM.JK",  code: "GGRM",  name: "Gudang Garam",            sector: "Konsumer",       popular: false },
  { ticker: "KLBF.JK",  code: "KLBF",  name: "Kalbe Farma",             sector: "Konsumer",       popular: false },
  { ticker: "AMRT.JK",  code: "AMRT",  name: "Sumber Alfaria (Alfamart)",sector: "Konsumer",       popular: false },
  { ticker: "ACES.JK",  code: "ACES",  name: "Ace Hardware",            sector: "Konsumer",       popular: false },
  { ticker: "CPIN.JK",  code: "CPIN",  name: "Charoen Pokphand",        sector: "Konsumer",       popular: false },
  { ticker: "JPFA.JK",  code: "JPFA",  name: "Japfa Comfeed",           sector: "Konsumer",       popular: false },
  { ticker: "TLKM.JK",  code: "TLKM",  name: "Telkom Indonesia",        sector: "Telekomunikasi", popular: true  },
  { ticker: "EXCL.JK",  code: "EXCL",  name: "XL Axiata",               sector: "Telekomunikasi", popular: false },
  { ticker: "TBIG.JK",  code: "TBIG",  name: "Tower Bersama",           sector: "Infrastruktur",  popular: false },
  { ticker: "TOWR.JK",  code: "TOWR",  name: "Sarana Menara Nusantara", sector: "Infrastruktur",  popular: false },
  { ticker: "WSKT.JK",  code: "WSKT",  name: "Waskita Karya",           sector: "Infrastruktur",  popular: false },
  { ticker: "PTPP.JK",  code: "PTPP",  name: "PP Persero",              sector: "Infrastruktur",  popular: false },
  { ticker: "SMGR.JK",  code: "SMGR",  name: "Semen Indonesia",         sector: "Infrastruktur",  popular: false },
  { ticker: "INTP.JK",  code: "INTP",  name: "Indocement",              sector: "Infrastruktur",  popular: false },
  { ticker: "MEDC.JK",  code: "MEDC",  name: "Medco Energi",            sector: "Energi",         popular: false },
  { ticker: "PGAS.JK",  code: "PGAS",  name: "Perusahaan Gas Negara",   sector: "Energi",         popular: false },
  { ticker: "BRPT.JK",  code: "BRPT",  name: "Barito Pacific",          sector: "Energi",         popular: false },
  { ticker: "MIKA.JK",  code: "MIKA",  name: "Mitra Keluarga",          sector: "Kesehatan",      popular: false },
  { ticker: "ASII.JK",  code: "ASII",  name: "Astra International",     sector: "Industri",       popular: true  },
  { ticker: "UNTR.JK",  code: "UNTR",  name: "United Tractors",         sector: "Industri",       popular: false },
  { ticker: "ERAA.JK",  code: "ERAA",  name: "Erajaya Swasembada",      sector: "Industri",       popular: false },
  { ticker: "INKP.JK",  code: "INKP",  name: "Indah Kiat Pulp & Paper", sector: "Industri",       popular: false },
  { ticker: "MAPI.JK",  code: "MAPI",  name: "Mitra Adiperkasa",        sector: "Industri",       popular: false },
  { ticker: "MNCN.JK",  code: "MNCN",  name: "Media Nusantara Citra",   sector: "Media",          popular: false },
]

const POPULAR_STOCKS = LQ45_WITH_SECTORS.filter((s) => s.popular)

const FEATURES = [
  { icon: "📈", title: "AI Price Forecasting", desc: "Prediksi harga 7 hari ke depan menggunakan XGBoost & LLM dengan akurasi tinggi." },
  { icon: "📰", title: "Analisis Sentimen Berita", desc: "Scraping & klasifikasi sentimen berita real-time untuk setiap saham LQ45." },
  { icon: "⚡", title: "Indikator Teknikal", desc: "RSI, MACD, Bollinger Bands, Stochastic, MA20/50 diperbarui otomatis." },
  { icon: "🌏", title: "Makro Ekonomi", desc: "Monitor inflasi, BI Rate, kurs IDR, dan pengaruhnya terhadap pasar saham." },
]

const STATS = [
  { label: "Saham LQ45", value: "45", suffix: "" },
  { label: "Indikator Teknikal", value: "12", suffix: "+" },
  { label: "Akurasi Forecast", value: "82", suffix: "%" },
  { label: "Update Data", value: "Real", suffix: "-time" },
]

const SECTORS = ["Semua", ...Object.keys(SECTOR_META)]

export default function LandingPage() {
  const navigate = useNavigate()
  const { allStocks, setCurrentTicker } = useApp()
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [mounted, setMounted] = useState(false)
  const [activeSector, setActiveSector] = useState("Semua")
  const [hoveredStock, setHoveredStock] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

  // Merge API data with local catalogue for sector info
  const enrichedStocks = useMemo(() => {
    if (!allStocks.length) return LQ45_WITH_SECTORS
    return allStocks.map((s) => {
      const local = LQ45_WITH_SECTORS.find((l) => l.ticker === s.ticker)
      return local ? { ...s, sector: local.sector, popular: local.popular } : { ...s, sector: "Lainnya", popular: false }
    })
  }, [allStocks])

  const displayStocks = enrichedStocks.length ? enrichedStocks : LQ45_WITH_SECTORS

  // Search dropdown
  const filtered = query.trim()
    ? displayStocks.filter((s) => {
        const q = query.toLowerCase()
        return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      }).slice(0, 8)
    : []
  const showDropdown = focused && filtered.length > 0

  // Sector grid
  const sectorStocks = activeSector === "Semua"
    ? displayStocks
    : displayStocks.filter((s) => s.sector === activeSector)

  // Group all stocks by sector for the "Semua" tabbed view
  const bySector = useMemo(() => {
    const map = {}
    displayStocks.forEach((s) => {
      if (!map[s.sector]) map[s.sector] = []
      map[s.sector].push(s)
    })
    return map
  }, [displayStocks])

  const handleSelect = (ticker) => {
    setCurrentTicker(ticker)
    navigate("/")
  }

  const handleKeyDown = (e) => {
    if (!filtered.length) return
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)) }
    else if (e.key === "Enter" && highlighted >= 0) handleSelect(filtered[highlighted].ticker)
    else if (e.key === "Escape") { setQuery(""); setFocused(false); inputRef.current?.blur() }
  }

  const sectorMeta = (sector) => SECTOR_META[sector] || { color: "#7e8494", icon: "📊", bg: "rgba(126,132,148,0.12)" }

  return (
    <div className={`lp ${mounted ? "lp-on" : ""}`}>
      {/* Orbs */}
      <div className="lp-orb lp-orb1" /><div className="lp-orb lp-orb2" /><div className="lp-orb lp-orb3" />
      <div className="lp-grid" />

      {/* ── HEADER ─────────────────────────────── */}
      <header className="lp-header">
        <div className="lp-logo"><span className="lp-logo-dot" />StockSense</div>
        <div className="lp-header-center">
        </div>
        <div className="lp-live-badge"><span className="lp-live-dot" />IDX Live Market</div>
      </header>

      {/* ── HERO ───────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-eyebrow"><span className="lp-eyebrow-dot" />Platform Analisis Saham Indonesia</div>
        <h1 className="lp-title">Analisis Saham<br /><span className="lp-title-grad">Lebih Cerdas</span></h1>
        {/* Search */}
        <div className="lp-search-wrap">
          <div className={`lp-search-box ${focused ? "lp-search-focused" : ""}`}>
            <svg className="lp-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              className="lp-search-input"
              placeholder="Cari saham... cth: BBCA, Bank, Telkom"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlighted(-1) }}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 160)}
              onKeyDown={handleKeyDown}
              autoComplete="off" spellCheck={false}
            />
            {query && <button className="lp-search-clear" onClick={() => { setQuery(""); inputRef.current?.focus() }}>×</button>}
            <span className="lp-search-kbd">⌘K</span>
          </div>

          {showDropdown && (
            <div className="lp-drop">
              {filtered.map((s, i) => {
                const meta = sectorMeta(s.sector)
                return (
                  <div
                    key={s.ticker}
                    className={`lp-drop-item ${i === highlighted ? "lp-drop-hl" : ""}`}
                    onMouseDown={() => handleSelect(s.ticker)}
                    onMouseEnter={() => setHighlighted(i)}
                  >
                    <span className="lp-drop-icon" style={{ color: meta.color }}>{meta.icon}</span>
                    <span className="lp-drop-code" style={{ color: meta.color }}>{s.code}</span>
                    <span className="lp-drop-name">{s.name}</span>
                    <span className="lp-drop-sector" style={{ background: meta.bg, color: meta.color }}>{s.sector}</span>
                    <svg className="lp-drop-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                )
              })}
              <div className="lp-drop-footer">{filtered.length} hasil · ↑↓ navigasi · Enter pilih</div>
            </div>
          )}
        </div>
        <p className="lp-search-hint">Pilih saham untuk mulai analisis · atau scroll ke bawah untuk browse semua saham</p>
      </section>

      {/* ── POPULAR STOCKS ─────────────────────── */}
      <section className="lp-section">
        <div className="lp-sec-head">
          <div className="lp-sec-badge lp-sec-badge-amber">🔥 Trending</div>
          <h2 className="lp-sec-title">Saham Paling Populer</h2>
          <p className="lp-sec-sub">Saham blue-chip yang paling banyak dianalisis oleh pengguna</p>
        </div>
        <div className="lp-popular-grid">
          {POPULAR_STOCKS.map((s, i) => {
            const meta = sectorMeta(s.sector)
            return (
              <button
                key={s.ticker}
                className="lp-pop-card"
                style={{ "--cc": meta.color, "--cb": meta.bg, animationDelay: `${i * 50}ms` }}
                onClick={() => handleSelect(s.ticker)}
                onMouseEnter={() => setHoveredStock(s.ticker)}
                onMouseLeave={() => setHoveredStock(null)}
              >
                <div className="lp-pop-top">
                  <span className="lp-pop-icon">{meta.icon}</span>
                  <span className="lp-pop-badge" style={{ background: meta.bg, color: meta.color }}>{s.sector}</span>
                </div>
                <div className="lp-pop-code">{s.code}</div>
                <div className="lp-pop-name">{s.name}</div>
                <div className="lp-pop-cta">
                  Analisis Sekarang
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── ALL LQ45 BY SECTOR ─────────────────── */}
      <section className="lp-section">
        <div className="lp-sec-head">
          <div className="lp-sec-badge lp-sec-badge-blue">📊 LQ45</div>
          <h2 className="lp-sec-title">Semua Saham LQ45</h2>
          <p className="lp-sec-sub">45 saham paling likuid di Bursa Efek Indonesia, dikelompokkan per sektor</p>
        </div>

        {/* Sector tab pills */}
        <div className="lp-sector-tabs">
          {SECTORS.map((sec) => {
            const meta = sec === "Semua" ? null : sectorMeta(sec)
            const count = sec === "Semua" ? displayStocks.length : (bySector[sec]?.length || 0)
            return (
              <button
                key={sec}
                className={`lp-sector-tab ${activeSector === sec ? "lp-sector-tab-active" : ""}`}
                style={activeSector === sec && meta ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
                onClick={() => setActiveSector(sec)}
              >
                {meta ? <span>{meta.icon}</span> : <span>🗂️</span>}
                {sec}
                <span className="lp-sector-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Stock grid — by sector groups when "Semua" */}
        {activeSector === "Semua" ? (
          <div className="lp-sector-groups">
            {Object.entries(bySector).map(([sector, stocks]) => {
              const meta = sectorMeta(sector)
              return (
                <div key={sector} className="lp-sector-group">
                  <div className="lp-sector-group-head" style={{ color: meta.color }}>
                    <span>{meta.icon}</span>
                    <span>{sector}</span>
                    <span className="lp-sg-count">{stocks.length} saham</span>
                  </div>
                  <div className="lp-stock-grid">
                    {stocks.map((s) => (
                      <StockTile key={s.ticker} stock={s} meta={meta} onSelect={handleSelect} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="lp-stock-grid lp-stock-grid-filtered">
            {sectorStocks.map((s) => {
              const meta = sectorMeta(s.sector)
              return <StockTile key={s.ticker} stock={s} meta={meta} onSelect={handleSelect} />
            })}
          </div>
        )}
      </section>

      {/* ── FEATURES ───────────────────────────── */}
      <section className="lp-section lp-features-section">
        <div className="lp-sec-head">
          <div className="lp-sec-badge lp-sec-badge-purple">✨ Fitur</div>
          <h2 className="lp-sec-title">Analisis Komprehensif</h2>
          <p className="lp-sec-sub">Semua yang kamu butuhkan untuk keputusan investasi yang lebih baik</p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-feat-card" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="lp-feat-icon">{f.icon}</div>
              <div className="lp-feat-title">{f.title}</div>
              <div className="lp-feat-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-logo"><span className="lp-logo-dot" style={{ width: 6, height: 6 }} />StockSense</div>
        <span>Platform Analisis Saham Indonesia · DSP Project 2025</span>
        <span>Data: Yahoo Finance · Bursa Efek Indonesia</span>
      </footer>
    </div>
  )
}

// ── Stock Tile sub-component ─────────────────────────────────────────────────
function StockTile({ stock, meta, onSelect }) {
  return (
    <button
      className="lp-stock-tile"
      style={{ "--tc": meta.color, "--tb": meta.bg }}
      onClick={() => onSelect(stock.ticker)}
      title={stock.name}
    >
      <span className="lp-tile-code">{stock.code}</span>
      <span className="lp-tile-name">{stock.name}</span>
      {stock.popular && <span className="lp-tile-hot">🔥</span>}
    </button>
  )
}
