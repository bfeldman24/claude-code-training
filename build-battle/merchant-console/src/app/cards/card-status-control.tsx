"use client"

import { Button } from "@/components/Button"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Renders the status badge plus, for active/frozen cards, a toggle to flip
 * between the two without a full page reload. Cancelled cards are terminal,
 * so no control renders next to them.
 */
export function CardStatusControl({
  cardId,
  status,
}: {
  cardId: string
  status: CardStatus
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(status)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canToggle = current === "active" || current === "frozen"
  const next: CardStatus = current === "active" ? "frozen" : "active"

  const toggle = async () => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error ?? "Could not update card status.")
        router.refresh()
        return
      }
      setCurrent(payload.status as CardStatus)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={current} />
      {canToggle && (
        <Button
          variant="secondary"
          className="py-1 text-xs"
          onClick={toggle}
          isLoading={pending}
          loadingText={next === "frozen" ? "Freezing..." : "Unfreezing..."}
        >
          {next === "frozen" ? "Freeze" : "Unfreeze"}
        </Button>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
