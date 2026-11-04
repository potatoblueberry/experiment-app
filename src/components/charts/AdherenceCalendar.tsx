/**
 * Week-by-week grid of adherence for a date range. Each cell is a day:
 * green = did it, red = did not, grey outline = past day with no log,
 * faint = future. Tapping a past/present day calls onSelectDay (editable history).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AdherenceLog, ISODate } from '../../domain/types';
import { addDays, eachDay, formatDayNumber, today, WEEKDAY_LETTER, weekdayIndex } from '../../utils/dates';
import { colors, radius } from '../../theme';
import { AppText } from '../ui/AppText';

interface Props {
  from: ISODate;
  to: ISODate;
  logs: Map<ISODate, AdherenceLog>;
  onSelectDay?: (date: ISODate) => void;
  selected?: ISODate;
  /** Dates in a different phase (e.g. washout) are drawn with a neutral tint. */
  secondaryRange?: { from: ISODate; to: ISODate };
}

export function AdherenceCalendar({ from, to, logs, onSelectDay, selected, secondaryRange }: Props) {
  const t = today();
  const weeks = useMemo(() => {
    const gridStart = addDays(from, -weekdayIndex(from));
    const gridEnd = addDays(to, 6 - weekdayIndex(to));
    const days = eachDay(gridStart, gridEnd);
    const rows: ISODate[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [from, to]);

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        {WEEKDAY_LETTER.map((l, i) => (
          <View key={i} style={styles.cellWrap}>
            <AppText variant="caption" color="textMuted" align="center" style={{ fontSize: 11 }}>
              {l}
            </AppText>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((d) => {
            const inRange = d >= from && d <= to;
            const inSecondary = !!secondaryRange && d >= secondaryRange.from && d <= secondaryRange.to;
            if (!inRange && !inSecondary) return <View key={d} style={styles.cellWrap} />;
            const log = logs.get(d);
            const future = d > t;
            const isToday = d === t;
            const isSelected = d === selected;

            let bg = colors.surfaceMuted;
            let fg = colors.textSecondary;
            let borderColor = 'transparent';
            let icon: 'checkmark' | 'close' | null = null;
            if (future) {
              bg = 'transparent';
              fg = colors.textMuted;
              borderColor = colors.border;
            } else if (log?.adhered) {
              bg = colors.primary;
              fg = colors.onPrimary;
              icon = 'checkmark';
            } else if (log && !log.adhered) {
              bg = colors.dangerSoft;
              fg = colors.danger;
              icon = 'close';
            } else {
              borderColor = colors.border;
              bg = colors.surface;
            }
            if (inSecondary && !inRange) {
              bg = log ? bg : colors.accentSoft;
            }
            const canPress = !!onSelectDay && !future;
            return (
              <View key={d} style={styles.cellWrap}>
                <Pressable
                  disabled={!canPress}
                  onPress={() => onSelectDay?.(d)}
                  style={[styles.cell, { backgroundColor: bg, borderColor: isSelected ? colors.text : borderColor, borderWidth: isSelected ? 2 : 1 }, isToday && styles.today]}
                  accessibilityRole="button"
                  accessibilityLabel={`${d}${log ? (log.adhered ? ', done' : ', missed') : ''}`}
                >
                  {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
                  <AppText variant="caption" color={fg} style={{ fontSize: 10, lineHeight: 12 }}>
                    {formatDayNumber(d)}
                  </AppText>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  cellWrap: { flex: 1 },
  cell: { aspectRatio: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 0 },
  today: { shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
});
