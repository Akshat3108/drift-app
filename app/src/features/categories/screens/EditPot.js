import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';
import { wouldCycle } from '../repo';

const EMOJIS = ['🍴','🥬','🚲','🎬','💊','🧾','📺','🛒','🏠','🚗','💼','🎓','🧘','🌿','📚','🎁','✈️'];
const COLORS = [
  { key: 'cream',  label: 'Cream'  },
  { key: 'mint',   label: 'Mint'   },
  { key: 'sky',    label: 'Sky'    },
  { key: 'blush',  label: 'Blush'  },
  { key: 'butter', label: 'Butter' },
  { key: 'lilac',  label: 'Lilac'  },
];

function EditPot({ route, navigation }) {
  const { F, sym, categories, addCategory, updateCategory, removeCategory, restoreCategory } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;

  if (!id) {
    return <ManageList F={F} sym={sym} categories={categories} navigation={navigation} insets={insets}/>;
  }

  return <EditOne id={id} F={F} sym={sym} categories={categories}
    addCategory={addCategory} updateCategory={updateCategory} removeCategory={removeCategory}
    navigation={navigation} insets={insets}/>;
}

function ManageList({ F, sym, categories, navigation, insets }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
      <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 16 }}>
        Tap a category to edit its name, emoji, colour, or budget.
      </Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line,
        overflow: 'hidden', marginBottom: 14 }}>
        {categories.map((c, i) => (
          <TouchableOpacity key={c.id}
            onPress={() => navigation.push('EditPot', { id: c.id })}
            style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
              flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{c.name}</Text>
              <Text style={{ fontSize: 12, color: F.ink3 }}>
                {c.budget > 0 ? `${sym}${c.budget}/mo` : 'no budget'}
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: F.ink3 }}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={() => navigation.push('EditPot', { id: 'new' })}
        style={{ borderWidth: 2, borderColor: F.line, borderStyle: 'dashed', borderRadius: 18,
          padding: 18, alignItems: 'center' }}
      >
        <Text style={{ fontSize: 13, color: F.ink2 }}>+ Add category</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function EditOne({ id, F, sym, categories, addCategory, updateCategory, removeCategory, navigation, insets }) {
  const editing = id === 'new' ? null : categories.find(c => c.id === id);
  const [name, setName]     = useState(editing?.name || '');
  const [emoji, setEmoji]   = useState(editing?.emoji || '🍴');
  const [budget, setBudget] = useState(editing ? String(editing.budget) : '');
  const [color, setColor]   = useState(editing?.color || 'cream');
  // 7.10 — per-category rollover opt-in. Bidirectional: under-spend carries
  // forward as a credit, over-spend as a debit. Computed lazily by
  // rolloverRepo.ensureRolloverForMonth before each pots() read.
  const [rolloverEnabled, setRolloverEnabled] = useState(editing ? !!editing.rollover_enabled : false);
  // PS-36 — optional parent pot. null = top-level (the default / existing
  // behaviour). Candidates exclude self and any descendant of self, so the
  // picker can never offer a choice that would loop the tree.
  const [parentId, setParentId] = useState(editing?.parent_id ?? null);
  const parentChoices = (categories || []).filter(
    (c) => c.id !== editing?.id && !wouldCycle(categories || [], editing?.id, c.id)
  );

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    // Defensive: the picker already filters cycles, but re-check before write.
    if (editing && parentId != null && wouldCycle(categories || [], editing.id, parentId)) {
      return Alert.alert('Invalid parent', 'That choice would create a loop of categories.');
    }
    const bud = parseFloat(budget) || 0;
    if (editing) {
      await updateCategory(editing.id, {
        name: name.trim(), emoji, budget: bud, color,
        rollover_enabled: rolloverEnabled ? 1 : 0,
        parent_id: parentId,
      });
    } else {
      await addCategory({
        name: name.trim(), emoji, budget: bud, color,
        rollover_enabled: rolloverEnabled ? 1 : 0,
        parent_id: parentId,
      });
    }
    navigation.goBack();
  };

  const handleDelete = async () => {
    const label = name.trim() || 'category';
    const id = editing.id;
    try {
      await removeCategory(id);
      navigation.goBack();
      toast(`Deleted: ${label}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreCategory(id); }
          catch (err) {
            logError('editpot:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('editpot:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NAME</Text>
      <TextInput value={name} onChangeText={setName}
        placeholder="e.g. Pets" placeholderTextColor={F.ink3}
        autoCapitalize="words"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 16 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>BUDGET</Text>
      <TextInput value={budget}
        onChangeText={t => setBudget(t.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        placeholder={`${sym} per month (or 0)`} placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 22, color: F.ink, marginBottom: 16 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>EMOJI</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {EMOJIS.map(e => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)}
            accessibilityRole="button"
            accessibilityLabel={`Emoji ${e}`}
            accessibilityState={{ selected: emoji === e }}
            style={{ width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: emoji === e ? F.cream : F.surface,
              borderWidth: 2, borderColor: emoji === e ? F.coral : F.line }}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>COLOUR</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
        {COLORS.map(c => {
          const sel = color === c.key;
          return (
            <TouchableOpacity key={c.key} onPress={() => setColor(c.key)}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${c.label}`}
              accessibilityState={{ selected: sel }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                backgroundColor: sel ? F.coral : F[c.key],
                borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
              <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {parentChoices.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
            PARENT CATEGORY
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <TouchableOpacity onPress={() => setParentId(null)}
              accessibilityRole="button"
              accessibilityState={{ selected: parentId == null }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                backgroundColor: parentId == null ? F.coral : F.surface,
                borderWidth: 1, borderColor: parentId == null ? F.coral : F.line }}>
              <Text style={{ color: parentId == null ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>
                None (top-level)
              </Text>
            </TouchableOpacity>
            {parentChoices.map((c) => {
              const sel = parentId === c.id;
              return (
                <TouchableOpacity key={c.id} onPress={() => setParentId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                    backgroundColor: sel ? F.coral : F.surface,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line,
                    flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                  <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 22 }}>
            Sub-pots keep their own budget; the parent's detail view rolls their spend up.
          </Text>
        </>
      )}

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
        ROLLOVER
      </Text>
      <TouchableOpacity onPress={() => setRolloverEnabled(v => !v)}
        activeOpacity={0.85}
        accessibilityRole="switch"
        accessibilityState={{ checked: rolloverEnabled }}
        accessibilityLabel="Roll unspent or overspend into next month"
        style={{ padding: 14, borderRadius: 12,
          backgroundColor: rolloverEnabled ? F.sage : F.surface,
          borderWidth: 1, borderColor: rolloverEnabled ? F.sage : F.line,
          flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Text style={{ fontSize: 20 }}>↻</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: rolloverEnabled ? '#fff' : F.ink, fontWeight: '600' }}>
            Roll into next month
          </Text>
          <Text style={{ fontSize: 11, color: rolloverEnabled ? '#fff' : F.ink3, marginTop: 2 }}>
            Bidirectional — leftover carries forward, over-spend deducts.
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: rolloverEnabled ? '#fff' : F.ink2, fontWeight: '500' }}>
          {rolloverEnabled ? 'On' : 'Off'}
        </Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 22 }}>
        Carryover settles at month-end and re-derives on every read — retroactive edits flow forward.
      </Text>

      <TouchableOpacity onPress={save}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {editing ? 'Save changes' : 'Add category'}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete}
          style={{ backgroundColor: '#fee2e2', padding: 16, borderRadius: 14, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '700' }}>Delete</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditPot);
