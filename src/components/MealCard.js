import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';

export default function MealCard({ title, calories, items, time, logged, icon }) {
  return (
    <View style={[styles.card, !logged && styles.cardEmpty]}>
      <View style={styles.left}>
        <View style={[styles.iconBox, { backgroundColor: logged ? COLORS.accentDim : COLORS.borderLight }]}>
          <Text style={styles.mealIcon}>{icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>{title}</Text>
          {logged ? (
            <Text style={styles.items} numberOfLines={1}>{items}</Text>
          ) : (
            <Text style={styles.emptyLabel}>Not logged yet</Text>
          )}
        </View>
      </View>

      <View style={styles.right}>
        {logged ? (
          <>
            <Text style={styles.calories}>{calories}</Text>
            <Text style={styles.kcal}>kcal</Text>
          </>
        ) : (
          <TouchableOpacity style={styles.addBtn}>
            <Ionicons name="add" size={18} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardEmpty: {
    borderStyle: 'dashed',
    borderColor: COLORS.borderLight,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mealIcon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  items: {
    color: COLORS.textSub,
    fontSize: 12,
  },
  emptyLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  right: {
    alignItems: 'flex-end',
  },
  calories: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  kcal: {
    color: COLORS.textSub,
    fontSize: 11,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
