// 7.2 — Subscription calendar.
//
// Month grid (Sun..Sat, 6 rows) of upcoming bills with dots per due-day
// occurrence. Hero + pager strip above the grid; selection callout +
// daily-subs footnote + no-date-subs footnote below. Reads `useSubs().subs`
// directly (per-feature hook, not useApp()). All projection math is in
// `app/src/features/subs/projection.js` so this file stays presentational.

import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useSubs } from '@features/subs/context';
import { useSettings } from '@features/profile/settings.context';
import {
  monthGridCells,
  monthKeyOf,
  projectSubsForMonth,
  shiftMonth,
  SUB_CAL_MONTH_NAMES,
  SUB_CAL_WEEKDAY_HEAD,
} from '@features/subs/projection';

const MAX_PAGE_BACK    = 6;   // months
const MAX_PAGE_FORWARD = 12;  // months
const PAGER_SPAN = 5;         // pager strip shows 5 contiguous months

function todayParts() {
  const d = new Date();
  return { year: d.getFullYear(), monthIndex: d.getMonth(), day: d.getDate() };
}

function PagerStrip({ offset, setOffset, F }) {
  const today = todayParts();
  // Slide the pager so the selected offset is roughly centred (with clamping
  // at the look-back/look-forward limits). 5 cells centred = [-2, -1, 0, +1, +2].
  let start = offset - Math.floor(PAGER_SPAN / 2);
  if (start < -MAX_PAGE_BACK) start = -MAX_PAGE_BACK;
  const end = Math.min(start + PAGER_SPAN - 1, MAX_PAGE_FORWARD);
  if (end - start < PAGER_SPAN - 1) start = end - (PAGER_SPAN - 1);
  const cells = [];
  for (let k = start; k <= end; k++) cells.push(k);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <TouchableOpacity
        onPress={() => setOffset(Math.max(-MAX_PAGE_BACK, offset - 1))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: offset <= -MAX_PAGE_BACK ? F.ink3 : F.ink, fontSize: 18, fontWeight: '500' }}>‹</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
        {cells.map(k => {
          const { year, monthIndex } = shiftMonth(today.year, today.monthIndex, k);
          const sel = k === offset;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setOffset(k)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Show ${SUB_CAL_MONTH_NAMES[monthIndex]} ${year}`}
              accessibilityState={{ selected: sel }}
              style={{
                flex: 1, paddingVertical: 6, borderRadius: 10,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center',
              }}>
              <Text style={{
                fontSize: 11, fontWeight: '700',
                color: sel ? '#fff' : F.ink, letterSpacing: 0.5,
              }}>
                {SUB_CAL_MONTH_NAMES[monthIndex].slice(0, 3)}
              </Text>
              <Text style={{
                fontSize: 9,
                color: sel ? 'rgba(255,255,255,0.85)' : F.ink3,
              }}>
                {String(year).slice(-2)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={() => setOffset(Math.min(MAX_PAGE_FORWARD, offset + 1))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: offset >= MAX_PAGE_FORWARD ? F.ink3 : F.ink, fontSize: 18, fontWeight: '500' }}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

function MonthGrid({ year, monthIndex, subsByDay, selectedDay, setSelectedDay, F }) {
  const today = todayParts();
  const grid = useMemo(() => monthGridCells(year, monthIndex), [year, monthIndex]);

  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18,
      borderWidth: 1, borderColor: F.line, padding: 12, marginBottom: 16 }}>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {SUB_CAL_WEEKDAY_HEAD.map((label, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: F.ink3, fontWeight: '700', letterSpacing: 0.5 }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {grid.cells.map((c, idx) => {
          if (!c.inMonth) {
            return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}/>;
          }
          const occ = subsByDay.get(c.day) || [];
          const isToday    = today.year === year && today.monthIndex === monthIndex && today.day === c.day;
          const isSelected = selectedDay === c.day;
          const hasSubs    = occ.length > 0;

          const bg = isSelected ? F.coral : (hasSubs ? F.cream : F.surface);
          const dayColor = isSelected ? '#fff' : F.ink;
          const borderColor = isSelected
            ? F.coral
            : isToday ? F.coral : F.line;

          return (
            <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <TouchableOpacity
                onPress={() => setSelectedDay(c.day)}
                activeOpacity={hasSubs ? 0.7 : 1}
                accessibilityRole="button"
                accessibilityLabel={`Day ${c.day}${hasSubs ? `, ${occ.length} due` : ''}`}
                accessibilityState={{ selected: isSelected }}
                style={{
                  flex: 1, borderRadius: 10,
                  backgroundColor: bg,
                  borderWidth: isToday || isSelected ? 1.5 : 1,
                  borderColor,
                  padding: 4,
                  justifyContent: 'space-between',
                }}>
                <Text style={{ fontSize: 11, color: dayColor, fontWeight: isToday ? '700' : '500' }}>
                  {c.day}
                </Text>
                {hasSubs && (
                  <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
                    {occ.slice(0, 3).map((o, j) => (
                      <View key={j} style={{
                        width: 5, height: 5, borderRadius: 3,
                        backgroundColor: isSelected ? '#fff' : (o.sub.color || F.coral),
                      }}/>
                    ))}
                    {occ.length > 3 && (
                      <Text style={{
                        fontSize: 8,
                        color: isSelected ? 'rgba(255,255,255,0.85)' : F.ink3,
                        fontWeight: '700',
                      }}>+{occ.length - 3}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SelectionCallout({ year, monthIndex, day, subsByDay, F, sym, navigation }) {
  if (!day) return null;
  const occ = subsByDay.get(day) || [];
  const dateLabel = `${SUB_CAL_MONTH_NAMES[monthIndex].slice(0, 3)} ${day}`;
  if (occ.length === 0) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18,
        borderWidth: 1, borderColor: F.line, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, color: F.ink3 }}>{dateLabel}</Text>
        <Text style={{ fontSize: 14, color: F.ink, marginTop: 4 }}>
          Nothing due on this day.
        </Text>
      </View>
    );
  }
  const totalAmount = occ.reduce((s, o) => s + (o.sub.amount || 0), 0);
  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18,
      borderWidth: 1, borderColor: F.line, padding: 14, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600' }}>
          {occ.length} due on {dateLabel}
        </Text>
        <Text style={{ fontSize: 13, color: F.coral, fontWeight: '700' }}>
          {sym}{totalAmount.toFixed(2)}
        </Text>
      </View>
      {occ.map(({ sub }, idx) => (
        <TouchableOpacity
          key={`${sub.id}-${idx}`}
          onPress={() => navigation.navigate('EditSub', { id: sub.id })}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingVertical: 10,
            borderTopWidth: idx === 0 ? 0 : 1,
            borderTopColor: F.line,
          }}>
          <View style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: sub.color || F.cream,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 16 }}>{sub.icon || '📦'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>{sub.name}</Text>
            <Text style={{ fontSize: 11, color: F.ink3 }}>
              {sub.period || 'mo'} · next billed {sub.next_bill}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
            {sym}{(sub.amount || 0).toFixed(2)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Footnotes({ dailySubs, skippedSubs, F, sym, navigation }) {
  if (dailySubs.length === 0 && skippedSubs.length === 0) return null;
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      {dailySubs.length > 0 && (
        <View style={{ backgroundColor: F.cream, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>
            DAILY SUBSCRIPTIONS · {dailySubs.length}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2, lineHeight: 17 }}>
            {dailySubs.map(s => `${s.name} ${sym}${(s.amount || 0).toFixed(2)}`).join(' · ')}
          </Text>
          <Text style={{ fontSize: 10, color: F.ink3, marginTop: 4 }}>
            Not shown in the grid to keep it readable.
          </Text>
        </View>
      )}
      {skippedSubs.length > 0 && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Subs')}
          activeOpacity={0.7}
          style={{ backgroundColor: F.cream, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>
            NO DUE DATE · {skippedSubs.length}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2, lineHeight: 17 }}>
            {skippedSubs.map(s => s.name).join(', ')}
          </Text>
          <Text style={{ fontSize: 10, color: F.coral, marginTop: 4, fontWeight: '700' }}>
            Tap to set due dates →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SubCalendar({ navigation }) {
  const { F } = useTheme();
  const { subs } = useSubs();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();

  const [offset, setOffset] = useState(0);
  const today = useMemo(() => todayParts(), []);
  const { year, monthIndex } = useMemo(
    () => shiftMonth(today.year, today.monthIndex, offset),
    [today, offset],
  );

  const projection = useMemo(
    () => projectSubsForMonth(subs, monthKeyOf(year, monthIndex)),
    [subs, year, monthIndex],
  );

  const [selectedDay, setSelectedDay] = useState(null);
  // Auto-select today when the displayed month is the current month; clear
  // selection when paging away. Re-runs on offset change.
  useEffect(() => {
    if (offset === 0) setSelectedDay(today.day);
    else setSelectedDay(null);
  }, [offset, today.day]);

  const totalForMonth = useMemo(() => {
    let t = 0;
    for (const arr of projection.subsByDay.values()) {
      for (const o of arr) t += o.sub.amount || 0;
    }
    return t;
  }, [projection]);

  const eventCount = useMemo(() => {
    let n = 0;
    for (const arr of projection.subsByDay.values()) n += arr.length;
    return n;
  }, [projection]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Subscription <Text style={{ color: F.coral, fontStyle: 'italic' }}>calendar</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          Plan ahead. Tap a day to see what's due.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
          <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
            {sym}{totalForMonth.toFixed(2)}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            across {eventCount} bill{eventCount === 1 ? '' : 's'} in {SUB_CAL_MONTH_NAMES[monthIndex]}
          </Text>
        </View>
      </View>

      <PagerStrip offset={offset} setOffset={setOffset} F={F}/>

      <MonthGrid
        year={year} monthIndex={monthIndex}
        subsByDay={projection.subsByDay}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        F={F}/>

      <SelectionCallout
        year={year} monthIndex={monthIndex} day={selectedDay}
        subsByDay={projection.subsByDay}
        F={F} sym={sym} navigation={navigation}/>

      <Footnotes
        dailySubs={projection.dailySubs}
        skippedSubs={projection.skippedSubs}
        F={F} sym={sym} navigation={navigation}/>

      {subs.length === 0 && (
        <View style={{ alignItems: 'center', padding: 32, backgroundColor: F.surface,
          borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 32, marginBottom: 6 }}>🗓️</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>No subscriptions yet</Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Add one in Subscriptions to see it here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(SubCalendar);
