export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly userMessage: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage, "VALIDATION_ERROR", userMessage);
    this.name = "ValidationError";
  }
}

export class ProviderError extends AppError {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
    userMessage = "Provider sedang tidak dapat dihubungi. Coba kembali beberapa saat lagi.",
  ) {
    super(`[${provider}] ${message}`, `PROVIDER_${statusCode ?? "ERROR"}`, userMessage);
    this.name = "ProviderError";
  }
}

export class QuotaExceededError extends ProviderError {
  constructor(provider: string, period: "daily" | "monthly") {
    super(
      provider,
      `Quota ${period} reached for ${provider}`,
      429,
      false,
      "Batas permintaan sementara tercapai. Data tersimpan masih dapat ditampilkan dengan label waktu pembaruan.",
    );
    this.name = "QuotaExceededError";
  }
}
