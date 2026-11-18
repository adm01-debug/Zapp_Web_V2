/**
 * t_fd52bf49 — a fachada `@/lib/lazyToast` tira o sonner do bundle inicial sem
 * mudar a chamada da telefonia (`toast.error(msg)` etc.).
 *
 * Prova o contrato que os módulos da telefonia precisam:
 *  1. com a lib registrada, a chamada é SÍNCRONA (os testes da telefonia e o
 *     comportamento de antes dependem disso);
 *  2. chamada feita ANTES do registro não se perde: sai assim que o viewport
 *     lazy (`@/components/ui/sonner`) registra o `toast` real, na ordem;
 *  3. sem registro nada estoura: a chamada entra na fila sem exceção.
 *
 * Cada caso recarrega o módulo (`vi.resetModules`): o registro e a fila são
 * estado do módulo. A fachada NÃO importa o `sonner` (nem `import()` dinâmico:
 * o helper de preload virava import estático do chunk da lib) — quem carrega a
 * lib é o viewport lazy, que chama `registrarToast`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

function dubleDoToast() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('lazyToast — sonner fora do bundle inicial, mesma chamada', () => {
  it('com a lib registrada, a chamada é síncrona e repassa os argumentos', async () => {
    const duble = dubleDoToast();
    const { toast, registrarToast } = await import('@/lib/lazyToast');
    registrarToast(duble);

    toast.error('Não foi possível salvar a ligação');
    toast.info('Conexão perdida', { duration: 1500 });
    toast.success('VoIP conectado!');
    toast.warning('Atenção');

    expect(duble.error).toHaveBeenCalledWith('Não foi possível salvar a ligação');
    expect(duble.info).toHaveBeenCalledWith('Conexão perdida', { duration: 1500 });
    expect(duble.success).toHaveBeenCalledWith('VoIP conectado!');
    expect(duble.warning).toHaveBeenCalledWith('Atenção');
  });

  it('chamada feita antes do registro sai depois, na ordem (nada se perde)', async () => {
    const duble = dubleDoToast();
    const { toast, registrarToast } = await import('@/lib/lazyToast');

    toast.error('primeiro');
    toast.info('segundo');
    expect(duble.error).not.toHaveBeenCalled();
    expect(duble.info).not.toHaveBeenCalled();

    registrarToast(duble);
    expect(duble.error).toHaveBeenCalledWith('primeiro');
    expect(duble.info).toHaveBeenCalledWith('segundo');
    expect(duble.error.mock.invocationCallOrder[0]).toBeLessThan(duble.info.mock.invocationCallOrder[0]);
  });

  it('sem registro nada estoura e nada é chamado', async () => {
    const { toast } = await import('@/lib/lazyToast');

    expect(() => toast.error('qualquer')).not.toThrow();
  });

  it('a fachada não referencia o sonner (bundle inicial)', async () => {
    const { toast, registrarToast } = await import('@/lib/lazyToast');
    expect(typeof toast.error).toBe('function');
    expect(typeof registrarToast).toBe('function');
  });
});
