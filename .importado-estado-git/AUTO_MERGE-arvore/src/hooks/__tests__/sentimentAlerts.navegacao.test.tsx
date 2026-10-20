/**
 * R2-INB-064 (#354) — a ação do alerta de sentimento abre a CONVERSA do contato
 * alertado.
 *
 * Antes: o toast local (`useSentimentAlerts`, disparado por
 * AIConversationAssistant) só registrava o `contactId` no log; o toast global
 * (`useRealtimeSentimentAlerts`, montado por RealtimeSentimentAlertProvider)
 * tentava clicar na aba `ai` do Dashboard, que só existe lá — e só para staff —
 * então fora do Dashboard o clique não fazia nada.
 *
 * A prova dispara o clique da AÇÃO DO PRÓPRIO TOAST (o mesmo que o usuário vê)
 * nos dois produtores reais e observa o contrato de navegação do produto
 * (`openContactChat`): a view vai para o Chat e a conversa do contato alertado —
 * que pode não ser a que estava aberta — é selecionada via eventos que o
 * useRealtimeInbox escuta.
 */
import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import {
  callbacks,
  invoke,
  resetAlertKit,
  sonnerToast,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';
import { useSentimentAlerts } from '@/hooks/inbox/useSentimentAlerts';
import { RealtimeSentimentAlertProvider } from '@/components/notifications/RealtimeSentimentAlertProvider';
import { NavigationService } from '@/services/navigation.service';

type AcaoDoToast = { label: string; onClick: () => void };
type JanelaComPendencia = Window & { __pendingOpenContactId?: string };

const analise = {
  contactId: 'c1',
  contactName: 'Fulano',
  sentimentScore: 10,
  previousScore: 50,
  analysisId: 'a1',
};

/** Envelope entregue pelo canal realtime (a linha de `notifications`). */
function linhaDeSentimento(metadata: Record<string, unknown>, id = 'n1') {
  return {
    new: {
      id,
      user_id: 'u1',
      type: 'sentiment_alert',
      metadata,
      created_at: '2026-10-06T12:00:00.000Z',
    },
  };
}

/** A ação do primeiro toast de erro do sonner — o clique que o usuário dá. */
function acaoDoAlerta(): AcaoDoToast {
  const chamada = sonnerToast.error.mock.calls[0];
  expect(chamada).toBeDefined();
  return chamada[1].action as AcaoDoToast;
}

/** Observa o contrato real de navegação (eventos do produto) sem mockar o caminho. */
function observarNavegacao() {
  const contatos: string[] = [];
  const vistas: string[] = [];
  const aoAbrir = (e: Event) => contatos.push((e as CustomEvent<{ contactId: string }>).detail.contactId);
  const aoNavegar = (e: Event) => vistas.push((e as CustomEvent<{ view: string }>).detail.view);
  window.addEventListener('open-contact-chat', aoAbrir);
  window.addEventListener('zapp:navigate', aoNavegar);
  return {
    contatos,
    vistas,
    parar: () => {
      window.removeEventListener('open-contact-chat', aoAbrir);
      window.removeEventListener('zapp:navigate', aoNavegar);
    },
  };
}

const vistaAtual = () => new URLSearchParams(window.location.search).get('view');

beforeEach(() => {
  resetAlertKit();
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/');
  delete (window as JanelaComPendencia).__pendingOpenContactId;
});

afterEach(async () => {
  // Drena a cadeia de retry do openContactChat: nenhum timer fica pendente.
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  vi.useRealTimers();
});

describe('alerta local (useSentimentAlerts) — ação do toast', () => {
  it('"Ver conversa" abre no Chat a conversa do contato alertado', async () => {
    invoke.mockResolvedValue({ data: { alerted: true, notifyCaller: true, consecutiveLow: 3 }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    const acao = acaoDoAlerta();
    expect(acao.label).toBe('Ver conversa');

    const nav = observarNavegacao();
    act(() => { acao.onClick(); });

    // O contato alertado é o que o inbox recebe para selecionar.
    expect((window as JanelaComPendencia).__pendingOpenContactId).toBe('c1');
    // O destino é o Chat — view sem gate de papel no NavigationService, portanto
    // acessível ao papel atual (a tabela de Sentimento é staff-only).
    expect(vistaAtual()).toBe('inbox');
    expect(NavigationService.canAccess('inbox', ['agent'])).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    nav.parar();

    expect(nav.vistas).toContain('inbox');
    expect(nav.contatos).toContain('c1');
  });
});

describe('alerta global (RealtimeSentimentAlertProvider) — ação do toast', () => {
  it('recebido fora do Dashboard, abre a conversa do contato alertado', async () => {
    window.history.replaceState({}, '', '/?view=contacts');
    render(<RealtimeSentimentAlertProvider />);

    await act(async () => {
      await callbacks[0](linhaDeSentimento({
        contact_id: 'c9',
        contact_name: 'Maria',
        sentiment_score: 12,
        consecutive_low: 3,
        analysis_id: 'a9',
      }));
    });

    const acao = acaoDoAlerta();
    expect(acao.label).toBe('Ver conversa');
    // Nenhuma aba do Dashboard na tela: o destino não pode depender dela.
    expect(document.querySelector('[value="ai"]')).toBeNull();

    const nav = observarNavegacao();
    act(() => { acao.onClick(); });

    expect((window as JanelaComPendencia).__pendingOpenContactId).toBe('c9');
    expect(vistaAtual()).toBe('inbox');

    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    nav.parar();

    expect(nav.contatos).toContain('c9');
  });

  it('alerta sem o contato avisa na tela em vez de clique mudo', async () => {
    render(<RealtimeSentimentAlertProvider />);

    await act(async () => {
      await callbacks[0](linhaDeSentimento({
        contact_name: 'Maria',
        sentiment_score: 12,
        consecutive_low: 3,
        analysis_id: 'a10',
      }));
    });

    const nav = observarNavegacao();
    act(() => { acaoDoAlerta().onClick(); });

    expect(sonnerToast.info).toHaveBeenCalledTimes(1);
    expect((window as JanelaComPendencia).__pendingOpenContactId).toBeUndefined();
    expect(vistaAtual()).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    nav.parar();

    expect(nav.contatos).toEqual([]);
    expect(nav.vistas).toEqual([]);
  });
});
