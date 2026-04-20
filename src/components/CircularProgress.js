import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * SVG donut ring progress indicator.
 * progress: 0.0 → 1.0 (clamped — values > 1 fill the ring fully).
 */
export default function CircularProgress({
  size        = 100,
  strokeWidth = 8,
  progress    = 0,
  color       = '#FFFFFF',
  trackColor  = '#2A2A3A',
  children,
}) {
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const p    = Math.min(Math.max(progress, 0), 1);
  const offset = circ * (1 - p);

  return (
    <View style={{ width: size, height: size }}>
      {/* SVG rotated so arc starts from top */}
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      {/* Center slot */}
      {children && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center', alignItems: 'center',
        }}>
          {children}
        </View>
      )}
    </View>
  );
}
