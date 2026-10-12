import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

function renderPanel(d: DiagnosticResult = diagnostic) {
  return render(
    <MonitoringDiagnosticPanel
      diagnostic={d}
      diagnosing={false}
      onRunDiagnostic={vi.fn()}
      onReconfigureWebhook={vi.fn()}
      reconfiguring={false}
    />
  );
}

describe('SEC-SAIDAS_DE_INFORMACAO-01 — diagnóstico sem botões de exportação', () => {
  it('não renderiza os botões TXT nem PDF', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: /txt/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /pdf/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
  });

  it('mantém o diagnóstico visível na tela (score e instância)', () => {
    renderPanel();

    expect(screen.getByText('Saúde Geral')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('inst-1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /saúde/i })).toBeInTheDocument();
  });

  it('mantém os botões de diagnóstico (Executar e Auto-Fix)', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /executar diagnóstico/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diagnóstico \+ auto-fix/i })).toBeInTheDocument();
  });
});
