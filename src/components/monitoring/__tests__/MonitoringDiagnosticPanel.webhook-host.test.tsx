import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';

const m = vi.hoisted(() => ({
  download: vi.fn(),
  notifyBlocked: vi.fn(),
}));

vi.mock('@/lib/downloadFile', () => ({
  downloadFileWithPermission: (...args: unknown[]) => m.download(...args),
  notifyDownloadBlocked: m.notifyBlocked,
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  },
}));

import { MonitoringDiagnosticPanel } from '@/components/monitoring/MonitoringDiagnosticPanel';
import type { DiagnosticResult } from '@/components/monitoring/hooks/types';

const diagnostic: DiagnosticResult = {
  timestamp: '2026-10-10T12:00:00Z',
  overallHealth: { score: 85, status: 'healthy' },
  diagnostics: [
    {
      instance: 'inst-1',
      connectionState: 'open',
      webhookSeverity: 'ok',
      webhook: {
        url: 'https://hooks.example.com/webhook/token-abc-123',
        eventsCount: 5,
        missingCritical: [],
        urlCorrect: true,
      },
      messageFlow: { lastHour: { incoming: 10, outgoing: 5, total: 15 }, flowHealth: 'healthy' },
    },
  ],
};

function renderPanel() {
  return render(
    <MonitoringDiagnosticPanel
      diagnostic={diagnostic}
      diagnosing={false}
      onRunDiagnostic={vi.fn()}
      onReconfigureWebhook={vi.fn()}
      reconfiguring={false}
    />
  );
}

describe('N-179 — relatório sem URL completa de webhook e barra com nome', () => {
  beforeEach(() => {
    m.download.mockClear();
    m.notifyBlocked.mockClear();
  });

  it('a barra de progresso do placar tem aria-label="Saúde"', () => {
    renderPanel();
    const progress = screen.getByRole('progressbar', { name: /saúde/i });
    expect(progress).toBeInTheDocument();
  });

  it('o relatório TXT mostra só o host do webhook, não a URL completa com token', async () => {
    renderPanel();
    const btn = screen.getByRole('button', { name: /txt/i });
    fireEvent.click(btn);

    const blob = m.download.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('hooks.example.com');
    expect(text).not.toContain('token-abc-123');
    expect(text).not.toContain('https://hooks.example.com/webhook/token-abc-123');
  });
});