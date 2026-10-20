import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// R2-INF-025 — mesmo defeito no caminho do "Aprimorar com IA": a resposta
// atrasada (e o desfazer capturado no clique) não pode substituir uma edição
// mais nova do mesmo rascunho.

const invoke = vi.hoisted(() => vi.fn());
const toastSpy = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastSpy }));

// Primitivos de UI (mesmo padrão dos testes de inbox): o componente sob teste é real.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { AIEnhanceButton } from '../AIEnhanceButton';

function deferred<T>() {
  let resolve!: (valor: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Harness({ inicial }: { inicial: string }) {
  const [texto, setTexto] = useState(inicial);
  return (
    <>
      <textarea aria-label="rascunho" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <AIEnhanceButton inputValue={texto} onInputChange={setTexto} contactName="Contato Teste" />
    </>
  );
}

const campo = () => screen.getByLabelText('rascunho') as HTMLTextAreaElement;
const escolherTom = () => fireEvent.click(screen.getByText('Profissional'));
const botaoDesfazer = () => screen.queryByLabelText('Desfazer aprimoramento');

describe('AIEnhanceButton — resposta atrasada e desfazer não sobrescrevem edição mais nova', () => {
  beforeEach(() => {
    invoke.mockReset();
    toastSpy.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('aprimora e desfaz quando o rascunho não é editado no meio', async () => {
    const pendente = deferred<{ data: { enhanced: string } | null; error: null }>();
    invoke.mockReturnValueOnce(pendente.promise);

    render(<Harness inicial="Texto A" />);
    escolherTom();
    expect(invoke.mock.calls[0][1].body.message).toBe('Texto A');

    await act(async () => {
      pendente.resolve({ data: { enhanced: 'Texto A aprimorado' }, error: null });
    });

    expect(campo().value).toBe('Texto A aprimorado');
    expect(botaoDesfazer()).not.toBeNull();

    fireEvent.click(botaoDesfazer()!);
    expect(campo().value).toBe('Texto A');
  });

  it('edição durante a requisição preserva o texto novo e descarta o resultado atrasado', async () => {
    const pendente = deferred<{ data: { enhanced: string } | null; error: null }>();
    invoke.mockReturnValueOnce(pendente.promise);

    render(<Harness inicial="Texto A" />);
    escolherTom();

    fireEvent.change(campo(), { target: { value: 'Texto B' } });

    await act(async () => {
      pendente.resolve({ data: { enhanced: 'Texto A aprimorado' }, error: null });
    });

    expect(campo().value).toBe('Texto B');
    // Sem aplicação concluída não há desfazer disponível para restaurar o texto antigo.
    expect(botaoDesfazer()).toBeNull();
  });

  it('desfazer após nova edição não restaura silenciosamente o rascunho anterior', async () => {
    const pendente = deferred<{ data: { enhanced: string } | null; error: null }>();
    invoke.mockReturnValueOnce(pendente.promise);

    render(<Harness inicial="Texto A" />);
    escolherTom();

    await act(async () => {
      pendente.resolve({ data: { enhanced: 'Texto A aprimorado' }, error: null });
    });
    expect(campo().value).toBe('Texto A aprimorado');
    expect(botaoDesfazer()).not.toBeNull();

    // O usuário continua escrevendo depois do aprimoramento.
    fireEvent.change(campo(), { target: { value: 'Texto A aprimorado e complementado' } });

    fireEvent.click(botaoDesfazer()!);

    expect(campo().value).toBe('Texto A aprimorado e complementado');
  });
});
