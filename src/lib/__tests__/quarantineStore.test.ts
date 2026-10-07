/**
 * Comportamento do store global de quarentena (`src/lib/quarantineStore.ts`).
 * Singleton de módulo: cada teste desmonta os próprios listeners e limpa o cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quarantineStore } from '../quarantineStore';
import type { QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';

const rec = (over: Partial<QuarantineRecord> & { id: string }): QuarantineRecord => ({
  message_id: `msg-${over.id}`,
  decision: 'pending',
  created_at: '2026-10-01T10:00:00.000Z',
  ...over,
});

const assinantes: Array<() => void> = [];
let notificacoes = 0;

function assinar() {
  const cancelar = quarantineStore.subscribe(() => {
    notificacoes += 1;
  });
  assinantes.push(cancelar);
  return cancelar;
}

beforeEach(() => {
  quarantineStore.clear();
  notificacoes = 0;
});

afterEach(() => {
  while (assinantes.length) assinantes.pop()?.();
  quarantineStore.clear();
});

describe('subscribe / getSnapshot', () => {
  it('chama o listener a cada mudança e para depois do unsubscribe', () => {
    const cancelar = assinar();
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    expect(notificacoes).toBe(1);

    cancelar();
    quarantineStore.upsertMany([rec({ id: 'b' })]);
    expect(notificacoes).toBe(1);
    expect(quarantineStore.get('msg-b')).toBeDefined();
  });

  it('mantém a mesma referência de snapshot enquanto nada muda (contrato do useSyncExternalStore)', () => {
    assinar();
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    const primeiro = quarantineStore.getSnapshot();
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    expect(quarantineStore.getSnapshot()).toBe(primeiro);
    quarantineStore.upsertMany([rec({ id: 'b' })]);
    expect(quarantineStore.getSnapshot()).not.toBe(primeiro);
  });
});

describe('get', () => {
  it('devolve o registro pelo message_id e undefined para id ausente/vazio', () => {
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    expect(quarantineStore.get('msg-a')?.id).toBe('a');
    expect(quarantineStore.get('msg-z')).toBeUndefined();
    expect(quarantineStore.get(null)).toBeUndefined();
    expect(quarantineStore.get(undefined)).toBeUndefined();
    expect(quarantineStore.get('')).toBeUndefined();
  });
});

describe('upsertMany', () => {
  it('ignora registro sem message_id', () => {
    quarantineStore.upsertMany([rec({ id: 'sem-msg', message_id: null }), rec({ id: 'a' })]);
    expect(quarantineStore.getSnapshot().size).toBe(1);
    expect(quarantineStore.get('msg-a')?.id).toBe('a');
  });

  it('não notifica quando o registro reenviado é idêntico em decisão e id', () => {
    assinar();
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    notificacoes = 0;
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    expect(notificacoes).toBe(0);
  });

  it('substitui o registro quando a decisão muda', () => {
    assinar();
    quarantineStore.upsertMany([rec({ id: 'a', decision: 'pending' })]);
    quarantineStore.upsertMany([rec({ id: 'a', decision: 'deleted' })]);
    expect(quarantineStore.get('msg-a')?.decision).toBe('deleted');
    expect(notificacoes).toBe(2);
  });

  it.fails('atualiza o registro quando o conteúdo muda com a mesma decisão', () => {
    // upsertMany só compara `decision` e `id`: um reenvio com `reviewed_by` /
    // `media_url` / `threat_name` novos e a MESMA decisão é descartado — a
    // bolha segue mostrando o dado antigo até algo mais mudar.
    quarantineStore.upsertMany([rec({ id: 'a', decision: 'pending', threat_name: null })]);
    quarantineStore.upsertMany([rec({ id: 'a', decision: 'pending', threat_name: 'Eicar-Test' })]);
    expect(quarantineStore.get('msg-a')?.threat_name).toBe('Eicar-Test');
  });
});

describe('reconcile', () => {
  it('mantém a linha de maior versão entre ativos e liberados', () => {
    // Liberação NOVA (reviewed_at posterior) vence a re-quarentena antiga.
    quarantineStore.reconcile(
      [rec({ id: 'a', decision: 'pending', created_at: '2026-10-01T10:00:00.000Z' })],
      [rec({ id: 'a', decision: 'allowed', reviewed_at: '2026-10-02T10:00:00.000Z' })],
      { truncated: false },
    );
    expect(quarantineStore.get('msg-a')?.decision).toBe('allowed');
  });

  it('não deixa uma liberação ANTIGA vencer uma re-quarentena NOVA', () => {
    quarantineStore.reconcile(
      [rec({ id: 'a', decision: 'pending', created_at: '2026-10-03T10:00:00.000Z' })],
      [rec({ id: 'a', decision: 'allowed', reviewed_at: '2026-10-02T10:00:00.000Z' })],
      { truncated: false },
    );
    // O ativo (sem decisão ainda) usa created_at como versão: é mais novo.
    expect(quarantineStore.get('msg-a')?.decision).toBe('pending');
  });

  it('não rebaixa o cache para uma versão mais antiga já conhecida', () => {
    quarantineStore.upsertMany([
      rec({ id: 'a', decision: 'allowed', reviewed_at: '2026-10-05T10:00:00.000Z' }),
    ]);
    quarantineStore.reconcile(
      [],
      [rec({ id: 'a', decision: 'allowed', reviewed_at: '2026-10-01T10:00:00.000Z' })],
      { truncated: false },
    );
    expect(quarantineStore.get('msg-a')?.reviewed_at).toBe('2026-10-05T10:00:00.000Z');
  });

  it('usa o id como desempate quando a versão empata', () => {
    const mesmoInstante = '2026-10-05T10:00:00.000Z';
    // Mesmo message_id e mesmo instante: o desempate é o id ('b' > 'a').
    quarantineStore.reconcile(
      [rec({ id: 'b', message_id: 'msg-x', decision: 'deleted', created_at: mesmoInstante })],
      [rec({ id: 'a', message_id: 'msg-x', decision: 'allowed', reviewed_at: mesmoInstante })],
      { truncated: false },
    );
    expect(quarantineStore.get('msg-x')?.id).toBe('b');
    expect(quarantineStore.get('msg-x')?.decision).toBe('deleted');
  });

  it('com janela completa, remove do cache o que não voltou em nenhuma lista', () => {
    quarantineStore.upsertMany([rec({ id: 'a' }), rec({ id: 'b' })]);
    quarantineStore.reconcile([rec({ id: 'c' })], [], { truncated: false });
    const snap = quarantineStore.getSnapshot();
    expect(snap.has('msg-a')).toBe(false);
    expect(snap.has('msg-b')).toBe(false);
    expect(snap.has('msg-c')).toBe(true);
  });

  it('com janela truncada, a ausência é ambígua e nada é removido', () => {
    quarantineStore.upsertMany([rec({ id: 'a' }), rec({ id: 'b' })]);
    quarantineStore.reconcile([rec({ id: 'c' })], [], { truncated: true });
    const snap = quarantineStore.getSnapshot();
    expect(snap.has('msg-a')).toBe(true);
    expect(snap.has('msg-b')).toBe(true);
    expect(snap.has('msg-c')).toBe(true);
  });

  it('não notifica quando o retrato não muda o cache', () => {
    quarantineStore.upsertMany([rec({ id: 'a', decision: 'pending' })]);
    assinar();
    quarantineStore.reconcile([rec({ id: 'a', decision: 'pending' })], [], { truncated: false });
    expect(notificacoes).toBe(0);
  });

  it('ignora registros sem message_id', () => {
    quarantineStore.reconcile([rec({ id: 'x', message_id: null })], [], { truncated: true });
    expect(quarantineStore.getSnapshot().size).toBe(0);
  });
});

describe('remove / replaceForDecision / clear', () => {
  it('remove um id e notifica uma única vez', () => {
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    assinar();
    quarantineStore.remove('msg-a');
    expect(quarantineStore.get('msg-a')).toBeUndefined();
    expect(notificacoes).toBe(1);
  });

  it('remover id ausente não notifica', () => {
    assinar();
    quarantineStore.remove('msg-inexistente');
    expect(notificacoes).toBe(0);
  });

  it('replaceForDecision troca só as linhas daquela decisão', () => {
    quarantineStore.upsertMany([
      rec({ id: 'a', decision: 'pending' }),
      rec({ id: 'b', decision: 'deleted' }),
    ]);
    quarantineStore.replaceForDecision('pending', [rec({ id: 'c', decision: 'pending' })]);
    const snap = quarantineStore.getSnapshot();
    expect(snap.has('msg-a')).toBe(false);
    expect(snap.has('msg-b')).toBe(true);
    expect(snap.get('msg-c')?.decision).toBe('pending');
  });

  it('clear esvazia o cache, notifica uma vez e troca a referência do snapshot', () => {
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    const antes = quarantineStore.getSnapshot();
    assinar();
    quarantineStore.clear();
    expect(quarantineStore.getSnapshot().size).toBe(0);
    expect(quarantineStore.getSnapshot()).not.toBe(antes);
    expect(notificacoes).toBe(1);
    quarantineStore.clear();
    expect(notificacoes).toBe(1);
  });
});

describe('listener quebrado', () => {
  it('avisa todos os assinantes quando nenhum estoura', () => {
    const vistos: string[] = [];
    const um = quarantineStore.subscribe(() => vistos.push('um'));
    const dois = quarantineStore.subscribe(() => vistos.push('dois'));
    quarantineStore.upsertMany([rec({ id: 'a' })]);
    um();
    dois();
    expect(vistos).toEqual(['um', 'dois']);
  });

  it('propaga o erro do assinante sem perder o registro que já entrou no snapshot', () => {
    const cancelar = quarantineStore.subscribe(() => {
      throw new Error('listener quebrado');
    });
    expect(() => quarantineStore.upsertMany([rec({ id: 'a' })])).toThrow('listener quebrado');
    cancelar();
    expect(quarantineStore.get('msg-a')?.id).toBe('a');
  });

  it.fails('um assinante que estoura não deveria calar os demais', () => {
    // `refreshSnapshot` usa `listeners.forEach(l => l())`: a exceção do
    // primeiro listener aborta o forEach e os assinantes seguintes (bolhas já
    // montadas) não são avisados — a tela para de refletir o store.
    const avisado = vi.fn();
    const quebrado = quarantineStore.subscribe(() => {
      throw new Error('listener quebrado');
    });
    const outro = quarantineStore.subscribe(avisado);

    try {
      quarantineStore.upsertMany([rec({ id: 'a' })]);
    } catch {
      /* o erro do primeiro não pode impedir o aviso dos outros */
    } finally {
      quebrado();
      outro();
    }

    expect(avisado).toHaveBeenCalled();
  });
});
