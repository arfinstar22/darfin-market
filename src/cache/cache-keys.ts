export const CacheKeys = {
  indodaxPairs: () => "indodax:pairs",
  indodaxTickerAll: () => "indodax:ticker_all",
  indodaxSummaries: () => "indodax:summaries",
  indodaxTicker: (pairId: string) => `indodax:ticker:${pairId.toLowerCase()}`,

  coinpaprikaGlobal: () => "cp:global",
  coinpaprikaTickers: () => "cp:tickers",
  coinpaprikaTicker: (coinId: string) => `cp:ticker:${coinId.toLowerCase()}`,
  coinpaprikaSearch: (query: string) => `cp:search:${query.trim().toLowerCase()}`,
  coinpaprikaOhlcvLatest: (coinId: string) => `cp:ohlcv:latest:${coinId.toLowerCase()}`,

  frankfurterCurrencies: () => "fx:currencies",
  frankfurterRate: (base: string, quote: string) => `fx:rate:${base.toUpperCase()}:${quote.toUpperCase()}`,
  frankfurterRatesBase: (base: string) => `fx:rates:${base.toUpperCase()}`,

  stockQuote: (provider: string, symbol: string, exchange?: string) =>
    `stock:quote:${provider}:${symbol.toUpperCase()}:${(exchange ?? "DEFAULT").toUpperCase()}`,
  stockSearch: (provider: string, query: string) => `stock:search:${provider}:${query.trim().toLowerCase()}`,
  stockSeries: (provider: string, symbol: string, range: string) =>
    `stock:series:${provider}:${symbol.toUpperCase()}:${range}`,

  userRateLimit: (telegramUserId: string) => `ratelimit:user:${telegramUserId}`,
} as const;
