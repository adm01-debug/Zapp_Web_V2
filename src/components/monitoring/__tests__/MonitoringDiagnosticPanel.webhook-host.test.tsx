import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  download: vi.fn(),
  notifyBlocked: vi.fn(),
  pdfTexts: [] as string[],
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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    setFontSize() {}
    setTextColor() {}
    addPage() {}
    text(t: string) { m.pdfTexts.push(t); }
    output() { return new Blob(['pdf']); }
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

const INVALID_URL = 'webhook-sem-esquema/token-abc-123';

function withUrl(url: string): DiagnosticResult {
  return {
    ...diagnostic,
    diagnostics: diagnostic.diagnostics.map((d) => ({
      ...d,
      webhook: d.webhook ? { ...d.webhook, url } : d.webhook,
    })),
  };
}

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

describe('N-179 — relatório sem URL completa de webhook e barra com nome', () => {
  beforeEach(() => {
    m.download.mockClear();
    m.notifyBlocked.mockClear();
    m.pdfTexts.length = 0;
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

  it('o relatório TXT não vaza URL não parseável (fallback seguro)', async () => {
    renderPanel(withUrl(INVALID_URL));
    const btn = screen.getByRole('button', { name: /txt/i });
    fireEvent.click(btn);

    const blob = m.download.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('(URL inválida)');
    expect(text).not.toContain('token-abc-123');
    expect(text).not.toContain(INVALID_URL);
  });

  it('o relatório PDF mostra só o host do webhook, não a URL completa com token', async () => {
    renderPanel();
    const btn = screen.getByRole('button', { name: /pdf/i });
    fireEvent.click(btn);

    await waitFor(() => expect(m.pdfTexts.length).toBeGreaterThan(0));
    const urlLines = m.pdfTexts.filter((t) => t.startsWith('URL:'));

    expect(urlLines).toHaveLength(1);
    expect(urlLines[0]).toContain('URL: hooks.example.com');
    expect(m.pdfTexts.join('\n')).not.toContain('token-abc-123');
  });

  it('o relatório PDF não vaza URL não parseável (fallback seguro)', async () => {
    renderPanel(withUrl(INVALID_URL));
    const btn = screen.getByRole('button', { name: /pdf/i });
    fireEvent.click(btn);

    await waitFor(() => expect(m.pdfTexts.length).toBeGreaterThan(0));
    const urlLines = m.pdfTexts.filter((t) => t.startsWith('URL:'));

    expect(urlLines).toHaveLength(1);
    expect(urlLines[0]).toContain('(URL inválida)');
    expect(m.pdfTexts.join('\n')).not.toContain('token-abc-123');
  });
});
