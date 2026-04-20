import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../theme';

export default function NutrientBar({ label, value, max, unit, color, icon }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const displayPct = Math.round(pct * 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.values}>
          <Text style={[styles.current, { color }]}>{value}{unit}</Text>
          <Text style={styles.separator}> / </Text>
          <Text style={styles.max}>{max}{unit}</Text>
        </Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${displayPct}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>

      <Text style={[styles.pct, { color }]}>{displayPct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 15,
  },
  label: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  values: {
    fontSize: 13,
  },
  current: {
    fontWeight: '700',
    fontSize: 14,
  },
  separator: {
    color: COLORS.textMuted,
  },
  max: {
    color: COLORS.textSub,
    fontWeight: '500',
  },
  track: {
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  pct: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },
});
