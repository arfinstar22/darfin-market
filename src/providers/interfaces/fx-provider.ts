import type { CurrencyInfo, FxRate } from "../../types/market.js";
import type { ProviderName, ProviderStatus } from "../../types/provider.js";

export interface FxProvider {
  readonly name: ProviderName;
  getRate(base: string, quote: string): Promise<FxRate | null>;
  getRates(base: string, quotes?: string[]): Promise<FxRate[]>;
  getCurrencies(): Promise<CurrencyInfo[]>;
  hasCurrency(code: string): Promise<boolean>;
  getProviderStatus(): ProviderStatus;
}
