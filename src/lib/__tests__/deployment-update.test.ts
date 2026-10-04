/**
 * Achado de 03/10: o monitor de versão só **avisava** ("Atualizar agora") e a aba continuava
 * servindo um bundle que a produção já tinha apagado — sete chunks lazy em 404 na mesma sessão
 * (`useQueues`, `useMFA`, `TransferDialog`, ...) enquanto a Journey respondia 200. O usuário
 * ficava com a aba quebrada até apertar F5 por conta própria.
 *
 * A correção faz a app se curar: recarrega na hora se a aba estiver escondida (ninguém é
 * interrompido) e, se estiver visível, avisa e recarrega no primeiro instante em que ela for
 * escondida (quem está escrevendo uma mensagem não perde o texto).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `__ZAPP_BUILD_ID__` vem do `define` do vite.config.ts no build; o vitest.config.ts não tem
 * `define`, então o identificador precisa existir no globalThis ANTES do import do módulo
 * (leitura de identificador não declarado cai no globalThis, e o módulo lê no carregamento).
 * Sem isto o arquivo falha ao carregar e os testes ficariam invisíveis.
 */
(globalThis as unknown as Record<string, unknown>).__ZAPP_BUILD_ID__ = 'build-do-teste';

const toastInfo = vi.fn();
vi.mock('sonner', () => ({ toast: { info: (...args: unknown[]) => toastInfo(...args) } }));

const { decidirAcaoNaAtualizacao, startDeploymentUpdateMonitor } = await import('@/lib/deployment-update');

let visibilidade: DocumentVisibilityState = 'visible';

function definirVisibilidade(valor: DocumentVisibilityState) {
  visibilidade = valor;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  definirVisibilidade('visible');
  toastInfo.mockClear();
  // O servidor anuncia um build diferente do que está rodando.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ buildId: 'build-novo' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('decidirAcaoNaAtualizacao', () => {
  it('aba escondida: recarrega agora, sem avisar (ninguém está olhando)', () => {
    expect(decidirAcaoNaAtualizacao('hidden')).toBe('recarregar-agora');
  });

  it('aba visível: avisa e recarrega quando a aba for escondida', () => {
    expect(decidirAcaoNaAtualizacao('visible')).toBe('avisar-e-recarregar-ao-esconder');
  });
});

describe('startDeploymentUpdateMonitor', () => {
  it('aba visível: NÃO recarrega na detecção e recarrega quando a aba é escondida', async () => {
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000); // checagem inicial de 30s
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalled();

    expect(recarregar).not.toHaveBeenCalled(); // visível: não interrompe

    definirVisibilidade('hidden');
    expect(recarregar).toHaveBeenCalledTimes(1); // curou a aba em silêncio

    parar();
  });

  it('aba escondida: recarrega na própria detecção', async () => {
    definirVisibilidade('hidden');
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0);

    // Esta e a assercao que mira a mudanca de comportamento: a checagem RODA com a aba escondida
    // (antes retornava cedo e a deteccao nunca acontecia). Sem ela, restaurar a guarda antiga
    // deixava a suite verde — foi o que a mutacao B mostrou.
    expect(fetch).toHaveBeenCalled();
    expect(recarregar).toHaveBeenCalledTimes(1);

    parar();
  });

  it('build igual: não recarrega e não avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ buildId: 'build-do-teste' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0);
    definirVisibilidade('hidden');

    expect(recarregar).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();

    parar();
  });
});
