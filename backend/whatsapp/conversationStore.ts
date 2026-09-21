import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { whatsappSessions, whatsappMessages } from "@shared/schema";
import { findProfileByWhatsApp } from "./profileLookup";
import { redis } from "./redisClient";
import { storage } from "../storage";
import type { Conversation, ConversationMessage, ConversationMode, LLMMetadata } from "./types";

async function checkHasAvailability(profileId: string): Promise<boolean> {
  try {
    const slots = await storage.getAllMentorAvailabilityByProfileId(profileId);
    return slots.length > 0;
  } catch (err) {
    console.error("[ConversationStore] hasAvailability lookup failed:", err);
    return false;
  }
}

const SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 hours

const metaKey = (phone: string) => `wa:${phone}:meta`;
const msgsKey = (phone: string) => `wa:${phone}:msgs`;

export interface ConversationStore {
  ensureConversation(phoneNumber: string, mode: ConversationMode): Promise<Conversation>;
  addTurn(
    phoneNumber: string,
    userMsg: ConversationMessage,
    assistantMsg: ConversationMessage,
    meta: LLMMetadata,
  ): Promise<void>;
  linkProfile(
    phoneNumber: string,
    profileId: string,
    hasAvailability?: boolean,
  ): Promise<void>;
  setHasAvailability(phoneNumber: string, value: boolean): Promise<void>;
  clearConversation(phoneNumber: string): Promise<void>;
}

/**
 * Async, fire-and-forget archive to Postgres. The hot path never awaits
 * these — they run in the background. If Postgres is slow or down, the bot
 * keeps responding; we just log and move on.
 */
const archive = {
  async createSession(c: Conversation) {
    await db.insert(whatsappSessions).values({
      id: c.id,
      phoneNumber: c.phoneNumber,
      profileId: c.profileId,
      isNewCreator: c.isNewCreator,
      status: c.status,
      sourceChannel: c.sourceChannel,
      turnsCount: 0,
      lastActivityAt: new Date(c.lastActivityAt),
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    });
  },

  async appendTurn(
    sessionId: string,
    baseIndex: number,
    userMsg: ConversationMessage,
    assistantMsg: ConversationMessage,
    meta: LLMMetadata,
  ) {
    await db.insert(whatsappMessages).values([
      {
        sessionId,
        turnIndex: baseIndex,
        role: "user",
        content: userMsg.content,
        mediaItems: userMsg.mediaItems ?? [],
        createdAt: new Date(userMsg.timestamp),
      },
      {
        sessionId,
        turnIndex: baseIndex + 1,
        role: "assistant",
        content: assistantMsg.content,
        llmModel: meta.model,
        llmLatencyMs: meta.latencyMs,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        createdAt: new Date(assistantMsg.timestamp),
      },
    ]);

    await db
      .update(whatsappSessions)
      .set({
        turnsCount: baseIndex / 2 + 1,
        lastActivityAt: new Date(assistantMsg.timestamp),
        updatedAt: new Date(),
      })
      .where(eq(whatsappSessions.id, sessionId));
  },

  async linkProfile(sessionId: string, profileId: string) {
    await db
      .update(whatsappSessions)
      .set({ profileId, isNewCreator: false, updatedAt: new Date() })
      .where(eq(whatsappSessions.id, sessionId));
  },
};

function background(label: string, p: Promise<unknown>) {
  p.catch((err) => console.error(`[Archive] ${label} failed:`, err));
}

class RedisConversationStore implements ConversationStore {
  private async readConversation(phone: string): Promise<Conversation | null> {
const [meta, msgs] = await Promise.all([
      redis.hGetAll(metaKey(phone)),
      redis.lRange(msgsKey(phone), 0, -1),
    ]);

    if (!meta || Object.keys(meta).length === 0) return null;

    const messageHistory: ConversationMessage[] = msgs.map((s) => JSON.parse(s));

    return {
      id: meta.sessionId,
      phoneNumber: phone,
      profileId: meta.profileId || null,
      isNewCreator: meta.isNewCreator === "1",
      status: meta.status as Conversation["status"],
      sourceChannel: meta.sourceChannel as Conversation["sourceChannel"],
      messageHistory,
      turnsCount: parseInt(meta.turnsCount || "0", 10),
      hasAvailability: meta.hasAvailability === "1",
      lastActivityAt: meta.lastActivityAt,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  async ensureConversation(phone: string, mode: ConversationMode): Promise<Conversation> {
    const existing = await this.readConversation(phone);

    // Returning user who's already set up — no profile lookup needed.
    if (existing && (existing.profileId || mode === "cm")) {
      return existing;
    }

    const resolvedProfileId =
      mode === "self" ? await findProfileByWhatsApp(phone) : null;

    if (existing) {
      if (resolvedProfileId) {
        const hasAvailability = await checkHasAvailability(resolvedProfileId);
        await this.linkProfile(phone, resolvedProfileId, hasAvailability);
        return {
          ...existing,
          profileId: resolvedProfileId,
          isNewCreator: false,
          hasAvailability,
        };
      }
      return existing;
    }

    const hasAvailability =
      mode === "self" && resolvedProfileId
        ? await checkHasAvailability(resolvedProfileId)
        : false;
    return this.createConversation(phone, resolvedProfileId, mode, hasAvailability);
  }

  private async createConversation(
    phone: string,
    profileId: string | null,
    mode: ConversationMode,
    hasAvailability: boolean,
  ): Promise<Conversation> {
const now = new Date().toISOString();
    const sessionId = randomUUID();
    // CM is staff acting on behalf of organizers — they don't have a "creator"
    // role themselves, so isNewCreator is always false for CM sessions.
    const isNewCreator = mode === "cm" ? false : profileId === null;
    const sourceChannel: Conversation["sourceChannel"] =
      mode === "cm" ? "whatsapp_cm" : "whatsapp";

    const conversation: Conversation = {
      id: sessionId,
      phoneNumber: phone,
      profileId: mode === "cm" ? null : profileId,
      isNewCreator,
      status: "active",
      sourceChannel,
      messageHistory: [],
      turnsCount: 0,
      hasAvailability,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await redis
      .multi()
      .hSet(metaKey(phone), {
        sessionId,
        profileId: conversation.profileId ?? "",
        isNewCreator: isNewCreator ? "1" : "0",
        status: "active",
        sourceChannel,
        turnsCount: "0",
        hasAvailability: hasAvailability ? "1" : "0",
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .expire(metaKey(phone), SESSION_TTL_SECONDS)
      .exec();

    background("createSession", archive.createSession(conversation));
    return conversation;
  }

  async addTurn(
    phone: string,
    userMsg: ConversationMessage,
    assistantMsg: ConversationMessage,
    meta: LLMMetadata,
  ): Promise<void> {
const now = new Date().toISOString();

    // Pipeline the whole turn into a single round-trip. RPUSH and HINCRBY are
    // atomic per-command, so no MULTI/lock is needed for correctness.
    const results = await redis
      .multi()
      .rPush(msgsKey(phone), [JSON.stringify(userMsg), JSON.stringify(assistantMsg)])
      .hIncrBy(metaKey(phone), "turnsCount", 1)
      .hSet(metaKey(phone), { lastActivityAt: now, updatedAt: now })
      .expire(metaKey(phone), SESSION_TTL_SECONDS)
      .expire(msgsKey(phone), SESSION_TTL_SECONDS)
      .exec();

    // Pull sessionId for the archive write. We could store it alongside the
    // call, but a quick HGET is cheap and keeps the function self-contained.
    const sessionId = await redis.hGet(metaKey(phone), "sessionId");
    if (!sessionId) {
      console.warn(`[ConversationStore] addTurn called for ${phone} without a session — skipping archive`);
      return;
    }

    // turnsCount AFTER the increment; baseIndex is the turn-start index.
    const newTurnsCount = Number((results?.[1] as unknown) ?? 0);
    const baseIndex = (newTurnsCount - 1) * 2;

    background(
      "appendTurn",
      archive.appendTurn(sessionId, baseIndex, userMsg, assistantMsg, meta),
    );
  }

  async linkProfile(
    phone: string,
    profileId: string,
    hasAvailability?: boolean,
  ): Promise<void> {
const now = new Date().toISOString();

    const fields: Record<string, string> = {
      profileId,
      isNewCreator: "0",
      updatedAt: now,
    };
    if (hasAvailability !== undefined) {
      fields.hasAvailability = hasAvailability ? "1" : "0";
    }
    await redis.hSet(metaKey(phone), fields);

    const sessionId = await redis.hGet(metaKey(phone), "sessionId");
    if (sessionId) {
      background("linkProfile", archive.linkProfile(sessionId, profileId));
    }
  }

  async setHasAvailability(phone: string, value: boolean): Promise<void> {
    await redis.hSet(metaKey(phone), {
      hasAvailability: value ? "1" : "0",
      updatedAt: new Date().toISOString(),
    });
  }

  // Wipes the live Redis session so the next inbound message starts fresh
  // (mirrors what the 4-hour TTL would do). Postgres archive is untouched —
  // the completed flow stays in whatsappSessions/whatsappMessages.
  async clearConversation(phone: string): Promise<void> {
    await redis.del([metaKey(phone), msgsKey(phone)]);
  }
}

export const conversationStore: ConversationStore = new RedisConversationStore();
