import { describe, it } from 'vitest';

/**
 * Acesso e autoria das chamadas — asserções de comportamento do módulo de
 * Telefonia. Substitui `voip-security-gaps.test.ts` (etapa T07 do plano
 * `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`), que
 * listava lacunas mas não afirmava nada sobre o código.
 *
 * Os três primeiros casos dependem de código que ainda não existe e por isso
 * ficam como `it.todo` com a etapa dona — `expect(true).toBe(true)` fingiria
 * passar e é proibido neste diretório. Viram teste real quando a etapa fechar:
 *
 *  - `p_scope='all'` só sai do front com papel → T43/T45 (hook `useMyCalls`)
 *  - `set_call_agent_notes` é a única escrita de anotação → T13/T66
 *  - `notes` (metadado do provedor) nunca entra em payload de escrita → T13
 *
 * Os dois últimos `it.todo` são lacunas herdadas de `voip-security-gaps.test.ts`
 * que nenhuma etapa deste plano cobre; ficam registradas para não sumirem junto
 * com o arquivo apagado.
 */
describe('Telefonia — acesso e autoria', () => {
  it.todo('T43/T45: `useMyCalls` nunca envia `p_scope=\'all\'` quando o usuário não é admin/supervisor');
  it.todo('T13/T66: `set_call_agent_notes` é o único caminho de escrita de anotação humana');
  it.todo('T13: a coluna `notes` (metadado do provedor) nunca aparece em payload de escrita do front');
});

describe('Telefonia — lacunas conhecidas herdadas (não cobertas por este plano)', () => {
  it.todo('espera, transferência e conferência de chamada (fora do escopo das 100 etapas)');
  it.todo('enforcement de SRTP explícito nas opções do SessionDescriptionHandler');
});
