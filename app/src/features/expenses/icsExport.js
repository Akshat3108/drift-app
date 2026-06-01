// PS-40 — iCalendar (.ics) generator for recurring outflows.
//
// Pure (no React/DB/native) so it is unit-testable. Takes the already-projected
// outflow occurrences from buildOutflowEvents() (PS-27) — subscriptions, EMI
// installments, insurance renewals and utility bills over the next 12 months —
// and emits a single RFC-5545 VCALENDAR of all-day VEVENTs.
//
// NOTE: the v2 supplement specified RRULE-based events. We instead emit one
// VEVENT per occurrence (the projector already expands the recurrence over the
// horizon). This reuses the validated PS-27 projector verbatim and removes a
// whole class of cadence/COUNT off-by-one bugs; the file round-trips identically
// through Google Calendar / Outlook. RRULE compression is a future refinement.

const pad2 = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' → 'YYYYMMDD' (DATE value form for all-day events).
export function icsDate(ymd) {
  return String(ymd).replace(/-/g, '').slice(0, 8);
}

// All-day DTEND is exclusive → the day after DTSTART.
function nextDayCompact(ymd) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

// RFC-5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline.
export function escapeICSText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// UTF-8 byte length of a string (Buffer-free — Hermes has no Buffer).
function utf8Len(str) {
  let n = 0;
  for (const ch of str) {
    const c = ch.codePointAt(0);
    n += c <= 0x7f ? 1 : c <= 0x7ff ? 2 : c <= 0xffff ? 3 : 4;
  }
  return n;
}

// Fold a content line to ≤75 octets (UTF-8) with CRLF + single-space per
// RFC-5545 §3.1. Splits on code-point boundaries so multibyte chars stay intact.
export function foldICSLine(line) {
  if (utf8Len(line) <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {               // iterates by code point
    const b = utf8Len(ch);
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ch; curBytes = b;
      limit = 74;                         // continuation lines carry a leading space
    } else {
      cur += ch; curBytes += b;
    }
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

const KIND_LABEL = { sub: 'Subscription', emi: 'EMI', insurance: 'Insurance', utility: 'Utility', recurring: 'Recurring' };

// events: [{ date:'YYYY-MM-DD', label, icon, amount, kind }] (from buildOutflowEvents).
export function buildICS(events, { sym = '₹', now = new Date() } = {}) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Drift//Bills Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Drift bills',
  ];
  (events || []).forEach((e, i) => {
    const amt = `${sym}${Math.round(Number(e.amount) || 0).toLocaleString('en-IN')}`;
    const summary = `${e.icon ? `${e.icon} ` : ''}${e.label || 'Bill'} ${amt}`.trim();
    const desc = `${KIND_LABEL[e.kind] || 'Bill'} · ${amt}`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:drift-${e.kind || 'bill'}-${i}-${icsDate(e.date)}@drift.local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDayCompact(e.date)}`);
    lines.push(`SUMMARY:${escapeICSText(summary)}`);
    lines.push(`DESCRIPTION:${escapeICSText(desc)}`);
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldICSLine).join('\r\n') + '\r\n';
}
