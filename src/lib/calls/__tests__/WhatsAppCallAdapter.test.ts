/**
 * T24 — aceite "adapter testado nos 2 ramos" (+ `dial` → NotSupported).
 *
 * O adapter é headless: as duas portas de I/O (`abrirConversa`, `persistir`)
 * entram como dublês, então cada ramo é exercitado sem banco e sem DOM.
 */

import { describe, expect, it, vi } from 'vitest';

import { REASON_LABEL } from '../capabilities';
import { canalDaNotificacao, executorDaAcao } from '../acaoDoAlerta';
import type { UpsertMyCallInput, UpsertMyCallResult } from '../persistence';
import {
  MENSAGEM_ATENDA_WHATSAPP,
  MOTIVO_SEM_SAIDA,
  NotSupportedError,
  ROTULO_IGNORAR_WHATSAPP,
  WhatsAppCallAdapter,
  type WhatsAppCallPorts,
} from '../WhatsAppCallAdapter';

/** Chamada recebida de WhatsApp usada nos dois ramos. */
const CHAMADA = {
  callId: 'call-wa-1',
  contactId: 'contato-42',
  phone: '5511988887777',
  name: 'Cliente',
};

/**
 * Dublês das portas. `persistir` captura o input e devolve `{ ok: true }`; os
 * testes inspecionam o payload enviado à RPC.
 */
function montarPortas(over: Partial<WhatsAppCallPorts> = {}) {
  const persistir = vi.fn(
    async (_input: UpsertMyCallInput): Promise<UpsertMyCallResult> => ({ ok: true }),
  );
  const abrirConversa = vi.fn();
  const ports: WhatsAppCallPorts = { persistir, abrirConversa, ...over };
  return { ports, persistir, abrirConversa };
}

/** Input realmente entregue à porta de persistência neste ramo. */
function inputPersistido(persistir: ReturnType<typeof vi.fn>): UpsertMyCallInput {
  expect(persistir).toHaveBeenCalledTimes(1);
  return persistir.mock.calls[0][0] as UpsertMyCallInput;
}

describe('WhatsAppCallAdapter.dial (T24)', () => {
  it('não disca daqui: lança NotSupportedError com o motivo canônico e não toca as portas', () => {
    const { ports, persistir, abrirConversa } = montarPortas();
    const adapter = new WhatsAppCallAdapter(ports);

    expect(() => adapter.dial('5511988887777')).toThrow(NotSupportedError);

    try {
      adapter.dial('5511988887777');
      throw new Error('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(NotSupportedError);
      const notSupported = erro as NotSupportedError;
      expect(notSupported.name).toBe('NotSupportedError');
      expect(notSupported.reason).toBe(MOTIVO_SEM_SAIDA);
      expect(notSupported.message).toBe(REASON_LABEL.whatsapp_no_outbound);
    }

    // Discar não é I/O de WhatsApp: nada foi gravado nem aberto.
    expect(persistir).not.toHaveBeenCalled();
    expect(abrirConversa).not.toHaveBeenCalled();
  });
});

describe('WhatsAppCallAdapter.accept (T24 — ramo 1: atender)', () => {
  it('grava status=answered com answeredAt (de onde o banco deriva answered_by) e canal whatsapp', async () => {
    const { ports, persistir } = montarPortas();
    const adapter = new WhatsAppCallAdapter(ports);

    const resultado = await adapter.accept(CHAMADA);
    const input = inputPersistido(persistir);

    // answered_by é DERIVADO de answered_at pela RPC (20260926800000:344-347):
    // a prova de que o atendimento foi marcado é o answered_at preenchido.
    expect(input.answeredAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(input.answeredAt as string))).toBe(false);
    expect(input.status).toBe('answered');
    // channel explícito: a RPC faz coalesce(p_channel,'voip') e omitir gravaria VoIP.
    expect(input.channel).toBe('whatsapp');
    expect(input.direction).toBe('inbound');
    expect(input.id).toBe(CHAMADA.callId);
    expect(input.contactId).toBe(CHAMADA.contactId);
    expect(input.peerNumber).toBe(CHAMADA.phone);
    // A RPC não aceita p_answered_by — o adapter não pode inventar o campo.
    expect(input).not.toHaveProperty('answeredBy');

    expect(resultado.persistencia).toEqual({ ok: true });
  });

  it('abre a conversa do contato no inbox e devolve a mensagem literal do plano', async () => {
    const { ports, abrirConversa } = montarPortas();
    const adapter = new WhatsAppCallAdapter(ports);

    const resultado = await adapter.accept(CHAMADA);

    expect(abrirConversa).toHaveBeenCalledTimes(1);
    expect(abrirConversa).toHaveBeenCalledWith(CHAMADA.contactId);
    expect(resultado.mensagem).toBe(
      'Atenda no aparelho da linha; a conversa foi aberta aqui',
    );
    expect(resultado.mensagem).toBe(MENSAGEM_ATENDA_WHATSAPP);
  });

  it('preserva o resultado de falha da gravação (a porta decide, o adapter não engole)', async () => {
    const { ports, abrirConversa } = montarPortas({
      persistir: vi.fn(async (): Promise<UpsertMyCallResult> => ({ ok: false, error: 'x' })),
    });
    const adapter = new WhatsAppCallAdapter(ports);

    const resultado = await adapter.accept(CHAMADA);

    expect(resultado.persistencia.ok).toBe(false);
    // Mesmo com a gravação falhando, o agente ainda vai para a conversa.
    expect(abrirConversa).toHaveBeenCalledWith(CHAMADA.contactId);
  });
});

describe('WhatsAppCallAdapter.reject (T24 — ramo 2: recusar/Ignorar)', () => {
  it('grava declined LOCAL, com canal whatsapp e rótulo "Ignorar" (D7=b)', async () => {
    const { ports, persistir, abrirConversa } = montarPortas();
    const adapter = new WhatsAppCallAdapter(ports);

    const resultado = await adapter.reject(CHAMADA);
    const input = inputPersistido(persistir);

    expect(input.status).toBe('declined');
    expect(input.endReason).toBe('declined');
    expect(input.channel).toBe('whatsapp');
    expect(input.direction).toBe('inbound');
    expect(input.id).toBe(CHAMADA.callId);
    expect(input.endedAt).toEqual(expect.any(String));
    // Recusa local não marca atendimento.
    expect(input).not.toHaveProperty('answeredAt');

    expect(resultado.rotulo).toBe('Ignorar');
    expect(resultado.rotulo).toBe(ROTULO_IGNORAR_WHATSAPP);
    // Recusar não abre a conversa (não é o caminho do "atenda no aparelho").
    expect(abrirConversa).not.toHaveBeenCalled();
  });

  it('não tenta nenhuma recusa de rede: as únicas portas são persistir e abrirConversa', async () => {
    const persistir = vi.fn(async (): Promise<UpsertMyCallResult> => ({ ok: true }));
    const abrirConversa = vi.fn();
    const adapter = new WhatsAppCallAdapter({ persistir, abrirConversa });

    await adapter.reject(CHAMADA);

    // A superfície não expõe — nem chama — qualquer endpoint do Evolution GO:
    // D7=b é recusa LOCAL, só a gravação local acontece.
    expect(persistir).toHaveBeenCalledTimes(1);
    expect(abrirConversa).not.toHaveBeenCalled();
  });
});

/**
 * SL-247 — o que a "seleção por canal" é de fato em volta deste adapter.
 *
 * O item do inventário nasceu do comentário do campo `channel` ("habilita a
 * seleção por canal numa etapa futura"): o que se prova aqui é o estado REAL,
 * para o campo não prometer o que o código não faz.
 *
 *  1. o campo `channel` do adapter e o canal que ele grava são o MESMO valor
 *     (`whatsapp`) — uma fonte só;
 *  2. a seleção por canal que existe (roteamento do alerta, R2-CALL-007) manda
 *     `whatsapp` para este contrato local e `voip` para a máquina da sessão —
 *     nenhum caminho cruza os canais;
 *  3. nenhuma seleção de SAÍDA alcança este adapter: o canal não disca
 *     (`whatsapp_no_outbound`, já fixado no `describe` do `dial` acima).
 */
describe('seleção por canal (SL-247)', () => {
  it('o canal que o adapter grava é o mesmo que o campo `channel` dele declara', async () => {
    const { ports, persistir } = montarPortas();
    const adapter = new WhatsAppCallAdapter(ports);

    expect(adapter.channel).toBe('whatsapp');

    await adapter.accept(CHAMADA);
    const noAtendimento = inputPersistido(persistir);
    expect(noAtendimento.channel).toBe('whatsapp');
    expect(noAtendimento.channel).toBe(adapter.channel);

    persistir.mockClear();
    await adapter.reject(CHAMADA);
    const naRecusa = inputPersistido(persistir);
    expect(naRecusa.channel).toBe('whatsapp');
    expect(naRecusa.channel).toBe(adapter.channel);
  });

  it('a seleção do alerta manda o canal whatsapp para este contrato e o voip para o SIP', () => {
    // Fonte: `acaoDoAlerta.canalDaNotificacao`/`executorDaAcao` (R2-CALL-007).
    const canalWhatsApp = canalDaNotificacao('conexao-wa-1');
    expect(canalWhatsApp).toBe('whatsapp');
    // O executor do canal whatsapp é o contrato local (este adapter)...
    expect(executorDaAcao(canalWhatsApp)).toBe('whatsapp');

    const canalVoip = canalDaNotificacao(null);
    expect(canalVoip).toBe('voip');
    // ...e o do voip nunca é este adapter: vai para a máquina da sessão.
    expect(executorDaAcao(canalVoip)).toBe('sip');
  });
});
