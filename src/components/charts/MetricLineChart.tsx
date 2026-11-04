/**
 * Line chart for one metric over time. Draws raw daily values as a faint line
 * and a 7-day rolling average as the main line. Optional phase bands (shaded
 * backgrounds), vertical markers ("intervention start"), a horizontal reference
 * line (baseline mean) and flagged-day ticks (illness, travel). Hover or drag a
 * finger across it to read individual days. Built on react-native-svg so it
 * renders the same on web and native.
 */
import { scaleLinear } from 'd3-scale';
import { curveMonotoneX, line as d3line } from 'd3-shape';
import React, { useCallback, useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { formatAxisValue, formatMetricValue } from '../../domain/metrics';
import { rollingMean, type Point } from '../../domain/stats';
import type { ISODate, MetricId, ReadingFlag } from '../../domain/types';
import { addDays, diffDays, formatDayMonth, formatMonth, formatShort } from '../../utils/dates';
import { colors } from '../../theme';
import { AppText } from '../ui/AppText';

export interface ChartBand {
  from: ISODate;
  to: ISODate;
  color: string;
  label?: string;
}

export interface ChartMarker {
  date: ISODate;
  label: string;
  color: string;
}

export interface ChartFlag {
  date: ISODate;
  flags: ReadingFlag[];
}

interface Props {
  metricId: MetricId;
  points: Point[];
  from?: ISODate;
  to?: ISODate;
  showRaw?: boolean;
  showRolling?: boolean;
  rollingWindow?: number;
  bands?: ChartBand[];
  markers?: ChartMarker[];
  flagged?: ChartFlag[];
  referenceLine?: { value: number; label: string };
  height?: number;
  lineColor?: string;
}

const MARGIN = { top: 18, right: 12, bottom: 24, left: 38 };

export function MetricLineChart({
  metricId,
  points,
  from,
  to,
  showRaw = true,
  showRolling = true,
  rollingWindow = 7,
  bands = [],
  markers = [],
  flagged = [],
  referenceLine,
  height = 200,
  lineColor = colors.chartLine,
}: Props) {
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const model = useMemo(() => {
    const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
    const domainFrom = from ?? sorted[0]?.date;
    const domainTo = to ?? sorted[sorted.length - 1]?.date;
    if (!domainFrom || !domainTo) return null;
    const visible = sorted.filter((p) => p.date >= domainFrom && p.date <= domainTo);
    // Rolling mean needs a little run-up before the visible window to start cleanly.
    const runUp = sorted.filter((p) => p.date >= addDays(domainFrom, -rollingWindow) && p.date <= domainTo);
    const rolling = rollingMean(runUp, rollingWindow).filter((p) => p.date >= domainFrom);
    const rollingByDate = new Map(rolling.map((p) => [p.date, p.value] as const));
    const values = [...visible.map((p) => p.value), ...rolling.map((p) => p.value)];
    if (referenceLine) values.push(referenceLine.value);
    if (values.length === 0) return null;
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return { domainFrom, domainTo, visible, rolling, rollingByDate, lo: lo - pad, hi: hi + pad };
  }, [points, from, to, rollingWindow, referenceLine]);

  const flagsByDate = useMemo(() => new Map(flagged.map((f) => [f.date, f.flags] as const)), [flagged]);

  const setHoverFromX = useCallback((localX: number) => setHoverX(localX - MARGIN.left), []);
  const clearHover = useCallback(() => setHoverX(null), []);
  const onResponder = (e: GestureResponderEvent) => setHoverFromX(e.nativeEvent.locationX);

  if (!model) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }} onLayout={onLayout}>
        <AppText variant="caption" color="textMuted">
          No data in this range
        </AppText>
      </View>
    );
  }

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const totalDays = Math.max(1, diffDays(model.domainFrom, model.domainTo));
  const x = scaleLinear().domain([0, totalDays]).range([0, innerW]);
  const y = scaleLinear().domain([model.lo, model.hi]).range([innerH, 0]);
  const xOf = (d: ISODate) => x(diffDays(model.domainFrom, d));
  const yTicks = y.ticks(4);

  // X-axis labels: ~4 evenly spaced, month names when the window is long.
  const tickCount = innerW > 300 ? 5 : 4;
  const xTickDays = Array.from({ length: tickCount }, (_, i) => Math.round((totalDays * i) / (tickCount - 1)));
  const longRange = totalDays > 120;
  const xLabel = (dayOffset: number) => {
    const d = addDays(model.domainFrom, dayOffset);
    return longRange ? formatMonth(d) : formatDayMonth(d);
  };

  const pathOf = (pts: Point[]) =>
    d3line<Point>()
      .x((p) => xOf(p.date))
      .y((p) => y(p.value))
      .curve(curveMonotoneX)(pts) ?? '';

  // Break the raw line where more than 3 days are missing, so gaps show as gaps.
  const rawSegments: Point[][] = [];
  for (const p of model.visible) {
    const seg = rawSegments[rawSegments.length - 1];
    if (!seg || diffDays(seg[seg.length - 1].date, p.date) > 3) rawSegments.push([p]);
    else seg.push(p);
  }

  const last = model.rolling[model.rolling.length - 1] ?? model.visible[model.visible.length - 1];

  // Hovered day: nearest visible point to the pointer.
  let hover: { point: Point; rolling?: number; flags?: ReadingFlag[] } | null = null;
  if (hoverX !== null && model.visible.length > 0 && innerW > 0) {
    const day = x.invert(Math.max(0, Math.min(innerW, hoverX)));
    let best = model.visible[0];
    let bestDist = Infinity;
    for (const p of model.visible) {
      const dist = Math.abs(diffDays(model.domainFrom, p.date) - day);
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    hover = { point: best, rolling: model.rollingByDate.get(best.date), flags: flagsByDate.get(best.date) };
  }

  const tooltipLines = hover
    ? [formatShort(hover.point.date), `${formatMetricValue(metricId, hover.point.value)}${hover.rolling !== undefined ? `  ·  7d ${formatMetricValue(metricId, hover.rolling, false)}` : ''}`, ...(hover.flags?.length ? [hover.flags.join(', ')] : [])]
    : [];
  const tooltipW = Math.max(...tooltipLines.map((l) => l.length), 10) * 5.6 + 12;
  const tooltipH = tooltipLines.length * 13 + 8;
  const hoverPx = hover ? xOf(hover.point.date) : 0;
  const tooltipX = hover ? (hoverPx + 10 + tooltipW > innerW ? hoverPx - 10 - tooltipW : hoverPx + 10) : 0;

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onResponder}
      onResponderMove={onResponder}
      onResponderRelease={clearHover}
      onResponderTerminate={clearHover}
      onPointerMove={(e) => setHoverFromX(e.nativeEvent.offsetX)}
      onPointerLeave={clearHover}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          <G x={MARGIN.left} y={MARGIN.top}>
            {/* phase bands */}
            {bands.map((b, i) => {
              const x0 = Math.max(0, xOf(b.from));
              const x1 = Math.min(innerW, xOf(addDays(b.to, 1)));
              if (x1 <= x0) return null;
              return (
                <G key={`band-${i}`}>
                  <Rect x={x0} y={0} width={x1 - x0} height={innerH} fill={b.color} opacity={0.35} />
                  {b.label && x1 - x0 > 40 && (
                    <SvgText x={x0 + 4} y={-6} fontSize={10} fill={colors.textMuted} fontWeight="600">
                      {b.label}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* grid + y labels */}
            {yTicks.map((t) => (
              <G key={`y-${t}`}>
                <Line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke={colors.chartGrid} strokeWidth={1} />
                <SvgText x={-8} y={y(t) + 3.5} fontSize={10} fill={colors.textMuted} textAnchor="end">
                  {formatAxisValue(metricId, t)}
                </SvgText>
              </G>
            ))}

            {/* x labels */}
            {xTickDays.map((d, i) => (
              <SvgText
                key={`x-${d}`}
                x={x(d)}
                y={innerH + 16}
                fontSize={10}
                fill={colors.textMuted}
                textAnchor={i === 0 ? 'start' : i === xTickDays.length - 1 ? 'end' : 'middle'}
              >
                {xLabel(d)}
              </SvgText>
            ))}

            {/* flagged days */}
            {flagged.map((f) => {
              const fx = xOf(f.date);
              if (fx < 0 || fx > innerW) return null;
              return <Rect key={`f-${f.date}`} x={fx - 1.5} y={innerH + 1} width={3} height={4} rx={1} fill={colors.accent} />;
            })}

            {/* reference line */}
            {referenceLine && (
              <G>
                <Line x1={0} x2={innerW} y1={y(referenceLine.value)} y2={y(referenceLine.value)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="4 4" />
                <SvgText x={innerW} y={y(referenceLine.value) - 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
                  {referenceLine.label}
                </SvgText>
              </G>
            )}

            {/* raw */}
            {showRaw &&
              rawSegments.map((seg, i) =>
                seg.length === 1 ? (
                  <Circle key={`raw-${i}`} cx={xOf(seg[0].date)} cy={y(seg[0].value)} r={1.5} fill={lineColor} opacity={0.35} />
                ) : (
                  <Path key={`raw-${i}`} d={pathOf(seg)} stroke={lineColor} strokeWidth={1} fill="none" opacity={showRolling ? 0.3 : 0.9} />
                ),
              )}

            {/* rolling */}
            {showRolling && model.rolling.length > 1 && <Path d={pathOf(model.rolling)} stroke={lineColor} strokeWidth={2.25} fill="none" strokeLinejoin="round" />}

            {/* markers */}
            {markers.map((m, i) => {
              const mx = xOf(m.date);
              if (mx < 0 || mx > innerW) return null;
              return (
                <G key={`m-${i}`}>
                  <Line x1={mx} x2={mx} y1={-4} y2={innerH} stroke={m.color} strokeWidth={1.5} strokeDasharray="3 3" />
                  {m.label ? (
                    <SvgText x={mx + 4} y={-6} fontSize={10} fill={m.color} fontWeight="600">
                      {m.label}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}

            {/* latest point */}
            {last && !hover && <Circle cx={xOf(last.date)} cy={y(last.value)} r={3.5} fill={lineColor} stroke={colors.surface} strokeWidth={1.5} />}

            {/* hover readout */}
            {hover && (
              <G>
                <Line x1={hoverPx} x2={hoverPx} y1={0} y2={innerH} stroke={colors.text} strokeWidth={1} opacity={0.5} />
                <Circle cx={hoverPx} cy={y(hover.point.value)} r={4} fill={colors.surface} stroke={lineColor} strokeWidth={2} />
                {hover.rolling !== undefined && <Circle cx={hoverPx} cy={y(hover.rolling)} r={3} fill={lineColor} />}
                <Rect x={tooltipX} y={2} width={tooltipW} height={tooltipH} rx={6} fill={colors.text} opacity={0.92} />
                {tooltipLines.map((line, i) => (
                  <SvgText key={i} x={tooltipX + 6} y={14 + i * 13} fontSize={10} fill={colors.surface} fontWeight={i === 0 ? '600' : '400'}>
                    {line}
                  </SvgText>
                ))}
              </G>
            )}
          </G>
        </Svg>
      )}
    </View>
  );
}
