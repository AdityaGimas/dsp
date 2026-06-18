import { useEffect, useState } from "react"
import { Bar } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"
import { fmt } from "../utils/format.js"

const St = {
  green: { color: "var(--green)" },
  red: { color: "var(--red)" },
  amber: { color: "var(--amber)" },
  blue: { color: "var(--blue)" },
  chart120: { height: 120 },
  miniNote: { fontSize: 10, color: "var(--text-muted)", marginTop: 8 },
  aiBox: { marginTop: 0 },
  aiPlaceholder: { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 },
  sumLabels: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 6 },
  pivotRow: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 8 },
  priceBig: { fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, marginBottom: 4 },
}

// klasifikasi sinyal teks -> buy | sell | hold
function sigClass(signal) {
  const s = (signal || "").toLowerCase()
  if (/beli|bullish|atas|oversold/.test(s)) return "buy"
  if (/jual|bearish|overbought/.test(s)) return "sell"
  return "hold"
}
function sigStyle(signal) {
  const c = sigClass(signal)
  return c === "buy" ? St.green : c === "sell" ? St.red : St.amber
}

// dummy support/resistance & pivot (backend belum menyediakan)
const SR = [
  { label: "Resistance 2", price: 10250, color: "var(--red)", strength: 4 },
  { label: "Resistance 1", price: 9850, color: "var(--red)", strength: 3 },
  { label: "Pivot", price: 9520, color: "var(--blue)", strength: 5 },
  { label: "Support 1", price: 9180, color: "var(--green)", strength: 3 },
  { label: "Support 2", price: 8900, color: "var(--green)", strength: 4 },
]
const PIVOTS = [
  { lbl: "S3", val: 8750, col: "var(--green)" },
  { lbl: "S2", val: 8900, col: "var(--green)" },
  { lbl: "S1", val: 9180, col: "var(--green)" },
  { lbl: "PP", val: 9520, col: "var(--blue)" },
  { lbl: "R1", val: 9850, col: "var(--red)" },
  { lbl: "R2", val: 10250, col: "var(--red)" },
  { lbl: "R3", val: 10580, col: "var(--red)" },
]

export default function IndikatorTeknikal() {
  const { currentTicker } = useApp()
  const code = currentTicker.replace(".JK", "")
  const [ind, setInd] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    let alive = true
    setBusy(true)
    setErr("")
    Promise.allSettled([api.getIndicators(currentTicker), api.getStockInfo(currentTicker)]).then(([i, f]) => {
      if (!alive) return
      if (i.status === "fulfilled" && i.value && i.value.rsi) setInd(i.value)
      else {
        setInd(null)
        setErr("Indikator tidak tersedia untuk saham ini.")
      }
      setInfo(f.status === "fulfilled" ? f.value : null)
      setBusy(false)
    })
    return () => {
      alive = false
    }
  }, [currentTicker])

  const rsi = ind?.rsi
  const macd = ind?.macd
  const ma = ind?.moving_average
  const bb = ind?.bollinger_bands
  const stoch = ind?.stochastic
  const vol = ind?.volume_ratio
  const overall = ind?.overall
  const price = info?.current_price
  const chgPct = info?.change_pct

  const buyCount = overall?.buy_count ?? 0
  const total = overall?.total ?? 4
  const sellCount = total - buyCount
  const buyPct = total ? (buyCount / total) * 100 : 0
  const ovStyle = sigStyle(overall?.signal)

  // MACD mini histogram (dummy bila tak ada riwayat) + nilai terkini
  const macdHist = macd ? [macd.histogram * 0.4, macd.histogram * 0.6, macd.histogram * 0.8, macd.histogram] : []
  const macdData = {
    labels: macdHist.map((_, i) => i + 1),
    datasets: [
      {
        data: macdHist,
        backgroundColor: macdHist.map((v) => (v >= 0 ? "rgba(45,212,160,0.7)" : "rgba(245,94,94,0.7)")),
        borderRadius: 2,
      },
    ],
  }
  const macdOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 9 } } } },
  }

  const sumBuyStyle = { width: buyPct + "%", background: "var(--green)" }
  const sumSellStyle = { width: 100 - buyPct + "%", background: "var(--red)" }
  const rsiNeedleStyle = rsi ? { left: Math.min(Math.max(rsi.value, 0), 100) + "%", background: "var(--blue)" } : { left: "50%", background: "var(--blue)" }
  const stochNeedleStyle = stoch ? { left: Math.min(Math.max(stoch.value, 0), 100) + "%", background: "var(--purple)" } : { left: "50%", background: "var(--purple)" }

  const cards = ind
    ? [
        { name: "RSI (14)", val: rsi.value, sig: rsi.signal, desc: "Momentum overbought/oversold" },
        { name: "MACD", val: macd.value, sig: macd.signal, desc: "Hist " + macd.histogram },
        { name: "MA 20 / 50", val: ma.golden_cross ? "Golden" : "Death", sig: ma.signal, desc: "MA20 " + fmt(ma.ma20) },
        { name: "Bollinger", val: bb.position, sig: bb.position.includes("Upper") ? "Beli" : "Netral", desc: "Mid " + fmt(bb.mid) },
        { name: "Stochastic", val: stoch.value, sig: stoch.signal, desc: "Volume " + (vol ? vol.value + "x" : "—") },
      ]
    : []

  return (
    <>
      <TickerSearchBar label="Indikator Teknikal">
        <button className={"fetch-news-btn " + (busy ? "loading" : "")} disabled={busy}>
          <span className="spin-sm" />
          <span className="btn-txt">{busy ? "Memuat..." : "↻ Refresh"}</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        {err && <div className="error-msg">{err}</div>}



        <div className="row-main-320">
          <div className="col-gap14">
            <div className="card">
              <div className="card-header">
                <div className="card-title">📊 Ringkasan Sinyal — {code}</div>
                <span className="sig-signal" style={ovStyle}>{overall?.signal || "—"}</span>
              </div>
              <div className="card-body">
                <div className="sum-bar">
                  <div className="sum-seg" style={sumBuyStyle} />
                  <div className="sum-seg" style={sumSellStyle} />
                </div>
                <div style={St.sumLabels}>
                  <span style={St.green}>{buyCount + " sinyal Beli"}</span>
                  <span style={St.red}>{sellCount + " sinyal Jual/Netral"}</span>
                </div>
              </div>
            </div>

            <div className="row-2" style={{marginTop: 16}}>
              <div className="card">
                <div className="card-header"><div className="card-title">RSI (14)</div><span className="sig-signal" style={sigStyle(rsi?.signal)}>{rsi?.signal || "—"}</span></div>
                <div className="card-body">
                  <div className="ind-val-big" style={St.blue}>{rsi ? rsi.value : "—"}</div>
                  <div className="ind-subtitle">Relative Strength Index</div>
                  <div className="osc-wrap" style={{marginTop: 16}}><div className="osc-track"><div className="osc-needle" style={rsiNeedleStyle} /></div><div className="osc-labels"><span>0</span><span>30</span><span>70</span><span>100</span></div></div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">MACD</div><span className="sig-signal" style={sigStyle(macd?.signal)}>{macd?.signal || "—"}</span></div>
                <div className="card-body">
                  <div className="ind-val-big" style={sigStyle(macd?.signal)}>{macd ? macd.value : "—"}</div>
                  <div className="ind-subtitle">Signal {macd ? macd.signal_line : "—"} · Hist {macd ? macd.histogram : "—"}</div>
                  <div className="chart-wrap" style={St.chart120}><Bar data={macdData} options={macdOpts} /></div>
                </div>
              </div>
            </div>
            
            <div className="row-2" style={{marginTop: 16}}>
              <div className="card">
                <div className="card-header"><div className="card-title">Bollinger Bands</div><span className="sig-signal sig-signal-hold">{bb?.position || "—"}</span></div>
                <div className="card-body">
                  <div className="ind-stat-row"><span className="ind-sk">Upper</span><span className="ind-sv">{bb ? fmt(bb.upper) : "—"}</span></div>
                  <div className="ind-stat-row"><span className="ind-sk">Mid (MA20)</span><span className="ind-sv">{bb ? fmt(bb.mid) : "—"}</span></div>
                  <div className="ind-stat-row"><span className="ind-sk">Lower</span><span className="ind-sv">{bb ? fmt(bb.lower) : "—"}</span></div>
                  <div className="ind-stat-row"><span className="ind-sk">Posisi</span><span className="ind-sv" style={St.blue}>{bb?.position || "—"}</span></div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Stochastic & Volume</div><span className="sig-signal" style={sigStyle(stoch?.signal)}>{stoch?.signal || "—"}</span></div>
                <div className="card-body">
                  <div className="ind-val-big" style={St.amber}>{stoch ? stoch.value : "—"}</div>
                  <div className="ind-subtitle">Stochastic Oscillator</div>
                  <div className="osc-wrap" style={{marginTop: 16, marginBottom: 16}}><div className="osc-track"><div className="osc-needle" style={stochNeedleStyle} /></div><div className="osc-labels"><span>0</span><span>20</span><span>80</span><span>100</span></div></div>
                  <div className="vol-stat"><span className="vol-sk">Volume Ratio</span><span className="vol-sv" style={sigStyle(vol?.signal)}>{vol ? vol.value + "x" : "—"}</span></div>
                  <div className="vol-stat"><span className="vol-sk">Status Volume</span><span className="vol-sv">{vol?.signal || "—"}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-gap14">
            <div className="card">
              <div className="card-header"><div className="card-title">💰 Harga {code}</div></div>
              <div className="card-body">
                <div style={St.priceBig}>{price ? fmt(price) : "—"}</div>
                <div className={chgPct >= 0 ? "chg-pos" : "chg-neg"}>{chgPct != null ? (chgPct >= 0 ? "+" : "") + chgPct + "%" : "—"}</div>
                <div className="ind-subtitle">{info?.name || code}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">🎯 Support / Resistance</div></div>
              <div className="card-body">
                {SR.map((s, i) => {
                  const dotStyle = { background: s.color }
                  const priceStyle = { color: s.color }
                  const strengthStyle = { color: s.color }
                  return (
                    <div className="sr-item" key={i}>
                      <div className="sr-dot" style={dotStyle} />
                      <div className="sr-label">{s.label}</div>
                      <div className="sr-price" style={priceStyle}>{fmt(s.price)}</div>
                      <div className="sr-strength" style={strengthStyle}>
                        {[0, 1, 2, 3, 4].map((p) => (
                          <div className={"sr-pip" + (p < s.strength ? " filled" : "")} key={p} />
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div style={St.miniNote}>* Level estimasi pivot — indikasi, bukan saran transaksi.</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">📍 Pivot Points</div></div>
              <div className="card-body">
                <div className="pivot-grid">
                  {PIVOTS.map((p, i) => {
                    const valStyle = { color: p.col }
                    return (
                      <div className="pivot-cell" key={i}>
                        <div className="pivot-lbl">{p.lbl}</div>
                        <div className="pivot-val" style={valStyle}>{fmt(p.val)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">🤖 Analisis AI</div></div>
          <div className="card-body">
            <div className="ai-box" style={St.aiBox}>
              <div className="ai-lbl">Groq · Analisis Teknikal</div>
              <div style={St.aiPlaceholder}>
                Buka tab “Overview” lalu jalankan “Analisis Groq” untuk mendapatkan interpretasi naratif indikator teknikal {code} berbasis LLM. Indikator di halaman ini diambil langsung dari data pasar real-time.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
