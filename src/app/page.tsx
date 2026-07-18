import Link from 'next/link';
import { PortfolioLineChart } from '@/components/line-chart';
import { RefreshControl } from '@/components/refresh-control';
import { getDashboardData } from '@/lib/services/portfolio-service';
import { SOURCE_METADATA } from '@/lib/sources/metadata';
import type { HistoryRange } from '@/lib/db/portfolio-repository';
import type { SourceStatus, ValueChange } from '@/types/portfolio';

export const dynamic = 'force-dynamic';

const currency = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 0
});
const ranges: Array<{ id: HistoryRange; label: string }> = [
  { id: '24h', label: '24 ч' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: 'all', label: 'Всё' }
];
const statusLabels: Record<SourceStatus, string> = {
  ok: 'Актуально',
  partial: 'Частично',
  stale: 'Устарело',
  disabled: 'Не настроено',
  error: 'Ошибка'
};

function Change({ value }: { value: ValueChange }) {
  if (!value) return <span className="change neutral">Нет данных для сравнения</span>;
  const sign = value.absoluteRub > 0 ? '+' : '';
  return (
    <span className={`change ${value.absoluteRub > 0 ? 'positive' : value.absoluteRub < 0 ? 'negative' : 'neutral'}`}>
      {sign}{currency.format(value.absoluteRub)}
      {value.percentage !== null && ` · ${sign}${value.percentage.toFixed(1)}%`}
    </span>
  );
}

function ageLabel(timestamp: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 60000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: { range?: string };
}) {
  const range = ranges.some((item) => item.id === searchParams?.range)
    ? searchParams!.range as HistoryRange
    : '7d';
  const { snapshot, totalHistory, sourceHistory } = await getDashboardData(range);

  if (!snapshot) {
    return (
      <main>
        <header className="page-header">
          <div><p className="muted">Portfolio Exporter</p><h1>Стоимость портфеля</h1></div>
          <RefreshControl />
        </header>
        <section className="card empty-state">
          <h2>Снимков пока нет</h2>
          <p className="muted">Запустите первое обновление, чтобы собрать настроенные источники.</p>
        </section>
      </main>
    );
  }

  const overallLabel = snapshot.freshness === 'complete'
    ? 'Полный'
    : snapshot.freshness === 'stale'
      ? 'Устарел'
      : snapshot.freshness === 'not_configured' ? 'Не настроено' : 'Частичный';

  return (
    <main>
      <header className="page-header">
        <div>
          <p className="muted">Portfolio Exporter</p>
          <h1>Стоимость портфеля</h1>
          <p className="muted updated-at">
            Обновлено {new Date(snapshot.capturedAt).toLocaleString('ru-RU')} · {ageLabel(snapshot.capturedAt)}
          </p>
        </div>
        <RefreshControl />
      </header>

      <section className="card total-card">
        <div className="card-heading">
          <p className="muted">Общая стоимость</p>
          <span className={`badge ${snapshot.freshness}`}>{overallLabel}</span>
        </div>
        <p className="value">{currency.format(snapshot.totalRub)}</p>
        <Change value={snapshot.change} />
        {snapshot.containsStaleValues && (
          <p className="warning">Итог содержит последние известные значения недоступных источников.</p>
        )}
      </section>

      <section className="grid grid-3 source-grid">
        {snapshot.components.map((component) => (
          <article className={`card source-card status-${component.status}`} key={component.sourceId}>
            <div className="card-heading">
              <p className="muted">{component.sourceName}</p>
              <span className={`badge ${component.status}`}>{statusLabels[component.status]}</span>
            </div>
            <p className="value source-value">{currency.format(component.totalRub)}</p>
            <Change value={component.change} />
            {component.status !== 'disabled' && (
              <p className="observation">Данные: {new Date(component.observedAt).toLocaleString('ru-RU')}</p>
            )}
            {component.message && <p className="warning">{component.message}</p>}
          </article>
        ))}
      </section>

      <nav className="range-control" aria-label="Диапазон истории">
        {ranges.map((item) => (
          <Link className={range === item.id ? 'active' : ''} href={`/?range=${item.id}`} key={item.id}>
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="card chart-card">
        <h2 className="section-title">Динамика общего портфеля</h2>
        <PortfolioLineChart data={totalHistory} color="#2c6e62" />
      </section>

      <section className="grid grid-3">
        {snapshot.components.filter((item) => item.status !== 'disabled').map((component) => (
          <article className="card" key={`${component.sourceId}-chart`}>
            <h3 className="section-title">{component.sourceName}</h3>
            <PortfolioLineChart
              data={sourceHistory[component.sourceId] ?? []}
              color={SOURCE_METADATA[component.sourceId].color}
            />
          </article>
        ))}
      </section>
    </main>
  );
}
