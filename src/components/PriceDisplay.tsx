/**
 * PriceDisplay - Reusable car pricing component
 *
 * Shows hourly and daily rates with:
 * - "Market price" label when unavailable
 * - No label when available
 * - Discount badge when current price < market price
 * - Strikethrough market price when discounted
 */

interface PriceDisplayProps {
  /** Current hourly rate (what customer pays) */
  hourlyRate: number;
  /** Market/suggested hourly rate for comparison */
  marketHourlyRate?: number | null;
  /** Whether the car is currently available */
  isAvailable: boolean;
  /** Variant: 'full' for detail page, 'compact' for card */
  variant?: "full" | "compact";
  /** Additional CSS classes */
  className?: string;
}

// Day price = hourly rate × 5 (5-hour cap per day)
const DAY_MULTIPLIER = 5;

export default function PriceDisplay({
  hourlyRate,
  marketHourlyRate,
  isAvailable,
  variant = "full",
  className = "",
}: PriceDisplayProps) {
  const dailyRate = hourlyRate * DAY_MULTIPLIER;
  const marketDailyRate = marketHourlyRate ? marketHourlyRate * DAY_MULTIPLIER : null;

  // Calculate discount if current price is less than market price
  const hasDiscount =
    marketHourlyRate != null && hourlyRate < marketHourlyRate;
  const discountPercent = hasDiscount
    ? Math.round(((marketHourlyRate - hourlyRate) / marketHourlyRate) * 100)
    : 0;

  if (variant === "compact") {
    return (
      <div className={`text-sm ${className}`}>
        <div className="flex items-center gap-1.5">
          {hasDiscount && marketHourlyRate && (
            <span className="text-gray-400 line-through text-xs">
              {marketHourlyRate}
            </span>
          )}
          <span className="font-semibold text-primary">
            {hourlyRate} cr/hr
          </span>
          {hasDiscount && (
            <span className="rounded bg-accent-sand px-1 py-0.5 text-[10px] font-bold text-gray-900">
              -{discountPercent}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
          {hasDiscount && marketDailyRate && (
            <span className="text-gray-400 line-through">
              {marketDailyRate}
            </span>
          )}
          <span>{dailyRate} cr/day</span>
        </div>
      </div>
    );
  }

  // Full variant (for detail page)
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-4 py-3 ${
        isAvailable
          ? "border-sky-light bg-sky-light/30"
          : "border-gray-200 bg-gray-50"
      } ${className}`}
    >
      {/* Hourly Rate */}
      <div className="flex items-baseline gap-2">
        {hasDiscount && marketHourlyRate && (
          <span className="text-lg text-gray-400 line-through">
            {marketHourlyRate}
          </span>
        )}
        <span
          className={`text-2xl font-bold ${
            isAvailable ? "text-primary" : "text-gray-700"
          }`}
        >
          {hourlyRate}
        </span>
        <span
          className={`text-sm ${
            isAvailable ? "text-primary-600" : "text-gray-600"
          }`}
        >
          credits / hour
        </span>
      </div>

      {/* Separator */}
      <span className="text-gray-300">•</span>

      {/* Daily Rate */}
      <div className="flex items-baseline gap-2">
        {hasDiscount && marketDailyRate && (
          <span className="text-base text-gray-400 line-through">
            {marketDailyRate}
          </span>
        )}
        <span
          className={`text-lg font-semibold ${
            isAvailable ? "text-primary" : "text-gray-700"
          }`}
        >
          {dailyRate}
        </span>
        <span
          className={`text-sm ${
            isAvailable ? "text-primary-600" : "text-gray-600"
          }`}
        >
          / day
        </span>
      </div>

      {/* Discount Badge */}
      {hasDiscount && (
        <span className="ml-2 rounded-full bg-accent-sand px-2 py-0.5 text-xs font-bold text-gray-900">
          -{discountPercent}% off
        </span>
      )}

      {/* Market Price Label (only when NOT available) */}
      {!isAvailable && (
        <span className="ml-auto text-xs font-medium text-gray-500">
          market price
        </span>
      )}
    </div>
  );
}

/**
 * Compact price for car cards in list view
 */
export function PriceCompact({
  hourlyRate,
  marketHourlyRate,
  isAvailable,
  className = "",
}: Omit<PriceDisplayProps, "variant">) {
  const dailyRate = hourlyRate * DAY_MULTIPLIER;
  const marketDailyRate = marketHourlyRate ? marketHourlyRate * DAY_MULTIPLIER : null;

  const hasDiscount =
    marketHourlyRate != null && hourlyRate < marketHourlyRate;
  const discountPercent = hasDiscount
    ? Math.round(((marketHourlyRate - hourlyRate) / marketHourlyRate) * 100)
    : 0;

  return (
    <div className={`mt-2 ${className}`}>
      {/* Main price row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {hasDiscount && marketHourlyRate && (
          <span className="text-xs text-gray-400 line-through">
            {marketHourlyRate}
          </span>
        )}
        <span className="text-sm font-semibold text-primary">
          {hourlyRate} cr/hr
        </span>
        {hasDiscount && (
          <span className="rounded bg-accent-sand px-1.5 py-0.5 text-[10px] font-bold text-gray-900">
            -{discountPercent}%
          </span>
        )}
      </div>

      {/* Daily rate row */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
        {hasDiscount && marketDailyRate && (
          <span className="text-gray-400 line-through">{marketDailyRate}</span>
        )}
        <span>{dailyRate}/day</span>
        {!isAvailable && (
          <span className="ml-1 text-gray-400">(market)</span>
        )}
      </div>
    </div>
  );
}
