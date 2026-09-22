"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import {
  ALLOWED_CARD_CURRENCIES,
  CARD_CATEGORIES,
  CARD_CATEGORY_LABELS,
} from "@/lib/cards"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { Currency } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface Props {
  merchants: { id: string; name: string }[]
}

type Step = "form" | "success"

const initialForm = {
  nickname: "",
  merchantId: "",
  spendLimitInput: "",
  currency: "USD" as Currency,
  category: "none",
}

export function IssueCardDialog({ merchants }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("form")
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [revealedNumber, setRevealedNumber] = useState<string | null>(null)

  const resetAndClose = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      // Never let the full number outlive the success screen.
      setRevealedNumber(null)
      setStep("form")
      setForm(initialForm)
      setError(null)
      router.refresh()
    }
  }

  const parsedLimit = parseAmountToMinorUnits(form.spendLimitInput)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.nickname.trim()) {
      setError("Nickname is required.")
      return
    }
    if (!form.merchantId) {
      setError("A merchant is required.")
      return
    }
    if (parsedLimit === null || parsedLimit <= 0) {
      setError("Spend limit must be a positive amount, like 250 or 250.00.")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: form.nickname.trim(),
          merchantId: form.merchantId,
          spendLimit: parsedLimit,
          currency: form.currency,
          category: form.category === "none" ? null : form.category,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error ?? "Something went wrong issuing the card.")
        return
      }

      setRevealedNumber(payload.number as string)
      setStep("success")
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={resetAndClose}>
      <DrawerTrigger asChild>
        <Button>Issue card</Button>
      </DrawerTrigger>
      <DrawerContent>
        {step === "form" ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Issue a card</DrawerTitle>
              <DrawerDescription>
                Single-merchant, always virtual, with a limit from the moment
                it exists.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <form
                id="issue-card-form"
                onSubmit={handleSubmit}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="card-nickname"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Nickname
                  </label>
                  <Input
                    id="card-nickname"
                    value={form.nickname}
                    onChange={(event) =>
                      setForm({ ...form, nickname: event.target.value })
                    }
                    placeholder="e.g. Ad spend — Q3"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="card-merchant"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Merchant
                  </label>
                  <Select
                    value={form.merchantId}
                    onValueChange={(merchantId) =>
                      setForm({ ...form, merchantId })
                    }
                  >
                    <SelectTrigger id="card-merchant">
                      <SelectValue placeholder="Select a merchant" />
                    </SelectTrigger>
                    <SelectContent>
                      {merchants.map((merchant) => (
                        <SelectItem key={merchant.id} value={merchant.id}>
                          {merchant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="card-spend-limit"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Spend limit
                  </label>
                  <Input
                    id="card-spend-limit"
                    inputMode="decimal"
                    value={form.spendLimitInput}
                    onChange={(event) =>
                      setForm({ ...form, spendLimitInput: event.target.value })
                    }
                    placeholder="250.00"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    {form.spendLimitInput
                      ? parsedLimit !== null
                        ? `Limit: ${formatMoney(parsedLimit, form.currency)}`
                        : "Enter a valid amount, like 250 or 250.00."
                      : "Enter an amount in the merchant's currency."}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="card-currency"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Currency
                  </label>
                  <Select
                    value={form.currency}
                    onValueChange={(currency) =>
                      setForm({ ...form, currency: currency as Currency })
                    }
                  >
                    <SelectTrigger id="card-currency">
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOWED_CARD_CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="card-category"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Category
                  </label>
                  <Select
                    value={form.category}
                    onValueChange={(category) =>
                      setForm({ ...form, category })
                    }
                  >
                    <SelectTrigger id="card-category">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CARD_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {CARD_CATEGORY_LABELS[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                  >
                    {error}
                  </p>
                )}
              </form>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DrawerClose>
              <Button
                type="submit"
                form="issue-card-form"
                isLoading={submitting}
                loadingText="Issuing..."
              >
                Issue card
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription>
                Copy the number now — it will not be shown again.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Full card number (shown once)
                </p>
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-center font-mono text-lg tracking-widest text-gray-900 dark:border-amber-900 dark:bg-amber-950 dark:text-gray-50">
                  {revealedNumber}
                </p>
                <p className="text-xs text-gray-500">
                  This is the only time the full number is shown. After you
                  close this dialog, only the masked last four digits are
                  visible anywhere in the console.
                </p>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button onClick={() => resetAndClose(false)}>Done</Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
