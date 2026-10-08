/**
 * Controles da chamada em curso — espera (hold), transferência (cega e
 * assistida) e conferência. Fecha o `it.todo` de
 * `src/components/calls/__tests__/calls-access.test.ts:230`.
 *
 * O que este arquivo existe para travar (as falhas clássicas desta área):
 * - a operação **nunca** marca o estado quando o transporte recusou — botão de
 *   espera preso era o defeito clássico;
 * - `esperar()` repetido não dispara um segundo re-INVITE (idempotência);
 * - transferência em curso não aceita um segundo REFER (duplo clique);
 * - **conferência é recusada com motivo**, nunca em silêncio;
 * - alvo não discável não chega à central.
 *
 * A porta é falsa aqui de propósito: o que se prova é a regra da operação. O
 * SIP de verdade (re-INVITE com `hold` e REFER) é provado em
 * `src/lib/calls/adapters/__tests__/SipCallAdapter.controle.test.ts`.
 */

import { describe, expect, it, vi } from 'vitest';

import type { Session } from 'sip.js';

import {
  ControleDeChamada,
  MOTIVO_DE_CONTROLE,
  type PortaDeControle,
} from '../controleDaChamada';

/** Sessão mínima: o módulo só olha `state` e o Call-ID (`id`). */
function sessao(id = 'call-1', state = 'Established'): Session {
  return { id, state } as unknown as Session;
}

function porta(overrides: Partial<PortaDeControle> = {}): PortaDeControle {
  return {
    setHold: vi.fn(async () => true),
    refer: vi.fn(async () => true),
    ...overrides,
  };
}

describe('ControleDeChamada — espera (hold)', () => {
  it('espera aplica o hold no transporte e marca o estado', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);
    const chamada = sessao();

    const resultado = await controle.esperar(chamada);

    expect(resultado).toEqual({ ok: true, emEspera: true });
    expect(sip.setHold).toHaveBeenCalledTimes(1);
    expect(sip.setHold).toHaveBeenCalledWith(chamada, true);
    expect(controle.estado.emEspera).toBe(true);
  });

  it('esperar duas vezes não dispara um segundo re-INVITE', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);
    const chamada = sessao();

    await controle.esperar(chamada);
    const segunda = await controle.esperar(chamada);

    expect(segunda).toEqual({
      ok: false,
      motivo: 'ja_em_espera',
      mensagem: MOTIVO_DE_CONTROLE.ja_em_espera,
    });
    expect(sip.setHold).toHaveBeenCalledTimes(1);
  });

  it('retomar sem estar em espera não toca na central', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    const resultado = await controle.retomar(sessao());

    expect(resultado).toEqual({
      ok: false,
      motivo: 'nao_esta_em_espera',
      mensagem: MOTIVO_DE_CONTROLE.nao_esta_em_espera,
    });
    expect(sip.setHold).not.toHaveBeenCalled();
  });

  it('retomar depois da espera volta a mídia e desmarca o estado', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);
    const chamada = sessao();

    await controle.esperar(chamada);
    const resultado = await controle.retomar(chamada);

    expect(resultado).toEqual({ ok: true, emEspera: false });
    expect(sip.setHold).toHaveBeenLastCalledWith(chamada, false);
    expect(controle.estado.emEspera).toBe(false);
  });

  it('sem sessão estabelecida a espera é recusada com o motivo certo', async () => {
    const semSessao = new ControleDeChamada(porta());
    const naoAtendida = new ControleDeChamada(porta());

    expect(await semSessao.esperar(null)).toMatchObject({ motivo: 'sem_chamada' });
    expect(await naoAtendida.esperar(sessao('call-1', 'Establishing'))).toMatchObject({
      motivo: 'chamada_nao_atendida',
    });
  });

  it('transporte recusando NÃO deixa a espera marcada (e a próxima tentativa vale)', async () => {
    const setHold = vi.fn(async () => false);
    const controle = new ControleDeChamada(porta({ setHold }));
    const chamada = sessao();

    const recusado = await controle.esperar(chamada);
    expect(recusado).toEqual({
      ok: false,
      motivo: 'falha_no_transporte',
      mensagem: MOTIVO_DE_CONTROLE.falha_no_transporte,
    });
    expect(controle.estado.emEspera).toBe(false);

    setHold.mockResolvedValueOnce(true);
    expect(await controle.esperar(chamada)).toEqual({ ok: true, emEspera: true });
    expect(setHold).toHaveBeenCalledTimes(2);
  });

  it('transporte que LANÇA também não deixa estado preso', async () => {
    const setHold = vi.fn(async () => {
      throw new Error('websocket caiu');
    });
    const controle = new ControleDeChamada(porta({ setHold }));

    const resultado = await controle.esperar(sessao());

    expect(resultado).toMatchObject({ motivo: 'falha_no_transporte' });
    expect(controle.estado.emEspera).toBe(false);
  });
});

describe('ControleDeChamada — transferência', () => {
  it('transferência cega disca o número na forma canônica (dígitos, como o resto do módulo)', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);
    const chamada = sessao();

    const resultado = await controle.transferir(chamada, '+55 (11) 99999-2048');

    expect(resultado.ok).toBe(true);
    expect(sip.refer).toHaveBeenCalledTimes(1);
    expect(sip.refer).toHaveBeenCalledWith(chamada, '5511999992048');
  });

  it('ramal curto (3 a 6 dígitos) também é alvo válido', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    expect(await controle.transferir(sessao(), '2001')).toMatchObject({ ok: true });
    expect(sip.refer).toHaveBeenCalledWith(expect.anything(), '2001');
  });

  it('alvo não discável nem chega ao transporte', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    const resultado = await controle.transferir(sessao(), 'ramal da recepção');

    expect(resultado).toEqual({
      ok: false,
      motivo: 'alvo_invalido',
      mensagem: MOTIVO_DE_CONTROLE.alvo_invalido,
    });
    expect(sip.refer).not.toHaveBeenCalled();
  });

  it('transferência em curso não aceita um segundo REFER (duplo clique)', async () => {
    let liberar: (aceitou: boolean) => void = () => undefined;
    let pendente = true;
    const refer = vi.fn(() => {
      if (!pendente) return Promise.resolve(true);
      pendente = false;
      return new Promise<boolean>((resolve) => {
        liberar = resolve;
      });
    });
    const controle = new ControleDeChamada(porta({ refer }));
    const chamada = sessao();

    const primeira = controle.transferir(chamada, '2001');
    const segunda = await controle.transferir(chamada, '2002');

    expect(segunda).toEqual({
      ok: false,
      motivo: 'transferencia_em_curso',
      mensagem: MOTIVO_DE_CONTROLE.transferencia_em_curso,
    });
    expect(refer).toHaveBeenCalledTimes(1);

    liberar(true);
    expect(await primeira).toMatchObject({ ok: true });
    // A trava é só da resposta pendente: concluída a primeira, a próxima vale.
    expect(await controle.transferir(chamada, '2002')).toMatchObject({ ok: true });
    expect(refer).toHaveBeenCalledTimes(2);
  });

  it('transporte recusando a transferência mantém a chamada e libera a trava', async () => {
    const refer = vi.fn(async () => false);
    const controle = new ControleDeChamada(porta({ refer }));
    const chamada = sessao();

    expect(await controle.transferir(chamada, '2001')).toMatchObject({
      motivo: 'falha_no_transporte',
    });
    expect(controle.estado.transferindo).toBe(false);
    expect(controle.estado.emEspera).toBe(false);
  });

  it('transferência assistida entrega a perna em consulta ao REFER', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);
    const atual = sessao('call-1');
    const consulta = sessao('call-2');

    const resultado = await controle.transferirAssistida(atual, consulta);

    expect(resultado).toMatchObject({ ok: true });
    expect(sip.refer).toHaveBeenCalledTimes(1);
    expect(sip.refer).toHaveBeenCalledWith(atual, consulta);
  });

  it('transferir para a própria chamada é recusado (outro objeto, mesmo Call-ID)', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    const resultado = await controle.transferirAssistida(sessao('call-1'), sessao('call-1'));

    expect(resultado).toEqual({
      ok: false,
      motivo: 'mesma_perna',
      mensagem: MOTIVO_DE_CONTROLE.mesma_perna,
    });
    expect(sip.refer).not.toHaveBeenCalled();
  });

  it('perna em consulta ainda não atendida é recusada', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    const resultado = await controle.transferirAssistida(sessao('call-1'), sessao('call-2', 'Establishing'));

    expect(resultado).toMatchObject({ motivo: 'chamada_nao_atendida' });
    expect(sip.refer).not.toHaveBeenCalled();
  });

  it('sem chamada estabelecida não há transferência', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    expect(await controle.transferir(null, '2001')).toMatchObject({ motivo: 'sem_chamada' });
    expect(await controle.transferirAssistida(sessao('call-1', 'Establishing'), sessao('call-2'))).toMatchObject({
      motivo: 'chamada_nao_atendida',
    });
    expect(sip.refer).not.toHaveBeenCalled();
  });
});

describe('ControleDeChamada — conferência e reinício', () => {
  it('conferência é recusada COM MOTIVO (esta linha não tem ponte) e não toca a central', async () => {
    const sip = porta();
    const controle = new ControleDeChamada(sip);

    const resultado = controle.conferenciar();

    expect(resultado).toEqual({
      ok: false,
      motivo: 'conferencia_sem_ponte',
      mensagem: MOTIVO_DE_CONTROLE.conferencia_sem_ponte,
    });
    // Recusa explícita: nenhuma operação de mídia é disparada por engano.
    expect(sip.setHold).not.toHaveBeenCalled();
    expect(sip.refer).not.toHaveBeenCalled();
  });

  it('todo motivo tem rótulo operacional em pt-BR (a tela mostra o motivo, não o id)', () => {
    const ids = Object.keys(MOTIVO_DE_CONTROLE) as (keyof typeof MOTIVO_DE_CONTROLE)[];
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) {
      expect(MOTIVO_DE_CONTROLE[id].length, String(id)).toBeGreaterThan(0);
      expect(MOTIVO_DE_CONTROLE[id], String(id)).not.toBe(id);
    }
  });

  it('reiniciar zera a espera e a transferência (chamada nova não herda estado velho)', async () => {
    const controle = new ControleDeChamada(porta());
    await controle.esperar(sessao());

    controle.reiniciar();

    expect(controle.estado).toEqual({ emEspera: false, transferindo: false });
  });
});
