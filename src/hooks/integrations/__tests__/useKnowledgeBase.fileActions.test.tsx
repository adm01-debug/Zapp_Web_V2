import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Gestão completa dos arquivos da Base de Conhecimento (#2588 / t_ed574498):
 * a aba Arquivos só listava. Um arquivo com falha não podia ser excluído nem
 * reprocessado, e o upload guardava um locator de bucket privado que não abre.
 * Este teste prova `deleteFile` (DELETE em ida única + objeto no Storage, só
 * URL assinada) e `reprocessFile` (idempotente pelo `ai-kb-ingest`).
 */

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  deleteEq: vi.fn(),
  deleteResult: vi.fn(),
  /** Qualquer SELECT direto na tabela = leitura prévia antes do DELETE. */
  leituraPrevia: vi.fn(),
  invoke: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://projeto.supabase.co',
  supabase: {
    from: mocks.from,
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        createSignedUrl: mocks.createSignedUrl,
        remove: mocks.remove,
      })),
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

import { useKnowledgeBase } from '../useKnowledgeBase';

const ASSINADA =
  'https://projeto.supabase.co/storage/v1/object/sign/whatsapp-media/kb/1_manual.md?token=abc';

/** Monta as tabelas que o hook usa: artigos vazios + `knowledge_base_files`. */
function montarTabelas(opts: {
  excluidas?: { id: string; file_url: string }[] | null;
  erroExcluir?: { message: string } | null;
} = {}) {
  const excluidas = opts.excluidas ?? [{ id: 'arquivo-1', file_url: ASSINADA }];
  mocks.deleteResult.mockResolvedValue({ data: excluidas, error: opts.erroExcluir ?? null });
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'knowledge_base_files') {
      return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
    }
    return {
      select: (...args: unknown[]) => {
        // `select('*')` é o fetchData (listagem). Qualquer outro SELECT direto
        // na tabela é leitura prévia antes do DELETE — o código novo nunca faz.
        if (!(args.length === 1 && args[0] === '*')) mocks.leituraPrevia(...args);
        return {
          order: () => Promise.resolve({ data: [], error: null }),
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        };
      },
      delete: () => ({
        eq: (coluna: string, valor: string) => {
          mocks.deleteEq(coluna, valor);
          return { select: () => mocks.deleteResult() };
        },
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  montarTabelas();
  mocks.remove.mockResolvedValue({ error: null });
});

describe('useKnowledgeBase.deleteFile — ida única, objeto só com URL assinada', () => {
  it('exclui a linha e o objeto do Storage e anuncia a remoção', async () => {
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile('arquivo-1');
    });

    expect(aceito).toBe(true);
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'arquivo-1');
    expect(mocks.remove).toHaveBeenCalledWith(['kb/1_manual.md']);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Arquivo removido' }));
  });

  it('não faz leitura prévia: a referência do objeto vem do retorno do DELETE', async () => {
    montarTabelas({ excluidas: [{ id: 'arquivo-1', file_url: ASSINADA }] });
    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => {
      await result.current.deleteFile('arquivo-1');
    });

    expect(mocks.leituraPrevia).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith(['kb/1_manual.md']);
  });

  it('DELETE negado (RLS) vira erro visível e NÃO apaga o objeto do Storage', async () => {
    montarTabelas({ excluidas: null, erroExcluir: { message: 'rls denied' } });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile('arquivo-1');
    });

    expect(aceito).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao excluir arquivo', variant: 'destructive' })
    );
  });

  it('DELETE barrado pela RLS sem erro (zero linhas) NÃO é sucesso nem apaga o objeto', async () => {
    montarTabelas({ excluidas: [] });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile('arquivo-1');
    });

    expect(aceito).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao excluir arquivo', variant: 'destructive' })
    );
  });

  it('o erro não denuncia se o id existe: zero linhas ou erro têm o mesmo retorno genérico', async () => {
    const { result } = renderHook(() => useKnowledgeBase());

    montarTabelas({ excluidas: [] });
    await act(async () => {
      await result.current.deleteFile('id-inexistente');
    });
    const chamadaZeroLinhas = mocks.toast.mock.calls.at(-1)?.[0] as { description?: string };

    montarTabelas({ excluidas: null, erroExcluir: { message: 'rls denied' } });
    await act(async () => {
      await result.current.deleteFile('arquivo-1');
    });
    const chamadaErro = mocks.toast.mock.calls.at(-1)?.[0] as { description?: string };

    expect(chamadaZeroLinhas?.description).not.toMatch(/não encontrado/i);
    expect(chamadaErro?.description).not.toMatch(/não encontrado/i);
    expect(chamadaZeroLinhas?.description).not.toMatch(/rls denied/i);
  });

  it('referência de outro projeto não vira remoção de objeto (lista de permitidos)', async () => {
    montarTabelas({
      excluidas: [
        { id: 'arquivo-1', file_url: 'https://outro.supabase.co/storage/v1/object/sign/whatsapp-media/kb/1.md?token=x' },
      ],
    });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile('arquivo-1');
    });

    expect(aceito).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: expect.stringContaining('objeto não foi localizado') })
    );
  });

  it('locator público legado (mesma origem) não apaga o objeto: a linha sai, a mídia fica', async () => {
    montarTabelas({
      excluidas: [
        { id: 'arquivo-1', file_url: 'https://projeto.supabase.co/storage/v1/object/public/whatsapp-media/kb/1_manual.md' },
      ],
    });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile('arquivo-1');
    });

    expect(aceito).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: expect.stringContaining('objeto não foi localizado') })
    );
  });

  it('falha ao apagar o objeto avisa que a base removeu mas a mídia ficou', async () => {
    mocks.remove.mockResolvedValue({ error: { message: 'storage off' } });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile('arquivo-1');
    });

    expect(aceito).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: expect.stringContaining('objeto não pôde ser excluído') })
    );
  });
});

describe('useKnowledgeBase.reprocessFile — reinvoca o pipeline sem duplicar', () => {
  it('reinvoca o ai-kb-ingest com o id do arquivo e anuncia o processamento', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'completed', articleId: 'artigo-1' }, error: null });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.reprocessFile('arquivo-1');
    });

    expect(aceito).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('ai-kb-ingest', { body: { fileId: 'arquivo-1' } });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Documento processado' }));
  });

  it('documento já concluído é idempotente: não é anunciado como novo processamento', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'completed', idempotent: true }, error: null });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.reprocessFile('arquivo-1');
    });

    expect(aceito).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Documento já processado' }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Documento processado' }));
  });

  it('arquivo em processamento (409) devolve o motivo, não um sucesso', async () => {
    const erro = Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 409 } });
    mocks.invoke.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.reprocessFile('arquivo-1');
    });

    expect(aceito).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Documento em processamento' }));
  });

  it('falha do pipeline vira erro visível, não silêncio', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('boom') });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.reprocessFile('arquivo-1');
    });

    expect(aceito).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Falha ao reprocessar', variant: 'destructive' })
    );
  });

  it('formato sem extração não entra no contexto da IA', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'unsupported', articleId: null }, error: null });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.reprocessFile('arquivo-1');
    });

    expect(aceito).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sem texto extraível' }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Documento processado' }));
  });
});
