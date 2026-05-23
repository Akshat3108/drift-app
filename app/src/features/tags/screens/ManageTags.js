// 7.3 — Manage tags screen.
//
// List of every live tag with usage count, inline rename, swipe-to-delete.
// Rename-to-existing-name silently merges (the destination tag absorbs the
// source's expense_tags rows, source is soft-deleted) — confirmed via Alert
// before the merge actually fires.

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useTags } from '@features/tags/context';
import { tagsRepo } from '@features/tags/repo';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function TagRow({ tag, F, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(tag.name);

  const commit = async () => {
    const trimmed = (draft || '').trim();
    if (!trimmed) { setEditing(false); setDraft(tag.name); return; }
    if (trimmed.toLowerCase() === tag.name.toLowerCase()) {
      setEditing(false);
      return;
    }
    await onRename(tag, trimmed);
    setEditing(false);
  };

  return (
    <SwipeableRow F={F} onRightAction={() => onDelete(tag)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: F.surface, borderRadius: 14, padding: 14, marginBottom: 8,
        borderWidth: 1, borderColor: F.line }}>
        <View style={{ flex: 1 }}>
          {editing ? (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={commit}
              onBlur={commit}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={24}
              style={{ padding: 8, borderRadius: 8, borderWidth: 1, borderColor: F.coral,
                backgroundColor: F.cream, fontSize: 14, color: F.ink }}
            />
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Rename tag ${tag.name}`}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                #{tag.name}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                {tag.usage_count} expense{tag.usage_count === 1 ? '' : 's'} · tap to rename
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {!editing && (
          <TouchableOpacity onPress={() => onDelete(tag)} hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Delete tag ${tag.name}`}>
            <Text style={{ color: '#e55', fontSize: 12, fontWeight: '600' }}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </SwipeableRow>
  );
}

function ManageTags() {
  const { F } = useTheme();
  const { tags, renameTag, removeTag, restoreTag, refresh } = useTags();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const handleRename = useCallback(async (tag, newName) => {
    // Detect a likely merge before firing, so the Alert is honest about
    // what's about to happen.
    const collision = await tagsRepo.findByNameLive(newName);
    if (collision && collision.id !== tag.id) {
      Alert.alert(
        `Tag '${newName}' already exists`,
        `Renaming '${tag.name}' will merge it into '${collision.name}'. ${tag.usage_count} expense${tag.usage_count === 1 ? '' : 's'} will be re-tagged. Continue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => refresh() },
          { text: 'Merge', style: 'destructive', onPress: async () => {
            try {
              await renameTag(tag.id, newName);
              toast(`Merged into '${collision.name}'`);
            } catch (err) {
              logError('tags:rename-merge', err);
              Alert.alert('Could not rename', err?.message || String(err));
            }
          }},
        ],
      );
      return;
    }
    try {
      await renameTag(tag.id, newName);
      toast(`Renamed to '${newName}'`);
    } catch (err) {
      logError('tags:rename', err);
      Alert.alert('Could not rename', err?.message || String(err));
    }
  }, [renameTag, refresh, toast]);

  const handleDelete = useCallback((tag) => {
    Alert.alert(
      `Delete tag '${tag.name}'?`,
      `Unlinks the tag from ${tag.usage_count} expense${tag.usage_count === 1 ? '' : 's'}. Your saved expenses are not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await removeTag(tag.id);
            toast(`Deleted: ${tag.name}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try {
                  await restoreTag(tag.id);
                  toast(`Restored: ${tag.name}`);
                } catch (err) {
                  logError('tags:restore', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('tags:delete', err);
            Alert.alert('Delete failed', err?.message || String(err));
          }
        }},
      ],
    );
  }, [removeTag, restoreTag, toast]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Manage <Text style={{ color: F.coral, fontStyle: 'italic' }}>tags</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          Rename to merge two tags into one. Delete to unlink without losing expenses.
        </Text>
      </View>

      {tags.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 32, backgroundColor: F.surface,
          borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 32, marginBottom: 6 }}>🏷️</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>No tags yet</Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Add one from Add or Edit Expense to see it here.
          </Text>
        </View>
      ) : (
        tags.map((t) => (
          <TagRow key={t.id} tag={t} F={F}
            onRename={handleRename} onDelete={handleDelete}/>
        ))
      )}
    </ScrollView>
  );
}

export default React.memo(ManageTags);
