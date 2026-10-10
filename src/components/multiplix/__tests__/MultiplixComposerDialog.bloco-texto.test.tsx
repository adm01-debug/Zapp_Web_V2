/**
 * F76 / TL-008 — Multiplix: bloco de texto no composer dialog.
 *
 * Provas que o diff traz (sem depender do layout inline TL-006,
 * sem mock de @tanstack/react-virtual porque o dialog nao usa virtualizacao):
 *  1. o contador exibe N/65536 e fica vermelho acima do limite;
 *  2. inserirNoCursor coloca o token na posicao do cursor, nao no fim;
 *  3. variaveis desconhecidas aparecem como aviso vermelho;
 *  4. o envio fica bloqueado quando o texto excede 65536 caracteres.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useCreateMultiplixDispatch: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import { MultiplixComposerDialog } from '@/components/multiplix/MultiplixComposerDialog';

const LIMITE = 65_536;
const MENSAGEM_PLACEHOLDER = 'Olá {{empresa}}, {{saudacao}}!';

function renderComposer(companyIds: string[]) {
  return render(
    <MultiplixComposerDialog
      open
      onOpenChange={vi.fn()}
      selectedCompanyIds={companyIds}
      onCreated={vi.fn()}
    />,
  );
}

function escreverMensagem(valor: string) {
  fireEvent.change(screen.getByPlaceholderText(MENSAGEM_PLACEHOLDER), { target: { value: valor } });
}

beforeEach(() => {
  h.mutateAsync.mockReset();
  h.mutateAsync.mockResolvedValue({ id: 'd1', recipientCount: 3, created: true });
});

describe('MultiplixComposerDialog — bloco de texto TL-008', () => {
  it('exibe o contador N/65536 e fica vermelho quando passa do limite', () => {
    renderComposer(['c1']);

    const contador = screen.getByText(new RegExp(`${LIMITE} caracteres`));
    expect(contador).toBeInTheDocument();
    // Sem texto: contador mostra 0/65536 e nao e vermelho.
    expect(contador).not.toHaveClass('text-dash-red');

    escreverMensagem('x'.repeat(LIMITE + 1));

    // Acima do limite: contador fica vermelho/gráfico.
    expect(contador).toHaveClass('text-dash-red');
  });

  it('inserirNoCursor coloca o token na posicao do cursor, nao no fim', async () => {
    renderComposer(['c1']);

    const textarea = screen.getByPlaceholderText(MENSAGEM_PLACEHOLDER) as HTMLTextAreaElement;

    // Digita "abc" e posiciona o cursor entre "a" e "b".
    fireEvent.change(textarea, { target: { value: 'abc' } });
    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    fireEvent.keyDown(textarea, { key: 'ArrowRight' });

    // Clica no chip {{empresa}}.
    fireEvent.click(screen.getByRole('button', { name: /empresa/i }));

    // O token deve ser inserido na posicao do cursor: a{{empresa}}bc.
    expect(textarea.value).toBe('a{{empresa}}bc');
    // O cursor fica apos o token inserido (restaurado async via rAF).
    await waitFor(() => {
      expect(textarea.selectionStart).toBe(1 + '{{empresa}}'.length);
    });
  });

  it('mostra aviso vermelho de variaveis desconhecidas', () => {
    renderComposer(['c1']);

    escreverMensagem('Olá {{telefone}}!');

    expect(screen.getByRole('alert')).toHaveTextContent('Variáveis desconhecidas: {{telefone}}');
  });

  it('nao mostra aviso de variaveis desconhecidas para variaveis conhecidas', () => {
    renderComposer(['c1']);

    escreverMensagem('Olá {{empresa}}, {{saudacao}}!');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('bloqueia o envio quando o texto excede 65536 caracteres', () => {
    renderComposer(['c1']);

    escreverMensagem('x'.repeat(LIMITE + 1));

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar e iniciar agora' })).toBeDisabled();
  });

  it('permite o envio quando o texto esta dentro do limite', () => {
    renderComposer(['c1']);

    escreverMensagem('Mensagem dentro do limite');

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).not.toBeDisabled();
  });
});