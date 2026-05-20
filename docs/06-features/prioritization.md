# Feature Prioritization Matrix — Drift

> Scoring dimensions: User Impact (1–5), Frequency of Use (1–5), Technical Risk (1=low, 5=high),
> Effort Days (estimated), Dependencies Met (Y/N for Sprint 1 start)

---

## Scoring Methodology

**Impact Score** = (User Impact × 2 + Frequency × 1.5) / 3.5  
**Effort Score** = 1 + (Effort_Days / 10)  
**Priority Score** = Impact Score / (Effort Score × Technical Risk^0.5)

Higher score = higher priority.

---

## Master Prioritization Table

| ID | Feature | User Impact (1–5) | Freq (1–5) | Tech Risk (1–5) | Effort (days) | Priority Score | Category |
|----|---------|:-----------------:|:----------:|:---------------:|:-------------:|:--------------:|---------|
| F-17 | Schema Migration System | 5 | 5 | 1 | 1 | **9.64** | Power User |
| F-01 | Full-Text Search | 5 | 5 | 1 | 2 | **7.86** | Critical |
| F-03 | Payment Method Tracking | 5 | 5 | 1 | 2 | **7.86** | Critical |
| F-07 | Data Export (CSV/PDF/JSON) | 5 | 3 | 1 | 3 | **6.43** | High ROI |
| F-02 | Advanced Multi-Dimension Filters | 5 | 4 | 2 | 3 | **5.71** | Critical |
| F-25 | Receipt Image Viewer | 4 | 4 | 1 | 2 | **5.71** | Advanced |
| F-09 | Merchant Analytics | 4 | 4 | 1 | 3 | **5.00** | High ROI |
| F-08 | Batch Operations | 4 | 3 | 1 | 3 | **4.76** | High ROI |
| F-28 | Predictive Input (Merchant Suggest) | 4 | 5 | 1 | 3 | **4.76** | Experimental |
| F-11 | Recurring Expense Detection | 4 | 4 | 2 | 3 | **3.97** | High ROI |
| F-12 | Tags / Custom Labels | 4 | 4 | 1 | 4 | **3.93** | High ROI |
| F-10 | Subscription Calendar + Alerts | 4 | 4 | 2 | 4 | **3.57** | High ROI |
| F-13 | GST Invoice Persistence | 4 | 3 | 1 | 3 | **4.29** | High ROI |
| F-30 | Smart Merchant Auto-Category | 4 | 5 | 2 | 4 | **3.57** | Experimental |
| F-20 | Calendar View | 4 | 4 | 2 | 4 | **3.57** | Power User |
| F-04 | Income Tracking | 5 | 3 | 2 | 5 | **3.57** | Critical |
| F-05 | Push Notifications + Budget Alerts | 5 | 4 | 2 | 5 | **3.57** | Critical |
| F-21 | Rollover Budgets + Alerts | 3 | 3 | 2 | 4 | **2.68** | Power User |
| F-26 | Savings Rate / Cash Flow | 4 | 3 | 1 | 2 | **5.36** | Advanced |
| F-14 | EMI Tracking | 4 | 3 | 3 | 7 | **2.38** | Power User |
| F-16 | Fuel & Vehicle Tracking | 3 | 3 | 2 | 6 | **1.88** | Power User |
| F-19 | Item Price Alerts | 3 | 3 | 1 | 4 | **2.68** | Power User |
| F-06 | UPI / Bank SMS Auto-Import | 5 | 5 | 5 | 14 | **1.43** | High ROI |
| F-15 | Credit Card Statement Import | 4 | 3 | 4 | 10 | **1.54** | Power User |
| F-22 | Split Expenses | 3 | 2 | 3 | 8 | **1.19** | Power User |
| F-18 | Pantry / Inventory Tracking | 3 | 3 | 3 | 10 | **1.19** | Power User |
| F-24 | Utility Bill Unit-Rate Tracking | 3 | 3 | 2 | 7 | **1.61** | Advanced |
| F-23 | FASTag Import | 2 | 3 | 4 | 8 | **0.71** | Advanced |
| F-27 | Loan / Mortgage Tracking | 4 | 2 | 4 | 10 | **1.19** | Advanced |
| F-29 | Anomaly Detection | 3 | 2 | 4 | 14 | **0.54** | Experimental |
| F-31 | Price Prediction / Shopping Intelligence | 3 | 2 | 5 | 21 | **0.38** | Experimental |
| F-32 | Proper Carbon Footprint | 2 | 3 | 3 | 10 | **0.63** | Experimental |

---

## Value vs. Effort Quadrant

```
HIGH IMPACT
     │
     │  F-17  F-01  F-03   │  F-04   F-06
     │  F-07  F-02  F-25   │  F-05   F-15
     │  F-09  F-08  F-13   │  F-14
  ───┼──────────────────────┼──────────────────
     │  F-12  F-11  F-28   │  F-22   F-18
     │  F-10  F-20  F-26   │  F-23   F-27
     │  F-21  F-30         │  F-29   F-31
     │                      │  F-32
     │
LOW IMPACT
          SHORT EFFORT            LONG EFFORT
                    (crossover ~5 days)
```

**Top-left quadrant (Quick Wins)**: F-17, F-01, F-03, F-07, F-25, F-09, F-08, F-13, F-12, F-28, F-26  
**Top-right quadrant (Major Bets)**: F-04, F-05, F-06, F-15, F-14  
**Bottom-left quadrant (Fill-ins)**: F-11, F-10, F-20, F-21, F-30  
**Bottom-right quadrant (Defer)**: F-22, F-18, F-23, F-27, F-29, F-31, F-32

---

## India-Specific Priority Overlay

The following features have **elevated priority** specifically for the Indian market (UPI-first, GST-registered businesses, joint-family finances, volatile food prices):

| Feature | India Reason |
|---------|-------------|
| F-06 (UPI SMS Import) | UPI is >70% of all consumer transactions in India; manual entry is the #1 app killer |
| F-13 (GST Handling) | Every business purchase has GST; freelancers need ITC tracking |
| F-16 (Fuel Tracking) | 2-wheelers + 4-wheelers dominate household transport expense |
| F-23 (FASTag) | Mandatory for highway travel; ₹200–800/month for frequent commuters |
| F-14 (EMI) | 60%+ of urban Indian households have at least one active EMI |
| F-30 (Merchant Auto-Category) | Indian merchant names are highly diverse; manual categorization is friction |

---

## Dependency Graph

```
F-17 (migrations)
  └─ F-03 (payment method)
       └─ F-06 (SMS import) ─── needs F-03
       └─ F-09 (merchant analytics)
            └─ F-30 (auto-category)
            └─ F-28 (predictive input)
  └─ F-04 (income)
       └─ F-26 (cash flow)
  └─ F-13 (GST fields)
  └─ F-14 (EMI)
       └─ F-27 (loan/mortgage)
  └─ F-21 (rollover budgets)
  └─ F-12 (tags)

F-01 (search)
  └─ F-02 (advanced filters) ─── enhanced by search

F-05 (notifications)
  └─ F-10 (subscription alerts)
  └─ F-19 (price alerts)
  └─ F-21 (budget alerts)
  └─ F-18 (pantry low-stock)

F-16 (fuel/vehicle)
  └─ F-23 (FASTag)

F-04 (income)
  └─ F-26 (cash flow/savings rate)

F-14 (EMI)
  └─ F-27 (loan tracking)

F-18 (pantry)
  └─ F-31 (price prediction)

F-09 (merchant analytics)
  └─ F-15 (statement import — merchant reconciliation)
```

---

## Feature Flags / Complexity Tiers

### Tier A — Ship in 2 weeks (solo developer)
F-17, F-01, F-03, F-25, F-07, F-08

### Tier B — Ship in 4–6 weeks
F-02, F-09, F-13, F-12, F-26 (after F-04), F-28, F-30

### Tier C — Ship in 2–3 months
F-04, F-05, F-11, F-10, F-20, F-19, F-21, F-14, F-16

### Tier D — Ship in 3–6 months
F-06, F-15, F-18, F-22, F-24

### Tier E — Long-term / Spike first
F-23, F-27, F-29, F-31, F-32

---

## Revenue / Monetization Alignment

If a freemium model is considered, feature placement by tier:

| Tier | Features |
|------|---------|
| **Free** | F-01 (search), F-03 (payment method), F-07 (CSV export), F-17 (migrations), F-25 (receipt viewer), F-08 (batch), F-12 (tags) |
| **Pro** | F-04 (income), F-05 (notifications), F-06 (SMS import), F-10 (sub calendar), F-13 (GST), F-14 (EMI), F-15 (statement import), F-16 (fuel), F-19 (price alerts), F-21 (rollover budgets), F-22 (splits) |
| **Premium** | F-18 (pantry), F-23 (FASTag), F-27 (loan), F-29 (anomaly), F-31 (price prediction), F-32 (carbon) |
