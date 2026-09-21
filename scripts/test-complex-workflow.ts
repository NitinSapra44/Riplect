// scripts/test-complex-workflow.ts
import { z } from "zod"; // Ensure you have zod installed

const CONFIG = {
  BASE_URL: "http://localhost:5000",
  PROFILE_ID: "3751312c-2d01-4514-acfd-7b4be17711c7",
  SESSION_ID: 1 
};

async function run() {
  if (CONFIG.PROFILE_ID.includes("REPLACE")) process.exit(1);

  const email = `indecisive_${Date.now()}@test.com`;
  console.log(`🎭 Starting 'Indecisive Client' Scenario for ${email}`);

  // 1. BOOK
  const bookRes = await fetch(`${CONFIG.BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: CONFIG.SESSION_ID,
      profileId: CONFIG.PROFILE_ID,
      clientName: "Indecisive Ian",
      clientEmail: email,
      bookingDate: "2026-05-01",
      bookingTime: "10:00",
      totalAmount: "0.00"
    })
  });
  const { booking, guestAccessToken } = await bookRes.json();
  const bookingId = booking.id;
  console.log(`   1. Booked (ID: ${bookingId})`);

  // 2. RESCHEDULE (Valid)
  const reschedRes = await fetch(`${CONFIG.BASE_URL}/api/guest/${guestAccessToken}/bookings/${bookingId}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newDate: "2026-05-02",
      newTime: "14:00",
      message: "Actually, Tuesday is better"
    })
  });
  if (reschedRes.ok) console.log("   2. Reschedule Requested ✅");
  else console.error("   2. Reschedule Failed ❌", await reschedRes.text());

  // 3. CANCEL
  const cancelRes = await fetch(`${CONFIG.BASE_URL}/api/guest/${guestAccessToken}/bookings/${bookingId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "I quit" })
  });
  if (cancelRes.ok) console.log("   3. Cancelled ✅");

  // 4. RESCHEDULE A CANCELLED BOOKING (Should Fail)
  const zombieRes = await fetch(`${CONFIG.BASE_URL}/api/guest/${guestAccessToken}/bookings/${bookingId}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newDate: "2026-05-03",
      newTime: "09:00",
      message: "Wait come back"
    })
  });

  if (zombieRes.status >= 400) {
    console.log("   4. Zombie Reschedule Blocked correctly (Client cannot reschedule cancelled booking) ✅");
  } else {
    console.error("   4. 🚨 SECURITY FAIL: System allowed rescheduling a cancelled booking!");
  }
}

run();