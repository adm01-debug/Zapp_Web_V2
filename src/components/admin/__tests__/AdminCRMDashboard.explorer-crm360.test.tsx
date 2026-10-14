/**
 * AdminCRMDashboard — três contratos observáveis da tela do Painel CRM Externo:
 *
 * 1. "Explorer Completo" navega pela navegação da aplicação (useNavigationHistory
 *    / ?view=<id>), que é a fonte única das telas. Defeito: o botão chamava
 *    `navigate('/#crm360')` do react-router-dom; o roteador grava a URL por
 *    `history.pushState`, o que NÃO dispara `hashchange` nem `zapp:navigate` —
 *    o `?view=` canônico nunca é gravado e o clique não abre o Explorer (a URL
 *    ainda perde o `?view=` da tela atual).
 * 2. "Top 5 Clientes por Valor" mostra o CLIENTE. Defeito: mostrava
 *    `customers.vendedor_nome`, que é o VENDEDOR; o nome do cliente está em
 *    `companies` (razao_social/nome_fantasia), alcançado por `company_id`.
 * 3. Falha ou CRM fora do ar nunca vira 0: os seis cartões e os três painéis
 *    mostram '—' + 'Dados não disponíveis' (via isError ou meta.unavailable).
 *
 * Os testes montam a TELA REAL (dentro do Router, como no App) e exercitam os
 * três cenários: sucesso, indisponível (meta.unavailable) e erro de consulta.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));

type Cenario = 'ok' | 'falha' | 'indisponivel';

let cenario: Cenario = 'ok';

interface OpcoesConsulta {
  table: string;
  filters?: ReadonlyArray<{ column: string; operator: string; value: unknown }>;
}

interface ConsultaRegistrada {
  table: string;
  idsFiltrados: string[];
}

const consultas: ConsultaRegistrada[] = [];

const EMPRESAS = [
  { id: 'emp-1', razao_social: 'Alfa Metalúrgica LTDA', nome_fantasia: 'Alfa', nome_crm: null },
  { id: 'emp-2', razao_social: 'Beta Distribuidora S.A.', nome_fantasia: 'Beta', nome_crm: null },
];

// O vendedor é outro nome, de propósito: se a tela voltar a mostrar o vendedor, o
// teste tem de acusar.
const CLIENTES = [
  { id: 'c1', company_id: 'emp-1', vendedor_nome: 'Vendedor Um', valor_total_compras: 90000, total_pedidos: 12, cliente_ativado: true },
  { id: 'c2', company_id: 'emp-2', vendedor_nome: 'Vendedor Dois', valor_total_compras: 50000, total_pedidos: 7, cliente_ativado: false },
];

function meta(recordCount: number) {
  return { record_count: recordCount, duration_ms: 3, severity: 'ok' };
}

/** Casca mínima do useExternalSelect real (a tela só lê data/isLoading/isError). */
function responderConsulta(opcoes: OpcoesConsulta) {
  consultas.push({
    table: opcoes.table,
    idsFiltrados: (opcoes.filters?.[0]?.value as string[] | undefined) ?? [],
  });

  if (cenario === 'falha') return { data: undefined, isLoading: false, isError: true };
  if (cenario === 'indisponivel') {
    return { data: { data: [], meta: { ...meta(0), unavailable: true } }, isLoading: false, isError: false };
  }
  if (opcoes.table === 'customers') {
    return { data: { data: CLIENTES, meta: meta(CLIENTES.length) }, isLoading: false, isError: false };
  }
  if (opcoes.table === 'companies') {
    const ids = (opcoes.filters?.[0]?.value as string[] | undefined) ?? [];
    const encontradas = EMPRESAS.filter((e) => ids.includes(e.id));
    return { data: { data: encontradas, meta: meta(encontradas.length) }, isLoading: false, isError: false };
  }
  return { data: { data: [], meta: meta(0) }, isLoading: false, isError: false };
}

vi.mock('@/hooks/integrations/useExternalDB', () => ({
  useExternalSelect: (opcoes: OpcoesConsulta) => responderConsulta(opcoes),
}));

// Health da integração: resposta válida, para a tela renderizar no caminho bom.
vi.mock('@/lib/crmIntegration', () => ({
  callCRMIntegration: vi.fn(async () => ({
    data: {
      external_reachable: true,
      queue: {
        pending: 0, processing: 0, failed: 0, dead_letter: 0,
        succeeded_24h: 0, succeeded_without_link: 0, oldest_ready_age_seconds: 0,
        generated_at: new Date().toISOString(),
      },
    },
  })),
}));

import { AdminCRMDashboard } from '@/components/admin/AdminCRMDashboard';

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      {/* O App monta as telas dentro de um Router (App.tsx); o teste reproduz isso. */}
      <MemoryRouter initialEntries={['/']}>
        <AdminCRMDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminCRMDashboard — Painel CRM Externo', () => {
  let eventos: string[];
  let ouvir: (e: Event) => void;

  beforeEach(() => {
    cenario = 'ok';
    consultas.length = 0;
    window.history.replaceState({}, '', '/');
    eventos = [];
    ouvir = (e: Event) => {
      const view = (e as CustomEvent<{ view?: string }>).detail?.view;
      if (view) eventos.push(view);
    };
    window.addEventListener('zapp:navigate', ouvir);
  });

  afterEach(() => {
    window.removeEventListener('zapp:navigate', ouvir);
    cleanup();
  });

  it('"Explorer Completo" grava ?view=crm360 na URL e emite zapp:navigate', () => {
    montar();

    fireEvent.click(screen.getByRole('button', { name: /Explorer Completo/ }));

    expect(new URLSearchParams(window.location.search).get('view')).toBe('crm360');
    expect(eventos).toContain('crm360');
  });

  it('Top 5 mostra o nome do cliente (companies por id), não o vendedor', () => {
    montar();

    expect(screen.getByText('Alfa Metalúrgica LTDA')).toBeInTheDocument();
    expect(screen.getByText('Beta Distribuidora S.A.')).toBeInTheDocument();
    expect(screen.queryByText('Vendedor Um')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendedor Dois')).not.toBeInTheDocument();

    const consultaEmpresas = consultas.find((c) => c.table === 'companies');
    expect(consultaEmpresas?.idsFiltrados).toEqual(['emp-1', 'emp-2']);
  });

  it('CRM indisponível (meta.unavailable) mostra "—" e "Dados não disponíveis", nunca 0', () => {
    cenario = 'indisponivel';
    montar();

    // 6 cartões + 3 painéis.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('Dados não disponíveis').length).toBeGreaterThanOrEqual(9);
    expect(screen.queryAllByText('0')).toHaveLength(0);
  });

  it('falha de consulta (isError) mostra "—" e "Dados não disponíveis", nunca 0', () => {
    cenario = 'falha';
    montar();

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('Dados não disponíveis').length).toBeGreaterThanOrEqual(9);
    expect(screen.queryAllByText('0')).toHaveLength(0);
    // Os rótulos dos cartões continuam visíveis.
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Transportadoras')).toBeInTheDocument();
  });
});
