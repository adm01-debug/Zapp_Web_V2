/* A1 — rastreio cru de history.replaceState/pushState durante navegacao + filtro. */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters } from '@/hooks/tasks/useTasksFilters';

describe('A1 — trace de history', () => {
  it('P5) quem escreve o que, em que ordem', async () => {
    const log: string[] = [];
    const origReplace = window.history.replaceState.bind(window.history);
    const origPush = window.history.pushState.bind(window.history);
    window.history.replaceState = function (...args: Parameters<History['replaceState']>) {
      log.push('replaceState -> ' + String(args[2]));
      return origReplace(...args);
    } as History['replaceState'];
    window.history.pushState = function (...args: Parameters<History['pushState']>) {
      log.push('pushState    -> ' + String(args[2]));
      return origPush(...args);
    } as History['pushState'];

    window.history.replaceState(null, '', '/a1fasef');
    let ir: (to: string) => void = () => {};
    let loc = '';
    const Espiao = () => { ir = useNavigate(); loc = useLocation().search; return null; };
    const r = renderHook(() => useTasksFilters(), {
      wrapper: ({ children }: { children: ReactNode }) => (<BrowserRouter><Espiao />{children}</BrowserRouter>),
    });

    log.push('--- setPrio(high) ---');
    act(() => { r.result.current.setPrio('high'); });
    log.push('barra=' + window.location.search + ' router=' + loc + ' prio=' + r.result.current.filters.prio);

    log.push('--- navigate("/a1fasef") ---');
    act(() => { ir('/a1fasef'); });
    await act(async () => { await new Promise(res => setTimeout(res, 60)); });
    log.push('barra=' + window.location.search + ' router=' + loc + ' prio=' + r.result.current.filters.prio);

    log.push('--- toggleAlarm() ---');
    act(() => { r.result.current.toggleAlarm(); });
    await act(async () => { await new Promise(res => setTimeout(res, 60)); });
    log.push('barra=' + window.location.search + ' router=' + loc);

    console.log('A1-P5\n' + log.join('\n'));
    window.history.replaceState = origReplace;
    window.history.pushState = origPush;
    expect(true).toBe(true);
  });
});
