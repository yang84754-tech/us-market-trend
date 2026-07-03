from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from threading import Lock, Thread
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
import json
import os
import re
import socket
import time


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = int(os.environ.get("PORT", "4177"))
HOST = os.environ.get("HOST", "0.0.0.0")
CACHE_MS = int(os.environ.get("CACHE_MS", "60000"))

GROUPS = {
    "indices": [
        ["^DJI", "道琼斯"],
        ["^IXIC", "纳斯达克"],
        ["^GSPC", "标普500"],
        ["^NDX", "纳斯达克100"],
        ["^VIX", "恐慌指数"],
    ],
    "futures": [
        ["ES=F", "标普500期货"],
        ["NQ=F", "纳斯达克100期货"],
        ["YM=F", "道琼斯期货"],
        ["RTY=F", "罗素2000期货"],
    ],
    "themes": [
        ["cpo", "CPO / 光模块"],
        ["memory", "存储芯片 / HBM"],
        ["ai-chips", "AI 算力芯片"],
        ["semicap", "半导体设备"],
        ["ai-server", "AI 服务器 / 电源液冷"],
        ["cybersecurity", "网络安全"],
        ["quantum", "量子计算"],
        ["uranium", "核电 / 铀"],
        ["robotics", "机器人 / 自动化"],
        ["crypto", "加密资产链"],
    ],
    "themeMembers": {
        "cpo": [
            ["COHR", "Coherent"],
            ["LITE", "Lumentum"],
            ["AAOI", "Applied Optoelectronics"],
            ["FN", "Fabrinet"],
            ["CIEN", "Ciena"],
            ["MRVL", "Marvell Technology"],
            ["AVGO", "Broadcom"],
            ["ANET", "Arista Networks"],
            ["CRDO", "Credo Technology"],
        ],
        "memory": [
            ["MU", "Micron Technology"],
            ["SNDK", "Sandisk"],
            ["WDC", "Western Digital"],
            ["STX", "Seagate Technology"],
            ["SIMO", "Silicon Motion"],
            ["MRVL", "Marvell Technology"],
        ],
        "ai-chips": [
            ["NVDA", "NVIDIA"],
            ["AMD", "AMD"],
            ["AVGO", "Broadcom"],
            ["MRVL", "Marvell Technology"],
            ["ARM", "Arm Holdings"],
            ["INTC", "Intel"],
            ["TSM", "Taiwan Semiconductor"],
        ],
        "semicap": [
            ["ASML", "ASML"],
            ["AMAT", "Applied Materials"],
            ["LRCX", "Lam Research"],
            ["KLAC", "KLA"],
            ["TER", "Teradyne"],
            ["ACMR", "ACM Research"],
        ],
        "ai-server": [
            ["SMCI", "Super Micro Computer"],
            ["DELL", "Dell Technologies"],
            ["HPE", "Hewlett Packard Enterprise"],
            ["VRT", "Vertiv"],
            ["ETN", "Eaton"],
            ["PSTG", "Pure Storage"],
        ],
        "cybersecurity": [
            ["CRWD", "CrowdStrike"],
            ["PANW", "Palo Alto Networks"],
            ["ZS", "Zscaler"],
            ["FTNT", "Fortinet"],
            ["NET", "Cloudflare"],
            ["S", "SentinelOne"],
        ],
        "quantum": [
            ["IONQ", "IonQ"],
            ["RGTI", "Rigetti Computing"],
            ["QBTS", "D-Wave Quantum"],
            ["QUBT", "Quantum Computing"],
            ["IBM", "IBM"],
            ["GOOGL", "Alphabet"],
        ],
        "uranium": [
            ["CCJ", "Cameco"],
            ["UEC", "Uranium Energy"],
            ["UUUU", "Energy Fuels"],
            ["NXE", "NexGen Energy"],
            ["BWXT", "BWX Technologies"],
            ["SMR", "NuScale Power"],
        ],
        "robotics": [
            ["ISRG", "Intuitive Surgical"],
            ["TER", "Teradyne"],
            ["SYM", "Symbotic"],
            ["ROK", "Rockwell Automation"],
            ["ABBNY", "ABB"],
            ["ZBRA", "Zebra Technologies"],
        ],
        "crypto": [
            ["COIN", "Coinbase"],
            ["MSTR", "Strategy"],
            ["MARA", "MARA Holdings"],
            ["RIOT", "Riot Platforms"],
            ["CLSK", "CleanSpark"],
            ["HOOD", "Robinhood"],
        ],
    },
}

CACHE = {"time": 0, "payload": None, "refreshing": False}
CACHE_LOCK = Lock()

CNBC_SYMBOLS = {
    "ES=F": "US@SP.1",
    "NQ=F": "US@ND.1",
    "YM=F": "US@DJ.1",
    "RTY=F": "RTY.1",
}
CNBC_REVERSE = {value: key for key, value in CNBC_SYMBOLS.items()}

TRADINGVIEW_INDICES = {
    "^DJI": "DJ:DJI",
    "^IXIC": "NASDAQ:IXIC",
    "^GSPC": "SP:SPX",
    "^NDX": "NASDAQ:NDX",
    "^VIX": "TVC:VIX",
}
NASDAQ_INDICES = {"^IXIC": "COMP", "^NDX": "NDX"}
YAHOO_INDICES = {
    "^DJI": "^DJI",
    "^IXIC": "^IXIC",
    "^GSPC": "^GSPC",
    "^NDX": "^NDX",
    "^VIX": "^VIX",
}

INDEX_PRICE_RANGES = {
    "^DJI": (10000, 100000),
    "^IXIC": (10000, 100000),
    "^GSPC": (1000, 20000),
    "^NDX": (10000, 100000),
    "^VIX": (5, 150),
}
STOCK_PRICE_RANGE = (0.5, 5000)
FUTURE_PRICE_RANGE = (0.5, 100000)
MAX_REASONABLE_CHANGE_PERCENT = 60
MIN_THEME_QUOTES = 3


def theme_symbols():
    symbols = []
    for members in GROUPS["themeMembers"].values():
        symbols.extend(symbol for symbol, _ in members)
    return list(dict.fromkeys(symbols))


def future_symbols():
    return [symbol for symbol, _ in GROUPS["futures"]]


def nth_weekday(year, month, weekday, nth):
    day = datetime(year, month, 1)
    days_until = (weekday - day.weekday()) % 7
    return day + timedelta(days=days_until + (nth - 1) * 7)


def eastern_now():
    utc_now = datetime.now(timezone.utc)
    year = utc_now.year
    dst_start_local = nth_weekday(year, 3, 6, 2).replace(hour=2)
    dst_end_local = nth_weekday(year, 11, 6, 1).replace(hour=2)
    dst_start_utc = (dst_start_local + timedelta(hours=5)).replace(tzinfo=timezone.utc)
    dst_end_utc = (dst_end_local + timedelta(hours=4)).replace(tzinfo=timezone.utc)
    offset_hours = -4 if dst_start_utc <= utc_now < dst_end_utc else -5
    return utc_now.astimezone(timezone(timedelta(hours=offset_hours)))


def current_us_market_state():
    now = eastern_now()
    minutes = now.hour * 60 + now.minute
    if now.weekday() >= 5:
        return "CLOSED"
    if 4 * 60 <= minutes < 9 * 60 + 30:
        return "PRE"
    if 9 * 60 + 30 <= minutes < 16 * 60:
        return "REGULAR"
    if 16 * 60 <= minutes < 20 * 60:
        return "POST"
    return "CLOSED"


def as_float(value):
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("%", "")
    if not text or text.lower() in ("n/a", "na", "nan", "--"):
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def first_number(item, names):
    for name in names:
        if isinstance(item, dict) and name in item:
            value = as_float(item.get(name))
            if value is not None:
                return value
    return None


def valid_index_price(symbol, price):
    if price is None:
        return False
    low, high = INDEX_PRICE_RANGES.get(symbol, (0, float("inf")))
    return low <= price <= high


def valid_quote_percent(item):
    for field in ("regularChangePercent", "preMarketChangePercent", "postMarketChangePercent"):
        value = item.get(field)
        if isinstance(value, (int, float)) and abs(value) > MAX_REASONABLE_CHANGE_PERCENT:
            return False
    return True


def valid_stock_quote(item):
    price = item.get("price")
    return isinstance(price, (int, float)) and STOCK_PRICE_RANGE[0] <= price <= STOCK_PRICE_RANGE[1] and valid_quote_percent(item)


def valid_future_quote(item):
    price = item.get("price")
    return isinstance(price, (int, float)) and FUTURE_PRICE_RANGE[0] <= price <= FUTURE_PRICE_RANGE[1] and valid_quote_percent(item)


def theme_quality():
    return [
        {
            "symbol": theme_symbol,
            "name": theme_name,
            "members": [symbol for symbol, _ in GROUPS["themeMembers"].get(theme_symbol, [])],
        }
        for theme_symbol, theme_name in GROUPS["themes"]
    ]


def coverage_warnings(quotes):
    warnings = []
    for theme in theme_quality():
        valid_count = sum(1 for symbol in theme["members"] if symbol in quotes and valid_stock_quote(quotes[symbol]))
        if 0 < valid_count < MIN_THEME_QUOTES:
            warnings.append(f"{theme['name']} 有效成分股只有 {valid_count} 只，板块涨幅仅作参考。")
    return warnings


def normalized_quote(symbol, name, price, change=None, percent=None, market_state=None, exchange="", source=""):
    return {
        "symbol": symbol,
        "name": name or symbol,
        "price": price,
        "regularChange": change,
        "regularChangePercent": percent,
        "preMarketPrice": None,
        "preMarketChangePercent": None,
        "postMarketPrice": None,
        "postMarketChangePercent": None,
        "marketState": market_state or current_us_market_state(),
        "previousClose": None,
        "exchange": exchange,
        "source": source,
        "time": int(time.time() * 1000),
    }


def request_json(url, headers=None, data=None, timeout=12):
    request = Request(
        url,
        data=data,
        headers=headers or {"user-agent": "Mozilla/5.0 MarketDashboard/1.0"},
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def fetch_yahoo_indices():
    results = []
    for symbol, yahoo_symbol in YAHOO_INDICES.items():
        encoded = quote(yahoo_symbol, safe="")
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?interval=1d&range=5d"
        payload = request_json(url, timeout=8)
        chart = (payload.get("chart") or {}).get("result") or []
        if not chart:
            continue
        meta = chart[0].get("meta") or {}
        price = as_float(meta.get("regularMarketPrice"))
        previous = as_float(meta.get("chartPreviousClose") or meta.get("previousClose"))
        change = price - previous if price is not None and previous else None
        percent = (change / previous * 100) if change is not None and previous else None
        if valid_index_price(symbol, price):
            item = normalized_quote(symbol, dict(GROUPS["indices"]).get(symbol), price, change, percent, exchange="INDEX", source="Yahoo 指数")
            item["previousClose"] = previous
            results.append(item)
    return results


def fetch_tradingview_indices():
    tv_to_symbol = {value: key for key, value in TRADINGVIEW_INDICES.items()}
    body = json.dumps(
        {
            "symbols": {"tickers": list(TRADINGVIEW_INDICES.values()), "query": {"types": []}},
            "columns": ["close", "change", "change_abs"],
        }
    ).encode("utf-8")
    payload = request_json(
        "https://scanner.tradingview.com/america/scan",
        data=body,
        headers={
            "content-type": "application/json",
            "origin": "https://www.tradingview.com",
            "referer": "https://www.tradingview.com/",
            "user-agent": "Mozilla/5.0 MarketDashboard/1.0",
        },
        timeout=12,
    )
    results = []
    for row in payload.get("data") or []:
        symbol = tv_to_symbol.get(row.get("s"))
        data = row.get("d") or []
        price = as_float(data[0] if len(data) > 0 else None)
        percent = as_float(data[1] if len(data) > 1 else None)
        change = as_float(data[2] if len(data) > 2 else None)
        if symbol and valid_index_price(symbol, price):
            results.append(normalized_quote(symbol, dict(GROUPS["indices"]).get(symbol), price, change, percent, exchange="INDEX", source="TradingView 指数"))
    return results


def fetch_nasdaq_indices():
    results = []
    for symbol, nasdaq_symbol in NASDAQ_INDICES.items():
        encoded = quote(nasdaq_symbol, safe="")
        url = f"https://api.nasdaq.com/api/quote/{encoded}/info?assetclass=index"
        payload = request_json(
            url,
            headers={
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "origin": "https://www.nasdaq.com",
                "referer": "https://www.nasdaq.com/",
                "user-agent": "Mozilla/5.0 MarketDashboard/1.0",
            },
            timeout=8,
        )
        data = payload.get("data") or {}
        primary = data.get("primaryData") or {}
        price = first_number(primary, ["lastSalePrice", "lastPrice"])
        if valid_index_price(symbol, price):
            item = normalized_quote(
                symbol,
                dict(GROUPS["indices"]).get(symbol),
                price,
                first_number(primary, ["netChange"]),
                first_number(primary, ["percentageChange"]),
                exchange="INDEX",
                source="Nasdaq 指数",
            )
            item["previousClose"] = first_number((data.get("keyStats") or {}).get("previousclose") or {}, ["value"])
            results.append(item)
    return results


def fetch_index_quotes():
    quotes = {}
    errors = []
    for fetcher in (fetch_yahoo_indices, fetch_tradingview_indices, fetch_nasdaq_indices):
        try:
            for item in fetcher():
                symbol = item.get("symbol")
                if symbol in YAHOO_INDICES and symbol not in quotes and valid_index_price(symbol, item.get("price")):
                    quotes[symbol] = item
        except Exception as exc:
            errors.append(f"{fetcher.__name__}: {exc}")
    return list(quotes.values()), errors


def yahoo_quote_to_normalized(item):
    symbol = item.get("symbol")
    return {
        "symbol": symbol,
        "name": item.get("shortName") or item.get("longName") or symbol,
        "price": first_number(item, ["regularMarketPrice", "postMarketPrice", "preMarketPrice"]),
        "regularChange": first_number(item, ["regularMarketChange"]),
        "regularChangePercent": first_number(item, ["regularMarketChangePercent"]),
        "preMarketPrice": first_number(item, ["preMarketPrice"]),
        "preMarketChangePercent": first_number(item, ["preMarketChangePercent"]),
        "postMarketPrice": first_number(item, ["postMarketPrice"]),
        "postMarketChangePercent": first_number(item, ["postMarketChangePercent"]),
        "marketState": item.get("marketState") or current_us_market_state(),
        "previousClose": first_number(item, ["regularMarketPreviousClose", "regularMarketOpen"]),
        "exchange": item.get("fullExchangeName") or item.get("exchange") or "",
        "source": "Yahoo 个股/期货",
        "time": (item.get("regularMarketTime") or 0) * 1000 if item.get("regularMarketTime") else int(time.time() * 1000),
    }


def fetch_yahoo_quote_batch(symbols):
    results = []
    for index in range(0, len(symbols), 35):
        chunk = symbols[index:index + 35]
        encoded = quote(",".join(chunk), safe=",")
        url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={encoded}"
        payload = request_json(
            url,
            headers={"accept": "application/json", "user-agent": "Mozilla/5.0 MarketDashboard/1.0"},
            timeout=12,
        )
        for item in payload.get("quoteResponse", {}).get("result") or []:
            normalized = yahoo_quote_to_normalized(item)
            if normalized.get("symbol") and normalized.get("price") is not None:
                results.append(normalized)
    return results


def cnbc_item_symbol(item):
    raw = item.get("symbol") or item.get("issue_id") or item.get("shortName")
    if not raw:
        return None
    return CNBC_REVERSE.get(raw, raw)


def cnbc_quote_to_normalized(item):
    symbol = cnbc_item_symbol(item)
    state = current_us_market_state()
    extended = item.get("ExtendedMktQuote") or item.get("extendedMktQuote") or {}
    extended_price = first_number(extended, ["last", "price", "extendedMktPrice"])
    extended_percent = first_number(extended, ["change_pct", "changePercent", "extendedMktChangePercent"])
    price = extended_price or first_number(item, ["last", "last_price", "Last", "price"])
    return {
        "symbol": symbol,
        "name": item.get("name") or item.get("shortName") or symbol,
        "price": price,
        "regularChange": first_number(item, ["change", "netChange"]),
        "regularChangePercent": first_number(item, ["change_pct", "changePercent", "pctChange", "change_percent"]),
        "preMarketPrice": extended_price if state == "PRE" else None,
        "preMarketChangePercent": extended_percent if state == "PRE" else None,
        "postMarketPrice": extended_price if state == "POST" else None,
        "postMarketChangePercent": extended_percent if state == "POST" else None,
        "marketState": state,
        "previousClose": first_number(item, ["previous_day_closing", "prevClose", "previousClose"]),
        "exchange": item.get("exchange") or "",
        "source": "CNBC 个股/期货",
        "time": int(time.time() * 1000),
    }


def fetch_cnbc_quotes(symbols):
    results = []
    cnbc_symbols = [CNBC_SYMBOLS.get(symbol, symbol) for symbol in symbols]
    for index in range(0, len(cnbc_symbols), 45):
        chunk = cnbc_symbols[index:index + 45]
        encoded = quote("|".join(chunk), safe="|.@")
        url = (
            "https://quote.cnbc.com/quote-html-webservice/quote.htm"
            f"?symbols={encoded}&requestMethod=quick&noform=1&partnerId=2&fund=1&exthrs=1&output=json"
        )
        request = Request(
            url,
            headers={"accept": "application/json,text/plain,*/*", "user-agent": "Mozilla/5.0 MarketDashboard/1.0"},
        )
        with urlopen(request, timeout=12) as response:
            text = response.read().decode("utf-8", errors="ignore").strip()
        if text.startswith("(") and text.endswith(")"):
            text = text[1:-1]
        payload = json.loads(text)
        formatted = (payload.get("FormattedQuoteResult") or {}).get("FormattedQuote") or []
        if isinstance(formatted, dict):
            formatted = [formatted]
        for item in formatted:
            normalized = cnbc_quote_to_normalized(item)
            if normalized.get("symbol") and normalized.get("price") is not None:
                results.append(normalized)
    return results


def fetch_nasdaq_one(symbol):
    data = {}
    primary = {}
    after_hours = {}
    pre_market = {}
    price = None
    encoded = quote(symbol, safe="")
    for asset_class in ("stocks", "etf"):
        url = f"https://api.nasdaq.com/api/quote/{encoded}/info?assetclass={asset_class}"
        try:
            payload = request_json(
                url,
                headers={
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "en-US,en;q=0.9",
                    "origin": "https://www.nasdaq.com",
                    "referer": "https://www.nasdaq.com/",
                    "user-agent": "Mozilla/5.0 MarketDashboard/1.0",
                },
                timeout=8,
            )
        except Exception:
            continue
        data = payload.get("data") or {}
        primary = data.get("primaryData") or {}
        after_hours = data.get("afterHours") or {}
        pre_market = data.get("preMarket") or {}
        price = first_number(primary, ["lastSalePrice", "lastPrice"])
        if price is not None:
            break
    if price is None:
        return None
    state = current_us_market_state()
    pre_price = first_number(pre_market, ["lastSalePrice", "lastPrice"])
    post_price = first_number(after_hours, ["lastSalePrice", "lastPrice"])
    live_price = pre_price if state == "PRE" and pre_price is not None else post_price if state == "POST" and post_price is not None else price
    return {
        "symbol": symbol,
        "name": (data.get("companyName") or symbol).replace(" Common Stock", ""),
        "price": live_price,
        "regularChange": first_number(primary, ["netChange"]),
        "regularChangePercent": first_number(primary, ["percentageChange", "netChangePercent"]),
        "preMarketPrice": pre_price,
        "preMarketChangePercent": first_number(pre_market, ["percentageChange", "netChangePercent"]),
        "postMarketPrice": post_price,
        "postMarketChangePercent": first_number(after_hours, ["percentageChange", "netChangePercent"]),
        "marketState": state,
        "previousClose": None,
        "exchange": data.get("exchange") or "NASDAQ",
        "source": "Nasdaq 个股",
        "time": int(time.time() * 1000),
    }


def fetch_nasdaq_quotes(symbols):
    results = []
    candidates = [symbol for symbol in symbols if symbol.replace(".", "").isalpha()]
    with ThreadPoolExecutor(max_workers=5) as executor:
        tasks = {executor.submit(fetch_nasdaq_one, symbol): symbol for symbol in candidates}
        for task in as_completed(tasks):
            try:
                quote_data = task.result()
                if quote_data:
                    results.append(quote_data)
            except Exception:
                pass
    return results


def merge_quotes(quotes, results, allowed_symbols, validator):
    added = 0
    allowed = set(allowed_symbols)
    for item in results:
        symbol = item.get("symbol")
        if symbol in allowed and symbol not in quotes and validator(item):
            quotes[symbol] = item
            added += 1
    return added


def build_validation(quotes):
    index_symbols = [symbol for symbol, _ in GROUPS["indices"]]
    futures = future_symbols()
    themes = []
    for theme in theme_quality():
        valid_members = [symbol for symbol in theme["members"] if symbol in quotes and valid_stock_quote(quotes[symbol])]
        themes.append(
            {
                "symbol": theme["symbol"],
                "name": theme["name"],
                "validCount": len(valid_members),
                "totalCount": len(theme["members"]),
                "validMembers": valid_members,
            }
        )
    return {
        "indicesMissing": [symbol for symbol in index_symbols if symbol not in quotes],
        "futuresMissing": [symbol for symbol in futures if symbol not in quotes],
        "themes": themes,
    }


def build_payload(source, quotes, warning=None, detail=None):
    payload = {
        "source": source,
        "generatedAt": int(time.time() * 1000),
        "marketState": current_us_market_state(),
        "groups": GROUPS,
        "quotes": quotes,
        "validation": build_validation(quotes),
    }
    if warning:
        payload["warning"] = warning
    if detail:
        payload["detail"] = detail
    return payload


def fetch_quotes():
    stocks = theme_symbols()
    futures = future_symbols()
    stock_and_futures = list(dict.fromkeys(stocks + futures))
    index_symbols = [symbol for symbol, _ in GROUPS["indices"]]
    quotes = {}
    errors = []
    sources_used = []

    index_results, index_errors = fetch_index_quotes()
    errors.extend(f"指数源: {error}" for error in index_errors)
    if merge_quotes(quotes, index_results, index_symbols, lambda item: valid_index_price(item.get("symbol"), item.get("price"))):
        sources_used.append("真实指数")

    source_plan = [
        ("Nasdaq 个股", fetch_nasdaq_quotes, stocks),
        ("Yahoo 个股/期货", fetch_yahoo_quote_batch, stock_and_futures),
        ("CNBC 个股/期货", fetch_cnbc_quotes, stock_and_futures),
    ]
    for source_name, fetcher, symbols in source_plan:
        try:
            results = fetcher(symbols)
            added_stocks = merge_quotes(quotes, results, stocks, valid_stock_quote)
            added_futures = merge_quotes(quotes, results, futures, valid_future_quote)
            if added_stocks or added_futures:
                sources_used.append(source_name)
        except Exception as exc:
            errors.append(f"{source_name}: {exc}")

    warnings = coverage_warnings(quotes)
    if not any(symbol in quotes for symbol in index_symbols):
        warnings.insert(0, "真实指数点位暂时没有返回。")
    if not any(symbol in quotes for symbol in stocks):
        warnings.append("个股行情暂时没有返回，主题板块会留空。")

    source = " + ".join(sources_used) if sources_used else "免费行情源暂时限流"
    return build_payload(
        source,
        quotes,
        warning="；".join(warnings[:5]) if warnings else None,
        detail="；".join(errors[-4:]) if errors else None,
    )


def refresh_cache():
    try:
        payload = fetch_quotes()
        with CACHE_LOCK:
            CACHE["time"] = int(time.time() * 1000)
            CACHE["payload"] = payload
    finally:
        with CACHE_LOCK:
            CACHE["refreshing"] = False


def market_snapshot():
    now = int(time.time() * 1000)
    with CACHE_LOCK:
        payload = CACHE["payload"]
        is_fresh = payload and now - CACHE["time"] < CACHE_MS
        if is_fresh:
            return payload
        if payload and not CACHE["refreshing"]:
            CACHE["refreshing"] = True
            Thread(target=refresh_cache, daemon=True).start()
            return payload
        if payload:
            return payload

    payload = fetch_quotes()
    with CACHE_LOCK:
        CACHE["time"] = int(time.time() * 1000)
        CACHE["payload"] = payload
        CACHE["refreshing"] = False
    return payload


class Handler(SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if path.endswith(".html"):
            return "text/html; charset=utf-8"
        if path.endswith(".css"):
            return "text/css; charset=utf-8"
        if path.endswith(".js"):
            return "text/javascript; charset=utf-8"
        return super().guess_type(path)

    def end_headers(self):
        self.send_header("cache-control", "no-store, max-age=0")
        super().end_headers()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/api/market":
            try:
                self.send_json(200, market_snapshot())
            except Exception as exc:
                self.send_json(
                    200,
                    build_payload("免费行情源暂时限流", {}, warning="行情读取暂时不稳定，请稍后刷新。", detail=str(exc)),
                )
            return
        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    local_ip = socket.gethostbyname(socket.gethostname())
    print(f"美股主题雷达已启动：http://localhost:{PORT}")
    print(f"同一局域网手机可尝试：http://{local_ip}:{PORT}")
    server.serve_forever()
