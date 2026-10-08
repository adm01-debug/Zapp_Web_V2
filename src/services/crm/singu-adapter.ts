/**
 * CT-002 — adaptador dos campos do Singu (contrato único do módulo Contatos).
 *
 * O dado real vem do lote já existente: `ExternalCRMService.getContact360Batch`
 * (edge `crm-integration`, ação `contactLookupBatch` → RPC
 * `get_companies_by_phones_batch`). Ele devolve um mapa por telefone; aqui o
 * resultado volta **pelo id do contato do Zapp** e já no contrato
 * `ContactSinguSummary`.
 *
 * O que o lote entrega hoje: empresa, logo, vendedor, ativo/inativo, total de
 * pedidos, valor total e RFM. Os outros campos do contrato (apelido, cargo,
 * departamento, ramo, UF, dias sem comprar e último pedido) ficam `null` até o
 * Singu ampliar o lote (CT-111) — a tela já renderiza o vazio sem quebrar.
 *
 * O adaptador de teste (`./singu-adapter.mock`, dados do CT-004) é carregado por
 * `import()` dinâmico DENTRO do ramo `import.meta.env.DEV`: no build de produção
 * o ramo é eliminado e o módulo do mock não entra no bundle — prova em
 * `__tests__/singu-adapter.bundle.test.ts`.
 */
import { ExternalCRMService } from '@/services/crm/external-crm.service';
import type {
  ContactSinguSummary,
  ContactSinguSummaryMap,
  SinguAdapter,
  SinguContactRef,
} from '@/types/contactSingu';

/** Item cru do lote (`get_companies_by_phones_batch`). */
interface RawSinguBatchEntry {
  company_name?: unknown;
  logo_url?: unknown;
  vendedor_nome?: unknown;
  cliente_ativado?: unknown;
  total_pedidos?: unknown;
  valor_total_compras?: unknown;
  rfm_segment?: unknown;
  rfm_score?: unknown;
}

/** Texto limpo, ou `null` quando vazio/ausente (nunca string vazia). */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Número finito, ou `null` (o Singu às vezes manda número como texto). */
function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Booleano, ou `null` — ausente NUNCA vira `false`. */
function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Só dígitos: é assim que o lote indexa o telefone. */
function onlyDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Chaves possíveis do contato no mapa do lote (limpa, com DDI 55 e original). */
function batchKeysFor(phone: string): string[] {
  const clean = onlyDigits(phone);
  if (clean === '') return [];
  const keys = [clean];
  if (!clean.startsWith('55') && clean.length <= 11) keys.push(`55${clean}`);
  if (phone !== clean) keys.push(phone);
  return keys;
}

/**
 * Converte um item cru do lote no contrato único. Item que não for objeto vira
 * um resumo todo `null`: campo ausente nunca quebra o mapeamento.
 */
export function mapSinguBatchEntry(raw: unknown): ContactSinguSummary {
  const entry = (raw !== null && typeof raw === 'object' ? raw : {}) as RawSinguBatchEntry;
  return {
    apelido: null, // o lote não devolve apelido
    cargo: null, // o lote não devolve cargo
    departamento: null, // o lote não devolve departamento
    empresa: textOrNull(entry.company_name),
    logo: textOrNull(entry.logo_url),
    ramo: null, // o lote não devolve ramo
    uf: null, // o lote não devolve UF
    vendedor: textOrNull(entry.vendedor_nome),
    ativo: booleanOrNull(entry.cliente_ativado),
    diasSemComprar: null, // o lote não devolve dias sem comprar
    ultimoPedido: null, // o lote não devolve último pedido (data/valor)
    rfmSegmento: textOrNull(entry.rfm_segment),
    rfmScore: numberOrNull(entry.rfm_score),
    totalPedidos: numberOrNull(entry.total_pedidos),
    valorTotal: numberOrNull(entry.valor_total_compras),
  };
}

/** Resultado da busca pelo contato no mapa do lote. */
interface BatchLookup {
  /** A chave existe no lote: `raw` pode ser `undefined`/`null` e ainda é um resultado. */
  found: boolean;
  raw: unknown;
}

/**
 * Acha o item do lote pelo telefone do contato. A PRESENÇA da chave decide: um
 * item vazio/nulo continua sendo um resultado (vira resumo todo nulo), enquanto
 * a chave ausente significa que o Singu não devolveu nada para o contato.
 */
function findBatchEntry(batch: Map<string, unknown>, phone: string): BatchLookup {
  for (const key of batchKeysFor(phone)) {
    if (batch.has(key)) return { found: true, raw: batch.get(key) };
  }
  return { found: false, raw: undefined };
}

/** Adaptador real: fala com o Singu pelo lote de CRM já existente. */
export const realAdapter: SinguAdapter = {
  kind: 'real',

  async fetchSummaries(contacts: SinguContactRef[]): Promise<ContactSinguSummaryMap> {
    const wanted = contacts.filter((contact) => typeof contact?.id === 'string' && contact.id.trim() !== '');
    const summaries: ContactSinguSummaryMap = new Map();
    if (wanted.length === 0) return summaries;

    // Falha do Singu sobe daqui de propósito: a tela precisa poder mostrar
    // "Singu indisponível" em vez de um resumo vazio com cara de dado real.
    const batch = await ExternalCRMService.getContact360Batch(
      wanted.map((contact) => ({ id: contact.id, phone: contact.phone })),
    );

    for (const contact of wanted) {
      const lookup = findBatchEntry(batch, contact.phone);
      if (!lookup.found) continue; // o Singu não devolveu nada para este contato
      summaries.set(contact.id, mapSinguBatchEntry(lookup.raw));
    }

    return summaries;
  },
};

/**
 * Adaptador em uso. Em dev/teste devolve o adaptador de teste (dados do CT-004);
 * em produção a única possibilidade é o `realAdapter`. O `import()` do mock
 * fica dentro do ramo `import.meta.env.DEV`, que o build troca por `false`:
 * o módulo do mock não é empacotado em produção.
 */
export async function getSinguAdapter(): Promise<SinguAdapter> {
  if (import.meta.env.DEV) {
    const { mockAdapter } = await import('./singu-adapter.mock');
    return mockAdapter;
  }
  return realAdapter;
}
