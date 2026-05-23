import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

// 2.D.13 — monthly-equivalent for the sort comparator. Yearly subs spread
// over 12 months; weekly multiplied by the average month length so the
// comparator stays consistent across periods.
export function monthlyEquivalent(sub) {
  if (!sub) return 0;
  if (sub.period === 'yr') return sub.amount / 12;
  if (sub.period === 'wk') return sub.amount * 4.33;
  return sub.amount; // 'mo' or unknown
}

// 2.D.13 — verdict urgency score for the status sort. Lower = surface first.
// Cancelled rows fall to the bottom (4) regardless of verdict.
export function statusScore(sub) {
  if (!sub) return 5;
  if (sub.cancelled) return 4;
  if (sub.verdict === 'cancel') return 1;
  if (sub.verdict === 'review') return 2;
  return 3; // 'keep' or unknown
}

export function sortSubs(subs, sortBy) {
  if (!Array.isArray(subs) || sortBy === 'recent') return subs;
  const list = [...subs];
  if (sortBy === 'amount') {
    list.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
  } else if (sortBy === 'status') {
    list.sort((a, b) => {
      const ds = statusScore(a) - statusScore(b);
      return ds !== 0 ? ds : monthlyEquivalent(b) - monthlyEquivalent(a);
    });
  }
  return list;
}

function Subs({ navigation }) {
  const { F, sym, subs, cancelSub, reinstateSub, removeSub, restoreSub } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const active = subs.filter(s => !s.cancelled);
  const total = active.reduce((s, x) => s + x.amount, 0);
  const cancellable = subs.filter(s => s.verdict === 'cancel' && !s.cancelled);

  // 2.D.13 sort state — defaults to 'recent' so the screen looks unchanged
  // on first open. Session-only; resets on app restart.
  const [sortBy, setSortBy] = useState('recent');
  const sortedSubs = useMemo(() => sortSubs(subs, sortBy), [subs, sortBy]);

  // 2.D.12 explanatory hint — session-only dismissal. Re-shows on next launch
  // because the "Mark cancelled" affordance is bookkeeping (not the IRL action)
  // and worth re-reminding occasionally.
  const [hintDismissed, setHintDismissed] = useState(false);

  const handleCancel = async (sub) => {
    try {
      await cancelSub(sub.id);
      toast(`Cancelled: ${sub.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await reinstateSub(sub.id); }
          catch (err) {
            logError('subs:undo-cancel', err);
            Alert.alert('Reinstate failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('subs:cancel', err);
      Alert.alert('Cancel failed', err?.message || String(err));
    }
  };

  const handleLongPress = async (sub) => {
    // Long-press now triggers the same delete path as swipe. Edit is reachable
    // by tapping the row; the old Alert menu is gone.
    try {
      await removeSub(sub.id);
      toast(`Deleted: ${sub.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreSub(sub.id); }
          catch (err) {
            logError('subs:undo-longpress', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('subs:longpress-delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 140, paddingHorizontal: 20 }}
      >
        <Text style={{ fontSize: 13, color: F.ink2 }}>You're paying</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {sym}{total.toFixed(2)}<Text style={{ fontSize: 18, color: F.ink2 }}> /mo</Text>
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 10 }}>
          for {active.length} thing{active.length === 1 ? '' : 's'} ·{' '}
          <Text style={{ color: F.coral }}>{sym}{(total * 12).toFixed(0)}/yr</Text>
        </Text>

        {subs.length > 0 && (
          <TouchableOpacity
            onPress={() => navigation.navigate('SubCalendar')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="View subscription calendar"
            style={{ alignSelf: 'flex-start', marginBottom: 20 }}>
            <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>
              View calendar →
            </Text>
          </TouchableOpacity>
        )}

        {cancellable.length > 0 && (
          <View style={{ backgroundColor: F.coral, borderRadius: 22, padding: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '700',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>✨ a gentle suggestion</Text>
            <Text style={{ fontSize: 18, color: '#fff', fontWeight: '400', lineHeight: 26, marginBottom: 14 }}>
              Cancel <Text style={{ fontStyle: 'italic', textDecorationLine: 'underline' }}>
                {cancellable.map(c => c.name).join(' & ')}
              </Text>{cancellable.some(c => c.used_freq) ? ' — unused recently.' : '.'}
            </Text>
            <TouchableOpacity
              onPress={() => cancellable.forEach(s => cancelSub(s.id))}
              style={{ backgroundColor: '#fff', borderRadius: 99, paddingVertical: 10,
                paddingHorizontal: 16, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: F.coral, fontWeight: '700', fontSize: 13 }}>
                Mark all cancelled · save {sym}{cancellable.reduce((s, x) => s + x.amount, 0).toFixed(2)}/mo
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {subs.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🔄</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No subscriptions yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to track Netflix, gym, Spotify…
            </Text>
          </View>
        )}

        {/* 2.D.13 — sort pills, only when there's something to sort */}
        {subs.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>SORT</Text>
            {[
              ['recent', 'Recent'],
              ['amount', 'Amount'],
              ['status', 'Status'],
            ].map(([key, label]) => {
              const sel = sortBy === key;
              return (
                <TouchableOpacity key={key} onPress={() => setSortBy(key)} activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${label}`}
                  accessibilityState={{ selected: sel }}
                  hitSlop={{ top: 10, bottom: 10 }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
                    backgroundColor: sel ? F.coral : F.surface,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                  <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink, fontWeight: sel ? '700' : '500' }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 2.D.12 — explanatory hint for the bookkeeping-only "Mark cancelled" action */}
        {subs.length > 0 && !hintDismissed && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: F.cream, borderRadius: 14, padding: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 14, color: F.ink2 }}>ℹ</Text>
            <Text style={{ flex: 1, fontSize: 12, color: F.ink2, lineHeight: 17 }}>
              Marking a sub as cancelled is a reminder only — you still need to cancel via the provider.
            </Text>
            <TouchableOpacity onPress={() => setHintDismissed(true)} hitSlop={10}
              accessibilityRole="button" accessibilityLabel="Dismiss hint">
              <Text style={{ fontSize: 14, color: F.ink3, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {sortedSubs.map((s) => {
          const vcolor = s.cancelled ? F.ink3 : s.verdict === 'cancel' ? F.coral : s.verdict === 'review' ? F.warn : F.sageD;
          const vbg    = s.cancelled ? F.surface : s.verdict === 'cancel' ? '#fde2dc' : s.verdict === 'review' ? '#fdf0d4' : F.mint;
          const onSwipeDelete = async () => {
            try {
              await removeSub(s.id);
              toast(`Deleted: ${s.name}`, {
                actionLabel: 'Undo',
                onAction: async () => {
                  try { await restoreSub(s.id); }
                  catch (err) {
                    logError('subs:swipe-restore', err);
                    Alert.alert('Restore failed', err?.message || String(err));
                  }
                },
              });
            } catch (err) {
              logError('subs:swipe-delete', err);
              Alert.alert('Delete failed', err?.message || String(err));
            }
          };
          return (
            <SwipeableRow key={s.id} F={F} onRightAction={onSwipeDelete}>
            <TouchableOpacity
              onLongPress={() => handleLongPress(s)}
              onPress={() => navigation.navigate('EditSub', { id: s.id })}
              activeOpacity={0.85}
              style={{ backgroundColor: F.surface, borderRadius: 18,
                padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: F.line, opacity: s.cancelled ? 0.5 : 1 }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: s.color,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{s.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink,
                  textDecorationLine: s.cancelled ? 'line-through' : 'none' }}>{s.name}</Text>
                <Text style={{ fontSize: 12, color: F.ink2 }}>
                  {s.cancelled ? 'Cancelled' : (s.used_freq || `${sym}${s.amount.toFixed(2)}/${s.period}`)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 16, color: F.ink }}>{sym}{s.amount.toFixed(2)}</Text>
                <View style={{ backgroundColor: vbg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: vcolor, fontSize: 10, fontWeight: '700' }}>
                    {s.cancelled ? 'done' : s.verdict}
                  </Text>
                </View>
                {/* 2.D.11 + 2.D.12 — explicit Edit link beside the renamed Mark-cancelled (or Reinstate when already cancelled). */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TouchableOpacity onPress={() => navigation.navigate('EditSub', { id: s.id })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${s.name}`}
                    style={{ paddingHorizontal: 2, paddingVertical: 2 }}>
                    <Text style={{ color: F.coral, fontSize: 11, fontWeight: '600' }}>Edit</Text>
                  </TouchableOpacity>
                  <Text style={{ color: F.ink3, fontSize: 11 }}>·</Text>
                  {!s.cancelled ? (
                    <TouchableOpacity onPress={() => handleCancel(s)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${s.name} cancelled`}
                      style={{ paddingHorizontal: 2, paddingVertical: 2 }}>
                      <Text style={{ color: '#e55', fontSize: 11, fontWeight: '600' }}>Mark cancelled</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => reinstateSub(s.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Reinstate ${s.name}`}
                      style={{ paddingHorizontal: 2, paddingVertical: 2 }}>
                      <Text style={{ color: F.coral, fontSize: 11, fontWeight: '600' }}>Reinstate</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
            </SwipeableRow>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditSub')}
        activeOpacity={0.85}
        style={{
          position: 'absolute', right: 22, bottom: insets.bottom + 86,
          width: 56, height: 56, borderRadius: 28, backgroundColor: F.coral,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: F.coral, shadowOpacity: 0.45, shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 }, elevation: 10,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(Subs);
