import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// Prova o caminho REAL da tela: TemplatesWithVariables -> useMessageTemplates ->
// supabase.from('message_templates'). Só o cliente Supabase é mockado (fronteira
// de rede), então o teste falha se o componente voltar a "salvar" sem gravar.
const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  deleted: [] as string[],
  insertError: null as Error | null,
  updateError: null as Error | null,
  deleteError: null as Error | null,
  gate: false,
  resolveInsert: null as null | ((value: { data: null; error: Error | null }) => void),
}));

const toastSpy = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => ({ data: db.rows, error: null }),
      }),
      insert: (payload: Record<string, unknown>) => {
        db.inserted.push(payload);
        if (db.gate) {
          return new Promise<{ data: null; error: Error | null }>((resolve) => { db.resolveInsert = resolve; });
        }
        return Promise.resolve({ data: null, error: db.insertError });
      },
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, value: string) => {
          db.updated.push({ ...payload, id: value });
          return { data: null, error: db.updateError };
        },
      }),
      delete: () => ({
        eq: async (_column: string, value: string) => {
          db.deleted.push(value);
          return { data: null, error: db.deleteError };
        },
      }),
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
  toast: toastSpy,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'usuario-teste' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

import { TemplatesWithVariables } from '../TemplatesWithVariables';

const TEMPLATES = [
  { id: 't1', title: 'Boas-vindas', content: 'Olá {{nome}}', category: 'geral', shortcut: 'boasvindas', is_global: false, use_count: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 't2', title: 'Orçamento', content: 'Segue o orçamento, {{empresa}}', category: 'vendas', shortcut: 'orcamento', is_global: false, use_count: 0, created_at: '2026-01-01', updated_at: '2026-01-01' },
];

const TITULO_INPUT = 'Ex: Boas-vindas Inicial';
const CONTEUDO_INPUT = 'Digite sua mensagem... Use {{variavel}} para inserir dados dinâmicos';

function renderPainel(extraProps: Record<string, unknown> = {}) {
  return render(<TemplatesWithVariables templates={TEMPLATES} onUseTemplate={vi.fn()} {...extraProps} />);
}

function abrirNovo() {
  fireEvent.click(screen.getByRole('button', { name: 'Novo' }));
}

function preencherEditor(titulo: string, conteudo: string) {
  fireEvent.change(screen.getByPlaceholderText(TITULO_INPUT), { target: { value: titulo } });
  fireEvent.change(screen.getByPlaceholderText(CONTEUDO_INPUT), { target: { value: conteudo } });
}

beforeEach(() => {
  db.inserted = [];
  db.updated = [];
  db.deleted = [];
  db.insertError = null;
  db.updateError = null;
  db.deleteError = null;
  db.gate = false;
  db.resolveInsert = null;
  toastSpy.mockReset();
});

describe('TemplatesWithVariables — gravação de verdade', () => {
  it('só confirma o template criado depois de a gravação voltar do banco', async () => {
    db.gate = true;
    renderPainel();
    abrirNovo();
    preencherEditor('Novo título', 'Olá {{nome}}');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(db.inserted).toHaveLength(1));
    expect(db.inserted[0]).toMatchObject({ title: 'Novo título', content: 'Olá {{nome}}', category: 'geral', shortcut: null });
    // A gravação ainda não voltou: nada de "Template criado!" na tela.
    expect(toastSpy.mock.calls.some(([arg]) => (arg as { title?: string })?.title === 'Template criado!')).toBe(false);

    db.resolveInsert!({ data: null, error: null });

    await waitFor(() => expect(toastSpy.mock.calls.some(([arg]) => (arg as { title?: string })?.title === 'Template criado!')).toBe(true));
    await waitFor(() => expect(screen.queryByPlaceholderText(TITULO_INPUT)).toBeNull());
  });

  it('atualiza o template em edição gravando o id certo', async () => {
    renderPainel();
    fireEvent.click(screen.getByRole('button', { name: 'Editar template Boas-vindas' }));
    preencherEditor('Boas-vindas v2', 'Olá {{nome}}, tudo bem?');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(db.updated).toHaveLength(1));
    expect(db.updated[0]).toMatchObject({ id: 't1', title: 'Boas-vindas v2', content: 'Olá {{nome}}, tudo bem?' });
    expect(db.inserted).toHaveLength(0);
    await waitFor(() => expect(toastSpy.mock.calls.some(([arg]) => (arg as { title?: string })?.title === 'Template atualizado!')).toBe(true));
  });

  it('falha na gravação não confirma nem fecha o diálogo', async () => {
    db.insertError = new Error('permission denied');
    renderPainel();
    abrirNovo();
    preencherEditor('Novo título', 'Conteúdo');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(toastSpy.mock.calls.some(([arg]) => (arg as { title?: string })?.title === 'Erro ao criar template')).toBe(true));
    expect(toastSpy.mock.calls.some(([arg]) => (arg as { title?: string })?.title === 'Template criado!')).toBe(false);
    expect(screen.getByPlaceholderText(TITULO_INPUT)).toBeInTheDocument();
  });
});

describe('TemplatesWithVariables — editor mostra o template certo', () => {
  it('não herda os dados do template editado antes', async () => {
    renderPainel();

    fireEvent.click(screen.getByRole('button', { name: 'Editar template Boas-vindas' }));
    expect(screen.getByPlaceholderText(TITULO_INPUT)).toHaveValue('Boas-vindas');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByPlaceholderText(TITULO_INPUT)).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Editar template Orçamento' }));
    expect(screen.getByPlaceholderText(TITULO_INPUT)).toHaveValue('Orçamento');
  });

  it('marca o preview como dado fictício quando não há contato', () => {
    renderPainel();
    abrirNovo();
    fireEvent.change(screen.getByPlaceholderText(CONTEUDO_INPUT), { target: { value: 'Olá {{nome}}' } });

    expect(screen.getByText('Exemplo com dados fictícios')).toBeInTheDocument();
    expect(screen.getByText('Olá João Silva')).toBeInTheDocument();
  });

  it('usa os dados reais do contato no preview quando existem', () => {
    renderPainel({ contactData: { name: 'Maria Souza', company: 'Brindes ME' } });
    abrirNovo();
    fireEvent.change(screen.getByPlaceholderText(CONTEUDO_INPUT), { target: { value: 'Olá {{nome}} da {{empresa}}' } });

    expect(screen.getByText('Preview com dados do contato')).toBeInTheDocument();
    expect(screen.getByText('Olá Maria Souza da Brindes ME')).toBeInTheDocument();
  });
});

describe('TemplatesWithVariables — atalho e exclusão', () => {
  it('avisa quando o atalho já é de outro template', () => {
    renderPainel();
    abrirNovo();
    fireEvent.change(screen.getByPlaceholderText('boasvindas'), { target: { value: 'boasvindas' } });

    expect(screen.getByText('Atalho já usado por outro template')).toBeInTheDocument();
  });

  it('exclui só depois da confirmação em diálogo', async () => {
    renderPainel();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir template Orçamento' }));

    expect(screen.getByText('Excluir template?')).toBeInTheDocument();
    expect(db.deleted).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(db.deleted).toEqual(['t2']));
  });
});
