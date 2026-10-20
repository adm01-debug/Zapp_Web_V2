/**
 * Achado de 03/10: o monitor de versão só **avisava** ("Atualizar agora") e a aba continuava
 * servindo um bundle que a produção já tinha apagado — sete chunks lazy em 404 na mesma sessão
 * (`useQueues`, `useMFA`, `TransferDialog`, ...) enquanto a Journey respondia 200. O usuário
 * ficava com a aba quebrada até apertar F5 por conta própria.
 *
 * A correção faz a app se curar: recarrega na hora se a aba estiver escondida (ninguém é
 * interrompido) e, se estiver visível, avisa e recarrega no primeiro instante em que ela for
 * escondida (quem está escrevendo uma mensagem não perde o texto).
 *
 * Adiamento por bloqueio (06/10): "aba escondida" sozinha não basta. Enquanto houver edição ou
 * sessão ativa (registro de bloqueios de recarga) a recarga automática espera — a versão nova
 * fica pendente com o aviso na tela e a recarga acontece UMA vez quando o último bloqueio termina
 * e a aba continua escondida.
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
const { registrarBloqueioRecarga } = await import('@/lib/reload-blockers');

let visibilidade: DocumentVisibilityState = 'visible';

function definirVisibilidade(valor: DocumentVisibilityState) {
  visibilidade = valor;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Bloqueios abertos no teste; devolvidos ao fim para nenhum teste herdar estado do outro. */
const bloqueiosAbertos: Array<() => void> = [];

function bloquear(motivo: string): () => void {
  const limpar = registrarBloqueioRecarga(motivo);
  bloqueiosAbertos.push(limpar);
  return limpar;
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
  while (bloqueiosAbertos.length > 0) bloqueiosAbertos.pop()!();
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

describe('startDeploymentUpdateMonitor com bloqueio de recarga ativo', () => {
  it('aba oculta com bloqueio ativo: NÃO recarrega e mantém o aviso na tela', async () => {
    bloquear('mensagem-em-edicao');
    definirVisibilidade('hidden');
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled(); // recarregar agora perderia a edição
    expect(toastInfo).toHaveBeenCalledTimes(1); // o aviso existente continua

    parar();
  });

  it('último bloqueio termina com a aba oculta: recarrega exatamente uma vez', async () => {
    const liberarEdicao = bloquear('mensagem-em-edicao');
    const liberarChamada = bloquear('chamada-ativa');
    definirVisibilidade('hidden');
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(recarregar).not.toHaveBeenCalled();

    liberarEdicao();
    expect(recarregar).not.toHaveBeenCalled(); // ainda há bloqueio ativo

    liberarChamada();
    expect(recarregar).toHaveBeenCalledTimes(1); // último bloqueio terminou

    liberarChamada(); // limpeza idempotente não pode recarregar de novo
    definirVisibilidade('visible');
    definirVisibilidade('hidden');
    expect(recarregar).toHaveBeenCalledTimes(1);

    parar();
  });

  it('aba visível com bloqueio: ocultar adia e liberar ainda oculta conclui a recarga', async () => {
    const liberar = bloquear('mensagem-em-edicao');
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(toastInfo).toHaveBeenCalledTimes(1); // avisa e espera
    expect(recarregar).not.toHaveBeenCalled();

    definirVisibilidade('hidden');
    expect(recarregar).not.toHaveBeenCalled(); // o bloqueio ainda adia a recarga

    liberar();
    expect(recarregar).toHaveBeenCalledTimes(1); // tornou-se livre ainda oculta

    parar();
  });

  it('parar() desarma o observador: liberar o bloqueio depois não recarrega', async () => {
    const liberar = bloquear('mensagem-em-edicao');
    definirVisibilidade('hidden');
    const recarregar = vi.fn();
    vi.useFakeTimers();
    const parar = startDeploymentUpdateMonitor({ recarregar });

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(recarregar).not.toHaveBeenCalled();

    parar(); // teardown: intervalos, listener de visibilidade e observador de bloqueios

    liberar();
    definirVisibilidade('hidden');
    expect(recarregar).not.toHaveBeenCalled(); // nada dispara depois do teardown
  });
});
