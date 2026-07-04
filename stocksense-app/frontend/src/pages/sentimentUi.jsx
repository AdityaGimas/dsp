// sentimentUi.jsx — komponen UI bersama untuk 3 model sentimen
// (IndoBERT + Groq #1 + Groq #2). Semua style memakai referensi objek single-brace.
import { Fragment } from "react"

export const MODEL_NAME = { bert: "IndoBERT", llm: "Llama 3.3 70B", llm2: "Qwen3 32B" }
export const MODEL_KEYS3 = ["bert", "llm", "llm2"]
export const MODEL_ACCENT = { bert: "var(--blue)", llm: "var(--purple)", llm2: "var(--teal)" }

export function clrO(o) {
  return o === "positive" ? "var(--green)" : o === "negative" ? "var(--red)" : "var(--amber)"
}
export function lblO(o) {
  return o === "positive" ? "Positif" : o === "negative" ? "Negatif" : "Netral"
}
export function bgClrO(o) {
  return o === "positive"
    ? "rgba(45,212,160,0.12)"
    : o === "negative"
      ? "rgba(245,94,94,0.12)"
      : "rgba(245,183,49,0.12)"
}

function statFor(articles, field, scoreField) {
  const total = articles.length || 1
  const pos = articles.filter((a) => a[field] === "positive").length
  const neu = articles.filter((a) => a[field] === "neutral").length
  const neg = articles.filter((a) => a[field] === "negative").length
  const score = Math.round((articles.reduce((s, a) => s + (a[scoreField] || 0), 0) / total) * 100)
  const overall =
    pos >= neg && pos >= neu ? "positive" : neg >= pos && neg >= neu ? "negative" : "neutral"
  return {
    posPct: Math.round((pos / total) * 100),
    neuPct: Math.round((neu / total) * 100),
    negPct: Math.round((neg / total) * 100),
    score,
    overall,
  }
}

export function computeStats3(articles) {
  const list = articles || []
  return {
    bert: statFor(list, "sentiment", "score"),
    llm: statFor(list, "llm_sentiment", "llm_score"),
    llm2: statFor(list, "llm2_sentiment", "llm2_score"),
  }
}

export function consensus3(stats) {
  const vals = MODEL_KEYS3.map((k) => stats[k].overall)
  const counts = {}
  vals.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1
  })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return { label: top[0], agree: top[1], total: vals.length }
}

function numStyle(base, size) {
  return Object.assign({}, base, { fontSize: size })
}
function barFill(pct, color) {
  return { width: pct + "%", background: color }
}
function pctBy(stats, key) {
  return { bert: stats.bert[key], llm: stats.llm[key], llm2: stats.llm2[key] }
}
function pillStyle(overall) {
  return {
    background: bgClrO(overall),
    border: "1.5px solid " + clrO(overall) + "55",
    color: clrO(overall),
    padding: "5px 18px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  }
}
function consPillStyle(color) {
  return {
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid " + color + "66",
    color: color,
    padding: "5px 18px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  }
}
function consCapStyle(color) {
  return { color: color, fontWeight: 700 }
}
function distBtnStyle(active, color, bg) {
  return {
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: active ? 700 : 400,
    borderRadius: 4,
    border: "1px solid",
    borderColor: active ? color : "rgba(255,255,255,0.1)",
    background: active ? bg : "transparent",
    color: active ? color : "var(--text-muted)",
    cursor: "pointer",
    transition: "all 0.15s ease",
  }
}

const S = {
  toggleWrap: { display: "flex", justifyContent: "flex-end", marginBottom: 12 },
  toggleBox: { background: "var(--bg-card)", border: "1px solid var(--border)" },
  kpiSingle: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 10 },
  kpiMulti: { display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 10 },
  kpiDiv: { width: 1, height: 34, background: "rgba(255,255,255,0.12)" },
  kpiCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  kpiMdl: {
    fontSize: 9,
    color: "var(--text-muted)",
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  kpiSub: { marginTop: 8, textAlign: "center" },
  cmpBody: { animation: "fadeInDown 0.2s ease" },
  pillRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    padding: "12px 0 18px 0",
    borderBottom: "1px solid var(--border-light)",
    marginBottom: 16,
  },
  pillCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  pillCap: { fontSize: 9, color: "var(--text-muted)", textAlign: "center" },
  pillDiv: { borderLeft: "1px solid var(--border-light)", height: 60, alignSelf: "center" },
  sRowDuo: { display: "flex", justifyContent: "center", gap: 48, width: "100%", flexWrap: "wrap" },
  sHr: { height: 1, background: "var(--border-light)", width: "100%" },
  sCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  sCellName: { fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textAlign: "center" },
  sCellScore: { fontSize: 10, color: "var(--text-muted)", textAlign: "center" },
  cr3Wrap: { marginBottom: 14 },
  cr3Head: { display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 },
  cr3Label: { fontWeight: 600 },
  cr3Nums: { color: "var(--text-muted)", fontSize: 10 },
  cr3Row: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  cr3RowLbl: { fontSize: 8, width: 46, color: "var(--text-muted)", fontWeight: 600 },
  cr3Track: { flex: 1, height: 4 },
  cr3Pct: { fontSize: 10, width: 32, textAlign: "right", color: "var(--text-muted)" },
  badgeCol: { display: "flex", flexDirection: "column", gap: 5, minWidth: 52 },
  distTogWrap: { display: "flex", gap: 4 },
}

export function SentModelToggle({ value, onChange }) {
  const opts = [
    { id: "bert", label: "IndoBERT" },
    { id: "llm", label: "Llama 3.3 70B" },
    { id: "llm2", label: "Qwen3 32B" },
    { id: "both", label: "Semua" },
  ]
  return (
    <div style={S.toggleWrap}>
      <div className="fc-model-toggle" style={S.toggleBox}>
        {opts.map((m) => (
          <button
            key={m.id}
            className={"fc-mtog " + (value === m.id ? "fc-mtog-active" : "")}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SentKpiHero({ activeModel, total, stats }) {
  const mono = {
    green: { fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--green)" },
    amber: { fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--amber)" },
    red: { fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" },
  }
  const cards = [
    { label: "Sentimen Positif", cls: "sh-green", mono: mono.green, key: "posPct" },
    { label: "Sentimen Netral", cls: "sh-amber", mono: mono.amber, key: "neuPct" },
    { label: "Sentimen Negatif", cls: "sh-red", mono: mono.red, key: "negPct" },
  ]
  const shown = activeModel === "both" ? MODEL_KEYS3 : [activeModel]
  const size = activeModel === "both" ? 18 : 26
  return (
    <div className="sent-hero">
      {cards.map((c) => (
        <div key={c.label} className={"sh-card " + c.cls}>
          <div className="kpi-label">{c.label}</div>
          <div style={activeModel === "both" ? S.kpiMulti : S.kpiSingle}>
            {shown.map((mk, mi) => (
              <Fragment key={mk}>
                {mi > 0 ? <div style={S.kpiDiv} /> : null}
                <div style={S.kpiCol}>
                  <div style={S.kpiMdl}>{MODEL_NAME[mk]}</div>
                  <div style={numStyle(c.mono, size)}>{stats[mk][c.key]}%</div>
                </div>
              </Fragment>
            ))}
          </div>
          <div className="kpi-sub" style={S.kpiSub}>
            {"Dari " + total + " artikel"}
          </div>
        </div>
      ))}
    </div>
  )
}

function CompareRow3({ label, pcts, color }) {
  return (
    <div style={S.cr3Wrap}>
      <div style={S.cr3Head}>
        <span style={S.cr3Label}>{label}</span>
        <span style={S.cr3Nums}>
          IndoBERT {pcts.bert}% · Llama 3.3 {pcts.llm}% · Qwen3 {pcts.llm2}%
        </span>
      </div>
      {MODEL_KEYS3.map((mk) => (
        <div style={S.cr3Row} key={mk}>
          <span style={S.cr3RowLbl}>{MODEL_NAME[mk]}</span>
          <div className="sbar-track" style={S.cr3Track}>
            <div className="sbar-fill" style={barFill(pcts[mk], color)} />
          </div>
          <span style={S.cr3Pct}>{pcts[mk]}%</span>
        </div>
      ))}
    </div>
  )
}

function SentCell({ name, stat }) {
  return (
    <div style={S.sCell}>
      <div style={S.sCellName}>{name}</div>
      <div style={pillStyle(stat.overall)}>{lblO(stat.overall)}</div>
      <div style={S.sCellScore}>{"Skor " + stat.score}</div>
    </div>
  )
}

export function SentCompare({ stats }) {
  const cons = consensus3(stats)
  const consColor =
    cons.agree === 3 ? "var(--green)" : cons.agree === 2 ? "var(--amber)" : "var(--red)"
  const consTxt = cons.agree === 3 ? "Sepakat" : cons.agree === 2 ? "Mayoritas" : "Berbeda"
  return (
    <div className="card-body" style={S.cmpBody}>
      <div style={S.pillRow}>
        <SentCell name={MODEL_NAME.bert} stat={stats.bert} />
        <div style={S.sHr} />
        <div style={S.sRowDuo}>
          <SentCell name={MODEL_NAME.llm} stat={stats.llm} />
          <SentCell name={MODEL_NAME.llm2} stat={stats.llm2} />
        </div>
        <div style={S.sHr} />
        <div style={S.sCell}>
          <div style={S.sCellName}>Konsensus</div>
          <div style={consPillStyle(consColor)}>{cons.agree + "/" + cons.total}</div>
          <div style={S.sCellScore}>
            <span style={consCapStyle(consColor)}>{consTxt}</span>
          </div>
        </div>
      </div>
      <div>
        <CompareRow3 label="Positif" pcts={pctBy(stats, "posPct")} color="var(--green)" />
        <CompareRow3 label="Netral" pcts={pctBy(stats, "neuPct")} color="var(--amber)" />
        <CompareRow3 label="Negatif" pcts={pctBy(stats, "negPct")} color="var(--red)" />
      </div>
    </div>
  )
}

export function ArticleBadges({ a, meta }) {
  const rows = [
    { name: "IndoBERT", m: meta[a.sentiment] || meta.neutral, score: a.score },
    { name: "Llama 3.3", m: meta[a.llm_sentiment] || meta.neutral, score: a.llm_score },
    { name: "Qwen3", m: meta[a.llm2_sentiment] || meta.neutral, score: a.llm2_score },
  ]
  return (
    <div style={S.badgeCol}>
      {rows.map((r) => (
        <div key={r.name} className={"eNews-score-badge " + r.m.cls}>
          <span className="esb-lbl">{r.m.short}</span>
          <span className="esb-sub">{r.name}</span>
          <span className="esb-conf">{Math.round((r.score || 0) * 100)}</span>
        </div>
      ))}
    </div>
  )
}

export function DistToggle({ value, onChange }) {
  const opts = [
    { id: "bert", label: "IndoBERT", color: "var(--blue)", bg: "rgba(96,165,250,0.18)" },
    { id: "llm", label: "Llama 3.3 70B", color: "var(--purple)", bg: "rgba(167,139,250,0.18)" },
    { id: "llm2", label: "Qwen3 32B", color: "var(--teal)", bg: "rgba(45,212,191,0.18)" },
  ]
  return (
    <div style={S.distTogWrap}>
      {opts.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} style={distBtnStyle(value === o.id, o.color, o.bg)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SentDistribution({ distModel, stats }) {
  const st = stats[distModel] || stats.bert
  const rows = [
    { label: "Positif", pct: st.posPct, color: "var(--green)" },
    { label: "Netral", pct: st.neuPct, color: "var(--amber)" },
    { label: "Negatif", pct: st.negPct, color: "var(--red)" },
  ]
  return (
    <>
      {rows.map((r) => (
        <div className="sbar-row" key={r.label}>
          <span className="sbar-lbl">{r.label}</span>
          <div className="sbar-track">
            <div className="sbar-fill" style={barFill(r.pct, r.color)} />
          </div>
          <span className="sbar-pct">{r.pct}%</span>
        </div>
      ))}
    </>
  )
}


export const OV_MODEL_NAME = { bert: "IndoBERT", llm: "Llama 3.3 70B", llm2: "Qwen3 32B" }

function ovColor(o) {
  return o === "positive" ? "var(--green)" : o === "negative" ? "var(--red)" : "var(--amber)"
}
function ovBg(o) {
  return o === "positive"
    ? "rgba(45,212,160,0.1)"
    : o === "negative"
      ? "rgba(245,94,94,0.1)"
      : "rgba(245,183,49,0.1)"
}
function ovCircle(o) {
  return {
    background: ovBg(o),
    borderColor: ovColor(o) + "55",
    width: "auto",
    height: "auto",
    padding: "5px 14px",
    borderRadius: 999,
    borderWidth: 1.5,
  }
}
function ovNum(o) {
  return { color: ovColor(o), fontSize: 13, fontFamily: "var(--font-body)" }
}
function ovConsCircle(color) {
  return {
    background: "rgba(255,255,255,0.04)",
    borderColor: color + "66",
    width: "auto",
    height: "auto",
    padding: "5px 14px",
    borderRadius: 999,
    borderWidth: 1.5,
  }
}
function ovNum2(color) {
  return { color: color, fontSize: 13, fontFamily: "var(--font-body)", fontWeight: 800 }
}

const OS = {
  tabGroup: { marginBottom: 16, display: "flex", justifyContent: "stretch" },
  tab: { flex: 1, textAlign: "center", fontSize: 10, padding: "4px 0" },
  cmpTop: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    padding: "12px 0 16px 0",
    borderBottom: "1px solid var(--border-light)",
    marginBottom: 14,
  },
  rowDuo: { display: "flex", justifyContent: "center", gap: 48, width: "100%", flexWrap: "wrap" },
  hr: { height: 1, background: "var(--border-light)", width: "100%" },
  cell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  cellName: { fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textAlign: "center" },
  cellScore: { fontSize: 10, color: "var(--text-muted)", textAlign: "center" },
}

export function OvSentTabs({ value, onChange }) {
  const tabs = [
    { id: "compare", label: "Overview" },
    { id: "bert", label: "IndoBERT" },
    { id: "llm", label: "Llama 3.3 70B" },
    { id: "llm2", label: "Qwen3 32B" },
  ]
  return (
    <div className="tab-group" style={OS.tabGroup}>
      {tabs.map((t) => (
        <span
          key={t.id}
          style={OS.tab}
          className={"tab " + (value === t.id ? "active-tab" : "")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </span>
      ))}
    </div>
  )
}

export function OvSingleModel({ data, title, total }) {
  const color = ovColor(data.overall)
  const label = data.overall_label || "Netral"
  const circle = {
    background: ovBg(data.overall),
    border: "1.5px solid " + color + "55",
    color: color,
    padding: "10px 22px",
    borderRadius: 12,
    fontSize: 20,
    fontWeight: 800,
    alignSelf: "center",
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
  }
  const head = { color: "var(--text-primary)", fontSize: 15 }
  const rows = [
    { label: "Positif", pct: data.positive_pct || 0, color: "var(--green)" },
    { label: "Netral", pct: data.neutral_pct || 0, color: "var(--amber)" },
    { label: "Negatif", pct: data.negative_pct || 0, color: "var(--red)" },
  ]
  return (
    <>
      <div className="sent-top">
        <div className="sent-pill-lg" style={circle}>
          {label}
        </div>
        <div className="sent-info">
          <h4 style={head}>{(total || 0) + " artikel dianalisis"}</h4>
          <p>{title + " · Skor confidence " + data.score}</p>
        </div>
      </div>
      {rows.map((r) => (
        <div className="sbar-row" key={r.label}>
          <span className="sbar-lbl">{r.label}</span>
          <div className="sbar-track">
            <div className="sbar-fill" style={barFill(r.pct, r.color)} />
          </div>
          <span className="sbar-pct">{r.pct + "%"}</span>
        </div>
      ))}
    </>
  )
}

function OvModelCell({ name, model }) {
  return (
    <div style={OS.cell}>
      <div style={OS.cellName}>{name}</div>
      <div className="sent-circle" style={ovCircle(model.overall)}>
        <span className="sent-num" style={ovNum(model.overall)}>
          {model.overall_label || "Netral"}
        </span>
      </div>
      <div style={OS.cellScore}>{"Skor " + model.score}</div>
    </div>
  )
}

export function OvCompare({ bert, llm, llm2 }) {
  const models = { bert, llm, llm2 }
  const cons = consensus3(models)
  const consColor =
    cons.agree === 3 ? "var(--green)" : cons.agree === 2 ? "var(--amber)" : "var(--red)"
  const consTxt = cons.agree === 3 ? "Sepakat" : cons.agree === 2 ? "Mayoritas" : "Berbeda"
  const pct = (key) => ({ bert: bert[key] || 0, llm: llm[key] || 0, llm2: llm2[key] || 0 })
  return (
    <>
      <div style={OS.cmpTop}>
        <OvModelCell name={OV_MODEL_NAME.bert} model={bert} />
        <div style={OS.hr} />
        <div style={OS.rowDuo}>
          <OvModelCell name={OV_MODEL_NAME.llm} model={llm} />
          <OvModelCell name={OV_MODEL_NAME.llm2} model={llm2} />
        </div>
        <div style={OS.hr} />
        <div style={OS.cell}>
          <div style={OS.cellName}>Konsensus</div>
          <div className="sent-circle" style={ovConsCircle(consColor)}>
            <span className="sent-num" style={ovNum2(consColor)}>
              {cons.agree + "/" + cons.total}
            </span>
          </div>
          <div style={OS.cellScore}>
            <span style={consCapStyle(consColor)}>{consTxt}</span>
          </div>
        </div>
      </div>
      <CompareRow3 label="Positif" pcts={pct("positive_pct")} color="var(--green)" />
      <CompareRow3 label="Netral" pcts={pct("neutral_pct")} color="var(--amber)" />
      <CompareRow3 label="Negatif" pcts={pct("negative_pct")} color="var(--red)" />
    </>
  )
}
