# Registro de resíduos e candidatos à revisão

Baseline: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Este registro substitui as hipóteses preliminares pelas classificações e evidências coletadas. **Nenhum item está autorizado para exclusão; nenhum dos 84 candidatos globais foi classificado como `DEAD_CONFIRMED`.** [Classificação por caminho](evidence/residue-candidates.json).

## 1. Universo e unidade de contagem

A varredura inventariou **4.065 arquivos** e analisou **2.394 arquivos pelo parser TypeScript**, sem erros de parse. O conjunto de **84 arquivos sem importador estático** é um filtro estrutural, não uma lista de arquivos inúteis. Há também um registro dirigido com **17 entradas Team Chat**, que inclui caminhos, objetos SQL e histórico de migrations. Os conjuntos se sobrepõem e usam unidades diferentes; não devem ser somados como 101 arquivos candidatos. [Inventário](evidence/inventory-summary.json), [resumo AST](evidence/ast-summary.json) e [registro Team Chat](evidence/teamchat_residue_candidates.json).

Os estados de tarefa, a disposição do código e a confiança para exclusão são dimensões separadas. `PARTIAL` pode descrever uma funcionalidade cujo código deve ser preservado; `LEGACY_USED` exige migração de consumidores. Rótulos como `UNUSED_BARREL_CANDIDATE` refinam o diagnóstico estrutural sem constituir autorização de remoção. [Taxonomia oficial](STATUS_TAXONOMY.md).

## 2. Classificação dos 84 arquivos

| Classe registrada | Total | Confiança | Exemplo e decisão |
|---|---:|---|---|
| `DEAD_CANDIDATE` | 30 | `DELETE-B` | `src/components/BulkActionsBar.tsx`, `src/components/SearchInput.tsx`: investigar consumidores e responsabilidade |
| `UNUSED_BARREL_CANDIDATE` | 28 | `DELETE-B` | `src/components/inbox/chat/index.ts`, `src/components/mobile/index.ts`: revisar reexports e contrato de importação |
| `UNWIRED_PLANNED_FEATURE` | 10 | `DELETE-X` | `GroupManagementDialog.tsx`, `ParticipantStatsGraph.tsx`: preservar trabalho de integração planejado |
| `UNUSED_UI_PRIMITIVE_CANDIDATE` | 12 | `DELETE-D` | `src/components/ui/EmptyState.tsx`, `SkeletonList.tsx`: revisar propósito compartilhado antes de decidir |
| `ACTIVE_ENTRY_OR_CONFIGURATION` | 3 | `DELETE-X` | `src/main.tsx`, `src/test/setup.ts`, `src/vite-env.d.ts`: preservar |
| `TEST_SUPPORT_CANDIDATE` | 1 | `DELETE-D` | `src/test/mocks/auth.tsx`: verificar setup e consumidores de teste |
| **Total** | **84** | **0 `DELETE-A`** | **Sem exclusão autorizada** |

A fonte de nomes, razões e confiança é [residue-candidates.json](evidence/residue-candidates.json). As 30 entradas `DEAD_CANDIDATE` são candidatas a confirmação, não 30 arquivos comprovadamente mortos. As 28 entradas de barrel descrevem o módulo de reexports, sem provar que suas implementações exportadas sejam dispensáveis.

A evidência de importação cobre os imports e reexports reconhecidos no AST, inclusive imports dinâmicos literais. Permanecem relevantes entrypoints, configuração, registries, comandos, carregamento por nomes construídos, strings de RPC/tabela, eventos, estilos e consumidores externos. O [grafo TypeScript](evidence/import-graph.json.gz), os [pontos de chamada de banco/eventos](evidence/db-event-call-sites.json.gz) e o [Graphify](evidence/graphify_evidence_manifest.json) permitem aprofundar esses casos. Ausência em um grafo não satisfaz todos esses critérios.

## 3. Adjudicação dirigida de Team Chat

| Disposição do registro dirigido | Entradas | Tratamento |
|---|---:|---|
| `KEEP_ACTIVE_PLAN_PENDING_INTEGRATION` | 7 | Preservar componentes/hooks previstos e decidir integração ou sucessão |
| `CANDIDATE_RETIRE_AFTER_REVIEW` | 5 | Completar a investigação de consumidores antes de propor retirada |
| `REVIEW_RETIRE_AS_PAIRED_MAINTENANCE_UNIT` | 2 | Revisar script e teste consumidor em conjunto |
| `KEEP_ACTIVE_CONSUMER` | 2 | Preservar objetos SQL com consumidores atuais |
| `KEEP_IMMUTABLE_HISTORY` | 1 | Preservar o conjunto histórico de migrations |
| **Total de entradas** | **17** | **Nenhuma marcada `dead_confirmed`** |

Fonte: [teamchat_residue_candidates.json](evidence/teamchat_residue_candidates.json). A tabela é um recorte semântico que pode refinar a classificação estrutural global. Ela inclui agregados e objetos SQL, portanto seu total não é uma contagem de arquivos removíveis.

### Trabalho planejado que precisa ser preservado

As sete entradas são `GroupManagementDialog.tsx`, `ParticipantStatsGraph.tsx`, `TeamMessageItem.tsx`, `TeamPerformancePanel.tsx`, `TransferConversationDialog.tsx`, `src/hooks/team-chat/index.ts` e `useTeamTyping.ts`. A ausência de integração em uma interface ativa deixa pendências funcionais; não elimina a intenção dos planos. As listas F100 e TC100 ainda têm conflito explícito de autoridade e devem ser comparadas por conteúdo antes de qualquer descarte de implementação. [Registro dirigido](evidence/teamchat_residue_candidates.json), [correspondência F/TC](evidence/team_chat_f_tc_crosswalk.json) e [conflitos de autoridade](evidence/team_chat_plan_authority_conflicts.json).

### Candidatos que ainda exigem decisão

`TeamChatA11y.tsx`, `useTeamPresence.ts`, `useTeamUnreadCount.ts`, `src/i18n/team-chat.ts` e `src/styles/team-chat-tokens.css` não tiveram consumidor runtime comprovado no escopo revisado. Isso justifica investigação adicional de integração, estilos, configuração e consumidores externos. O resultado permanece `CANDIDATE_RETIRE_AFTER_REVIEW`; não há proposta de remoção aprovada. [Razões e referências por entrada](evidence/teamchat_residue_candidates.json).

### Consumidores que impedem uma conclusão de código morto

`scripts/team-chat-db-validate.unit.mjs` invoca `scripts/team-chat-db-validate.mjs`; o validator tem consumidor real fora de `src/`. Seu contrato está desatualizado, pode considerar erros HTTP como sucesso e realiza POST com credencial privilegiada. A decisão deve abranger os dois arquivos e preservar a verificação útil de sanitização de logs, caso ainda necessária. Isso é manutenção de ferramenta, não exclusão automática por falta de import em frontend. [Achado TC-012](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

As RPCs legadas `get_team_conversation_previews` e `get_team_unread_counts` continuam chamadas por `useTeamConversations`. Tabela e contratos legados de convites também têm consumidores. Remover esses objetos sem substituir chamadas, dados e permissões pode quebrar o módulo. [Registro de consumidores ativos](evidence/teamchat_residue_candidates.json) e [achado TC-008](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

## 4. Resíduos aparentes em outras superfícies

| Superfície | Classificação de trabalho | Evidência e consequência |
|---|---|---|
| Telefonia depreciada | `LEGACY_USED` para os consumidores comprovados | `useCalls` é importado por `TelefoniaView`, `PostCallSummary` e `SelectedCallPanel`; `CallDialog`, por `IncomingCallAlert`. `useCallHistory` tem consumidor de teste, sem importador de produto identificado nesse recorte |
| SQL arquivadas | `HISTORICAL_REQUIRED` / `DELETE-X` | São 22 arquivos, 15 em `_foreign/` e sete em `_superseded/`; preservar histórico e escopo |
| Scripts e workflows | `ACTIVE`, `LEGACY_USED` ou `UNKNOWN`, conforme consumidor | Verificar package scripts, workflows, testes que executam arquivos e runbooks, além dos imports |
| Código apenas gerado | `GENERATED`, quando origem e gerador estiverem demonstrados | Conferir o processo de regeneração e o contrato; não confundir divergência de snapshot com inutilidade |
| Relatos antigos de branches/worktrees | Evidência histórica datada | Não transportar contagens de uma máquina ou data anterior para este clone |

Fontes: [grafo de imports com origem, destino e linha](evidence/import-graph.json.gz), [relatório de Telefonia/IA/Dashboard](reports/modules/TELEFONIA_IA_DASHBOARD.md), [inventário de banco](evidence/database_surface_inventory.json), [contratos e guardas de CI](evidence/ci-static-guards.json), [auditoria Git](reports/git/GIT_AUDIT_COMPLETE_2026-10-03.md) e [issues históricas reconciliadas](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

As hipóteses iniciais sobre Tarefas — imports, índices, agregações e implementação de status — não são mantidas como decisões de exclusão sem prova específica no baseline. As pendências funcionais e de performance pertencem à reconciliação do módulo e devem ser avaliadas por comportamento e necessidade, sem transformar uma suspeita antiga em remoção automática. [Revisão dos demais módulos](reports/modules/OTHER_MODULES.md).

## 5. Branches e conteúdo em quarentena

O inventário atual contém **58 branches** e **197 commits exclusivos fora da main**, com comparação de grafo para todas as branches. Há 12 classificadas para preservar por PR aberta, 30 por PR fechada sem merge, sete cuja última PR foi incorporada mas cujo grafo ainda contém trabalho exclusivo, cinco sem PR, três ancestrais integradas e a baseline. O fechamento ou merge da última PR não é prova de equivalência de todo o conteúdo de uma branch reutilizada. [Métricas Git](evidence/git-metrics.json), [inventário de branches](evidence/branches.json) e [auditoria completa](reports/git/GIT_AUDIT_COMPLETE_2026-10-03.md).

A branch `claude/confident-babbage-ivgmmn`, head `0e283d06850a67739beee9cc623530619d9b2cad`, permanece em quarentena: **37 commits ahead, 687 behind e 87 caminhos alterados**. A PR #1151 foi fechada sem merge e seu head antecede 21 commits ainda existentes na branch. O registro separa 40 migrations espelhadas já recuperadas na main, 36 entradas de trabalho funcional, quatro propostas de remoção, quatro documentos históricos, um artefato gerado antigo e duas regressões de guardas. Esses 87 caminhos não são 87 novidades prontas para adoção. [Quarentena por arquivo](evidence/branch_quarantine.json).

As alterações de guardas incluem transformar falha de conexão em `SKIP` com exit 0 e substituir a baseline global por um conjunto reduzido Team Chat. Eventual resgate funcional exige revisão seletiva sobre base atual, preservando o contrato das guardas. Nenhum merge integral, cherry-pick em lote ou exclusão da branch está autorizado por este registro. [TC-014 e TC-015](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

## 6. Critério para alterar uma disposição

Cada mudança futura deve registrar o caminho ou objeto, SHA revisado, consumidores positivos e negativos, vínculo com planos, motivo da decisão e aceite proporcional ao risco. `DEAD_CONFIRMED` exige evidência suficiente de ausência de responsabilidade e de consumidores relevantes; `DELETE-A` ainda significa elegibilidade técnica para uma missão própria, não autorização implícita nesta auditoria. Dados desconhecidos, trabalho exclusivo e histórico necessário devem permanecer preservados. O procedimento está no [plano de limpeza segura](SAFE_CLEANUP_PLAN.md).
