/**
 * Y29 / SEC-SAIDAS_DE_INFORMACAO-01 — gate de download nos caminhos fora do
 * catálogo, chamando o HELPER REAL por dentro de cada componente/hook:
 *  - relatórios TXT/PDF de monitoramento (`MonitoringDiagnosticPanel`);
 *  - JSON de performance da equipe (`TeamPerformancePanel`);
 *  - anexo de e-mail (`useGmail.downloadAttachment`);
 *  - exceção declarada: códigos de backup MFA do PRÓPRIO usuário continuam
 *    baixando (`MFABackupCodes`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import { MonitoringDiagnosticPanel } from '../monitoring/MonitoringDiagnosticPanel';
import type { DiagnosticResult } from '../monitoring/hooks/useEvolutionMonitoring';
import { TeamPerformancePanel } from '../team-chat/TeamPerformancePanel';
import { MFABackupCodes } from '../mfa/MFABackupCodes';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(() => 't1'), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// Y29 — a permissão vem de `useDownloadPermission` (`profiles.can_download`).
const permissao = vi.hoisted(() => ({ valor: false }));
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: permissao.valor, isLoading: false }),
}));

const performanceMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/team-chat/useTeamPerformance', () => ({
  useTeamPerformance: () => performanceMock(),
}));

const callGmailMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/gmail/gmailApi', () => ({
  callGmailFunction: (...args: unknown[]) => callGmailMock(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }), range: vi.fn().mockResolvedValue({ data: [], error: null }), in: vi.fn().mockResolvedValue({ data: [], error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  RESERVED_HASHES: new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']),
}));
vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state-abc'),
  storeGmailOAuthReturnContext: vi.fn(),
}));

import { useGmail } from '@/hooks/integrations/useGmail';

const diagnostico = {
  timestamp: new Date(2026, 9, 9, 12, 0, 0).toISOString(),
  overallHealth: { score: 90, status: 'healthy' },
  diagnostics: [{
    instance: 'inst-1',
    connectionState: 'open',
    webhookSeverity: 'ok',
    webhookIssue: null,
    webhook: { url: 'https://exemplo.test/webhook', eventsCount: 3, missingCritical: [], urlCorrect: true },
    messageFlow: { lastHour: { incoming: 1, outgoing: 2 }, flowHealth: 'healthy' },
    autoFix: null,
  }],
} as unknown as DiagnosticResult;

describe('Y29 — relatório de diagnóstico (MonitoringDiagnosticPanel)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-diag');
  const click = vi.fn();

  const renderPanel = () => render(
    <MonitoringDiagnosticPanel
      diagnostic={diagnostico}
      diagnosing={false}
      onRunDiagnostic={vi.fn()}
      onReconfigureWebhook={vi.fn()}
      reconfiguring={false}
    />,
  );

  beforeEach(() => {
    createObjectURL.mockClear();
    click.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('sem permissão TXT e PDF não gravam nada', async () => {
    permissao.valor = false;
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /TXT/ }));
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('com permissão o TXT é gravado como antes', async () => {
    permissao.valor = true;
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /TXT/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('Y29 — JSON de performance da equipe (TeamPerformancePanel)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-team');
  const click = vi.fn();

  const renderPanel = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamPerformancePanel conversationId="conv-12345678" />
    </QueryClientProvider>,
  );

  beforeEach(() => {
    performanceMock.mockReset();
    performanceMock.mockReturnValue({ data: { messageCount: 5, activeParticipants: 2, avgResponseTimeMs: 1200 }, isLoading: false });
    createObjectURL.mockClear();
    click.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('sem permissão o exportar não grava nada', async () => {
    permissao.valor = false;
    renderPanel();

    fireEvent.click(screen.getByTitle('Exportar JSON'));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('com permissão grava o JSON como antes', () => {
    permissao.valor = true;
    renderPanel();

    fireEvent.click(screen.getByTitle('Exportar JSON'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('Y29 — anexo de e-mail (useGmail.downloadAttachment)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-mail');
  const click = vi.fn();
  const anexo = {
    id: 'a1', message_id: 'msg1', filename: 'contrato.pdf', mime_type: 'application/pdf',
    size: 12, gmail_message_id: 'gm1', gmail_attachment_id: 'ga1',
  };

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }, children);

  beforeEach(() => {
    callGmailMock.mockReset();
    callGmailMock.mockImplementation(async (fn: string, opts: Record<string, unknown>) => {
      if (fn === 'gmail-oauth' && opts.action === 'list-accounts') {
        return {
          accounts: [{
            id: 'acc1', email_address: 'user@example.com', is_active: true, sync_status: 'synced',
            last_sync_at: null, last_error: null, created_at: '2026-01-01T00:00:00Z',
          }],
        };
      }
      if (fn === 'gmail-sync') return { data: 'aGVsbG8=' };
      return {};
    });
    createObjectURL.mockClear();
    click.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const conteudoDoAnexo = () => callGmailMock.mock.calls.filter(([fn, opts]) =>
    fn === 'gmail-sync' && (opts as Record<string, unknown>).action === 'get-attachment');

  it('sem permissão o conteúdo do anexo nem é buscado e nada é gravado', async () => {
    permissao.valor = false;
    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await result.current.downloadAttachment.mutateAsync(anexo as any);
    });

    expect(conteudoDoAnexo()).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('com permissão busca o anexo e grava como antes', async () => {
    permissao.valor = true;
    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await result.current.downloadAttachment.mutateAsync(anexo as any);
    });

    expect(conteudoDoAnexo()).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('Y29 — códigos de backup MFA (exceção declarada)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29-mfa');
  const click = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    click.mockClear();
    toastMock.success.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { click(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('continua baixando (arquivo do próprio usuário) e usa a mesma porta', () => {
    permissao.valor = false;
    render(<MFABackupCodes codes={['AAAA-1111']} />);

    fireEvent.click(screen.getByRole('button', { name: /Baixar/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
