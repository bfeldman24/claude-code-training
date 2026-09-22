import { generateCardNumber, validateIssueCardInput } from "@/lib/cards"
import { merchantById } from "@/data/merchants"
import { store } from "@/data/store"
import { Card } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

/**
 * Card list and issuance.
 *
 * The full card number is returned exactly once, in the POST response.
 * Nothing else in this file, or anywhere else, may echo it back.
 */
export function GET() {
  return NextResponse.json(store.cards)
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    )
  }

  const result = validateIssueCardInput(
    body,
    (id) => merchantById(id) !== undefined,
  )
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const { nickname, merchantId, spendLimit, currency, category } = result.data
  const { number, last4 } = generateCardNumber()

  const card: Card = {
    id: `crd_${String(store.cards.length + 1).padStart(4, "0")}`,
    nickname,
    merchantId,
    spendLimit,
    spend: 0,
    currency,
    status: "active",
    last4,
    category: category ?? null,
    createdAt: new Date().toISOString(),
  }

  store.cards.push(card)

  return NextResponse.json({ card, number }, { status: 201 })
}
