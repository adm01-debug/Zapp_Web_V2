import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } ,
  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { TemplateEditorDialog } from '../templates/TemplateEditorDialog';

// Testes escritos para valerem ANTES e DEPOIS do cartão PE-02 (templates com
// variáveis): quando ele integrar, muda só o rótulo do preview, o aviso de
// atalho repetido e o `onSave` que devolve `false` — nada do que está provado aqui.

const TEMPLATE = {
  id: 't1', title: 'Boas', content: 'Oi {{nome}}', category: 'vendas', shortcut: 'boas',
  is_global: false, use_count: 0, created_at: '2026-01-01T12:00:00', updated_at: '2026-01-06T12:00:00',
};

const CONTEUDO = 'Digite sua mensagem... Use {{variavel}} para inserir dados dinâmicos';
const TITULO = 'Ex: Boas-vindas Inicial';

function setup(over: Partial<React.ComponentProps<typeof TemplateEditorDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    template: null,
    onSave: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  render(<TemplateEditorDialog {...props} />);
  return props;
}

beforeEach(() => {
  toastError.mockReset();
  cleanup();
});

describe('TemplateEditorDialog — título e preenchimento inicial', () => {
  it('usa "Novo Template" quando não recebe template', () => {
    setup();
    expect(screen.getByText('Novo Template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(TITULO)).toHaveValue('');
  });

  it('usa "Editar Template" e preenche os campos do template recebido', () => {
    setup({ template: TEMPLATE });
    expect(screen.getByText('Editar Template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(TITULO)).toHaveValue('Boas');
    expect(screen.getByPlaceholderText(CONTEUDO)).toHaveValue('Oi {{nome}}');
  });
});

describe('TemplateEditorDialog — preview e variáveis', () => {
  it('lista as variáveis detectadas no conteúdo', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(CONTEUDO), { target: { value: '{{nome}} e {{empresa}}' } });
    expect(screen.getByText(/Variáveis detectadas: \{\{nome\}\}, \{\{empresa\}\}/)).toBeInTheDocument();
  });

  it('inserir variável acrescenta o marcador no conteúdo', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Nome do contato' }));
    expect(screen.getByPlaceholderText(CONTEUDO)).toHaveValue('{{nome}}');
  });
});

describe('TemplateEditorDialog — atalho', () => {
  it('limpa o que não for letra ou número do atalho', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('boasvindas'), { target: { value: 'Boas Vindas!' } });
    expect(screen.getByPlaceholderText('boasvindas')).toHaveValue('boasvindas');
  });
});

describe('TemplateEditorDialog — gravação', () => {
  it('não grava sem título e conteúdo e avisa o usuário', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(toastError).toHaveBeenCalledWith('Preencha título e conteúdo');
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('grava com o formulário preenchido e fecha o diálogo', async () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText(TITULO), { target: { value: 'Promoção' } });
    fireEvent.change(screen.getByPlaceholderText(CONTEUDO), { target: { value: 'Olá {{nome}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
    expect(props.onSave).toHaveBeenCalledWith({
      title: 'Promoção', content: 'Olá {{nome}}', category: 'geral', shortcut: null,
    });
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
  });
});
