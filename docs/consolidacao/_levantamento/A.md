# Local A — clone principal

Leitura em 28/10/2026. Repositório `adm01-debug/Zapp_Web_V2`, branch `dia/2026-10-23`, commit `3024ca92c70638c2b315ebe9992eb85bc0c02521` (24/10/2026, `fix(tests): tipa importOriginal nos mocks de framer-motion (TS2698)`). A branch existe em `origin/dia/2026-10-23`. Os índices de arquivos da main e das 215 entradas locais foram atualizados para `7cacbe2f39845ca600c2dd18a4d30f70f03c217e`. O baseline de testes foi medido no SHA anterior `653f3d3304eec342a4360fd14d1b0c1d45d1f202`; a main avançou depois da medição.

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 7.832 arquivos de `origin/main` | Código e documentos | A / `origin/main` | Sim | Não | Todas | JÁ ESTÁ NA MAIN | Baixa |
| 3 commits próprios da branch do dia | Testes, contatos | A / `dia/2026-10-23` | Não por patch-id | Sim, 143 arquivos no conjunto da branch | Mocks de Framer Motion e filtro de período de contatos | INTEGRAR após revisão do diff contra a main atual | Alta |
| 215 entradas no `git status --porcelain` | 195 de conteúdo igual, 16 de conteúdo diferente, 4 arquivos novos/metadados | A / árvore e índice locais | 195 já iguais | 16 exigem revisão; 3 metadados `Zone.Identifier` e `.cursor/mcp.json` ficam fora do produto | Várias | Ver `A-pendentes.tsv` | Alta |
| 4.266 branches locais | Referências Git | A / `.git/refs` ou packed refs | 21 são ancestrais de `origin/main`; as demais exigem comparação por conteúdo, pois a main usa squash | Potencialmente | Várias | Ver `A-branches.tsv` | Alta |
| 13 stashes | Alterações guardadas | A / `git stash` | Indeterminado | Sim, pelo menos `stash@{0}` tem mudanças de teste citadas em handoff | Testes/e2e e outras | TERMINAR, preservar e comparar antes de qualquer limpeza | Alta |

Os arquivos `A-main.tsv`, `A-pendentes.tsv`, `A-branches.tsv` e `A-stashes.tsv` registram cada item e a decisão proposta. Os 195 arquivos de conteúdo igual na árvore suja são sobretudo alterações locais de modo de arquivo; o `git status` sozinho não indica código novo. Os 16 arquivos com conteúdo diferente incluem `useSentimentData.ts`, gamificação, autenticação, dois handlers de Edge Function, scripts e componentes. Foram classificados como `TERMINAR` até revisão individual, pois alguns podem ser variantes já incorporadas à main por outro commit.

Commits de `origin/main..HEAD`:

1. `872785b982` — converte 139 mocks de Framer Motion para `importOriginal`.
2. `b5fd451ebe` — traz a main para a branch do dia (merge; não é funcionalidade independente).
3. `4e323ed8a8` — corrige filtro de período em contatos e teste de data.
4. `3024ca92c7` — tipa `importOriginal` nos mocks (TS2698).

Documentos de controle lidos no clone: `AGENTS.md`, `CLAUDE.md`, `ESTADO.md`, `FEATURE_REGISTRY.md`, `PENDENCIAS.md`, `HANDOFF_MISSION_10-10.md`, `RELATORIO_CI.md`, `TESTING_CONVENTION.md`, `CONTRIBUTING.md`. A tabela de `FEATURE_REGISTRY.md` na main medida contém **55 views** (45 Full, 10 Partial), apesar de seu resumo afirmar 56 (44 Full, 12 Partial); a guarda de documentação passou 9 testes e não detectou a divergência do resumo. A classificação técnica por importação de dados não prova que uma funcionalidade está concluída. `FEATURES.tsv` preserva as 55 linhas para verificação funcional. `ESTADO.md` lista 84 Edge Functions e 20 sem chamador no repositório. Os diretórios `.codex/`, `.agents/`, `inventario/`, `analise-prs/` e `qa/` já estão na main e têm registros históricos úteis; seus dados precisam ser revalidados contra o GitHub atual.

O grafo local `graphify-out/graph.json` tem 94.957 nós e identificou `docs/COMPLETE_SYSTEM_FEATURES.md` e `docs/FUNCTIONALITIES_INVENTORY.md` como fontes adicionais de funcionalidades. Ele foi usado somente para localização; não substitui a comparação com código e estado atual.
