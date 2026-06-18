import { useEffect, useState, useMemo } from "react"
import { Line } from "react-chartjs-2"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const St = {
  chart220: { height: 220 },
  chart200: { height: 200 },
  note: { fontSize: 10, color: "var(--text-muted)", marginTop: 10 },
  legendRow: { display: "flex", gap: 14, marginBottom: 8 },
  legItem: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" },
  dotBlue: { width: 8, height: 8, borderRadius: 2, background: "var(--blue)" },
  dotPurple: { width: 8, height: 8, borderRadius: 2, background: "var(--purple)" },
}

const HERO = [
  { cls: "mh-up", label: "PDB (YoY)", val: "5.03%", chg: "+0.06 QoQ", chgCls: "chg-pos", desc: "Pertumbuhan ekonomi Q1 2025" },
  { cls: "mh-down", label: "Inflasi (YoY)", val: "2.84%", chg: "-0.13 MoM", chgCls: "chg-pos", desc: "Dalam target BI 2.5±1%" },
  { cls: "mh-neu", label: "BI Rate", val: "6.00%", chg: "Tetap", chgCls: "", desc: "Suku bunga acuan BI" },
  { cls: "mh-blue", label: "USD/IDR", val: "16.245", chg: "+0.4%", chgCls: "chg-neg", desc: "Kurs tengah BI" },
  { cls: "mh-purple", label: "Cadangan Devisa", val: "$140,2 M", chg: "+1,8 M", chgCls: "chg-pos", desc: "Posisi April 2025" },
]

const GDP_MONTHS = ["Q2'23", "Q3'23", "Q4'23", "Q1'24", "Q2'24", "Q3'24", "Q4'24", "Q1'25"]
const GDP = [5.17, 4.94, 5.04, 5.11, 5.05, 4.95, 4.97, 5.03]
const INFL = [3.52, 2.28, 2.61, 3.05, 2.51, 1.84, 1.57, 2.84]

export default function MakroEkonomi() {
  const [macroData, setMacroData] = useState(null)

  useEffect(() => {
    api.getMacro().then(d => setMacroData(d.data)).catch(console.error)
  }, [])

  const dynamicHero = useMemo(() => {
    if (!macroData) return HERO // fallback
    const fmtPct = (val) => val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`
    const usd = macroData.USDIDR
    const ihsg = macroData.IHSG
    const bi = macroData.BIRate
    const infl = macroData.Inflation
    const gdp = macroData.GDP
    
    return [
      { cls: "mh-up", label: "PDB (YoY)", val: gdp ? `${gdp.value}%` : "5.03%", chg: gdp ? `${gdp.change_pct} QoQ` : "+0.06 QoQ", chgCls: "chg-pos", desc: "Pertumbuhan ekonomi" },
      { cls: "mh-down", label: "Inflasi (YoY)", val: infl ? `${infl.value}%` : "2.84%", chg: infl ? `${infl.change_pct} MoM` : "-0.13 MoM", chgCls: "chg-pos", desc: "Dalam target BI" },
      { cls: "mh-neu", label: "BI Rate", val: bi ? `${bi.value.toFixed(2)}%` : "6.00%", chg: bi ? bi.desc : "Tetap", chgCls: "", desc: "Suku bunga acuan" },
      { cls: "mh-blue", label: "USD/IDR", val: usd ? Number(usd.value).toLocaleString("id-ID") : "16.245", chg: usd ? fmtPct(usd.change_pct) : "+0.4%", chgCls: usd && usd.change_pct > 0 ? "chg-neg" : "chg-pos", desc: "Kurs pasar spot" },
      { cls: "mh-purple", label: "IHSG", val: ihsg ? Number(ihsg.value).toLocaleString("id-ID") : "7.200", chg: ihsg ? fmtPct(ihsg.change_pct) : "+0.5%", chgCls: ihsg && ihsg.change_pct >= 0 ? "chg-pos" : "chg-neg", desc: "Indeks Harga Saham" },
    ]
  }, [macroData])

  const gdpData = {
    labels: GDP_MONTHS,
    datasets: [
      { label: "PDB", data: GDP, borderColor: "#4f9cf9", backgroundColor: "rgba(79,156,249,0.1)", borderWidth: 1.8, pointRadius: 2, tension: 0.3, fill: true, yAxisID: "y" },
      { label: "Inflasi", data: INFL, borderColor: "#a78bfa", borderWidth: 1.8, pointRadius: 2, tension: 0.3, yAxisID: "y" },
    ],
  }
  const gdpOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 10 } } },
      y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 10 }, callback: (v) => v + "%" } },
    },
  }
  const fxData = {
    labels: macroData?.charts?.USDIDR?.labels || [],
    datasets: [{ data: macroData?.charts?.USDIDR?.data || [], borderColor: "#2dd4a0", backgroundColor: "rgba(45,212,160,0.1)", borderWidth: 1.8, pointRadius: 2, tension: 0.3, fill: true }],
  }
  const fxOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 10 } } },
      y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("id-ID") } },
    },
  }

  return (
    <>
      <TickerSearchBar label="Makro Ekonomi" />
      <div className="content">
        <div className="macro-hero">
          {dynamicHero.map((h, i) => (
            <div className={"mh-card " + h.cls} key={i}>
              <div className="mh-label">{h.label}</div>
              <div className="mh-val">{h.val}</div>
              <div className={"mh-change " + h.chgCls}>{h.chg}</div>
              <div className="mh-desc">{h.desc}</div>
            </div>
          ))}
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-header"><div className="card-title">📈 PDB & Inflasi (YoY)</div></div>
            <div className="card-body">
              <div style={St.legendRow}>
                <div style={St.legItem}><div style={St.dotBlue} /> PDB</div>
                <div style={St.legItem}><div style={St.dotPurple} /> Inflasi</div>
              </div>
              <div className="chart-wrap" style={St.chart220}><Line data={gdpData} options={gdpOpts} /></div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">💱 Kurs USD/IDR (6 Bulan)</div></div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={fxData} options={fxOpts} /></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
