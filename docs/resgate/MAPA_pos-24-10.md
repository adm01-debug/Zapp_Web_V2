# MAPA — delta desde 24/10 (gerado 2026-11-01)

Base: `origin/main` = `532aa09bae`. Fonte anterior (somente comparacao): `~/_arquivo/resgate/resgate-zapp-2026-10-24/` (MAPA de 24/10, 4.247 branches).

## O que mudou desde 24/10
- Branches locais: **4.268** hoje (24/10: 4.247, +21). 83 nomes novos, 62 sumiram. Das 83 novas, 24 ja estao no GitHub e **59 eram so locais**.
- Tags `resgate/*` no GitHub: 2.329 -> **2.390** (+61 em 01/11: 59 branches novas, 1 commit da quarentena `c96d8009`, 1 tag de 5 arquivos nao commitados do clone principal). Nenhuma branch/PR nova; so tags.
- PR de documentacao de 24/10 (#2220) foi mergeada em 24/10.

## Classificacao das 59 branches novas so-locais
| Classe | Qtd |
|---|---|
| SO LOCAL | 20 |
| PARCIAL | 5 |
| LIXO | 34 |

Criterio (heuristica, **nao verificada por teste/build**): LIXO = sem commit proprio, conteudo identico a main ou so docs/manifestos; PARCIAL = parte dos commits ja na main por patch-id; SO LOCAL = restante, com arquivo de codigo diferente da main. Nenhum ALIAS (59 tips unicos) e nenhum JA NO GITHUB (filtrados antes).

## Itens com possivel conteudo util (SO LOCAL + PARCIAL)
| classe | branch | commits | arq. codigo | assunto |
|---|---|---|---|---|
| PARCIAL | `codex/consolida-conexao-padrao-tipos` | 1 | 1 | Merge remote-tracking branch 'origin/main' into codex/consolida-conexao-padrao-t |
| PARCIAL | `codex/consolida-conversa-reabertura-tipos` | 1 | 1 | Merge remote-tracking branch 'origin/main' into codex/consolida-conversa-reabert |
| PARCIAL | `codex/consolida-emoji-uso-tipos` | 1 | 1 | Merge remote-tracking branch 'origin/main' into codex/consolida-emoji-uso-tipos |
| PARCIAL | `codex/consolida-p053-ledger-20261029` | 1 | 1 | docs(reconciliation): repara integridade do ledger P053 |
| PARCIAL | `codex/fixa-docs-deploy-edge-20261029` | 1 | 1 | docs(deploy): alinha orientacoes ao fluxo edge atual |
| SO LOCAL | `claude/feat-a11y-primitivos-ui-261024-1650` | 1 | 2 | fix(ui): aria-busy no botao em carregamento e ilustracoes decorativas fora da ar |
| SO LOCAL | `claude/feat-metas-seletor-periodo-261024-1743` | 1 | 4 | feat(metas): seletor Hoje/Semana/Mês na aba Metas, título por período e skeleton |
| SO LOCAL | `claude/feat-modal-nova-tarefa-painel-261024-1336` | 5 | 2 | fix(tarefas): modal Nova tarefa reabre com o rascunho quando o INSERT falha |
| SO LOCAL | `claude/feat-talkx-segmentos-filtros-261024-1753` | 1 | 2 | feat(talkx): filtros, paginacao persistida e URL sync da biblioteca de segmentos |
| SO LOCAL | `claude/fix-ci-reativar-suites-261016-1530` | 1 | 1 | merge main; node-scripts roda 7 suítes offline que estavam só na allowlist |
| SO LOCAL | `claude/fix-notify-names-ga10-ga02-261017-0900` | 1 | 1 | merge main; GA02 compara o CLAUDE.md com a main (no CI o HEAD é o próprio arquiv |
| SO LOCAL | `claude/fix-unit-tests-main-261025-0825` | 96 | 38 | fix(db): restaura policies security_alerts_self_select e talkx_blacklist_no_dele |
| SO LOCAL | `claude/radar-telas-fases-4-6-301030` | 2 | 29 | feat(copilot): telas do RADAR Fases 4–6 sobre o esquema atual |
| SO LOCAL | `claude/w32-w94-migrations-concurrency` | 5 | 2 | merge main; W94 fica com a concurrency da main; W32 testa de verdade e não troca |
| SO LOCAL | `claude/w39-w49-w50-ci-cleanup` | 2 | 2 | merge main; W39 lê a versão do Playwright do bun.lock; meta-teste pega pino em r |
| SO LOCAL | `claude_juca/practical-rubin-8xnw0u` | 3 | 1 | merge main; useCustomEmojis.upload.test fica com o mock da main |
| SO LOCAL | `codex/consolida-contatos-fab` | 6 | 2 | test(contatos): prova toque no canto do botão verde no navegador |
| SO LOCAL | `codex/consolida-sentimento-trend-tipos` | 3 | 1 | refactor(sentimento): usa retorno tipado sem cast na tendência |
| SO LOCAL | `codex/consolidacao-baseline-20261101` | 2 | 2 | fix(ui): remove lint novo no telefone e nas configuracoes |
| SO LOCAL | `codex/fix-typecheck-baseline-20261101` | 1 | 2 | fix(types): corrige erros de JSX e filtro da inbox |
| SO LOCAL | `codex/reconcile-live-migration-sources-20261029` | 3 | 2 | Merge remote-tracking branch 'origin/main' into codex/reconcile-live-migration-s |
| SO LOCAL | `codex/replay-image-ghcr-20261030` | 2 | 1 | test(ci): expect replay image GHCR mirror |
| SO LOCAL | `importado/local/hermes-workspaces__.integra__fase2` | 1849 | 775 | importado de /home/joaquim_ataides/hermes-workspaces/.integra/fase2 (integra/fas |
| SO LOCAL | `importado/local/projetos___a-processar__ZAPP_WEB_V2_LOCAL__Zapp_Web_V2` | 7 | 1 | importado de /home/joaquim_ataides/projetos/_a-processar/ZAPP_WEB_V2_LOCAL/Zapp_ |
| SO LOCAL | `importado/local/quarentena-zapp-2026-10-24__clone-55GB-A-PROCESSAR__n142-banco-leitura-reacoes-espelho-ci-26101418239f52` | 1 | 21 | importado de /home/joaquim_ataides/quarentena-zapp-2026-10-24/clone-55GB-A-PROCE |

Lista completa com arquivos: `classes_pos-24-10.tsv` (mesma pasta).

## NAO VERIFICADO
- **Validade contra a main de hoje**: "difere da main" nao distingue trabalho que a main ja absorveu por squash/reescrita. Isso vale em especial para `claude/feat-*-261024-*` (C019/C097/C297/C303/C130/C011/C098/C007/C121, ja integradas pelo resgate de 27/10) e as branches `codex/consolida-*`.
- Vereditos por LLM, clusters (Jaccard) e patch-id contra todos os refs: **NAO FEITO** para este delta.
- `importado/local/*` (3 branches, uma com 1.849 commits): copias de checkouts locais; nao analisadas por conteudo.
- Arvores sujas e clones em quarentena: **nao subidos por decisao**; so o commit `c96d8009` (toca `.github/workflows/e2e-logado.yml`; so tag, sem PR) e 5 arquivos do clone principal subiram.
- A gamificacao (`creditMiniGameXp`) na tag `resgate/pos-24-10/nao-commitado/clone-principal-5-arquivos` foi **descartada de proposito** (docs/consolidacao): nao reintegrar.

## Como buscar
```bash
git fetch origin "refs/tags/resgate/*:refs/tags/resgate/*"
git tag -l "resgate/pos-24-10/*"
```

## Validade contra a main de hoje (leitura, 2026-11-01)
Metodo: para cada arquivo de codigo (sem docs/manifestos) o diff `merge-base..tip` e testado contra a arvore da main com `git apply --check`: reverso aplica = **absorvido**; direto aplica = **ausente na main**; nenhum dos dois = **divergente** (main alterou o mesmo trecho). Tambem `git rev-list --cherry-pick --right-only --no-merges` (coluna cherry). Nao e teste de build.

Resultado nos 25 itens: **10 absorvidos**, **8 divergentes**, **7 com conteudo ausente na main**.

| veredito | branch | cherry | arq. codigo | abs/aus/div | exemplos ausentes |
|---|---|---|---|---|---|
| ABSORVIDO | `claude/feat-a11y-primitivos-ui-261024-1650` | 1 | 4 | 4/0/0 |  |
| ABSORVIDO | `claude/fix-ci-reativar-suites-261016-1530` | 1 | 2 | 2/0/0 |  |
| ABSORVIDO | `claude/fix-notify-names-ga10-ga02-261017-0900` | 1 | 2 | 2/0/0 |  |
| ABSORVIDO | `claude/w32-w94-migrations-concurrency` | 5 | 1 | 1/0/0 |  |
| ABSORVIDO | `claude/w39-w49-w50-ci-cleanup` | 2 | 3 | 3/0/0 |  |
| ABSORVIDO | `claude_juca/practical-rubin-8xnw0u` | 3 | 2 | 2/0/0 |  |
| ABSORVIDO | `codex/consolida-conexao-padrao-tipos` | 0 | 2 | 2/0/0 |  |
| ABSORVIDO | `codex/consolida-emoji-uso-tipos` | 0 | 2 | 2/0/0 |  |
| ABSORVIDO | `codex/consolida-p053-ledger-20261029` | 0 | 1 | 1/0/0 |  |
| ABSORVIDO | `codex/replay-image-ghcr-20261030` | 2 | 4 | 4/0/0 |  |
| DIVERGENTE | `claude/feat-modal-nova-tarefa-painel-261024-1336` | 5 | 33 | 31/0/2 |  |
| DIVERGENTE | `claude/feat-talkx-segmentos-filtros-261024-1753` | 1 | 3 | 2/0/1 |  |
| DIVERGENTE | `claude/fix-unit-tests-main-261025-0825` | 96 | 166 | 149/0/17 |  |
| DIVERGENTE | `codex/consolida-contatos-fab` | 6 | 13 | 11/0/2 |  |
| DIVERGENTE | `codex/consolida-conversa-reabertura-tipos` | 0 | 2 | 1/0/1 |  |
| DIVERGENTE | `codex/consolida-sentimento-trend-tipos` | 3 | 3 | 2/0/1 |  |
| DIVERGENTE | `codex/fixa-docs-deploy-edge-20261029` | 0 | 2 | 1/0/1 |  |
| DIVERGENTE | `codex/reconcile-live-migration-sources-20261029` | 3 | 3 | 2/0/1 |  |
| SOBRA | `claude/feat-metas-seletor-periodo-261024-1743` | 1 | 4 | 0/4/0 | `src/components/dashboard/GoalsDashboard.tsx`, `src/components/dashboard/__tests__/GoalsDashboard.test.tsx`, `src/components/dashboard/goals/GoalsTable.tsx` |
| SOBRA | `claude/radar-telas-fases-4-6-301030` | 2 | 29 | 0/28/1 | `scripts/db-audit/realtime-publication-baseline.json`, `src/components/inbox/chat/ChatInputArea.tsx`, `src/components/inbox/copilot/BrindeMeter.tsx` |
| SOBRA | `codex/consolidacao-baseline-20261101` | 2 | 2 | 0/2/0 | `src/components/ui/phone-input.tsx`, `src/hooks/system/useUserSettings.ts` |
| SOBRA | `codex/fix-typecheck-baseline-20261101` | 1 | 2 | 0/2/0 | `src/components/queues/QueueAlertsDisplay.tsx`, `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` |
| SOBRA | `importado/local/hermes-workspaces__.integra__fase2` | 1849 | 3867 | 3171/5/691 | `src/components/inbox/contact-details/ConversationMemorySection.tsx`, `src/components/inbox/contact-details/__tests__/ConversationMemorySection.test.tsx`, `src/hooks/crm/__tests__/useContactChangeLog.test.tsx` |
| SOBRA | `importado/local/projetos___a-processar__ZAPP_WEB_V2_LOCAL__Zapp_Web_V2` | 7 | 4 | 3/1/0 | `scripts/edge-deploy/resolve-rollback-ref.mjs` |
| SOBRA | `importado/local/quarentena-zapp-2026-10-24__clone-55GB-A-PROCESSAR__n142-banco-leitura-reacoes-espelho-ci-26101418239f52` | 1 | 25 | 7/3/15 | `src/components/inbox/tabs/journey/motion/__tests__/Collapse.test.tsx`, `src/components/inbox/tabs/journey/motion/__tests__/HighlightPulse.test.tsx`, `src/components/inbox/tabs/journey/motion/__tests__/useCountUp.test.tsx` |

NAO VERIFICADO: se o conteudo "ausente" ainda e desejado (pode ter sido rejeitado de proposito); se o "divergente" traz algo alem da versao da main; as 3 `importado/local/*` so por diff (sem leitura dos 1.849 commits). Os 10 absorvidos podem ser descartados do ponto de vista de perda de trabalho.

## Decisoes do coordenador (2026-11-01)
- `codex/consolidacao-baseline-20261101`: coberto pela PR #2477 (absorvido em voo). Nao vira PR.
- `claude/radar-telas-fases-4-6-301030`: RADAR entregue pela branch `claude/feat-radar-motor-telas-261101-1330` (outra thread). Coberto. Nao tocar.
- `claude/feat-metas-seletor-periodo-261024-1743`: candidato; sobrepoe o C130 da #2468. Arquivos: `src/components/dashboard/GoalsDashboard.tsx`, `src/components/dashboard/__tests__/GoalsDashboard.test.tsx`, `src/components/dashboard/goals/GoalsTable.tsx`, `src/hooks/analytics/useGoalsDashboard.ts`. Sem PR.
- Candidatos documentados (sem PR): as 3 `importado/local/*` (os 691 arquivos divergentes do fase2 nao entram) e `codex/fix-typecheck-baseline-20261101`.
- Os 8 divergentes: apenas documentados; nenhum vira PR agora.
