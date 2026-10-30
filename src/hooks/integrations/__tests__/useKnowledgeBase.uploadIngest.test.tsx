import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * R2-API-054 (#227) — o upload da Base de Conhecimento só armazenava o arquivo:
 * `uploadFile` gravava os bytes, criava a linha em `knowledge_base_files` e
 * anunciava sucesso, mas NADA processava o documento até a IA. O teste prova que
 * o upload passa a disparar o pipeline (`ai-kb-ingest`) e que a tela não anuncia
 * "disponível para a IA" quando o processamento não concluiu.
 */

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://projeto.supabase.co',
  supabase: {
    from: mocks.from,
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        createSignedUrl: mocks.createSignedUrl,
        remove: mocks.remove,
      })),
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

import { useKnowledgeBase } from '../useKnowledgeBase';

const arquivo = (name = 'manual.md', type = 'text/markdown') =>
  new File(['# Manual'], name, { type });

beforeEach(() => {
  vi.clearAllMocks();
  // Toda tabela responde o que o hook pede: leitura (fetchData) e o INSERT.
  mocks.from.mockImplementation(() => ({
    select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    insert: () => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'arquivo-1' }, error: null }) }),
    }),
  }));
  mocks.upload.mockResolvedValue({ error: null });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://projeto.supabase.co/storage/v1/object/sign/whatsapp-media/kb/1_manual.md?token=abc' },
    error: null,
  });
  mocks.remove.mockResolvedValue({ error: null });
});

describe('useKnowledgeBase.uploadFile — o documento precisa chegar à IA', () => {
  it('grava a URL assinada do bucket privado e não um locator público que não abre', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'completed' }, error: null });
    const inserir = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'arquivo-1' }, error: null }) }),
    }));
    mocks.from.mockImplementation(() => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      insert: inserir,
    }));

    const { result } = renderHook(() => useKnowledgeBase());
    await act(async () => {
      await result.current.uploadFile(arquivo());
    });

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(expect.stringMatching(/^kb\/\d+_manual\.md$/), 86400);
    expect(inserir).toHaveBeenCalledWith(
      expect.objectContaining({ file_url: expect.stringContaining('/storage/v1/object/sign/whatsapp-media/kb/') })
    );
  });

  it('dispara o pipeline de ingestão com o id do arquivo recém-criado', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'completed', articleId: 'artigo-1' }, error: null });

    const { result } = renderHook(() => useKnowledgeBase());
    await act(async () => {
      await result.current.uploadFile(arquivo());
    });

    expect(mocks.invoke).toHaveBeenCalledWith('ai-kb-ingest', { body: { fileId: 'arquivo-1' } });
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Documento processado' })
      )
    );
  });

  it('formato sem extração NÃO é anunciado como conhecimento (fica só armazenado)', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'unsupported', articleId: null }, error: null });

    const { result } = renderHook(() => useKnowledgeBase());
    await act(async () => {
      await result.current.uploadFile(arquivo('catalogo.pdf', 'application/pdf'));
    });

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Arquivo armazenado' })
      )
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Documento processado' })
    );
  });

  it('falha do processamento vira erro visível, não silêncio', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('boom') });

    const { result } = renderHook(() => useKnowledgeBase());
    await act(async () => {
      await result.current.uploadFile(arquivo());
    });

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Falha no processamento', variant: 'destructive' })
      )
    );
  });
});
