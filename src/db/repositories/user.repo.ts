import { eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import type { AppDb } from "../client.js";
import { users, type UserRow } from "../schema/index.js";

export interface TelegramProfileInput {
  telegramUserId: bigint;
  username?: string | null;
  firstName?: string | null;
  language?: string | null;
}

export class UserRepository {
  constructor(private readonly db: AppDb) {}

  async upsertTelegramUser(input: TelegramProfileInput): Promise<UserRow> {
    const now = new Date();
    const rows = await this.db
      .insert(users)
      .values({
        telegramUserId: input.telegramUserId,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        timezone: env.APP_TIMEZONE,
        language: input.language?.startsWith("en") ? "en" : "id",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.telegramUserId,
        set: {
          username: input.username ?? null,
          firstName: input.firstName ?? null,
          updatedAt: now,
        },
      })
      .returning();

    const user = rows[0];
    if (!user) {
      throw new Error("Failed to upsert user");
    }
    return user;
  }

  async findByTelegramId(telegramUserId: bigint): Promise<UserRow | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateTimezone(userId: string, timezone: string): Promise<UserRow | null> {
    const rows = await this.db
      .update(users)
      .set({ timezone, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0] ?? null;
  }

  async deleteUserData(telegramUserId: bigint): Promise<boolean> {
    const deleted = await this.db
      .delete(users)
      .where(eq(users.telegramUserId, telegramUserId))
      .returning({ id: users.id });
    return deleted.length > 0;
  }
}
