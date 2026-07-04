// Centralized API client. Base URL comes from VITE_API_BASE (.env).
// Default "/api" works both for the Vite dev proxy and for the single-host
// production setup where FastAPI serves the built frontend.
const API_BASE = import.meta.env.VITE_API_BASE || "/api"

async function getJSON(path) {
  const r = await fetch(`${API_BASE}${path}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function postJSON(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => "")
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`)
  }
  return r.json()
}

export const api = {
  getStockList: () => getJSON("/stocks/list"),
  getStockInfo: (t, refresh = false) => getJSON(`/stocks/${t}/info` + (refresh ? "?refresh=true" : "")),
  getHistory: (t, period, refresh = false) => getJSON(`/stocks/${t}/history?period=${period}` + (refresh ? "&refresh=true" : "")),
  getIndicators: (t, refresh = false) => getJSON(`/stocks/${t}/indicators` + (refresh ? "?refresh=true" : "")),
  getStockForeignFlow: (t) => getJSON(`/stocks/${t}/foreign-flow`),
  getPrediction: (t) => getJSON(`/prediction/${t}`),
  getNews: (t, perSource = 50) => getJSON(`/news/${t}?per_source=${perSource}`),
  predictSentiment: (ticker, articles) =>
    postJSON("/sentiment/predict", { ticker, articles }),
  getMacro: (refresh = false) => getJSON("/macro" + (refresh ? "?refresh=true" : "")),
  // Groq calls now go through the FastAPI backend proxy (/api/grok/*),
  // so the API key is never exposed in the browser network tab to third parties.
  groqTechnical: (payload) => postJSON("/grok/technical", payload),
  groqNewsSummary: (payload) => postJSON("/grok/news-summary", payload),
  groqFinalReco: (payload) => postJSON("/grok/final-recommendation", payload),
  groqMacro: (payload) => postJSON("/grok/macro", payload),
  chat: (payload) => postJSON("/chat", payload),
}

export { API_BASE }
