import '@/hooks/__tests__/helpers/alertMocks';
import '@/hooks/__tests__/helpers/alertContactMock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Contrato do payload de `conversation_sla` no canal do Realtime.
 *
 * O hook é alimentado pelo banco (payload não tipado): o teste prova que linha fora do contrato é
 * ignorada sem derrubar o handler, que `contact_id` nulo ou id que não é UUID não geram alerta, que
 * a falha ao carregar o contato não escapa do handler, que o aviso sai com a ação "Abrir conversa"
 * levando o CONTATO_ID e que o canal do Realtime é único por montagem (não recriado no re-render).
 */
import {
  callbacks,
  channelTopics,
  contactsQuery,
  dedupeCalls,
  dedupeResult,
  loggerSpies,
  openContactChat,
  playNotificationSound,
  removeChannel,
  settingsCfg,
  slaQuery,
  sonnerToast,
  resetAlertKit,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import { useSLANotifications, SLA_ALERT_DEDUPE_TTL_MS } from '@/hooks/sla/useSLANotifications';

const SLA_ID = '11111111-1111-4111-8111-111111111111';
const CONTATO_ID = '22222222-2222-4222-8222-222222222222';
/** O corpo mínimo que o canal entrega: os mesmos campos da tabela `conversation_sla`. */
const LINHA = {
  id: SLA_ID,
  contact_id: CONTATO_ID,
  first_message_at: '2026-10-12T12:00:00.000Z',
  first_response_at: null,
  first_response_breached: false,
  sla_configuration_id: null,
};

/** O canal registra primeiro o UPDATE; o INSERT vem depois. */
async function entregarInsert(row: unknown) {
  await callbacks[1]({ new: row, old: {} });
}
async function entregarUpdate(row: unknown, old: unknown) {
  await callbacks[0]({ new: row, old });
}

/** Deixa as promessas do handler assentarem (o canal entrega `void`). */
const assentar = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useSLANotifications — contrato do payload', () => {
  beforeEach(() => {
    resetAlertKit();
  });

  it('estouro marca o alerta de erro com a ação Abrir conversa e 10s de exibição', async () => {
    renderHook(() => useSLANotifications());

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: false });
    await assentar();

    expect(dedupeCalls).toEqual([{ key: `sla-breach:${SLA_ID}`, ttlMs: SLA_ALERT_DEDUPE_TTL_MS }]);
    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
    const [titulo, opcoes] = sonnerToast.error.mock.calls[0];
    expect(titulo).toContain('SLA de Primeira Resposta Violado');
    expect(opcoes.duration).toBe(10000);
    expect(opcoes.action.label).toBe('Abrir conversa');
    // A ação leva o CONTATO_ID (não só o rótulo): clicar abre a conversa certa.
    opcoes.action.onClick();
    expect(openContactChat).toHaveBeenCalledWith(CONTATO_ID);
  });

  it('estouro já marcado no INSERT também avisa (dedupe é do hook, não do clique)', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
  });

  it('estouro que já vinha marcado na linha anterior não repete o aviso', async () => {
    renderHook(() => useSLANotifications());

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(dedupeCalls).toEqual([]);
  });

  it('payload fora do contrato é ignorado sem alerta', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, id: 'linha-1' }); // id não é UUID
    await entregarInsert({ ...LINHA, contact_id: CONTATO_ID, first_response_breached: undefined });
    await entregarInsert({ ...LINHA, id: undefined });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(sonnerToast.warning).not.toHaveBeenCalled();
  });

  it('linha sem contato não gera alerta (não há conversa para abrir)', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true, contact_id: null });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('contato que não é UUID é ignorado', async () => {
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true, contact_id: 'c1' });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('dedupe desligado silencia o alerta repetido', async () => {
    dedupeResult.valor = false;
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('falha ao carregar o contato não escapa do handler: loga sem dado pessoal e o próximo evento válido avisa', async () => {
    renderHook(() => useSLANotifications());

    contactsQuery.erro = new Error('falha simulada na consulta de contatos');
    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: false });
    await assentar();

    // A exceção foi contida: nada foi apresentado e o erro ficou registrado.
    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(loggerSpies.error).toHaveBeenCalledTimes(1);
    // O log do erro não leva dado pessoal (id do contato, nome ou telefone).
    const registrado = JSON.stringify(loggerSpies.error.mock.calls[0]);
    expect(registrado).not.toContain(CONTATO_ID);
    expect(registrado).not.toContain('Fulano');
    expect(registrado).not.toContain('1199');

    // A borda se recupera: o handler continua vivo e o evento seguinte válido avisa.
    contactsQuery.erro = null;
    await entregarInsert({ ...LINHA, first_response_breached: true });
    await assentar();

    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
  });

  it('remapear a linha (resolvida) não avisa nada', async () => {
    renderHook(() => useSLANotifications());

    await entregarUpdate(
      { ...LINHA, first_response_at: '2026-10-12T12:02:00.000Z' },
      { first_response_at: null },
    );
    await assentar();

    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(sonnerToast.warning).not.toHaveBeenCalled();
  });
});

describe('useSLANotifications — aviso de risco', () => {
  beforeEach(() => {
    resetAlertKit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa ao cruzar 70% do prazo (aviso de 6s com Abrir conversa)', async () => {
    vi.useFakeTimers();
    renderHook(() => useSLANotifications());

    // Sem `sla_configuration_id` vale o prazo padrão do sistema: 5min → risco em 3,5min.
    await entregarInsert({ ...LINHA, first_message_at: new Date().toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    expect(sonnerToast.warning).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(dedupeCalls).toEqual([{ key: `sla-warning:${SLA_ID}`, ttlMs: SLA_ALERT_DEDUPE_TTL_MS }]);
    expect(sonnerToast.warning).toHaveBeenCalledTimes(1);
    const [titulo, opcoes] = sonnerToast.warning.mock.calls[0];
    expect(titulo).toContain('em Risco');
    expect(opcoes.duration).toBe(6000);
    expect(opcoes.action.label).toBe('Abrir conversa');
  });

  it('linha respondida antes do limiar desarma o aviso de risco', async () => {
    vi.useFakeTimers();
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_message_at: new Date().toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    await entregarUpdate(
      { ...LINHA, first_message_at: new Date().toISOString(), first_response_at: new Date().toISOString() },
      { first_response_at: null },
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(sonnerToast.warning).not.toHaveBeenCalled();
    expect(sonnerToast.error).not.toHaveBeenCalled();
  });
});

describe('useSLANotifications — canal do Realtime', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.soundVolume = 60;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cada montagem abre um canal com nome único (um canal por montagem)', () => {
    renderHook(() => useSLANotifications());
    renderHook(() => useSLANotifications());

    expect(channelTopics).toHaveLength(2);
    expect(channelTopics[0]).toContain('sla-breaches');
    expect(channelTopics[1]).toContain('sla-breaches');
    expect(channelTopics[0]).not.toBe(channelTopics[1]);
  });

  it('re-renderizar com ajustes novos NÃO recria o canal nem derruba a assinatura, e o alerta seguinte lê o valor vigente', async () => {
    const { rerender } = renderHook(() => useSLANotifications());
    expect(channelTopics).toHaveLength(1);

    // O painel desliga o som do SLA e a tela re-renderiza com os ajustes novos.
    settingsCfg.slaBreachSound = false;
    rerender();

    expect(channelTopics).toHaveLength(1); // canal não recriado
    expect(removeChannel).not.toHaveBeenCalled(); // assinatura não derrubada
    expect(callbacks).toHaveLength(2); // UPDATE + INSERT registrados uma vez só

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: false });
    await assentar();

    // O alerta saiu e leu o ajuste vigente: aparece, mas cala o som.
    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('desmontar com a consulta do prazo em voo não deixa timer solto nem alerta órfão', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSLANotifications());

    // `sla_configuration_id` força a consulta do prazo, que fica pendente de propósito.
    slaQuery.pendente = true;
    await entregarInsert({
      ...LINHA,
      first_message_at: new Date().toISOString(),
      sla_configuration_id: '55555555-5555-4555-8555-555555555555',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0); // ainda dentro da consulta: nada agendado

    unmount(); // desmonta com a consulta em voo
    slaQuery.liberar?.(); // a consulta responde DEPOIS do desmonte
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(0); // nenhum timer ficou para trás
    expect(dedupeCalls).toEqual([]);
    expect(sonnerToast.warning).not.toHaveBeenCalled();
  });
});
