import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * TRA-010 / BACKLOG_VERIFICADO #178 (P2) — resíduos da remoção do módulo
 * "Etiquetas" (`view=tags`). O módulo foi removido, mas sobraram pontas soltas:
 *
 *   1. `TagsEmptyState` continuava definido e reexportado, sem consumidor;
 *   2. o comentário do barril `hooks/crm` ainda ensinava `useTags` (hook removido);
 *   3. o inventário de produto (`featuresSectionsData`) listava as tabelas LOCAIS
 *      removidas (`tags`, `contact_tags`) em vez de distinguir o modelo vigente:
 *      `contacts.tags` (array), `ai_conversation_tags` (local) e
 *      `contact_tags_ext` (contrato EXTERNO do CRM — não é para remover);
 *   4. o cabeçalho do plano de remoção ainda dizia "Nada foi removido ainda".
 *
 * O teste LÊ os fontes: é ele que segura o conserto no lugar.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const BARREIS_EMPTY_STATE = [
  'src/components/ui/empty-states.tsx',
  'src/components/ui/contextual-empty-states.tsx',
  'src/components/ui/empty-states/ConvenienceExports.tsx',
];

describe('resíduos da remoção de Etiquetas (TRA-010)', () => {
  it('não define nem reexporta TagsEmptyState', () => {
    for (const file of BARREIS_EMPTY_STATE) {
      expect(read(file), file).not.toMatch(/TagsEmptyState/);
    }
  });

  it('o contexto "tags" dos empty-states foi embora', () => {
    expect(read('src/components/ui/empty-states/ContextualEmptyState.tsx')).not.toMatch(/'tags'/);
    expect(read('src/components/ui/empty-states/contextConfigs.tsx')).not.toMatch(/^\s{2}tags: \{/m);
  });

  it('o barril de hooks/crm não ensina hook removido (useTags)', () => {
    expect(read('src/hooks/crm/index.ts')).not.toMatch(/useTags/);
  });

  it('o inventário distingue contacts.tags, ai_conversation_tags e contact_tags_ext', () => {
    const inventario = read('src/components/docs/featuresSectionsData.ts');

    expect(inventario).toMatch(/contacts\.tags/);
    expect(inventario).toMatch(/"ai_conversation_tags"/);
    expect(inventario).toMatch(/contact_tags_ext/);
    // As tabelas LOCAIS removidas não podem voltar ao inventário.
    expect(inventario).not.toMatch(/"contact_tags"/);
    expect(inventario).not.toMatch(/"tags"/);
  });

  it('o cabeçalho do plano não afirma mais "Nada foi removido ainda"', () => {
    const plano = read('docs/audits/PLANO_REMOCAO_ETIQUETAS_100_ETAPAS_2026-09-27.md');
    expect(plano).not.toMatch(/Nada foi removido ainda/);
  });

  it('o plano não expõe identificador de projeto Supabase', () => {
    const plano = read('docs/audits/PLANO_REMOCAO_ETIQUETAS_100_ETAPAS_2026-09-27.md');
    expect(plano).not.toMatch(/\b[a-z]{20}\b/);
  });
});
