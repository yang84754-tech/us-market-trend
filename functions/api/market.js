const GROUPS = {
  indices: [
    ["^DJI", "道琼斯"],
    ["^IXIC", "纳斯达克"],
    ["^GSPC", "标普500"],
    ["^NDX", "纳斯达克100"],
    ["^VIX", "恐慌指数"]
  ],
  futures: [
    ["ES=F", "标普500期货"],
    ["NQ=F", "纳斯达克100期货"],
    ["YM=F", "道琼斯期货"],
    ["RTY=F", "罗素2000期货"]
  ],
  themes: [
    ["cpo", "CPO / 光模块"],
    ["memory", "存储芯片 / HBM"],
    ["ai-chips", "AI 算力芯片"],
    ["semicap", "半导体设备"],
    ["ai-server", "AI 服务器 / 电源液冷"],
    ["cybersecurity", "网络安全"],
    ["quantum", "量子计算"],
    ["uranium", "核电 / 铀"],
    ["robotics", "机器人 / 自动化"],
    ["crypto", "加密资产链"]
  ],
  themeMembers: {
    cpo: [["COHR", "Coherent"], ["LITE", "Lumentum"], ["AAOI", "Applied Optoelectronics"], ["FN", "Fabrinet"], ["CIEN", "Ciena"], ["MRVL", "Marvell Technology"], ["AVGO", "Broadcom"], ["ANET", "Arista Networks"], ["CRDO", "Credo Technology"]],
    memory: [["MU", "Micron Technology"], ["SNDK", "Sandisk"], ["WDC", "Western Digital"], ["STX", "Seagate Technology"], ["SIMO", "Silicon Motion"], ["MRVL", "Marvell Technology"]],
    "ai-chips": [["NVDA", "NVIDIA"], ["AMD", "AMD"], ["AVGO", "Broadcom"], ["MRVL", "Marvell Technology"], ["ARM", "Arm Holdings"], ["INTC", "Intel"], ["TSM", "Taiwan Semiconductor"]],
    semicap: [["ASML", "ASML"], ["AMAT", "Applied Materials"], ["LRCX", "Lam Research"], ["KLAC", "KLA"], ["TER", "Teradyne"], ["ACMR", "ACM Research"]],
    "ai-server": [["SMCI", "Super Micro Computer"], ["DELL", "Dell Technologies"], ["HPE", "Hewlett Packard Enterprise"], ["VRT", "Vertiv"], ["ETN", "Eaton"], ["PSTG", "Pure Storage"]],
    cybersecurity: [["CRWD", "CrowdStrike"], ["PANW", "Palo Alto Networks"], ["ZS", "Zscaler"], ["FTNT", "Fortinet"], ["NET", "Cloudflare"], ["S", "SentinelOne"]],
    quantum: [["IONQ", "IonQ"], ["RGTI", "Rigetti Computing"], ["QBTS", "D-Wave Quantum"], ["QUBT", "Quantum Computing"], ["IBM", "IBM"], ["GOOGL", "Alphabet"]],
    uranium: [["CCJ", "Cameco"], ["UEC", "Uranium Energy"], ["UUUU", "Energy Fuels"], ["NXE", "NexGen Energy"], ["BWXT", "BWX Technologies"], ["SMR", "NuScale Power"]],
    robotics: [["ISRG", "Intuitive Surgical"], ["TER", "Teradyne"], ["SYM", "Symbotic"], ["ROK", "Rockwell Automation"], ["ABBNY", "ABB"], ["ZBRA", "Zebra Technologies"]],
    crypto: [["COIN", "Coinbase"], ["MSTR", "Strategy"], ["MARA", "MARA Holdings"], ["RIOT", "Riot Platforms"], ["CLSK", "CleanSpark"], ["HOOD", "Robinhood"]]
  }
};

const YAHOO_INDICES = {
  "^DJI": "%5EDJI",
  "^IXIC": "%5EIXIC",
  "^GSPC": "%5EGSPC",
  "^NDX": "%5ENDX",
  "^VIX": "%5EVIX"
};

const YAHOO_FUTURES = {
  "ES=F": "ES%3DF",
  "NQ=F": "NQ%3DF",
  "YM=F": "YM%3DF",
  "RTY=F": "RTY%3DF"
};

const NASDAQ_INDEX = {
  "^IXIC": "COMP",
  "^NDX": "NDX"
};

const INDEX_RANGES = {
  "^DJI": [10000, 100000],
  "^IXIC": [10000, 100000],
  "^GSPC": [1000, 20000],
  "^NDX": [10000, 100000],
  "^VIX": [5, 150]
};

const STOCK_RANGE = [0.5, 5000];
const FUTURE_RANGE = [0.5, 100000];
const MAX_PERCENT = 60;

function themeSymbols() {
  return [...new Set(Object.values(GROUPS.themeMembers).flat().map(([symbol]) => symbol))];
}

function priorityThemeSymbols(limitPerTheme = 3) {
  const selected = [];
  const seen = new Set();
  for (const [theme] of GROUPS.themes) {
    let count = 0;
    for (const [symbol] of GROUPS.themeMembers[theme] || []) {
      if (!seen.has(symbol)) {
        selected.push(symbol);
        seen.add(symbol);
        count += 1;
      }
      if (count >= limitPerTheme) break;
    }
  }
  return selected;
}

function futureSymbols() {
  return GROUPS.futures.map(([symbol]) => symbol);
}

function asFloat(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const match = String(value).replace(/,/g, "").replace(/%/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function validRange(value, [low, high]) {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
}

function validIndex(symbol, q) {
  return q && validRange(q.price, INDEX_RANGES[symbol] || [0, Infinity]);
}

function validPercent(q) {
  return ["regularChangePercent", "preMarketChangePercent", "postMarketChangePercent"].every((field) => {
    const value = q[field];
    return value == null || (typeof value === "number" && Math.abs(value) <= MAX_PERCENT);
  });
}

function validStock(q) {
  return q && validRange(q.price, STOCK_RANGE) && validPercent(q);
}

function validFuture(q) {
  return q && validRange(q.price, FUTURE_RANGE) && validPercent(q);
}

function easternMarketState(date = new Date()) {
  const eastern = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = eastern.getDay();
  const minutes = eastern.getHours() * 60 + eastern.getMinutes();
  if (day === 0 || day === 6) return "CLOSED";
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "PRE";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "REGULAR";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "POST";
  return "CLOSED";
}

function quoteTemplate(symbol, name, price, change, percent, source) {
  return {
    symbol,
    name: name || symbol,
    price,
    regularChange: change ?? null,
    regularChangePercent: percent ?? null,
    preMarketPrice: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChangePercent: null,
    marketState: easternMarketState(),
    previousClose: null,
    exchange: "",
    source,
    time: Date.now()
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "accept": "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 MarketDashboard/1.0",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchYahooIndices() {
  const results = [];
  for (const [symbol, encoded] of Object.entries(YAHOO_INDICES)) {
    const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`);
    const item = data?.chart?.result?.[0];
    const meta = item?.meta || {};
    const price = asFloat(meta.regularMarketPrice);
    const previous = asFloat(meta.chartPreviousClose || meta.previousClose);
    const change = price != null && previous ? price - previous : null;
    const percent = change != null && previous ? (change / previous) * 100 : null;
    const quote = quoteTemplate(symbol, Object.fromEntries(GROUPS.indices)[symbol], price, change, percent, "Yahoo 指数");
    quote.previousClose = previous;
    if (validIndex(symbol, quote)) results.push(quote);
  }
  return results;
}

async function fetchYahooFutures() {
  const results = [];
  for (const [symbol, encoded] of Object.entries(YAHOO_FUTURES)) {
    const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`);
    const item = data?.chart?.result?.[0];
    const meta = item?.meta || {};
    const price = asFloat(meta.regularMarketPrice);
    const previous = asFloat(meta.chartPreviousClose || meta.previousClose);
    const change = price != null && previous ? price - previous : null;
    const percent = change != null && previous ? (change / previous) * 100 : null;
    const quote = quoteTemplate(symbol, Object.fromEntries(GROUPS.futures)[symbol], price, change, percent, "Yahoo 期货");
    quote.previousClose = previous;
    if (validFuture(quote)) results.push(quote);
  }
  return results;
}

async function fetchNasdaqIndices() {
  const results = [];
  for (const [symbol, nasdaqSymbol] of Object.entries(NASDAQ_INDEX)) {
    const data = await fetchJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(nasdaqSymbol)}/info?assetclass=index`, {
      headers: {
        "origin": "https://www.nasdaq.com",
        "referer": "https://www.nasdaq.com/"
      }
    });
    const primary = data?.data?.primaryData || {};
    const price = asFloat(primary.lastSalePrice || primary.lastPrice);
    const change = asFloat(primary.netChange);
    const percent = asFloat(primary.percentageChange);
    const quote = quoteTemplate(symbol, Object.fromEntries(GROUPS.indices)[symbol], price, change, percent, "Nasdaq 指数");
    if (validIndex(symbol, quote)) results.push(quote);
  }
  return results;
}

async function fetchNasdaqQuote(symbol) {
  for (const assetclass of ["stocks"]) {
    try {
      const data = await fetchJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetclass}`, {
        headers: {
          "origin": "https://www.nasdaq.com",
          "referer": "https://www.nasdaq.com/"
        }
      });
      const info = data?.data || {};
      const primary = info.primaryData || {};
      const pre = info.preMarket || {};
      const post = info.afterHours || {};
      const price = asFloat(primary.lastSalePrice || primary.lastPrice);
      if (price == null) continue;
      const state = easternMarketState();
      const prePrice = asFloat(pre.lastSalePrice || pre.lastPrice);
      const postPrice = asFloat(post.lastSalePrice || post.lastPrice);
      const livePrice = state === "PRE" && prePrice != null ? prePrice : state === "POST" && postPrice != null ? postPrice : price;
      return {
        symbol,
        name: String(info.companyName || symbol).replace(" Common Stock", ""),
        price: livePrice,
        regularChange: asFloat(primary.netChange),
        regularChangePercent: asFloat(primary.percentageChange || primary.netChangePercent),
        preMarketPrice: prePrice,
        preMarketChangePercent: asFloat(pre.percentageChange || pre.netChangePercent),
        postMarketPrice: postPrice,
        postMarketChangePercent: asFloat(post.percentageChange || post.netChangePercent),
        marketState: state,
        previousClose: null,
        exchange: info.exchange || "",
        source: "Nasdaq 个股",
        time: Date.now()
      };
    } catch (_) {
      // Try the next asset class.
    }
  }
  return null;
}

async function fetchNasdaqQuotes(symbols) {
  const results = [];
  const queue = [...symbols];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const symbol = queue.shift();
      const quote = await fetchNasdaqQuote(symbol);
      if (quote) results.push(quote);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchYahooQuotes(symbols) {
  const encoded = symbols.map(encodeURIComponent).join(",");
  const data = await fetchJson(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encoded}`);
  return (data?.quoteResponse?.result || []).map((item) => {
    const state = item.marketState || easternMarketState();
    return {
      symbol: item.symbol,
      name: item.shortName || item.longName || item.symbol,
      price: asFloat(item.regularMarketPrice ?? item.postMarketPrice ?? item.preMarketPrice),
      regularChange: asFloat(item.regularMarketChange),
      regularChangePercent: asFloat(item.regularMarketChangePercent),
      preMarketPrice: asFloat(item.preMarketPrice),
      preMarketChangePercent: asFloat(item.preMarketChangePercent),
      postMarketPrice: asFloat(item.postMarketPrice),
      postMarketChangePercent: asFloat(item.postMarketChangePercent),
      marketState: state,
      previousClose: asFloat(item.regularMarketPreviousClose),
      exchange: item.fullExchangeName || item.exchange || "",
      source: "Yahoo 行情",
      time: item.regularMarketTime ? item.regularMarketTime * 1000 : Date.now()
    };
  });
}

function merge(quotes, results, allowed, validator) {
  const allowedSet = new Set(allowed);
  let count = 0;
  for (const q of results) {
    if (allowedSet.has(q.symbol) && !quotes[q.symbol] && validator(q)) {
      quotes[q.symbol] = q;
      count += 1;
    }
  }
  return count;
}

function validation(quotes) {
  const stockSet = new Set(themeSymbols());
  return {
    indicesMissing: GROUPS.indices.map(([symbol]) => symbol).filter((symbol) => !quotes[symbol]),
    futuresMissing: futureSymbols().filter((symbol) => !quotes[symbol]),
    themes: GROUPS.themes.map(([symbol, name]) => {
      const members = GROUPS.themeMembers[symbol].map(([member]) => member);
      const validMembers = members.filter((member) => stockSet.has(member) && quotes[member] && validStock(quotes[member]));
      return { symbol, name, validCount: validMembers.length, totalCount: members.length, validMembers };
    })
  };
}

async function buildPayload() {
  const quotes = {};
  const errors = [];
  const sources = [];
  const allStocks = themeSymbols();
  const stocks = priorityThemeSymbols(3);
  const futures = futureSymbols();
  const indexSymbols = GROUPS.indices.map(([symbol]) => symbol);

  for (const fetcher of [fetchYahooIndices, fetchNasdaqIndices]) {
    try {
      const items = await fetcher();
      if (merge(quotes, items, indexSymbols, (q) => validIndex(q.symbol, q))) sources.push("真实指数");
    } catch (error) {
      errors.push(`${fetcher.name}: ${error.message}`);
    }
  }

  try {
    const items = await fetchNasdaqQuotes(stocks);
    if (merge(quotes, items, stocks, validStock)) sources.push("Nasdaq 核心成分股");
  } catch (error) {
    errors.push(`fetchNasdaqQuotes: ${error.message}`);
  }

  try {
    const items = await fetchYahooFutures();
    if (merge(quotes, items, futures, validFuture)) sources.push("Yahoo 期货");
  } catch (error) {
    errors.push(`fetchYahooFutures: ${error.message}`);
  }

  const warnings = [];
  if (!indexSymbols.some((symbol) => quotes[symbol])) warnings.push("真实指数点位暂时没有返回。");
  if (!stocks.some((symbol) => quotes[symbol])) warnings.push("核心成分股暂时没有返回，主题板块会留空。");
  if (!futures.some((symbol) => quotes[symbol])) warnings.push("股指期货暂时没有返回。");

  return {
    source: [...new Set(sources)].join(" + ") || "免费行情源暂时限流",
    generatedAt: Date.now(),
    marketState: easternMarketState(),
    groups: GROUPS,
    quotes,
    validation: validation(quotes),
    coverage: {
      requestedCoreStocks: stocks.length,
      allThemeStocks: allStocks.length
    },
    ...(warnings.length ? { warning: warnings.join("；") } : {}),
    ...(errors.length ? { detail: errors.slice(-4).join("；") } : {})
  };
}

export async function onRequestGet() {
  try {
    const payload = await buildPayload();
    return Response.json(payload, {
      headers: {
        "cache-control": "no-store, max-age=0",
        "access-control-allow-origin": "*"
      }
    });
  } catch (error) {
    return Response.json(
      {
        source: "免费行情源暂时限流",
        generatedAt: Date.now(),
        marketState: easternMarketState(),
        groups: GROUPS,
        quotes: {},
        validation: validation({}),
        warning: "行情读取暂时不稳定，请稍后刷新。",
        detail: error.message
      },
      { headers: { "cache-control": "no-store, max-age=0" } }
    );
  }
}
