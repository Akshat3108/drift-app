// PS-12 — Tax-benefit dashboard + prepayment simulator.
//
// Top section: aggregate FY view across all loans (or per-loan view if a
// loanId is passed via route.params). Shows principal-paid-FY (80C),
// interest-paid-FY (24B), and rough cash savings at 30% slab — clamped
// to ITR caps (1.5L 80C, 2L 24B).
//
// Bottom section: prepayment simulator. User picks a loan + types a
// one-time extra principal amount; we render a small forked-line chart
// of baseline vs modified outstanding balance over time + a summary
// (interest saved, months saved).

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useEmi } from '@features/emi/context';
import { useSettings } from '@features/profile/settings.context';
import {
  simulatePrepayment, taxBenefitForFY, fyBracketFor, projectState,
} from '@features/emi/amortization';

let Svg = null, Path = null, Line = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Path    = mod.Path;
  Line    = mod.Line;
  SvgText = mod.Text;
} catch (_) { /* dev shell */ }

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function fmtCompact(sym, n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_00_000) return `${sign}${sym}${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)    return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${sym}${abs.toLocaleString('en-IN')}`;
}

// Build SVG path for a schedule's closing_balance series. xs equally spaced
// over `width`, ys mapped to [pad, height-pad] based on yMax (always 0..max
// so the curves visually meet at zero). `start` lets us prefix-skip rows so
// baseline + modified curves share an x scale.
function balancePath(schedule, width, height, pad, yMax) {
  if (!schedule.length) return '';
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const step = schedule.length > 1 ? usableW / (schedule.length - 1) : 0;
  let d = '';
  for (let i = 0; i < schedule.length; i++) {
    const x = pad + step * i;
    const v = schedule[i].closing_balance || 0;
    const y = pad + (1 - v / yMax) * usableH;
    d += (i === 0 ? 'M ' : 'L ') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  return d;
}

function TaxBenefit({ route, navigation }) {
  const { F } = useTheme();
  const { loans } = useEmi();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();

  const [selectedLoanId, setSelectedLoanId] = useState(route?.params?.loanId || loans[0]?.id || null);
  const [extraAmount,    setExtraAmount]    = useState('');

  const liveLoans = useMemo(() => loans.filter(l => !l.deleted_at), [loans]);

  // FY bracket (Apr 1 of current FY → Apr 1 next).
  const [fyStart, fyEnd] = fyBracketFor(new Date());

  // Aggregate across all loans.
  const aggregate = useMemo(() => {
    let principal = 0, interest = 0, eligible80C = 0, eligible24B = 0;
    for (const l of liveLoans) {
      const b = taxBenefitForFY(l, fyStart, fyEnd);
      if (!b.ready) continue;
      principal += b.principalPaidFY;
      interest  += b.interestPaidFY;
      eligible80C += b.eligible80C;
      eligible24B += b.eligible24B;
    }
    const capped80C = Math.min(eligible80C, 150000);
    const capped24B = Math.min(eligible24B, 200000);
    return {
      principal, interest,
      eligible80C, eligible24B,
      capped80C, capped24B,
      savingsAt30Pct: Math.round((capped80C + capped24B) * 0.30),
    };
  }, [liveLoans, fyStart, fyEnd]);

  const selectedLoan = useMemo(
    () => liveLoans.find(l => l.id === selectedLoanId) || liveLoans[0] || null,
    [liveLoans, selectedLoanId],
  );

  const sim = useMemo(() => {
    if (!selectedLoan) return null;
    const extra = parseFloat(extraAmount);
    const state = projectState(selectedLoan);
    if (!state.ready) return null;
    return simulatePrepayment(selectedLoan, {
      extraPrincipal: Number.isFinite(extra) ? extra : 0,
      extraAfterInstallment: state.installmentsPaid,
    });
  }, [selectedLoan, extraAmount]);

  // Chart geometry.
  const winW = Dimensions.get('window').width;
  const chartW = Math.max(280, winW - 40);
  const chartH = 160;
  const chartPad = 16;
  const chart = useMemo(() => {
    if (!sim?.ready) return null;
    const yMax = Math.max(
      sim.baseline.schedule[0]?.opening_balance || 0,
      sim.modifiedSchedule[0]?.opening_balance || 0,
      1,
    );
    return {
      yMax,
      baselinePath: balancePath(sim.baseline.schedule, chartW, chartH, chartPad, yMax),
      modifiedPath: balancePath(sim.modifiedSchedule, chartW, chartH, chartPad, yMax),
    };
  }, [sim, chartW, chartH]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20,
        paddingTop: insets.top + 16, paddingBottom: insets.bottom + 60 }}>

      <Text style={{ fontSize: 13, color: F.ink2 }}>
        FY {fyStart.slice(0, 4)}–{String(Number(fyStart.slice(0, 4)) + 1).slice(2)}
      </Text>
      <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400', marginBottom: 8 }}>
        Loan tax benefit
      </Text>
      <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 20 }}>
        Principal counts toward Section 80C (cap {fmt(sym, 150000)}); interest counts
        toward Section 24B (cap {fmt(sym, 200000)}, self-occupied) — only for loans
        marked tax-eligible.
      </Text>

      {liveLoans.length === 0 && (
        <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
          borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>🏦</Text>
          <Text style={{ fontSize: 14, color: F.ink2, marginBottom: 8 }}>No EMIs yet</Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditEMI')} activeOpacity={0.85}
            style={{ backgroundColor: F.coral, paddingHorizontal: 18, paddingVertical: 10,
              borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Add an EMI</Text>
          </TouchableOpacity>
        </View>
      )}

      {liveLoans.length > 0 && (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
          borderColor: F.line, padding: 16, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <View>
              <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700' }}>80C ELIGIBLE</Text>
              <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
                {fmt(sym, aggregate.capped80C)}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                of {fmt(sym, aggregate.eligible80C)} paid principal
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700' }}>24B ELIGIBLE</Text>
              <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
                {fmt(sym, aggregate.capped24B)}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                of {fmt(sym, aggregate.eligible24B)} paid interest
              </Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: F.line, marginVertical: 12 }}/>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 13, color: F.ink2 }}>Cash savings at 30% slab</Text>
            <Text style={{ fontSize: 18, color: F.sageD || '#3a8755', fontWeight: '600' }}>
              {fmt(sym, aggregate.savingsAt30Pct)}
            </Text>
          </View>
        </View>
      )}

      {/* Prepayment simulator */}
      {selectedLoan && (
        <>
          <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 4 }}>Prepayment simulator</Text>
          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 12 }}>
            Apply a one-time extra principal payment today. EMI stays the same — the
            tenure shortens.
          </Text>

          {liveLoans.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {liveLoans.map((l) => {
                const sel = l.id === selectedLoan.id;
                return (
                  <TouchableOpacity key={l.id} onPress={() => setSelectedLoanId(l.id)} activeOpacity={0.7}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                      backgroundColor: sel ? F.coral : F.surface,
                      borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                    <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>{l.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TextInput
            value={extraAmount}
            onChangeText={setExtraAmount}
            placeholder={`Extra principal (${sym})`}
            placeholderTextColor={F.ink3}
            keyboardType="decimal-pad"
            style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 16 }}/>

          {sim?.ready && (
            <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
              borderColor: F.line, padding: 16, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View>
                  <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700' }}>INTEREST SAVED</Text>
                  <Text style={{ fontSize: 22, color: F.sageD || '#3a8755', fontWeight: '500' }}>
                    {fmtCompact(sym, sim.savedInterest)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700' }}>MONTHS SAVED</Text>
                  <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
                    {sim.monthsSaved}
                  </Text>
                </View>
              </View>

              {Svg && chart && (
                <Svg width={chartW} height={chartH}>
                  <Line x1={chartPad} y1={chartH - chartPad} x2={chartW - chartPad} y2={chartH - chartPad}
                    stroke={F.line} strokeWidth={1}/>
                  <Path d={chart.baselinePath}  stroke={F.ink3} strokeWidth={2} fill="none"/>
                  <Path d={chart.modifiedPath}  stroke={F.coral} strokeWidth={2.5} fill="none"/>
                  <SvgText x={chartPad} y={chartPad - 2} fontSize="9" fill={F.ink3}>
                    {fmtCompact(sym, chart.yMax)}
                  </SvgText>
                </Svg>
              )}
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: F.ink3 }}/>
                  <Text style={{ fontSize: 11, color: F.ink2 }}>Baseline</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: F.coral }}/>
                  <Text style={{ fontSize: 11, color: F.ink2 }}>With prepayment</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 8 }}>
                Baseline tenure: {sim.baseline.schedule.length}mo · New tenure: {sim.newTenure}mo
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

export default React.memo(TaxBenefit);
