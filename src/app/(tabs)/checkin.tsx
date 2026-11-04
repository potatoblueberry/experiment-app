import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CheckInCard } from '../../components/experiments';
import { AppText, Card, EmptyState, InfoBox, Screen } from '../../components/ui';
import { experimentsNeedingCheckIn, useActiveExperiments, useAdherenceIndex, useAllAdherenceLogs } from '../../hooks/useData';
import { colors, radius, spacing } from '../../theme';
import { addDays, eachDay, formatDayNumber, relativeDayLabel, today, WEEKDAY_LETTER, weekdayIndex } from '../../utils/dates';

const DAYS_BACK = 27;

export default function CheckInScreen() {
  const t = today();
  const [date, setDate] = useState(t);
  const experiments = useActiveExperiments();
  const logs = useAllAdherenceLogs();
  const logIndex = useAdherenceIndex(logs.data);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const days = useMemo(() => eachDay(addDays(t, -DAYS_BACK), t), [t]);
  const due = useMemo(() => experimentsNeedingCheckIn(experiments.data, date), [experiments.data, date]);

  useEffect(() => {
    // Start scrolled to the right (today).
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(id);
  }, []);

  const statusFor = (d: string): 'none' | 'partial' | 'done' | 'missed' => {
    const list = experimentsNeedingCheckIn(experiments.data, d);
    if (list.length === 0) return 'none';
    const logged = list.filter((e) => logIndex.get(e.id)?.get(d));
    if (logged.length === 0) return d < t ? 'missed' : 'none';
    return logged.length === list.length ? 'done' : 'partial';
  };

  return (
    <Screen title="Check-in" subtitle="Log each day in a few seconds. Past days stay editable.">
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 6 }}>
        {days.map((d) => {
          const selected = d === date;
          const status = statusFor(d);
          const dotColor = status === 'done' ? colors.primary : status === 'partial' ? colors.accent : status === 'missed' ? colors.danger : 'transparent';
          return (
            <Pressable key={d} onPress={() => setDate(d)} style={[styles.day, selected && styles.daySelected]} accessibilityRole="button" accessibilityState={{ selected }}>
              <AppText variant="caption" color={selected ? colors.onPrimary : 'textMuted'} style={{ fontSize: 11 }}>
                {WEEKDAY_LETTER[weekdayIndex(d)]}
              </AppText>
              <AppText variant="bodyStrong" color={selected ? colors.onPrimary : 'text'}>
                {formatDayNumber(d)}
              </AppText>
              <View style={[styles.dot, { backgroundColor: selected && status !== 'none' ? colors.onPrimary : dotColor }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.dateRow}>
        <AppText variant="heading">{relativeDayLabel(date)}</AppText>
        {date !== t && (
          <Pressable onPress={() => setDate(t)} hitSlop={8}>
            <AppText variant="caption" color="primaryText" style={{ fontWeight: '600' }}>
              Jump to today
            </AppText>
          </Pressable>
        )}
      </View>

      {experiments.data && due.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="Nothing to log for this day"
            text={experiments.data.length === 0 ? 'You have no active experiments yet.' : 'No experiment was in its intervention or washout phase on this day.'}
            actionLabel={experiments.data.length === 0 ? 'Design an experiment' : undefined}
            onAction={() => router.push('/experiment/new')}
          />
        </Card>
      ) : (
        due.map((e) => <CheckInCard key={`${e.id}-${date}`} experiment={e} date={date} log={logIndex.get(e.id)?.get(date)} />)
      )}

      {due.length > 0 && (
        <InfoBox icon="bulb-outline">
          <AppText variant="caption">
            {'Honest "No" answers are as valuable as "Yes". The analysis compares days you did the behaviour against your baseline, so misreporting only muddies your own result.'}
          </AppText>
        </InfoBox>
      )}

      <View style={styles.legend}>
        <LegendDot color={colors.primary} label="logged" />
        <LegendDot color={colors.accent} label="partly" />
        <LegendDot color={colors.danger} label="missed" />
      </View>
    </Screen>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  day: { width: 44, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', gap: 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legend: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
});
