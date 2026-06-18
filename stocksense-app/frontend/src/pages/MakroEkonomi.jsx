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


const GDP_MONTHS = ["Q2'23", "Q3'23", "Q4'23", "Q1'24", "Q2'24", "Q3'24", "Q4'24", "Q1'25"]
const GDP = [5.17, 4.94, 5.04, 5.11, 5.05, 4.95, 4.97, 5.03]
const INFL = [3.52, 2.28, 2.61, 3.05, 2.51, 1.84, 1.57, 2.84]

export default function MakroEkonomi() {
  const [macroData, setMacroData] = useState(null)

  useEffect(() => {
    api.getMacro().then(d => setMacroData(d.data)).catch(console.error)
  }, [])


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

  const ihsgData = {
    labels: macroData?.charts?.IHSG?.labels || [],
    datasets: [{ data: macroData?.charts?.IHSG?.data || [], borderColor: "#f5b731", backgroundColor: "rgba(245,183,49,0.1)", borderWidth: 1.8, pointRadius: 2, tension: 0.3, fill: true }],
  }
  const ihsgOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 10 } } },
      y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("id-ID") } },
    },
  }

  const biRateData = {
    labels: GDP_MONTHS,
    datasets: [{ data: [5.75, 5.75, 6.00, 6.00, 6.25, 6.25, 6.00, 6.00], borderColor: "#f55e5e", backgroundColor: "rgba(245,94,94,0.1)", borderWidth: 1.8, pointRadius: 2, tension: 0.1, fill: true, stepped: true }],
  }
  const biRateOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 10 } } },
      y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 10 }, callback: (v) => v.toFixed(2) + "%" } },
    },
  }

  return (
    <>
      <TickerSearchBar label="Makro Ekonomi" />
      <div className="content">


        <div className="row-2">
          <div className="card">
            <div className="card-header"><div className="card-title">📈 PDB & Inflasi (YoY)</div></div>
            <div className="card-body">
              <div style={St.legendRow}>
                <div style={St.legItem}><div style={St.dotBlue} /> PDB</div>
                <div style={St.legItem}><div style={St.dotPurple} /> Inflasi</div>
              </div>
              <div className="chart-wrap" style={St.chart220}><Line data={gdpData} options={gdpOpts} /></div>
              <div style={St.note}>Menampilkan data historis kuartalan untuk Produk Domestik Bruto dan tingkat inflasi bulanan.</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">💱 Kurs USD/IDR (6 Bulan)</div></div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={fxData} options={fxOpts} /></div>
              <div style={St.note}>Pergerakan nilai tukar Rupiah terhadap Dolar AS berdasarkan harga penutupan di akhir bulan.</div>
            </div>
          </div>
        </div>
        
        <div className="row-2" style={{marginTop: 16}}>
          <div className="card">
            <div className="card-header"><div className="card-title">📊 Indeks Harga Saham Gabungan (IHSG)</div></div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={ihsgData} options={ihsgOpts} /></div>
              <div style={St.note}>Kinerja IHSG (Jakarta Composite Index) selama 6 bulan terakhir. Menunjukkan sentimen pasar secara umum.</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">🏦 Suku Bunga Acuan (BI Rate)</div></div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={biRateData} options={biRateOpts} /></div>
              <div style={St.note}>Perubahan suku bunga acuan Bank Indonesia (7-Day Reverse Repo Rate) historis.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
