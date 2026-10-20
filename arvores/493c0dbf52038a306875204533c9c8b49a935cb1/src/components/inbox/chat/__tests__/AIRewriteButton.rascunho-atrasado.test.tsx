import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

// R2-INF-025 — "Reescrita atrasada substitui edição mais nova do mesmo rascunho".
// O campo de mensagem continua editável enquanto a requisição de IA está em voo;
// o teste controla a resposta (`deferred`) para provar o que acontece quando o
// usuário digita durante o await.

const invoke = vi.hoisted(() => vi.fn());
const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

vi.mock('sonner', () => ({ toast: toastSpy }));

// Primitivos de UI: Radix Popover/Tooltip não abre de forma confiável sob jsdom
// (padrão já usado nos testes de inbox). O componente sob teste (AIRewriteButton)
// e o botão de tom continuam sendo os reais.
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

import { AIRewriteButton } from '../AIRewriteButton';

function deferred<T>() {
  let resolve!: (valor: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Textarea controlado + botão real: digitar no campo passa pelo mesmo caminho de produção. */
function Harness({ inicial, onRewrite }: { inicial: string; onRewrite?: (novo: string) => void }) {
  const [texto, setTexto] = useState(inicial);
  return (
    <>
      <textarea aria-label="rascunho" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <AIRewriteButton
        inputValue={texto}
        onRewrite={(novo) => {
          setTexto(novo);
          onRewrite?.(novo);
        }}
        contactName="Contato Teste"
      />
    </>
  );
}

const campo = () => screen.getByLabelText('rascunho') as HTMLTextAreaElement;
const escolherTom = () => fireEvent.click(screen.getByText('Profissional'));

describe('AIRewriteButton — reescrita atrasada não substitui edição mais nova do rascunho', () => {
  beforeEach(() => {
    invoke.mockReset();
    toastSpy.warning.mockReset();
    toastSpy.success.mockReset();
    toastSpy.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('aplica a reescrita quando o rascunho não mudou durante a requisição', async () => {
    const pendente = deferred<{ data: { enhanced: string } | null; error: null }>();
    invoke.mockReturnValueOnce(pendente.promise);
    const onRewrite = vi.fn();

    render(<Harness inicial="Texto A" onRewrite={onRewrite} />);
    escolherTom();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.message).toBe('Texto A');

    await act(async () => {
      pendente.resolve({ data: { enhanced: 'Texto A reescrito' }, error: null });
    });

    expect(campo().value).toBe('Texto A reescrito');
    expect(onRewrite).toHaveBeenCalledWith('Texto A reescrito');
  });

  it('edição durante a requisição preserva o texto novo e descarta o resultado atrasado', async () => {
    const pendente = deferred<{ data: { enhanced: string } | null; error: null }>();
    invoke.mockReturnValueOnce(pendente.promise);
    const onRewrite = vi.fn();

    render(<Harness inicial="Texto A" onRewrite={onRewrite} />);
    escolherTom();
    expect(invoke.mock.calls[0][1].body.message).toBe('Texto A');

    // Usuário continua na mesma conversa e edita o rascunho enquanto a IA responde.
    fireEvent.change(campo(), { target: { value: 'Texto B' } });
    expect(campo().value).toBe('Texto B');

    await act(async () => {
      pendente.resolve({ data: { enhanced: 'Texto A reescrito' }, error: null });
    });

    // A resposta é da versão antiga: não pode sobrescrever a edição mais nova.
    expect(campo().value).toBe('Texto B');
    expect(onRewrite).not.toHaveBeenCalled();
    expect(toastSpy.warning).toHaveBeenCalledTimes(1);
  });

  it('aplica normalmente depois de o rascunho voltar ao mesmo texto do clique', async () => {
    const pendente = deferred<{ data: { enhanced: string } | null; error: null }>();
    invoke.mockReturnValueOnce(pendente.promise);

    render(<Harness inicial="Texto A" />);
    escolherTom();

    fireEvent.change(campo(), { target: { value: 'Texto B' } });
    fireEvent.change(campo(), { target: { value: 'Texto A' } });

    await act(async () => {
      pendente.resolve({ data: { enhanced: 'Texto A reescrito' }, error: null });
    });

    expect(campo().value).toBe('Texto A reescrito');
  });
});
