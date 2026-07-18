'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Point = { timestamp: string; totalRub: number };
type Props = { data: Point[]; color?: string };

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export function PortfolioLineChart({ data, color = '#2c6e62' }: Props) {
  if (data.length < 2) {
    return <div className="chart-empty">Недостаточно данных для графика</div>;
  }
  const prepared = data.map((point) => ({
    ...point,
    label: new Date(point.timestamp).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }),
    fullLabel: new Date(point.timestamp).toLocaleString('ru-RU')
  }));
  const values = data.map((point) => point.totalRub);
  const summary = `Последнее значение ${rub.format(values.at(-1) ?? 0)}, минимум ${rub.format(Math.min(...values))}, максимум ${rub.format(Math.max(...values))}.`;

  return (
    <>
      <p className="sr-only">{summary}</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={prepared}>
          <CartesianGrid strokeDasharray="2 4" stroke="#d9dfdd" />
          <XAxis dataKey="label" minTickGap={40} tick={{ fontSize: 12, fill: '#3f4946' }} />
          <YAxis tickFormatter={(value) => `${compact.format(value)} ₽`} tick={{ fontSize: 12, fill: '#3f4946' }} width={78} />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
            formatter={(value: number) => rub.format(value)}
          />
          <Line type="monotone" dataKey="totalRub" stroke={color} strokeWidth={2.4} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
