/**
 * scripts/test_pricing.ts
 *
 * Sanity-check script that mirrors the create_booking RPC pricing logic
 * and prints a breakdown for a set of sample durations.
 *
 * Usage:
 *   npx tsx scripts/test_pricing.ts
 *   npx tsx scripts/test_pricing.ts --rate 25    # custom hourly rate
 */

// ---------------------------------------------------------------------------
// Parse optional --rate flag (default 20 cr/hr)
// ---------------------------------------------------------------------------
const rateFlag = process.argv.indexOf("--rate");
const HOURLY_RATE =
  rateFlag >= 0 ? parseInt(process.argv[rateFlag + 1], 10) : 20;

if (!Number.isFinite(HOURLY_RATE) || HOURLY_RATE <= 0) {
  console.error("Invalid --rate value. Must be a positive integer.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pricing logic (mirrors the SQL RPC exactly)
// ---------------------------------------------------------------------------
interface PricingResult {
  label: string;
  durationMinutes: number;
  durationHours: number;
  pricingMode: "HOURLY" | "DAY_CAP" | "WEEK_CAP";
  hourlyRate: number;
  dayPrice: number;
  billableDays: number | null;
  totalCredits: number;
}

function computePrice(
  label: string,
  durationMinutes: number,
  hourlyRate: number
): PricingResult {
  const durationHours = durationMinutes / 60;
  const dayPrice = hourlyRate * 5;

  if (durationHours <= 5) {
    // Straight hourly (ceil so partial hours round up)
    const totalCredits = Math.ceil(hourlyRate * durationHours);
    return {
      label,
      durationMinutes,
      durationHours,
      pricingMode: "HOURLY",
      hourlyRate,
      dayPrice,
      billableDays: null,
      totalCredits,
    };
  }

  // Day/week cap pricing
  const totalDays = Math.ceil(durationHours / 24);
  const weeks = Math.floor(totalDays / 7);
  const remainder = totalDays % 7;
  const remBillable = Math.min(remainder, 5);
  const billableDays = weeks * 5 + remBillable;
  const totalCredits = billableDays * dayPrice;

  const pricingMode: "DAY_CAP" | "WEEK_CAP" =
    totalDays === 1 ? "DAY_CAP" : "WEEK_CAP";

  return {
    label,
    durationMinutes,
    durationHours,
    pricingMode,
    hourlyRate,
    dayPrice,
    billableDays,
    totalCredits,
  };
}

// ---------------------------------------------------------------------------
// Sample durations
// ---------------------------------------------------------------------------
const samples: { label: string; minutes: number }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "2.5 hours", minutes: 150 },
  { label: "4 hours", minutes: 240 },
  { label: "5 hours", minutes: 300 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "1 day (24 h)", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
  { label: "5 days", minutes: 7200 },
  { label: "7 days (1 week)", minutes: 10080 },
  { label: "10 days", minutes: 14400 },
  { label: "14 days (2 weeks)", minutes: 20160 },
];

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------
console.log("=".repeat(80));
console.log(
  `ForzaCars Pricing Sanity Check — hourly rate: ${HOURLY_RATE} cr/hr`
);
console.log("=".repeat(80));
console.log();

const PAD = {
  label: 20,
  hrs: 8,
  mode: 10,
  days: 6,
  total: 8,
};

function pad(s: string, n: number) {
  return s.padEnd(n);
}
function rpad(s: string, n: number) {
  return s.padStart(n);
}

console.log(
  pad("Duration", PAD.label) +
    rpad("Hours", PAD.hrs) +
    "  " +
    pad("Mode", PAD.mode) +
    rpad("Days", PAD.days) +
    "  " +
    rpad("Total", PAD.total)
);
console.log("-".repeat(PAD.label + PAD.hrs + PAD.mode + PAD.days + PAD.total + 4));

for (const s of samples) {
  const r = computePrice(s.label, s.minutes, HOURLY_RATE);
  console.log(
    pad(r.label, PAD.label) +
      rpad(r.durationHours.toString(), PAD.hrs) +
      "  " +
      pad(r.pricingMode, PAD.mode) +
      rpad(r.billableDays?.toString() ?? "-", PAD.days) +
      "  " +
      rpad(`${r.totalCredits} cr`, PAD.total)
  );
}

console.log();
console.log(`Day price (5 h cap): ${HOURLY_RATE * 5} cr`);
console.log(`Week price (5 days): ${HOURLY_RATE * 5 * 5} cr`);
console.log();
console.log("Done.");
