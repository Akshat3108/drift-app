# User Journey Maps — Drift

**Date:** 2026-05-17

---

## Journey 1: First-Time User Setup

**Persona:** Priya, 26, software engineer, just downloaded Drift after a friend recommended it.  
**Goal:** Set up the app and log her first expense within 5 minutes.

```
Step          Action                    Emotion      Friction
──────────────────────────────────────────────────────────────────────────────
1. Launch     Sees onboarding step 1    Curious       None
2. Name       Types "Priya"             Comfortable   None
3. Avatar     Picks an emoji            Delighted     None ✓
4. Currency   Selects INR               Comfortable   None
5. Dark mode  Toggles dark              Satisfied     None
6. Categories Sees list of 10 pots      Overwhelmed   "What's a pot?"
              No explanation provided
7. Budgets    Tries to set budget       Confused      "Do I need budgets now?"
              per category                            Doesn't know her numbers
8. Finish     Taps "Get started"        Relieved      None
9. Home       Sees empty state          Flat          "Now what?"
              "Nothing logged yet"
              No guided next step
10. Add       Taps + tab                Hesitant      Opens full Add screen
              Sees numpad               
              Types amount              Comfortable   None
              Types merchant            Fine          No autocomplete
              Picks category            Fine          Had to scroll to find Food
              Picks mood                Uncomfortable "Why do I need to rate this?"
11. Save      Taps Save (top right)     Satisfied     CTA is small text link, easy to miss
12. Home      Sees first expense        Pleased       No animation/celebration for first entry
```

**Pain points:** Steps 6, 9, 10 (mood), 11  
**Moments of delight:** Steps 3, 4  
**Drop-off risk:** Step 9 — empty state with no "what to do next" guidance is the most likely abandonment point.

**Improved journey (proposed):**
- Step 6: Add "Pots = spending buckets" tooltip on first view.
- Step 9: Add a Day-0 Orientation card: "Start by scanning a receipt or adding your first spend."
- Step 10: Auto-select last category (or most-common for context).
- Step 11: Move Save to a bottom primary button, not a header link.
- Step 12: Show a confetti/celebration moment on first expense logged.

---

## Journey 2: Daily Expense Logging (Power User)

**Persona:** Aryan, 31, product manager, logs 3–5 expenses/day, uses Drift for a year.  
**Goal:** Log 4 expenses during lunch break in under 2 minutes.

**Current experience:**

```
Expense 1: Coffee ₹80
  Tap + → numpad → "80" → type "Blue Tokai" → scroll to find Coffee → tap mood → Save
  Time: ~25 seconds. Taps: 12.

Expense 2: Auto ₹120
  Tap + → numpad → "120" → type "Auto" → scroll to find Transport → tap mood → Save
  Time: ~22 seconds. Taps: 11.

Expense 3: Lunch ₹450
  Tap + → numpad → "450" → type "Smoke House Deli" → scroll to find Food → tap mood → Save
  Time: ~27 seconds. Taps: 12.

Expense 4: Parking ₹50
  Tap + → numpad → "50" → type "Parking" → scroll to find Transport → tap mood → Save
  Time: ~22 seconds. Taps: 11.

Total: ~96 seconds, 46 taps.
```

**Friction analysis:**
- Re-typing merchant name every time: 80% of his merchants repeat weekly.
- Mood picker: he always picks 😌 but must still tap it.
- Category scroll: "Transport" is at position 5 in his list; he scrolls past it every time.
- No memory of last-used values.

**Proposed experience:**
```
Expense 1: Coffee ₹80
  Tap + → type "8" "0" → type "B" → autocomplete shows "Blue Tokai · Coffee · ₹85" → tap → Save
  Time: ~8 seconds. Taps: 6.

(Same improvement for each subsequent expense.)
Total: ~32 seconds, 24 taps. 67% faster.
```

**Key improvements needed:**
- Merchant autocomplete from history.
- Smart category pre-fill based on merchant history.
- Skip mood picker (make it optional/collapsed by default).
- "Last category used" pre-selected.

---

## Journey 3: Grocery Receipt Scan

**Persona:** Meera, 35, homemaker, does weekly grocery run at BigBazaar.  
**Goal:** Scan the receipt and have Drift track item prices automatically.

```
Step          Action                    Emotion      Friction
──────────────────────────────────────────────────────────────────────────────
1. Open       Taps Scan tab             Confident     None
2. Capture    Taps dashed box           Fine          Alert asking Camera vs Gallery — 
                                                      an extra step, she always uses Camera
3. Camera     Takes photo               Fine          None
4. Processing "Reading line items…"     Tense         Spinner only — no progress %, 
                                                      long receipt takes 8+ seconds
5. Review     Sees items list           Relieved      But date field shows YYYY-MM-DD
              Merchant = "BIG BAZAAR"   Fine          All-caps, can she edit? (yes, but non-obvious)
6. Date       Tries to fix date         Confused      Types "17/05/2026" — wrong format
                                                      Must type "2026-05-17" — no date picker
7. Items      Sees 24 items             Overwhelmed   4 items have wrong name from OCR
8. Fix item   Taps item → modal opens   OK            Must tap "Done" after each edit
9. Category   Scrolls to find Groceries Comfortable   Auto-selected correctly ✓
10. Save      Taps "Save · ₹2,840"     Satisfied     Alert pops up to confirm
11. Alert     Taps OK                   Fine          Navigates back to Scan idle screen
12. Home      Opens Home                Curious       No visible confirmation her scan was saved
```

**Pain points:** Steps 2, 4, 6, 7, 11, 12  
**Moments of delight:** Step 9 (auto-category), Step 10 (total shows in button)

**Improvements:**
- Step 2: Auto-launch camera (Camera is 95% of use cases; show "Use gallery instead" as a small link).
- Step 4: Show progress percentage ("Reading 34 of 48 lines…").
- Step 6: Replace date TextInput with a date picker.
- Step 7: Flag low-confidence items with a yellow dot; user can focus corrections.
- Step 8: Swipe-to-delete items without entering modal.
- Step 11: Replace Alert with a toast (auto-dismissing snackbar).
- Step 12: Show a "Saved: BigBazaar ₹2,840" toast on Home for 3 seconds.

---

## Journey 4: Monthly Budget Review

**Persona:** Rishi, 28, freelancer, reviews finances on the last Sunday of each month.  
**Goal:** Understand where money went this month and adjust budgets for next month.

```
Step          Action                    Emotion      Friction
──────────────────────────────────────────────────────────────────────────────
1. Open       Taps Trends tab           Focused       None
2. Overview   Sees "Spending by category" Oriented    Total shown, categories listed ✓
3. Category   Taps "Food" to drill down  Curious      Lands on PotDetail
4. PotDetail  Sees list of expenses     OK            No chart — just a list
              No monthly comparison
              No merchant breakdown
5. Back       Returns to Trends         Fine          None
6. Chart      Sees 6-month bar chart    Satisfied     But can only compare total spend, 
                                                      not by category
7. Goals      Sees goals section        Good          ✓
8. AllExpenses Navigates there          Frustrated    No way to filter by date range
                                                      Only "this month" loads
                                                      Can't see last month's Food spend
9. Search     Tries to search "Swiggy"  Blocked       No search anywhere in app
10. Give up   Exits AllExpenses         Frustrated    Can't answer "How much on Swiggy this year?"
```

**Critical failure:** Steps 8–10. A monthly budget reviewer's most important questions (compare months, search merchants) are both unanswered.

**Improvements:**
- PotDetail: Add 6-month mini chart + top merchants breakdown.
- Trends: Add month selector (< April 2026 >).
- AllExpenses: Add date range filter, text search.
- New: "Budget vs. Actual" comparison screen with per-category trend.

---

## Journey 5: Subscription Audit

**Persona:** Karan, 33, entrepreneur, suspects he's over-paying for subscriptions.  
**Goal:** Review and cancel unused subscriptions in a single session.

```
Step          Action                    Emotion      Friction
──────────────────────────────────────────────────────────────────────────────
1. Open       Taps Subs tab             Determined    None
2. Total      Sees ₹4,200/mo · ₹50,400/yr Shocked    Good — yearly context is powerful ✓
3. Banner     Sees "Cancel Netflix & Hotstar" Tempted Banner is very prominent (coral, bold)
4. Cancel all Taps "Cancel all · save ₹1,200" Nervous   What does "cancel" mean here?
                                                      Is it cancelling in-app or actually 
                                                      cancelling the subscription externally?
5. Confusion  Realizes it just marks them Done         UX doesn't make the "this is a reminder, 
              as cancelled in-app                      not an actual cancellation" clear
6. Individual Reviews each sub           Methodical   Long-press to edit is hidden
7. Long-press Discovers edit option      Relieved     Too hidden for a key action
8. Edit       Navigates to EditSub      Fine          None
9. Renewal    Notices no renewal date   Frustrated    Can't track when Spotify actually bills
10. Back      Returns to Subs list      Fine          Can't sort by amount or date
```

**Pain points:** Steps 4–5, 6–7, 9, 10.

**Improvements:**
- Step 4: Label the banner action "Mark as cancelled" to clarify it's a reminder, not an API call.
- Step 6–7: Add explicit "Edit" and swipe-left actions (not long-press-only).
- Step 9: Add renewal day field to EditSub.
- Step 10: Add sort options (by amount, by status).
- New: Subscription calendar view (upcoming renewal dates).

---

## Journey 6: Onboarding → First Scan (New User, Receipt-First Flow)

**Persona:** Ananya, 22, college student, just got her first job and wants to track expenses.  
**Goal:** Set up Drift and use receipt scan immediately.

```
Step          Action                    Emotion
──────────────────────────────────────────────────────────────────────────────
1. Open       Welcome screen            Excited
2. Name       "Ananya"                  Easy ✓
3. Currency   INR                       Easy ✓
4. Categories Deselects everything except Food & Transport  Smart
5. Budgets    Leaves all 0             Skips — doesn't know her numbers yet
6. Finish     Taps "Get started"        Hopeful
7. Home       Empty state               Flat — no direction
8. Scan       Taps Scan tab             Curious
9. Camera     Alert: Camera vs Gallery  Minor friction
10. Receipt   Scans canteen bill        Excited
11. Review    Sees "IITM Canteen"       Delighted
              3 items detected
12. Category  Auto = Groceries          Wrong — should be Food
13. Fix       Changes to Food           Minor friction
14. Save      Saves                     Satisfied
15. Home      No toast/confirmation     Flat
16. Return    Checks tomorrow           Good habit started ✓
```

**Key insight:** The category auto-guess is wrong for canteen/restaurant receipts (guesses Groceries when it should be Food/Dining). This is the same `pots.find(/grocer/i)` bug for both paths — a one-line fix that improves this journey significantly.

---

## Journey 7: Power User — Weekly Grocery Price Tracking

**Persona:** Sunita, 45, homemaker, scans receipts every week and wants to track vegetable prices.  
**Goal:** Compare onion prices over the last 3 months.

```
Step          Action                    Emotion      Friction
──────────────────────────────────────────────────────────────────────────────
1. Open       Open app                  Focused      None
2. Navigate   Trends → Track items      OK           Two taps, slightly buried
3. Items list Sees list of tracked items Oriented    Good — item list shows avg price ✓
4. Search     Tries to find "Onion"     Blocked      No search on Items screen
5. Scroll     Scrolls to find Onion     Minor        Fine if small list
6. Tap        Taps Onion → ItemTrend    Satisfied    Chart shows price over time ✓
7. Chart      Sees 3-month price line   Delighted    ✓ — this is excellent
8. Alert      Wishes she could set an alert Frustrated No alert feature
9. Back       Returns to Items          Fine         None
10. Compare   Wants to compare Onion vs Tomato Blocked No multi-item comparison
```

**What works:** ItemTrend chart is a genuinely excellent feature.  
**Pain points:** Steps 4, 8, 10.  
**Improvements:**
- Add search to Items list.
- Add price alert setup from ItemTrend.
- Add multi-item comparison (select 2–3 items, overlay lines on one chart).

---

## Summary: Friction Hotspots Across All Journeys

| Friction Point | Journeys Affected | Priority |
|---|---|---|
| No merchant autocomplete | 2, 6 | P0 |
| Date field requires ISO format | 3, 6 | P0 |
| No search in AllExpenses or Items | 4, 7 | P0 |
| No date range filter | 4 | P0 |
| Category auto-guess bug (same logic for produce/non-produce) | 3, 6 | P0 |
| Empty state after onboarding has no guidance | 1, 6 | P1 |
| Add screen Save is a small header link | 1, 2 | P1 |
| Alert after Scan save (should be toast) | 3, 6 | P1 |
| Long-press as only edit action on Subs | 5 | P1 |
| No renewal date on subscriptions | 5 | P1 |
| Mood picker mandatory on every entry | 2 | P1 |
| No swipe-to-delete on items | 3 | P2 |
| No celebration on first expense | 1 | P2 |
| No price alert from ItemTrend | 7 | P2 |
| PotDetail has no chart (just list) | 4 | P2 |
