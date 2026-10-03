# Code Truth — varredura estrutural de 2026-10-03

Baseline de código: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`, repositório `adm01-debug/Zapp_Web_V2`. Este documento consolida o inventário, a análise de dependências e as revisões dirigidas já realizadas. A atualização é documental; não executa testes adicionais nem altera código funcional.

## Resultado e limite da conclusão

A varredura cobriu os **4.065 arquivos versionados** do baseline e analisou **2.394 arquivos pelo parser TypeScript**, sem erros de parse. O filtro de dependências produziu **84 candidatos sem importador estático**, classificados individualmente. **Nenhum desses 84 foi promovido a `DEAD_CONFIRMED` ou autorizado para exclusão.** Há pontos de entrada ativos e funcionalidades ainda sem integração nesse conjunto. [Inventário integral](evidence/inventory-summary.json), [resumo AST](evidence/ast-summary.json) e [classificação dos candidatos](evidence/residue-candidates.json).

Ler e verificar os bytes de todos os arquivos assegura a cobertura do inventário. Isso não equivale a revisar semanticamente cada linha de código, cada migration ou cada patch histórico. A revisão de comportamento concentrou-se nos módulos e contratos registrados nos relatórios; onde há somente análise estrutural, a conclusão permanece estrutural. O estado atual de produção não foi certificado. [Limites do inventário](evidence/inventory-summary.json) e [revisão independente](reports/adversarial/INDEPENDENT_REVIEW_2026-10-03.md).

## 1. Cobertura reproduzível

| Medida | Resultado | O que a medida demonstra |
|---|---:|---|
| Arquivos versionados | 4.065 | Inventário do baseline, com leitura e hash de cada arquivo |
| Arquivos textuais / binários | 3.950 / 115 | Escopo de leitura estrutural; não classificação funcional |
| Divergências entre hash observado e blob esperado | 0 | Consistência da cópia analisada com o inventário Git |
| Arquivos analisados pelo parser TypeScript 5.9.3 | 2.394 | Cobertura sintática do conjunto selecionado |
| Arquivos com erro de parse | 0 | Parse válido; não é resultado de typecheck |
| Arestas de importação | 12.261 | Relações capturadas pela extração AST |
| Arestas internas resolvidas / não resolvidas | 7.454 / 0 | Resolução dos imports internos reconhecidos pelo extrator |
| Candidatos sem importador estático | 84 | Fila de revisão, incluindo falsos positivos funcionais |
| Chamadas candidatas de banco/eventos | 1.801 | Pontos para investigar consumidores por strings e eventos |

As métricas vêm do [inventário](evidence/inventory-summary.json), do [resumo AST](evidence/ast-summary.json), do [grafo de imports](evidence/import-graph.json.gz) e dos [pontos de chamada](evidence/db-event-call-sites.json.gz). Zero import interno não resolvido não cobre nomes construídos em runtime, clientes externos, configuração não analisada ou operações SQL indiretas.

Há 1.092 arquivos `.ts`, 1.141 `.tsx`, 871 `.sql`, 352 `.md`, 157 `.mjs` e 95 `.sh` no inventário geral. As 871 ocorrências SQL abrangem mais superfícies que migrations; a contagem específica de migrations é **801 = 779 ativas + 22 arquivadas**, detalhada em [Database Truth](DATABASE_TRUTH_STRUCTURAL_SWEEP_2026-10-03.md). Os conjuntos de extensão, parser e classificação por caminho têm critérios diferentes e não devem ser usados como contagens intercambiáveis. [Inventário por extensão](evidence/inventory-summary.json) e [inventário de banco](evidence/database_surface_inventory.json).

## 2. Graphify: extração concluída e escopo explícito

Graphify `0.9.68`, com suporte SQL, foi executado em ambiente isolado, sem instalação global, alteração de hooks ou chamadas LLM. A extração de código registrou **3.452 fontes, 19.319 nós e 49.910 arestas**, com zero tokens de entrada/saída e zero chamadas LLM. O loader de consultas apresenta 19.507 nós por acrescentar nós implícitos; os números oficiais do artefato são os serializados, 19.319. [Manifesto da extração](evidence/graphify_evidence_manifest.json) e [grafo preservado](evidence/graphify-graph.json.gz).

A consulta dirigida confirmou, por exemplo, a dependência `DepartmentWhatsAppView → useSaveDepartmentWhatsApp`. Isso prova uma ligação entre símbolos. A interface pode continuar inacessível por uma permissão ausente no componente pai. Graphify e o grafo TypeScript são evidências complementares; nenhum deles, isoladamente, prova alcance em runtime ou autoriza eliminar um arquivo. [Manifesto Graphify](evidence/graphify_evidence_manifest.json) e [achado TC-005](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

## 3. Adjudicação dos 84 candidatos

| Classificação do artefato | Quantidade | Confiança de exclusão | Tratamento atual |
|---|---:|---|---|
| `DEAD_CANDIDATE` | 30 | `DELETE-B` | Investigar consumidores e responsabilidade antes de qualquer proposta |
| `UNUSED_BARREL_CANDIDATE` | 28 | `DELETE-B` | Revisar a superfície de reexports e seus contratos de importação |
| `UNWIRED_PLANNED_FEATURE` | 10 | `DELETE-X` | Preservar enquanto a integração ou sucessão do plano é decidida |
| `UNUSED_UI_PRIMITIVE_CANDIDATE` | 12 | `DELETE-D` | Rever necessidade do componente compartilhado e consumidores previstos |
| `ACTIVE_ENTRY_OR_CONFIGURATION` | 3 | `DELETE-X` | Preservar os pontos de entrada e configuração ativos |
| `TEST_SUPPORT_CANDIDATE` | 1 | `DELETE-D` | Investigar configuração e consumidores de teste |
| **Total** | **84** | **Nenhum `DELETE-A`** | **Nenhuma exclusão autorizada** |

A classificação detalhada e a justificativa por caminho estão em [residue-candidates.json](evidence/residue-candidates.json). Os rótulos específicos dessa tabela refinam a disposição do código; não substituem os estados de tarefa definidos na [taxonomia](STATUS_TAXONOMY.md).

Os três pontos de entrada/configuração são `src/main.tsx`, `src/test/setup.ts` e `src/vite-env.d.ts`. O primeiro é referenciado pelo HTML de entrada; o segundo, pelo setup do Vitest; o terceiro integra a configuração de tipos. A ausência de importador em outro módulo TS é compatível com esses usos. `GroupManagementDialog`, `TeamMessageItem` e outros componentes Team Chat permanecem ligados a trabalho planejado sem integração completa. [Registro por caminho](evidence/residue-candidates.json) e [revisão dirigida do módulo](evidence/teamchat_residue_candidates.json).

## 4. Achados de código que alteram a ordem de trabalho

| Prioridade e alcance | Achado atual | Consequência para a reconciliação |
|---|---|---|
| P1, caminho ativo | Áudio, anexos, CHECKs de mensagem, policies de storage e renderer Team Chat usam contratos incompatíveis | Corrigir o fluxo completo; a existência de componentes novos não demonstra integração |
| P1, RPC com consumidor ativo | A última definição de conversa direta deixou de preencher o par canônico e usar o tratamento de conflito anterior | Tratar a possibilidade de duplicação concorrente como regressão estática; falta prova funcional atual |
| P1, interface latente | `TeamChatView` não passa `canManageDepartments`; a gestão contém chamada a credenciais restritas, tabela inexistente e escrita legada | Corrigir contratos antes de expor o diálogo; não foi demonstrado vazamento ativo de credenciais |
| P1, integração parcial | O Panel ativo não integra toda a paginação, reações e recibos implementados em outros componentes | Preservar componentes aproveitáveis e decidir a composição antes de discutir exclusão |
| P2, script de manutenção | `team-chat-db-validate.mjs` usa contratos antigos e pode aceitar respostas de erro como sucesso; possui teste consumidor real | Revisar script e teste em conjunto; não executar o POST privilegiado como se fosse auditoria somente leitura |

A prova por arquivo/linha, o alcance e os critérios de aceite estão nos achados **TC-001, TC-002, TC-005, TC-006 e TC-012** do [relatório Team Chat](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md). São constatações estáticas no baseline; cenários de falha inferidos a partir delas ainda precisam de validação no ambiente apropriado.

Os planos F100 e TC100 foram reconciliados separadamente, com comparação por conteúdo. TC foi commitado 114 segundos depois de F, mas não revoga expressamente sua alegação de autoridade. Portanto, ausência de integração não autoriza descartar componentes exigidos por um dos planos, e os 200 registros não representam 200 funcionalidades independentes. [Conflitos de autoridade](evidence/team_chat_plan_authority_conflicts.json) e [correspondência por escopo](evidence/team_chat_f_tc_crosswalk.json).

## 5. Marcadores e qualidade da evidência de testes

No conjunto AST, foram encontrados 221 usos explícitos de `any`, 3.260 asserções de tipo, 16 marcadores `@deprecated`, 13 `TODO` em comentários e um `@ts-expect-error`. O escape está em `useDepartmentManagement.ts`, no acesso à tabela `department_whatsapp_configs`; o usage guard reconhece essa violação conhecida e não encontrou violações novas. Isso não torna o contrato correto. [Resumo AST](evidence/ast-summary.json), [escapes de tipo](evidence/type-escapes.json.gz) e [TC-005](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

A busca lexical global registra outros totais, como 65 `TODO` e oito ocorrências de `@ts-expect-error`, porque também lê texto fora do conjunto de comentários AST. Contagem de marcador não é contagem de bugs ou tarefas independentes. Nomes como `legacy`, `backup` e `deprecated` exigem investigação de consumidor e contexto. [Inventário lexical](evidence/inventory-summary.json) e [marcadores AST](evidence/comment-test-markers.json.gz).

A evidência já coletada inclui cinco guardas estáticas de CI com exit 0 e 150 testes locais de contratos CI/deploy aprovados. Em Team Chat, a revisão identificou 271 asserts tautológicos em dois arquivos; existem outros testes e harnesses úteis, mas a quantidade bruta não demonstra cobertura comportamental do módulo. Nenhum desses resultados certifica RLS, storage ou uma sessão autenticada em produção. [Guardas estáticas](evidence/ci-static-guards.json), [contratos locais](evidence/ci-contract-tests.json) e [qualidade de testes Team Chat](evidence/test_quality_inventory.json).

## 6. Disposição para a próxima execução

O [registro de resíduos](RESIDUE_REGISTRY.md) concentra o tratamento por categoria e as exceções com consumidor comprovado. O [plano de limpeza segura](SAFE_CLEANUP_PLAN.md) define a evidência necessária para uma proposta futura por arquivo. A branch `claude/confident-babbage-ivgmmn` permanece em quarentena de evidência: suas mudanças funcionais exigem revisão seletiva e incluem regressões em guardas globais. Nenhum merge, remoção de arquivo ou enfraquecimento de guarda decorre desta varredura. [Quarentena por caminho](evidence/branch_quarantine.json).
