'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoscowChartLabel, formatMoscowDateTime } from '@/lib/format/date';

type Point = { timestamp: string; totalRub: number };
type Props = { data: Point[]; color?: string };

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export function chartValueDomain(values: number[]): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum;
  const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum));
  const padding = spread === 0
    ? Math.max(magnitude * 0.01, 1)
    : Math.max(spread * 0.12, magnitude * 0.001);

  return [minimum - padding, maximum + padding];
}

export function PortfolioLineChart({ data, color = '#2c6e62' }: Props) {
  if (data.length < 2) {
    return <div className="chart-empty">Недостаточно данных для графика</div>;
  }
  const prepared = data.map((point) => ({
    ...point,
    timestampMs: Date.parse(point.timestamp),
    label: formatMoscowChartLabel(point.timestamp),
    fullLabel: formatMoscowDateTime(point.timestamp)
  }));
  const values = data.map((point) => point.totalRub);
  const valueDomain = chartValueDomain(values);
  const summary = `Последнее значение ${rub.format(values.at(-1) ?? 0)}, минимум ${rub.format(Math.min(...values))}, максимум ${rub.format(Math.max(...values))}.`;

  return (
    <>
      <p className="sr-only">{summary}</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={prepared} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#d9dfdd" />
          <XAxis
            dataKey="timestampMs"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            minTickGap={40}
            tickFormatter={(value: number) => formatMoscowChartLabel(new Date(value).toISOString())}
            tick={{ fontSize: 12, fill: '#3f4946' }}
          />
          <YAxis
            domain={valueDomain}
            tickCount={5}
            allowDataOverflow
            tickFormatter={(value) => `${compact.format(value)} ₽`}
            tick={{ fontSize: 12, fill: '#3f4946' }}
            width={78}
          />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
            formatter={(value) => [rub.format(Number(value ?? 0)), 'Стоимость']}
          />
          <Line type="monotone" dataKey="totalRub" stroke={color} strokeWidth={2.4} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
