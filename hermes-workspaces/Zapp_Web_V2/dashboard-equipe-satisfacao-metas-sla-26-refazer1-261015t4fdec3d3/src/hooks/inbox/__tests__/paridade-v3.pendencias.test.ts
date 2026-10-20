/**
 * Paridade V3 -> V2 (doc 06) — PENDÊNCIAS SEM CÓDIGO INTEGRADO NA CÓPIA.
 *
 * Não são testes que fingem: cada linha é um `it.todo` nomeado com o CARTÃO (ou o
 * achado/decisão) que vai entregar o comportamento. Quando o cartão integrar, o
 * todo vira teste real. Isto trava a lacuna para ela não sumir em silêncio.
 */
import { describe, it } from 'vitest';

describe('Paridade V3 -> V2 (doc 06) — itens aguardando cartão integrado', () => {
  it.todo(
    'PK-01 (hugo): mensagem nova numa conversa ARQUIVADA — reabre/notifica em vez de sumir da lista',
  );
  it.todo(
    'PK-01 (hugo): arquivar (lote e unitário) NÃO pode mexer em assigned_to — hoje useInboxBulkActions/useConversationActions só fazem assigned_to: null',
  );
  it.todo(
    'PD-84/QL2 (hugo): seleção em lote descarta id que não é UUID (isValidUUID nos 3 métodos de seleção)',
  );
  it.todo(
    'P2-6 (DECISÃO do dono, sem cartão): pipeline de filtros esconde o canal sem permissão (inbox.view_whatsapp / view_instagram / view_chat) — a V2 não tem essas permissões e o dono ainda não decidiu',
  );
  it.todo(
    'DL1 (done, não integrado) + PD-92 (iris): deep link ?contact=/?message=/?msg= — a V2 só tem evento em memória + fallback global legado, não lê a URL',
  );
  it.todo(
    'C8 (sem cartão): debounce do save de configurações (useDebouncedSaveSettings) — a V2 salva só no clique do botão, não há debounce a testar',
  );
  it.todo(
    'PK-16 (hugo): insert de compra com erro mostra feedback — hoje ContactPurchasesPanel engole o erro (só trata !error)',
  );
  it.todo(
    'PK-07 (hugo): useNextBestAction com VÁRIAS linhas de SLA — hoje lê uma única linha de conversation_sla por contato',
  );
  it.todo(
    'PK-05 (workersql): política de UPDATE do sussurro / marcação de lido limita ao autor',
  );
  it.todo(
    'PK-15 (workersql): RLS de contact_purchases pela regra nova do cartão (prova de enforcement com papel real em scripts/db-audit)',
  );
});
