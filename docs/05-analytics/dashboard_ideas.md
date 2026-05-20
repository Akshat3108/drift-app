# Dashboard Ideas

Concrete screen-by-screen dashboard designs for advanced analytics in Drift.

---

## Dashboard 1: Analytics Hub (New Screen)

A dedicated analytics screen surfacing the most interesting cross-cutting insights. Accessed via the bottom nav or a card on Trends.

### Layout
```
┌─────────────────────────────────┐
│  Your money, clearly.           │
│  May 2026                       │
├─────────────────────────────────┤
│  VELOCITY                       │
│  ⚡ Spending 12% faster         │
│  ████░░░░  7d: ₹4,200           │
│  vs ₹3,750 last week            │
├─────────────────────────────────┤
│  INFLATION INDEX                │
│  📦 Personal basket +6.4% YoY  │
│  [Area chart, 12 months]        │
├─────────────────────────────────┤
│  LIFESTYLE DRIFT                │
│  📈 Dining crept up 3 quarters  │
│  🍽 Food: +28% QoQ              │
├─────────────────────────────────┤
│  SUBSCRIPTION LEAKAGE           │
│  🔴 22% of spend on subs        │
│  [Donut: useful / wasted]       │
├─────────────────────────────────┤
│  REORDER QUEUE                  │
│  🛒 3 items due this week       │
│  Toor Dal · Rice · Milk         │
└─────────────────────────────────┘
```

Each card is tappable → drills into the relevant detail screen.

---

## Dashboard 2: Enhanced Trends Screen

Replace the current Trends screen with a tabbed view:

### Tab: Overview (current + enhanced)
- 12-month bar chart (instead of 6) with year-over-year overlay toggle
- Category stack toggleable: absolute spend vs % share of wallet
- Month-delta badge extended: show 3-month moving average

### Tab: Heatmaps
```
┌─────────────────────────────────┐
│  Spending Heatmap               │
│  How you spend across time      │
├─────────────────────────────────┤
│  DAYS OF WEEK                   │
│  Sun  Mon  Tue  Wed  Thu  Fri  Sat
│  [░░] [██] [░█] [██] [░░] [███] [░░]
│  ₹420 ₹1.2k ₹800 ₹1.1k ₹580 ₹1.8k ₹650
├─────────────────────────────────┤
│  SEASONAL PATTERN               │
│  Jan Feb Mar Apr May Jun ...
│  [●] [●] [●] [●] [●] [●]       │
│  (circle area = avg spend)      │
├─────────────────────────────────┤
│  DAY OF MONTH                   │
│  1-5: 34% │ 6-15: 28% │ 16-31: 38%
│  [31-bar histogram]             │
└─────────────────────────────────┘
```

### Tab: Categories
- Category × Month budget variance grid
- Cells: green (under budget), amber (80-100%), red (over)
- Tap cell → drill into that category + month

### Tab: Comparison
- Year-over-year: grouped bars, 2025 vs 2026
- Category picker: compare any two categories side-by-side

---

## Dashboard 3: Merchant Intelligence Screen

New screen: `MerchantAnalytics.js` — accessible from Trends or a merchant name tap.

```
┌─────────────────────────────────┐
│  Where you shop                 │
├─────────────────────────────────┤
│  TOP MERCHANTS  (last 6 months) │
│  D-Mart          ₹24,200  22 visits │
│  ████████████████████░░         │
│  Swiggy          ₹18,400  34 visits │
│  ████████████████░░░░░░         │
│  Nature's Basket ₹12,100   8 visits │
│  ████████████░░░░░░░░░░         │
├─────────────────────────────────┤
│  AVG BASKET SIZE                │
│  D-Mart: ₹1,100  (groceries)   │
│  Swiggy: ₹541    (food)        │
├─────────────────────────────────┤
│  MERCHANT TREND                 │
│  [Tap a merchant to see monthly trend] │
└─────────────────────────────────┘
```

### Merchant Detail (drill-down)
Tap any merchant → `MerchantDetail` screen:
- Monthly spend at that merchant (12-month bar)
- Top items bought there (with unit prices)
- Cheapest items at this merchant vs their competition
- Visit frequency: "You visit every 9 days on average"

---

## Dashboard 4: Item Intelligence — Cheapest Merchant View

Extend `ItemTrend.js` with a new tab: "Where to Buy"

```
┌─────────────────────────────────┐
│  Toor Dal   ↑8% overall         │
│  Price │ Consumption │ Where to Buy
├─────────────────────────────────┤
│  WHERE TO BUY                   │
│                                 │
│  🥇 D-Mart         ₹82/kg      │
│  Avg ₹84 · 6 purchases          │
│  Save 32% vs worst              │
│                                 │
│  🥈 Reliance Smart ₹95/kg      │
│  Avg ₹97 · 3 purchases          │
│                                 │
│  🥉 Nature's Basket ₹121/kg   │
│  Avg ₹118 · 2 purchases         │
└─────────────────────────────────┘
```

---

## Dashboard 5: Inflation Index Screen

New screen: `InflationIndex.js`

```
┌─────────────────────────────────┐
│  Your personal inflation        │
│  Based on 12 tracked items      │
├─────────────────────────────────┤
│  BASKET INDEX                   │
│                                 │
│  May 2025 = 100                 │
│  May 2026 = 108.4               │
│  📈 +8.4% personal inflation    │
│                                 │
│  [Area chart, shaded from 100]  │
├─────────────────────────────────┤
│  TOP RISERS                     │
│  🥬 Spinach      +34%           │
│  🫙 Cooking Oil  +22%           │
│  🥛 Milk          +9%           │
├─────────────────────────────────┤
│  TOP FALLERS                    │
│  🍅 Tomatoes     -18%           │
│  🧅 Onions        -8%           │
└─────────────────────────────────┘
```

---

## Dashboard 6: Cashflow Forecast Screen

New screen: `Forecast.js` (see also `forecasting.md`)

```
┌─────────────────────────────────┐
│  Where you're headed            │
├─────────────────────────────────┤
│  MONTH-END FORECAST             │
│                                 │
│  Best case:    ₹28,400          │
│  Most likely:  ₹32,200 ← ▲    │
│  Worst case:   ₹36,800          │
│                                 │
│  Budget: ₹30,000                │
│  Risk: 62% chance over budget   │
├─────────────────────────────────┤
│  [Line chart: actual + 3 model  │
│   projections in different       │
│   colors with shaded cone]      │
├─────────────────────────────────┤
│  NEXT 3 MONTHS                  │
│  Jun: ₹31,400 est               │
│  Jul: ₹29,800 est               │
│  Aug: ₹33,200 est (Onam)        │
└─────────────────────────────────┘
```

---

## Dashboard 7: Reorder Queue Screen

New screen: `ReorderQueue.js` — surfaced from Items tab or a home card.

```
┌─────────────────────────────────┐
│  🛒 Due soon                    │
│  Based on your purchase pattern │
├─────────────────────────────────┤
│  OVERDUE                        │
│  🔴 Toor Dal       4 days late  │
│     Last: D-Mart · ₹82/kg       │
│     Avg: every 18 days          │
│                                 │
│  DUE IN 1-3 DAYS               │
│  🟠 Whole Milk     Due tomorrow │
│     Last: Reliance · ₹68/L      │
│                                 │
│  DUE THIS WEEK                 │
│  🟡 Basmati Rice   In 5 days   │
│  🟡 Olive Oil      In 6 days   │
├─────────────────────────────────┤
│  COMING SOON                   │
│  🟢 Eggs           In 12 days  │
│  🟢 Yogurt         In 14 days  │
└─────────────────────────────────┘
```

---

## Dashboard 8: Lifestyle Inflation Screen

New screen: `LifestyleInflation.js`

```
┌─────────────────────────────────┐
│  Lifestyle drift                │
│  Quarter-over-quarter trends    │
├─────────────────────────────────┤
│  RISING                         │
│  🍽 Dining Out    ↑28% (3 qtrs) │
│  🚕 Transport     ↑14% (2 qtrs) │
│  ☕ Cafes          ↑19% (4 qtrs) │
├─────────────────────────────────┤
│  STABLE                         │
│  🛒 Groceries      = 0%         │
│  💊 Health         +2%          │
├─────────────────────────────────┤
│  FALLING                        │
│  🎬 Entertainment ↓8% (2 qtrs)  │
├─────────────────────────────────┤
│  [Multi-line QoQ chart]         │
│  [One line per rising category] │
└─────────────────────────────────┘
```

---

## Dashboard 9: Sankey Flow Diagram

New visualization: `SpendingFlow.js` — shows money flowing from income/budget into categories.

```
Budget ──────┬──── 🛒 Groceries  ₹12,400
             ├──── 🍽 Dining     ₹8,200
             ├──── 🚕 Transport  ₹4,100
             ├──── ☕ Cafes      ₹2,800
             ├──── 💊 Health     ₹1,400
             └──── 🎬 Others     ₹3,100
```

Nodes: left = income/budget, right = categories. Width of flow = spend amount.  
Tap a flow → navigate to that category detail.

Implementation: Custom SVG using `react-native-svg`. Bezier curves for flows.

---

## Dashboard 10: Calendar Spend View

New screen: `SpendingCalendar.js` — monthly calendar view with spend intensity per day.

```
        May 2026
Mo Tu We Th Fr Sa Su
              1  2  3
 4  5  6  7  8  9 10
11 12 13 14 15 16 17
18 19 20 21 22 23 24
25 26 27 28 29 30 31
```

Each day cell is colored by spend amount:
- Empty day = white/light
- Light spend = light coral
- Heavy spend = deep coral/red

Tap a day → show that day's transactions in a bottom sheet.  
Below calendar: "Heaviest day: May 9 — ₹4,200 (grocery run)"

---

## Bottom Navigation Proposal

Add an "Analytics" tab alongside Home / Add / Items / Profile:

```
🏠 Home  |  📊 Trends  |  ➕ Add  |  🛒 Items  |  🔁 Subs
```

→

```
🏠 Home  |  📊 Analytics  |  ➕ Add  |  🛒 Items  |  🔁 Subs
```

`Analytics` tab = the Analytics Hub (Dashboard 1) as the landing screen, with sub-tabs or cards linking to all the advanced screens.
