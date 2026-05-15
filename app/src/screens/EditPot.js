import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

const EMOJIS = ['🍴','🥬','🚲','🎬','💊','🧾','📺','🛒','🏠','🚗','💼','🎓','🧘','🌿','📚','🎁','✈️'];
const COLORS = [
  { key: 'cream',  label: 'Cream'  },
  { key: 'mint',   label: 'Mint'   },
  { key: 'sky',    label: 'Sky'    },
  { key: 'blush',  label: 'Blush'  },
  { key: 'butter', label: 'Butter' },
  { key: 'lilac',  label: 'Lilac'  },
];

export default function EditPot({ route, navigation }) {
  const { F, sym, categories, addCategory, updateCategory, removeCategory } = useApp();
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

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    const bud = parseFloat(budget) || 0;
    if (editing) {
      await updateCategory(editing.id, { name: name.trim(), emoji, budget: bud, color });
    } else {
      await addCategory({ name: name.trim(), emoji, budget: bud, color });
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert(`Delete ${name}?`, 'Existing expenses will keep the category name but become uncategorised.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await removeCategory(editing.id);
        navigation.goBack();
      } },
    ]);
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
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                backgroundColor: sel ? F.coral : F[c.key],
                borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
              <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
