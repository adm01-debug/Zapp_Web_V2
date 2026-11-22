import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantAskCard } from '../AssistantAskCard';

/**
 * Fase 3 do assistente pessoal — entrega verificável do plano:
 * "uma chamada natural ('como estou com o cliente X?') devolve uma resposta que
 * usa ≥3 fontes, com prova de origem".
 *
 * O mock captura o BODY enviado à edge e devolve a resposta real que a edge
 * monta. Os asserts são sobre o contrato (query/contactId enviados, fontes
 * renderizadas), não sobre o texto do modelo.
 */
const h = vi.hoisted(() => ({
  chamadas: [] as Array<Record<string, unknown>>,
  resposta: null as unknown,
  falha: null as string | null,
}));

vi.mock('@/lib/assistant/askGateway', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/assistant/askGateway')>();
  return {
    ...real,
    askGateway: async (args: { query: string; contactId: string | null }) => {
      h.chamadas.push({ query: args.query, contactId: args.contactId });
      if (h.falha) throw new Error(h.falha);
      return h.resposta;
    },
  };
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssistantAskCard contactId="c-1" contactName="João" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.chamadas.length = 0;
  h.falha = null;
  h.resposta = {
    answer: 'Agenda: Ligar para João. resumo da conversa: quer 500 canecas. temperatura do lead: quente',
    capabilities: ['agenda', 'resumo_conversa', 'temperatura_lead'],
    sources: [
      { kind: 'perfil', origin: 'assistant_profiles', rows: 1 },
      { kind: 'contato', origin: 'contacts', rows: 1 },
      { kind: 'agenda', origin: 'conversation_tasks', rows: 1 },
      { kind: 'conversa', origin: 'messages', rows: 6 },
      { kind: 'negocio', origin: 'sales_deals', rows: 1 },
    ],
    errors: [],
  };
});

describe('AssistantAskCard (porta única)', () => {
  it('envia o pedido com o contato e mostra a resposta com a origem de cada fonte', async () => {
    renderCard();

    fireEvent.change(screen.getByTestId('assistant-ask-input'), { target: { value: 'como estou com o João?' } });
    fireEvent.click(screen.getByTestId('assistant-ask-submit'));

    await waitFor(() => expect(screen.getByTestId('assistant-ask-answer')).toBeInTheDocument());

    expect(h.chamadas).toEqual([{ query: 'como estou com o João?', contactId: 'c-1' }]);
    expect(screen.getByTestId('assistant-ask-answer').textContent).toContain('500 canecas');

    // Prova de origem: as 5 fontes aparecem nomeadas, não como texto do modelo.
    const fontes = screen.getByTestId('assistant-ask-sources');
    expect(fontes.textContent).toContain('seu perfil');
    expect(fontes.textContent).toContain('agenda');
    expect(fontes.textContent).toContain('conversa');
    expect(screen.getByTestId('assistant-source-conversa')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-source-negocio')).toBeInTheDocument();
  });

  it('mostra a mensagem de erro da edge quando a chamada falha', async () => {
    h.falha = 'Sua sessão expirou. Entre novamente para falar com o assistente.';
    renderCard();

    fireEvent.change(screen.getByTestId('assistant-ask-input'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByTestId('assistant-ask-submit'));

    await waitFor(() => expect(screen.getByTestId('assistant-ask-error')).toBeInTheDocument());
    expect(screen.getByTestId('assistant-ask-error').textContent).toContain('sessão expirou');
    expect(screen.queryByTestId('assistant-ask-answer')).toBeNull();
    h.falha = null;
  });

  it('sugestão preenche o campo e dispara a pergunta sem digitação', async () => {
    renderCard();

    fireEvent.click(screen.getByText('Resuma a conversa'));

    await waitFor(() => expect(h.chamadas).toHaveLength(1));
    expect(h.chamadas[0]).toEqual({ query: 'Resuma a conversa', contactId: 'c-1' });
    expect((screen.getByTestId('assistant-ask-input') as HTMLInputElement).value).toBe('Resuma a conversa');
  });

  it('avisa quando a resposta veio parcial', async () => {
    h.resposta = {
      answer: 'Agenda: nada.',
      capabilities: ['agenda'],
      sources: [{ kind: 'conversa', origin: 'messages', rows: 0, error: 'permission denied' }],
      errors: ['resumo da conversa: histórico insuficiente (2 de 5 mensagens)'],
    };
    renderCard();

    fireEvent.change(screen.getByTestId('assistant-ask-input'), { target: { value: 'como estou?' } });
    fireEvent.click(screen.getByTestId('assistant-ask-submit'));

    await waitFor(() => expect(screen.getByTestId('assistant-ask-partial')).toBeInTheDocument());
    expect(screen.getByTestId('assistant-ask-partial').textContent).toContain('histórico insuficiente');
    // Fonte com erro não aparece como "vazio": o título carrega o motivo.
    expect(screen.getByTestId('assistant-source-conversa').getAttribute('title')).toBe('permission denied');
  });
});