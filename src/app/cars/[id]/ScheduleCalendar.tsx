"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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
}

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

// Format a date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Format datetime for API
function toISOString(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export default function ScheduleCalendar({
  modelId,
  suggestedCph,
  colorFilter,
}: ScheduleCalendarProps) {
  const router = useRouter();

  // Selected date (defaults to today)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Time selection
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  // Availability state
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Booking state
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  // Calculate duration in hours
  const getDuration = useCallback((): number | null => {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) return null;
    return (endMinutes - startMinutes) / 60;
  }, [startTime, endTime]);

  // Check availability when selection changes
  useEffect(() => {
    const duration = getDuration();
    if (!startTime || !endTime || duration === null || duration < 1) {
      setAvailability(null);
      return;
    }

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);

      const start = toISOString(selectedDate, startTime);
      const end = toISOString(selectedDate, endTime);

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
  }, [selectedDate, startTime, endTime, modelId, colorFilter, getDuration]);

  // Handle booking
  const handleBook = async () => {
    if (!availability || availability.availableCount === 0) return;

    const duration = getDuration();
    if (!duration || duration < 1) return;

    setBooking(true);
    setBookingError(null);
    setBookingSuccess(null);

    // Pick the first available unit
    const unitId = availability.availableUnitIds[0];
    const start = toISOString(selectedDate, startTime);
    const end = toISOString(selectedDate, endTime);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carUnitId: unitId, startTs: start, endTs: end }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBookingError(data.error || "Booking failed");
      } else {
        setBookingSuccess(
          `Booked! Charged ${data.creditsCharged} credits. Balance: ${data.balanceAfter}`
        );
        // Refresh the page after a short delay
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

  // Navigate days
  const goToDay = (offset: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    setSelectedDate(d);
    setStartTime("");
    setEndTime("");
    setAvailability(null);
  };

  const duration = getDuration();
  const estimatedCredits =
    duration && suggestedCph ? Math.ceil(duration * suggestedCph) : null;

  // Filter end times to only show valid options (after start, at least 1 hour)
  const validEndTimes = startTime
    ? TIME_SLOTS.filter((t) => {
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = t.split(":").map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        return endMinutes >= startMinutes + 60;
      })
    : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
        Schedule Booking
      </h2>

      {/* Date navigation */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => goToDay(-1)}
          disabled={selectedDate <= new Date(new Date().setHours(0, 0, 0, 0))}
          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          &larr; Prev
        </button>
        <span className="font-medium text-gray-900">
          {formatDate(selectedDate)}
        </span>
        <button
          onClick={() => goToDay(1)}
          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
        >
          Next &rarr;
        </button>
      </div>

      {/* Time selection */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="start-time"
            className="block text-xs font-medium text-gray-700"
          >
            Start Time
          </label>
          <select
            id="start-time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setEndTime("");
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select start</option>
            {TIME_SLOTS.slice(0, -2).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="end-time"
            className="block text-xs font-medium text-gray-700"
          >
            End Time
          </label>
          <select
            id="end-time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={!startTime}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
          >
            <option value="">Select end</option>
            {validEndTimes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Duration display */}
      {duration !== null && duration >= 1 && (
        <p className="mt-3 text-sm text-gray-600">
          Duration: <strong>{duration} hour{duration !== 1 ? "s" : ""}</strong>
          {estimatedCredits && (
            <span className="ml-2 text-gray-400">
              (~{estimatedCredits} credits)
            </span>
          )}
        </p>
      )}

      {/* Loading indicator */}
      {loading && (
        <p className="mt-3 text-sm text-gray-500">Checking availability...</p>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Availability result */}
      {availability && !loading && (
        <div className="mt-4">
          <div
            className={`rounded-lg p-3 ${
              availability.availableCount > 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <p className="text-sm font-medium">
              {availability.availableCount > 0 ? (
                <>
                  {availability.availableCount} unit
                  {availability.availableCount !== 1 ? "s" : ""} available
                </>
              ) : (
                "No units available for this time slot"
              )}
            </p>
            {availability.availableCount > 0 && availability.availableUnits[0] && (
              <p className="mt-1 text-xs">
                {availability.availableUnits[0].color && (
                  <span className="mr-2">
                    Color: {availability.availableUnits[0].color}
                  </span>
                )}
                {(availability.availableUnits[0].creditsPerHour ?? suggestedCph) && (
                  <span>
                    {availability.availableUnits[0].creditsPerHour ?? suggestedCph} cr/hr
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Book button */}
          {availability.availableCount > 0 && (
            <button
              onClick={handleBook}
              disabled={booking}
              className="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {booking ? "Booking..." : "Book Now"}
            </button>
          )}
        </div>
      )}

      {/* Booking error */}
      {bookingError && (
        <div className="mt-3 rounded-md bg-red-50 p-2">
          <p className="text-sm text-red-700">{bookingError}</p>
        </div>
      )}

      {/* Booking success */}
      {bookingSuccess && (
        <div className="mt-3 rounded-md bg-green-50 p-2">
          <p className="text-sm text-green-700">{bookingSuccess}</p>
        </div>
      )}

      {/* Instructions */}
      <p className="mt-4 text-xs text-gray-400">
        Select a date and time window (minimum 1 hour, 30-minute increments).
        Availability is checked in real-time.
      </p>
    </div>
  );
}
