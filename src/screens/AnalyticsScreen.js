import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path, Line, Circle, Defs,
  LinearGradient as SvgLinearGradient, Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme, useApp } from '../context/AppContext';
import { useMealContext } from '../context/MealContext';
import { getTodayKey, getDateKey, computeStreak } from '../utils/nutrition';
import SourcesButton from '../components/SourcesButton';

// ─── Chart constants ───────────────────────────────────────────────────────────
const CHART_H  = 192;
const PAD      = { left: 46, right: 14, top: 18, bottom: 34 };
const TOOLTIP_W = 108;
const TOOLTIP_H = 46;
const DURATIONS = ['90 Days', '6 Months', '1 Year', 'All time'];

// ─── Placeholder chart data ────────────────────────────────────────────────────
const CHART_DATA = {
  '90 Days': {
    weight: [
      { label: 'Jan 9',  value: 182.4 }, { label: 'Jan 15', value: 181.2 },
      { label: 'Jan 21', value: 183.1 }, { label: 'Jan 27', value: 180.8 },
      { label: 'Feb 2',  value: 179.5 }, { label: 'Feb 8',  value: 178.9 },
      { label: 'Feb 14', value: 180.2 }, { label: 'Feb 20', value: 177.6 },
      { label: 'Feb 26', value: 176.4 }, { label: 'Mar 4',  value: 175.8 },
      { label: 'Mar 10', value: 177.1 }, { label: 'Mar 16', value: 174.9 },
      { label: 'Mar 22', value: 173.5 }, { label: 'Mar 28', value: 174.2 },
      { label: 'Apr 7',  value: 172.8 },
    ],
    calories: [
      { label: 'Jan 9',  value: 2650 }, { label: 'Jan 15', value: 2200 },
      { label: 'Jan 21', value: 2480 }, { label: 'Jan 27', value: 1950 },
      { label: 'Feb 2',  value: 2320 }, { label: 'Feb 8',  value: 2700 },
      { label: 'Feb 14', value: 2150 }, { label: 'Feb 20', value: 2420 },
      { label: 'Feb 26', value: 2080 }, { label: 'Mar 4',  value: 2550 },
      { label: 'Mar 10', value: 1880 }, { label: 'Mar 16', value: 2350 },
      { label: 'Mar 22', value: 2250 }, { label: 'Mar 28', value: 2100 },
      { label: 'Apr 7',  value: 2400 },
    ],
    labelStep: 3,
  },
  '6 Months': {
    weight: [
      { label: 'Oct 8',  value: 188.2 }, { label: 'Oct 22', value: 187.5 },
      { label: 'Nov 5',  value: 186.8 }, { label: 'Nov 19', value: 185.4 },
      { label: 'Dec 3',  value: 184.1 }, { label: 'Dec 17', value: 183.6 },
      { label: 'Jan 1',  value: 182.4 }, { label: 'Jan 15', value: 181.2 },
      { label: 'Feb 1',  value: 179.5 }, { label: 'Feb 15', value: 178.1 },
      { label: 'Mar 1',  value: 176.4 }, { label: 'Mar 15', value: 175.8 },
      { label: 'Apr 1',  value: 174.0 }, { label: 'Apr 8',  value: 172.8 },
    ],
    calories: [
      { label: 'Oct 8',  value: 2800 }, { label: 'Oct 22', value: 2500 },
      { label: 'Nov 5',  value: 2650 }, { label: 'Nov 19', value: 2300 },
      { label: 'Dec 3',  value: 2900 }, { label: 'Dec 17', value: 2100 },
      { label: 'Jan 1',  value: 2650 }, { label: 'Jan 15', value: 2200 },
      { label: 'Feb 1',  value: 2320 }, { label: 'Feb 15', value: 2480 },
      { label: 'Mar 1',  value: 2250 }, { label: 'Mar 15', value: 2380 },
      { label: 'Apr 1',  value: 2150 }, { label: 'Apr 8',  value: 2400 },
    ],
    labelStep: 3,
  },
  '1 Year': {
    weight: [
      { label: 'Apr 25', value: 196.0 }, { label: 'May 25', value: 194.2 },
      { label: 'Jun 25', value: 192.5 }, { label: 'Jul 25', value: 190.8 },
      { label: 'Aug 25', value: 188.6 }, { label: 'Sep 25', value: 186.4 },
      { label: 'Oct 25', value: 184.8 }, { label: 'Nov 25', value: 183.2 },
      { label: 'Dec 25', value: 181.6 }, { label: 'Jan 26', value: 180.2 },
      { label: 'Feb 26', value: 177.8 }, { label: 'Mar 26', value: 175.4 },
      { label: 'Apr 26', value: 172.8 },
    ],
    calories: [
      { label: 'Apr 25', value: 2850 }, { label: 'May 25', value: 2600 },
      { label: 'Jun 25', value: 2450 }, { label: 'Jul 25', value: 2700 },
      { label: 'Aug 25', value: 2300 }, { label: 'Sep 25', value: 2500 },
      { label: 'Oct 25', value: 2400 }, { label: 'Nov 25', value: 2650 },
      { label: 'Dec 25', value: 2200 }, { label: 'Jan 26', value: 2480 },
      { label: 'Feb 26', value: 2350 }, { label: 'Mar 26', value: 2250 },
      { label: 'Apr 26', value: 2400 },
    ],
    labelStep: 3,
  },
  'All time': {
    weight: [
      { label: 'Jan 24', value: 205.0 }, { label: 'Apr 24', value: 200.4 },
      { label: 'Jul 24', value: 196.0 }, { label: 'Oct 24', value: 190.2 },
      { label: 'Jan 25', value: 186.0 }, { label: 'Apr 25', value: 183.4 },
      { label: 'Jul 25', value: 179.8 }, { label: 'Oct 25', value: 177.2 },
      { label: 'Jan 26', value: 180.0 }, { label: 'Apr 26', value: 172.8 },
    ],
    calories: [
      { label: 'Jan 24', value: 2950 }, { label: 'Apr 24', value: 2800 },
      { label: 'Jul 24', value: 2650 }, { label: 'Oct 24', value: 2500 },
      { label: 'Jan 25', value: 2600 }, { label: 'Apr 25', value: 2450 },
      { label: 'Jul 25', value: 2380 }, { label: 'Oct 25', value: 2300 },
      { label: 'Jan 26', value: 2480 }, { label: 'Apr 26', value: 2400 },
    ],
    labelStep: 2,
  },
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const METRIC_GOAL = { weight: 168, calories: 2500 };
const GOAL_PCT = {
  weight:   { '90 Days': 67, '6 Months': 76, '1 Year': 83, 'All time': 87 },
  calories: { '90 Days': 74, '6 Months': 69, '1 Year': 78, 'All time': 72 },
};
const MOTIV = [
  "Every step counts. Keep going!",
  "Halfway there! Stay consistent.",
  "Great job! Consistency is key, and you're mastering it!",
  "Almost there! Keep pushing!",
];
function motivMsg(pct) {
  if (pct >= 85) return MOTIV[3];
  if (pct >= 70) return MOTIV[2];
  if (pct >= 50) return MOTIV[1];
  return MOTIV[0];
}

// ─── Smooth bezier path builder ───────────────────────────────────────────────
function buildLinePath(pts) {
  if (pts.length < 2) return '';
  const n = pts.length;
  const T = 0.45;
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) * T / 2;
    const cp1y = p1.y + (p2.y - p0.y) * T / 2;
    const cp2x = p2.x - (p3.x - p1.x) * T / 2;
    const cp2y = p2.y - (p3.y - p1.y) * T / 2;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function fmtValue(v, metric) {
  return metric === 'weight' ? `${v.toFixed(1)} lbs` : `${v.toLocaleString()} kcal`;
}

// ─── Styles factory ───────────────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 110 },

  header: { paddingTop: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:  { fontSize: 22, fontWeight: '700', color: c.white },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard:  { flex: 1, minWidth: '44%', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, gap: 3 },
  statIcon:  { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '800', color: c.white, letterSpacing: -0.5 },
  statUnit:  { fontSize: 12, color: c.muted },
  statLabel: { fontSize: 12, color: c.muted, fontWeight: '500' },

  section:      { backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: c.white, marginBottom: 2 },
  sectionSub:   { fontSize: 12, color: c.muted, marginBottom: 14 },

  // GoalProgressChart
  chartHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  goalPctBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  goalPctText:       { fontSize: 11, fontWeight: '700' },
  durationRow:       { flexDirection: 'row', backgroundColor: c.card2, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: c.border, marginBottom: 12 },
  durationBtn:       { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 10 },
  durationBtnActive: { backgroundColor: c.border },
  durationText:      { fontSize: 12, fontWeight: '600', color: c.muted },
  durationTextActive:{ color: c.white },
  metricToggle:      { flexDirection: 'row', gap: 8, marginBottom: 10 },
  metricBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card2 },
  metricText:        { fontSize: 12, fontWeight: '600', color: c.muted },
  chartContainer:    { position: 'relative', marginBottom: 12 },
  tooltip: {
    position: 'absolute', width: TOOLTIP_W, height: TOOLTIP_H,
    backgroundColor: c.card2, borderRadius: 10, borderWidth: 1, borderColor: c.border,
    justifyContent: 'center', alignItems: 'center', gap: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
  },
  tooltipValue: { fontSize: 13, fontWeight: '800', color: c.white },
  tooltipDate:  { fontSize: 10, color: c.muted },
  motivRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  motivText:    { fontSize: 12, fontWeight: '600', flex: 1 },

  // Macro bars
  macrosList:    { gap: 14 },
  macroBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macroBarLeft:  { width: 90 },
  macroBarLabel: { fontSize: 13, fontWeight: '600', color: c.white },
  macroBarAmount:{ fontSize: 11, color: c.muted },
  macroBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' },
  macroBarFill:  { height: '100%', borderRadius: 4 },
  macroBarPct:   { width: 38, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  // Highlights
  highlightsRow: { flexDirection: 'row', gap: 10 },
  highlightCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  highlightValue:{ fontSize: 22, fontWeight: '800', color: c.white },
  highlightLabel:{ fontSize: 12, color: c.muted },
  highlightKcal: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});

// ─── GoalProgressChart ────────────────────────────────────────────────────────

function GoalProgressChart({ s }) {
  const c = useTheme();
  const [duration,   setDuration]   = useState('90 Days');
  const [metric,     setMetric]     = useState('calories');
  const [chartWidth, setChartWidth] = useState(320);
  const [tooltip,    setTooltip]    = useState(null);

  const onLayout = useCallback((e) => { setChartWidth(e.nativeEvent.layout.width); setTooltip(null); }, []);

  const config    = CHART_DATA[duration];
  const series    = config[metric];
  const goal      = METRIC_GOAL[metric];
  const lineColor = metric === 'weight' ? c.green : c.accent;
  const goalPct   = GOAL_PCT[metric][duration];

  const values  = series.map((d) => d.value);
  const rawMin  = Math.min(...values, goal);
  const rawMax  = Math.max(...values, goal);
  const pad     = (rawMax - rawMin) * 0.18;
  const yMin    = rawMin - pad;
  const yMax    = rawMax + pad;

  const plotW = chartWidth - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const sx = (i) => PAD.left + (i / (series.length - 1)) * plotW;
  const sy = (v) => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const pts      = series.map((d, i) => ({ x: sx(i), y: sy(d.value) }));
  const linePath = buildLinePath(pts);
  const fillPath = linePath + ` L ${pts[pts.length - 1].x},${PAD.top + plotH} L ${pts[0].x},${PAD.top + plotH} Z`;
  const goalY = sy(goal);

  const Y_TICKS = 4;
  const yTickStep = (yMax - yMin) / (Y_TICKS - 1);
  const yTicks = Array.from({ length: Y_TICKS }, (_, i) => yMin + i * yTickStep);

  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:    (e) => handleTouch(e.nativeEvent.locationX),
      onPanResponderMove:     (e) => handleTouch(e.nativeEvent.locationX),
      onPanResponderRelease:  () => setTooltip(null),
      onPanResponderTerminate:() => setTooltip(null),
    })
  ).current;

  const ptsRef    = useRef(pts);
  const seriesRef = useRef(series);
  ptsRef.current    = pts;
  seriesRef.current = series;

  function handleTouch(touchX) {
    let minDist = Infinity, nearest = 0;
    ptsRef.current.forEach((p, i) => { const d = Math.abs(p.x - touchX); if (d < minDist) { minDist = d; nearest = i; } });
    const p = ptsRef.current[nearest];
    const sv = seriesRef.current[nearest];
    setTooltip({ x: p.x, y: p.y, value: sv.value, label: sv.label });
  }

  const ttLeft = tooltip ? Math.max(0, Math.min(chartWidth - TOOLTIP_W, tooltip.x - TOOLTIP_W / 2)) : 0;
  const ttTop  = tooltip ? (tooltip.y < CHART_H / 2 ? tooltip.y + 12 : tooltip.y - TOOLTIP_H - 12) : 0;

  return (
    <View style={s.section}>
      <View style={s.chartHeader}>
        <Text style={s.sectionTitle}>Goal Progress</Text>
        <View style={[s.goalPctBadge, { borderColor: lineColor + '55', backgroundColor: lineColor + '11' }]}>
          <Ionicons name="flag" size={11} color={lineColor} />
          <Text style={[s.goalPctText, { color: lineColor }]}>{goalPct}% of goal done</Text>
          <Ionicons name="pencil-outline" size={11} color={c.muted} />
        </View>
      </View>

      <View style={s.durationRow}>
        {DURATIONS.map((d) => (
          <TouchableOpacity key={d} style={[s.durationBtn, duration === d && s.durationBtnActive]} onPress={() => { setDuration(d); setTooltip(null); }} activeOpacity={0.7}>
            <Text style={[s.durationText, duration === d && s.durationTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>


      <View style={s.chartContainer} onLayout={onLayout}>
        <Svg width={chartWidth} height={CHART_H}>
          <Defs>
            <SvgLinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity={0.28} />
              <Stop offset="1" stopColor={lineColor} stopOpacity={0.01} />
            </SvgLinearGradient>
          </Defs>

          {yTicks.map((v, i) => {
            const yPos = sy(v);
            return (
              <React.Fragment key={i}>
                <Line x1={PAD.left} y1={yPos} x2={PAD.left + plotW} y2={yPos} stroke={c.border} strokeWidth={1} strokeDasharray="4,4" />
                <SvgText x={PAD.left - 6} y={yPos + 4} textAnchor="end" fontSize={9} fill={c.muted}>
                  {metric === 'weight' ? v.toFixed(0) : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
                </SvgText>
              </React.Fragment>
            );
          })}

          <Line x1={PAD.left} y1={goalY} x2={PAD.left + plotW} y2={goalY} stroke={c.fire} strokeWidth={1.2} strokeDasharray="5,4" opacity={0.7} />
          <SvgText x={PAD.left + plotW + 2} y={goalY - 3} fontSize={8} fill={c.fire} opacity={0.8}>Goal</SvgText>

          <Path d={fillPath} fill="url(#fillGrad)" />
          <Path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

          {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={lineColor} opacity={0.5} />)}

          {series.map((d, i) => {
            if (i % config.labelStep !== 0) return null;
            return <SvgText key={i} x={sx(i)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={9} fill={c.muted}>{d.label}</SvgText>;
          })}

          {tooltip && (
            <>
              <Line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + plotH} stroke={c.white} strokeWidth={1} opacity={0.18} />
              <Circle cx={tooltip.x} cy={tooltip.y} r={8} fill={lineColor} opacity={0.18} />
              <Circle cx={tooltip.x} cy={tooltip.y} r={4} fill={lineColor} />
              <Circle cx={tooltip.x} cy={tooltip.y} r={2} fill={c.white} />
            </>
          )}
        </Svg>

        <View style={StyleSheet.absoluteFill} {...panRef.panHandlers} />

        {tooltip && (
          <View style={[s.tooltip, { left: ttLeft, top: ttTop }]}>
            <Text style={s.tooltipValue}>{fmtValue(tooltip.value, metric)}</Text>
            <Text style={s.tooltipDate}>{tooltip.label}</Text>
          </View>
        )}
      </View>

      <View style={[s.motivRow, { borderColor: lineColor + '33', backgroundColor: lineColor + '11' }]}>
        <Ionicons name="checkmark-circle" size={14} color={lineColor} />
        <Text style={[s.motivText, { color: lineColor }]}>{motivMsg(goalPct)}</Text>
      </View>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MacroBar({ item, s }) {
  const pct = Math.min(item.grams / item.goal, 1);
  return (
    <View style={s.macroBarRow}>
      <View style={s.macroBarLeft}>
        <Text style={s.macroBarLabel}>{item.label}</Text>
        <Text style={s.macroBarAmount}>{item.grams}g / {item.goal}g</Text>
      </View>
      <View style={s.macroBarTrack}>
        <View style={[s.macroBarFill, { width: `${pct * 100}%`, backgroundColor: item.color }]} />
      </View>
      <Text style={[s.macroBarPct, { color: item.color }]}>{Math.round(pct * 100)}%</Text>
    </View>
  );
}

function StatCard({ stat, s }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: stat.color + '22' }]}>
        <Ionicons name={stat.icon} size={18} color={stat.color} />
      </View>
      <Text style={s.statValue}>{stat.value}</Text>
      <Text style={s.statUnit}>{stat.unit}</Text>
      <Text style={s.statLabel}>{stat.label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const { state }                                    = useApp();
  const { totals: liveTotals }                       = useMealContext();
  const dailyLogs                                    = state.dailyLogs  || {};
  const profile                                      = state.userProfile || {};
  const calorieGoal                                  = profile.calorieTarget || 2000;

  // ── Derived stats from last 7 days ─────────────────────────────────────────
  const { avgCalories, daysOnTrack } = useMemo(() => {
    const today = new Date();
    let totalCal = 0;
    let loggedDays = 0;
    let onTrack = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      const log = dailyLogs[key];
      const cal = log?.calories ?? 0;
      if (cal > 0) {
        totalCal += cal;
        loggedDays++;
        if (cal <= calorieGoal) onTrack++;
      }
    }
    return {
      avgCalories: loggedDays > 0 ? Math.round(totalCal / loggedDays) : 0,
      daysOnTrack: onTrack,
    };
  }, [dailyLogs, calorieGoal]);

  const streak = useMemo(() => computeStreak(dailyLogs), [dailyLogs]);

  const MACROS = useMemo(() => [
    { label: 'Protein', grams: Math.round(liveTotals.protein), goal: profile.proteinTarget || 150, color: c.protein },
    { label: 'Carbs',   grams: Math.round(liveTotals.carbs),   goal: profile.carbTarget    || 225, color: c.carbs   },
    { label: 'Fat',     grams: Math.round(liveTotals.fat),     goal: profile.fatTarget     || 56,  color: c.fat     },
  ], [liveTotals, profile, c]);

  const weeklyHighlights = useMemo(() => {
    const today = new Date();
    let best = null; // { dayName, cal } — lowest logged calories
    let peak = null; // { dayName, cal } — highest logged calories
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      const cal = dailyLogs[key]?.calories ?? 0;
      if (cal <= 0) continue;
      const dayName = DAY_NAMES[d.getDay()];
      if (!best || cal < best.cal) best = { dayName, cal };
      if (!peak || cal > peak.cal) peak = { dayName, cal };
    }
    return { best, peak };
  }, [dailyLogs]);

  const STATS = useMemo(() => [
    { label: 'Avg Calories',   value: avgCalories > 0 ? avgCalories.toLocaleString() : '—', unit: 'kcal', icon: 'flame',            color: c.fire    },
    { label: 'Calorie Goal',   value: calorieGoal.toLocaleString(),                          unit: 'kcal', icon: 'flag',             color: c.accent  },
    { label: 'Days on Track',  value: String(daysOnTrack),                                   unit: 'of 7', icon: 'checkmark-circle', color: c.green   },
    { label: 'Current Streak', value: String(streak),                                        unit: 'days', icon: 'trending-up',      color: c.fat     },
  ], [avgCalories, calorieGoal, daysOnTrack, streak, c]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        <View style={s.header}>
          <Text style={s.title}>Analytics</Text>
        </View>

        <View style={s.statsGrid}>
          {STATS.map((st) => <StatCard key={st.label} stat={st} s={s} />)}
        </View>

        <GoalProgressChart s={s} />

        <View style={s.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Text style={s.sectionTitle}>Today's Macros</Text>
            <SourcesButton />
          </View>
          <Text style={s.sectionSub}>Average vs. daily targets</Text>
          <View style={s.macrosList}>
            {MACROS.map((m) => <MacroBar key={m.label} item={m} s={s} />)}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Weekly Highlights</Text>
          <View style={s.highlightsRow}>
            <View style={[s.highlightCard, { borderColor: c.green + '44', backgroundColor: c.greenDim }]}>
              <Ionicons name="trending-up" size={20} color={c.green} />
              <Text style={s.highlightValue}>{weeklyHighlights.best?.dayName ?? '—'}</Text>
              <Text style={s.highlightLabel}>Best day</Text>
              {weeklyHighlights.best && (
                <Text style={[s.highlightKcal, { color: c.green }]}>
                  {weeklyHighlights.best.cal.toLocaleString()} kcal
                </Text>
              )}
            </View>
            <View style={[s.highlightCard, { borderColor: c.protein + '44', backgroundColor: c.redDim }]}>
              <Ionicons name="trending-down" size={20} color={c.protein} />
              <Text style={s.highlightValue}>{weeklyHighlights.peak?.dayName ?? '—'}</Text>
              <Text style={s.highlightLabel}>
                {weeklyHighlights.peak && weeklyHighlights.peak.cal > calorieGoal ? 'Over goal' : 'Highest day'}
              </Text>
              {weeklyHighlights.peak && (
                <Text style={[s.highlightKcal, { color: c.protein }]}>
                  {weeklyHighlights.peak.cal.toLocaleString()} kcal
                </Text>
              )}
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
