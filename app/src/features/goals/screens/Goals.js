import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { ProgressBar } from '@components/primitives/ProgressBar';
import GoalRow from '@features/goals/components/GoalRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function Goals({ navigation }) {
  const { F, sym, goals, contributeGoal, removeGoal, restoreGoal } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const totalSaved = goals.reduce((s, g) => s + g.saved_amount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);

  const [contribFor, setContribFor] = useState(null);
  const [contribAmt, setContribAmt] = useState('');

  const colors = [F.coral, F.sageD, F.sky2, '#9d8fc8'];
  const bgs    = [F.cream, F.mint, F.sky, F.lilac];

  // 8.3 — long-press menu. Receives the id; we re-resolve the goal object
  // by id so the menu copy / restore semantics stay correct.
  const handleLongPress = useCallback((id) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    Alert.alert(g.name, null, [
      { text: 'Edit', onPress: () => navigation.navigate('EditGoal', { id: g.id }) },
      { text: 'Contribute', onPress: () => { setContribFor(g); setContribAmt(''); } },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await removeGoal(g.id);
          toast(`Deleted: ${g.name}`, {
            actionLabel: 'Undo',
            onAction: async () => {
              try { await restoreGoal(g.id); }
              catch (err) {
                logError('goals:undo-delete', err);
                Alert.alert('Restore failed', err?.message || String(err));
              }
            },
          });
        } catch (err) {
          logError('goals:delete', err);
          Alert.alert('Delete failed', err?.message || String(err));
        }
      } },
      { text: 'Close', style: 'cancel' },
    ]);
  }, [goals, navigation, removeGoal, restoreGoal, toast]);

  const handleRowPress = useCallback((id) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    setContribFor(g);
    setContribAmt('');
  }, [goals]);

  const doContribute = async () => {
    const amt = parseFloat(contribAmt);
    if (!isFinite(amt) || amt <= 0) {
      Alert.alert('Enter a valid amount');
      return;
    }
    await contributeGoal(contribFor.id, amt);
    setContribFor(null);
    setContribAmt('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 140, paddingHorizontal: 20 }}>

        {goals.length > 0 && (
          <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 20 }}>
            <Text style={{ fontSize: 12, color: F.ink2 }}>Saved toward goals</Text>
            <Text style={{ fontSize: 44, color: F.ink, fontWeight: '400' }}>
              {sym}{totalSaved.toLocaleString()}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2 }}>
              of {sym}{totalTarget.toLocaleString()}
              {totalTarget > 0 && ` (${Math.round((totalSaved/totalTarget)*100)}%)`}
            </Text>
            {totalTarget > 0 && (
              <ProgressBar value={totalSaved} max={totalTarget} color={F.coral} F={F} height={8}/>
            )}
          </View>
        )}

        {goals.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line, marginTop: 20 }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🎯</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No goals yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to save towards a trip, gadget, or emergency fund.
            </Text>
          </View>
        )}

        {goals.map((g, i) => (
          <GoalRow
            key={g.id}
            goal={g}
            F={F}
            sym={sym}
            bg={bgs[i % 4]}
            color={colors[i % 4]}
            onPress={handleRowPress}
            onLongPress={handleLongPress}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditGoal')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add a new goal"
        style={{
          position: 'absolute', right: 22, bottom: insets.bottom + 22,
          width: 56, height: 56, borderRadius: 28, backgroundColor: F.coral,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: F.coral, shadowOpacity: 0.45, shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 }, elevation: 10,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>

      <Modal visible={!!contribFor} animationType="slide" transparent
        onRequestClose={() => setContribFor(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: F.surface, padding: 24,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontSize: 18, color: F.ink, fontWeight: '500', marginBottom: 4 }}>
              Contribute to {contribFor?.emoji} {contribFor?.name}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 16 }}>
              How much are you adding?
            </Text>
            <TextInput
              value={contribAmt}
              onChangeText={t => setContribAmt(t.replace(/[^0-9.]/g, ''))}
              placeholder={`Amount (${sym})`}
              placeholderTextColor={F.ink3}
              keyboardType="decimal-pad"
              autoFocus
              style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.bg, fontSize: 22, color: F.ink, marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setContribFor(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: F.bg,
                  borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
                <Text style={{ color: F.ink, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doContribute}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default React.memo(Goals);
