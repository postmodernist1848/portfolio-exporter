'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RefreshControl() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function refresh() {
    setState('loading');
    setMessage('Обновляем данные…');
    try {
      const response = await fetch('/api/collect', { method: 'POST' });
      const body = await response.json() as { state?: 'completed' | 'in_progress' | 'cooldown' };
      if (!response.ok) throw new Error('Collection failed');
      const messages = {
        completed: 'Данные обновлены',
        in_progress: 'Обновление уже выполняется',
        cooldown: 'Данные обновлялись недавно'
      };
      setState('success');
      setMessage(messages[body.state ?? 'completed']);
      router.refresh();
    } catch {
      setState('error');
      setMessage('Не удалось обновить данные. Попробуйте позже.');
    }
  }

  return (
    <div className="refresh-control">
      <button className="refresh-button" onClick={refresh} disabled={state === 'loading'}>
        {state === 'loading' ? 'Обновление…' : 'Обновить'}
      </button>
      <span className={state === 'error' ? 'error-text' : 'muted'} aria-live="polite">{message}</span>
    </div>
  );
}
