import { describe, it, expect } from 'vitest';
import { createRunGuard } from '../runGuard';

// PRNG determinístico (mulberry32) — mesmas seeds geram sempre os mesmos
// cenários, então qualquer falha é reproduzível com exatidão.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(n: number, rand: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Simula o padrão real dos painéis: N fetches disparados em sequência
 * (ex.: usuário trocando de contato rapidamente), cada um resolvendo em
 * ordem arbitrária. `state` faz o papel do useState do componente.
 */
async function simulate(opts: {
  runs: number;
  resolutionOrder: number[];
  guarded: boolean;
}): Promise<number> {
  const guard = createRunGuard();
  const gates = Array.from({ length: opts.runs }, deferred);
  let state = -1;

  const inFlight = gates.map(async (gate, launchIndex) => {
    const runId = guard.start();
    await gate.promise;
    if (opts.guarded && !guard.isCurrent(runId)) return;
    state = launchIndex;
  });

  // Importante: os starts acima rodam sincronamente na criação das promises,
  // então a ordem de lançamento é exatamente launchIndex 0..N-1.
  for (const i of opts.resolutionOrder) {
    gates[i].resolve();
    await Promise.resolve();
  }
  await Promise.all(inFlight);
  return state;
}

describe('runGuard: simulação de corridas assíncronas (centenas de cenários)', () => {
  it('300 cenários: com a guarda, a última execução SEMPRE vence, em qualquer ordem de resolução', async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      const runs = 2 + Math.floor(rand() * 11); // 2..12 fetches concorrentes
      const order = shuffled(runs, rand);
      const finalState = await simulate({ runs, resolutionOrder: order, guarded: true });
      expect(finalState, `seed=${seed} runs=${runs} order=${order.join(',')}`).toBe(runs - 1);
    }
  });

  it('300 cenários: SEM a guarda, o estado final é o da execução que resolveu por último (bug reproduzido)', async () => {
    let staleWins = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed * 7919);
      const runs = 2 + Math.floor(rand() * 11);
      const order = shuffled(runs, rand);
      const finalState = await simulate({ runs, resolutionOrder: order, guarded: false });
      const lastResolved = order[order.length - 1];
      expect(finalState, `seed=${seed}`).toBe(lastResolved);
      if (lastResolved !== runs - 1) staleWins++;
    }
    // Sensibilidade do harness: sem guarda, a resposta obsoleta vence em
    // boa parte dos embaralhamentos — se isso nunca ocorresse, os 300
    // cenários acima não estariam exercitando o bug de verdade.
    expect(staleWins).toBeGreaterThan(100);
  });

  it('200 cenários: invalidate() no meio (cleanup/troca de tela) descarta TODAS as respostas pendentes', async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(seed * 104729);
      const runs = 1 + Math.floor(rand() * 8);
      const guard = createRunGuard();
      const gates = Array.from({ length: runs }, deferred);
      let state = -1;

      const inFlight = gates.map(async (gate, launchIndex) => {
        const runId = guard.start();
        await gate.promise;
        if (!guard.isCurrent(runId)) return;
        state = launchIndex;
      });

      guard.invalidate(); // cleanup do efeito antes de qualquer resposta

      for (const i of shuffled(runs, rand)) gates[i].resolve();
      await Promise.all(inFlight);
      expect(state, `seed=${seed}`).toBe(-1);
    }
  });

  it('strict-mode double-invoke: start → invalidate → start; só a segunda execução escreve', async () => {
    const guard = createRunGuard();
    const a = deferred();
    const b = deferred();
    let state = 'nenhum';

    const runA = (async () => {
      const id = guard.start();
      await a.promise;
      if (guard.isCurrent(id)) state = 'A';
    })();
    guard.invalidate();
    const runB = (async () => {
      const id = guard.start();
      await b.promise;
      if (guard.isCurrent(id)) state = 'B';
    })();

    a.resolve();
    await runA;
    expect(state).toBe('nenhum'); // resposta de A chegou primeiro e foi descartada
    b.resolve();
    await runB;
    expect(state).toBe('B');
  });

  it('ids são estritamente crescentes e nunca colidem (1000 starts)', () => {
    const guard = createRunGuard();
    let prev = 0;
    for (let i = 0; i < 1000; i++) {
      const id = guard.start();
      expect(id).toBeGreaterThan(prev);
      expect(guard.isCurrent(prev)).toBe(false);
      expect(guard.isCurrent(id)).toBe(true);
      prev = id;
    }
  });

  it('100 cenários mistos: starts e invalidates intercalados preservam a invariante "só o run corrente escreve"', async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rand = mulberry32(seed * 31337);
      const guard = createRunGuard();
      const events = 3 + Math.floor(rand() * 10);
      const gates: Deferred[] = [];
      const pending: Promise<void>[] = [];
      let state = -1;
      let lastStartIndex = -1;
      let invalidatedAfterLastStart = false;

      for (let e = 0; e < events; e++) {
        if (rand() < 0.7) {
          const gate = deferred();
          const launchIndex = gates.length;
          gates.push(gate);
          lastStartIndex = launchIndex;
          invalidatedAfterLastStart = false;
          pending.push(
            (async () => {
              const id = guard.start();
              await gate.promise;
              if (!guard.isCurrent(id)) return;
              state = launchIndex;
            })(),
          );
        } else {
          guard.invalidate();
          invalidatedAfterLastStart = true;
        }
      }

      for (const i of shuffled(gates.length, rand)) gates[i].resolve();
      await Promise.all(pending);

      const expected = invalidatedAfterLastStart ? -1 : lastStartIndex;
      expect(state, `seed=${seed}`).toBe(expected);
    }
  });
});

/**
 * Segunda família de bug: a guarda protege contra RESPOSTAS atrasadas, mas um
 * handler de mutação criado num render antigo (closure com a chave velha) que
 * chama o loader DEPOIS da troca de contato inicia um run NOVO — e o run novo
 * é, por definição, o corrente. O loader re-legitimaria a chave antiga.
 * O conserto nos painéis é o gate de chave ativa via ref:
 *   if (activeKeyRef.current === closureKey) loadX();
 */
async function simulateStaleMutationReload(opts: {
  mutations: number;
  resolveBeforeSwitch: number;
  gated: boolean;
}): Promise<{ state: string; reloadsForOldKey: number }> {
  const guard = createRunGuard();
  let activeKey = 'k0'; // papel do activeContactRef.current
  let state = 'nenhum';
  let reloadsForOldKey = 0;
  const loaderGates: Deferred[] = [];
  const pending: Promise<void>[] = [];

  // Loader real dos painéis: start() síncrono, fetch assíncrono, escrita guardada
  const loader = (key: string) => {
    const runId = guard.start();
    const gate = deferred();
    loaderGates.push(gate);
    const run = (async () => {
      await gate.promise;
      if (!guard.isCurrent(runId)) return;
      state = key;
    })();
    pending.push(run);
  };

  const drain = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  // Efeito inicial: contato k0 carrega
  loader('k0');

  // Mutações disparadas enquanto k0 está ativo (closure captura k0)
  const mutationGates = Array.from({ length: opts.mutations }, deferred);
  mutationGates.forEach((gate) => {
    const closureKey = activeKey; // 'k0'
    pending.push(
      (async () => {
        await gate.promise; // INSERT/UPDATE/DELETE em voo
        if (opts.gated && activeKey !== closureKey) return; // gate de chave ativa
        if (activeKey !== closureKey) reloadsForOldKey++;
        loader(closureKey);
      })(),
    );
  });

  // Parte das mutações conclui ANTES da troca: reload legítimo, deve passar
  for (let i = 0; i < opts.resolveBeforeSwitch; i++) {
    mutationGates[i].resolve();
    await drain();
  }

  // Troca de contato: efeito atualiza a chave ativa e recarrega k1
  activeKey = 'k1';
  loader('k1');

  // O restante das mutações conclui DEPOIS da troca (closures obsoletas)
  for (let i = opts.resolveBeforeSwitch; i < opts.mutations; i++) {
    mutationGates[i].resolve();
    await drain();
  }

  // Resolve os fetches dos loaders na ordem de criação (inclui os criados
  // dinamicamente pelas mutações); a guarda decide quem escreve
  let idx = 0;
  while (idx < loaderGates.length) {
    loaderGates[idx].resolve();
    idx++;
    await drain();
  }
  await Promise.all(pending);
  return { state, reloadsForOldKey };
}

describe('runGuard + gate de chave ativa: mutações obsoletas não re-legitimam o contato antigo', () => {
  it('150 cenários: COM o gate, nenhuma mutação atrasada recarrega a chave antiga e k1 sempre vence', async () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rand = mulberry32(seed * 2654435761);
      const mutations = 1 + Math.floor(rand() * 6); // 1..6 mutações em voo
      const resolveBeforeSwitch = Math.floor(rand() * mutations); // 0..mutations-1 (≥1 fica para depois)
      const { state, reloadsForOldKey } = await simulateStaleMutationReload({
        mutations,
        resolveBeforeSwitch,
        gated: true,
      });
      expect(state, `seed=${seed} mut=${mutations} antes=${resolveBeforeSwitch}`).toBe('k1');
      expect(reloadsForOldKey, `seed=${seed}`).toBe(0);
    }
  });

  it('150 cenários: SEM o gate, a mutação atrasada promove k0 a run corrente e sobrescreve k1 (bug reproduzido)', async () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rand = mulberry32(seed * 40503);
      const mutations = 1 + Math.floor(rand() * 6);
      const resolveBeforeSwitch = Math.floor(rand() * mutations);
      const { state, reloadsForOldKey } = await simulateStaleMutationReload({
        mutations,
        resolveBeforeSwitch,
        gated: false,
      });
      // Sensibilidade do harness: sem o gate, o reload obsoleto SEMPRE ocorre
      // e o último run criado (k0 da mutação atrasada) vence sobre k1.
      expect(reloadsForOldKey, `seed=${seed}`).toBeGreaterThan(0);
      expect(state, `seed=${seed} mut=${mutations} antes=${resolveBeforeSwitch}`).toBe('k0');
    }
  });
});
