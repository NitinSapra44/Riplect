// scripts/test-booking-flow.ts
// Run with: npx tsx scripts/test-booking-flow.ts

import { insertBookingSchema } from "../shared/schema";
import { z } from "zod";

// --- CONFIGURATION ---
const BASE_URL = "http://localhost:5000"; // Or your replit URL
const TEST_PROFILE_ID = "3751312c-2d01-4514-acfd-7b4be17711c7"; // REPLACE THIS
const TEST_SESSION_ID = 22; // REPLACE WITH A VALID SESSION ID BELONGING TO ABOVE PROFILE
const TEST_EMAIL = "test_guest_" + Date.now() + "@example.com";
// ---------------------

console.log("🚀 Starting Booking Flow Integration Test");
console.log(`Target: ${BASE_URL}`);
console.log(`User: ${TEST_EMAIL}\n`);

async function runTests() {
  if (TEST_PROFILE_ID === "YOUR_TEST_COACH_UUID_HERE") {
    console.error("❌ ERROR: Please set a valid TEST_PROFILE_ID and TEST_SESSION_ID in the script.");
    process.exit(1);
  }

  try {
    // 1. CREATE BOOKING (Far future date to allow cancellation)
    console.log("1️⃣  Creating Booking (Next Month)...");
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dateStr = nextMonth.toISOString().split('T')[0]; // YYYY-MM-DD

    const bookingRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        profileId: TEST_PROFILE_ID,
        clientName: "Automated Tester",
        clientEmail: TEST_EMAIL,
        bookingDate: dateStr,
        bookingTime: "10:00",
        totalAmount: "0.00", // Assuming free or test
        sessionMode: "online"
      })
    });

    if (!bookingRes.ok) throw new Error(`Booking failed: ${await bookingRes.text()}`);
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking.id;
    const guestToken = bookingData.guestAccessToken; // Captured from response
    console.log(`✅ Booking Created! ID: ${bookingId}, AccessToken: ${guestToken.substring(0, 10)}...`);

    // 2. RESCHEDULE BOOKING
    console.log("\n2️⃣  Testing Reschedule...");
    const rescheduleRes = await fetch(`${BASE_URL}/api/guest/${guestToken}/bookings/${bookingId}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newDate: dateStr, // Same day
        newTime: "11:00", // One hour later
        message: "Automated reschedule test"
      })
    });

    if (!rescheduleRes.ok) throw new Error(`Reschedule failed: ${await rescheduleRes.text()}`);
    const rescheduleData = await rescheduleRes.json();
    if (rescheduleData.booking.status === 'pending') {
      console.log("✅ Reschedule Successful (Status set to pending approval)");
    } else {
      console.warn("⚠️ Reschedule status unexpected:", rescheduleData.booking.status);
    }

    // 3. CANCEL BOOKING
    console.log("\n3️⃣  Testing Cancellation...");
    const cancelRes = await fetch(`${BASE_URL}/api/guest/${guestToken}/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Automated cancellation test"
      })
    });

    if (!cancelRes.ok) throw new Error(`Cancellation failed: ${await cancelRes.text()}`);
    console.log("✅ Cancellation Successful");

    // 4. TEST 24-HOUR RESTRICTION
    console.log("\n4️⃣  Testing 24-Hour Restriction...");
    // Create a new booking for TOMORROW (likely < 24h depending on precise timing) or TODAY
    const today = new Date();
    // Add 2 hours
    today.setHours(today.getHours() + 2);
    const nearFutureDate = today.toISOString().split('T')[0];
    const nearFutureTime = `${today.getHours().toString().padStart(2, '0')}:00`;

    const quickBookingRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        profileId: TEST_PROFILE_ID,
        clientName: "Urgent Tester",
        clientEmail: TEST_EMAIL,
        bookingDate: nearFutureDate,
        bookingTime: nearFutureTime,
        totalAmount: "0.00",
        sessionMode: "online"
      })
    });

    if (quickBookingRes.ok) {
      const quickData = await quickBookingRes.json();
      const quickId = quickData.booking.id;
      const quickToken = quickData.guestAccessToken;

      console.log(`   Created near-future booking ID: ${quickId}`);

      // Try to cancel immediately (should fail if logic < 24h is strictly enforced from "now")
      const failCancelRes = await fetch(`${BASE_URL}/api/guest/${quickToken}/bookings/${quickId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Should fail" })
      });

      if (failCancelRes.status === 400) {
        console.log("✅ 24-Hour Rule Enforced (Server returned 400 as expected)");
      } else {
        console.warn(`⚠️ 24-Hour Rule Check Warning: Server returned ${failCancelRes.status}. Check if booking time was actually within 24h logic.`);
      }
    } else {
      console.log("⚠️ Could not create immediate booking (maybe slot blocked?), skipping 24h test.");
    }

    console.log("\n🎉 Integration Tests Completed!");

  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
  }
}

runTests();