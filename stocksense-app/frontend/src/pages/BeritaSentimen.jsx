import { useEffect, useMemo, useState } from "react"
import { Line } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const St = {
  monoGreen: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--green)" },
  monoRed: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--red)" },
  monoBlue: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--blue)" },
  monoAmber: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--amber)" },
  chart200: { height: 200 },
  ptDotGreen: { background: "var(--green)" },
  ptDotBlue: { background: "var(--blue)" },
  ptDotAmber: { background: "var(--amber)" },
  emptyNote: { fontSize: 12, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" },
}

const SENT_META = {
  positive: { cls: "esb-pos", pill: "sh-green", label: "Positif", short: "POS" },
  neutral: { cls: "esb-neu", pill: "sh-amber", label: "Netral", short: "NTR" },
  negative: { cls: "esb-neg", pill: "sh-red", label: "Negatif", short: "NEG" },
}

// dummy 30-hari tren sentimen (backend belum simpan histori)
const TREND = [52, 55, 51, 58, 60, 57, 62, 59, 63, 65, 61, 64, 67, 63, 60, 58, 62, 66, 69, 65, 63, 67, 70, 68, 66, 64, 68, 71, 69, 72]
const TOPICS = [
  { t: "Laba Bersih", c: "tt-pos" },
  { t: "Dividen", c: "tt-pos" },
  { t: "Ekspansi", c: "tt-pos" },
  { t: "Suku Bunga BI", c: "tt-neu" },
  { t: "IHSG", c: "tt-neu" },
  { t: "Rupiah", c: "tt-neu" },
  { t: "Koreksi", c: "tt-neg" },
  { t: "Aksi Jual Asing", c: "tt-neg" },
]

export default function BeritaSentimen() {
  const { currentTicker } = useApp()
  const code = currentTicker.replace(".JK", "")
  const [news, setNews] = useState(null)
  const [aiSummary, setAiSummary] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [filter, setFilter] = useState("all")

  async function fetchNews() {
    setBusy(true)
    setErr("")
    try {
      const newsData = await api.getNews(currentTicker, 5)
      if (!newsData.articles || !newsData.articles.length) throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.")
      const sentData = await api.predictSentiment(
        currentTicker,
        newsData.articles.map((a) => ({ title: a.title, content: a.content || "" })),
      )
      const merged = newsData.articles.map((a, i) => ({
        ...a,
        sentiment: sentData.results[i]?.sentiment || "neutral",
        sentiment_label: sentData.results[i]?.label || "Netral",
        score: sentData.results[i]?.score || 0,
      }))
      setNews({ total_articles: sentData.total_articles, articles: merged, summary: sentData.summary })

      setAiSummary("Membuat ringkasan AI...")
      api
        .groqNewsSummary({
          ticker: currentTicker,
          articles: merged.map((a) => ({ source: a.source, title: a.title })),
          sentiment_summary: sentData.summary,
        })
        .then((r) => setAiSummary(r.summary || r.main_theme || "Groq tidak memberikan ringkasan."))
        .catch((e) => setAiSummary("Gagal ringkasan Groq: " + e.message))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setNews(null)
    setAiSummary("")
    setErr("")
    fetchNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker])

  const summary = news?.summary
  const articles = news?.articles || []

  const sources = useMemo(() => {
    const m = {}
    articles.forEach((a) => {
      m[a.source] = (m[a.source] || 0) + 1
    })
    const max = Math.max(1, ...Object.values(m))
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, pct: (count / max) * 100 }))
  }, [news])

  const filtered = articles.filter((a) => filter === "all" || a.sentiment === filter)

  const trendData = {
    labels: TREND.map((_, i) => "H-" + (TREND.length - i)),
    datasets: [
      {
        data: TREND,
        borderColor: "#2dd4a0",
        backgroundColor: "rgba(45,212,160,0.12)",
        borderWidth: 1.8,
        pointRadius: 0,
        tension: 0.35,
        fill: true,
      },
    ],
  }
  const trendOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 9 }, maxTicksLimit: 6 } },
      y: { min: 0, max: 100, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 9 } } },
    },
  }

  const posPct = summary?.positive_pct ?? 0
  const neuPct = summary?.neutral_pct ?? 0
  const negPct = summary?.negative_pct ?? 0
  const score = summary?.score ?? 0
  const overallLabel = summary?.overall_label || "—"

  const posBar = { width: posPct + "%", background: "var(--green)" }
  const neuBar = { width: neuPct + "%", background: "var(--amber)" }
  const negBar = { width: negPct + "%", background: "var(--red)" }

  return (
    <>
      <TickerSearchBar label="Berita & Sentimen">
        <button className={"fetch-news-btn " + (busy ? "loading" : "")} onClick={fetchNews} disabled={busy}>
          <span className="spin-sm" />
          <span className="btn-txt">{busy ? "Memuat berita..." : "↻ Ambil Berita"}</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        {err && <div className="error-msg">{err}</div>}

        <div className="sent-hero">
          <div className="sh-card sh-green">
            <div className="kpi-label">Sentimen Positif</div>
            <div style={St.monoGreen}>{posPct + "%"}</div>
            <div className="kpi-sub">{summary ? summary.positive + " artikel" : "—"}</div>
          </div>
          <div className="sh-card sh-amber">
            <div className="kpi-label">Sentimen Netral</div>
            <div style={St.monoAmber}>{neuPct + "%"}</div>
            <div className="kpi-sub">{summary ? summary.neutral + " artikel" : "—"}</div>
          </div>
          <div className="sh-card sh-red">
            <div className="kpi-label">Sentimen Negatif</div>
            <div style={St.monoRed}>{negPct + "%"}</div>
            <div className="kpi-sub">{summary ? summary.negative + " artikel" : "—"}</div>
          </div>
          <div className="sh-card sh-blue">
            <div className="kpi-label">Skor Agregat</div>
            <div style={St.monoBlue}>{score + "/100"}</div>
            <div className="kpi-sub">{overallLabel}</div>
          </div>
        </div>

        <div className="row-main-320">
          <div className="col-gap14">
            <div className="ai-summary">
              <div className="ai-tag">✦ Ringkasan AI · Groq</div>
              <div className="ai-text">{aiSummary || "Membuat ringkasan AI..."}</div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">📰 Berita Terkini — {code}</div>
                <span className="analysis-time">{news ? news.total_articles + " artikel" : ""}</span>
              </div>
              <div className="card-body">
                <div className="nf-bar">
                  <span className={"nf-chip nf-all" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>Semua</span>
                  <span className={"nf-chip nf-pos" + (filter === "positive" ? " active" : "")} onClick={() => setFilter("positive")}>Positif</span>
                  <span className={"nf-chip nf-neu" + (filter === "neutral" ? " active" : "")} onClick={() => setFilter("neutral")}>Netral</span>
                  <span className={"nf-chip nf-neg" + (filter === "negative" ? " active" : "")} onClick={() => setFilter("negative")}>Negatif</span>
                </div>
                {busy && <div style={St.emptyNote}>Memuat berita...</div>}
                {!busy && !filtered.length && <div style={St.emptyNote}>Tidak ada berita untuk filter ini.</div>}
                {filtered.map((a, i) => {
                  const meta = SENT_META[a.sentiment] || SENT_META.neutral
                  return (
                    <div className="eNews-item" key={i}>
                      <div className={"eNews-score-badge " + meta.cls}>
                        {Math.round((a.score || 0) * 100)}
                        <span className="esb-sub">{meta.short}</span>
                      </div>
                      <div className="eNews-body">
                        <div className="eNews-title">
                          {a.url ? (
                            <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a>
                          ) : (
                            a.title
                          )}
                        </div>
                        <div className="eNews-meta">
                          <span className="eNews-src">{a.source}</span>
                          <span className="eNews-time">{a.time}</span>
                          <span className="eNews-impact impact-med">{meta.label}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="col-gap14">
            <div className="card">
              <div className="card-header"><div className="card-title">📊 Distribusi</div></div>
              <div className="card-body">
                <div className="sbar-row"><span className="sbar-lbl">Positif</span><div className="sbar-track"><div className="sbar-fill" style={posBar} /></div><span className="sbar-pct">{posPct + "%"}</span></div>
                <div className="sbar-row"><span className="sbar-lbl">Netral</span><div className="sbar-track"><div className="sbar-fill" style={neuBar} /></div><span className="sbar-pct">{neuPct + "%"}</span></div>
                <div className="sbar-row"><span className="sbar-lbl">Negatif</span><div className="sbar-track"><div className="sbar-fill" style={negBar} /></div><span className="sbar-pct">{negPct + "%"}</span></div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">📡 Sumber Berita</div></div>
              <div className="card-body">
                {!sources.length && <div style={St.emptyNote}>—</div>}
                {sources.map((s, i) => {
                  const fillStyle = { width: s.pct + "%", background: "var(--blue)" }
                  return (
                    <div className="src-row" key={i}>
                      <div className="src-name">{s.name}</div>
                      <div className="src-track"><div className="src-fill" style={fillStyle} /></div>
                      <div className="src-count">{s.count}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">🏷 Topik</div></div>
              <div className="card-body">
                <div className="topic-cloud">
                  {TOPICS.map((t, i) => (
                    <span className={"topic-tag " + t.c} key={i}>{t.t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">📈 Tren Sentimen 30 Hari</div></div>
          <div className="card-body">
            <div className="trend-label">Skor sentimen harian (ilustrasi)</div>
            <div className="chart-wrap" style={St.chart200}><Line data={trendData} options={trendOpts} /></div>
          </div>
        </div>
      </div>
    </>
  )
}
