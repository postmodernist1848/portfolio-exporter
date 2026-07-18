// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefreshControl } from './refresh-control';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh })
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  routerRefresh.mockReset();
});

describe('refresh control', () => {
  it('disables during collection and refreshes server-rendered data on success', async () => {
    let complete!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<RefreshControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(screen.getByRole('button')).toBeDisabled();
    complete(new Response('{"state":"completed"}', { status: 200 }));

    await waitFor(() => expect(screen.getByText('Данные обновлены')).toBeInTheDocument());
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it('shows a safe message when collection fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('provider secret'));
    render(<RefreshControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    await waitFor(() => expect(screen.getByText('Не удалось обновить данные. Попробуйте позже.')).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('provider secret');
  });
});
