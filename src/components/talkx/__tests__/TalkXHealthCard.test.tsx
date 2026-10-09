import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  TalkXHealthCard,
  type TalkXHealthCardProps,
} from '../tracking/TalkXHealthCard';
import {
  campaignPauseReason,
  deriveTalkXHealth,
  fmtRatePerMinute,
  talkxLastSentAt,
  talkxRatePerMinute,
  talkxStallWindowMs,
} from '../tracking/talkxHealth';

/**
 * X148 — Card "Saúde da Campanha" (acompanhamento da campanha).
 *
 * O que este teste trava (o defeito que existia antes): o card dizia "Enviando
 * normalmente" sempre que o status era `sending`, mesmo com o envio parado há muito
 * tempo, e chamava de "Envio pausado" tanto a pausa do operador quanto a pausa
 * automática do motor — que volta sozinha e por isso precisa dizer isso na tela.
 *
 * Casos protegidos:
 * 1. envio em dia → "Enviando normalmente" (e nenhuma saída de ajuda);
 * 2. envio parado → "Envio parado há N min" + "Ver o que fazer" abrindo a ajuda;
 * 3. o limiar de "parado" sai do ritmo da campanha (melhor e pior caso);
 * 4. pausa do operador × pausa automática (com motivo conhecido, "volta sozinha");
 * 5. motivo de diagnóstico não vira "volta sozinha";
 * 6. conexão sem status mostra "—" (nunca "Conectada" fixo) e a taxa medida por minuto
 *    aparece com o número real (sem envio: "—", nunca "0 msgs/min").
 */

const MINUTE = 60_000;

function renderCard(props: Partial<TalkXHealthCardProps> = {}) {
  return render(
    <TalkXHealthCard
      status="sending"
      connectionLabel="Conectada"
      startedAt="2026-10-08T12:00:00.000Z"
      {...props}
    />,
  );
}

describe('TalkXHealthCard — status atual (X148)', () => {
  it('envio recente: "Enviando normalmente" e nenhuma ajuda oferecida', () => {
    const now = Date.now();
    renderCard({ status: 'sending', lastActivityAt: new Date(now - 2 * MINUTE).toISOString(), pending: 40, nowMs: now });

    expect(screen.getByText('Enviando normalmente')).toBeTruthy();
    expect(screen.queryByText(/Envio parado/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Ver o que fazer/ })).toBeNull();
  });

  it('envio parado: "Envio parado há 12 minutos" no lugar de "Enviando normalmente"', () => {
    const now = Date.now();
    renderCard({ status: 'sending', lastActivityAt: new Date(now - 12 * MINUTE).toISOString(), pending: 40, nowMs: now });

    expect(screen.getByText(/^Envio parado há 12 minutos$/)).toBeTruthy();
    expect(screen.queryByText('Enviando normalmente')).toBeNull();
  });

  it('"Ver o que fazer" existe só na campanha parada e abre a ajuda', () => {
    const onOpenHelp = vi.fn();
    const now = Date.now();
    renderCard({
      status: 'sending',
      lastActivityAt: new Date(now - 12 * MINUTE).toISOString(),
      pending: 40,
      nowMs: now,
      onOpenHelp,
    });

    const button = screen.getByRole('button', { name: /Ver o que fazer/ });
    fireEvent.click(button);
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('sem ajuda para abrir, o card não renderiza botão sem ação', () => {
    const now = Date.now();
    renderCard({
      status: 'sending',
      lastActivityAt: new Date(now - 12 * MINUTE).toISOString(),
      pending: 40,
      nowMs: now,
    });

    expect(screen.getByText(/^Envio parado/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ver o que fazer/ })).toBeNull();
  });

  it('campanha sem pendentes não é "parada", mesmo com silêncio longo', () => {
    const now = Date.now();
    renderCard({ status: 'sending', lastActivityAt: new Date(now - 30 * MINUTE).toISOString(), pending: 0, nowMs: now });

    expect(screen.getByText('Enviando normalmente')).toBeTruthy();
    expect(screen.queryByText(/Envio parado/)).toBeNull();
  });

  it('o limiar de "parado" sai do ritmo da campanha (melhor e pior caso do mesmo dado)', () => {
    const now = Date.now();
    // Campanha lenta: intervalo máximo 60 s + digitação 20 s → 3× 80 s = 240 s > piso de 3 min.
    const lenta = talkxStallWindowMs(60_000, 20_000);
    expect(lenta).toBe(240_000);

    // 3,5 min de silêncio passam do piso de 3 min, mas NÃO do ritmo desta campanha:
    // dizer "parada" aqui seria alarme falso.
    const { unmount } = renderCard({
      status: 'sending',
      lastActivityAt: new Date(now - 210_000).toISOString(),
      pending: 5,
      nowMs: now,
      stalledAfterMs: lenta,
    });
    expect(screen.getByText('Enviando normalmente')).toBeTruthy();
    unmount();

    // 5 min de silêncio passam do ritmo da campanha → parada de verdade.
    renderCard({
      status: 'sending',
      lastActivityAt: new Date(now - 300_000).toISOString(),
      pending: 5,
      nowMs: now,
      stalledAfterMs: lenta,
    });
    expect(screen.getByText(/^Envio parado há 5 minutos$/)).toBeTruthy();
  });

  it('piso de 3 min quando o ritmo é rápido', () => {
    expect(talkxStallWindowMs(1_000, 0)).toBe(180_000);
    const now = Date.now();
    renderCard({ status: 'sending', lastActivityAt: new Date(now - 4 * MINUTE).toISOString(), pending: 5, nowMs: now });
    expect(screen.getByText(/^Envio parado há 4 minutos$/)).toBeTruthy();
  });

  it('pausa do operador: "Pausada por você", sem promessa de volta automática', () => {
    renderCard({ status: 'paused', pauseReason: null });
    expect(screen.getByText('Pausada por você')).toBeTruthy();
    expect(screen.queryByText(/volta sozinha/)).toBeNull();
  });

  it('pausa automática pelo motor: motivo na tela e "volta sozinha"', () => {
    renderCard({ status: 'paused', pauseReason: 'send_window' });
    expect(screen.getByText('Pausada automaticamente: fora da janela de envio — volta sozinha')).toBeTruthy();
    expect(screen.queryByText('Pausada por você')).toBeNull();
  });

  it('motivo de diagnóstico NÃO promete volta automática', () => {
    renderCard({ status: 'paused', pauseReason: 'invalid_schedule_timezone' });
    expect(screen.getByText('Pausada por você')).toBeTruthy();
    expect(screen.queryByText(/volta sozinha/)).toBeNull();
  });

  it('conexão e taxa aparecem com o dado real; sem dado, "—"', () => {
    const primeira = renderCard({ status: 'sending', connectionLabel: 'Desconectada', ratePerMinute: 4.5, lastActivityAt: new Date().toISOString(), pending: 3 });
    expect(screen.getByText('Desconectada')).toBeTruthy();
    expect(screen.getByText('4,5 msgs/min')).toBeTruthy();
    primeira.unmount();

    renderCard({ status: 'sending', connectionLabel: null, ratePerMinute: null, lastActivityAt: new Date().toISOString(), pending: 3 });
    // Nenhuma das duas linhas inventa valor: conexão sem status e taxa sem envio mostram "—".
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText(/0 msgs\/min/)).toBeNull();
  });

  it('o card mantém o "Iniciado em" que a tela já mostrava', () => {
    renderCard({
      status: 'sending',
      startedAt: '2026-10-08T12:00:00.000Z',
      lastActivityAt: new Date().toISOString(),
      pending: 3,
      ratePerMinute: 1,
    });
    expect(screen.getByText('Iniciado em')).toBeTruthy();
    // Com início preenchido o card não tem nenhum "—": a data real é o que aparece.
    expect(screen.queryByText('—')).toBeNull();
  });

  it('campanha concluída não é "sending" nem "pausada"', () => {
    renderCard({ status: 'completed' });
    // "Concluída" aparece no selo e na linha de status: o que importa é que apareça e
    // que o card não continue dizendo "Enviando normalmente".
    expect(screen.getAllByText('Concluída').length).toBeGreaterThan(0);
    expect(screen.queryByText('Enviando normalmente')).toBeNull();
    expect(screen.queryByText('Pausada por você')).toBeNull();
  });
});

describe('TalkXHealthCard — medições (X148)', () => {
  it('taxa medida usa a janela de 5 minutos e os envios reais', () => {
    const now = Date.now();
    const sent = [
      new Date(now - 1 * MINUTE).toISOString(),
      new Date(now - 2 * MINUTE).toISOString(),
      new Date(now - 4 * MINUTE).toISOString(),
      new Date(now - 9 * MINUTE).toISOString(), // fora da janela
      null,
    ];
    expect(talkxRatePerMinute(sent, now)).toBeCloseTo(3 / 5);
    expect(fmtRatePerMinute(talkxRatePerMinute(sent, now))).toBe('0,6 msgs/min');
  });

  it('sem nenhum envio conhecido a taxa é "—" (não 0)', () => {
    const now = Date.now();
    expect(talkxRatePerMinute([null, undefined], now)).toBeNull();
    expect(fmtRatePerMinute(null)).toBe('—');
  });

  it('último envio é o mais recente da lista, em qualquer ordem', () => {
    const now = Date.now();
    const antigo = new Date(now - 30 * MINUTE).toISOString();
    const recente = new Date(now - 1 * MINUTE).toISOString();
    expect(talkxLastSentAt([antigo, recente, null])).toBe(recente);
    expect(talkxLastSentAt([])).toBeNull();
  });

  it('pause_reason é lido por guarda e normalizado', () => {
    expect(campaignPauseReason({ pause_reason: ' send_window ' })).toBe('send_window');
    expect(campaignPauseReason({ pause_reason: '   ' })).toBeNull();
    expect(campaignPauseReason({ status: 'paused' })).toBeNull();
    expect(campaignPauseReason(null)).toBeNull();
  });

  it('deriveTalkXHealth classifica pausa automática conhecida e manual', () => {
    expect(deriveTalkXHealth({ status: 'paused', pauseReason: 'business_hours' }).workerState).toBe('paused_auto');
    expect(deriveTalkXHealth({ status: 'paused', pauseReason: 'pausado_pelo_cliente' }).workerState).toBe('paused_manual');
    expect(deriveTalkXHealth({ status: 'sending', lastActivityAt: null, pending: 10 }).workerState).toBe('sending');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Fiação na tela: o Monitor monta o card com o que ele realmente carrega e o
// "Ver o que fazer" abre a ajuda do módulo (teste pelo componente que a tela usa).
// ────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  healthRecipients: undefined as Array<{ sent_at: string | null }> | undefined,
  rateError: null as Error | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const CAMPAIGN = {
    id: 'camp-1',
    name: 'Campanha parada',
    status: 'sending',
    message_template: 'mensagem de teste',
    total_recipients: 500,
    sent_count: 2,
    delivered_count: 2,
    failed_count: 0,
    outcome_unknown_count: 0,
    started_at: new Date(Date.now() - 40 * 60_000).toISOString(),
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-08T10:00:00.000Z',
    pause_reason: null,
    send_interval_max: 1_000,
    typing_delay_max: 0,
  };
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: [], error: null });
    chain.single = () => Promise.resolve({ data: CAMPAIGN, error: null });
    return chain;
  };
  return {
    supabase: {
      from: () => makeChain(),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: 'connected', label: 'Conectada', loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({
    recipients: h.healthRecipients,
    rateByMinute: [],
    isLoading: false,
    isError: h.rateError !== null,
    refetch: vi.fn(),
  }),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';

describe('TalkXLiveMonitor — o card de saúde usa o que a tela carrega (X148)', () => {
  beforeEach(() => {
    h.healthRecipients = undefined;
    h.rateError = null;
  });

  const renderMonitor = (onOpenHelp?: () => void) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <TalkXLiveMonitor campaignId="camp-1" onOpenHelp={onOpenHelp} />
      </QueryClientProvider>,
    );
  };

  it('envio parado há 40 min: a tela mostra "Envio parado" e "Ver o que fazer" chama a ajuda', async () => {
    // TL-174 — a Ajuda saiu de diálogo local (TalkXHelp) para tela com rota própria
    // (TalkXHelpCenter, aberta pelo TalkXView). Quem a renderiza e cobre o texto
    // "Ajuda — Campanhas" agora são os testes do próprio TalkXHelpCenter; aqui a
    // responsabilidade do monitor é só repassar o clique para `onOpenHelp`, do
    // mesmo jeito que o teste direto do TalkXHealthCard já cobre (linha 67 acima).
    h.healthRecipients = [{ sent_at: new Date(Date.now() - 40 * MINUTE).toISOString() }];
    const onOpenHelp = vi.fn();
    renderMonitor(onOpenHelp);

    await screen.findByText('Campanha parada');
    expect(screen.getByText(/^Envio parado há 40 minutos$/)).toBeTruthy();
    expect(screen.queryByText('Enviando normalmente')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ver o que fazer/ }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('consulta da medida com erro não vira "Envio parado" (erro de consulta não é campanha parada)', async () => {
    h.rateError = new Error('falha na consulta do painel');
    renderMonitor();

    await screen.findByText('Campanha parada');
    expect(screen.getByText('Enviando normalmente')).toBeTruthy();
    expect(screen.queryByText(/^Envio parado/)).toBeNull();
    expect(screen.getByText('Taxa de envio (por minuto)')).toBeTruthy();
  });
});
