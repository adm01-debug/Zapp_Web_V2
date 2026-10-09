/**
 * R2-MOD-071 (item 434) — Repetir conversão de áudio após erro do codificador
 * fica aguardando o script que já falhou.
 *
 * O carregador do lamejs (`loadLamejs`, em src/utils/audioToMp3.ts) mantém uma
 * promise compartilhada. Depois de um erro, ele limpava só a promise e deixava
 * o `<script data-lamejs="1">` que falhou no documento — a tentativa seguinte
 * encontrava o elemento já encerrado, só anexava listeners a ele (sem novo
 * carregamento e sem limite de espera) e o `await` ficava pendente para sempre.
 * No fluxo real isso prende o estado ocupado (useAudioMemes/useMediaUpload) até
 * recarregar a página.
 *
 * Estes testes dirigem o módulo REAL: cada tentativa é um elemento de script de
 * verdade, e os eventos 'error'/'load' são disparados na mão (o jsdom não busca
 * o vendor). Um resultado discriminado devolvido = o carregador encerrou.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SCRIPT_SELECTOR = 'script[data-lamejs="1"]';
/** Mesmo valor de `LAMEJS_LOAD_TIMEOUT_MS` em src/utils/audioToMp3.ts. */
const LOAD_TIMEOUT_MS = 15000;

type ConvertResult =
  | { ok: true; blob: Blob; fileName: string; durationSeconds: number }
  | { ok: false; reason: 'decode-failed' | 'too-long' | 'encoder-unavailable'; detail?: string };

/** Codificador falso: só importa que `window.lamejs` passe a existir. */
function lamejsStub() {
  return {
    Mp3Encoder: class {
      encodeBuffer() {
        return new Int8Array(0);
      }
      flush() {
        return new Int8Array(0);
      }
    },
  };
}

/** AudioContext falso: falha no decode para o fluxo parar num ponto conhecido. */
class FakeAudioContext {
  state = 'running';
  async resume() {}
  async close() {}
  async decodeAudioData() {
    throw new Error('formato de teste não decodificável');
  }
}

function lamejsTags(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR));
}

/**
 * Espera a promise encerrar por conta própria; aponta `timedOut` quando ela fica
 * pendente (é exatamente o sintoma do achado: await sem fim).
 */
async function settleWithin<T>(
  promise: Promise<T>,
  ms = 500,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined };
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer.id = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  const result = await Promise.race([
    promise.then((value) => ({ timedOut: false as const, value })),
    timeout,
  ]);
  if (timer.id) clearTimeout(timer.id);
  return result;
}

function audioFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'audio/webm' });
}

let convertAudioToMp3: typeof import('../audioToMp3').convertAudioToMp3;

beforeEach(async () => {
  vi.resetModules(); // zera o cache de módulo (lamejsCache/lamejsLoadPromise)
  lamejsTags().forEach((el) => el.remove());
  delete (window as unknown as Record<string, unknown>).lamejs;
  (window as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
  convertAudioToMp3 = (await import('../audioToMp3')).convertAudioToMp3;
});

afterEach(() => {
  vi.useRealTimers();
  lamejsTags().forEach((el) => el.remove());
});

describe('loadLamejs — repetir a conversão depois de um erro do codificador', () => {
  it('a segunda tentativa inicia um novo carregamento e encerra (não fica pendente)', async () => {
    const file = audioFile('meme.webm');

    // 1ª conversão: o vendor falha.
    const first = convertAudioToMp3(file, 'meme.webm');
    const tag1 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(tag1).not.toBeNull();
    tag1!.dispatchEvent(new Event('error'));

    const firstResult = await settleWithin(first);
    expect(firstResult).toEqual({
      timedOut: false,
      value: expect.objectContaining({ ok: false, reason: 'encoder-unavailable' }),
    });

    // 2ª conversão (o usuário tenta de novo, ou o próximo item do lote).
    const second = convertAudioToMp3(file, 'meme.webm');
    const tag2 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(tag2).not.toBeNull();
    // O elemento que já falhou não pode ser reaproveitado: sem evento novo no
    // browser, reaproveitar = espera infinita. Tem de haver um carregamento novo.
    expect(tag2).not.toBe(tag1);

    (window as unknown as Record<string, unknown>).lamejs = lamejsStub();
    tag2!.dispatchEvent(new Event('load'));

    const secondResult = await settleWithin(second);
    // Chegou ao decode (e falhou nele) — ou seja, o carregador encerrou e o
    // consumidor recebeu resultado discriminado em vez de ficar preso.
    expect(secondResult).toEqual({
      timedOut: false,
      value: expect.objectContaining({ ok: false, reason: 'decode-failed' }),
    });
  });

  it('load sem o global encerra e a tentativa seguinte recarrega', async () => {
    const file = audioFile('meme.webm');

    const first = convertAudioToMp3(file, 'meme.webm');
    const tag1 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    tag1!.dispatchEvent(new Event('load')); // load sem window.lamejs

    const firstResult = await settleWithin(first);
    expect(firstResult).toEqual({
      timedOut: false,
      value: expect.objectContaining({
        ok: false,
        reason: 'encoder-unavailable',
        detail: expect.stringContaining('não disponível'),
      }),
    });

    const second = convertAudioToMp3(file, 'meme.webm');
    const tag2 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(tag2).not.toBeNull();
    expect(tag2).not.toBe(tag1);

    (window as unknown as Record<string, unknown>).lamejs = lamejsStub();
    tag2!.dispatchEvent(new Event('load'));

    const secondResult = await settleWithin(second);
    expect(secondResult).toEqual({
      timedOut: false,
      value: expect.objectContaining({ ok: false, reason: 'decode-failed' }),
    });
  });

  it('falhas repetidas não deixam elemento pendente no documento e o lote segue', async () => {
    const file = audioFile('meme.webm');

    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = convertAudioToMp3(file, 'meme.webm');
      const tag = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
      expect(tag).not.toBeNull();
      tag!.dispatchEvent(new Event('error'));
      const settled = await settleWithin(pending);
      expect(settled).toEqual({
        timedOut: false,
        value: expect.objectContaining({ ok: false, reason: 'encoder-unavailable' }),
      });
      // O elemento que falhou tem de sair de cena (nada de listener órfão
      // acumulado num script que já terminou).
      expect(lamejsTags()).toHaveLength(0);
    }

    // Terceiro item do lote: agora o vendor responde e o fluxo conclui.
    const third = convertAudioToMp3(file, 'meme.webm');
    const tag3 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(tag3).not.toBeNull();
    (window as unknown as Record<string, unknown>).lamejs = lamejsStub();
    tag3!.dispatchEvent(new Event('load'));

    const thirdResult = await settleWithin(third);
    expect(thirdResult).toEqual({
      timedOut: false,
      value: expect.objectContaining({ ok: false, reason: 'decode-failed' }),
    });
  });

  it('chamadas concorrentes continuam compartilhando um único carregamento', async () => {
    const a = convertAudioToMp3(audioFile('a.webm'), 'a.webm');
    const b = convertAudioToMp3(audioFile('b.webm'), 'b.webm');

    const tags = lamejsTags();
    expect(tags).toHaveLength(1);

    (window as unknown as Record<string, unknown>).lamejs = lamejsStub();
    tags[0].dispatchEvent(new Event('load'));

    const [resultA, resultB] = await Promise.all([settleWithin(a), settleWithin(b)]);
    expect(resultA).toEqual({
      timedOut: false,
      value: expect.objectContaining({ ok: false, reason: 'decode-failed' }),
    });
    expect(resultB).toEqual({
      timedOut: false,
      value: expect.objectContaining({ ok: false, reason: 'decode-failed' }),
    });
  });

  it('script que nunca responde encerra por timeout e libera a próxima tentativa', async () => {
    vi.useFakeTimers();
    const file = audioFile('lento.webm');

    const stuck = convertAudioToMp3(file, 'lento.webm');
    const tag1 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(tag1).not.toBeNull();

    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    const stuckResult = await stuck;
    expect(stuckResult).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'encoder-unavailable',
        detail: expect.stringContaining('Timeout'),
      }),
    );

    // A promessa compartilhada não pode ter ficado presa ao elemento abandonado.
    const retry = convertAudioToMp3(file, 'lento.webm');
    const tag2 = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(tag2).not.toBeNull();
    expect(tag2).not.toBe(tag1);
    (window as unknown as Record<string, unknown>).lamejs = lamejsStub();
    tag2!.dispatchEvent(new Event('load'));

    const retryResult = await retry;
    expect(retryResult).toEqual(expect.objectContaining({ ok: false, reason: 'decode-failed' }));
  });
});
