# Drift — Quick Wins

> Companion to `execution_roadmap.md`
> Synthesis date: 2026-05-17
> Five top-20 lists across five lenses. Every win below is independently shippable in ≤ 2 days.

---

## How to Read This Document

Each section ranks the top 20 wins along one axis: easiest, highest ROI, UX, performance, analytics. Some items appear in multiple lists — that is signal that they should ship first. The same change can be a quick win, a UX win, and a performance win simultaneously; that intersection is where to start.

Effort key: **XS** = ≤ 1 hr · **S** = 1–4 hr · **M** = ½–1 day · **L** = 1–2 days

---

## Top 20 — EASIEST IMPROVEMENTS

Ordered by ratio of value to implementation cost. Anything in this list ships in a single PR with little risk.

| # | Change | Effort | File(s) | Win |
|---|---|---|---|---|
| 1 | Fix `getDB()` — reset `_opening = null` on open failure | XS | `db/index.js` | Eliminates frozen-app failure mode |
| 2 | Fix `ItemRows.js` module-level row key counter → `useRef` | XS | `components/ItemRows.js` | Eliminates hot-reload key collision |
| 3 | Fix Scan.js produce vs non-produce category guess (duplicated branch bug) | XS | `screens/Scan.js:66` | Fixes OCR category accuracy regression |
| 4 | Lift `formatShort`, `shorten`, `daysUntil` from Home.js → `core/utils/format.js` | S | `screens/Home.js` | Reduces Home.js complexity; shared util |
| 5 | Replace empty `catch {}` with `catch (e) { logError(...) }` | S | Home.js, Trends.js, others | Surfaces silent failures |
| 6 | Set image picker `quality: 1.0`, output PNG | XS | `screens/Scan.js`, `screens/Add.js`, `screens/EditExpense.js` | Sharper text for small fonts on receipts |
| 7 | Set SQLite PRAGMAs: WAL, NORMAL sync, MEMORY temp, 20MB cache, mmap 256MB | XS | `db/index.js` | 3–10× write throughput, reads don't block writes |
| 8 | Add `idx_items_expense` index on `receipt_items(expense_id)` | XS | `db/schema.js` | Cascade delete drops from O(N) to O(log N) |
| 9 | Remove `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE` permissions | XS | `AndroidManifest.xml` | Avoids Play Store sensitive-permission flags |
| 10 | Remove unused `@react-native-async-storage/async-storage` dependency | XS | `package.json` | Smaller bundle |
| 11 | Fix `[^a-z\s]` → `[^\p{L}\p{N}\s]u` in `normalizeName.js` | XS | `ocr/normalizeName.js` | Hindi product names no longer destroyed |
| 12 | Move `ocr/units.js` → `core/domain/units.js`; update 5 imports | S | `core/domain/units.js` | Fixes db→ocr coupling |
| 13 | Replace `Alert.alert("Saved!")` on Scan save → inline toast | S | `screens/Scan.js:135` | Non-interruptive feedback |
| 14 | Replace `Alert.alert` on Subs cancel → inline confirm panel | S | `screens/Subs.js:14` | Less disruptive |
| 15 | Move `Add` screen to `presentation: 'modal'` in nav stack | S | `navigation/index.js` | Preserves background context |
| 16 | Replace ISO date `TextInput` in Scan review with date picker | S | `screens/Scan.js` | Non-engineers can use the date field |
| 17 | Add `React.memo` on `CustomTabBar`, `ProgressBar`, `Toggle`, `MoodPicker` | S | `components/UI.js`, `navigation/index.js` | Stops unrelated re-renders |
| 18 | Show "Save" as a bottom CTA button on Add screen, not a header text link | S | `screens/Add.js` | Primary action gets primary visual weight |
| 19 | Add `idx_exp_cat_date` composite index `(category_id, expense_date DESC)` | XS | `db/schema.js` | summaryByCategory drops from full scan to index range |
| 20 | Wrap each feature screen in an `ErrorBoundary` | M | `App.js`, screens | Prevents full-app crashes |

**Combined effort: ~3 developer-days.** This batch is what to ship in a single "stabilization" sprint before any feature work.

---

## Top 20 — HIGHEST ROI IMPROVEMENTS

Ordered by user value × frequency-of-impact ÷ effort. These are the changes that move retention and satisfaction the most.

| # | Change | Effort | Why it's high ROI |
|---|---|---|---|
| 1 | **Merchant autocomplete from history** | M | Saves ~5 sec per repeat-merchant entry; affects 80% of daily entries |
| 2 | **FTS5 search across expenses/items/subs** | M | Becomes essential at 100+ expenses; unanswered "where did X go" |
| 3 | **Schema migration system** | XS | Unblocks every subsequent schema-touching feature |
| 4 | **Hindi/regional synonym dictionary in `normalizeName`** | S | Recovers ~30% of currently-corrupted Indian receipts |
| 5 | **Payment method tracking** | S | Unblocks payment-method analytics + filtering |
| 6 | **Add screen merchant autofill (predictive amount + category)** | M | Halves Add taps for repeat merchants |
| 7 | **ML Kit v2 upgrade + Devanagari model** | M | Unlocks Hindi script support for kirana receipts |
| 8 | **CSV/JSON export** | M | Trust feature; data portability mandatory |
| 9 | **Permanent receipt image storage (copy to documentDirectory)** | M | Stops silent receipt loss |
| 10 | **Receipt image viewer modal on Detail** | S | Closes the "stored but unviewable" gap |
| 11 | **Personal inflation basket index** | M | Differentiator — no Indian app has it |
| 12 | **5-model cashflow forecast** | L | Replaces wildly inaccurate linear extrapolation |
| 13 | **Reorder queue (item due predictions)** | M | Actionable — "buy milk Tuesday" |
| 14 | **Date range filter on AllExpenses** | M | Lets users review historical months |
| 15 | **Multi-dimension filter sheet (date, amount, payment, merchant, mood)** | M | Power-user productivity unlock |
| 16 | **Income tracking + savings rate widget** | M | Unlocks the most-asked metric in personal finance |
| 17 | **Subscription calendar + 3-day reminder notification** | M | Activates the inert `next_bill` field |
| 18 | **Auto-merchant-to-category map (~1k bundled entries)** | M | New-user friction reduction |
| 19 | **Pull-to-refresh on Home + AllExpenses** | S | Eliminates "data feels stale" confusion |
| 20 | **Swipe-to-delete on AllExpenses with undo toast** | M | Replaces 2-step alert dialog with 1-step gesture |

**Combined effort: ~25 developer-days.** Ship across Phases 4A and 5. Together these account for ~70% of perceived product improvement.

---

## Top 20 — UX WINS

Ordered by friction reduction in daily flows. Most come directly from the user journey analysis (`07-ux/user_journeys.md`).

| # | Change | Effort | Affects journey |
|---|---|---|---|
| 1 | Merchant autocomplete from history | M | Daily logging (Aryan, Meera) |
| 2 | Replace ISO date `TextInput` with date picker on Scan review | S | Receipt scan (Meera, Ananya) |
| 3 | Toast instead of `Alert.alert` after Scan save | XS | Receipt scan (Meera) |
| 4 | Add screen opens as modal sheet, not tab | S | Daily logging (Aryan) |
| 5 | Save button as bottom CTA, not header text link | XS | First-time + daily (Priya, Aryan) |
| 6 | Auto-select last-used category on Add | XS | Daily logging |
| 7 | Make mood picker collapsible / optional | S | Daily logging (Aryan, Priya) |
| 8 | Pull-to-refresh on Home and AllExpenses | S | All journeys |
| 9 | Swipe-to-delete on AllExpenses, Subs, item rows | S | Power user (Aryan, Karan) |
| 10 | Long-press to enter multi-select on AllExpenses | M | Power user |
| 11 | Undo snackbar on delete (replaces Alert confirmation) | M | All journeys |
| 12 | Header search icon on Home + Insights | S | Monthly review (Rishi), grocery tracking (Sunita) |
| 13 | Date range / month selector on Home | S | Monthly review (Rishi) |
| 14 | Day-0 orientation screen after onboarding | M | First-time (Priya, Ananya) |
| 15 | First-expense celebration / confetti | XS | First-time (Priya) |
| 16 | Edit button on Subs row (not long-press only) | XS | Sub audit (Karan) |
| 17 | "Mark as cancelled (reminder only)" label instead of "Cancel all" | XS | Sub audit (Karan) |
| 18 | Sort options on Subs list (by amount, by status) | S | Sub audit (Karan) |
| 19 | Search input on Items list | S | Grocery tracking (Sunita) |
| 20 | Price alert setup from ItemTrend ("alert me if onion > ₹80/kg") | M | Grocery tracking (Sunita) |

**Combined effort: ~15 developer-days.** These compound — fixing item 1 (merchant autocomplete) alone moves Drift from acceptable to genuinely fast for power users.

### Accessibility Sub-list (4 fast wins not in the top 20 above)

| # | Change | Effort |
|---|---|---|
| A1 | Add `accessibilityLabel` to every TouchableOpacity (emoji-only buttons) | M |
| A2 | Audit light + dark contrast ratios; fix `F.ink3` on `F.cream` (3.2:1 → 4.5:1) | S |
| A3 | Add pattern/icon backup for over/under-budget signaling (not color-only) | S |
| A4 | Enforce minimum 44px touch targets on all pill buttons | S |

---

## Top 20 — PERFORMANCE WINS

Ordered by visible impact at current and projected scale. Numbers below assume a synthetic 50k-expense dataset.

| # | Change | Effort | Win |
|---|---|---|---|
| 1 | `PRAGMA journal_mode=WAL` + tuned PRAGMAs | XS | Writes commit ~1ms instead of ~10ms; reads stop blocking writes |
| 2 | `idx_items_expense` index on `receipt_items(expense_id)` | XS | Delete expense at 500k items drops 500ms → < 5ms |
| 3 | Fix `summary` `useMemo` to call SQL aggregate, not iterate JS array | S | Removes O(n) scan on every mutation |
| 4 | Stop refreshing entire context on every mutation; optimistic patch instead | M | Mutation UI freeze drops from ~300ms+ to imperceptible |
| 5 | Add generated `month_key` column + `idx_exp_month`, `idx_exp_month_cat` | S | Replaces `substr()` full-table scan with index range scan |
| 6 | Add composite `idx_exp_cat_date` for `summaryByCategory` | XS | Per-category month query drops from full scan to bounded range |
| 7 | Range predicate refactor: `substr(...)='YYYY-MM'` → `date >= ? AND date < ?` | M | Indexes become usable in all 3 affected queries |
| 8 | Eliminate N+1 in `items.trackedItems()` via window function CTE | M | 1k items: 5s freeze → < 100ms |
| 9 | Eliminate N+1 in `trips.listWithCategories()` via LEFT JOIN | XS | Refresh latency drops linearly with trip count |
| 10 | Eliminate correlated subqueries in `items.suggest()` via `FIRST_VALUE` OVER | S | Autocomplete keystroke latency drops 3N+1 → 1 query |
| 11 | Migrate `AllExpenses` to `SectionList` with `getItemLayout` | M | Bounded memory regardless of dataset size; smooth scroll at 10k+ rows |
| 12 | Migrate `PotDetail`, `Items`, `ItemTrend`, `Trends`, `Subs` to `FlatList` | M | Same as above for the other long lists |
| 13 | `React.memo` on every list row component | S | Stops re-render cascades from parent state |
| 14 | Use `expo-image` instead of `<Image>` with `recyclingKey={uri}` | S | Faster decode, lower memory in image lists |
| 15 | OCR parse in chunks: `setImmediate` between header/items/footer/confidence stages | M | Scan UI jank during parse drops 1–3s → imperceptible |
| 16 | Build `monthly_summary` + `item_summary` rollup tables maintained by triggers | M | Home renders from single-row reads instead of 500-row scans |
| 17 | Daily maintenance: `PRAGMA optimize`, `ANALYZE`, `VACUUM` | M | DB stays small + queries stay fast after years of deletes |
| 18 | Lazy-load Items spark history via `onViewableItemsChanged` (post-FlatList) | S | Initial Items render drops to top-N visible rows only |
| 19 | Cache `streakDays()` result for session; invalidate on expense mutation | S | Home re-render no longer recomputes streak each time |
| 20 | Query cache layer (`useQuery`) with staleTime + tag invalidation | L | Navigation Home → Trends → Home: 70%+ cache hit |

**Combined effort: ~12 developer-days.** Items 1–10 are pure SQL/index changes; ship them in a single "performance pass" PR. Items 11–14 are the FlatList migration; ship in a separate PR. The rest are individual unlocks.

### Performance targets after this batch

| Operation | Today (50k rows) | After batch | After Phase 8 |
|---|---|---|---|
| App cold start | ~1.5s | ~400ms | ~200ms |
| Add expense → see in list | ~300ms freeze | < 50ms | < 50ms |
| Home render | 200–500ms | < 100ms | < 80ms |
| Trends render | 500ms+ | < 100ms | < 80ms |
| AllExpenses scroll | janks past 200 rows | smooth | smooth |
| Items tab open | 1–5s freeze | < 100ms | < 100ms |
| Scan parse | 1–3s freeze | imperceptible | imperceptible |
| Cascade delete (1 expense, 50 items) | ~50ms | < 5ms | < 5ms |

---

## Top 20 — ANALYTICS WINS

Ordered by user "wow" factor and unlock potential. Every item below is computable from existing schema + receipt data.

| # | Analytic | Effort | What it surfaces |
|---|---|---|---|
| 1 | **Personal inflation basket index** | M | "Your personal inflation: +8.2% YoY" with line chart |
| 2 | **Reorder queue** | S | "Due soon: Toor Dal, Rice, Milk" — actionable shopping list |
| 3 | **Cheapest merchant per item** | S | "Save 32% — D-Mart vs Nature's Basket on Toor Dal" |
| 4 | **Spending velocity** (rolling 7-day slope) | S | "⚡ Spending 12% faster this week" |
| 5 | **Category × month variance heatmap** | M | Color-grid showing budget adherence per category per month |
| 6 | **Lifestyle inflation per category (QoQ drift)** | M | "🍽 Dining crept up 28% across 3 quarters" |
| 7 | **5-model cashflow forecast with confidence cone** | L | "Best ₹28k / Likely ₹32k / Worst ₹37k — 62% chance over budget" |
| 8 | **Subscription leakage score** | S | "🔴 22% of spend goes to subs; ₹820/mo potentially wasted" |
| 9 | **Day-of-week heatmap** | S | 7-cell strip showing weekend vs weekday |
| 10 | **Seasonal calendar (12-cell month ring)** | S | "You spend most in November (Diwali)" |
| 11 | **Day-of-month histogram** | S | "You spend 34% of budget in the first 5 days" |
| 12 | **Year-over-year monthly comparison** | XS | 2025 vs 2026 grouped bar chart |
| 13 | **Top merchants leaderboard** | S | Top 10 merchants by spend, count, avg basket |
| 14 | **Spending calendar view** (date-cell intensity) | M | Calendar-shaped heat overlay; tap day → expense list |
| 15 | **Mood × spend correlation** | S | "You spend 2.3× more when 😔" |
| 16 | **Anomaly detection (Z-score)** | S | "⚠️ March 15 was 3.2× your normal day" |
| 17 | **Net worth trajectory** (needs `account_snapshots`) | M | Area line chart over time |
| 18 | **Repeat purchase interval** | S | "Toor Dal — every 18 days on avg" |
| 19 | **Top price movers dashboard (not just produce)** | XS | All items with > 5% price change in last 30 days |
| 20 | **Multi-item compare on ItemTrend** (overlay 2–3 price lines) | M | Compare Onion vs Tomato in one chart |

**Combined effort: ~15 developer-days.** All 20 are entirely offline, computed from existing data. The analytics moat materializes from this batch.

### Why these are high-impact

The app already captures every required input — item-level prices, dates, merchants, categories, moods. The differentiator is that nobody has surfaced this data yet. Each item above turns *capture* into *intelligence*. Personal inflation index alone is something neither Walnut, Money Manager, nor ETMONEY ships — and it's a 2-day implementation.

---

## Aggregated "Ship This Week" Set

If you have one developer for one week (5 working days), here's the ranked list of what to land first. Each line is an item from one of the lists above; chosen for ratio of multi-list-appearance × low effort.

| Day | Items |
|---|---|
| Day 1 | Easiest #1, #2, #3, #6, #7, #8, #9, #10, #11 |
| Day 2 | Easiest #4, #5, #12, #13, #14, #15 |
| Day 3 | Easiest #16, #17, #18, #19, #20 |
| Day 4 | Performance #3, #4, #6, #9, #10 |
| Day 5 | UX #6, #7, #8, #9, #15, #17 |

This week alone produces:
- A release-eligible APK (signing config / permissions / minification)
- WAL + missing indexes (writes 3–10× faster, cascade deletes O(log N))
- Error boundaries + logged errors (no more silent failures)
- Hindi names preserved (Unicode-safe normalization)
- Sharper OCR input (PNG, quality 1.0)
- A modal Add screen, a date picker on Scan, a toast instead of Alert
- The 500-row cap fixed
- React.memo discipline on UI primitives

**Combined: a substantially more correct, faster, polished app — in five days, no schema migrations required for most of these.**
