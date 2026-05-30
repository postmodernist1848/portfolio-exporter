'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type Point = {
  timestamp: string;
  totalRub: number;
};

type Props = {
  data: Point[];
  color?: string;
};

const formatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

export function PortfolioLineChart({ data, color = '#2c6e62' }: Props) {
  const prepared = data.map((point) => ({
    ...point,
    label: new Date(point.timestamp).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={prepared}>
        <CartesianGrid strokeDasharray="2 4" stroke="#d9dfdd" />
        <XAxis dataKey="label" minTickGap={40} tick={{ fontSize: 12, fill: '#3f4946' }} />
        <YAxis tickFormatter={(value) => formatter.format(value)} tick={{ fontSize: 12, fill: '#3f4946' }} width={110} />
        <Tooltip formatter={(value: number) => formatter.format(value)} />
        <Line type="monotone" dataKey="totalRub" stroke={color} strokeWidth={2.4} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
