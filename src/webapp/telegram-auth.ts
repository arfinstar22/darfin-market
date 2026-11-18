import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const telegramWebAppUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

export interface VerifiedTelegramWebAppUser {
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
  authDate: number;
}

/**
 * Verifies Telegram Mini App initData signature per official Telegram WebApp documentation:
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * hash = HMAC_SHA256(secret_key, sorted_data_check_string)
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifiedTelegramWebAppUser | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return null;
  }

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHex = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computedHex, "hex");
  const b = Buffer.from(receivedHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return null;
  }
  if (nowSeconds - authDate > maxAgeSeconds || authDate - nowSeconds > 300) {
    return null;
  }

  const rawUser = params.get("user");
  if (!rawUser) return null;

  try {
    const parsedUser = telegramWebAppUserSchema.parse(JSON.parse(rawUser));
    return {
      telegramUserId: BigInt(parsedUser.id),
      username: parsedUser.username ?? null,
      firstName: parsedUser.first_name ?? null,
      languageCode: parsedUser.language_code ?? null,
      authDate,
    };
  } catch {
    return null;
  }
}
