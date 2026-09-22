import { Currency } from "@/data/types"
import { formatMoney } from "@/lib/money"

/**
 * Spend against a card's limit. Server-renderable: the width is a computed
 * percentage, so it is the one place an inline `style` is used — everything
 * else (color, sizing, borders) stays a Tailwind class.
 */
export function SpendProgress({
  spend,
  spendLimit,
  currency,
}: {
  spend: number
  spendLimit: number
  currency: Currency
}) {
  if (spendLimit <= 0) {
    return (
      <div>
        <p className="text-sm text-gray-500">
          No spend limit set on this card.
        </p>
      </div>
    )
  }

  const ratio = spend / spendLimit
  const percent = Math.round(ratio * 100)
  const widthPercent = Math.min(ratio, 1) * 100
  const isWarning = ratio >= 0.8

  return (
    <div>
      <p className="text-sm text-gray-900 dark:text-gray-50">
        {formatMoney(spend, currency)} of {formatMoney(spendLimit, currency)}{" "}
        <span className="text-gray-500">— {percent}%</span>
      </p>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={
            isWarning
              ? "h-full rounded-full bg-amber-500 dark:bg-amber-500"
              : "h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
          }
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  )
}
