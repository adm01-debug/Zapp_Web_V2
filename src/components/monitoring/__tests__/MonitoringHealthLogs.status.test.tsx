import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

/**
 * t_b41eed0b — no histórico de health checks, `timeout` e `no_credentials`
 * precisam de rótulo pt-BR + cor por token e entrar no filtro "Erro".
 * A prova renderiza o componente REAL (sem dublê de status).
 */
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: {
    value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode;
  }) => <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>{children}</select>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectValue: () => null,
}));

import { MonitoringHealthLogs } from '../MonitoringHealthLogs';

const logs = [
  { id: '1', instance_id: 'go-timeout', status: 'timeout', checked_at: '2026-10-13T12:00:00Z', response_time_ms: 820, error_message: 'sem resposta' },
  { id: '2', instance_id: 'go-sem-credencial', status: 'no_credentials', checked_at: '2026-10-13T12:01:00Z', response_time_ms: null, error_message: null },
  { id: '3', instance_id: 'ok-inst', status: 'connected', checked_at: '2026-10-13T12:02:00Z', response_time_ms: 120, error_message: null },
  { id: '4', instance_id: 'err-inst', status: 'error', checked_at: '2026-10-13T12:03:00Z', response_time_ms: 700, error_message: 'falha' },
] as unknown as Parameters<typeof MonitoringHealthLogs>[0]['healthLogs'];

afterEach(() => cleanup());

describe('MonitoringHealthLogs — timeout e no_credentials', () => {
  it('mostra rótulo pt-BR em vez do status cru', () => {
    render(<MonitoringHealthLogs healthLogs={logs} />);
    expect(screen.getByText('Tempo esgotado')).toBeTruthy();
    expect(screen.getByText('Sem credencial')).toBeTruthy();
    expect(screen.getByText('Conectado')).toBeTruthy();
    expect(screen.queryByText('no_credentials')).toBeNull();
    expect(screen.queryByText('timeout')).toBeNull();
  });

  it('conta timeout e no_credentials como erro (✗ 3 / ✓ 1)', () => {
    render(<MonitoringHealthLogs healthLogs={logs} />);
    expect(screen.getByText('✗ 3')).toBeTruthy();
    expect(screen.getByText('✓ 1')).toBeTruthy();
  });

  it('o filtro "Erro" inclui timeout e no_credentials e exclui conectado', () => {
    render(<MonitoringHealthLogs healthLogs={logs} />);
    const statusSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(statusSelect, { target: { value: 'error' } });

    expect(screen.getByText('Tempo esgotado')).toBeTruthy();
    expect(screen.getByText('Sem credencial')).toBeTruthy();
    expect(screen.getByText('Erro')).toBeTruthy();
    expect(screen.queryByText('Conectado')).toBeNull();
    expect(screen.getByText('✗ 3')).toBeTruthy();
  });

  it('usa tokens do sistema, não a escala crua do Tailwind', () => {
    const { container } = render(<MonitoringHealthLogs healthLogs={logs} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/emerald-\d/);
    expect(html).not.toMatch(/amber-\d/);
    expect(html).toContain('text-warning');
    expect(html).toContain('text-success');
  });
});
