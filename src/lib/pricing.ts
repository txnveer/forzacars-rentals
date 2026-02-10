/**
 * Shared pricing utility for ForzaCars Rentals
 *
 * Pricing rules:
 * - Duration ≤ 5 hours: hourly rate (durationHours * hourlyRate)
 * - Duration 5-24 hours: day rate cap (hourlyRate * 5)
 * - Duration > 24 hours:
 *     fullDays * dayRate + remainderCost
 *     where remainderCost =
 *       - 0 if remainder == 0
 *       - remainder * hourlyRate if remainder <= 5
 *       - dayRate if remainder > 5
 */

// Day rate = 5 hours worth of hourly rate
export const DAY_HOURS_CAP = 5;
export const HOURS_PER_DAY = 24;

export interface PricingBreakdown {
  /** Total credits to charge */
  totalCredits: number;
  /** Pricing mode for display/storage */
  pricingMode: "HOURLY" | "DAY_CAP" | "MULTI_DAY";
  /** Number of full days charged (null for hourly) */
  fullDays: number | null;
  /** Remainder hours after full days */
  remainderHours: number;
  /** Cost for remainder hours */
  remainderCost: number;
  /** Hourly rate used */
  hourlyRate: number;
  /** Day rate (hourlyRate * 5) */
  dayRate: number;
  /** Total duration in hours (may be fractional) */
  durationHours: number;
  /** Human-readable breakdown string */
  breakdownText: string;
}

/**
 * Calculate rental pricing with day-rate caps
 *
 * @param durationMinutes - Total rental duration in minutes
 * @param hourlyRate - Credits per hour
 * @returns Pricing breakdown with total and details
 */
export function calculateRentalPrice(
  durationMinutes: number,
  hourlyRate: number
): PricingBreakdown {
  if (durationMinutes <= 0 || hourlyRate <= 0) {
    return {
      totalCredits: 0,
      pricingMode: "HOURLY",
      fullDays: null,
      remainderHours: 0,
      remainderCost: 0,
      hourlyRate,
      dayRate: hourlyRate * DAY_HOURS_CAP,
      durationHours: 0,
      breakdownText: "0 credits",
    };
  }

  // Convert to hours, rounding up partial hours
  const durationHours = Math.ceil(durationMinutes / 60);
  const dayRate = hourlyRate * DAY_HOURS_CAP;

  let totalCredits: number;
  let pricingMode: PricingBreakdown["pricingMode"];
  let fullDays: number | null = null;
  let remainderHours: number;
  let remainderCost: number;
  let breakdownText: string;

  if (durationHours <= DAY_HOURS_CAP) {
    // Straight hourly pricing
    totalCredits = durationHours * hourlyRate;
    pricingMode = "HOURLY";
    remainderHours = durationHours;
    remainderCost = totalCredits;
    breakdownText = `${durationHours} hour${durationHours !== 1 ? "s" : ""} × ${hourlyRate} cr = ${totalCredits} credits`;
  } else if (durationHours <= HOURS_PER_DAY) {
    // Day cap applies (5-24 hours = 1 day rate)
    totalCredits = dayRate;
    pricingMode = "DAY_CAP";
    fullDays = 1;
    remainderHours = 0;
    remainderCost = 0;
    breakdownText = `1 day (${durationHours}h capped at ${DAY_HOURS_CAP}h) = ${totalCredits} credits`;
  } else {
    // Multi-day pricing
    pricingMode = "MULTI_DAY";
    fullDays = Math.floor(durationHours / HOURS_PER_DAY);
    remainderHours = durationHours % HOURS_PER_DAY;

    const fullDaysCost = fullDays * dayRate;

    if (remainderHours === 0) {
      remainderCost = 0;
    } else if (remainderHours <= DAY_HOURS_CAP) {
      remainderCost = remainderHours * hourlyRate;
    } else {
      // Remainder > 5 hours gets capped at day rate
      remainderCost = dayRate;
    }

    totalCredits = fullDaysCost + remainderCost;

    // Build breakdown text
    const dayPart = `${fullDays} day${fullDays !== 1 ? "s" : ""} × ${dayRate} cr`;
    if (remainderHours === 0) {
      breakdownText = `${dayPart} = ${totalCredits} credits`;
    } else if (remainderHours <= DAY_HOURS_CAP) {
      breakdownText = `${dayPart} + ${remainderHours}h × ${hourlyRate} cr = ${totalCredits} credits`;
    } else {
      breakdownText = `${dayPart} + 1 day (${remainderHours}h capped) = ${totalCredits} credits`;
    }
  }

  return {
    totalCredits,
    pricingMode,
    fullDays,
    remainderHours,
    remainderCost,
    hourlyRate,
    dayRate,
    durationHours,
    breakdownText,
  };
}

/**
 * Format duration as a human-readable string
 * @param durationMinutes - Duration in minutes
 * @returns String like "2 days, 3 hours" or "5 hours"
 */
export function formatDurationForPricing(durationMinutes: number): string {
  const hours = Math.ceil(durationMinutes / 60);
  
  if (hours <= HOURS_PER_DAY) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = Math.floor(hours / HOURS_PER_DAY);
  const remainderHours = hours % HOURS_PER_DAY;

  if (remainderHours === 0) {
    return `${days} day${days !== 1 ? "s" : ""}`;
  }

  return `${days} day${days !== 1 ? "s" : ""}, ${remainderHours} hour${remainderHours !== 1 ? "s" : ""}`;
}

/**
 * Get a short summary of the pricing
 * @param breakdown - Pricing breakdown from calculateRentalPrice
 * @returns Short summary like "1 day" or "2 days + 3h"
 */
export function getPricingSummary(breakdown: PricingBreakdown): string {
  if (breakdown.pricingMode === "HOURLY") {
    return `${breakdown.durationHours}h`;
  }

  if (breakdown.pricingMode === "DAY_CAP") {
    return "1 day";
  }

  // MULTI_DAY
  const days = breakdown.fullDays ?? 0;
  if (breakdown.remainderHours === 0) {
    return `${days} day${days !== 1 ? "s" : ""}`;
  }

  if (breakdown.remainderHours <= DAY_HOURS_CAP) {
    return `${days}d + ${breakdown.remainderHours}h`;
  }

  // Remainder capped at day rate
  return `${days + 1} day${days + 1 !== 1 ? "s" : ""}`;
}
