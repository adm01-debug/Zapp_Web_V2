/**
 * CT-002 — testa o contrato único dos campos do Singu.
 *
 * A cadeia é real: `realAdapter` → `ExternalCRMService.getContact360Batch` (o
 * serviço de verdade, com o telefone normalizado por ele) → contrato único.
 * Só a chamada à edge (`callCRMIntegration`) é dublada, com o payload cru que a
 * RPC `get_companies_by_phones_batch` devolve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callCRMIntegration = vi.hoisted(() => vi.fn());

vi.mock('@/lib/crmIntegration', () => ({ callCRMIntegration }));
vi.mock('@/lib/externalProxy', () => ({ queryExternalProxy: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ExternalCRMService } from '@/services/crm/external-crm.service';
import { getSinguAdapter, mapSinguBatchEntry, realAdapter } from '@/services/crm/singu-adapter';
import { SINGU_MOCK_FIXTURES, mockAdapter } from '@/services/crm/singu-adapter.mock';

/** Payload cru de um item completo do lote (`get_companies_by_phones_batch`). */
const FULL_ENTRY = {
  company_name: 'Empresa Exemplo Ltda',
  logo_url: 'https://exemplo.invalid/logo.png',
  vendedor_nome: 'Vendedor Exemplo',
  cliente_ativado: true,
  total_pedidos: 27,
  valor_total_compras: 48320.9,
  rfm_segment: 'champion',
  rfm_score: 5,
};

const RESUMO_VAZIO = {
  apelido: null,
  cargo: null,
  departamento: null,
  empresa: null,
  logo: null,
  ramo: null,
  uf: null,
  vendedor: null,
  ativo: null,
  diasSemComprar: null,
  ultimoPedido: null,
  rfmSegmento: null,
  rfmScore: null,
  totalPedidos: null,
  valorTotal: null,
};

/** A edge responde o lote indexado pelo telefone (só dígitos) do contato. */
function loteResponde(payload: Record<string, unknown>) {
  callCRMIntegration.mockResolvedValue({ data: payload });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('realAdapter — contrato único dos campos do Singu', () => {
  it('mapeia o que o Singu devolve e deixa nulo o que ele não devolve', async () => {
    loteResponde({ '5511988881111': FULL_ENTRY });

    const summaries = await realAdapter.fetchSummaries([
      { id: 'contato-1', phone: '+55 (11) 98888-1111' },
    ]);

    expect(summaries.get('contato-1')).toEqual({
      apelido: null,
      cargo: null,
      departamento: null,
      empresa: 'Empresa Exemplo Ltda',
      logo: 'https://exemplo.invalid/logo.png',
      ramo: null,
      uf: null,
      vendedor: 'Vendedor Exemplo',
      ativo: true,
      diasSemComprar: null,
      ultimoPedido: null,
      rfmSegmento: 'champion',
      rfmScore: 5,
      totalPedidos: 27,
      valorTotal: 48320.9,
    });
  });

  it('devolve o resumo pelo id do contato do Zapp, não pelo telefone', async () => {
    loteResponde({ '5511988881111': FULL_ENTRY });

    const summaries = await realAdapter.fetchSummaries([
      { id: 'contato-1', phone: '+55 (11) 98888-1111' },
    ]);

    expect([...summaries.keys()]).toEqual(['contato-1']);
  });

  it('acha o dado com o telefone local sem DDI, com DDI e formatado', async () => {
    const variantes = [
      { chaveDoLote: '5511988881111', telefone: '5511988881111' },
      { chaveDoLote: '5511988881111', telefone: '+55 (11) 98888-1111' },
      { chaveDoLote: '5511988881111', telefone: '11988881111' },
      { chaveDoLote: '11988881111', telefone: '11988881111' },
      { chaveDoLote: '11988881111', telefone: '+55 (11) 98888-1111' },
    ];

    for (const { chaveDoLote, telefone } of variantes) {
      loteResponde({ [chaveDoLote]: FULL_ENTRY });
      const summaries = await realAdapter.fetchSummaries([{ id: 'contato-1', phone: telefone }]);
      expect(summaries.get('contato-1')?.empresa, `telefone ${telefone}`).toBe('Empresa Exemplo Ltda');
    }
  });

  it('deixa o contato FORA do mapa quando o Singu não devolveu nada para ele', async () => {
    loteResponde({ '5511988881111': FULL_ENTRY });

    const summaries = await realAdapter.fetchSummaries([
      { id: 'contato-1', phone: '+55 (11) 98888-1111' },
      { id: 'contato-sem-singu', phone: '+55 (11) 97777-2222' },
    ]);

    expect([...summaries.keys()]).toEqual(['contato-1']);
    expect(summaries.get('contato-sem-singu')).toBeUndefined();
  });

  it('item do lote vazio ou de tipo errado vira resumo todo nulo, sem erro', async () => {
    const casos: unknown[] = [{}, null, undefined, 'texto', 42, []];

    for (let indice = 0; indice < casos.length; indice += 1) {
      const caso = casos[indice];
      loteResponde({ '5511988881111': caso });
      const summaries = await realAdapter.fetchSummaries([
        { id: `contato-${indice}`, phone: '+55 (11) 98888-1111' },
      ]);
      expect(summaries.get(`contato-${indice}`), `caso ${String(caso)}`).toEqual(RESUMO_VAZIO);
      vi.clearAllMocks();
    }
  });

  it('normaliza texto e número sem inventar valor', async () => {
    loteResponde({
      '5511988881111': {
        company_name: '  Empresa Com Espaço  ',
        logo_url: '',
        vendedor_nome: '   ',
        cliente_ativado: 'sim',
        total_pedidos: '27',
        valor_total_compras: '48320.9',
        rfm_segment: '',
        rfm_score: 'nao-numero',
      },
    });

    const summaries = await realAdapter.fetchSummaries([
      { id: 'contato-1', phone: '+55 (11) 98888-1111' },
    ]);

    expect(summaries.get('contato-1')).toEqual({
      ...RESUMO_VAZIO,
      empresa: 'Empresa Com Espaço',
      totalPedidos: 27,
      valorTotal: 48320.9,
    });
  });

  it('não chama o Singu quando não há contato para enriquecer', async () => {
    const spy = vi.spyOn(ExternalCRMService, 'getContact360Batch');

    const summaries = await realAdapter.fetchSummaries([]);

    expect(summaries.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('propaga a falha do Singu: a tela precisa poder dizer "Singu indisponível"', async () => {
    callCRMIntegration.mockRejectedValue(new Error('offline'));

    await expect(realAdapter.fetchSummaries([{ id: 'contato-1', phone: '+5511988881111' }]))
      .rejects.toThrow('Todos os lotes');
  });

  it('mapSinguBatchEntry é o mapeamento único do contrato (15 campos)', () => {
    expect(Object.keys(mapSinguBatchEntry(FULL_ENTRY)).sort()).toEqual([
      'apelido',
      'ativo',
      'cargo',
      'departamento',
      'diasSemComprar',
      'empresa',
      'logo',
      'ramo',
      'rfmScore',
      'rfmSegmento',
      'totalPedidos',
      'uf',
      'ultimoPedido',
      'valorTotal',
      'vendedor',
    ]);
  });
});

describe('escolha do adaptador', () => {
  it('em dev/teste o adaptador é o de teste (dados das fixtures)', async () => {
    const adapter = await getSinguAdapter();

    expect(adapter.kind).toBe('mock');
  });

  it('o adaptador de teste só devolve contatos que existem nas fixtures', async () => {
    const idsDasFixtures = Object.keys(SINGU_MOCK_FIXTURES);
    expect(idsDasFixtures.length).toBeGreaterThan(0);

    const summaries = await mockAdapter.fetchSummaries([
      ...idsDasFixtures.map((id) => ({ id, phone: '+55 (11) 90000-0000' })),
      { id: 'contato-fora-das-fixtures', phone: '+55 (11) 97777-2222' },
    ]);

    expect([...summaries.keys()].sort()).toEqual([...idsDasFixtures].sort());
    expect(summaries.get(idsDasFixtures[0])).toEqual(SINGU_MOCK_FIXTURES[idsDasFixtures[0]]);
  });
});
