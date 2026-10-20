/**
 * t_fd52bf49 — a fachada `@/lib/lazyToast` tira o sonner do bundle inicial sem
 * mudar a chamada da telefonia (`toast.error(msg)` etc.).
 *
 * Prova o contrato que os módulos da telefonia precisam:
 *  1. com a lib carregada, a chamada é SÍNCRONA (os testes da telefonia e o
 *     comportamento de antes dependem disso);
 *  2. chamada feita ANTES de a lib chegar não se perde: sai assim que o
 *     `import()` resolve, na ordem;
 *  3. falha ao carregar a lib vira aviso no console, nunca exceção.
 *
 * Cada caso recarrega o módulo (`vi.resetModules`) com um 'sonner' dublado cujo
 * carregamento o teste controla.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

function dubleDoToast() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

afterEach(() => {
  vi.doUnmock('sonner');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('lazyToast — sonner fora do bundle inicial, mesma chamada', () => {
  it('com a lib carregada, a chamada é síncrona e repassa os argumentos', async () => {
    const duble = dubleDoToast();
    vi.doMock('sonner', () => ({ toast: duble }));
    const { toast } = await import('@/lib/lazyToast');
    // deixa o import() da lib resolver
    await vi.dynamicImportSettled();
    await new Promise((resolve) => setTimeout(resolve, 0));

    toast.error('Não foi possível salvar a ligação');
    toast.info('Conexão perdida', { duration: 1500 });
    toast.success('VoIP conectado!');
    toast.warning('Atenção');

    expect(duble.error).toHaveBeenCalledWith('Não foi possível salvar a ligação');
    expect(duble.info).toHaveBeenCalledWith('Conexão perdida', { duration: 1500 });
    expect(duble.success).toHaveBeenCalledWith('VoIP conectado!');
    expect(duble.warning).toHaveBeenCalledWith('Atenção');
  });

  it('chamada feita antes de a lib chegar sai depois, na ordem (nada se perde)', async () => {
    const duble = dubleDoToast();
    let liberar!: () => void;
    const portao = new Promise<void>((resolve) => { liberar = resolve; });
    vi.doMock('sonner', async () => {
      await portao;
      return { toast: duble };
    });
    const { toast } = await import('@/lib/lazyToast');

    toast.error('primeiro');
    toast.info('segundo');
    expect(duble.error).not.toHaveBeenCalled();
    expect(duble.info).not.toHaveBeenCalled();

    liberar();
    await vi.waitFor(() => expect(duble.info).toHaveBeenCalledWith('segundo'));
    expect(duble.error).toHaveBeenCalledWith('primeiro');
    expect(duble.error.mock.invocationCallOrder[0]).toBeLessThan(duble.info.mock.invocationCallOrder[0]);
  });

  it('falha ao carregar a lib vira console.warn, sem exceção', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.doMock('sonner', async () => {
      throw new Error('chunk do sonner indisponível');
    });
    const { toast } = await import('@/lib/lazyToast');

    expect(() => toast.error('qualquer')).not.toThrow();
    await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith('[toast] não disparou:', expect.any(Error)));
  });
});
