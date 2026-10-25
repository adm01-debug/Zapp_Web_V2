import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * t_1944d290 — falha de leitura da Base de Conhecimento não pode virar "base vazia".
 * Antes o hook só checava `data`: um erro de rede/RLS deixava articles/files vazios
 * e a tela anunciava "Nenhum arquivo enviado" com a leitura quebrada.
 */
const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://projeto.supabase.co',
  supabase: { from: mocks.from },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useKnowledgeBase } from '../useKnowledgeBase';

interface Resultado { data: unknown; error: unknown }

/** Builder mínimo: `select(...).order(...)` resolve o resultado da tabela. */
function tabela(resultado: Resultado) {
  const builder = {
    select: () => builder,
    order: () => Promise.resolve(resultado),
  };
  return builder;
}

function montarTabelas(artigos: Resultado, arquivos: Resultado) {
  mocks.from.mockImplementation((nome: string) => (
    nome === 'knowledge_base_files' ? tabela(arquivos) : tabela(artigos)
  ));
}

describe('useKnowledgeBase — leitura inicial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('erro na leitura dos artigos vira `error` e não passa como base vazia', async () => {
    montarTabelas(
      { data: null, error: { message: 'permission denied for table knowledge_base_articles' } },
      { data: null, error: null },
    );

    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => { await result.current.fetchData(); });

    expect(result.current.error).toBe('permission denied for table knowledge_base_articles');
    expect(result.current.articles).toEqual([]);
    expect(result.current.files).toEqual([]);
  });

  it('erro na leitura dos arquivos também vira `error`', async () => {
    montarTabelas(
      { data: [], error: null },
      { data: null, error: { message: 'network error' } },
    );

    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => { await result.current.fetchData(); });

    expect(result.current.error).toBe('network error');
  });

  it('rejeição de rede não deixa loading preso e preenche `error`', async () => {
    mocks.from.mockImplementation(() => ({
      select: () => ({ order: () => Promise.reject(new Error('Failed to fetch')) }),
    }));

    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => { await result.current.fetchData(); });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Failed to fetch');
  });

  it('leitura boa não marca erro e mantém as listas', async () => {
    montarTabelas(
      { data: [{ id: 'a1', title: 'Manual', content: 'x', category: 'general', tags: null, is_published: true, embedding_status: 'completed', updated_at: '2026-10-10T10:00:00Z' }], error: null },
      { data: [{ id: 'f1', file_name: 'manual.pdf', file_url: 'https://x/kb/1_manual.pdf', file_type: 'application/pdf', file_size: 10, processing_status: 'completed', created_at: '2026-10-10T10:00:00Z' }], error: null },
    );

    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => { await result.current.fetchData(); });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.articles).toHaveLength(1);
    expect(result.current.articles[0].tags).toEqual([]);
    expect(result.current.files).toHaveLength(1);
  });
});
