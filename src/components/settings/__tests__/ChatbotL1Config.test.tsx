import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CONEXOES = [
  { id: 'conn-1', name: 'Comercial', status: 'connected' },
  { id: 'conn-2', name: 'Suporte', status: 'connected' },
];

const estado = vi.hoisted(() => ({
  flow: null as Record<string, unknown> | null,
  eqsDeFluxo: [] as [string, unknown][],
  updatePayload: null as Record<string, unknown> | null,
  insertPayload: null as Record<string, unknown> | null,
  invoke: null as { name: string; body: Record<string, unknown> } | null,
  invokeResult: { data: null as Record<string, unknown> | null, error: null as unknown },
  erroConexoes: false,
  kbCount: 42,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'chatbot_flows') {
        return {
          select: () => ({
            eq: (coluna: string, valor: unknown) => {
              estado.eqsDeFluxo.push([coluna, valor]);
              return {
                eq: (coluna2: string, valor2: unknown) => {
                  estado.eqsDeFluxo.push([coluna2, valor2]);
                  return {
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: estado.flow, error: null }),
                    }),
                  };
                },
              };
            },
          }),
          update: (payload: Record<string, unknown>) => {
            estado.updatePayload = payload;
            return { eq: () => Promise.resolve({ error: null }) };
          },
          insert: (payload: Record<string, unknown>) => {
            estado.insertPayload = payload;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'whatsapp_connections') {
        return {
          select: () => ({
            order: () =>
              Promise.resolve(
                estado.erroConexoes
                  ? { data: null, error: new Error('sem rede') }
                  : { data: CONEXOES, error: null },
              ),
          }),
        };
      }
      if (table === 'knowledge_base_articles') {
        return {
          select: () => ({ eq: () => Promise.resolve({ count: estado.kbCount, error: null }) }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    }),
    functions: {
      invoke: (name: string, opts: { body: Record<string, unknown> }) => {
        estado.invoke = { name, body: opts.body };
        return Promise.resolve(estado.invokeResult);
      },
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

// O ContactPicker real busca contatos pelo ContactService; aqui ele é reduzido às
// duas portas que o painel usa (escolher e limpar), para o teste ficar no painel.
vi.mock('@/components/calls/ContactPicker', async () => {
  const React = await import('react');
  return {
    ContactPicker: ({ selecionado, onEscolher, onLimpar }: {
      selecionado: { id: string; name: string } | null;
      onEscolher: (c: { id: string; name: string; phone: string }) => void;
      onLimpar: () => void;
    }) =>
      selecionado
        ? React.createElement('div', {},
            React.createElement('span', {}, selecionado.name),
            React.createElement('button', { type: 'button', onClick: onLimpar }, 'Remover contato'),
          )
        : React.createElement('button', {
            type: 'button',
            onClick: () => onEscolher({ id: 'contact-1', name: 'Cliente Teste', phone: '5511999999999' }),
          }, 'Escolher contato'),
  };
});

// Select do Radix não seleciona por evento sintético no jsdom; o stub é um
// <select> nativo com o MESMO rótulo acessível do gatilho real.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectItem = () => null;
  const SelectContent = () => null;
  return {
    SelectItem,
    SelectContent,
    SelectTrigger: () => null,
    SelectValue: () => null,
    Select: ({ value, onValueChange, children }: {
      value: string;
      onValueChange: (v: string) => void;
      children: unknown;
    }) => {
      const itens: { value: string; rotulo: unknown }[] = [];
      React.Children.forEach(children as never, (child) => {
        const el = child as { type?: unknown; props?: { children?: unknown } } | null;
        if (!el || el.type !== SelectContent) return;
        React.Children.forEach(el.props?.children as never, (item) => {
          const it = item as { props?: { value?: string; children?: unknown } } | null;
          if (it?.props?.value) itens.push({ value: it.props.value, rotulo: it.props.children });
        });
      });
      return React.createElement(
        'select',
        {
          'aria-label': 'Conexão WhatsApp',
          value,
          onChange: (e: { target: { value: string } }) => onValueChange(e.target.value),
        },
        [
          React.createElement('option', { key: '', value: '' }, 'Selecione a conexão'),
          ...itens.map((i) => React.createElement('option', { key: i.value, value: i.value }, i.rotulo as never)),
        ],
      );
    },
  };
});

import { ChatbotL1Config } from '../ChatbotL1Config';
import { normalizarConfianca } from '@/lib/chatbotConfianca';

const renderConfig = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatbotL1Config />
    </QueryClientProvider>,
  );
};

const escolherConexao = async (nome: string, id: string) => {
  // Espera a lista de conexões chegar: um <select> nativo só aceita o valor
  // quando a <option> correspondente já existe no DOM.
  await screen.findByRole('option', { name: new RegExp(nome) });
  const select = screen.getByLabelText('Conexão WhatsApp');
  fireEvent.change(select, { target: { value: id } });
};

describe('ChatbotL1Config — interruptor acessível por nome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.flow = null;
    estado.eqsDeFluxo = [];
    estado.updatePayload = null;
    estado.insertPayload = null;
    estado.invoke = null;
    estado.invokeResult = { data: null, error: null };
    estado.erroConexoes = false;
    estado.kbCount = 42;
  });

  it('o interruptor de ativar chatbot é alcançável pelo nome', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toBeInTheDocument();
    });
  });

  it('o interruptor reflete o estado carregado da configuração', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('o axe não acusa violações de label na tela', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toBeInTheDocument();
    });
    const results = await axe(document.body, { rules: { region: { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'label')).toEqual([]);
  });
});

describe('ChatbotL1Config — fluxo por conexão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.flow = null;
    estado.eqsDeFluxo = [];
    estado.updatePayload = null;
    estado.insertPayload = null;
    estado.invoke = null;
    estado.invokeResult = { data: null, error: null };
    estado.erroConexoes = false;
    estado.kbCount = 42;
  });

  it('sem conexão escolhida nada é lido e o Salvar fica desabilitado', async () => {
    renderConfig();

    const salvar = await screen.findByRole('button', { name: 'Salvar Configuração' });
    expect(salvar).toBeDisabled();
    expect(estado.eqsDeFluxo).toEqual([]);
    expect(estado.insertPayload).toBeNull();
    expect(estado.updatePayload).toBeNull();
  });

  it('escolher a conexão carrega o fluxo DAQUELA conexão', async () => {
    estado.flow = {
      id: 'flow-1',
      name: 'Bot do Comercial',
      is_active: true,
      trigger_type: 'ai_l1',
      variables: { confidence_threshold: 75, welcome_message: 'Olá!', transfer_message: 'Transferindo...' },
    };
    renderConfig();
    await escolherConexao('Comercial', 'conn-1');

    await waitFor(() => {
      expect(estado.eqsDeFluxo).toContainEqual(['whatsapp_connection_id', 'conn-1']);
    });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByLabelText('Nome do Bot')).toHaveValue('Bot do Comercial');
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
  });

  it('salvar grava o fluxo amarrado à conexão escolhida', async () => {
    renderConfig();
    await escolherConexao('Suporte', 'conn-2');

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => {
      expect(estado.insertPayload).not.toBeNull();
    });
    expect(estado.insertPayload).toMatchObject({
      trigger_type: 'ai_l1',
      whatsapp_connection_id: 'conn-2',
      is_active: false,
    });
  });
});

describe('ChatbotL1Config — simulação da resposta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.flow = null;
    estado.eqsDeFluxo = [];
    estado.updatePayload = null;
    estado.insertPayload = null;
    estado.invoke = null;
    estado.invokeResult = { data: null, error: null };
  });

  it('simular chama a Edge com a conexão e o contato e mostra a resposta do robô', async () => {
    estado.invokeResult = {
      data: { handled: true, response: 'O prazo de entrega é de 5 dias úteis.', confidence: 0.82, matched_article: 'Prazo de entrega' },
      error: null,
    };
    renderConfig();
    await escolherConexao('Comercial', 'conn-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher contato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simular resposta' }));

    await waitFor(() => {
      expect(estado.invoke).not.toBeNull();
    });
    expect(estado.invoke?.name).toBe('chatbot-l1');
    expect(estado.invoke?.body).toEqual({
      contactId: 'contact-1',
      message: 'Olá, gostaria de saber o prazo de entrega.',
      connectionId: 'conn-1',
    });
    await waitFor(() => {
      expect(screen.getByText('O prazo de entrega é de 5 dias úteis.')).toBeInTheDocument();
    });
    expect(screen.getByText('Confiança: 82%')).toBeInTheDocument();
    expect(screen.getByText('Artigo: Prazo de entrega')).toBeInTheDocument();
  });

  it('sem contato escolhido o erro é claro e a Edge não é chamada', async () => {
    renderConfig();
    await escolherConexao('Comercial', 'conn-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Simular resposta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha um contato para a simulação.');
    expect(estado.invoke).toBeNull();
  });

  it('quando não há fluxo ativo a simulação diz o motivo real, não um erro genérico', async () => {
    estado.invokeResult = { data: { handled: false, reason: 'no_active_flow' }, error: null };
    renderConfig();
    await escolherConexao('Comercial', 'conn-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher contato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simular resposta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não há fluxo ativo para esta conexão. Salve a configuração com o chatbot ativado.',
    );
  });

  it('falha ao carregar as conexões vira aviso na tela, não lista vazia silenciosa', async () => {
    estado.erroConexoes = true;
    renderConfig();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as conexões de WhatsApp. Recarregue a página e tente de novo.',
    );
  });
});

describe('ChatbotL1Config — refazer 1 (recusa de 15/10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.flow = null;
    estado.eqsDeFluxo = [];
    estado.updatePayload = null;
    estado.insertPayload = null;
    estado.invoke = null;
    estado.invokeResult = { data: null, error: null };
    estado.erroConexoes = false;
    estado.kbCount = 42;
  });

  it('ponto 1: confiança salva fora da faixa volta ao padrão 60 em vez de gravar o valor inválido', async () => {
    estado.flow = {
      id: 'flow-1',
      name: 'Bot do Comercial',
      is_active: true,
      trigger_type: 'ai_l1',
      variables: { confidence_threshold: 150, welcome_message: 'Olá!', transfer_message: 'Transferindo...' },
    };
    renderConfig();
    await escolherConexao('Comercial', 'conn-1');
    await waitFor(() => {
      expect(screen.getByLabelText('Nome do Bot')).toHaveValue('Bot do Comercial');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => {
      expect(estado.updatePayload).not.toBeNull();
    });
    expect((estado.updatePayload?.variables as Record<string, unknown>).confidence_threshold).toBe(60);
  });

  it('ponto 1 (sem regressão): confiança dentro da faixa continua gravando o valor da tela', async () => {
    estado.flow = {
      id: 'flow-1',
      name: 'Bot do Comercial',
      is_active: true,
      trigger_type: 'ai_l1',
      variables: { confidence_threshold: 75, welcome_message: 'Olá!', transfer_message: 'Transferindo...' },
    };
    renderConfig();
    await escolherConexao('Comercial', 'conn-1');
    await waitFor(() => {
      expect(screen.getByLabelText('Nome do Bot')).toHaveValue('Bot do Comercial');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => {
      expect(estado.updatePayload).not.toBeNull();
    });
    expect((estado.updatePayload?.variables as Record<string, unknown>).confidence_threshold).toBe(75);
  });

  it('ponto 2: após criar o fluxo novo o Salvar fica desabilitado até o fluxo chegar', async () => {
    renderConfig();
    await escolherConexao('Suporte', 'conn-2');

    const salvar = await screen.findByRole('button', { name: 'Salvar Configuração' });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);

    await waitFor(() => {
      expect(estado.insertPayload).not.toBeNull();
    });
    // O mock não devolve o fluxo criado: sem o fluxo na tela, o botão segue
    // bloqueado em vez de liberar um segundo insert duplicado.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar Configuração' })).toBeDisabled();
    });
  });

  it('ponto 3: sem artigo na KB a tela recomenda publicar ao menos 1, sem mexer no contador', async () => {
    estado.kbCount = 0;
    renderConfig();

    expect(await screen.findByText(/publique ao menos 1 artigo/i)).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('ponto 1 (unidade): fora da faixa volta ao salvo atual; sem salvo válido, ao padrão 60', () => {
    expect(normalizarConfianca(10, 70)).toBe(70);
    expect(normalizarConfianca(150, 70)).toBe(70);
    expect(normalizarConfianca(10, null)).toBe(60);
    expect(normalizarConfianca(150, 150)).toBe(60);
    expect(normalizarConfianca(75, 70)).toBe(75);
    expect(normalizarConfianca(30, 70)).toBe(30);
    expect(normalizarConfianca(95, 70)).toBe(95);
  });

  it('ponto 3 (sem regressão): com artigos na KB a tela segue mostrando a contagem no passo 2', async () => {
    renderConfig();

    expect(await screen.findByText(/IA analisa usando a Base de Conhecimento \(42 artigos\)/)).toBeInTheDocument();
  });
});
