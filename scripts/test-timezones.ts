// scripts/test-timezones.ts
// Run with: npx tsx scripts/test-timezones.ts

import { 
  convertTimeBetweenTimezones, 
  formatTime24to12,
  dateTimeToUTC
} from "../frontend/src/lib/timezone-utils";

// Mock browser timezone for testing
const MOCK_TIMEZONES = {
  INDIA: "Asia/Kolkata",
  US_EAST: "America/New_York",
  US_PACIFIC: "America/Los_Angeles",
  AUSTRALIA: "Australia/Sydney"
};

console.log("🧪 Starting Timezone Logic Tests...\n");

let passed = 0;
let failed = 0;

function assert(description: string, actual: any, expected: any) {
  if (actual === expected) {
    console.log(`✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${description}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
    failed++;
  }
}

// Test 1: Standard conversion (No date change)
// 9:00 AM EST -> India (IST)
// 9:00 EST is 14:00 UTC, which is 19:30 IST
const test1 = convertTimeBetweenTimezones(
  "09:00", 
  "2026-02-10", 
  MOCK_TIMEZONES.US_EAST, 
  MOCK_TIMEZONES.INDIA
);
assert("US East 9:00 AM -> India (Same Day)", test1.time, "19:30");
assert("US East 9:00 AM -> India Date Unchanged", test1.dateChanged, false);

// Test 2: Date Boundary Crossing (Next Day)
// 10:00 PM (22:00) US East -> India
// 22:00 EST is 03:00 UTC (Next Day), which is 08:30 IST (Next Day)
const test2 = convertTimeBetweenTimezones(
  "22:00", 
  "2026-02-10", 
  MOCK_TIMEZONES.US_EAST, 
  MOCK_TIMEZONES.INDIA
);
assert("US East 10:00 PM -> India Time", test2.time, "08:30");
assert("US East 10:00 PM -> India (Next Day)", test2.dateChanged, true);
assert("US East 10:00 PM -> India Date String", test2.date, "2026-02-11");

// Test 3: Date Boundary Crossing (Previous Day)
// 2:00 AM India -> US East
// 2:00 IST is 20:30 UTC (Prev Day), which is 15:30 (3:30 PM) EST (Prev Day)
// Note: This relies on timezone offsets. 
const test3 = convertTimeBetweenTimezones(
  "02:00", 
  "2026-02-11", 
  MOCK_TIMEZONES.INDIA, 
  MOCK_TIMEZONES.US_EAST
);
assert("India 2:00 AM -> US East Time", test3.time, "15:30");
assert("India 2:00 AM -> US East (Prev Day)", test3.date !== "2026-02-11", true);

// Test 4: 12 Hour Formatting
assert("Format 13:00 to 1:00 PM", formatTime24to12("13:00"), "1:00 PM");
assert("Format 00:30 to 12:30 AM", formatTime24to12("00:30"), "12:30 AM");

console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);