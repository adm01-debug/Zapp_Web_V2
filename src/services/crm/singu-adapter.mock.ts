/**
 * MÓDULO SÓ-DEV/TESTE — adaptador de teste do Singu (nunca entra no bundle de
 * produção: ele só é alcançado pelo `import()` dinâmico dentro do ramo
 * `import.meta.env.DEV` de `singu-adapter.ts`).
 *
 * Chave das fixtures = id do contato do Zapp; valor = contrato único
 * `ContactSinguSummary`. Dados sintéticos: nada aqui vem de cliente real.
 * As fixtures canônicas do Singu chegam no CT-004 (que depende deste cartão) e
 * substituem a amostra abaixo; até lá esta amostra cobre os três casos que o
 * plano pede: informação completa, incompleta e muito longa.
 */
import type {
  ContactSinguSummary,
  ContactSinguSummaryMap,
  SinguAdapter,
  SinguContactRef,
} from '@/types/contactSingu';

/** Prefixo das chaves de teste — o teste de bundle procura este texto no pacote. */
const FIXTURE_KEY_PREFIX = 'fixture-singu';

/** Dados de teste do Singu, por id do contato do Zapp. */
export const SINGU_MOCK_FIXTURES: Record<string, ContactSinguSummary> = {
  /** Tudo preenchido. */
  [`${FIXTURE_KEY_PREFIX}-completo`]: {
    apelido: 'Exemplo Completo',
    cargo: 'Analista de Compras',
    departamento: 'Suprimentos',
    empresa: 'Empresa Exemplo Ltda',
    logo: 'https://exemplo.invalid/logo.png',
    ramo: 'Brindes e Presentes',
    uf: 'SP',
    vendedor: 'Vendedor Exemplo',
    ativo: true,
    diasSemComprar: 12,
    ultimoPedido: { data: '2026-09-15', valor: 1250.5 },
    rfmSegmento: 'champion',
    rfmScore: 5,
    totalPedidos: 27,
    valorTotal: 48320.9,
  },
  /** Cliente cujo Singu só devolveu a empresa: o resto vem ausente. */
  [`${FIXTURE_KEY_PREFIX}-incompleto`]: {
    empresa: 'Empresa Exemplo ME',
  },
  /** Valores muito longos, para ver o card no pior caso. */
  [`${FIXTURE_KEY_PREFIX}-longo`]: {
    apelido: 'Nome de tratamento absurdamente longo para testar o corte do card',
    cargo: 'Diretor de Compras, Suprimentos, Logística e Operações Brasil',
    departamento: 'Suprimentos e Logística Corporativa Brasil',
    empresa: 'Empresa Exemplo de Comércio Atacadista e Distribuição Brasil Ltda',
    ramo: 'Brindes, Presentes, Papelaria e Materiais de Escritório Corporativo',
    uf: 'SP',
    vendedor: 'Vendedor com Nome Completo Muito Longo Exemplo',
    ativo: false,
    diasSemComprar: 421,
    ultimoPedido: { data: '2025-08-01', valor: 987654.32 },
    rfmSegmento: 'hibernating',
    rfmScore: 1,
    totalPedidos: 3,
    valorTotal: 1234567.89,
  },
};

/** Adaptador de teste: devolve as fixtures e ignora o resto. */
export const mockAdapter: SinguAdapter = {
  kind: 'mock',

  async fetchSummaries(contacts: SinguContactRef[]): Promise<ContactSinguSummaryMap> {
    const summaries: ContactSinguSummaryMap = new Map();
    for (const contact of contacts) {
      const fixture = SINGU_MOCK_FIXTURES[contact.id];
      // Contato fora das fixtures = o Singu não devolveu nada para ele.
      if (fixture === undefined) continue;
      summaries.set(contact.id, { ...fixture });
    }
    return summaries;
  },
};
