import { randomBytes } from "crypto";
import { storage } from "../storage";

function randomSuffix(): string {
  return randomBytes(3).toString("hex"); // 6 hex chars, ~16M values
}

export async function generateUniqueUsername(displayName: string): Promise<string> {
  let base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (base.length < 3) {
    base = "user" + base;
  }

  base = base.slice(0, 27);

  const existing = await storage.getProfileByUsername(base);
  if (!existing) return base;

  for (let i = 2; i <= 100; i++) {
    const candidate = `${base}${i}`;
    const taken = await storage.getProfileByUsername(candidate);
    if (!taken) return candidate;
  }

  // Fallback: random suffix with collision-space large enough that two concurrent
  // signups with the same base name are vanishingly unlikely to generate the same value.
  return `${base}${randomSuffix()}`;
}
