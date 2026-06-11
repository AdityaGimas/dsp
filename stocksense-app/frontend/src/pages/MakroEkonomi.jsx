import { Line } from "react-chartjs-2"
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

const FX_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"]
const FX = [15730, 15940, 16180, 16450, 16320, 16245]

const RATES = [
  { date: "Jun'25", rate: "6.00%", delta: "0", col: "var(--amber)" },
  { date: "Mei'25", rate: "6.00%", delta: "0", col: "var(--amber)" },
  { date: "Apr'25", rate: "6.00%", delta: "-0.25", col: "var(--green)" },
  { date: "Jan'25", rate: "6.25%", delta: "+0.25", col: "var(--red)" },
  { date: "Sep'24", rate: "6.00%", delta: "-0.25", col: "var(--green)" },
]
const FXTABLE = [
  { pair: "USD/IDR", rate: "16.245", chg: "+0.4%", up: false },
  { pair: "EUR/IDR", rate: "17.580", chg: "+0.6%", up: false },
  { pair: "SGD/IDR", rate: "12.090", chg: "+0.2%", up: false },
  { pair: "JPY/IDR", rate: "103,4", chg: "-0.3%", up: true },
  { pair: "CNY/IDR", rate: "2.241", chg: "+0.1%", up: false },
]
const GLOBAL = [
  { flag: "🇺🇸", name: "Dow Jones", val: "38.790", chg: "+0.4%", up: true },
  { flag: "🇺🇸", name: "Nasdaq", val: "17.190", chg: "+0.8%", up: true },
  { flag: "🄯🇵", name: "Nikkei 225", val: "38.420", chg: "-0.2%", up: false },
  { flag: "🇭🇰", name: "Hang Seng", val: "18.030", chg: "+1.1%", up: true },
  { flag: "🇸🇬", name: "STI", val: "3.330", chg: "+0.3%", up: true },
]
const SECTORS = [
  { name: "Perbankan", chg: "+1.2%", up: true },
  { name: "Energi", chg: "+2.4%", up: true },
  { name: "Konsumer", chg: "-0.4%", up: false },
  { name: "Telekomunikasi", chg: "+0.6%", up: true },
  { name: "Properti", chg: "-1.1%", up: false },
  { name: "Infrastruktur", chg: "+0.9%", up: true },
  { name: "Tambang", chg: "+3.1%", up: true },
  { name: "Kesehatan", chg: "+0.2%", up: true },
]
const EVENTS = [
  { day: "18", mon: "Jun", name: "Rapat Dewan Gubernur BI", desc: "Keputusan BI Rate Juni 2025", impact: "event-high", impactLbl: "High" },
  { day: "01", mon: "Jul", name: "Rilis Inflasi (BPS)", desc: "CPI Juni 2025 YoY & MoM", impact: "event-high", impactLbl: "High" },
  { day: "05", mon: "Jul", name: "Cadangan Devisa", desc: "Posisi devisa akhir Juni", impact: "event-med", impactLbl: "Med" },
  { day: "15", mon: "Jul", name: "Neraca Perdagangan", desc: "Ekspor-impor Juni 2025", impact: "event-med", impactLbl: "Med" },
]
const CORR = {
  cols: ["IHSG", "USD", "BI Rate", "Minyak", "Emas"],
  rows: [
    { label: "IHSG", cells: [{ v: "1.00", c: "corr-self" }, { v: "-0.62", c: "corr-neg-strong" }, { v: "-0.41", c: "corr-neg-med" }, { v: "0.34", c: "corr-pos-med" }, { v: "0.18", c: "corr-pos-weak" }] },
    { label: "USD", cells: [{ v: "-0.62", c: "corr-neg-strong" }, { v: "1.00", c: "corr-self" }, { v: "0.55", c: "corr-pos-strong" }, { v: "-0.22", c: "corr-neg-weak" }, { v: "0.48", c: "corr-pos-med" }] },
    { label: "BI Rate", cells: [{ v: "-0.41", c: "corr-neg-med" }, { v: "0.55", c: "corr-pos-strong" }, { v: "1.00", c: "corr-self" }, { v: "-0.15", c: "corr-neg-weak" }, { v: "0.12", c: "corr-pos-weak" }] },
    { label: "Minyak", cells: [{ v: "0.34", c: "corr-pos-med" }, { v: "-0.22", c: "corr-neg-weak" }, { v: "-0.15", c: "corr-neg-weak" }, { v: "1.00", c: "corr-self" }, { v: "0.29", c: "corr-pos-med" }] },
    { label: "Emas", cells: [{ v: "0.18", c: "corr-pos-weak" }, { v: "0.48", c: "corr-pos-med" }, { v: "0.12", c: "corr-pos-weak" }, { v: "0.29", c: "corr-pos-med" }, { v: "1.00", c: "corr-self" }] },
  ],
}

export default function MakroEkonomi() {
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
    labels: FX_MONTHS,
    datasets: [{ data: FX, borderColor: "#2dd4a0", backgroundColor: "rgba(45,212,160,0.1)", borderWidth: 1.8, pointRadius: 2, tension: 0.3, fill: true }],
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
          {HERO.map((h, i) => (
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

        <div className="row-2">
          <div className="card">
            <div className="card-header"><div className="card-title">🏛 Lintasan BI Rate</div></div>
            <div className="card-body">
              <div className="rate-timeline">
                {RATES.map((r, i) => {
                  const dotStyle = { background: r.col }
                  const deltaStyle = { color: r.col }
                  return (
                    <div className="rt-item" key={i}>
                      <div className="rt-dot" style={dotStyle} />
                      <div className="rt-date">{r.date}</div>
                      <div className="rt-rate">{r.rate}</div>
                      <div className="rt-delta" style={deltaStyle}>{r.delta}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">💱 Nilai Tukar</div></div>
            <div className="card-body">
              {FXTABLE.map((f, i) => {
                const chgStyle = { color: f.up ? "var(--green)" : "var(--red)" }
                return (
                  <div className="fx-row" key={i}>
                    <div className="fx-pair">{f.pair}</div>
                    <div className="fx-rate">{f.rate}</div>
                    <div className="fx-chg" style={chgStyle}>{f.chg}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-header"><div className="card-title">🌍 Indeks Global</div></div>
            <div className="card-body">
              {GLOBAL.map((g, i) => {
                const chgStyle = { color: g.up ? "var(--green)" : "var(--red)" }
                return (
                  <div className="gidx-row" key={i}>
                    <div className="gidx-flag">{g.flag}</div>
                    <div className="gidx-name">{g.name}</div>
                    <div className="gidx-val">{g.val}</div>
                    <div className="gidx-chg" style={chgStyle}>{g.chg}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">🏭 Performa Sektor</div></div>
            <div className="card-body">
              <div className="sector-grid">
                {SECTORS.map((s, i) => {
                  const chgStyle = { color: s.up ? "var(--green)" : "var(--red)" }
                  const barStyle = { background: s.up ? "var(--green)" : "var(--red)", width: "60%" }
                  return (
                    <div className="sector-cell" key={i}>
                      <div className="sector-name">{s.name}</div>
                      <div className="sector-chg" style={chgStyle}>{s.chg}</div>
                      <div className="sector-bar" style={barStyle} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-header"><div className="card-title">📅 Kalender Ekonomi</div></div>
            <div className="card-body">
              {EVENTS.map((e, i) => (
                <div className="event-item" key={i}>
                  <div className="event-date-block">
                    <div className="event-day">{e.day}</div>
                    <div className="event-month">{e.mon}</div>
                  </div>
                  <div className="event-body">
                    <div className="event-name">{e.name}</div>
                    <div className="event-desc">{e.desc}</div>
                  </div>
                  <div className={"event-impact " + e.impact}>{e.impactLbl}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">🔗 Matriks Korelasi</div></div>
            <div className="card-body">
              <div className="corr-grid">
                <div className="corr-header" />
                {CORR.cols.map((c, i) => (
                  <div className="corr-header" key={i}>{c}</div>
                ))}
                {CORR.rows.map((row, ri) => (
                  <>
                    <div className="corr-row-label" key={"l" + ri}>{row.label}</div>
                    {row.cells.map((cell, ci) => (
                      <div className={"corr-cell " + cell.c} key={ri + "-" + ci}>{cell.v}</div>
                    ))}
                  </>
                ))}
              </div>
              <div style={St.note}>* Korelasi ilustratif 12 bulan terakhir (data dummy).</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
