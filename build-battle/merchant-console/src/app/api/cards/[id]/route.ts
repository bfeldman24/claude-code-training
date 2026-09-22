import { CARD_STATUSES, canTransition } from "@/lib/cards"
import { store } from "@/data/store"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const card = store.cards.find((c) => c.id === id)
  if (!card) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 })
  }
  return NextResponse.json(card)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const card = store.cards.find((c) => c.id === id)
  if (!card) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    )
  }

  const status =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).status
      : undefined
  if (typeof status !== "string" || !CARD_STATUSES.includes(status as CardStatus)) {
    return NextResponse.json(
      { error: "Status must be one of: active, frozen, cancelled." },
      { status: 400 },
    )
  }

  const newStatus = status as CardStatus
  if (!canTransition(card.status, newStatus)) {
    const message =
      card.status === "cancelled"
        ? "Cancelled is terminal; a card cannot leave that status."
        : `Cannot transition from ${card.status} to ${newStatus}.`
    return NextResponse.json({ error: message }, { status: 409 })
  }

  card.status = newStatus

  return NextResponse.json(card)
}
