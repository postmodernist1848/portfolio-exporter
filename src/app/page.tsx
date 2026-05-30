import { PortfolioLineChart } from '@/components/line-chart';
import { getDashboardData } from '@/lib/services/portfolio-service';

export const dynamic = 'force-dynamic';

const currency = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

export default async function HomePage() {
  const { snapshot, totalHistory, sourceHistory } = await getDashboardData();
  const componentErrors = snapshot.components
    .map((component) => {
      const details = component.details ?? {};
      const error = typeof details.error === 'string' ? details.error : null;
      const status = typeof details.status === 'string' ? details.status : null;
      const message = error ?? status;
      return message ? { sourceId: component.sourceId, sourceName: component.sourceName, message } : null;
    })
    .filter(Boolean) as Array<{ sourceId: string; sourceName: string; message: string }>;

  return (
    <main>
      <header className="page-header">
        <div>
          <p className="muted">Portfolio Exporter</p>
          <h1>Стоимость портфеля</h1>
        </div>
        <p className="muted">
          Обновлено: {new Date(snapshot.capturedAt).toLocaleString('ru-RU')}
        </p>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <p className="muted">Общая стоимость</p>
        <p className="value">{currency.format(snapshot.totalRub)}</p>
      </section>

      {componentErrors.length > 0 && (
        <section className="card error-card" style={{ marginBottom: 16 }}>
          <p className="error-title">Есть ошибки обновления источников:</p>
          {componentErrors.map((item) => (
            <p className="error-text" key={item.sourceId}>
              {item.sourceName}: {item.message}
            </p>
          ))}
        </section>
      )}

      <section className="grid grid-3" style={{ marginBottom: 16 }}>
        {snapshot.components.map((component) => (
          <article className="card" key={component.sourceId}>
            <p className="muted">{component.sourceName}</p>
            <p className="value" style={{ fontSize: '1.55rem' }}>
              {currency.format(component.totalRub)}
            </p>
            {typeof component.details?.error === 'string' && (
              <p className="error-text" style={{ marginTop: 8 }}>
                {component.details.error}
              </p>
            )}
            {typeof component.details?.status === 'string' && typeof component.details?.error !== 'string' && (
              <p className="error-text" style={{ marginTop: 8 }}>
                {component.details.status}
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Динамика общего портфеля</h2>
        <div className="chart-wrap">
          <PortfolioLineChart data={totalHistory} color="#2c6e62" />
        </div>
      </section>

      <section className="grid grid-3">
        {snapshot.components.map((component) => (
          <article className="card" key={`${component.sourceId}-chart`}>
            <h3 className="section-title">{component.sourceName}</h3>
            <PortfolioLineChart
              data={sourceHistory[component.sourceId] ?? []}
              color={component.sourceId === 'crypto' ? '#2c6e62' : component.sourceId === 'bcs' ? '#3e7cb1' : '#8a6d3b'}
            />
          </article>
        ))}
      </section>
    </main>
  );
}
