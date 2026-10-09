/**
 * Modal de Ajuda do Talk X (telas 16 e 01) — Esc fecha e o foco VOLTA ao gatilho.
 *
 * Defeito medido no navegador real (`e2e/talkx-visual.spec.ts`, projeto
 * `chromium-talkx-visual`): o Esc fechava o modal, mas o foco caía no `<body>` em vez de
 * voltar ao botão "Ajuda" — e o comando seguinte (Enter/Espaço) não reabria nada.
 *
 * Causa: o gatilho era um `<button onClick>` solto, fora da raiz do `Dialog`. Em
 * `@radix-ui/react-dialog` o `DialogContentModal` fecha com
 * `onCloseAutoFocus -> event.preventDefault(); context.triggerRef.current?.focus()`, e
 * `triggerRef` só é preenchido pelo `DialogTrigger`: sem ele o `preventDefault` continua
 * rodando e o foco fica sem destino (body).
 *
 * Este teste guarda a regra no CI (jsdom): o gatilho é o `DialogTrigger` do Radix e o
 * foco volta a ele ao fechar. A semântica de tecla do navegador (Enter/Espaço acionando
 * o botão) é medida pela régua do Playwright, não aqui — o jsdom não ativa botão por
 * teclado.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ campaigns: [] as Array<Record<string, unknown>>, isLoading: false }));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: f.isLoading,
    isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({ TalkXCampaignWizard: () => <div /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

/** Botão "Ajuda" do cabeçalho do módulo (o gatilho do modal). */
function gatilho() {
  return screen.getByRole('button', { name: 'Ajuda' });
}

describe('Talk X — modal de Ajuda: Esc fecha e o foco volta ao gatilho', () => {
  beforeEach(() => {
    f.campaigns = [];
    f.isLoading = false;
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
  });

  afterEach(() => vi.clearAllMocks());

  it('o botão "Ajuda" é o gatilho do Dialog (aria-haspopup=dialog)', () => {
    render(<TalkXView />);
    const ajuda = gatilho();
    expect(ajuda).toHaveAttribute('aria-haspopup', 'dialog');
    expect(ajuda).toHaveAttribute('aria-expanded', 'false');
  });

  it('Esc fecha o modal e devolve o foco ao botão "Ajuda" (nunca ao body)', async () => {
    render(<TalkXView />);
    const ajuda = gatilho();

    await act(async () => {
      ajuda.focus();
      fireEvent.click(ajuda);
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ajuda — Campanhas (Talk X)')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(ajuda));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('depois de fechar, o mesmo botão reabre o modal (o foco ficou nele)', async () => {
    render(<TalkXView />);
    const ajuda = gatilho();

    await act(async () => {
      ajuda.focus();
      fireEvent.click(ajuda);
    });
    await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // O foco voltou ao gatilho: o mesmo comando que abriu abre de novo.
    await act(async () => {
      fireEvent.click(document.activeElement as HTMLElement);
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
