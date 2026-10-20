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

function botaoExcluir(nome: string) {
  return screen.getByRole('button', { name: `Excluir arquivo: ${nome}` });
}

/** Abre o diálogo pelo clique na linha e confirma a exclusão. */
async function excluirPeloDialogo(nome: string) {
  fireEvent.click(botaoExcluir(nome));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
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

  it('a linha com processing_status failed mostra o motivo legível em pt-BR', () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    const motivo = screen.getByRole('status');
    expect(motivo).toHaveTextContent('Falha no processamento: não foi possível extrair o texto deste arquivo.');
    // O motivo é da linha que falhou: o nome do arquivo fica no mesmo bloco.
    expect(motivo.closest('div')).toHaveTextContent('planilha.xlsx');
    // Só a linha com falha tem motivo — as outras duas não.
    expect(screen.getAllByRole('status')).toHaveLength(1);
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

  it('Reprocessar marca aria-busy enquanto corre e reabilita a linha quando a ação falha', async () => {
    let resolver: (v: boolean) => void = () => {};
    reprocessFile.mockReturnValue(new Promise<boolean>((resolve) => { resolver = resolve; }));

    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    const botao = screen.getByRole('button', { name: 'Reprocessar arquivo: planilha.xlsx' });
    fireEvent.click(botao);

    await waitFor(() => expect(reprocessFile).toHaveBeenCalledWith('file-failed'));
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toBeDisabled();

    resolver(false);
    await waitFor(() => expect(botao).not.toHaveAttribute('aria-busy', 'true'));
    expect(botao).toBeEnabled();
  });

  it('Excluir abre o diálogo de confirmação e só chama a ação depois de confirmar', async () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    fireEvent.click(botaoExcluir('manual.pdf'));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('manual.pdf');
    expect(dialogo).toHaveTextContent('Cancelar');
    expect(dialogo).toHaveTextContent('Excluir');
    // Sem confirmação, nada é excluído.
    expect(deleteFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(deleteFile).toHaveBeenCalledTimes(1));
    expect(deleteFile).toHaveBeenCalledWith('file-completed');
  });

  it('Excluir confirma uma única vez, marca aria-busy e reabilita a linha quando devolve false', async () => {
    let resolver: (v: boolean) => void = () => {};
    deleteFile.mockReturnValue(new Promise<boolean>((resolve) => { resolver = resolve; }));

    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    fireEvent.click(botaoExcluir('manual.pdf'));
    await screen.findByRole('alertdialog');
    const acao = screen.getByRole('button', { name: 'Excluir' });
    fireEvent.click(acao);
    fireEvent.click(acao);

    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('file-completed');

    const botao = botaoExcluir('manual.pdf');
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toBeDisabled();

    resolver(false);
    await waitFor(() => expect(botao).not.toHaveAttribute('aria-busy', 'true'));
    expect(botao).toBeEnabled();
  });

  it('Excluir de um arquivo não bloqueia a ação em outra linha', async () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    await excluirPeloDialogo('manual.pdf');
    await excluirPeloDialogo('planilha.xlsx');

    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(deleteFile).toHaveBeenNthCalledWith(1, 'file-completed');
    expect(deleteFile).toHaveBeenNthCalledWith(2, 'file-failed');
  });

  it('Cancelar fecha o diálogo sem excluir e devolve o foco ao botão de origem', async () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    const origem = botaoExcluir('manual.pdf');
    origem.focus();
    fireEvent.click(origem);
    await screen.findByRole('alertdialog');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteFile).not.toHaveBeenCalled();
    expect(botaoExcluir('manual.pdf')).toHaveFocus();
  });

  it('abre o diálogo pelo teclado (Enter e Espaço) e confirma com Enter', async () => {
    render(<KnowledgeBaseView />, { wrapper: Wrapper });
    abrirArquivos();

    // O <button> nativo dispara o clique ao receber Enter/Espaço; o jsdom não
    // emite esse clique sozinho, então simulamos os dois eventos que o navegador
    // emite (keydown e, em seguida, o clique de ativação).
    const origem = botaoExcluir('manual.pdf');
    origem.focus();
    fireEvent.keyDown(origem, { key: 'Enter' });
    fireEvent.click(origem);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(deleteFile).not.toHaveBeenCalled();

    // Esc fecha sem excluir.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteFile).not.toHaveBeenCalled();

    // Espaço na linha também abre o diálogo.
    const origemEspaco = botaoExcluir('planilha.xlsx');
    origemEspaco.focus();
    fireEvent.keyDown(origemEspaco, { key: ' ' });
    fireEvent.click(origemEspaco);
    await screen.findByRole('alertdialog');

    // Enter no botão Excluir do diálogo confirma a ação.
    const acao = screen.getByRole('button', { name: 'Excluir' });
    acao.focus();
    fireEvent.keyDown(acao, { key: 'Enter' });
    fireEvent.click(acao);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith('file-failed'));
  });
});
