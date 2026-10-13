import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeBaseView } from '../KnowledgeBaseView';

// A prova usa os arquivos REAIS do componente (nome, status e id de cada linha),
// sem mock que já traga a resposta: os espiões só registram a chamada da ação.
const deleteFile = vi.fn();
const reprocessFile = vi.fn();

const files = [
  {
    id: 'file-completed',
    article_id: 'art-1',
    file_name: 'manual.pdf',
    file_url: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/kb/1_manual.pdf',
    file_type: 'application/pdf',
    file_size: 2048,
    processing_status: 'completed',
    created_at: '2026-10-10T10:00:00Z',
  },
  {
    id: 'file-processing',
    article_id: null,
    file_name: 'contrato.docx',
    file_url: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/kb/2_contrato.docx',
    file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size: 4096,
    processing_status: 'processing',
    created_at: '2026-10-11T10:00:00Z',
  },
  {
    id: 'file-failed',
    article_id: null,
    file_name: 'planilha.xlsx',
    file_url: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/kb/3_planilha.xlsx',
    file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size: 1024,
    processing_status: 'failed',
    created_at: '2026-10-12T10:00:00Z',
  },
];

vi.mock('@/hooks/integrations/useKnowledgeBase', () => ({
  useKnowledgeBase: () => ({
    articles: [],
    files,
    loading: false,
    fetchData: vi.fn(),
    saveArticle: vi.fn().mockResolvedValue(true),
    deleteArticle: vi.fn().mockResolvedValue(true),
    uploadFile: vi.fn(),
    deleteFile,
    reprocessFile,
  }),
  CATEGORIES: ['general', 'product', 'support', 'sales', 'onboarding', 'technical', 'faq'],
  CATEGORY_LABELS: { general: 'Geral', product: 'Produto', support: 'Suporte', sales: 'Vendas', onboarding: 'Onboarding', technical: 'Técnico', faq: 'FAQ' },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function abrirArquivos() {
  // Radix ativa a aba no `mouseDown` (o `click` sozinho não troca o painel).
  const tab = screen.getByRole('tab', { name: /Arquivos/i });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

beforeEach(() => {
  deleteFile.mockReset().mockResolvedValue(true);
  reprocessFile.mockReset().mockResolvedValue(true);
});

describe('KnowledgeBaseView — ações de arquivo da Base de Conhecimento', () => {
  it('cada linha da aba Arquivos tem Reprocessar e Excluir com nome acessível próprio', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    for (const file of files) {
      expect(screen.getByRole('button', { name: `Reprocessar arquivo: ${file.file_name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Excluir arquivo: ${file.file_name}` })).toBeInTheDocument();
    }
    // Os nomes são únicos por arquivo (três arquivos, três pares distintos).
    expect(screen.getAllByRole('button', { name: /^Reprocessar arquivo:/ })).toHaveLength(files.length);
    expect(screen.getAllByRole('button', { name: /^Excluir arquivo:/ })).toHaveLength(files.length);
  });

  it('os três estados (completed, processing, failed) mantêm o mesmo layout: ícone, selo e as duas ações', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    for (const file of files) {
      expect(screen.getByRole('button', { name: `Reprocessar arquivo: ${file.file_name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Excluir arquivo: ${file.file_name}` })).toBeInTheDocument();
      expect(screen.getByText(file.processing_status)).toBeInTheDocument();
    }
  });

  it('Reprocessar fica bloqueado enquanto o arquivo está em processamento', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    expect(screen.getByRole('button', { name: 'Reprocessar arquivo: contrato.docx' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reprocessar arquivo: manual.pdf' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reprocessar arquivo: planilha.xlsx' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reprocessar arquivo: contrato.docx' }));
    expect(reprocessFile).not.toHaveBeenCalled();
  });

  it('Reprocessar dispara a ação uma única vez, com o id da linha', async () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    fireEvent.click(screen.getByRole('button', { name: 'Reprocessar arquivo: planilha.xlsx' }));

    await waitFor(() => expect(reprocessFile).toHaveBeenCalledTimes(1));
    expect(reprocessFile).toHaveBeenCalledWith('file-failed');
  });

  it('Excluir dispara a ação com o id da linha e não duplica o clique', async () => {
    let resolver: (v: boolean) => void = () => {};
    deleteFile.mockReturnValue(new Promise<boolean>((resolve) => { resolver = resolve; }));

    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    const botao = screen.getByRole('button', { name: 'Excluir arquivo: manual.pdf' });
    fireEvent.click(botao);
    fireEvent.click(botao);

    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('file-completed');
    // Enquanto a ação corre, o botão está marcado como ocupado e desabilitado.
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toBeDisabled();

    resolver(true);
    await waitFor(() => expect(botao).not.toHaveAttribute('aria-busy', 'true'));
    expect(botao).toBeEnabled();
  });

  it('Excluir de um arquivo não bloqueia a ação em outra linha', async () => {
    let resolver: (v: boolean) => void = () => {};
    deleteFile.mockReturnValue(new Promise<boolean>((resolve) => { resolver = resolve; }));

    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir arquivo: manual.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir arquivo: planilha.xlsx' }));

    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(deleteFile).toHaveBeenNthCalledWith(1, 'file-completed');
    expect(deleteFile).toHaveBeenNthCalledWith(2, 'file-failed');
    resolver(true);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledTimes(2));
  });
});
