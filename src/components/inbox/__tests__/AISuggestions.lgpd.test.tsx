/**
 * CV-114 / CV-118 — LGPD em trânsito e transparência de IA.
 *
 * O que faltava: `useDataMasking` (mascaramento de dado pessoal) e
 * `TransparencyLabel` (selo "gerado por IA") existiam prontos e testados, com
 * ZERO consumidores, enquanto o painel mandava o texto da conversa cru para o
 * provedor de IA e nada na tela dizia que a sugestão era de máquina.
 *
 * Prova: o corpo que sai para `ai-suggest-reply` tem CPF, CNPJ e cartão
 * mascarados e telefone/e-mail/CEP intactos (decisão de escopo: a IA precisa
 * destes para contexto), e o selo aparece no cabeçalho do painel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AISuggestions } from '../AISuggestions';
import { mascararParaIA, mascararDadosPessoais } from '@/hooks/copilot/useDataMasking';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const passthrough = (tag: 'div' | 'button') =>
      ({ children, ...props }: AnyProps) => {
        const Tag = tag;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return <Tag {...(props as any)}>{children}</Tag>;
      };
  return {
    ...actual,
    motion: { div: passthrough('div'), button: passthrough('button') },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

const CPF = '123.456.789-09';
const CNPJ = '12.345.678/0001-95';
const CARTAO = '4111 1111 1111 1111';
const EMAIL = 'ana.souza@example.com';

const bodyOf = (call: number) =>
  invokeMock.mock.calls[call]?.[1]?.body as { messages?: Array<{ content: string }> } | undefined;

describe('mascararParaIA — escopo do que nao sai do sistema', () => {
  it('mascara CPF, CNPJ e cartao', () => {
    expect(mascararParaIA(`meu cpf e ${CPF}`)).not.toContain('123.456.789');
    expect(mascararParaIA(`cnpj ${CNPJ}`)).not.toContain('12.345.678');
    expect(mascararParaIA(`cartao ${CARTAO}`)).toContain('**** **** **** ****');
  });

  it('NAO mascara e-mail, telefone e CEP — a IA precisa deles para contexto', () => {
    expect(mascararParaIA(`email ${EMAIL}`)).toContain(EMAIL);
    expect(mascararParaIA('ligo no (11) 99999-8888')).toContain('99999-8888');
    expect(mascararParaIA('cep 01310-100')).toContain('01310-100');
  });

  it('a funcao pura segue detectando tudo quando ninguem restringe o tipo', () => {
    const r = mascararDadosPessoais(`${CPF} e ${EMAIL}`, { applyMask: true });
    expect(r.hasPersonalData).toBe(true);
    expect(r.maskedText).not.toContain(EMAIL);
    expect(r.fields.map((f) => f.type).sort()).toContain('email');
  });

  it('texto sem dado pessoal volta igual', () => {
    expect(mascararParaIA('bom dia, tudo bem?')).toBe('bom dia, tudo bem?');
  });
});

describe('AISuggestions — LGPD em transito e selo de IA', () => {
  beforeEach(() => vi.clearAllMocks());

  it('o CPF do cliente NAO sai no corpo que vai para o provedor de IA', async () => {
    invokeMock.mockResolvedValue({ data: { suggestions: [{ type: 'direct', text: 'ok', emoji: '✓', source: null }] }, error: null });

    render(
      <AISuggestions
        messages={[{ id: 'm1', content: `meu cpf e ${CPF}, cartao ${CARTAO}`, sender: 'contact', timestamp: new Date() }]}
        contactName="Ana"
        contactId="contact-A"
        onSelectSuggestion={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const enviado = bodyOf(0)?.messages?.[0]?.content ?? '';
    expect(enviado).not.toContain('123.456.789');
    expect(enviado).not.toContain('4111 1111 1111 1111');
    expect(enviado).toContain('meu cpf e');
  });

  it('o painel mostra o selo de que a sugestao e de IA', async () => {
    invokeMock.mockResolvedValue({ data: { suggestions: [{ type: 'direct', text: 'ok', emoji: '✓', source: null }] }, error: null });

    render(
      <AISuggestions
        messages={[{ id: 'm1', content: 'oi', sender: 'contact', timestamp: new Date() }]}
        contactName="Ana"
        contactId="contact-A"
        onSelectSuggestion={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));

    await waitFor(() => expect(screen.getByTitle('Sugestão de IA — você decide o envio')).toBeTruthy());
  });
});
