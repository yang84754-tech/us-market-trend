const state = {
  data: null,
  selectedSector: localStorage.getItem("selectedSector") || "cpo",
  metric: localStorage.getItem("metric") || "combined",
  filter: localStorage.getItem("filter") || "all",
  timer: null
};

const THEME_ICONS = {
  cpo: "CPO",
  memory: "MEM",
  "ai-chips": "AI",
  semicap: "EQ",
  "ai-server": "SVR",
  cybersecurity: "SEC",
  quantum: "Q",
  uranium: "U",
  robotics: "ROB",
  crypto: "BTC"
};

const INDEX_ICONS = {
  "^GSPC": "S500",
  "^IXIC": "NAS",
  "^NDX": "N100",
  "^DJI": "DJ",
  "^VIX": "VIX"
};

const INDEX_PRICE_RANGES = {
  "^DJI": [10000, 100000],
  "^IXIC": [10000, 100000],
  "^GSPC": [1000, 20000],
  "^NDX": [10000, 100000],
  "^VIX": [5, 150]
};

const STOCK_PRICE_RANGE = [0.5, 5000];
const MAX_REASONABLE_CHANGE_PERCENT = 60;

const el = {
  indexCards: document.querySelector("#indexCards"),
  themeStrip: document.querySelector("#themeStrip"),
  sectorTable: document.querySelector("#sectorTable"),
  futuresList: document.querySelector("#futuresList"),
  memberList: document.querySelector("#memberList"),
  sectorSelect: document.querySelector("#sectorSelect"),
  sectorTitle: document.querySelector("#sectorTitle"),
  sectorBadge: document.querySelector("#sectorBadge"),
  sectorScore: document.querySelector("#sectorScore"),
  sectorBar: document.querySelector("#sectorBar"),
  marketState: document.querySelector("#marketState"),
  updatedAt: document.querySelector("#updatedAt"),
  sourceLabel: document.querySelector("#sourceLabel"),
  errorBanner: document.querySelector("#errorBanner"),
  refreshBtn: document.querySelector("#refreshBtn"),
  autoRefresh: document.querySelector("#autoRefresh"),
  catMascot: document.querySelector(".cat-mascot"),
  metricControls: document.querySelector("#metricControls"),
  filterControls: document.querySelector("#filterControls"),
  scoreLabel: document.querySelector("#scoreLabel")
};

function number(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "--";
}

function pct(value) {
  return `${number(value)}%`;
}

function cls(value) {
  if (typeof value !== "number" || Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "pos" : "neg";
}

function signed(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${pct(value)}`;
}

function marketStateLabel(code) {
  const labels = {
    PRE: "盘前",
    REGULAR: "交易中",
    POST: "盘后",
    CLOSED: "休市",
    PREPRE: "盘前",
    POSTPOST: "盘后",
    UNKNOWN: "未知"
  };
  return labels[code] || code || "未知";
}

function quote(symbol) {
  return state.data?.quotes?.[symbol] || null;
}

function sanePercent(value) {
  return value == null || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_REASONABLE_CHANGE_PERCENT);
}

function validStockQuote(q) {
  return Boolean(
    q &&
    typeof q.price === "number" &&
    q.price >= STOCK_PRICE_RANGE[0] &&
    q.price <= STOCK_PRICE_RANGE[1] &&
    sanePercent(q.regularChangePercent) &&
    sanePercent(q.preMarketChangePercent) &&
    sanePercent(q.postMarketChangePercent)
  );
}

function validIndexQuote(symbol, q) {
  if (!q || typeof q.price !== "number" || !Number.isFinite(q.price)) return false;
  const range = INDEX_PRICE_RANGES[symbol];
  return !range || (q.price >= range[0] && q.price <= range[1]);
}

function extendedPercent(q) {
  if (!q) return null;
  if (q.marketState === "PRE" || q.marketState === "PREPRE") return q.preMarketChangePercent;
  if (q.marketState === "POST" || q.marketState === "POSTPOST") return q.postMarketChangePercent;
  return null;
}

function combinedPercent(q) {
  if (!q) return null;
  const regular = q.regularChangePercent;
  const ext = extendedPercent(q);
  if (q.marketState === "PRE" || q.marketState === "PREPRE") return ext ?? regular;
  if (q.marketState === "POST" || q.marketState === "POSTPOST") {
    if (typeof regular === "number" && typeof ext === "number") {
      return ((1 + regular / 100) * (1 + ext / 100) - 1) * 100;
    }
    return ext ?? regular;
  }
  return regular;
}

function avg(values) {
  const filtered = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function aggregateTheme(symbol) {
  const members = state.data?.groups?.themeMembers?.[symbol] || [];
  const quotes = members.map(([member]) => quote(member)).filter(validStockQuote);
  const combined = quotes.map(combinedPercent);
  const validCombined = combined.filter((value) => typeof value === "number" && Number.isFinite(value));

  return {
    symbol,
    regularChangePercent: avg(quotes.map((q) => q.regularChangePercent)),
    extendedChangePercent: avg(quotes.map(extendedPercent)),
    combinedChangePercent: avg(combined),
    upCount: validCombined.filter((value) => value > 0).length,
    validCount: validCombined.length,
    totalCount: members.length,
    marketState: state.data?.marketState || quotes.find((q) => q.marketState && q.marketState !== "UNKNOWN")?.marketState || "UNKNOWN"
  };
}

function metricValue(theme) {
  if (state.metric === "regular") return theme.regularChangePercent;
  if (state.metric === "extended") return theme.extendedChangePercent;
  if (state.metric === "breadth") return theme.validCount ? (theme.upCount / theme.validCount) * 100 : null;
  return theme.combinedChangePercent;
}

function metricLabel() {
  const labels = {
    combined: "综合趋势",
    regular: "常规涨幅",
    extended: "盘外表现",
    breadth: "上涨热度"
  };
  return labels[state.metric] || "综合趋势";
}

function metricText(theme) {
  const value = metricValue(theme);
  if (state.metric === "breadth") return value == null ? "--" : `${number(value, 0)}%`;
  return signed(value);
}

function passesFilter(theme) {
  const combined = theme.combinedChangePercent;
  if (state.filter === "up") return typeof combined === "number" && combined > 0;
  if (state.filter === "down") return typeof combined === "number" && combined < 0;
  return true;
}

function strengthWidth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  const capped = Math.max(-3, Math.min(3, value));
  return 50 + (capped / 3) * 50;
}

function barStyle(value) {
  const color = typeof value === "number" && value < 0 ? "var(--green)" : "var(--red)";
  return `width:${strengthWidth(value)}%;background:${color}`;
}

function restartAnimation(node, className) {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function triggerSectorEffect() {
  restartAnimation(el.catMascot, "cat-hop");
  restartAnimation(el.themeStrip, "strip-pop");
  restartAnimation(el.sectorScore.closest(".sector-score"), "score-pop");
  restartAnimation(el.memberList, "list-pop");
}

function playCatSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const audio = new AudioContext();
  const now = audio.currentTime;
  const gain = audio.createGain();
  const main = audio.createOscillator();
  const cute = audio.createOscillator();
  main.type = "sawtooth";
  cute.type = "triangle";
  main.frequency.setValueAtTime(860, now);
  main.frequency.exponentialRampToValueAtTime(520, now + 0.18);
  cute.frequency.setValueAtTime(1280, now);
  cute.frequency.exponentialRampToValueAtTime(760, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  main.connect(gain);
  cute.connect(gain);
  gain.connect(audio.destination);
  main.start(now);
  cute.start(now + 0.015);
  main.stop(now + 0.24);
  cute.stop(now + 0.21);
  setTimeout(() => audio.close(), 360);
}

function renderOptions() {
  const sectors = state.data?.groups?.themes || [];
  el.sectorSelect.innerHTML = sectors
    .map(([symbol, name]) => `<option value="${symbol}">${THEME_ICONS[symbol] || "CAT"} ${name}</option>`)
    .join("");
  if (!sectors.some(([symbol]) => symbol === state.selectedSector)) {
    state.selectedSector = sectors[0]?.[0] || "cpo";
  }
  el.sectorSelect.value = state.selectedSector;
}

function renderStatus(payload) {
  const sample = Object.values(payload.quotes || {})[0];
  el.marketState.textContent = marketStateLabel(payload.marketState || sample?.marketState);
  el.updatedAt.textContent = `更新：${new Date(payload.generatedAt).toLocaleString("zh-CN", { hour12: false })}`;
  el.sourceLabel.textContent = "";
  el.errorBanner.hidden = !payload.warning;
  el.errorBanner.textContent = payload.warning || "";
}

function renderIndices() {
  const indices = state.data.groups.indices || [];
  el.indexCards.innerHTML = indices.map(([symbol, name]) => {
    const raw = quote(symbol);
    const q = validIndexQuote(symbol, raw) ? raw : null;
    const change = combinedPercent(q) ?? q?.regularChangePercent;
    return `
      <article class="index-card">
        <div class="index-top">
          <span class="index-icon">${INDEX_ICONS[symbol] || "IDX"}</span>
          <div class="name">${name}</div>
        </div>
        <div class="price">${number(q?.price)}</div>
        <div class="change ${cls(change)}">${signed(change)}</div>
      </article>
    `;
  }).join("");
}

function renderSectorTable() {
  const sectors = [...(state.data.groups.themes || [])].map(([symbol, name]) => {
    const q = aggregateTheme(symbol);
    return { symbol, name, q, combined: q.combinedChangePercent, metric: metricValue(q) };
  }).filter(({ q }) => passesFilter(q)).sort((a, b) => (b.metric ?? -99) - (a.metric ?? -99));

  el.sectorTable.innerHTML = sectors.map(({ symbol, name, q, combined, metric }) => {
    const ext = q.extendedChangePercent;
    return `
      <tr class="${symbol === state.selectedSector ? "active" : ""}" data-sector="${symbol}">
        <td data-label="主题">
          <div class="theme-name"><span class="theme-icon">${THEME_ICONS[symbol] || "CAT"}</span><strong>${name}</strong></div>
          <div class="ticker">${q.validCount || 0}/${q.totalCount || 0} 只有效成分股</div>
        </td>
        <td data-label="常规" class="${cls(q.regularChangePercent)}">${signed(q.regularChangePercent)}</td>
        <td data-label="盘前/盘后" class="${cls(ext)}">${signed(ext)}</td>
        <td data-label="合成" class="${cls(combined)}"><strong>${signed(combined)}</strong></td>
        <td data-label="上涨数">${q.upCount || 0}/${q.validCount || 0}</td>
        <td data-label="强弱">
          <div class="strength">
            <span class="mini-bar"><i style="${barStyle(state.metric === "breadth" ? (metric - 50) / 16 : metric)}"></i></span>
            <span class="${cls(state.metric === "breadth" ? metric - 50 : metric)}">${metricText(q)}</span>
          </div>
        </td>
      </tr>
    `;
  }).join("") || `<tr class="empty-row"><td data-label="结果">当前筛选没有匹配主题</td></tr>`;

  el.sectorTable.querySelectorAll("tr").forEach((row) => {
    if (row.dataset.sector) row.addEventListener("click", () => selectSector(row.dataset.sector, true));
  });
}

function renderThemeStrip() {
  const themes = [...(state.data.groups.themes || [])].map(([symbol, name]) => {
    const q = aggregateTheme(symbol);
    return { symbol, name, q, combined: q.combinedChangePercent };
  }).sort((a, b) => (b.combined ?? -99) - (a.combined ?? -99));

  el.themeStrip.innerHTML = themes.map(({ symbol, name, q, combined }, index) => `
    <button class="theme-chip sticker-${index % 12} ${symbol === state.selectedSector ? "active" : ""}" type="button" data-sector="${symbol}">
      <span class="theme-chip-icon">${THEME_ICONS[symbol] || "CAT"}</span>
      <span class="theme-chip-name">${name}</span>
      <strong class="${cls(combined)}">${signed(combined)}</strong>
      <small>${q.validCount || 0}/${q.totalCount || 0} 有效</small>
      <span class="cat-sticker" aria-hidden="true"></span>
    </button>
  `).join("");

  el.themeStrip.querySelectorAll("button[data-sector]").forEach((button) => {
    button.addEventListener("click", () => selectSector(button.dataset.sector, true));
  });
}

function renderSelectedSector() {
  const sectors = state.data.groups.themes || [];
  const selected = sectors.find(([symbol]) => symbol === state.selectedSector) || sectors[0];
  if (!selected) return;

  const [symbol, name] = selected;
  const q = aggregateTheme(symbol);
  const combined = metricValue(q);
  el.sectorTitle.textContent = `${THEME_ICONS[symbol] || "CAT"} ${name}`;
  el.sectorBadge.textContent = `${q.validCount || 0}/${q.totalCount || 0} 有效`;
  el.scoreLabel.textContent = metricLabel();
  el.sectorScore.textContent = state.metric === "breadth" ? metricText(q) : signed(combined);
  el.sectorScore.className = cls(state.metric === "breadth" ? combined - 50 : combined);
  el.sectorBar.style.cssText = barStyle(state.metric === "breadth" ? (combined - 50) / 16 : combined);

  const members = state.data.groups.themeMembers?.[symbol] || [];
  el.memberList.innerHTML = members.map(([member, memberName]) => {
    const mq = validStockQuote(quote(member)) ? quote(member) : null;
    const memberCombined = combinedPercent(mq);
    return `
      <div class="row">
        <div>
          <span class="name">${memberName}</span>
          <strong>${member}</strong>
        </div>
        <div class="meta">
          <div>${number(mq?.price)}</div>
          <strong class="${cls(memberCombined)}">${signed(memberCombined)}</strong>
        </div>
      </div>
    `;
  }).join("");
}

function renderFutures() {
  const futures = state.data.groups.futures || [];
  el.futuresList.innerHTML = futures.map(([symbol, name]) => {
    const q = quote(symbol);
    const change = combinedPercent(q) ?? q?.regularChangePercent;
    return `
      <div class="row">
        <div>
          <span class="name">${name}</span>
          <strong>${symbol}</strong>
        </div>
        <div class="meta">
          <div>${number(q?.price)}</div>
          <strong class="${cls(change)}">${signed(change)}</strong>
        </div>
      </div>
    `;
  }).join("");
}

function renderLoading() {
  el.indexCards.innerHTML = ["道琼斯", "纳斯达克", "标普500", "恐慌指数"].map((name) => `
    <article class="index-card loading-card">
      <div class="name">${name}</div>
      <div class="price">读取中</div>
      <div class="change flat">请稍等...</div>
    </article>
  `).join("");
  el.sectorTable.innerHTML = `<tr class="empty-row"><td data-label="状态">正在读取实时行情，第一次打开可能需要十几秒</td></tr>`;
  el.memberList.innerHTML = `<div class="row"><div><span class="name">正在准备主题成分股</span><strong>读取中</strong></div><div class="meta">--</div></div>`;
  el.futuresList.innerHTML = `<div class="row"><div><span class="name">正在读取股指期货</span><strong>读取中</strong></div><div class="meta">--</div></div>`;
}

function renderControlState() {
  el.metricControls.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.metric === state.metric);
  });
  el.filterControls.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });
}

function render() {
  if (!state.data) return;
  renderOptions();
  renderStatus(state.data);
  renderIndices();
  renderThemeStrip();
  renderControlState();
  renderSectorTable();
  renderSelectedSector();
  renderFutures();
}

function selectSector(symbol, withEffect = false) {
  state.selectedSector = symbol;
  localStorage.setItem("selectedSector", symbol);
  el.sectorSelect.value = symbol;
  renderSectorTable();
  renderThemeStrip();
  renderSelectedSector();
  if (withEffect) {
    triggerSectorEffect();
    playCatSound();
  }
}

async function loadMarket() {
  el.refreshBtn.disabled = true;
  if (!state.data) renderLoading();
  try {
    const response = await fetch("/api/market", { cache: "no-store" });
    const payload = await response.json();
    state.data = payload;
    render();
  } catch (error) {
    el.errorBanner.hidden = false;
    el.errorBanner.textContent = `行情暂时没读到：${error.message}。请稍后刷新。`;
    el.marketState.textContent = "离线";
    el.updatedAt.textContent = "未取得实时行情";
  } finally {
    el.refreshBtn.disabled = false;
  }
}

function startAutoRefresh() {
  clearInterval(state.timer);
  if (el.autoRefresh.checked) {
    state.timer = setInterval(loadMarket, 15000);
  }
}

el.refreshBtn.addEventListener("click", loadMarket);
el.autoRefresh.addEventListener("change", startAutoRefresh);
el.sectorSelect.addEventListener("change", (event) => selectSector(event.target.value, true));
el.metricControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-metric]");
  if (!button) return;
  state.metric = button.dataset.metric;
  localStorage.setItem("metric", state.metric);
  render();
});
el.filterControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  localStorage.setItem("filter", state.filter);
  render();
});

loadMarket();
startAutoRefresh();
