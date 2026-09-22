import { CardCategory, CardStatus, Currency } from "@/data/types"

/**
 * Card numbers are generated here, on the server, on the 4242 test BIN.
 * Nothing in this repository may produce or store a number that resembles
 * a real PAN. The full number returned by `generateCardNumber` is meant to
 * be shown exactly once, in the creation response; callers must not persist
 * it.
 */

export const CARD_BIN = "4242"
const PAYLOAD_DIGITS = 11 // 4 (BIN) + 11 = 15-digit payload, +1 check digit = 16

export const MAX_SPEND_LIMIT_MINOR_UNITS = 5_000_000
export const ALLOWED_CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]
export const CARD_CATEGORIES: readonly CardCategory[] = [
  "software",
  "advertising",
  "travel",
  "office_supplies",
  "professional_services",
]

/** Luhn check digit for a numeric-digit payload (no check digit included). */
export function luhnCheckDigit(payload: string): string {
  let sum = 0
  let double = true // rightmost payload digit sits in an even position overall
  for (let i = payload.length - 1; i >= 0; i--) {
    let digit = Number(payload[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return String((10 - (sum % 10)) % 10)
}

/** True if a full digit string (including its own check digit) passes Luhn. */
export function isValidLuhn(number: string): boolean {
  if (!/^\d+$/.test(number)) return false
  const payload = number.slice(0, -1)
  const checkDigit = number.slice(-1)
  return luhnCheckDigit(payload) === checkDigit
}

/**
 * Generates a full 16-digit card number on the 4242 test BIN with a valid
 * Luhn check digit. Accepts a `random` source so seed data can pass a
 * deterministic PRNG; real issuance uses `Math.random`.
 *
 * The full number is the only thing callers should ever return to a client
 * exactly once. Never store it - store `last4` from the returned value.
 */
export function generateCardNumber(random: () => number = Math.random): {
  number: string
  last4: string
} {
  let payload = CARD_BIN
  for (let i = 0; i < PAYLOAD_DIGITS; i++) {
    payload += String(Math.floor(random() * 10))
  }
  const number = payload + luhnCheckDigit(payload)
  return { number, last4: number.slice(-4) }
}

/** The only display form for a card number outside the creation response. */
export function maskCard(last4: string): string {
  return `•••• ${last4}`
}

const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

/** Guards the card status state machine. `cancelled` is terminal. */
export function canTransition(from: CardStatus, to: CardStatus): boolean {
  if (from === to) return false
  return TRANSITIONS[from].includes(to)
}

export interface IssueCardInput {
  nickname: string
  merchantId: string
  spendLimit: number
  currency: Currency
  category?: CardCategory | null
}

export type IssueCardValidation =
  | { valid: true; data: IssueCardInput }
  | { valid: false; error: string }

/**
 * Server-side validation for card issuance. The client is not trusted, so
 * every field is re-checked here regardless of what the form already did.
 */
export function validateIssueCardInput(
  body: unknown,
  merchantExists: (id: string) => boolean,
): IssueCardValidation {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be an object." }
  }
  const b = body as Record<string, unknown>

  const nickname = typeof b.nickname === "string" ? b.nickname.trim() : ""
  if (!nickname) {
    return { valid: false, error: "Nickname is required." }
  }

  const merchantId = typeof b.merchantId === "string" ? b.merchantId : ""
  if (!merchantId || !merchantExists(merchantId)) {
    return { valid: false, error: "A valid merchant is required." }
  }

  const spendLimit = b.spendLimit
  if (
    typeof spendLimit !== "number" ||
    !Number.isInteger(spendLimit) ||
    spendLimit <= 0
  ) {
    return { valid: false, error: "Spend limit must be a positive integer." }
  }
  if (spendLimit > MAX_SPEND_LIMIT_MINOR_UNITS) {
    return {
      valid: false,
      error: `Spend limit cannot exceed ${MAX_SPEND_LIMIT_MINOR_UNITS} minor units.`,
    }
  }

  const currency = b.currency
  if (
    typeof currency !== "string" ||
    !ALLOWED_CARD_CURRENCIES.includes(currency as Currency)
  ) {
    return { valid: false, error: "Currency must be USD, EUR, or GBP." }
  }

  const category =
    typeof b.category === "string" &&
    CARD_CATEGORIES.includes(b.category as CardCategory)
      ? (b.category as CardCategory)
      : null

  return {
    valid: true,
    data: { nickname, merchantId, spendLimit, currency: currency as Currency, category },
  }
}
