// Pure functions. Each checker takes its input slice + the relevant settings
// and returns a plan: an array of {dedupe_key, kind, title, body, payload,
// schedule:{type:'now'|'at', date?}} entries. The context layer turns each plan
// item into (a) a notification_log row via repo.log() and (b) a scheduler call.
//
// Pure-function discipline means these are trivial to unit-test from a Node
// validation harness without spinning up React Native.

const BUDGET_BANDS = [
  { pct: 0.80, label: '80%' },
  { pct: 1.00, label: '100%' },
];

// PS-41 — per-channel gate. A channel fires only when BOTH the master
// `notifications_enabled` and its own channel flag are on. The master ANDs over
// the channels. Missing/undefined flags resolve to ON so pre-v51 settings
// objects (and the maintenance job's cached settings) keep current behaviour.
const chOn = (v) => (v == null ? true : !!v);

function currentMonthKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function fmtAmount(n, sym = '₹') {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

// Pots are the joined category+spent rows from ExpensesProvider. A pot crosses
// a band when (spent / budget) >= band.pct AND budget > 0. We emit one plan
// item per (pot, band) and let the dedupe index in notification_log gate
// repeat fires.
export function evaluateBudgetThresholds({ pots, settings, monthKey = currentMonthKey(), sym = '₹' }) {
  if (!settings?.notifications_enabled) return [];
  if (!chOn(settings?.notif_budget_enabled)) return [];   // PS-41
  const threshold = Number(settings?.notif_budget_threshold) || 0.8;
  // Only fire bands AT or ABOVE the user's chosen threshold. The 100% band
  // always fires when crossed (regardless of threshold) since that's the
  // "over budget" alarm.
  const activeBands = BUDGET_BANDS.filter(b => b.pct >= Math.min(threshold, 1.0));
  const out = [];
  for (const pot of (pots || [])) {
    const budget = Number(pot.budget) || 0;
    const spent = Number(pot.spend ?? pot.spent ?? 0);
    if (budget <= 0) continue;
    const ratio = spent / budget;
    for (const band of activeBands) {
      if (ratio < band.pct) continue;
      const dedupe_key = `budget:${monthKey}:${pot.id}:${band.label}`;
      const overUnder = band.pct >= 1.0 ? 'over budget' : `past ${band.label} of budget`;
      out.push({
        dedupe_key,
        kind: 'budget_threshold',
        title: `${pot.name || pot.label || 'Category'} ${overUnder}`,
        body: `${fmtAmount(spent, sym)} of ${fmtAmount(budget, sym)} spent this month.`,
        payload: { category_id: pot.id, month_key: monthKey, band: band.label, spent, budget },
        schedule: { type: 'now' },
      });
    }
  }
  return out;
}

function atLocal0900(dateStr, leadDays) {
  // dateStr is YYYY-MM-DD (subscriptions.next_bill format). We schedule for
  // 09:00 local on (next_bill - leadDays).
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(due.getTime())) return null;
  const trigger = new Date(due.getTime() - leadDays * 24 * 60 * 60 * 1000);
  trigger.setHours(9, 0, 0, 0);
  return trigger;
}

// Subs are the rows from useSubs().subs. We schedule one notification per
// non-cancelled, non-deleted sub with a non-null next_bill, set
// `notif_sub_lead_days` before the due date at 09:00 local. Schedule items
// whose trigger is in the past are skipped (no late-fire).
export function evaluateSubsDue({ subs, settings, now = new Date(), sym = '₹' }) {
  if (!settings?.notifications_enabled) return [];
  if (!chOn(settings?.notif_sub_enabled)) return [];      // PS-41
  const leadDays = Number(settings?.notif_sub_lead_days);
  if (!Number.isFinite(leadDays) || leadDays <= 0) return [];
  const out = [];
  for (const sub of (subs || [])) {
    if (sub.cancelled) continue;
    if (sub.deleted_at) continue;
    if (!sub.next_bill) continue;
    const trigger = atLocal0900(sub.next_bill, leadDays);
    if (!trigger || trigger.getTime() <= now.getTime()) continue;
    const dedupe_key = `sub:${sub.id}:${sub.next_bill}`;
    const leadLabel = leadDays === 1 ? 'tomorrow' : `in ${leadDays} days`;
    out.push({
      dedupe_key,
      kind: 'sub_due',
      title: `${sub.name} due ${leadLabel}`,
      body: `${fmtAmount(sub.amount, sym)} billed on ${sub.next_bill}.`,
      payload: { sub_id: sub.id, next_bill: sub.next_bill, lead_days: leadDays },
      schedule: { type: 'at', date: trigger, identifier: `sub:${sub.id}` },
    });
  }
  return out;
}

function formatDateLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 7.8 — Price alerts checker.
//
// Event-driven: NotificationsProvider invokes this when a PRICE_OBSERVATIONS
// event fires (emitted by ExpensesProvider.addExpenseWithItems with the
// just-scanned items' normalized_name + scanned_price). For each observation
// we look up a live, enabled alert by normalized_name and emit a plan if EITHER:
//   - alert.ceiling_price !== null AND scanned_price > ceiling_price, OR
//   - alert.jump_pct !== null AND baseline_price > 0
//                              AND scanned_price > baseline_price * (1 + jump_pct/100)
//
// Dedupe key embeds the local YMD so a re-scan of the same item the same day
// can't double-fire; tomorrow's scan re-arms. The `alert_id` is stashed on the
// payload so the provider can call priceAlertsRepo.markFired AFTER repo.log()
// confirms a non-deduped row landed (markFired slides baseline_price forward
// so subsequent jumps measure from this new peak).
export function evaluatePriceAlerts({ observations, alerts, settings, now = new Date(), sym = '₹' }) {
  if (!settings?.notifications_enabled) return [];
  if (!chOn(settings?.notif_price_enabled)) return [];    // PS-41
  const obs = Array.isArray(observations) ? observations : [];
  if (!obs.length) return [];
  const alertList = Array.isArray(alerts) ? alerts : [];
  if (!alertList.length) return [];
  const byName = new Map();
  for (const a of alertList) {
    if (a.deleted_at) continue;
    if (!a.enabled) continue;
    byName.set(a.normalized_name, a);
  }
  const ymd = formatDateLocalYMD(now);
  const out = [];
  for (const o of obs) {
    const nn = o?.normalized_name;
    const price = Number(o?.scanned_price);
    if (!nn || !Number.isFinite(price) || price <= 0) continue;
    const alert = byName.get(nn);
    if (!alert) continue;

    let triggered = false;
    let reason = null;
    let thresholdValue = null;

    const ceiling = alert.ceiling_price == null ? null : Number(alert.ceiling_price);
    if (ceiling != null && Number.isFinite(ceiling) && price > ceiling) {
      triggered = true;
      reason = 'ceiling';
      thresholdValue = ceiling;
    }
    if (!triggered) {
      const pct = alert.jump_pct == null ? null : Number(alert.jump_pct);
      const baseline = alert.baseline_price == null ? null : Number(alert.baseline_price);
      if (pct != null && Number.isFinite(pct) && baseline != null && Number.isFinite(baseline) && baseline > 0) {
        const target = baseline * (1 + pct / 100);
        if (price > target) {
          triggered = true;
          reason = 'jump';
          thresholdValue = pct;
        }
      }
    }
    if (!triggered) continue;

    const dedupe_key = `price:${nn}:${ymd}`;
    const displayName = alert.display_name || nn;
    const title = reason === 'ceiling'
      ? `${displayName} price above ${fmtAmount(thresholdValue, sym)}`
      : `${displayName} price jumped +${Math.round(thresholdValue)}%`;
    const body = reason === 'ceiling'
      ? `Now ${fmtAmount(price, sym)} — over your ${fmtAmount(thresholdValue, sym)} ceiling.`
      : `Now ${fmtAmount(price, sym)} from ${fmtAmount(alert.baseline_price, sym)}.`;
    out.push({
      dedupe_key,
      kind: 'price_alert',
      title,
      body,
      payload: {
        alert_id: alert.id,
        normalized_name: nn,
        scanned_price: price,
        reason,
        threshold: thresholdValue,
        baseline_price: alert.baseline_price ?? null,
      },
      schedule: { type: 'now' },
    });
  }
  return out;
}

// ISO-8601 week key in the form 'YYYY-Www'. Used by 7.7 to dedupe pantry
// low-stock fires to one per item per week — a row that's been low for days
// shouldn't re-fire on every expense save.
function currentWeekKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Thursday of the current week determines the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function fmtPantryQty(n, unit) {
  const v = Number(n) || 0;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  return `${s} ${unit || ''}`.trim();
}

// PS-11 — Insurance renewal reminder.
//
// One scheduled notification per live policy with a non-null `next_due`,
// fired at 09:00 local on (next_due - lead_days). Dedupe key embeds the
// due date so renewing a policy (which advances next_due) re-arms a fresh
// notification. Lead days reuses `notif_sub_lead_days` (the same setting
// that drives subscription reminders) — both are "upcoming bill" reminders
// so a single user-tunable lead value makes sense.
export function evaluateInsuranceRenewals({ policies, settings, now = new Date(), sym = '₹' }) {
  if (!settings?.notifications_enabled) return [];
  // PS-41 — insurance renewals share the "sub" (upcoming-bill) channel, as they
  // already share `notif_sub_lead_days`.
  if (!chOn(settings?.notif_sub_enabled)) return [];
  const leadDays = Number(settings?.notif_sub_lead_days);
  if (!Number.isFinite(leadDays) || leadDays <= 0) return [];
  const out = [];
  for (const pol of (policies || [])) {
    if (pol.deleted_at) continue;
    if (!pol.next_due) continue;
    const trigger = atLocal0900(pol.next_due, leadDays);
    if (!trigger || trigger.getTime() <= now.getTime()) continue;
    const dedupe_key = `insurance:${pol.id}:${pol.next_due}`;
    const leadLabel = leadDays === 1 ? 'tomorrow' : `in ${leadDays} days`;
    out.push({
      dedupe_key,
      kind: 'insurance_renewal',
      title: `${pol.label} renews ${leadLabel}`,
      body: `${fmtAmount(pol.premium_amount, sym)} due ${pol.next_due}.`,
      payload: { policy_id: pol.id, next_due: pol.next_due, lead_days: leadDays },
      schedule: { type: 'at', date: trigger, identifier: `insurance:${pol.id}` },
    });
  }
  return out;
}

// PS-10 — Holdings NAV-update reminder.
//
// Fires once per (calendar month) when at least one live holding's
// `last_updated` is older than 25 days. A single notification covers the
// entire portfolio (not per-holding) so the user doesn't get spammed with
// one fire per fund. Dedupe key embeds YYYY-MM so next month re-arms.
//
// `holdings` is the array of decorated rows from useInvestments().holdings.
export function evaluateHoldingsNavReminder({ holdings, settings, now = new Date() }) {
  if (!settings?.notifications_enabled) return [];
  // PS-41 note: the NAV-staleness nudge is not one of the five per-channel
  // toggles, so it's gated by the master switch only (behaviour unchanged).
  const live = (holdings || []).filter(h => !h.deleted_at);
  if (live.length === 0) return [];
  const cutoff = now.getTime() - 25 * 24 * 60 * 60 * 1000;
  let stale = 0;
  for (const h of live) {
    if (!h.last_updated) { stale += 1; continue; }
    const t = Date.parse(h.last_updated);
    if (!Number.isFinite(t) || t < cutoff) stale += 1;
  }
  if (stale === 0) return [];
  const monthKey = currentMonthKey(now);
  return [{
    dedupe_key: `holdings:nav:${monthKey}`,
    kind: 'holdings_nav_stale',
    title: stale === 1 ? '1 holding needs a NAV refresh' : `${stale} holdings need NAV refresh`,
    body: `Tap to update market values so your net worth stays accurate.`,
    payload: { stale_count: stale, month_key: monthKey },
    schedule: { type: 'now' },
  }];
}

// PS-42 — Backup-staleness reminder.
//
// Fires once per calendar month when the last successful backup is older than
// `backup_reminder_days` (or there has never been a backup). One notification
// for the whole app; the dedupe key embeds YYYY-MM so it re-arms next month.
// `backup_reminder_days = 0` disables the nudge. Gated by the master switch
// only — backups aren't one of the five PS-41 per-channel toggles.
//
// NOTE: the v2 supplement described this as a maintenance task. It is instead a
// checker wired into NotificationsProvider (like every other reminder) so it
// reuses the notification_log dedupe + scheduler pipeline rather than bolting
// notification-posting onto the maintenance runner, which has none.
export function evaluateBackupReminder({ settings, now = new Date() }) {
  if (!settings?.notifications_enabled) return [];
  const days = Number(settings?.backup_reminder_days);
  const reminderDays = Number.isFinite(days) ? days : 30;
  if (reminderDays <= 0) return [];                       // 0 = disabled
  const last = settings?.last_backup_at ? Date.parse(settings.last_backup_at) : null;
  const cutoff = now.getTime() - reminderDays * 24 * 60 * 60 * 1000;
  const stale = last == null || !Number.isFinite(last) || last < cutoff;
  if (!stale) return [];
  const monthKey = currentMonthKey(now);
  return [{
    dedupe_key: `backup:${monthKey}`,
    kind: 'backup_reminder',
    title: 'Back up your data',
    body: last == null
      ? 'You haven’t made an encrypted backup yet. Tap to protect your data.'
      : `Your last backup was over ${reminderDays} days ago. Make a fresh encrypted backup.`,
    payload: { last_backup_at: settings?.last_backup_at || null, month_key: monthKey },
    schedule: { type: 'now' },
  }];
}

// 7.7 — Pantry low-stock checker.
//
// Fires once per (item, ISO week) when a live pantry row's current_qty is at
// or below its reorder_threshold AND the threshold is non-NULL and > 0.
// NULL thresholds are silently skipped — a fresh row never fires until the
// user opts in via EditPantryItem.
//
// Dedupe key embeds the week so the notification re-arms next week if the
// user still hasn't restocked, but doesn't spam on intra-week mutations.
export function evaluatePantryLowStock({ pantry, settings, now = new Date() }) {
  if (!settings?.notifications_enabled) return [];
  if (!chOn(settings?.notif_lowstock_enabled)) return [];  // PS-41
  const week = currentWeekKey(now);
  const out = [];
  for (const row of (pantry || [])) {
    if (row.deleted_at) continue;
    const threshold = row.reorder_threshold;
    if (threshold == null) continue;
    const tn = Number(threshold);
    if (!(tn > 0)) continue;
    const cur = Number(row.current_qty) || 0;
    if (cur > tn) continue;
    out.push({
      dedupe_key: `pantry:${row.normalized_name}:${week}`,
      kind: 'pantry_low_stock',
      title: `Low on ${row.display_name}`,
      body: `${fmtPantryQty(cur, row.canonical_unit)} left (threshold ${fmtPantryQty(tn, row.canonical_unit)}).`,
      payload: { pantry_id: row.id, normalized_name: row.normalized_name, week },
      schedule: { type: 'now' },
    });
  }
  return out;
}

// PS-29 — Subscription price-change alert.
//
// `drifts` is subscriptionDrift()'s output (subs whose last N linked charges
// average > threshold off the set price). Gated by the PRICE channel — a sub
// price change is a price alert in spirit. The dedupe key embeds the rounded
// charged price, so each new price *level* fires once; re-evaluating at the
// same price collides on the UNIQUE dedupe index and is skipped.
export function evaluateSubscriptionDrift({ drifts, settings, sym = '₹' }) {
  if (!settings?.notifications_enabled) return [];
  if (!chOn(settings?.notif_price_enabled)) return [];   // PS-41 price channel
  const out = [];
  for (const d of (drifts || [])) {
    if (!d || d.sub_id == null) continue;
    const up = d.delta_amount > 0;
    const pct = Math.round(Math.abs(d.delta_pct) * 100);
    const actualRounded = Math.round(d.actual_avg);
    out.push({
      dedupe_key: `subdrift:${d.sub_id}:${actualRounded}`,
      kind: 'sub_price_change',
      title: `${d.name} price ${up ? 'up' : 'down'} ${pct}%`,
      body: `Now averaging ${fmtAmount(d.actual_avg, sym)} vs your set ${fmtAmount(d.expected, sym)}.`,
      payload: { sub_id: d.sub_id, expected: d.expected, actual_avg: d.actual_avg, delta_pct: d.delta_pct },
      schedule: { type: 'now' },
    });
  }
  return out;
}

// PS-39 — Return-window closing reminder.
//
// One scheduled notification per still-returnable item, fired at 09:00 local
// on (return_by_date − 1 day). `items` is the returnableItems() result (each
// row carries id, name, merchant, return_by_date). Triggers already in the
// past are skipped (no late-fire). Dedupe key embeds the date so re-running on
// every scan can't double-schedule, while a re-stamped window re-arms.
//
// Gated by the deadline/"upcoming bill" channel (notif_sub_enabled, PS-41) —
// a return deadline is the same shape of reminder as a sub/insurance due date.
export function evaluateReturnWindows({ items, settings, now = new Date() }) {
  if (!settings?.notifications_enabled) return [];
  if (!chOn(settings?.notif_sub_enabled)) return [];      // PS-41 deadline channel
  const out = [];
  for (const it of (items || [])) {
    if (!it || !it.return_by_date) continue;
    const trigger = atLocal0900(it.return_by_date, 1);
    if (!trigger || trigger.getTime() <= now.getTime()) continue;
    const name = it.name ? String(it.name) : 'an item';
    const where = it.merchant ? ` from ${it.merchant}` : '';
    out.push({
      dedupe_key: `return:${it.id}:${it.return_by_date}`,
      kind: 'return_window',
      title: `Return window closing: ${name}`,
      body: `Last day to return ${name}${where} is ${it.return_by_date}.`,
      payload: { item_id: it.id, expense_id: it.expense_id ?? null, return_by_date: it.return_by_date },
      schedule: { type: 'at', date: trigger, identifier: `return:${it.id}` },
    });
  }
  return out;
}
