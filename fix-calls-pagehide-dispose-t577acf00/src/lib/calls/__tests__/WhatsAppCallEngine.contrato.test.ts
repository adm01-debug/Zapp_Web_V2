/**
 * Contrato de `WhatsAppCallEngine` — etapa E005 do plano das ligações.
 *
 * Testa a **forma** do contrato, não um motor real: o cartão proíbe implementar
 * um motor de verdade. O `motorFake` abaixo é a implementação mínima que obedece
 * ao documento em `../WhatsAppCallEngine.ts`; o que se prova é o comportamento
 * exigido de **qualquer** implementação (o mesmo conjunto vale para o motor real
 * da E023/E068 quando ele existir).
 */
import { describe, it, expect } from 'vitest';
import type {
  WhatsAppCallEngine,
  WhatsAppCallEngineEvent,
  WhatsAppCallRef,
} from '../WhatsAppCallEngine';

/** Motor fake mínimo, conforme o contrato (só para o teste). */
function motorFake(): WhatsAppCallEngine {
  const listeners = new Set<(payload: WhatsAppCallEngineEvent) => void>();
  const refs = new Set<WhatsAppCallRef>();
  let seq = 0;

  function emit(ref: WhatsAppCallRef, event: WhatsAppCallEngineEvent['event']): void {
    // Cópia da lista: quem cancela dentro do handler não pode afetar a rodada.
    for (const listener of [...listeners]) listener({ ref, event });
  }

  return {
    async dial(phone) {
      if (phone.length === 0) throw new Error('telefone vazio');
      const ref = `c${++seq}`;
      refs.add(ref);
      emit(ref, { type: 'DIAL', sessionId: ref, channel: 'whatsapp', phone });
      return ref;
    },
    async answer(ref) {
      if (!refs.has(ref)) return;
      emit(ref, { type: 'ESTABLISHED' });
    },
    async hangup(ref) {
      if (!refs.has(ref)) return;
      emit(ref, { type: 'HANGUP_LOCAL' });
      refs.delete(ref);
    },
    async reject(ref) {
      if (!refs.has(ref)) return;
      emit(ref, { type: 'REJECT' });
      refs.delete(ref);
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe('contrato WhatsAppCallEngine', () => {
  it('dial resolve com a ref e emite DIAL correlacionado a essa ref', async () => {
    const engine = motorFake();
    const vistos: WhatsAppCallEngineEvent[] = [];
    engine.on((p) => vistos.push(p));

    const ref = await engine.dial('5511999999999');

    expect(ref).toBeTruthy();
    expect(vistos).toHaveLength(1);
    expect(vistos[0].ref).toBe(ref);
    expect(vistos[0].event).toMatchObject({ type: 'DIAL', channel: 'whatsapp', phone: '5511999999999' });
  });

  it('dial rejeita em falha real (não devolve ref silenciosa)', async () => {
    const engine = motorFake();
    await expect(engine.dial('')).rejects.toThrow();
  });

  it('eventos só chegam depois de assinar, e cancelar interrompe a entrega', async () => {
    const engine = motorFake();
    const antes: WhatsAppCallEngineEvent[] = [];
    const depois: WhatsAppCallEngineEvent[] = [];
    engine.on((p) => antes.push(p));
    const cancelar = engine.on((p) => depois.push(p));
    cancelar();

    const ref = await engine.dial('5511888888888');
    await engine.answer(ref);

    // O que cancelou não recebe NADA — nem o DIAL nem o ESTABLISHED.
    expect(depois).toHaveLength(0);
    expect(antes.map((v) => v.event.type)).toEqual(['DIAL', 'ESTABLISHED']);
  });

  it('cancela a assinatura duas vezes sem lançar', async () => {
    const engine = motorFake();
    const cancelar = engine.on(() => {});
    cancelar();
    expect(() => cancelar()).not.toThrow();
  });

  it('answer/hangup/reject numa ref conhecida emitem o evento canônico', async () => {
    const engine = motorFake();
    const tipos: string[] = [];
    engine.on((p) => tipos.push(p.event.type));

    const ref = await engine.dial('5511777777777');
    await engine.answer(ref);
    await engine.hangup(ref);

    expect(tipos).toEqual(['DIAL', 'ESTABLISHED', 'HANGUP_LOCAL']);
  });

  it('answer/hangup/reject numa ref desconhecida não lançam nem emitem', async () => {
    const engine = motorFake();
    const vistos: WhatsAppCallEngineEvent[] = [];
    engine.on((p) => vistos.push(p));

    await expect(engine.answer('inexistente')).resolves.toBeUndefined();
    await expect(engine.hangup('inexistente')).resolves.toBeUndefined();
    await expect(engine.reject('inexistente')).resolves.toBeUndefined();
    expect(vistos).toHaveLength(0);
  });
});
