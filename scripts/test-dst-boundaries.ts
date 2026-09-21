// scripts/test-dst-boundaries.ts
import { convertTimeBetweenTimezones } from "../frontend/src/lib/timezone-utils";

const TZ = {
  KATHMANDU: "Asia/Kathmandu", // +5:45
  NEWFOUNDLAND: "America/St_Johns", // -3:30
  NYC: "America/New_York",
  LONDON: "Europe/London"
};

console.log("🌍 Starting Advanced Timezone/DST Checks");

let fails = 0;
function check(desc: string, actual: string, expected: string) {
  if (actual === expected) console.log(`   ✅ ${desc}`);
  else {
    console.error(`   ❌ ${desc} | Expected ${expected}, Got ${actual}`);
    fails++;
  }
}

// 1. WEIRD OFFSETS
// Kathmandu (5:45 ahead of UTC) vs NYC (5 behind UTC) -> ~10:45 difference
// 12:00 PM NYC -> Kathmandu
// 12:00 + 5 = 17:00 UTC + 5:45 = 22:45
const t1 = convertTimeBetweenTimezones("12:00", "2026-01-01", TZ.NYC, TZ.KATHMANDU);
check("NYC 12:00 -> Kathmandu", t1.time, "22:45");

// 2. DST BOUNDARY (US Springs Forward March 8/9 2026)
// March 7th 2026 (Standard Time, UTC-5)
const t2 = convertTimeBetweenTimezones("12:00", "2026-03-07", TZ.NYC, TZ.LONDON);
// 12:00 EST = 17:00 UTC = 17:00 GMT
check("Before DST (Standard)", t2.time, "17:00");

// March 10th 2026 (Daylight Time, UTC-4)
const t3 = convertTimeBetweenTimezones("12:00", "2026-03-10", TZ.NYC, TZ.LONDON);
// 12:00 EDT = 16:00 UTC = 16:00 GMT (London hasn't switched yet!)
check("After US DST (London Std)", t3.time, "16:00");

if (fails === 0) console.log("\n✨ All Timezone Edge Cases Passed");
else console.log(`\n💀 ${fails} Timezone Failures detected`);