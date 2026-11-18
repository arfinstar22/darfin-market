import type { ProviderHealthState, ProviderName } from "../types/provider.js";
import { logger } from "./logger.js";

export interface CircuitStateSnapshot {
  provider: ProviderName;
  state: ProviderHealthState;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorCode?: string;
  latencyMs?: number;
  openUntilMs?: number;
}

export class ProviderCircuitBreaker {
  private readonly states = new Map<ProviderName, CircuitStateSnapshot>();

  constructor(
    private readonly degradedThreshold = 2,
    private readonly openThreshold = 4,
    private readonly cooldownMs = 60_000,
  ) {}

  private ensure(provider: ProviderName): CircuitStateSnapshot {
    let snap = this.states.get(provider);
    if (!snap) {
      snap = {
        provider,
        state: "healthy",
        consecutiveFailures: 0,
      };
      this.states.set(provider, snap);
    }
    return snap;
  }

  canExecute(provider: ProviderName, nowMs: number = Date.now()): boolean {
    const snap = this.ensure(provider);
    if (snap.state !== "down") {
      return true;
    }
    if (snap.openUntilMs !== undefined && nowMs >= snap.openUntilMs) {
      // Half-open probe allowed
      return true;
    }
    return false;
  }

  recordSuccess(provider: ProviderName, latencyMs?: number, nowMs: number = Date.now()): void {
    const snap = this.ensure(provider);
    snap.consecutiveFailures = 0;
    snap.state = "healthy";
    snap.openUntilMs = undefined;
    snap.lastSuccessAt = new Date(nowMs).toISOString();
    if (latencyMs !== undefined) {
      snap.latencyMs = latencyMs;
    }
  }

  recordFailure(provider: ProviderName, errorCode: string, nowMs: number = Date.now()): void {
    const snap = this.ensure(provider);
    snap.consecutiveFailures += 1;
    snap.lastErrorAt = new Date(nowMs).toISOString();
    snap.lastErrorCode = errorCode;

    if (snap.consecutiveFailures >= this.openThreshold) {
      snap.state = "down";
      snap.openUntilMs = nowMs + this.cooldownMs;
      logger.error(
        { provider, consecutiveFailures: snap.consecutiveFailures, errorCode },
        "Provider circuit breaker OPEN (down)",
      );
    } else if (snap.consecutiveFailures >= this.degradedThreshold) {
      snap.state = "degraded";
      logger.warn(
        { provider, consecutiveFailures: snap.consecutiveFailures, errorCode },
        "Provider marked DEGRADED",
      );
    }
  }

  getSnapshot(provider: ProviderName): CircuitStateSnapshot {
    return { ...this.ensure(provider) };
  }

  getAllSnapshots(): CircuitStateSnapshot[] {
    return Array.from(this.states.values()).map((s) => ({ ...s }));
  }
}

export const circuitBreaker = new ProviderCircuitBreaker();
