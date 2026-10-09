/**
 * R2-INB-020 / item 316 — filtro por tag na busca global: contatos cortados pelo
 * LIMIT antes do filtro, mensagens/transcrições fora do escopo da tag e refazer
 * que não pode transformar tag comum em lista gigante de IDs no GET do PostgREST.
 *
 * O banco falso emula dois pontos do PostgREST que importam para o bug:
 *  - filtros entram antes do LIMIT;
 *  - `.in(..., muitosIds)` estoura a URL do GET. A correção não pode depender
 *    dessa lista: deve usar `.overlaps('tags', tags)` em contatos e
 *    `.overlaps('contacts.tags', tags)` com `contacts!inner` em mensagens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalSearch } from '@/components/inbox/GlobalSearch';

type Row = Record<string, unknown>;

interface Query {
  table: string;
  filters: Array<(row: Row) => boolean>;
  order: [string, boolean] | null;
  limit: number;
  selectText: string;
  error: { message: string } | null;
}

function valueAtPath(row: Row, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object') return (current as Record<string, unknown>)[key];
    return undefined;
  }, row);
}

/** `name.ilike."%mensagem%",surname.ilike."%mensagem%",...` (saída de `.or()`). */
function parseOr(orString: string): Array<{ column: string; needle: string }> {
  return orString.split(',').map((part) => {
    const [, column, raw] = part.match(/^([^.]+)\.ilike\.(.*)$/) ?? [];
    const value = String(raw ?? '').replace(/^"|"$/g, '').replace(/%/g, '');
    return { column: column ?? '', needle: value.toLowerCase() };
  });
}

const {
  supabaseMock,
  loggerMock,
  roleState,
  crmIntegrationState,
  callCRMIntegrationMock,
} = vi.hoisted(() => {
  const roleState = { isSupervisor: false };
  const crmIntegrationState = { enabled: false };
  const loggerMock = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const callCRMIntegrationMock = vi.fn(async () => ({
    data: {
      results: [
        {
          contact_id: 'crm-1',
          full_name: 'Cliente CRM',
          nome_tratamento: null,
          company_name: 'ACME',
          phone_primary: '+55 11 99999-9999',
          rfm_segment: 'A',
        },
      ],
    },
  }));

  // O contato marcado principal é o 11º na ordem alfabética (depois dos 10 "Ana NN").
  const CONTATO_MARCADO: Row = {
    id: 'c-vip', name: 'Zara', surname: 'Vip', phone: '+5511000000000',
    email: null, created_at: '2026-10-01T09:00:00.000Z', tags: ['VIP'], is_lid_legacy: false,
  };
  const CONTATO_CRM_TAG: Row = {
    id: 'c-crm-tag', name: 'Contato', surname: 'Com Tag', phone: '+5511888888888',
    email: null, created_at: '2026-10-02T09:00:00.000Z', tags: ['CRM'], is_lid_legacy: false,
  };
  const CONTATOS_COMUNS: Row[] = Array.from({ length: 10 }, (_, i) => ({
    id: `c-${i + 1}`, name: `Ana ${String(i + 1).padStart(2, '0')}`, surname: null,
    phone: `+55110000000${String(i).padStart(2, '0')}`, email: null, created_at: '2026-09-01T09:00:00.000Z',
    tags: [], is_lid_legacy: false,
  }));
  // Tag comum: se a implementação pré-buscar IDs e usar `.in`, a URL estoura.
  const CONTATOS_VIP_EXTRAS: Row[] = Array.from({ length: 120 }, (_, i) => ({
    id: `c-vip-extra-${i + 1}`, name: `ZZ Vip ${String(i + 1).padStart(3, '0')}`, surname: null,
    phone: `+55220000${String(i + 1).padStart(4, '0')}`, email: null, created_at: '2026-09-02T09:00:00.000Z',
    tags: ['VIP'], is_lid_legacy: false,
  }));

  const CONTACTS = [...CONTATOS_COMUNS, CONTATO_MARCADO, CONTATO_CRM_TAG, ...CONTATOS_VIP_EXTRAS];
  const MESSAGES: Row[] = [
    { id: 'm-vip', content: 'mensagem do time', message_type: 'text', created_at: '2026-10-05T12:00:00.000Z', contact_id: 'c-vip', transcription: null, contacts: { id: 'c-vip', name: 'Zara', surname: 'Vip', tags: ['VIP'] } },
    { id: 'm-fora', content: 'mensagem do time', message_type: 'text', created_at: '2026-10-05T11:00:00.000Z', contact_id: 'c-1', transcription: null, contacts: { id: 'c-1', name: 'Ana 01', surname: null, tags: [] } },
    { id: 'a-vip', content: '[áudio]', message_type: 'audio', created_at: '2026-10-05T10:00:00.000Z', contact_id: 'c-vip', transcription: 'reuniao com o cliente', contacts: { id: 'c-vip', name: 'Zara', surname: 'Vip', tags: ['VIP'] } },
    { id: 'a-fora', content: '[áudio]', message_type: 'audio', created_at: '2026-10-05T09:00:00.000Z', contact_id: 'c-1', transcription: 'reuniao interna', contacts: { id: 'c-1', name: 'Ana 01', surname: null, tags: [] } },
  ];
  const CRM_LINKS: Row[] = [
    { zapp_contact_id: 'c-crm-tag', external_contact_id: 'crm-1' },
  ];

  function sourceFor(table: string): Row[] {
    if (table === 'contacts') return CONTACTS;
    if (table === 'messages') return MESSAGES;
    if (table === 'crm_contact_links') return CRM_LINKS;
    return [];
  }

  function execute(query: Query): { data: Row[] | null; error: { message: string } | null } {
    if (query.error) return { data: null, error: query.error };

    let rows = sourceFor(query.table).filter((row) => query.filters.every((predicate) => predicate(row)));
    if (query.order) {
      const [column, ascending] = query.order;
      rows = [...rows].sort((a, b) => String(valueAtPath(a, column) ?? '').localeCompare(String(valueAtPath(b, column) ?? '')) * (ascending ? 1 : -1));
    }
    rows = rows.slice(0, query.limit);

    if (query.selectText.trim() === 'id') rows = rows.map((row) => ({ id: row.id }));
    return { data: rows, error: null };
  }

  function builder(query: Query): unknown {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, property: string) {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown) => resolve(execute(query));
        }
        return (...args: unknown[]) => {
          switch (property) {
            case 'select':
              query.selectText = String(args[0] ?? '');
              break;
            case 'eq':
              query.filters.push((row) => valueAtPath(row, String(args[0])) === args[1]);
              break;
            case 'not':
              if (args[1] === 'is' && args[2] === null) query.filters.push((row) => valueAtPath(row, String(args[0])) != null);
              break;
            case 'or':
              query.filters.push((row) => parseOr(String(args[0])).some(({ column, needle }) =>
                String(valueAtPath(row, column) ?? '').toLowerCase().includes(needle)));
              break;
            case 'ilike': {
              const needle = String(args[1]).replace(/%/g, '').toLowerCase();
              if (query.table === 'messages' && String(args[0]) === 'content' && needle === 'quebra-banco') {
                query.error = { message: 'falha simulada em messages' };
              }
              query.filters.push((row) => String(valueAtPath(row, String(args[0])) ?? '').toLowerCase().includes(needle));
              break;
            }
            case 'in': {
              const values = args[1] as unknown[];
              if (Array.isArray(values) && values.length > 50) {
                query.error = { message: 'URL do PostgREST excedida por lista de IDs' };
              }
              query.filters.push((row) => values.includes(valueAtPath(row, String(args[0]))));
              break;
            }
            case 'overlaps': {
              const column = String(args[0]);
              const tags = args[1] as unknown[];
              // Reproduz a recusa: pré-buscar IDs para uma tag comum pode falhar;
              // a implementação correta não faz essa consulta `select('id')`.
              if (query.table === 'contacts' && query.selectText.trim() === 'id' && column === 'tags' && tags.includes('CRM')) {
                query.error = { message: 'pré-busca de IDs por tag falhou' };
              }
              query.filters.push((row) => Array.isArray(valueAtPath(row, column))
                && (valueAtPath(row, column) as unknown[]).some((value) => tags.includes(value)));
              break;
            }
            case 'gte':
              query.filters.push((row) => new Date(String(valueAtPath(row, String(args[0])))).getTime() >= new Date(String(args[1])).getTime());
              break;
            case 'order':
              query.order = [String(args[0]), (args[1] as { ascending?: boolean } | undefined)?.ascending !== false];
              break;
            case 'limit':
              query.limit = Number(args[0]);
              break;
            default:
              break;
          }
          return builder(query);
        };
      },
    });
  }

  return {
    supabaseMock: {
      from: (table: string) => builder({ table, filters: [], order: null, limit: Infinity, selectText: '', error: null }),
    },
    loggerMock,
    roleState,
    crmIntegrationState,
    callCRMIntegrationMock,
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/logger', () => ({ log: loggerMock, getLogger: () => loggerMock }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: roleState.isSupervisor, roles: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => crmIntegrationState.enabled }));
vi.mock('@/lib/crmIntegration', () => ({ callCRMIntegration: callCRMIntegrationMock }));
vi.mock('@/hooks/system/useSearchHistory', () => ({
  useSearchHistory: () => ({
    history: [],
    addToHistory: vi.fn(),
    removeFromHistory: vi.fn(),
    clearHistory: vi.fn(),
  }),
}));

function renderBusca() {
  render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
  return screen.getByPlaceholderText(/Buscar mensagens/i);
}

/** Digita o termo com `#` e seleciona a tag pela sugestão. */
async function buscarComTag(input: HTMLElement, termo: string, tagQuery: string, tagName: string) {
  fireEvent.change(input, { target: { value: `${termo}#${tagQuery}` } });
  const sugestao = await screen.findByRole('button', { name: tagName });
  fireEvent.click(sugestao);
}

describe('R2-INB-020 — filtro por tag na busca global', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleState.isSupervisor = false;
    crmIntegrationState.enabled = false;
    localStorage.clear();
  });

  it('acha o contato marcado mesmo quando ele é o 11º da ordem alfabética e a tag existe em muitos contatos', async () => {
    const input = renderBusca();

    await buscarComTag(input, '', 'v', 'VIP');

    // Sem a correção de refazer, a lista de IDs de uma tag comum estoura a URL
    // antes de a consulta de contatos devolver o resultado.
    expect(await screen.findByText('Zara Vip')).toBeInTheDocument();
  });

  it('limita as mensagens aos contatos que carregam a tag sem enviar lista de IDs', async () => {
    const input = renderBusca();

    await buscarComTag(input, 'mensagem ', 'v', 'VIP');

    await waitFor(() => expect(screen.getByText('1 resultado')).toBeInTheDocument());
    expect(screen.getByText('Conversa com Zara Vip')).toBeInTheDocument();
    expect(screen.queryByText('Conversa com Ana 01')).not.toBeInTheDocument();
  });

  it('limita as transcrições aos contatos que carregam a tag sem enviar lista de IDs', async () => {
    const input = renderBusca();

    await buscarComTag(input, 'reuniao ', 'v', 'VIP');

    await waitFor(() => expect(screen.getByText('1 resultado')).toBeInTheDocument());
    expect(screen.getByText('Áudio de Zara Vip')).toBeInTheDocument();
    expect(screen.queryByText('Áudio de Ana 01')).not.toBeInTheDocument();
  });

  it('registra erro da consulta local em vez de engolir a falha como resultado vazio silencioso', async () => {
    const input = renderBusca();

    fireEvent.change(input, { target: { value: 'quebra-banco' } });

    await waitFor(() => expect(loggerMock.error).toHaveBeenCalledWith(
      'Search messages error:',
      expect.objectContaining({ message: 'falha simulada em messages' }),
    ));
  });

  it('não deixa falha/escopo vazio da pré-busca de tag esconder resultado de CRM', async () => {
    roleState.isSupervisor = true;
    crmIntegrationState.enabled = true;
    const input = renderBusca();

    await buscarComTag(input, 'clientecrm ', 'c', 'CRM');

    expect(await screen.findByText('Cliente CRM')).toBeInTheDocument();
    expect(callCRMIntegrationMock).toHaveBeenCalledWith('rpc', expect.objectContaining({
      rpc: 'search_contacts_advanced',
    }));
  });
});
