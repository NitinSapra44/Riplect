// scripts/test-race-conditions.ts
// Run with: npx tsx scripts/test-race-conditions.ts

const CONFIG = {
  BASE_URL: "http://localhost:5000",
  // ⚠️ USE A DUMMY SESSION ID TO AVOID MESSING UP REAL SCHEDULES
  SESSION_ID: 1, 
  PROFILE_ID: "3751312c-2d01-4514-acfd-7b4be17711c7", 
};

const TARGET_DATE = new Date();
TARGET_DATE.setMonth(TARGET_DATE.getMonth() + 2); // Far future
const DATE_STR = TARGET_DATE.toISOString().split('T')[0];
const TIME_SLOT = "14:00";

console.log(`🔥 Starting Concurrency Test: 5 users aiming for ${DATE_STR} @ ${TIME_SLOT}`);

async function attemptBooking(userIndex: number) {
  const email = `race_user_${userIndex}_${Date.now()}@test.com`;
  console.log(`   User ${userIndex} dialing in...`);

  const start = Date.now();
  const res = await fetch(`${CONFIG.BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: CONFIG.SESSION_ID,
      profileId: CONFIG.PROFILE_ID,
      clientName: `Racer ${userIndex}`,
      clientEmail: email,
      bookingDate: DATE_STR,
      bookingTime: TIME_SLOT,
      totalAmount: "10.00",
      sessionMode: "online"
    })
  });

  const duration = Date.now() - start;
  return { status: res.status, userIndex, duration };
}

async function run() {
  if (CONFIG.PROFILE_ID.includes("REPLACE")) {
    console.error("❌ Setup specific IDs in the script first!");
    process.exit(1);
  }

  // Fire 5 requests simultaneously
  const promises = Array.from({ length: 5 }, (_, i) => attemptBooking(i + 1));
  const results = await Promise.all(promises);

  console.log("\n--- RESULTS ---");
  const successes = results.filter(r => r.status === 200 || r.status === 201);
  const failures = results.filter(r => r.status !== 200 && r.status !== 201);

  console.log(`✅ Successful Bookings: ${successes.length}`);
  console.log(`❌ Failed/Blocked:      ${failures.length}`);

  if (successes.length > 1) {
    console.error("\n🚨 CRITICAL ISSUE: Multiple users booked the exact same slot!");
    console.error("   Your DB needs a UNIQUE constraint on (session_id, date, time) or app-level locking.");
  } else {
    console.log("\n✨ System handled concurrency correctly (or allows group bookings).");
  }
}

run();
