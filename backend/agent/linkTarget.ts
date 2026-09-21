// Resolve a CM-pasted flyer URL back to the thing it points at.
//
// The flyer links we send are `${APP_BASE_URL}/${username}/event/${id}` and
// `.../session/${id}` (see createRecurringEvent / createSession). For a
// recurring event the id is the FIRST instance's id — the caller still has to
// hop event → seriesId via storage; this only pulls {kind, id} out of whatever
// text the CM pasted (often with a forwarded-message preamble or a trailing
// "?utm=..." WhatsApp appends).

export type EditTargetKind = "event" | "session";

export interface EditTarget {
  kind: EditTargetKind;
  id: number;
}

// Match `/event/123` or `/session/123` anywhere in the blob. We intentionally
// do NOT anchor on the host or username — staging/prod/custom domains and
// copy-paste noise vary, but the `/{kind}/{numericId}` tail is stable (ids are
// serial integers in the schema). Last match wins so a quoted old link above a
// fresh one doesn't shadow the intended target.
const TARGET_RE = /\/(event|session)\/(\d+)\b/gi;

export function parseEditTarget(text: string | null | undefined): EditTarget | null {
  if (!text) return null;
  let match: RegExpExecArray | null;
  let last: EditTarget | null = null;
  TARGET_RE.lastIndex = 0;
  while ((match = TARGET_RE.exec(text)) !== null) {
    const id = Number(match[2]);
    if (Number.isSafeInteger(id) && id > 0) {
      last = { kind: match[1].toLowerCase() as EditTargetKind, id };
    }
  }
  return last;
}
