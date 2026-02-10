/**
 * Timezone utilities for ForzaCars
 *
 * Business timezone: America/Chicago (Central Time)
 * All booking times are displayed to users in Central Time
 * All times are stored in the database as UTC
 */

import {
  format,
  parseISO,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

// ============================================================================
// CONSTANTS
// ============================================================================

export const BUSINESS_TIMEZONE = "America/Chicago";
export const TIMEZONE_LABEL = "Central Time (Chicago)";

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert a UTC ISO string to a Date in the business timezone
 */
export function utcToBusinessTz(utcIso: string): Date {
  return toZonedTime(parseISO(utcIso), BUSINESS_TIMEZONE);
}

/**
 * Convert a local date/time in business timezone to UTC ISO string
 */
export function businessTzToUtc(localDate: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const tzDate = new Date(localDate);
  tzDate.setHours(hours, minutes, 0, 0);
  const utcDate = fromZonedTime(tzDate, BUSINESS_TIMEZONE);
  return utcDate.toISOString();
}

/**
 * Get current time in business timezone
 */
export function nowInBusinessTz(): Date {
  return toZonedTime(new Date(), BUSINESS_TIMEZONE);
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format a UTC ISO string for display in business timezone
 */
export function formatUtcForDisplay(
  utcIso: string,
  formatStr: string = "EEE, MMM d 'at' h:mm a"
): string {
  return formatInTimeZone(parseISO(utcIso), BUSINESS_TIMEZONE, formatStr);
}

/**
 * Format date for display (short format)
 */
export function formatDateShort(date: Date): string {
  return format(date, "EEE, MMM d");
}

/**
 * Format time in 12-hour format
 */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Format a date range for display
 */
export function formatDateRange(startUtc: string, endUtc: string): string {
  const start = formatUtcForDisplay(startUtc, "EEE MMM d, h:mm a");
  const end = formatUtcForDisplay(endUtc, "EEE MMM d, h:mm a");
  return `${start} → ${end}`;
}

// ============================================================================
// DURATION FUNCTIONS
// ============================================================================

export interface Duration {
  totalMinutes: number;
  days: number;
  hours: number;
  minutes: number;
}

/**
 * Calculate duration between two UTC ISO strings
 */
export function calculateDurationFromUtc(
  startUtc: string,
  endUtc: string
): Duration {
  const start = parseISO(startUtc);
  const end = parseISO(endUtc);
  const totalMinutes = differenceInMinutes(end, start);

  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return { totalMinutes, days, hours, minutes };
}

/**
 * Format duration for display
 */
export function formatDuration(duration: Duration): string {
  const parts: string[] = [];
  if (duration.days > 0) {
    parts.push(`${duration.days} day${duration.days !== 1 ? "s" : ""}`);
  }
  if (duration.hours > 0) {
    parts.push(`${duration.hours} hour${duration.hours !== 1 ? "s" : ""}`);
  }
  if (duration.minutes > 0) {
    parts.push(`${duration.minutes} min`);
  }
  return parts.join(", ") || "0 hours";
}

/**
 * Format duration in short form (e.g., "2d 5h")
 */
export function formatDurationShort(duration: Duration): string {
  const parts: string[] = [];
  if (duration.days > 0) {
    parts.push(`${duration.days}d`);
  }
  if (duration.hours > 0) {
    parts.push(`${duration.hours}h`);
  }
  if (duration.minutes > 0 && duration.days === 0) {
    parts.push(`${duration.minutes}m`);
  }
  return parts.join(" ") || "0h";
}

// ============================================================================
// TIME SLOT GENERATION
// ============================================================================

/**
 * Generate 30-minute time slots for a day
 */
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
      );
    }
  }
  return slots;
}

/**
 * Get the next available time slot from now (rounded up to next 30 min)
 */
export function getNextTimeSlot(): string {
  const now = nowInBusinessTz();
  const minutes = now.getMinutes();
  const roundedMinutes = minutes < 30 ? 30 : 0;
  const hours = minutes < 30 ? now.getHours() : now.getHours() + 1;
  return `${(hours % 24).toString().padStart(2, "0")}:${roundedMinutes
    .toString()
    .padStart(2, "0")}`;
}
