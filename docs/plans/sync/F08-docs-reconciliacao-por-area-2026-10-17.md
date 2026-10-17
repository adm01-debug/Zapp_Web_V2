# F08 — divergência de `docs/` entre a ponta do dia e `origin/main`, por área

- **Fases:** F08 (divergência de `docs/`/raiz/e2e/testes) + F23 (registro permanente).
- **Cartão:** `[SYNC20-15]`.
- **Medido nesta árvore** (`v2/sync20-15-docs-reconciliacao-registro-...`, base
  `dia/2026-10-17 = d723a90107`) contra `origin/main = a9b4d6c6fb`, com `git ls-tree` +
  `git diff --quiet` por arquivo. Somente leitura; nenhum `push`.

## Resultado de `docs/`

| Situação | Arquivos | Por área |
|---|---|---|
| só em `origin/main` | **41** | `audits` 22 · `copiloto` 8 · `ci` 3 · `adr` 2 · `tarefas` 2 · `design` 1 · `plans` 1 · `runbooks` 1 · `talkx` 1 |
| diferentes (mesmo caminho, conteúdo distinto) | **22** | raiz `docs/` 5 · `runbooks` 4 · `audits` 3 · `ia` 2 · `adr` 1 · `ci` 1 · `dashboard` 1 · `mapa` 1 · `migration` 1 · `multiplix` 1 · `plans` 1 · `talkx` 1 |
| só na ponta do dia | **0** | — |

Como **não existe arquivo só na ponta do dia**, a reconciliação de `docs/` não descarta nada:
os 41 entram como novidade e, nos 22 diferentes, o lado de `origin/main` é o mais novo. A
causa medida é a mesma do restante do lote: o HEAD de `origin/main` (16/10 15:59) é posterior
ao último commit da `dia` (15/10 17:32) — nos 952 arquivos diferentes do repositório,
`origin/main` é o mais novo em **952/952** (0 do lado do dia, 0 conflito real).

Os 5 documentos divergentes na raiz de `docs/`:
`COMPLETE_SYSTEM_FEATURES.md`, `DB-INVENTORY.md`, `DEPLOYMENT.md`,
`LGPD-RETENTION-POLICY.md`, `MIGRATIONS.md`.

## `ESTADO.md` (raiz do repositório — fora de `docs/`, atualizado por este cartão)

`ESTADO.md` mantém a tabela "quem dispara cada edge" e é cobrado pela guarda
`scripts/ci/docs-estado-registry-convention.unit.mjs`, que recalcula a tabela a partir do
código. Ele **não** estava entre os 22 de `docs/` (fica na raiz), mas estava desatualizado e
foi atualizado **só com fato provado**:

- **26 âncoras `arquivo:linha` apontavam para linha que não contém mais a edge** (o código
  andou). Todas foram recalculadas a partir do próprio código desta árvore; a lista de âncoras
  passa a apontar para o chamador real.
- `talkx-link` publicado como grupo **B** (outra edge); o chamador de front real é
  `src/hooks/integrations/useTalkXLinks.ts:56` (`TALKX_LINK_PATH = '/functions/v1/talkx-link'`)
  → grupo **A**. Totais do bloco `## Totais` ajustados (A 54 → 55, B 1 → 0; total 81).
- `create-user` continua grupo **A**: é chamada por `invokeEdge('create-user', ...)` em
  `src/components/admin/useAdminData.ts:334`. A descrição do grupo A passa a citar
  `invokeEdge` (wrapper central do front), como já faz a versão de `origin/main`.

### Prova (vermelho antes, verde depois)

Antes do ajuste, a guarda local deixava **2 testes vermelhos**: "cita só âncoras reais" (a
primeira âncora inválida era `useKnowledgeBase.ts:99`) e "publica o grupo do primeiro
chamador real" (`create-user`).

Depois do ajuste, na guarda local restou **1 vermelho**: o mesmo teste de grupo, e o motivo é
um defeito da **própria guarda local** — ela casa `invoke(` mas não `invokeEdge(`, então não
enxerga `create-user` como chamador de front e espera o grupo E. A guarda **de `origin/main`**
já reconhece `invokeEdge` (`invoke(?:Edge)?\(`) e, rodada nesta árvore, fica **100% verde nos
5 testes de `ESTADO.md`** (inclui o teste de grupo e o de âncoras). Ou seja: a tabela agora
está correta contra o código, e o vermelho remanescente é a guarda de `origin/main` que ainda
não foi reconciliada para cá — trabalho de CI, não deste cartão de documentação.

## Pendências que este cartão NÃO resolve (registradas, com dono)

- **Guarda `docs-estado-registry-convention.unit.mjs`** desta árvore: falta o reconhecimento de
  `invokeEdge` (1 linha) — é o que mantém 1 vermelho em `ESTADO.md`. A reconciliação dos
  scripts de CI é do cartão de CI do lote (`SYNC20-14`).
- **41 + 22 documentos de `docs/`**: a decisão é "vale a versão de `origin/main`"; trazer os
  arquivos para a `dia` é trabalho de integração do lote, não deste cartão (aqui só se mede e
  se registra).
