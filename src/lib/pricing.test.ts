/**
 * Unit tests for pricing calculations
 *
 * Run with: npx vitest run src/lib/pricing.test.ts
 * Or: npx tsx src/lib/pricing.test.ts (for simple verification)
 */

import { calculateRentalPrice, formatDurationForPricing, getPricingSummary } from "./pricing";

// Test configuration
const HOURLY_RATE = 10; // 10 credits/hour for easy math
const DAY_RATE = 50; // 5 * 10 = 50 credits/day

// Helper to convert hours to minutes
const h = (hours: number) => hours * 60;

// Simple test runner for environments without vitest
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error: any) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    process.exitCode = 1;
  }
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
  };
}

console.log("\n=== Pricing Calculation Tests ===\n");

// Test 1: 1 hour - straight hourly
test("1 hour = 1 * hourlyRate", () => {
  const result = calculateRentalPrice(h(1), HOURLY_RATE);
  expect(result.totalCredits).toBe(10);
  expect(result.pricingMode).toBe("HOURLY");
  expect(result.fullDays).toBe(null);
  expect(result.remainderHours).toBe(1);
});

// Test 2: 5 hours - max hourly before cap
test("5 hours = 5 * hourlyRate", () => {
  const result = calculateRentalPrice(h(5), HOURLY_RATE);
  expect(result.totalCredits).toBe(50);
  expect(result.pricingMode).toBe("HOURLY");
  expect(result.fullDays).toBe(null);
  expect(result.remainderHours).toBe(5);
});

// Test 3: 6 hours - triggers day cap
test("6 hours = dayRate (capped)", () => {
  const result = calculateRentalPrice(h(6), HOURLY_RATE);
  expect(result.totalCredits).toBe(50); // Day rate, not 60
  expect(result.pricingMode).toBe("DAY_CAP");
  expect(result.fullDays).toBe(1);
  expect(result.remainderHours).toBe(0);
});

// Test 4: 12 hours - still day cap
test("12 hours = dayRate (capped)", () => {
  const result = calculateRentalPrice(h(12), HOURLY_RATE);
  expect(result.totalCredits).toBe(50);
  expect(result.pricingMode).toBe("DAY_CAP");
  expect(result.fullDays).toBe(1);
});

// Test 5: 24 hours - exactly 1 day, day cap applies
test("24 hours = dayRate (1 day)", () => {
  const result = calculateRentalPrice(h(24), HOURLY_RATE);
  expect(result.totalCredits).toBe(50);
  expect(result.pricingMode).toBe("DAY_CAP");
  expect(result.fullDays).toBe(1);
  expect(result.remainderHours).toBe(0);
});

// Test 6: 25 hours - 1 day + 1 hour
test("25 hours = dayRate + 1 * hourlyRate", () => {
  const result = calculateRentalPrice(h(25), HOURLY_RATE);
  expect(result.totalCredits).toBe(60); // 50 + 10
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(1);
  expect(result.remainderHours).toBe(1);
  expect(result.remainderCost).toBe(10);
});

// Test 7: 26 hours - 1 day + 2 hours
test("26 hours = dayRate + 2 * hourlyRate", () => {
  const result = calculateRentalPrice(h(26), HOURLY_RATE);
  expect(result.totalCredits).toBe(70); // 50 + 20
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(1);
  expect(result.remainderHours).toBe(2);
  expect(result.remainderCost).toBe(20);
});

// Test 8: 29 hours - 1 day + 5 hours (still hourly for remainder)
test("29 hours = dayRate + 5 * hourlyRate", () => {
  const result = calculateRentalPrice(h(29), HOURLY_RATE);
  expect(result.totalCredits).toBe(100); // 50 + 50
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(1);
  expect(result.remainderHours).toBe(5);
  expect(result.remainderCost).toBe(50);
});

// Test 9: 30 hours - 1 day + 6 hours (remainder gets capped)
test("30 hours = dayRate + dayRate (remainder > 5h capped)", () => {
  const result = calculateRentalPrice(h(30), HOURLY_RATE);
  expect(result.totalCredits).toBe(100); // 50 + 50 (not 50 + 60)
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(1);
  expect(result.remainderHours).toBe(6);
  expect(result.remainderCost).toBe(50); // Capped at day rate
});

// Test 10: 48 hours - exactly 2 days
test("48 hours = 2 * dayRate", () => {
  const result = calculateRentalPrice(h(48), HOURLY_RATE);
  expect(result.totalCredits).toBe(100); // 2 * 50
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(2);
  expect(result.remainderHours).toBe(0);
  expect(result.remainderCost).toBe(0);
});

// Test 11: 50 hours - 2 days + 2 hours
test("50 hours = 2 * dayRate + 2 * hourlyRate", () => {
  const result = calculateRentalPrice(h(50), HOURLY_RATE);
  expect(result.totalCredits).toBe(120); // 100 + 20
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(2);
  expect(result.remainderHours).toBe(2);
  expect(result.remainderCost).toBe(20);
});

// Test 12: 72 hours - exactly 3 days
test("72 hours = 3 * dayRate", () => {
  const result = calculateRentalPrice(h(72), HOURLY_RATE);
  expect(result.totalCredits).toBe(150); // 3 * 50
  expect(result.pricingMode).toBe("MULTI_DAY");
  expect(result.fullDays).toBe(3);
  expect(result.remainderHours).toBe(0);
});

// Test 13: Edge case - partial hour rounds up
test("90 minutes = 2 hours (rounded up) = 20 credits", () => {
  const result = calculateRentalPrice(90, HOURLY_RATE);
  expect(result.totalCredits).toBe(20);
  expect(result.durationHours).toBe(2);
});

// Test 14: Format duration
test("formatDurationForPricing - various durations", () => {
  expect(formatDurationForPricing(h(1))).toBe("1 hour");
  expect(formatDurationForPricing(h(5))).toBe("5 hours");
  expect(formatDurationForPricing(h(24))).toBe("24 hours");
  expect(formatDurationForPricing(h(25))).toBe("1 day, 1 hour");
  expect(formatDurationForPricing(h(48))).toBe("2 days");
  expect(formatDurationForPricing(h(50))).toBe("2 days, 2 hours");
});

// Test 15: Get pricing summary
test("getPricingSummary - various breakdowns", () => {
  expect(getPricingSummary(calculateRentalPrice(h(3), HOURLY_RATE))).toBe("3h");
  expect(getPricingSummary(calculateRentalPrice(h(6), HOURLY_RATE))).toBe("1 day");
  expect(getPricingSummary(calculateRentalPrice(h(24), HOURLY_RATE))).toBe("1 day");
  expect(getPricingSummary(calculateRentalPrice(h(26), HOURLY_RATE))).toBe("1d + 2h");
  expect(getPricingSummary(calculateRentalPrice(h(30), HOURLY_RATE))).toBe("2 days");
  expect(getPricingSummary(calculateRentalPrice(h(48), HOURLY_RATE))).toBe("2 days");
});

console.log("\n=== All tests completed ===\n");
