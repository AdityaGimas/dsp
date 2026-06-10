// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const API_BASE      = "http://localhost:8000/api";
const GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL_TECH = "llama-3.1-8b-instant";    // teknikal — cepat
const GROQ_MODEL_NEWS = "llama-3.3-70b-versatile";            // berita   — model berbeda
const GROQ_MODEL_RECO = "llama-3.3-70b-versatile"; // reko akhir — paling capable

// ═══════════════════════════════════════════════════
// GROK KEY MANAGEMENT
// ═══════════════════════════════════════════════════
let grokKey = localStorage.getItem("groq_api_key") || "";

function updateGrokKeyUI() {
  const dot = document.getElementById("grokDot");
  const lbl = document.getElementById("grokKeyLabel");
  if (grokKey) {
    dot.className = "grok-key-dot connected";
    lbl.textContent = "Groq: Terhubung";
  } else {
    dot.className = "grok-key-dot";
    lbl.textContent = "Groq API Key";
  }
}

function openGrokModal() {
  document.getElementById("grokKeyInput").value = grokKey;
  document.getElementById("grokModal").classList.add("open");
}

function closeGrokModal() {
  document.getElementById("grokModal").classList.remove("open");
}

function saveGrokKey() {
  const val = document.getElementById("grokKeyInput").value.trim();
  grokKey = val;
  if (val) localStorage.setItem("groq_api_key", val);
  else localStorage.removeItem("groq_api_key");
  updateGrokKeyUI();
  closeGrokModal();
}

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let currentTicker = "BBCA.JK";
let currentPeriod = "6mo";
let mainChart     = null;
let allStocks     = [];
let lastMLPred    = null;   // prediksi ML
let lastGrokTech  = null;   // analisis Groq teknikal
let lastNews      = null;   // berita + sentimen
let lastIndicators= null;   // indikator teknikal (untuk tombol Groq)

// ─── CACHE (localStorage per ticker) ───────────────────────────
const CACHE_VER = "ss2";
function _ck(ticker){ return `ss_${ticker.replace(".","_")}`; }

function saveCache(ticker, section, data){
  try{
    const key=_ck(ticker);
    let c={};
    try{ c=JSON.parse(localStorage.getItem(key)||"{}"); }catch(e){}
    if(c._v!==CACHE_VER) c={};
    c._v=CACHE_VER;
    c[section]={d:data, ts:Date.now()};
    localStorage.setItem(key, JSON.stringify(c));
  }catch(e){ console.warn("Cache save failed",e); }
}

function loadCache(ticker){
  try{
    const raw=localStorage.getItem(_ck(ticker));
    if(!raw) return null;
    const c=JSON.parse(raw);
    return c._v===CACHE_VER ? c : null;
  }catch(e){ return null; }
}

// ─── ROBUST JSON EXTRACTOR ─────────────────────────────────────
function extractJSON(raw){
  if(!raw) throw new Error("Empty Groq response");
  // Hapus markdown fences
  let t = raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  // Coba parse langsung
  try{ return JSON.parse(t); }catch(e){}
  // Cari blok { ... } terluar
  const s=t.indexOf("{"), e=t.lastIndexOf("}");
  if(s!==-1&&e>s){ try{ return JSON.parse(t.slice(s,e+1)); }catch(e2){} }
  throw new Error("Parse JSON gagal: "+t.slice(0,120));
}

// ─── TIMESTAMP UTILITIES ─────────────────────────────────────
const _MS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function fmtAge(ts){
  if(!ts) return "";
  const diffMs=Date.now()-ts;
  const diffMin=Math.round(diffMs/60000);
  if(diffMin<2)  return "Baru saja";
  if(diffMin<60) return `${diffMin} mnt lalu`;
  const diffH=Math.floor(diffMin/60);
  const d=new Date(ts);
  const hhmm=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  if(diffH<24) return `${diffH}j lalu · ${hhmm}`;
  return `${d.getDate()} ${_MS[d.getMonth()]} · ${hhmm}`;
}

function setTs(elId, ts){
  const el=document.getElementById(elId);
  if(!el) return;
  if(!ts){ el.textContent=""; el.title=""; return; }
  el.textContent=`⏱ ${fmtAge(ts)}`;
  el.title=new Date(ts).toLocaleString("id-ID");
}

// Auto-refresh timestamps setiap 60 detik
setInterval(()=>{
  const c=loadCache(currentTicker);
  if(c?.groqTech?.ts) setTs("groqTechTime", c.groqTech.ts);
  if(c?.news?.ts)     setTs("newsTime",     c.news.ts);
}, 60000);

let watchlist = JSON.parse(localStorage.getItem("wl_stocksense") || '["BBCA.JK"]');

function saveWatchlist(){ localStorage.setItem("wl_stocksense", JSON.stringify(watchlist)); }
function isWatchlisted(t){ return watchlist.includes(t); }

function addToWatchlist(t){
  if(!watchlist.includes(t)){
    watchlist.push(t); saveWatchlist();
    renderWatchlist(allStocks.filter(s=>filterQuery(s)));
    renderMyWatchlist(); renderWatchlistChips();
  }
}

function removeFromWatchlist(t){
  watchlist = watchlist.filter(x=>x!==t); saveWatchlist();
  renderWatchlist(allStocks.filter(s=>filterQuery(s)));
  renderMyWatchlist(); renderWatchlistChips();
}

function toggleWatchlist(t,e){
  e.stopPropagation();
  isWatchlisted(t) ? removeFromWatchlist(t) : addToWatchlist(t);
}

// ═══════════════════════════════════════════════════
// CHIPS
// ═══════════════════════════════════════════════════
function renderWatchlistChips(){
  const el = document.getElementById("quickChips");
  if(watchlist.length===0){
    el.innerHTML=`<span id="chipsEmpty" style="font-size:11px;color:var(--text-muted);font-style:italic;align-self:center">Tambahkan saham ke watchlist ☆</span>`;
    return;
  }
  el.innerHTML = watchlist.map(t=>{
    const code = t.replace(".JK","");
    return `<span class="chip-wrap ${t===currentTicker?'active-chip':''}" onclick="loadStock('${t}')">
      ${code}<span class="chip-x" onclick="removeFromWatchlist('${t}');event.stopPropagation()">×</span>
    </span>`;
  }).join("");
}

// ═══════════════════════════════════════════════════
// MY WATCHLIST PANEL
// ═══════════════════════════════════════════════════
function renderMyWatchlist(){
  const el = document.getElementById("myWatchlist");
  document.getElementById("wlCount").textContent = watchlist.length;
  if(watchlist.length===0){
    el.innerHTML=`<div style="padding:10px 8px;font-size:11px;color:var(--text-muted);text-align:center;line-height:1.5">Belum ada saham.<br>Klik ☆ untuk menambahkan.</div>`;
    return;
  }
  el.innerHTML = watchlist.map(t=>{
    const s = allStocks.find(x=>x.ticker===t);
    const code = t.replace(".JK","");
    return `<div class="wl-item ${t===currentTicker?'active-stock':''}" onclick="loadStock('${t}')" id="mywl-${t.replace('.','_')}">
      <span class="wl-ticker">${code}</span>
      <span class="wl-name">${s?s.name:code}</span>
      <button class="wl-remove-btn" onclick="removeFromWatchlist('${t}');event.stopPropagation()">×</button>
    </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
async function apiFetch(path){
  const r = await fetch(`${API_BASE}${path}`);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function fmt(n,d=0){ if(n==null)return"—"; return Number(n).toLocaleString("id-ID",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtBig(n){ if(n==null)return"—"; if(n>=1e12)return"Rp "+(n/1e12).toFixed(1)+" T"; if(n>=1e9)return"Rp "+(n/1e9).toFixed(1)+" M"; if(n>=1e6)return(n/1e6).toFixed(1)+" Jt"; return fmt(n); }
function fmtVol(n){ if(n==null)return"—"; if(n>=1e9)return(n/1e9).toFixed(1)+" M"; if(n>=1e6)return(n/1e6).toFixed(1)+" J"; if(n>=1e3)return(n/1e3).toFixed(1)+" rb"; return n; }
function recColor(r){ return r==="BUY"?"var(--green)":r==="SELL"?"var(--red)":"var(--amber)"; }
function recLabel(r){ return r==="BUY"?"BELI":r==="SELL"?"JUAL":"TAHAN"; }

// ═══════════════════════════════════════════════════
// STOCK LIST
// ═══════════════════════════════════════════════════
async function loadStockList(){
  try{
    const d = await apiFetch("/stocks/list");
    allStocks = d.stocks;
    renderWatchlist(allStocks);
  }catch(e){
    allStocks = [
      {ticker:"BBCA.JK",code:"BBCA",name:"Bank Central Asia"},{ticker:"BBRI.JK",code:"BBRI",name:"Bank Rakyat Indonesia"},
      {ticker:"BMRI.JK",code:"BMRI",name:"Bank Mandiri"},{ticker:"TLKM.JK",code:"TLKM",name:"Telkom Indonesia"},
      {ticker:"ASII.JK",code:"ASII",name:"Astra International"},{ticker:"GOTO.JK",code:"GOTO",name:"GoTo Gojek Tokopedia"},
      {ticker:"BBNI.JK",code:"BBNI",name:"Bank Negara Indonesia"},{ticker:"UNVR.JK",code:"UNVR",name:"Unilever Indonesia"},
      {ticker:"KLBF.JK",code:"KLBF",name:"Kalbe Farma"},{ticker:"ANTM.JK",code:"ANTM",name:"Aneka Tambang"},
      {ticker:"PTBA.JK",code:"PTBA",name:"Bukit Asam"},{ticker:"ADRO.JK",code:"ADRO",name:"Adaro Energy"},
      {ticker:"INDF.JK",code:"INDF",name:"Indofood Sukses Makmur"},{ticker:"SMGR.JK",code:"SMGR",name:"Semen Indonesia"},
      {ticker:"PGAS.JK",code:"PGAS",name:"Perusahaan Gas Negara"},{ticker:"MEDC.JK",code:"MEDC",name:"Medco Energi"},
      {ticker:"INCO.JK",code:"INCO",name:"Vale Indonesia"},{ticker:"MDKA.JK",code:"MDKA",name:"Merdeka Copper Gold"},
      {ticker:"ICBP.JK",code:"ICBP",name:"Indofood CBP"},{ticker:"UNTR.JK",code:"UNTR",name:"United Tractors"},
    ];
    renderWatchlist(allStocks);
  }
  renderMyWatchlist(); renderWatchlistChips();
}

function filterQuery(s){ const q=document.getElementById("wlSearch").value.toLowerCase(); return s.code.toLowerCase().includes(q)||s.name.toLowerCase().includes(q); }

function renderWatchlist(stocks){
  const el = document.getElementById("wlList");
  if(!stocks.length){ el.innerHTML=`<div style="padding:12px 8px;font-size:11px;color:var(--text-muted);text-align:center">Tidak ditemukan.</div>`; return; }
  el.innerHTML = stocks.map(s=>{
    const inWl = isWatchlisted(s.ticker);
    return `<div class="wl-item ${s.ticker===currentTicker?'active-stock':''}" onclick="loadStock('${s.ticker}')" id="wl-${s.ticker.replace('.','_')}">
      <span class="wl-ticker">${s.code}</span><span class="wl-name">${s.name}</span>
      <button class="wl-star ${inWl?'starred':''}" onclick="toggleWatchlist('${s.ticker}',event)" title="${inWl?'Hapus dari watchlist':'Tambah ke watchlist'}">${inWl?'★':'☆'}</button>
    </div>`;
  }).join("");
}

document.getElementById("wlSearch").addEventListener("input",()=>renderWatchlist(allStocks.filter(s=>filterQuery(s))));

// ═══════════════════════════════════════════════════
// LOAD STOCK
// ═══════════════════════════════════════════════════
async function loadStock(ticker){
  currentTicker = ticker;
  document.getElementById("tickerInput").value = ticker;
  document.getElementById("hdrTicker").textContent = ticker.replace(".JK","");
  document.getElementById("chartTicker").textContent = ticker.replace(".JK","");

  document.querySelectorAll(".wl-item").forEach(el=>el.classList.remove("active-stock"));
  const w1=document.getElementById("wl-"+ticker.replace(".","_")); if(w1)w1.classList.add("active-stock");
  const w2=document.getElementById("mywl-"+ticker.replace(".","_")); if(w2)w2.classList.add("active-stock");
  renderWatchlistChips();

  // Reset state lokal
  lastMLPred=null; lastGrokTech=null; lastNews=null; lastIndicators=null;
  const groqBtn=document.getElementById("runGroqTechBtn");
  if(groqBtn){
    groqBtn.disabled=false; groqBtn.classList.remove("loading");
    groqBtn.innerHTML=`<span class="spin-sm" style="border-top-color:var(--purple)"></span><span class="btn-txt">▶ Analisis Groq</span>`;
  }

  // ── Coba restore dari cache ──────────────────────────────────
  const cache=loadCache(ticker);
  if(cache){
    // ML prediction
    if(cache.ml) lastMLPred=cache.ml.d;

    // Groq technical
    if(cache.groqTech){
      lastGrokTech=cache.groqTech.d;
      document.getElementById("kpiGrokTech").textContent=recLabel(lastGrokTech.recommendation);
      document.getElementById("kpiGrokTech").style.color=recColor(lastGrokTech.recommendation);
      document.getElementById("kpiGrokTechSub").textContent=`Confidence: ${Math.round((lastGrokTech.confidence||0)*100)}%`;
      setTs("groqTechTime", cache.groqTech.ts);
    }else{
      document.getElementById("kpiGrokTech").textContent="—";
      document.getElementById("kpiGrokTechSub").textContent="Klik ▶ Analisis Groq";
      setTs("groqTechTime", null);
    }

    // News + sentiment
    if(cache.news){
      lastNews=cache.news.d;
      renderSentimentPanel(lastNews);
      renderNewsItems(lastNews.articles||[]);
      const sm=lastNews.sentiment_summary||{};
      document.getElementById("kpiSent").textContent=`${sm.score||"—"}/100`;
      document.getElementById("kpiSentSub").textContent=`${sm.positive||0} pos / ${sm.neutral||0} netral / ${sm.negative||0} neg`;
      document.getElementById("kpiSent").style.color=sm.overall==="positive"?"var(--green)":sm.overall==="negative"?"var(--red)":"var(--amber)";
      setTs("newsTime", cache.news.ts);
      // Restore Groq news summary
      if(cache.groqNewsSummary){
        const el=document.getElementById("aiSummaryText");
        if(el) el.textContent=cache.groqNewsSummary.d;
      }
    }else{
      document.getElementById("sentBody").innerHTML=`<div style="text-align:center;padding:16px 0;font-size:12px;color:var(--text-muted);line-height:1.7">Klik <strong style="color:var(--green)">↻ Ambil Berita</strong> untuk scrape<br>berita terkini & analisis sentimen.</div>`;
      document.getElementById("newsBody").innerHTML=`<div style="color:var(--text-muted);font-size:12px;padding:12px 0;text-align:center">Belum ada berita. Klik "↻ Ambil Berita".</div>`;
      document.getElementById("newsCount").textContent="";
      document.getElementById("kpiSent").textContent="—";
      document.getElementById("kpiSentSub").textContent="Klik \"Ambil Berita\"";
      setTs("newsTime", null);
    }
  }else{
    // Tidak ada cache — tampilkan state kosong
    document.getElementById("kpiGrokTech").textContent="—";
    document.getElementById("kpiGrokTechSub").textContent="Klik ▶ Analisis Groq";
    document.getElementById("sentBody").innerHTML=`<div style="text-align:center;padding:16px 0;font-size:12px;color:var(--text-muted);line-height:1.7">Klik <strong style="color:var(--green)">↻ Ambil Berita</strong> untuk scrape<br>berita terkini & analisis sentimen.</div>`;
    document.getElementById("newsBody").innerHTML=`<div style="color:var(--text-muted);font-size:12px;padding:12px 0;text-align:center">Belum ada berita. Klik "↻ Ambil Berita".</div>`;
    document.getElementById("newsCount").textContent="";
    document.getElementById("kpiSent").textContent="—";
    document.getElementById("kpiSentSub").textContent="Klik \"Ambil Berita\"";
    setTs("groqTechTime", null);
    setTs("newsTime", null);
  }

  await loadStockInfo(ticker);
  await loadHistory(currentPeriod, null);
  await loadIndicators(ticker);
  await loadMLPrediction(ticker);
}

// ═══════════════════════════════════════════════════
// STOCK INFO
// ═══════════════════════════════════════════════════
async function loadStockInfo(ticker){
  try{
    const d = await apiFetch(`/stocks/${ticker}/info`);
    document.getElementById("hdrName").textContent=`${d.name} · IDX · ${d.industry||d.sector||""}`;
    document.getElementById("curPrice").textContent=fmt(d.current_price);
    document.getElementById("mktCap").textContent=fmtBig(d.market_cap);
    document.getElementById("mktVol").textContent=fmtVol(d.volume);
    document.getElementById("wkHigh").textContent=fmt(d.fifty_two_week_high);
    document.getElementById("wkLow").textContent=fmt(d.fifty_two_week_low);
    document.getElementById("peRatio").textContent=d.pe_ratio?d.pe_ratio.toFixed(1)+"x":"—";
    const pos=d.change_pct>=0;
    document.getElementById("chgVal").textContent=(pos?"+":"")+fmt(d.change);
    document.getElementById("chgVal").className="chg-val "+(pos?"chg-pos":"chg-neg");
    document.getElementById("chgPct").textContent=(pos?"+":"")+d.change_pct.toFixed(2)+"%";
    document.getElementById("chgPct").className="chg-pct "+(pos?"chg-pos-bg":"chg-neg-bg");
  }catch(e){
    const s=allStocks.find(x=>x.ticker===ticker);
    document.getElementById("hdrName").textContent=`${s?s.name:ticker} · IDX`;
    document.getElementById("curPrice").textContent="—";
    ["chgVal","chgPct","mktCap","mktVol","wkHigh","wkLow","peRatio"].forEach(id=>document.getElementById(id).textContent="—");
  }
}

// ═══════════════════════════════════════════════════
// HISTORY + CHART
// ═══════════════════════════════════════════════════
async function loadHistory(period, tabEl){
  currentPeriod = period||currentPeriod;
  if(tabEl){ document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active-tab")); tabEl.classList.add("active-tab"); }
  try{
    const d = await apiFetch(`/stocks/${currentTicker}/history?period=${currentPeriod}`);
    if(!d.data||!d.data.length) throw new Error("empty");
    renderChart(d.data);
  }catch(e){ renderChart(generateMockHistory(currentPeriod)); }
}

function generateMockHistory(period){
  let days={"1mo":30,"3mo":90,"6mo":180,"1y":365}[period]||180;
  const data=[]; let p=5000; const today=new Date();
  for(let i=days;i>=0;i--){ const d=new Date(); d.setDate(today.getDate()-i); if(d.getDay()===0||d.getDay()===6)continue; p+=(Math.random()-0.47)*120; data.push({date:d.toISOString().split('T')[0],close:Math.round(p)}); }
  return data;
}

function renderChart(histData){
  const labels=histData.map(r=>r.date);
  const closes=histData.map(r=>r.close);
  const ma20=closes.map((_,i)=>{ if(i<19)return null; return Math.round(closes.slice(i-19,i+1).reduce((a,b)=>a+b,0)/20); });
  if(mainChart)mainChart.destroy();
  const ctx=document.getElementById("mainChart").getContext("2d");
  mainChart=new Chart(ctx,{
    type:"line",
    data:{labels,datasets:[
      {label:"Historis",data:closes,borderColor:"#4f9cf9",borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0.3,fill:true,
        backgroundColor:c=>{const g=c.chart.ctx.createLinearGradient(0,0,0,200);g.addColorStop(0,"rgba(79,156,249,0.15)");g.addColorStop(1,"rgba(79,156,249,0)");return g;}},
      {label:"MA 20",data:ma20,borderColor:"#a78bfa",borderWidth:1.5,pointRadius:0,tension:0.4,fill:false}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:"#1c2028",borderColor:"rgba(255,255,255,0.08)",borderWidth:1,titleColor:"#8a8f9e",bodyColor:"#e8eaf0",padding:10,callbacks:{label:c=>` Rp ${c.parsed.y.toLocaleString("id-ID")}`}}},
      scales:{
        x:{grid:{color:"rgba(255,255,255,0.04)"},ticks:{color:"#505568",font:{size:10},maxTicksLimit:8},border:{display:false}},
        y:{grid:{color:"rgba(255,255,255,0.04)"},ticks:{color:"#505568",font:{size:10},callback:v=>v.toLocaleString("id-ID")},border:{display:false}}
      },
      interaction:{mode:"index",intersect:false}
    }
  });
}

function appendDatasetToChart(label, data, color, labels){
  if(!mainChart) return;
  const histLen = mainChart.data.labels.length;
  const lastClose = mainChart.data.datasets[0].data[histLen-1];
  const paddedData = Array(histLen).fill(null);
  paddedData[histLen-1] = lastClose;

  // extend labels
  mainChart.data.labels = [...mainChart.data.labels.slice(0,histLen), ...labels];

  const existing = mainChart.data.datasets.findIndex(d=>d.label===label);
  const ds = {label, data:[...paddedData,...data], borderColor:color, borderWidth:2, borderDash:[6,4], pointRadius:3, pointBackgroundColor:color, tension:0.3, fill:false};
  if(existing!==-1) mainChart.data.datasets[existing]=ds;
  else mainChart.data.datasets.push(ds);
  mainChart.update();
}

// ═══════════════════════════════════════════════════
// INDICATORS
// ═══════════════════════════════════════════════════
async function loadIndicators(ticker){
  document.getElementById("indGrid").innerHTML=`<div class="loading-overlay" style="grid-column:1/-1"><span class="spinner"></span> Menghitung indikator...</div>`;
  try{
    const d=await apiFetch(`/stocks/${ticker}/indicators`);
    if(!d.rsi)throw new Error("bad format");
    lastIndicators = d;
    renderIndicators(d);
    // Groq TIDAK auto-run — user klik tombol "Analisis Groq"
  }catch(e){
    const mock={rsi:{value:52.4,signal:"Netral"},macd:{value:12.5,signal:"Bullish"},moving_average:{ma20:5050,ma50:4900,golden_cross:true,signal:"Beli"},overall:{signal:"Netral",buy_count:2,total:4}};
    lastIndicators = mock;
    renderIndicators(mock);
  }
}

function indColor(s){ if(!s)return"var(--text-muted)"; const l=s.toLowerCase(); if(l.includes("beli")||l.includes("bullish")||l.includes("atas")||l.includes("oversold"))return"var(--green)"; if(l.includes("jual")||l.includes("bearish")||l.includes("overbought"))return"var(--red)"; return"var(--amber)"; }

function renderIndicators(d){
  const el=document.getElementById("indGrid");
  const rsi=d.rsi||{},macd=d.macd||{},ma=d.moving_average||{},overall=d.overall||{};
  const items=[
    {label:"RSI (14)",val:fmt(rsi.value,1),sig:rsi.signal,pct:((rsi.value||0)/100)*100},
    {label:"MACD",val:(macd.value>=0?"+":"")+fmt(macd.value,1),sig:macd.signal,pct:70},
    {label:"MA 20 / MA 50",val:ma.golden_cross?"Golden X":"Death X",sig:ma.signal,pct:ma.golden_cross?85:30,small:true},
  ];
  el.innerHTML=items.map(item=>`<div class="ind-item">
    <div class="ind-label">${item.label}</div>
    <div class="ind-val" style="color:${indColor(item.sig)};${item.small?'font-size:13px':''}">${item.val}</div>
    <div class="ind-sig" style="color:${indColor(item.sig)}">${item.sig||"—"}</div>
    <div class="ind-track"><div class="ind-fill" style="width:${item.pct}%;background:${indColor(item.sig)}"></div></div>
  </div>`).join("");
  document.getElementById("kpiSignal").textContent=overall.signal||"—";
  document.getElementById("kpiSignal").style.color=indColor(overall.signal);
  document.getElementById("kpiSignalSub").textContent=`${overall.buy_count||0}/${overall.total||4} indikator mendukung`;
}

// ═══════════════════════════════════════════════════
// ML PREDICTION (FastAPI)
// ═══════════════════════════════════════════════════
async function loadMLPrediction(ticker){
  document.getElementById("predGrid").innerHTML=`<div class="loading-overlay" style="grid-column:1/-1"><span class="spinner"></span> Memuat prediksi ML...</div>`;
  document.getElementById("recoBody").innerHTML=`<div class="loading-overlay"><span class="spinner"></span> Menghitung rekomendasi...</div>`;
  renderDualPredCards(null, null); // reset

  try{
    const d=await apiFetch(`/prediction/${ticker}`);
    lastMLPred=d;
    saveCache(ticker, "ml", d);
    updatePredKPI(d);
    if(d.predictions&&d.predictions.length>0){
      appendDatasetToChart("ML Prediksi", d.predictions.map(p=>p.price), "#4f9cf9", d.predictions.map(p=>p.date));
    }
    renderDualPredCards(d, lastGrokTech);
    renderPredGrid(d, lastGrokTech);
    tryRenderFinalReco(); // selalu render, bahkan tanpa Groq
  }catch(e){
    const mock=generateMockPrediction(ticker);
    lastMLPred=mock;
    updatePredKPI(mock);
    appendDatasetToChart("ML Prediksi", mock.predictions.map(p=>p.price), "#4f9cf9", mock.predictions.map(p=>p.date));
    renderDualPredCards(mock, lastGrokTech);
    renderPredGrid(mock, lastGrokTech);
    tryRenderFinalReco(); // selalu render
  }
}

function generateMockPrediction(ticker){
  const preds=[]; let base=5000; const today=new Date(); let cur=new Date(today); let added=0;
  while(added<6){ cur.setDate(cur.getDate()+1); if(cur.getDay()===0||cur.getDay()===6)continue; const chg=(Math.random()-0.43)*0.015; base=base*(1+chg); preds.push({date:cur.toISOString().split('T')[0],price:Math.round(base),change_pct:chg*100,confidence:0.88-added*0.05}); added++; }
  return {ticker,model_name:"Tren",model_accuracy:72.5,predictions:preds,recommendation:"BUY",confidence:0.80,stop_loss:4750,entry:4950,target:5350};
}

function updatePredKPI(d){
  document.getElementById("kpiAccuracy").textContent=d.model_accuracy?d.model_accuracy.toFixed(1)+"%":"—";
  document.getElementById("kpiAccSub").textContent=`Model: ${d.model_name||"—"}`;
  if(d.predictions&&d.predictions.length>0){
    const t=d.predictions[0];
    document.getElementById("kpiPred").textContent=fmt(t.price);
    const pos=t.change_pct>=0;
    document.getElementById("kpiPredSub").innerHTML=`<span style="color:${pos?'var(--green)':'var(--red)'}">${pos?"↑":"↓"} ${t.change_pct.toFixed(2)}%</span> besok`;
  }
}

// ═══════════════════════════════════════════════════
// GROQ TECHNICAL ANALYSIS
// ═══════════════════════════════════════════════════

// Dipanggil dari tombol — bukan auto
async function triggerGroqTechnical(){
  if(!lastIndicators){
    alert("Indikator teknikal belum dimuat. Tunggu sebentar.");
    return;
  }
  const btn=document.getElementById("runGroqTechBtn");
  function setGroqBtn(label, loading){
    if(!btn) return;
    btn.disabled=loading;
    btn.classList.toggle("loading", loading);
    // Rebuild inner HTML to avoid losing spans
    btn.innerHTML=`<span class="spin-sm" style="border-top-color:var(--purple)"></span><span class="btn-txt">${label}</span>`;
  }
  setGroqBtn("Menganalisis...", true);
  await runGroqTechnicalAnalysis(currentTicker, lastIndicators);
  setGroqBtn("▶ Analisis Groq", false);
}

async function runGroqTechnicalAnalysis(ticker, indicators){
  document.getElementById("kpiGrokTech").textContent="...";
  document.getElementById("kpiGrokTechSub").textContent="Groq sedang menganalisis...";

  if(!grokKey){
    document.getElementById("kpiGrokTech").textContent="—";
    document.getElementById("kpiGrokTechSub").textContent="Set Groq API Key dulu";
    renderDualPredCards(lastMLPred, null);
    tryRenderFinalReco();
    return;
  }

  const code = ticker.replace(".JK","");
  const curPrice = document.getElementById("curPrice").textContent;
  const prompt = `Kamu adalah analis saham teknikal profesional untuk pasar Indonesia (IDX).

Analisis teknikal saham ${code} berdasarkan data indikator berikut:
- Harga saat ini: ${curPrice}
- RSI (14): ${indicators.rsi?.value?.toFixed(1)||"?"} → ${indicators.rsi?.signal||"?"}
- MACD: ${indicators.macd?.value?.toFixed(1)||"?"} (${indicators.macd?.signal||"?"})
- MA 20 / MA 50: ${indicators.moving_average?.golden_cross?"Golden Cross (MA20 > MA50)":"Death Cross (MA20 < MA50)"}
- MA 20: ${indicators.moving_average?.ma20||"?"}, MA 50: ${indicators.moving_average?.ma50||"?"}
- Bollinger Band: ${indicators.bollinger_bands?.position||"?"} (Upper: ${indicators.bollinger_bands?.upper||"?"}, Lower: ${indicators.bollinger_bands?.lower||"?"})
- Stochastic: ${indicators.stochastic?.value?.toFixed(1)||"?"} (${indicators.stochastic?.signal||"?"})
- Volume Ratio: ${indicators.volume_ratio?.value?.toFixed(2)||"?"}x (${indicators.volume_ratio?.signal||"?"})

Berdasarkan analisis teknikal SAJA (bukan fundamental atau berita), berikan:
1. Estimasi harga besok
2. Estimasi rentang harga 5 hari ke depan (min - max)
3. Rekomendasi: BUY, SELL, atau HOLD
4. Confidence level: 0.0 - 1.0
5. 3 alasan teknikal singkat

Jawab HANYA dalam format JSON ini, tanpa teks lain, tanpa markdown:
{"price_tomorrow":10400,"price_min_5d":10200,"price_max_5d":10800,"recommendation":"BUY","confidence":0.72,"reasons":["Alasan 1","Alasan 2","Alasan 3"],"summary":"Ringkasan singkat 1-2 kalimat"}`;

  try{
    const resp = await fetch(GROQ_URL, {
      method:"POST",
      headers:{"Authorization":`Bearer ${grokKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:GROQ_MODEL_TECH,max_tokens:600,messages:[{role:"user",content:prompt}]})
    });
    if(!resp.ok){
      const errText=await resp.text().catch(()=>"");
      throw new Error(`Groq HTTP ${resp.status}: ${errText.slice(0,120)}`);
    }
    const data = await resp.json();
    const rawText = data.choices?.[0]?.message?.content||"";
    const result = extractJSON(rawText);
    lastGrokTech = result;
    saveCache(currentTicker, "groqTech", result);
    setTs("groqTechTime", Date.now());

    // Update KPI
    document.getElementById("kpiGrokTech").textContent=recLabel(result.recommendation);
    document.getElementById("kpiGrokTech").style.color=recColor(result.recommendation);
    document.getElementById("kpiGrokTechSub").textContent=`Confidence: ${Math.round((result.confidence||0)*100)}%`;

    // Update chart dengan prediksi Grok
    if(result.price_tomorrow && lastMLPred?.predictions?.length>0){
      const tomorrow=lastMLPred.predictions[0].date;
      appendDatasetToChart("Groq Prediksi",[result.price_tomorrow],"#a78bfa",[tomorrow]);
    }

    renderDualPredCards(lastMLPred, result);
    renderPredGrid(lastMLPred, result);
    tryRenderFinalReco();

  }catch(e){
    console.warn("Grok teknikal gagal:", e.message);
    document.getElementById("kpiGrokTech").textContent="Error";
    document.getElementById("kpiGrokTechSub").textContent=e.message.includes("401")?"Groq API Key salah":e.message.includes("429")?"Rate limit":"Gagal";
    lastGrokTech = null;
    renderDualPredCards(lastMLPred, null);
    tryRenderFinalReco();
  }
}

// ═══════════════════════════════════════════════════
// DUAL PREDICTION CARDS
// ═══════════════════════════════════════════════════
function renderDualPredCards(ml, grok){
  const el = document.getElementById("dualPredCards");
  const mlHtml = ml ? `
    <div class="pred-src-badge badge-ml">⚡ Model ML (FastAPI)</div>
    <div class="pred-src-price">${fmt(ml.predictions?.[0]?.price)}</div>
    <span class="pred-src-chg ${ml.predictions?.[0]?.change_pct>=0?'chg-pos-bg':'chg-neg-bg'}">${ml.predictions?.[0]?.change_pct>=0?'+':''}${ml.predictions?.[0]?.change_pct?.toFixed(2)||0}%</span>
    <div class="pred-src-meta">
      <div class="pred-src-row"><span class="pred-src-k">Akurasi Model</span><span class="pred-src-v">${ml.model_accuracy?.toFixed(1)||"—"}%</span></div>
      <div class="pred-src-row"><span class="pred-src-k">Confidence</span><span class="pred-src-v">${Math.round((ml.confidence||0)*100)}%</span></div>
      <div class="pred-src-row"><span class="pred-src-k">Rekomendasi</span><span class="pred-src-v" style="color:${recColor(ml.recommendation)}">${recLabel(ml.recommendation||"HOLD")}</span></div>
    </div>` :
    `<div class="pred-src-badge badge-ml">⚡ Model ML (FastAPI)</div><div class="loading-overlay" style="padding:10px 0"><span class="spinner"></span></div>`;

  const grokHtml = grok ? `
    <div class="pred-src-badge badge-grok">✦ Grok LLM Teknikal</div>
    <div class="pred-src-price">${fmt(grok.price_tomorrow)}</div>
    <span class="pred-src-chg" style="background:rgba(167,139,250,0.12);color:var(--purple)">
      Range: ${fmt(grok.price_min_5d||grok.price_range_5d?.min)}–${fmt(grok.price_max_5d||grok.price_range_5d?.max)}
    </span>
    <div class="pred-src-meta">
      <div class="pred-src-row"><span class="pred-src-k">Confidence</span><span class="pred-src-v">${Math.round((grok.confidence||0)*100)}%</span></div>
      <div class="pred-src-row"><span class="pred-src-k">Rekomendasi</span><span class="pred-src-v" style="color:${recColor(grok.recommendation)}">${recLabel(grok.recommendation||"HOLD")}</span></div>
      <div style="margin-top:6px;font-size:10px;color:var(--text-muted);line-height:1.5">${(grok.reasons||[]).map(r=>`• ${r}`).join('<br>')}</div>
    </div>` :
    `<div class="pred-src-badge badge-grok">✦ Grok LLM Teknikal</div>
    <div style="padding:10px 0;font-size:11px;color:var(--text-muted);text-align:center">
      ${grokKey?"Menganalisis...":"Set Groq API Key untuk mengaktifkan"}
    </div>`;

  el.innerHTML=`<div class="pred-source-card psc-ml">${mlHtml}</div><div class="pred-source-card psc-grok">${grokHtml}</div>`;

  // Tampilkan kesepakatan
  if(ml&&grok){
    const agree=ml.recommendation===grok.recommendation;
    const agreeEl=document.getElementById("predAgree");
    agreeEl.style.display="flex";
    agreeEl.className="pred-agree"+(agree?"":" disagree");
    document.getElementById("agreeDot").className="agree-dot"+(agree?"":" disagree");
    document.getElementById("agreeText").textContent=agree
      ? `Kedua sumber sepakat: ${recLabel(ml.recommendation)} — sinyal lebih kuat`
      : `Sumber berbeda pendapat: ML → ${recLabel(ml.recommendation)}, Grok → ${recLabel(grok.recommendation)} — pertimbangkan dengan hati-hati`;
  } else {
    document.getElementById("predAgree").style.display="none";
  }
}

// ═══════════════════════════════════════════════════
// PREDICTION GRID (7 hari)
// ═══════════════════════════════════════════════════
const DAY_ID=["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const MON_ID=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function renderPredGrid(ml, grok){
  const el=document.getElementById("predGrid");
  if(!ml||!ml.predictions||!ml.predictions.length){ el.innerHTML=`<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;text-align:center;padding:12px 0">Tidak ada data prediksi.</div>`; return; }
  const today=new Date();
  let html=`<div class="pred-day today-day">
    <div class="pred-date-lbl">${DAY_ID[today.getDay()]} ${today.getDate()} ${MON_ID[today.getMonth()]}</div>
    <div class="today-tag">Hari ini</div>
    <div class="pred-price" style="margin-top:4px">${document.getElementById("curPrice").textContent}</div>
    <div class="pred-chg" style="color:var(--text-muted)">—</div>
  </div>`;
  ml.predictions.slice(0,6).forEach((p,i)=>{
    const dt=new Date(p.date); const pos=p.change_pct>=0;
    // Grok hanya punya prediksi hari pertama
    const grokPrice=(i===0&&grok)?fmt(grok.price_tomorrow):"";
    html+=`<div class="pred-day">
      <div class="pred-date-lbl">${DAY_ID[dt.getDay()]} ${dt.getDate()} ${MON_ID[dt.getMonth()]}</div>
      <div style="height:12px"></div>
      <div class="pred-price">${fmt(p.price)}</div>
      <div class="pred-chg" style="color:${pos?'var(--green)':'var(--red)'}">${pos?"+":""}${p.change_pct.toFixed(2)}%</div>
      <div class="pred-conf">ML ${Math.round(p.confidence*100)}%</div>
      ${grokPrice?`<div class="pred-grok-price">G: ${grokPrice}</div>`:""}
    </div>`;
  });
  el.innerHTML=html;
}

// ═══════════════════════════════════════════════════
// FINAL RECOMMENDATION
// ═══════════════════════════════════════════════════
function tryRenderFinalReco(){
  const ml=lastMLPred; const grok=lastGrokTech; const news=lastNews;
  if(!ml){ document.getElementById("recoBody").innerHTML=`<div class="loading-overlay"><span class="spinner"></span> Menunggu prediksi ML...</div>`; return; }

  // Bobot: ML 40%, Groq Teknikal 35%, Sentimen Berita 25%
  const scores={"BUY":1,"HOLD":0,"SELL":-1};
  let totalWeight=0, weightedScore=0;

  // ML (40%)
  const mlScore=scores[ml.recommendation]||0;
  const mlConf=ml.confidence||0.5;
  weightedScore += mlScore * mlConf * 0.40; totalWeight+=0.40;

  // Groq Teknikal (35%)
  if(grok){
    const grokScore=scores[grok.recommendation]||0;
    weightedScore += grokScore * (grok.confidence||0.5) * 0.35; totalWeight+=0.35;
  }

  // Sentimen Berita (25%)
  if(news){
    const sentMap={"positive":1,"neutral":0,"negative":-1};
    const sentScore=sentMap[news.sentiment_summary?.overall]||0;
    const sentConf=(news.sentiment_summary?.score||50)/100;
    weightedScore += sentScore * sentConf * 0.25; totalWeight+=0.25;
  }

  const normalizedScore = totalWeight>0 ? weightedScore/totalWeight : 0;
  const finalRec = normalizedScore>0.15?"BUY":normalizedScore<-0.15?"SELL":"HOLD";
  const finalConf = Math.round(Math.min(Math.abs(normalizedScore)*100+50, 95));

  // Hitung entry, SL, TP dari harga saat ini dan prediksi
  const curPriceRaw = ml.entry || ml.predictions?.[0]?.price || 0;
  const stopLoss = ml.stop_loss || Math.round(curPriceRaw * (finalRec==="BUY"?0.95:1.05));
  const entry = ml.entry || curPriceRaw;
  const target = ml.target || grok?.price_max_5d || grok?.price_range_5d?.max || Math.round(curPriceRaw * (finalRec==="BUY"?1.06:0.94));

  const dotClass=finalRec==="BUY"?"buy":finalRec==="SELL"?"sell":"hold";
  const color=recColor(finalRec);
  const label=recLabel(finalRec);

  // Sumber yang berkontribusi
  const sources=[];
  sources.push(`ML (${Math.round(mlConf*100)}%)`);
  if(grok) sources.push(`Groq Teknikal (${Math.round((grok.confidence||0)*100)}%)`);
  if(news) sources.push(`Sentimen Berita (${news.sentiment_summary?.score||"—"}/100)`);

  const el=document.getElementById("recoBody");
  el.innerHTML=`
    <div class="reco-sources">
      <div class="reco-src-card">
        <div class="reco-src-label">⚡ Model ML</div>
        <div class="reco-src-action" style="color:${recColor(ml.recommendation)}">${recLabel(ml.recommendation||"HOLD")}</div>
        <div class="reco-src-conf">Conf: ${Math.round((ml.confidence||0)*100)}%</div>
      </div>
      <div class="reco-src-card">
        <div class="reco-src-label">✦ Groq Teknikal</div>
        <div class="reco-src-action" style="color:${grok?recColor(grok.recommendation):'var(--text-muted)'}">
          ${grok?recLabel(grok.recommendation):"—"}
        </div>
        <div class="reco-src-conf">${grok?`Conf: ${Math.round((grok.confidence||0)*100)}%`:"Belum dianalisis"}</div>
      </div>
      <div class="reco-src-card">
        <div class="reco-src-label">📰 Sentimen</div>
        <div class="reco-src-action" style="color:${news?recColor(news.sentiment_summary?.overall==='positive'?'BUY':news.sentiment_summary?.overall==='negative'?'SELL':'HOLD'):'var(--text-muted)'}">
          ${news?(news.sentiment_summary?.overall==='positive'?'Positif':news.sentiment_summary?.overall==='negative'?'Negatif':'Netral'):"—"}
        </div>
        <div class="reco-src-conf">${news?`Skor: ${news.sentiment_summary?.score||"—"}/100`:"Klik Ambil Berita"}</div>
      </div>
    </div>
    <div class="reco-divider"></div>
    <div class="reco-action">
      <div class="action-dot ${dotClass}"></div>
      <div class="action-label" style="color:${color}">${label}</div>
      <div class="conf-block">
        <div class="conf-lbl">Tingkat Keyakinan</div>
        <div class="conf-val" style="color:${color}">${finalConf}%</div>
      </div>
    </div>
    <div class="reco-desc">
      Rekomendasi akhir dihitung dari: <strong>${sources.join(" · ")}</strong>.
      ${lastGrokTech?.summary?`<br><em style="color:var(--purple)">"${grok.summary}"</em>`:""}
    </div>
    <div class="reco-levels">
      <div class="lvl-item"><div class="lvl-label">Stop Loss</div><div class="lvl-val" style="color:var(--red)">${fmt(stopLoss)}</div></div>
      <div class="lvl-item"><div class="lvl-label">Entry</div><div class="lvl-val" style="color:var(--blue)">${fmt(entry)}</div></div>
      <div class="lvl-item"><div class="lvl-label">Target</div><div class="lvl-val" style="color:var(--green)">${fmt(target)}</div></div>
    </div>`;
}

// ═══════════════════════════════════════════════════
// FETCH NEWS + SENTIMEN + GROK SUMMARY
// ═══════════════════════════════════════════════════
async function fetchNews(){
  const btn=document.getElementById("fetchNewsBtn");
  btn.classList.add("loading"); btn.disabled=true;
  document.getElementById("sentBody").innerHTML=`<div class="loading-overlay"><span class="spinner"></span> Scraping berita terkini...</div>`;
  document.getElementById("newsBody").innerHTML=`<div class="loading-overlay"><span class="spinner"></span> Menganalisis sentimen...</div>`;

  try{
    // Step 1: Scrape berita
    const newsData = await apiFetch(`/news/${currentTicker}?per_source=5`);
    if(!newsData.articles || newsData.articles.length === 0) throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.");

    // Step 2: Kirim ke FastAPI Sentiment
    document.getElementById("sentBody").innerHTML=`<div class="loading-overlay"><span class="spinner"></span> Model sentimen menganalisis ${newsData.articles.length} artikel...</div>`;
    const sentResp = await fetch(`${API_BASE}/sentiment/predict`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        ticker: currentTicker,
        articles: newsData.articles.map(a => ({title: a.title, content: a.content || ""}))
      })
    });
    if(!sentResp.ok) throw new Error(`Sentiment API error: ${sentResp.status}`);
    const sentData = await sentResp.json();

    // Step 3: Gabungkan sentiment ke masing-masing artikel
    const mergedArticles = newsData.articles.map((a, i) => ({
      ...a,
      sentiment:       sentData.results[i]?.sentiment || "neutral",
      sentiment_label: sentData.results[i]?.label     || "Netral",
    }));

    // Step 4: Bangun lastNews dengan format yang benar
    lastNews = {
      total_articles:   sentData.total_articles,
      articles:         mergedArticles,
      sentiment_summary: sentData.summary,
    };

    // Step 5: Render UI
    renderSentimentPanel(lastNews);
    renderNewsItems(mergedArticles);
    saveCache(currentTicker, "news", lastNews);
    setTs("newsTime", Date.now());

    // Update KPI sentimen
    const sm = sentData.summary;
    document.getElementById("kpiSent").textContent=`${sm.score||"—"}/100`;
    document.getElementById("kpiSentSub").textContent=`${sm.positive||0} pos / ${sm.neutral||0} netral / ${sm.negative||0} neg`;
    const sentColor = sm.overall==="positive"?"var(--green)":sm.overall==="negative"?"var(--red)":"var(--amber)";
    document.getElementById("kpiSent").style.color = sentColor;

    // Step 6: Grok news summary (jika key tersedia)
    if(grokKey) runGrokNewsSummary(mergedArticles, sentData.summary);
    else { const el=document.getElementById("aiSummaryText"); if(el) el.textContent="Set Groq API Key → dapatkan ringkasan AI berita."; }

    tryRenderFinalReco();
  }catch(e){
    document.getElementById("sentBody").innerHTML=`<div class="error-msg">Gagal: ${e.message}</div>`;
    document.getElementById("newsBody").innerHTML=`<div class="error-msg">Gagal memuat berita: ${e.message}</div>`;
  }finally{
    btn.classList.remove("loading"); btn.disabled=false;
  }
}

function renderSentimentPanel(d){
  const s=d.sentiment_summary||{};
  const overallColor=s.overall==="positive"?"var(--green)":s.overall==="negative"?"var(--red)":"var(--amber)";
  const overallLabel=s.overall==="positive"?"Positif":s.overall==="negative"?"Negatif":"Netral";
  document.getElementById("sentBody").innerHTML=`
    <div class="sent-top">
      <div class="sent-circle" style="background:${s.overall==="positive"?"rgba(45,212,160,0.1)":s.overall==="negative"?"rgba(245,94,94,0.1)":"rgba(245,183,49,0.1)"};border-color:${overallColor}40">
        <span class="sent-num" style="color:${overallColor}">${s.score||"—"}</span>
      </div>
      <div class="sent-info">
        <h4 style="color:${overallColor}">${overallLabel}</h4>
        <p>${d.total_articles||0} artikel dianalisis · Model sentimen finetune</p>
      </div>
    </div>
    <div class="sbar-row">
      <span class="sbar-lbl">Positif</span>
      <div class="sbar-track"><div class="sbar-fill" style="width:${s.positive_pct||0}%;background:var(--green)"></div></div>
      <span class="sbar-pct">${s.positive_pct||0}%</span>
    </div>
    <div class="sbar-row">
      <span class="sbar-lbl">Netral</span>
      <div class="sbar-track"><div class="sbar-fill" style="width:${s.neutral_pct||0}%;background:var(--amber)"></div></div>
      <span class="sbar-pct">${s.neutral_pct||0}%</span>
    </div>
    <div class="sbar-row">
      <span class="sbar-lbl">Negatif</span>
      <div class="sbar-track"><div class="sbar-fill" style="width:${s.negative_pct||0}%;background:var(--red)"></div></div>
      <span class="sbar-pct">${s.negative_pct||0}%</span>
    </div>
    <div class="ai-box">
      <div class="ai-lbl"><span>✦</span> Ringkasan Groq AI</div>
      <span id="aiSummaryText">${grokKey?"Membuat ringkasan AI...":"Set Groq API Key → dapatkan ringkasan AI."}</span>
    </div>`;
}

function renderNewsItems(articles){
  document.getElementById("newsCount").textContent=`${articles.length} artikel`;
  if(!articles.length){ document.getElementById("newsBody").innerHTML=`<div style="color:var(--text-muted);font-size:12px;padding:12px 0;text-align:center">Tidak ada berita ditemukan.</div>`; return; }
  document.getElementById("newsBody").innerHTML=articles.map(a=>{
    // Gunakan field `time` (string dari scraper) atau `published_at` jika ada
    const timeStr = a.time || (a.published_at ? (() => {
      const dt=new Date(a.published_at); const diffH=Math.round((new Date()-dt)/3600000);
      return diffH<1?"Baru saja":diffH<24?`${diffH} jam lalu`:`${Math.round(diffH/24)} hari lalu`;
    })() : "");
    const pillClass = a.sentiment==="positive"?"sp-pos":a.sentiment==="negative"?"sp-neg":"sp-neu";
    const pillLabel = a.sentiment_label || (a.sentiment==="positive"?"Positif":a.sentiment==="negative"?"Negatif":"Netral");
    return `<div class="news-item">
      <div class="news-meta"><span class="news-src">${a.source}</span><span class="news-time">· ${timeStr}</span></div>
      <div class="news-title-text">${a.url?`<a href="${a.url}" target="_blank" rel="noopener">${a.title}</a>`:a.title}</div>
      <span class="sent-pill ${pillClass}">● ${pillLabel}</span>
    </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════
// GROK NEWS SUMMARY
// ═══════════════════════════════════════════════════
async function runGrokNewsSummary(articles, sentimentSummary){
  if(!grokKey||!articles.length) return;
  const code=currentTicker.replace(".JK","");
  const titles=articles.slice(0,10).map((a,i)=>`${i+1}. [${a.sentiment_label||"Netral"}] ${a.title}`).join("\n");
  const sm = sentimentSummary || {};
  const prompt=`Kamu adalah analis pasar modal Indonesia yang berpengalaman.

Berikut ${articles.length} berita terkini tentang saham ${code}:
${titles}

Hasil analisis sentimen model AI:
- Positif: ${sm.positive_pct||0}% | Netral: ${sm.neutral_pct||0}% | Negatif: ${sm.negative_pct||0}%
- Skor agregat sentimen: ${sm.score||50}/100

Tugas kamu:
1. Sebutkan tema utama yang paling sering dibahas
2. Jelaskan kondisi sentimen pasar saat ini terhadap ${code}
3. Sebutkan 1 katalis positif dan 1 risiko utama yang perlu diperhatikan

Jawab dalam Bahasa Indonesia, langsung ke inti tanpa pembuka, maksimal 3-4 kalimat.`;

  try{
    const resp=await fetch(GROQ_URL,{
      method:"POST",
      headers:{"Authorization":`Bearer ${grokKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:GROQ_MODEL_NEWS,max_tokens:300,messages:[{role:"user",content:prompt}]})
    });
    if(!resp.ok){
      const errText=await resp.text().catch(()=>"");
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0,80)}`);
    }
    const data=await resp.json();
    const summary=(data.choices?.[0]?.message?.content||"").trim()||"Groq tidak memberikan ringkasan.";
    const el=document.getElementById("aiSummaryText");
    if(el) el.textContent=summary;
    saveCache(currentTicker, "groqNewsSummary", summary);
  }catch(e){
    const el=document.getElementById("aiSummaryText");
    if(el) el.textContent=`Gagal ringkasan Groq: ${e.message}`;
  }
}

// ═══════════════════════════════════════════════════
// TICKER INPUT
// ═══════════════════════════════════════════════════
document.getElementById("tickerInput").addEventListener("keydown",e=>{
  if(e.key==="Enter"){ let v=e.target.value.trim().toUpperCase(); if(!v.endsWith(".JK"))v+=".JK"; loadStock(v); }
});

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
(async()=>{
  updateGrokKeyUI();
  await loadStockList();
  await loadStock(watchlist.length>0?watchlist[0]:"BBCA.JK");
})();