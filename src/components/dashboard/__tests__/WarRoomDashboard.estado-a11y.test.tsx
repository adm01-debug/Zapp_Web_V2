import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * War Room — P2-B: a tela mostrava zeros enquanto carregava (e depois de a leitura
 * falhar), os botões só de ícone não tinham nome acessível, a lista de alertas não era
 * região viva, `animate-*` ignorava "reduzir movimento", o botão de tela cheia não
 * acompanhava a tecla Esc e dispensar alerta escondia o alerta mesmo quando o UPDATE
 * falhava.
 *
 * A prova monta o componente REAL com os hooks REAIS de dados/alertas: só o cliente do
 * Supabase é falso (a guarda de rede proíbe falar com produção).
 */

const espiões = vi.hoisted(() => ({
  atualizarConfiguracoes: vi.fn(),
  toastErro: vi.fn(),
  estado: {
    modoLeitura: 'ok' as 'ok' | 'pendente' | 'erro',
    erroDispensar: null as { message: string } | null,
    configuracoes: { soundEnabled: true, soundVolume: 40 },
    idsDispensados: [] as string[],
  },
}));

vi.mock('sonner', () => ({
  toast: { error: espiões.toastErro, success: vi.fn() },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: espiões.estado.configuracoes,
    updateSettings: espiões.atualizarConfiguracoes,
    isQuietHours: () => false,
  }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({ showNotification: vi.fn(), permission: 'denied' }),
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => ({}),
}));

vi.mock('@/components/inbox/AgentReassignmentPanel', () => ({
  AgentReassignmentPanel: () => <div data-testid="painel-reatribuicao" />,
}));

vi.mock('@/integrations/supabase/client', () => {
  const estado = espiões.estado;
  const paginaVazia = () => Promise.resolve({ data: [], error: null });

  const leituraDeCadastro = () => ({
    select: () => ({
      eq: () => {
        // `pendente` = consulta no ar (nunca resolve): é o carregamento da tela.
        if (estado.modoLeitura === 'pendente') return new Promise(() => {});
        if (estado.modoLeitura === 'erro') {
          return Promise.resolve({ data: null, error: { message: 'permission denied for table profiles' } });
        }
        return paginaVazia();
      },
    }),
  });

  const cadeiaDeContatos = () => {
    const cadeia: Record<string, unknown> = {};
    for (const metodo of ['eq', 'not', 'is', 'order']) cadeia[metodo] = () => cadeia;
    cadeia.range = paginaVazia;
    return { select: () => cadeia };
  };

  return {
    supabase: {
      from: (tabela: string) => {
        if (tabela === 'profiles' || tabela === 'queues') return leituraDeCadastro();
        if (tabela === 'contacts') return cadeiaDeContatos();
        if (tabela === 'conversation_sla') {
          return {
            select: () => ({
              eq: () => ({ order: () => ({ range: paginaVazia }) }),
              then: (resolver: (valor: unknown) => unknown) => paginaVazia().then(resolver),
            }),
          };
        }
        if (tabela === 'warroom_alerts') {
          return {
            select: () => ({ eq: () => ({ order: () => ({ limit: paginaVazia }) }) }),
            update: () => ({
              eq: (_coluna: string, id: string) => {
                estado.idsDispensados.push(id);
                return Promise.resolve({ error: estado.erroDispensar });
              },
            }),
            insert: paginaVazia,
          };
        }
        return {
          select: () => ({ eq: paginaVazia, or: paginaVazia }),
          insert: paginaVazia,
          update: () => ({ eq: paginaVazia }),
        };
      },
      channel: () => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      }),
      removeChannel: vi.fn(),
      // O hook real agrega pelos RPCs `warroom_agent_today`/`warroom_queue_stats`:
      // o fake precisa cobri-los, senão a chamada estoura antes de a leitura de
      // `profiles` falhar — que é justamente o caminho que este teste exercita.
      rpc: () => {
        if (estado.modoLeitura === 'pendente') return new Promise(() => {});
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});

import { WarRoomDashboard } from '@/components/dashboard/WarRoomDashboard';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WarRoomAgent, WarRoomQueue, WarRoomAlert } from '@/hooks/business/useWarRoomData';

function renderizar(props: React.ComponentProps<typeof WarRoomDashboard> = {}) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={cliente}>
      <TooltipProvider>
        <WarRoomDashboard {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const agente: WarRoomAgent = {
  id: 'p1', name: 'Ana Souza', status: 'online',
  activeChats: 2, maxChats: 5, avgResponseTime: 30, resolvedToday: 7, satisfaction: 4.5,
};

const fila: WarRoomQueue = {
  id: 'q1', name: 'Comercial', color: '#123456',
  waiting: 3, avgWaitTime: null, slaBreaches: 0, slaWarnings: null, inProgress: 1,
};

const alertaComum: WarRoomAlert = {
  id: 'a1', type: 'warning', title: 'SLA em risco', message: '3 conversas perto do prazo',
  timestamp: new Date(2026, 9, 15, 10, 0), isNew: false,
};

const alertaCritico: WarRoomAlert = {
  id: 'a2', type: 'critical', title: 'Fila travada', message: 'Ninguém atendendo',
  timestamp: new Date(2026, 9, 15, 10, 5), isNew: true,
};

describe('WarRoomDashboard — carregando e erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    espiões.estado.modoLeitura = 'ok';
    espiões.estado.erroDispensar = null;
    espiões.estado.idsDispensados = [];
    espiões.estado.configuracoes.soundEnabled = true;
  });

  it('mostra esqueleto enquanto carrega, sem apresentar zero como se fosse medido', async () => {
    espiões.estado.modoLeitura = 'pendente';
    renderizar();

    expect(await screen.findByRole('status', { name: 'Carregando dados do War Room' })).toBeInTheDocument();
    expect(screen.queryByText('Na Fila')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolvidos Hoje')).not.toBeInTheDocument();
  });

  it('falha de leitura vira estado de erro com “Tentar de novo”, e o retry recarrega', async () => {
    espiões.estado.modoLeitura = 'erro';
    renderizar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar o War Room');
    expect(alerta).toHaveTextContent('permission denied for table profiles');

    espiões.estado.modoLeitura = 'ok';
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Na Fila')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('WarRoomDashboard — nomes acessíveis e movimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    espiões.estado.modoLeitura = 'ok';
    espiões.estado.configuracoes.soundEnabled = true;
  });

  it('botões só de ícone têm nome acessível e o nome acompanha o estado', async () => {
    renderizar({ agents: [agente], queues: [fila], alerts: [] });

    const som = await screen.findByRole('button', { name: 'Desativar som de alertas' });
    const atualizacao = screen.getByRole('button', { name: 'Pausar atualização automática' });
    const telaCheia = screen.getByRole('button', { name: 'Entrar em tela cheia' });

    fireEvent.click(som);
    expect(espiões.atualizarConfiguracoes).toHaveBeenCalledWith({ soundEnabled: false });

    fireEvent.click(atualizacao);
    expect(await screen.findByRole('button', { name: 'Retomar atualização automática' })).toBeInTheDocument();

    // Duas telas cheias diferentes não podem ter o mesmo nome: o rótulo diz a ação.
    expect(telaCheia).toHaveAccessibleName('Entrar em tela cheia');
  });

  it('o botão de tela cheia acompanha a saída pelo Esc (evento fullscreenchange)', async () => {
    let telaCheiaAtiva = false;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (telaCheiaAtiva ? document.body : null) });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = vi.fn().mockResolvedValue(undefined);

    renderizar({ agents: [agente], queues: [fila], alerts: [] });

    fireEvent.click(await screen.findByRole('button', { name: 'Entrar em tela cheia' }));
    expect(await screen.findByRole('button', { name: 'Sair da tela cheia' })).toBeInTheDocument();

    // O usuário aperta Esc: o navegador sai da tela cheia e dispara o evento.
    telaCheiaAtiva = false;
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(await screen.findByRole('button', { name: 'Entrar em tela cheia' })).toBeInTheDocument();
  });

  it('as animações de alerta respeitam “reduzir movimento” (motion-safe)', async () => {
    const { container } = renderizar({ agents: [agente], queues: [{ ...fila, slaBreaches: 2 }], alerts: [alertaCritico] });

    expect(await screen.findByText('Alertas')).toBeInTheDocument();
    // Toda animação da tela tem de vir com a guarda de "reduzir movimento": nenhuma
    // classe de animação solta (nome da animação sem o prefixo `motion-safe:`).
    const animados = Array.from(container.querySelectorAll<HTMLElement>('[class*="animate-"]'));
    expect(animados.length).toBeGreaterThan(0);
    const semGuarda = animados.filter((el) =>
      Array.from(el.classList).some((classe) => classe.startsWith('animate-')),
    );
    expect(semGuarda.map((el) => el.className)).toEqual([]);
    expect(container.querySelector('.motion-safe\\:animate-pulse-subtle')).not.toBeNull();
  });
});

describe('WarRoomDashboard — região viva dos alertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    espiões.estado.modoLeitura = 'ok';
  });

  it('crítico novo pede a fala agora (assertive)', async () => {
    renderizar({ agents: [agente], queues: [fila], alerts: [alertaCritico] });

    const regiao = await screen.findByRole('log', { name: 'Alertas do War Room' });
    expect(regiao).toHaveAttribute('aria-live', 'assertive');
  });

  it('alerta comum entra sem atropelar a fala em curso (polite)', async () => {
    renderizar({ agents: [agente], queues: [fila], alerts: [{ ...alertaCritico, type: 'warning' }] });

    const regiao = await screen.findByRole('log', { name: 'Alertas do War Room' });
    expect(regiao).toHaveAttribute('aria-live', 'polite');
  });

  it('o botão de dispensar diz QUAL alerta ele dispensa', async () => {
    renderizar({ agents: [agente], queues: [fila], alerts: [alertaComum] });

    expect(await screen.findByRole('button', { name: 'Dispensar alerta: SLA em risco' })).toBeInTheDocument();
  });
});

describe('WarRoomDashboard — dispensar alerta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    espiões.estado.modoLeitura = 'ok';
    espiões.estado.erroDispensar = null;
    espiões.estado.idsDispensados = [];
  });

  it('sucesso: o alerta sai da lista na hora e o pedido chega ao banco', async () => {
    renderizar({ agents: [agente], queues: [fila], alerts: [alertaComum] });

    fireEvent.click(await screen.findByRole('button', { name: 'Dispensar alerta: SLA em risco' }));

    await waitFor(() => expect(screen.queryByText('SLA em risco')).not.toBeInTheDocument());
    expect(espiões.estado.idsDispensados).toContain('a1');
    expect(espiões.toastErro).not.toHaveBeenCalled();
  });

  it('falha: avisa por toast e o alerta VOLTA para a lista', async () => {
    espiões.estado.erroDispensar = { message: 'new row violates row-level security policy' };
    renderizar({ agents: [agente], queues: [fila], alerts: [alertaComum] });

    fireEvent.click(await screen.findByRole('button', { name: 'Dispensar alerta: SLA em risco' }));

    await waitFor(() => expect(espiões.toastErro).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('SLA em risco')).toBeInTheDocument();
    expect(espiões.estado.idsDispensados).toContain('a1');
  });
});

describe('WarRoomDashboard — acessibilidade (axe)', () => {
  // O jsdom não calcula cor de fundo com fidelidade; o contraste é conferido pelos
  // tokens do sistema, não pelo axe aqui (mesmo ajuste do TalkX a11y). E o painel é
  // renderizado SOZINHO neste teste: o `h1` da página vem do ViewContainer, então a
  // ordem de títulos é assunto do shell, não do War Room.
  const regrasJsdom = { rules: { 'color-contrast': { enabled: false }, 'heading-order': { enabled: false } } };

  beforeEach(() => {
    vi.clearAllMocks();
    espiões.estado.modoLeitura = 'ok';
    espiões.estado.erroDispensar = null;
  });

  it('sem violações com dados, alertas e risco na tela', async () => {
    const { container } = renderizar({
      agents: [agente],
      queues: [{ ...fila, slaBreaches: 2, slaWarnings: 1 }],
      alerts: [alertaCritico, alertaComum],
    });

    expect(await screen.findByText('Na Fila')).toBeInTheDocument();
    expect(await axe(container, regrasJsdom)).toHaveNoViolations();
  });

  it('sem violações no estado de erro', async () => {
    espiões.estado.modoLeitura = 'erro';
    const { container } = renderizar();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await axe(container, regrasJsdom)).toHaveNoViolations();
  });
});
