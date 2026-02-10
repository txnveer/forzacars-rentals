"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  format,
  addDays,
  differenceInMinutes,
  isBefore,
  isEqual,
  startOfDay,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { calculateRentalPrice, getPricingSummary, type PricingBreakdown } from "@/lib/pricing";

// ============================================================================
// CONSTANTS
// ============================================================================

const BUSINESS_TIMEZONE = "America/Chicago";
const MIN_BOOKING_HOURS = 1;

interface AvailableUnit {
  id: string;
  displayName: string | null;
  color: string | null;
  colorHex: string | null;
  creditsPerHour: number | null;
  businessId: string;
}

interface AvailabilityResponse {
  availableUnitIds: string[];
  availableUnits: AvailableUnit[];
  totalUnits: number;
  availableCount: number;
  error?: string;
}

interface ScheduleCalendarProps {
  modelId: string;
  suggestedCph: number | null;
  colorFilter?: string;
  isAuthenticated?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Generate time slots for a day (30-minute increments)
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

// Format time for display (12-hour format)
function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// Get current time in business timezone, rounded to next 30-minute slot
function getDefaultStartTime(): string {
  const nowInTz = toZonedTime(new Date(), BUSINESS_TIMEZONE);
  const minutes = nowInTz.getMinutes();
  const roundedMinutes = minutes < 30 ? 30 : 0;
  const hours = minutes < 30 ? nowInTz.getHours() : nowInTz.getHours() + 1;
  return `${(hours % 24).toString().padStart(2, "0")}:${roundedMinutes.toString().padStart(2, "0")}`;
}

// Convert local date + time in business timezone to UTC ISO string
function toUtcIso(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  // Create a date in the business timezone
  const tzDate = new Date(date);
  tzDate.setHours(hours, minutes, 0, 0);
  // Convert from business timezone to UTC
  const utcDate = fromZonedTime(tzDate, BUSINESS_TIMEZONE);
  return utcDate.toISOString();
}

// Format date for display in business timezone
function formatDateDisplay(date: Date): string {
  return format(date, "EEE, MMM d");
}

// Format full datetime for summary
function formatDateTimeSummary(date: Date, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${format(date, "EEE MMM d")}, ${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// Calculate duration between two dates with times
function calculateDuration(
  startDate: Date,
  startTime: string,
  endDate: Date,
  endTime: string
): { totalMinutes: number; days: number; hours: number; minutes: number } | null {
  if (!startTime || !endTime) return null;

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const start = new Date(startDate);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(endDate);
  end.setHours(eh, em, 0, 0);

  const totalMinutes = differenceInMinutes(end, start);
  if (totalMinutes < 60) return null;

  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return { totalMinutes, days, hours, minutes };
}

// Format duration for display
function formatDuration(duration: {
  days: number;
  hours: number;
  minutes: number;
}): string {
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

// ============================================================================
// COMPONENT
// ============================================================================

export default function ScheduleCalendar({
  modelId,
  suggestedCph,
  colorFilter,
  isAuthenticated = false,
}: ScheduleCalendarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get today in business timezone
  const todayInTz = useMemo(() => {
    const now = toZonedTime(new Date(), BUSINESS_TIMEZONE);
    return startOfDay(now);
  }, []);

  // State
  const [startDate, setStartDate] = useState<Date>(todayInTz);
  const [endDate, setEndDate] = useState<Date>(todayInTz);
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [isMultiDay, setIsMultiDay] = useState(false);

  // Availability state
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Booking state
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  // Calculate duration
  const duration = useMemo(() => {
    return calculateDuration(startDate, startTime, endDate, endTime);
  }, [startDate, startTime, endDate, endTime]);

  // Pricing breakdown with day-rate caps
  const pricingBreakdown = useMemo((): PricingBreakdown | null => {
    if (!duration || !suggestedCph) return null;
    return calculateRentalPrice(duration.totalMinutes, suggestedCph);
  }, [duration, suggestedCph]);

  // Estimated credits (for backward compatibility)
  const estimatedCredits = pricingBreakdown?.totalCredits ?? null;

  // Validation
  const validationError = useMemo(() => {
    if (!startTime || !endTime) return null;

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    const start = new Date(startDate);
    start.setHours(sh, sm, 0, 0);

    const end = new Date(endDate);
    end.setHours(eh, em, 0, 0);

    if (isBefore(end, start) || isEqual(end, start)) {
      return "End time must be after start time";
    }

    const totalMinutes = differenceInMinutes(end, start);
    if (totalMinutes < 60) {
      return "Minimum booking duration is 1 hour";
    }

    // Check if start is in the past
    const nowInTz = toZonedTime(new Date(), BUSINESS_TIMEZONE);
    if (isBefore(start, nowInTz)) {
      return "Cannot book in the past";
    }

    return null;
  }, [startDate, startTime, endDate, endTime]);

  // Filter end times based on start time and whether multi-day
  const validEndTimes = useMemo(() => {
    if (!startTime) return [];

    const [sh, sm] = startTime.split(":").map(Number);
    const startMinutes = sh * 60 + sm;

    // For same-day bookings, end time must be after start + 1 hour
    if (!isMultiDay || format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      return TIME_SLOTS.filter((t) => {
        const [eh, em] = t.split(":").map(Number);
        const endMinutes = eh * 60 + em;
        return endMinutes >= startMinutes + 60;
      });
    }

    // For multi-day bookings, any time is valid (as long as total >= 1 hour)
    return TIME_SLOTS;
  }, [startTime, startDate, endDate, isMultiDay]);

  // Check availability when selection changes
  useEffect(() => {
    if (!startTime || !endTime || validationError || !duration) {
      setAvailability(null);
      return;
    }

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);

      const start = toUtcIso(startDate, startTime);
      const end = toUtcIso(endDate, endTime);

      const params = new URLSearchParams({
        modelId,
        start,
        end,
      });
      if (colorFilter) {
        params.set("color", colorFilter);
      }

      try {
        const res = await fetch(`/api/availability?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to check availability");
          setAvailability(null);
        } else {
          setAvailability(data);
        }
      } catch (err) {
        setError("Failed to check availability");
        setAvailability(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailability();
  }, [startDate, startTime, endDate, endTime, modelId, colorFilter, validationError, duration]);

  // Build current URL for returnTo
  const getCurrentUrl = useCallback(() => {
    const params = searchParams.toString();
    return params ? `${pathname}?${params}` : pathname;
  }, [pathname, searchParams]);

  // Handle login redirect
  const handleLoginRedirect = () => {
    const returnTo = getCurrentUrl();
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  };

  // Handle booking
  const handleBook = async () => {
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    if (!availability || availability.availableCount === 0 || !duration) return;

    setBooking(true);
    setBookingError(null);
    setBookingSuccess(null);

    const unitId = availability.availableUnitIds[0];
    const start = toUtcIso(startDate, startTime);
    const end = toUtcIso(endDate, endTime);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carUnitId: unitId, startTs: start, endTs: end }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          handleLoginRedirect();
          return;
        }
        setBookingError(data.error || "Booking failed");
      } else {
        setBookingSuccess(
          `Booked! Charged ${data.creditsCharged} credits. Balance: ${data.balanceAfter}`
        );
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } catch (err) {
      setBookingError("Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  // Quick duration handlers
  const handleQuickDuration = (days: number) => {
    if (!startTime) return;
    const newEndDate = addDays(startDate, days);
    setEndDate(newEndDate);
    setIsMultiDay(days > 0);
    // Set end time same as start time for multi-day
    if (days > 0) {
      setEndTime(startTime);
    }
  };

  // Navigate start date
  const goToStartDay = (offset: number) => {
    const newDate = addDays(startDate, offset);
    if (isBefore(newDate, todayInTz)) return;
    setStartDate(newDate);
    // Ensure end date is not before start date
    if (isBefore(endDate, newDate)) {
      setEndDate(newDate);
    }
    setAvailability(null);
  };

  // Navigate end date
  const goToEndDay = (offset: number) => {
    const newDate = addDays(endDate, offset);
    if (isBefore(newDate, startDate)) return;
    setEndDate(newDate);
    setAvailability(null);
  };

  // Toggle multi-day mode
  const toggleMultiDay = () => {
    const newIsMultiDay = !isMultiDay;
    setIsMultiDay(newIsMultiDay);
    if (!newIsMultiDay) {
      setEndDate(startDate);
      setEndTime("");
    } else {
      setEndDate(addDays(startDate, 1));
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Schedule Booking
        </h2>
        <span className="text-xs text-gray-400">
          Times in Central Time (Chicago)
        </span>
      </div>

      {/* Multi-day toggle */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isMultiDay}
          onClick={toggleMultiDay}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 ${
            isMultiDay ? "bg-primary" : "bg-gray-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
              isMultiDay ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm text-gray-700">
          Multi-day / Overnight rental
        </span>
      </div>

      {/* Start Date/Time */}
      <div className="mt-5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Pick-up
        </label>
        <div className="grid grid-cols-2 gap-3">
          {/* Start Date */}
          <div>
            <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2">
              <button
                onClick={() => goToStartDay(-1)}
                disabled={isBefore(addDays(startDate, -1), todayInTz)}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                ←
              </button>
              <span className="text-sm font-medium text-gray-900">
                {formatDateDisplay(startDate)}
              </span>
              <button
                onClick={() => goToStartDay(1)}
                className="text-gray-400 hover:text-gray-600"
              >
                →
              </button>
            </div>
          </div>
          {/* Start Time */}
          <div>
            <select
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                if (!isMultiDay) setEndTime("");
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select time</option>
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>
                  {formatTime12h(t)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* End Date/Time */}
      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Return
        </label>
        <div className="grid grid-cols-2 gap-3">
          {/* End Date */}
          <div>
            <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              isMultiDay ? "border-gray-300" : "border-gray-200 bg-gray-50"
            }`}>
              <button
                onClick={() => goToEndDay(-1)}
                disabled={!isMultiDay || isBefore(addDays(endDate, -1), startDate)}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                ←
              </button>
              <span className={`text-sm font-medium ${isMultiDay ? "text-gray-900" : "text-gray-500"}`}>
                {formatDateDisplay(endDate)}
              </span>
              <button
                onClick={() => goToEndDay(1)}
                disabled={!isMultiDay}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                →
              </button>
            </div>
          </div>
          {/* End Time */}
          <div>
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!startTime}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
            >
              <option value="">Select time</option>
              {validEndTimes.map((t) => (
                <option key={t} value={t}>
                  {formatTime12h(t)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Quick Duration Buttons */}
      {startTime && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => handleQuickDuration(1)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-primary hover:text-primary transition-colors"
          >
            +1 day
          </button>
          <button
            onClick={() => handleQuickDuration(2)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-primary hover:text-primary transition-colors"
          >
            +2 days
          </button>
          <button
            onClick={() => handleQuickDuration(3)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-primary hover:text-primary transition-colors"
          >
            Weekend
          </button>
          <button
            onClick={() => handleQuickDuration(7)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-primary hover:text-primary transition-colors"
          >
            1 week
          </button>
        </div>
      )}

      {/* Duration Summary */}
      {duration && !validationError && (
        <div className="mt-4 rounded-lg bg-sky-light/30 border border-sky-light p-3">
          <p className="text-sm font-medium text-gray-900">
            {formatDateTimeSummary(startDate, startTime)} → {formatDateTimeSummary(endDate, endTime)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Duration: <strong>{formatDuration(duration)}</strong>
          </p>
          {pricingBreakdown && (
            <div className="mt-2 pt-2 border-t border-sky-light">
              <p className="text-sm font-medium text-primary">
                Total: {pricingBreakdown.totalCredits} credits
                {pricingBreakdown.pricingMode !== "HOURLY" && (
                  <span className="ml-2 text-xs font-normal text-primary-600">
                    ({getPricingSummary(pricingBreakdown)})
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {pricingBreakdown.breakdownText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Validation Error */}
      {validationError && startTime && endTime && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{validationError}</p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <p className="mt-4 text-sm text-gray-500">Checking availability...</p>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Availability result */}
      {availability && !loading && !validationError && (
        <div className="mt-4">
          <div
            className={`rounded-lg p-3 ${
              availability.availableCount > 0
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <p className="text-sm font-medium">
              {availability.availableCount > 0 ? (
                <>
                  ✓ {availability.availableCount} unit
                  {availability.availableCount !== 1 ? "s" : ""} available
                </>
              ) : (
                "No units available for this time range"
              )}
            </p>
            {availability.availableCount > 0 && availability.availableUnits[0] && (() => {
              const unit = availability.availableUnits[0];
              const hourlyRate = unit.creditsPerHour ?? suggestedCph;
              return (
                <p className="mt-1 text-xs">
                  {unit.color && (
                    <span className="mr-2">
                      Color: {unit.color}
                    </span>
                  )}
                  {hourlyRate && (
                    <>
                      <span>
                        {hourlyRate} cr/hr
                      </span>
                      <span className="mx-1">•</span>
                      <span>
                        {hourlyRate * 5}/day
                      </span>
                    </>
                  )}
                </p>
              );
            })()}
          </div>

          {/* Book button */}
          {availability.availableCount > 0 && (
            <button
              onClick={handleBook}
              disabled={booking}
              className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isAuthenticated
                  ? "bg-primary hover:bg-primary-600"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {booking
                ? "Booking..."
                : isAuthenticated
                ? `Book Now${estimatedCredits ? ` (${estimatedCredits} credits)` : ""}`
                : "Log in to Book"}
            </button>
          )}
        </div>
      )}

      {/* Booking error */}
      {bookingError && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{bookingError}</p>
        </div>
      )}

      {/* Booking success */}
      {bookingSuccess && (
        <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-sm text-emerald-700">{bookingSuccess}</p>
        </div>
      )}

      {/* Instructions */}
      <p className="mt-4 text-xs text-gray-400">
        Select pick-up and return dates/times. Toggle "Multi-day" for overnight or multi-day rentals.
        Minimum duration: 1 hour.
      </p>
    </div>
  );
}
