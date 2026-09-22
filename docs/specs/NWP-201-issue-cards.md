# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** befeldman
**Status:** building

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand — hours of turnaround, twelve to twenty times a week, and last month a wrong spend limit shipped because the request lived in a Slack thread. Ops needs to issue a card, see every card they've issued, and open one to check it, without leaving the console.

## Current state

- `build-battle/merchant-console/src/data/types.ts:14-21,83-98` — `CardStatus`, `CardCategory`, and `Card` are already defined. `Card` carries `spendLimit`, `spend`, `currency`, `status`, `last4` (never a full number), `category: CardCategory | null`, and `createdAt`.
- `build-battle/merchant-console/src/data/store.ts:16-23` — `store.cards: Card[]` already exists on the in-memory `Store` interface, alongside payments/refunds/disputes/payouts.
- `build-battle/merchant-console/src/lib/cards.ts` — this is the core of the feature and is already committed in full: `generateCardNumber()` (4242 BIN + Luhn, server-only, accepts an injectable `random` for deterministic seeding), `luhnCheckDigit`/`isValidLuhn`, `maskCard(last4)` → `•••• 1234`, `canTransition(from, to)` (the state machine guard), and `validateIssueCardInput(body, merchantExists)` (server-side validation: nickname required, merchant must exist, spend limit must be a positive integer ≤ `MAX_SPEND_LIMIT_MINOR_UNITS` (5,000,000), currency must be in `ALLOWED_CARD_CURRENCIES` (USD/EUR/GBP), category optional against `CARD_CATEGORIES`).
- `build-battle/merchant-console/src/lib/money.ts:15-23,46-52` — `formatMoney(minorUnits, currency)` and `parseAmountToMinorUnits(input)` already exist and must be reused; do not add a second parser/formatter for card amounts.
- `build-battle/merchant-console/src/app/api/cards/route.ts` — already landed (in progress on this branch): `GET` returns `store.cards` (full list, no full numbers — correct, since `Card` never holds one); `POST` runs `validateIssueCardInput`, calls `generateCardNumber()`, pushes a new `Card` onto `store.cards`, and returns `{ card, number }` with `201` — the one place the full number is ever returned.
- `build-battle/merchant-console/src/app/api/cards/[id]/route.ts` — already landed: `GET` returns one card by id (404 if missing); `PATCH` reads `status` from the body, checks it against `canTransition`, returns `409` with a clear message on an illegal transition (including the `cancelled`-is-terminal case), else applies it and returns the updated card.
- `build-battle/merchant-console/src/data/generate.ts:154-156` — seeding is **not done**. `generate()` currently returns `cards: []` with a `TODO(NWP-201, agent C)` comment asking for 5-6 deterministic `Card`s using `generateCardNumber` and the existing `mulberry32`/`pick`/`between` pattern already used for payments/payouts.
- `build-battle/merchant-console/src/app/cards/` — **does not exist yet**. No list page, no detail page, no issue-card UI. This is the largest remaining gap.
- `build-battle/merchant-console/src/app/payments/page.tsx` and `.../payments/[id]/page.tsx` — the pattern the cards pages will mirror: an async server component reads `searchParams`/`params`, queries the store/query layer directly, renders a `TableRoot`/`Table` (list) or a `dl`/`Field` grid (detail), uses `StatusBadge` for status, `formatMoney` for amounts, and a `Link` back to the list.
- `build-battle/merchant-console/src/components/ui/payments/StatusBadge.tsx` — keyed on `AnyStatus = PaymentStatus | DisputeStatus | PayoutStatus`, with parallel `LABELS`/`DOTS`/`VARIANTS` records. It does **not** yet include `CardStatus` — extending it means adding `active`/`frozen`/`cancelled` to all three records and widening `AnyStatus`, not building a second badge component.
- `build-battle/merchant-console/src/components/Drawer.tsx` — a Radix (`@radix-ui/react-dialog`)-based dialog primitive (`Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerBody`, `DrawerFooter`, `DrawerClose`). This is the actual dialog component in this codebase and is what the issue-card form will be built in.
- **Discrepancy:** `build-battle/merchant-console/.claude/rules/components.md:9` claims `src/components/` already has "Button, Input, Select, Dialog, Badge, and the rest." `Dialog.tsx` does not exist — `ls src/components/` shows `Drawer.tsx` and no `Dialog.tsx`. `Drawer.tsx` is the actual Radix-dialog-based primitive; the rule file is out of date and should say `Drawer`, not `Dialog`.
- `build-battle/merchant-console/src/data/queries.ts` — the one payment query builder (`filterPayments`/`parseFilters`), an existing pattern for allowlist-based filtering. Cards has no filters in the core scope, so this file is not touched by NWP-201, only cited as the convention the api-routes rule refers to.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units, formatted once at the edge | `build-battle/merchant-console/.claude/rules/money.md`; ticket rule 1 | A `$250.00` limit stored as `250` or `"250.00"` corrupts every comparison against `spend` and the 5,000,000 cap |
| Reveal once, mask forever — full number only in the POST 201 body, `•••• 4242` everywhere else | `build-battle/merchant-console/.claude/rules/cards.md`; ticket rule 2 | A full PAN persisted on `Card` or echoed from `GET /api/cards` or `GET /api/cards/[id]` is an unshippable data leak in this exercise's own terms |
| Status is a state machine: `active ⇄ frozen`, either → `cancelled`, `cancelled` terminal, guarded server-side | `build-battle/merchant-console/.claude/rules/cards.md`; ticket rule 3 | Freeze/unfreeze or cancel UI that trusts the client lets a `cancelled` card come back to life, or lets `active → cancelled → active` slip through |
| Server-side validation of merchant, currency (USD/EUR/GBP only), and limit (positive integer, ≤ 5,000,000 minor units) | `build-battle/merchant-console/.claude/rules/api-routes.md`; ticket rule "Server-side validation" | A form-only check lets a zero limit, a bad currency, or a nonexistent merchant reach the store, since "the client is not trusted" |
| The `4242` BIN is mandatory on every generated number, with a valid Luhn digit | `build-battle/merchant-console/.claude/rules/cards.md`; ticket rule 4 | Any other BIN risks a number that could resemble a real PAN, which the ticket says "cannot ever" happen in this repo |

## Approach

Two gaps remain: seed data (`generate.ts` still returns `cards: []`) and the `/cards` UI (list page, detail page, issue form, freeze/unfreeze control). The API routes and `lib/cards.ts` are already correct and complete, so the UI is built strictly against their existing response shapes rather than guessing at a contract. The issue-card form runs inside a `Drawer` (matching the one dialog primitive that actually exists in this codebase), submits to `POST /api/cards`, and shows the returned `number` exactly once on a success view before the drawer closes and the number is discarded from client state. Freeze/unfreeze is a small client component that calls `PATCH /api/cards/[id]` and updates local state without a full navigation, matching the ticket's "without a full page reload" stretch goal.

**Considered and rejected:** storing the full card number on the `Card` record (or in a side table) and redacting it on every read except the first. Rejected because it multiplies the ways the full number can leak — every future route, log line, or debug print becomes a place that must remember to redact, and the ticket's own rule 2 says "never persist" it, not "persist and redact." Generating the number, returning it once in the POST response, and storing only `last4` (as `lib/cards.ts` and `types.ts` already do) means there is no stored value to leak in the first place — the constraint is enforced by what does not exist rather than by discipline at every read site.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/generate.ts` | Change | Replace `cards: []` (line 156) with 5-6 deterministic `Card`s built via `generateCardNumber(rand)`, following the existing `mulberry32`/`pick`/`between` pattern already used for payments/payouts |
| `src/app/cards/page.tsx` | Add | List route: nickname, merchant, masked number, spend limit, status, created date — mirrors `src/app/payments/page.tsx`'s server-component + `TableRoot` pattern |
| `src/app/cards/[id]/page.tsx` | Add | Detail route: full record + spend-vs-limit — mirrors `src/app/payments/[id]/page.tsx`'s `dl`/`Field` pattern |
| `src/components/ui/cards/IssueCardDrawer.tsx` | Add | Client component wrapping `Drawer`/`DrawerContent`/`DrawerBody` for the issue-card form; posts to `POST /api/cards`, shows the one-time number on success |
| `src/components/ui/cards/CardStatusControl.tsx` | Add | Small client component for freeze/unfreeze (and cancel) that calls `PATCH /api/cards/[id]` and updates local state in place |
| `src/components/ui/payments/StatusBadge.tsx` | Change | Widen `AnyStatus` to include `CardStatus` and add `active`/`frozen`/`cancelled` entries to `LABELS`/`DOTS`/`VARIANTS` |
| `build-battle/merchant-console/.claude/rules/components.md` | Change (flag, not fixed by this ticket) | Line 9 names a nonexistent `Dialog`; should read `Drawer` — noted here as a discrepancy, left to the reviewer/rule owner rather than silently patched mid-ticket |
| `src/lib/cards.test.ts` | Add (stretch) | Unit tests for `luhnCheckDigit`/`generateCardNumber`/`canTransition` |

No changes needed to `src/lib/cards.ts`, `src/lib/money.ts`, `src/data/types.ts`, `src/data/store.ts`, or the two `src/app/api/cards/**/route.ts` files — they already match the ticket's rules.

## Plan

1. **Seed cards** — done when: `generate.ts` returns 5-6 `Card`s with varied `status`/`category`/`currency`, `GET /api/cards` shows them, and a re-run of the dev server produces the identical set (deterministic PRNG).
2. **Cards list page** — done when: `/cards` renders nickname, merchant name, masked number (`•••• 4242`), formatted spend limit, `StatusBadge`, and created date for every seeded card, with a written empty state if `store.cards` is empty.
3. **Card detail page** — done when: `/cards/[id]` shows the full record (no full number anywhere) plus a spend-vs-limit display, 404s cleanly on an unknown id.
4. **Issue-card drawer** — done when: submitting the form with valid input creates a card (`POST /api/cards` returns 201), the new card appears in the list, and the full number is shown once on a success view, then is gone from client state.
5. **Client-side + server-side validation parity** — done when: submitting a missing merchant, a zero/negative limit, a limit over 5,000,000, or a non-USD/EUR/GBP currency is rejected with a visible error, proven by hitting the API directly (not just disabling the submit button).
6. **Freeze/unfreeze control** — done when: toggling status on the list or detail view calls `PATCH /api/cards/[id]` and updates on screen without a full page navigation; attempting an illegal transition (e.g. off of `cancelled`) shows the 409 message.
7. **StatusBadge extension** — done when: card statuses render with the same badge component payments/disputes/payouts use, no second badge implementation.
8. **Stretch, if time remains** — `src/lib/cards.test.ts` for Luhn/state-machine, amber spend-progress bar past 80%, category lock display, empty/error states polish.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card via form/dialog | Submit the drawer form against the running dev server; confirm the new card appears in `/cards` and in `GET /api/cards` |
| `/cards` list shows nickname, merchant, masked number, spend limit, status, created date | Visual check of the rendered table against seeded + newly issued cards |
| Card detail shows full record and spend vs. limit | Open a seeded card's `/cards/[id]`; confirm all `Card` fields render and spend/limit is shown together |
| Generated numbers on the `4242` BIN with valid Luhn | `src/lib/cards.test.ts` asserts `generateCardNumber().number.startsWith("4242")` and `isValidLuhn(number)` is true across many draws; already guaranteed by the committed `generateCardNumber` implementation |
| Reveal once, mask forever | Inspect `POST /api/cards` response body (has `number`) vs. `GET /api/cards` and `GET /api/cards/[id]` bodies (only `last4` via `Card`, no `number` field ever) |
| Server-side validation rejects bad input | `curl`/fetch directly against `POST /api/cards` with a missing merchant, limit `0`, limit `5000001`, and currency `"JPY"` — each returns 400 with `validateIssueCardInput`'s message, independent of any client form |
| Freeze/unfreeze (stretch) | Toggle status in the UI, confirm no full navigation (network tab shows only the `PATCH` call); attempt `cancelled → active` via `PATCH` directly and confirm 409 |
| Spend progress amber past 80% (stretch) | Seed or issue a card with `spend` at >80% of `spendLimit`; visually confirm the bar's color change |
| Tests passing (stretch) | `npm test` run against `src/lib/cards.test.ts` |

## Risks

- **`generate.ts` seeding is the only unblocked-but-undone piece other agents are relying on.** If it lands with non-deterministic seeding or reuses `Math.random` instead of the shared `rand`, other parallel work (list/detail pages) will see a different card set on every restart, breaking manual verification. Mitigate by using the same `mulberry32(SEED)` instance already in scope in that file.
- **`StatusBadge` is shared with payments/disputes/payouts.** Widening `AnyStatus` without adding all three `CardStatus` entries to every record (`LABELS`, `DOTS`, `VARIANTS`) is a TypeScript error, not a runtime one — cheap to catch, easy to forget under the clock.
- **Drawer state on close.** The success screen holds the one-time full number in component state; closing the drawer without clearing that state (e.g. reopening it later) would violate "left in client state after the success screen closes." Reset state on `DrawerClose`.

## Out of scope

Quoting the ticket directly:

- "**Persistence.** The console runs against an in-memory store seeded from JSON. Cards you create live until the dev server restarts. Real persistence is NWP-203. Do not add a database, an ORM, or a migration; it will not earn points and it will cost you the clock."
- "Authentication, roles, and permissions."
- "Real card network calls. There is no issuer here and there is not going to be one today."
- "Editing a card's limit after issue. That is NWP-202."

## Open questions

- Whether `src/app/api/cards/route.ts` and `[id]/route.ts` (already committed by a parallel agent) will still exist in this exact shape by the time UI work lands — this spec treats their current contract (`GET` list, `POST` → `{card, number}` 201, `GET`/`PATCH` by id) as stable, but it's worth a final diff check before wiring the UI.
- Whether the `components.md` "Dialog" → "Drawer" mismatch should be fixed as part of this PR or left for a separate docs fix; flagged here rather than silently patched.
- Whether category lock (stretch) should block category changes only via the API (already true — `PATCH` only accepts `status`) or also needs an explicit UI affordance showing it's locked, versus just omitting a category field from any edit UI (there is none, since editing is out of scope per NWP-202).
