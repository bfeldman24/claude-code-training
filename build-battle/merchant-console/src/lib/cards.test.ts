import { describe, expect, it } from "vitest"
import {
  ALLOWED_CARD_CURRENCIES,
  CARD_BIN,
  CARD_STATUSES,
  MAX_SPEND_LIMIT_MINOR_UNITS,
  canTransition,
  generateCardNumber,
  isValidLuhn,
  luhnCheckDigit,
  maskCard,
  validateIssueCardInput,
} from "./cards"

/**
 * A card number is shown exactly once, so a Luhn slip or a generator that
 * repeats itself never gets a second chance to be caught by a human. The
 * status machine is the only thing standing between an ops mistake and a
 * cancelled card coming back to life, and validation is the only thing
 * standing between client input and a card that violates the money or BIN
 * rules. These tests pin all three.
 */

describe("generateCardNumber", () => {
  it("always starts on the 4242 test BIN", () => {
    const { number } = generateCardNumber()
    expect(number.startsWith(CARD_BIN)).toBe(true)
  })

  it("always produces a full number that passes Luhn", () => {
    for (let i = 0; i < 20; i++) {
      const { number } = generateCardNumber()
      expect(isValidLuhn(number)).toBe(true)
    }
  })

  it("returns last4 matching the tail of the full number", () => {
    const { number, last4 } = generateCardNumber()
    expect(number.slice(-4)).toBe(last4)
  })

  it("is deterministic for a fixed random source, so seed data reproduces", () => {
    const seeded = () => {
      const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]
      let i = 0
      return digits[i++ % digits.length] / 10
    }
    const a = generateCardNumber(seeded)
    const b = generateCardNumber(seeded)
    expect(a).toEqual(b)
  })

  it("reproduces the exact number for a known digit sequence", () => {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]
    let i = 0
    const fixed = () => digits[i++] / 10
    const { number } = generateCardNumber(fixed)
    expect(number).toBe("4242" + "12345678901" + luhnCheckDigit("4242" + "12345678901"))
  })
})

describe("isValidLuhn / luhnCheckDigit", () => {
  it("validates a known-good Luhn number", () => {
    // 4242424242424242 is the canonical test-BIN Luhn-valid number.
    expect(isValidLuhn("4242424242424242")).toBe(true)
  })

  it("fails when a single digit is mutated", () => {
    expect(isValidLuhn("4242424242424241")).toBe(false)
  })

  it("rejects a non-numeric string outright", () => {
    expect(isValidLuhn("4242abcd42424242")).toBe(false)
  })

  it("produces the check digit that makes the payload valid", () => {
    const payload = "424242424242424"
    const check = luhnCheckDigit(payload)
    expect(isValidLuhn(payload + check)).toBe(true)
  })

  it("handles a single-digit payload without throwing", () => {
    const check = luhnCheckDigit("4")
    expect(isValidLuhn("4" + check)).toBe(true)
  })

  it("handles an empty payload as a zero check digit", () => {
    expect(luhnCheckDigit("")).toBe("0")
  })
})

describe("maskCard", () => {
  it("renders exactly four dots-then-last4, never the full number", () => {
    expect(maskCard("4242")).toBe("•••• 4242")
  })

  it("does not alter or truncate whatever last4 it is given", () => {
    // Contract is "show last4 verbatim" - this only breaks if a caller
    // hands it something other than four digits, which no caller does.
    expect(maskCard("0007")).toBe("•••• 0007")
  })
})

describe("CARD_STATUSES", () => {
  it("lists exactly the three known statuses, with no drift from the state machine", () => {
    expect(new Set(CARD_STATUSES)).toEqual(new Set(["active", "frozen", "cancelled"]))
  })
})

describe("canTransition", () => {
  it("allows active to frozen and back", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("allows active or frozen to cancelled", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })

  it("never allows a status to transition to itself", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })
})

describe("validateIssueCardInput", () => {
  const merchantExists = (id: string) => id === "mch_01"
  const base = {
    nickname: "Ops travel card",
    merchantId: "mch_01",
    spendLimit: 10000,
    currency: "USD",
  }

  it("rejects a missing nickname", () => {
    const result = validateIssueCardInput({ ...base, nickname: "" }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a missing merchant", () => {
    const result = validateIssueCardInput(
      { ...base, merchantId: "" },
      merchantExists,
    )
    expect(result.valid).toBe(false)
  })

  it("rejects an unknown merchant", () => {
    const result = validateIssueCardInput(
      { ...base, merchantId: "mch_ghost" },
      merchantExists,
    )
    expect(result.valid).toBe(false)
  })

  it("rejects a zero spend limit", () => {
    const result = validateIssueCardInput({ ...base, spendLimit: 0 }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a negative spend limit", () => {
    const result = validateIssueCardInput({ ...base, spendLimit: -100 }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a non-integer spend limit", () => {
    const result = validateIssueCardInput({ ...base, spendLimit: 100.5 }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("accepts the spend limit exactly at the cap", () => {
    const result = validateIssueCardInput(
      { ...base, spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS },
      merchantExists,
    )
    expect(result.valid).toBe(true)
  })

  it("rejects one minor unit over the cap", () => {
    const result = validateIssueCardInput(
      { ...base, spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS + 1 },
      merchantExists,
    )
    expect(result.valid).toBe(false)
  })

  it("rejects a currency outside the allowed set", () => {
    const result = validateIssueCardInput({ ...base, currency: "JPY" }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it.each(ALLOWED_CARD_CURRENCIES)("accepts %s as a currency", (currency) => {
    const result = validateIssueCardInput({ ...base, currency }, merchantExists)
    expect(result.valid).toBe(true)
  })

  it("silently coerces an invalid category to null rather than rejecting", () => {
    const result = validateIssueCardInput(
      { ...base, category: "not_a_real_category" },
      merchantExists,
    )
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.category).toBeNull()
    }
  })

  it("passes through a valid category", () => {
    const result = validateIssueCardInput(
      { ...base, category: "travel" },
      merchantExists,
    )
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.category).toBe("travel")
    }
  })

  // The client is not trusted, so wrong-typed JSON needs the same rejection
  // as wrong-valued JSON - a number where a string is expected, or vice
  // versa, should not slip past a loose truthiness check.
  it("rejects a non-string nickname", () => {
    const result = validateIssueCardInput({ ...base, nickname: 12345 }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a non-string merchantId", () => {
    const result = validateIssueCardInput({ ...base, merchantId: 1 }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a spend limit sent as a numeric string", () => {
    const result = validateIssueCardInput({ ...base, spendLimit: "10000" }, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a missing currency field entirely", () => {
    const { currency, ...withoutCurrency } = base
    const result = validateIssueCardInput(withoutCurrency, merchantExists)
    expect(result.valid).toBe(false)
  })

  it("rejects a request body that is not an object", () => {
    expect(validateIssueCardInput("not an object", merchantExists).valid).toBe(false)
    expect(validateIssueCardInput(null, merchantExists).valid).toBe(false)
    expect(validateIssueCardInput(42, merchantExists).valid).toBe(false)
  })
})
