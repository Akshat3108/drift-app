import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { logError } from '@core/utils/log';

// 7.3 — Per-entry tag selection surface used by Add.js + EditExpense.js.
//
// Renders a horizontal row of toggle chips for the user's existing tags
// (sorted by usage_count desc — supplied by the TagsProvider list), plus a
// "+ Add" button that reveals a TextInput. Submitting the input calls
// `getOrCreateTag(name)` and selects the result.
//
// Tag set is tracked by NAME (string[]) rather than ID so the caller doesn't
// have to plumb an in-flight new-tag's id back to its state; the expenses
// context's `setForExpense(id, names)` re-resolves names to ids inside the
// write transaction.

const TAG_CAP = 12;        // chips rendered inline; user can scroll horizontally beyond this
const MAX_NAME_LEN = 24;   // soft cap for sanity

function chipBg(F, active) {
  return active ? F.coral : F.cream;
}
function chipFg(F, active) {
  return active ? '#fff' : F.ink;
}

export default function TagChipSurface({
  F,
  allTags = [],
  tagNames = [],
  setTagNames,
  showTagInput,
  setShowTagInput,
  pendingTagName,
  setPendingTagName,
  getOrCreateTag,
  style,
}) {
  const selectedSet = useMemo(
    () => new Set((tagNames || []).map((n) => n.trim().toLowerCase())),
    [tagNames],
  );

  // Chips to render: the cap most-used tags (already pre-sorted by the repo).
  const chipList = useMemo(() => allTags.slice(0, TAG_CAP), [allTags]);
  // Tags selected on this entry that aren't in the top cap — pin them so the
  // user can always see + toggle their own selections.
  const extraSelected = useMemo(
    () => (allTags || []).filter(
      (t) => selectedSet.has(t.name.trim().toLowerCase())
          && !chipList.some((c) => c.id === t.id),
    ),
    [allTags, chipList, selectedSet],
  );

  const onToggle = (name) => {
    const key = name.trim().toLowerCase();
    setTagNames((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const idx = arr.findIndex((n) => n.trim().toLowerCase() === key);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(name);
      return arr;
    });
  };

  const commitNewTag = async () => {
    const raw = (pendingTagName || '').trim();
    if (!raw) { setShowTagInput(false); return; }
    if (raw.length > MAX_NAME_LEN) {
      Alert.alert('Tag too long', `Keep tag names under ${MAX_NAME_LEN} characters.`);
      return;
    }
    try {
      const tag = await getOrCreateTag(raw);
      if (tag) {
        const key = tag.name.trim().toLowerCase();
        if (!selectedSet.has(key)) {
          setTagNames((prev) => [...(Array.isArray(prev) ? prev : []), tag.name]);
        }
      }
    } catch (err) {
      logError('tags:create', err);
      Alert.alert('Could not add tag', err?.message || String(err));
    } finally {
      setPendingTagName('');
      setShowTagInput(false);
    }
  };

  return (
    <View style={[{ backgroundColor: F.surface, borderRadius: 18, padding: 14,
      borderWidth: 1, borderColor: F.line }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, flex: 1 }}>
          TAGS
        </Text>
        {!showTagInput && (
          <TouchableOpacity
            onPress={() => setShowTagInput(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Add a new tag"
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: F.coral, fontSize: 12, fontWeight: '700' }}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {showTagInput && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <TextInput
            value={pendingTagName}
            onChangeText={setPendingTagName}
            onSubmitEditing={commitNewTag}
            placeholder="New tag name"
            placeholderTextColor={F.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            maxLength={MAX_NAME_LEN}
            style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1,
              borderColor: F.line, backgroundColor: F.cream, fontSize: 13, color: F.ink }}
          />
          <TouchableOpacity onPress={commitNewTag} hitSlop={10}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: F.coral }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowTagInput(false); setPendingTagName(''); }} hitSlop={10}
            style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: F.ink3, fontSize: 12 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {chipList.length === 0 && extraSelected.length === 0 ? (
        <Text style={{ fontSize: 12, color: F.ink3 }}>
          No tags yet — tap “+ Add” to create one.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingRight: 4 }}>
          {[...chipList, ...extraSelected].map((t) => {
            const active = selectedSet.has(t.name.trim().toLowerCase());
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => onToggle(t.name)}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Tag ${t.name}`}
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99,
                  backgroundColor: chipBg(F, active),
                  borderWidth: 1, borderColor: active ? F.coral : F.line,
                }}>
                <Text style={{ color: chipFg(F, active), fontSize: 12,
                  fontWeight: active ? '700' : '500' }}>
                  #{t.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
