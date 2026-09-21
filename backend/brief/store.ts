// server/brief/store.ts
//
// Isolated persistence for page_briefs. Kept separate from the large
// server/storage.ts (and its IStorage interface) so the whole AI Profile
// feature stays additive and self-contained. Uses Drizzle directly, exactly as
// the existing generated_sites routes do.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { pageBriefs, type PageBriefRow } from "@shared/schema";
import { BRIEF_SCHEMA_VERSION, type PageBrief } from "@shared/brief";

export type BriefStatus = "draft" | "published";

export async function getBriefRow(
  profileId: string,
  status: BriefStatus,
): Promise<PageBriefRow | undefined> {
  const [row] = await db
    .select()
    .from(pageBriefs)
    .where(and(eq(pageBriefs.profileId, profileId), eq(pageBriefs.status, status)))
    .limit(1);
  return row;
}

export const getDraftRow = (profileId: string) => getBriefRow(profileId, "draft");
export const getPublishedRow = (profileId: string) => getBriefRow(profileId, "published");

/** Insert-or-update the single draft row for a profile. */
export async function upsertDraft(
  profileId: string,
  brief: PageBrief,
  model?: string | null,
): Promise<PageBriefRow> {
  const now = new Date();
  const [row] = await db
    .insert(pageBriefs)
    .values({
      profileId,
      status: "draft",
      brief,
      schemaVersion: BRIEF_SCHEMA_VERSION,
      model: model ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pageBriefs.profileId, pageBriefs.status],
      set: { brief, schemaVersion: BRIEF_SCHEMA_VERSION, model: model ?? null, updatedAt: now },
    })
    .returning();
  return row;
}

/** Copy the current draft into the published row (creating/replacing it). */
export async function publishDraft(profileId: string): Promise<PageBriefRow | null> {
  const draft = await getDraftRow(profileId);
  if (!draft) return null;
  const now = new Date();
  const [row] = await db
    .insert(pageBriefs)
    .values({
      profileId,
      status: "published",
      brief: draft.brief,
      schemaVersion: draft.schemaVersion,
      model: draft.model,
      publishedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pageBriefs.profileId, pageBriefs.status],
      set: {
        brief: draft.brief,
        schemaVersion: draft.schemaVersion,
        model: draft.model,
        publishedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Discard the draft (revert to published / default on next load). */
export async function deleteDraft(profileId: string): Promise<void> {
  await db
    .delete(pageBriefs)
    .where(and(eq(pageBriefs.profileId, profileId), eq(pageBriefs.status, "draft")));
}

/** Remove the published row (unpublish — public page falls back to today's layout). */
export async function unpublish(profileId: string): Promise<void> {
  await db
    .delete(pageBriefs)
    .where(and(eq(pageBriefs.profileId, profileId), eq(pageBriefs.status, "published")));
}
