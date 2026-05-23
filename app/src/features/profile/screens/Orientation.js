import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';

// 2.D.15 — Day-0 orientation. Sits between Onboarding.finish() and the main
// navigator. Three swipeable cards. On Skip OR finishing the last card, flips
// settings.orientation_seen = 1 so the gate in App.js stops rendering this
// screen on subsequent launches.

const W = Dimensions.get('window').width;

const CARDS = [
  {
    emoji: '🧾',
    title: 'Track what you spend',
    body: 'Tap the central + tab on the bottom bar to log a spend. Use Quick for a single amount, or Detailed when you want to record individual items, items with quantities, or split a bill.',
    foot: 'Drift remembers your last category, last merchant, and last payment method — typing the merchant alone is usually enough.',
  },
  {
    emoji: '📷',
    title: 'Scan a receipt to capture items',
    body: 'Tap the 📷 tab to scan a printed bill. Drift reads merchant, date, item names, quantities, GST, and total fully on-device — no cloud, no uploads.',
    foot: 'Reviewed items become tradable price points: Drift will flag if dal is suddenly ₹40 more or rice is suddenly ₹20 less than your usual.',
  },
  {
    emoji: '✿',
    title: 'Watch where it flows',
    body: 'Pots break spend down by category against your budget. Trends shows month-over-month and per-pot history. Goals tracks savings, Subs catches sneaky monthly bills, and Items tracks per-product price + consumption.',
    foot: 'Home surfaces a streak, a forecast, and price-watch cards once you have a few days of data.',
  },
];

function Orientation() {
  const { F, setSetting } = useApp();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [step, setStep] = useState(0);

  const goto = (i) => {
    setStep(i);
    scrollRef.current?.scrollTo({ x: i * W, animated: true });
  };

  const finish = async () => {
    try { await setSetting('orientation_seen', 1); }
    catch { /* swallow — flag is best-effort; user can re-trigger via Profile */ }
  };

  const next = () => {
    if (step < CARDS.length - 1) goto(step + 1);
    else finish();
  };

  const onScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / W);
    if (i !== step) setStep(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
        paddingHorizontal: 20, paddingTop: 8 }}>
        <TouchableOpacity
          onPress={finish}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Skip orientation">
          <Text style={{ fontSize: 14, color: F.ink2, fontWeight: '600' }}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {CARDS.map((c, i) => (
          <View key={i} style={{ width: W, paddingHorizontal: 28, paddingTop: 40,
            alignItems: 'center' }}>
            <View style={{
              width: 96, height: 96, borderRadius: 48, backgroundColor: F.cream,
              alignItems: 'center', justifyContent: 'center', marginBottom: 28,
            }}>
              <Text style={{ fontSize: 48 }}>{c.emoji}</Text>
            </View>
            <Text style={{ fontSize: 26, color: F.ink, fontWeight: '500', textAlign: 'center' }}>
              {c.title}
            </Text>
            <Text style={{ fontSize: 15, color: F.ink2, marginTop: 16, lineHeight: 22,
              textAlign: 'center' }}>
              {c.body}
            </Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 16, lineHeight: 19,
              textAlign: 'center', fontStyle: 'italic' }}>
              {c.foot}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Step dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8,
        paddingVertical: 16 }}>
        {CARDS.map((_, i) => (
          <View key={i} style={{
            width: i === step ? 22 : 8, height: 8, borderRadius: 4,
            backgroundColor: i === step ? F.coral : F.line,
          }}/>
        ))}
      </View>

      {/* CTA */}
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
        <TouchableOpacity
          onPress={next}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={step < CARDS.length - 1 ? 'Next card' : "Finish orientation"}
          style={{ backgroundColor: F.coral, borderRadius: 14, paddingVertical: 16,
            alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
            {step < CARDS.length - 1 ? 'Next →' : "Let's go ✿"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(Orientation);
