/**
 * The daily loop: "Did you do it today?" with Yes / No and an optional note.
 * Saving happens immediately on Yes/No; the note is saved when the user taps
 * "Save note" or leaves the field.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useRepository } from '../../data/RepositoryProvider';
import type { AdherenceLog, ExperimentDetail, ISODate } from '../../domain/types';
import { relativeDayLabel } from '../../utils/dates';
import { colors, radius, spacing } from '../../theme';
import { AppText, Card } from '../ui';

interface Props {
  experiment: ExperimentDetail;
  date: ISODate;
  log?: AdherenceLog;
  compact?: boolean;
}

export function CheckInCard({ experiment, date, log, compact }: Props) {
  const { repo, invalidate } = useRepository();
  const [saving, setSaving] = useState<'yes' | 'no' | 'note' | null>(null);
  // The note draft is keyed by experiment + day, so switching days shows that
  // day's saved note instead of a stale draft, without needing an effect.
  const draftKey = `${experiment.id}|${date}`;
  const savedNote = log?.note ?? '';
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const note = draft?.key === draftKey ? draft.text : savedNote;
  const setNote = (text: string) => setDraft({ key: draftKey, text });

  const answer = async (adhered: boolean) => {
    setSaving(adhered ? 'yes' : 'no');
    try {
      await repo.logAdherence({ experimentId: experiment.id, date, adhered, note: note.trim() ? note.trim() : null });
      invalidate();
    } finally {
      setSaving(null);
    }
  };

  const saveNote = async () => {
    if (!log || note.trim() === savedNote) return;
    setSaving('note');
    try {
      await repo.logAdherence({ experimentId: experiment.id, date, adhered: log.adhered, note: note.trim() || null });
      setDraft(null);
      invalidate();
    } finally {
      setSaving(null);
    }
  };

  const yes = log?.adhered === true;
  const no = log?.adhered === false;
  const noteDirty = note.trim() !== savedNote;

  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{experiment.title}</AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
            {experiment.behaviorChange}
          </AppText>
        </View>
        {log && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
      </View>

      <AppText variant="bodyStrong" style={{ marginTop: spacing.md }}>
        {date === undefined ? 'Did you do it?' : `Did you do it ${relativeDayLabel(date).toLowerCase()}?`}
      </AppText>

      <View style={styles.answers}>
        <AnswerButton label="Yes" icon="checkmark" active={yes} activeColor={colors.primary} loading={saving === 'yes'} onPress={() => answer(true)} />
        <AnswerButton label="No" icon="close" active={no} activeColor={colors.danger} loading={saving === 'no'} onPress={() => answer(false)} />
      </View>

      {!compact && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            onBlur={saveNote}
            placeholder={log ? 'Add a short note (optional): how did you feel, anything unusual?' : 'Answer first, then add an optional note.'}
            placeholderTextColor={colors.textMuted}
            editable={!!log}
            multiline
            style={[styles.input, !log && { opacity: 0.6 }]}
          />
          {log && noteDirty && (
            <Pressable onPress={saveNote} style={styles.saveNote} accessibilityRole="button">
              <AppText variant="caption" color="primaryText" style={{ fontWeight: '600' }}>
                {saving === 'note' ? 'Saving…' : 'Save note'}
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

function AnswerButton({ label, icon, active, activeColor, loading, onPress }: { label: string; icon: 'checkmark' | 'close'; active: boolean; activeColor: string; loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.answer, { borderColor: active ? activeColor : colors.border, backgroundColor: active ? activeColor : colors.surface }, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={18} color={active ? colors.onPrimary : colors.textSecondary} />
      <AppText variant="bodyStrong" color={active ? colors.onPrimary : colors.text}>
        {loading ? '…' : label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  answers: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  answer: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: radius.md, borderWidth: 1.5 },
  input: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  saveNote: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 4 },
});
