# Revisão de melhorias e correções — 30/10/2026

## Escopo e critério

Revisão contra `origin/main` em `fb57b4a5cd071bf86a384d10f143360bd18feb61`, com consultas read-only ao GitHub e ao banco canônico e inspeção por cinco frentes: segurança/banco, CI/DevOps, Talk X/telefonia/Team Chat, Inbox/CRM/Catálogo/UI e IA/Edge/performance. As alterações locais para ACL estão em revisão separada e não foram consideradas como já integradas.

O inventário geral `INVENTARIO_MELHORIAS_2026-10-07.tsv` contém 1.110 linhas e registra 330 implementadas, 305 parciais, 258 não implementadas, 157 não verificáveis e 60 obsoletas naquele snapshot. Esses totais são ponto de partida, não estado atual. A reconciliação de 56 tarefas também usa baseline de 03/10. Nenhuma delas deve ser reportada como revalidada integralmente nesta data. Este relatório marca evidência atual, pendência real, estado parcial, evidência externa ausente e item documental obsoleto separadamente.

## Resumo executivo

- **Confirmado parcialmente implementado:** privilégios `TRUNCATE`, `REFERENCES` e `TRIGGER` para `anon`/`authenticated` em tabelas de `public`; falta retirar os grants existentes e os defaults controláveis de `postgres`. A consulta read-only encontrou 89 tabelas afetadas para `anon` e 130 para `authenticated`.
- **Gates da main não estão todos verdes:** a execução `41062325861` falhou em E2E e Node CI Scripts, fazendo o CI Gate falhar. O DB Live Guard `41066127274` concluiu com falha no SHA `fb57b4a5`.
- **Deploy de Edge Functions ainda sem correção validada:** PRs #2371 e #2380 estão atrás/bloqueadas; #2380 tem falhas em Node CI e E2E em execução.
- **Itens funcionais concretos:** importação Talk X/CRM não localizada; gestão de convites Team Chat ainda usa `department_invites` e auditoria direta; falha não-2xx do Bitrix vira HTTP 200 em `sync-call-records`; encaminhamento unitário de arquivos não funciona nos modos cartão/lista.
- **Evidências externas ainda abertas:** envio real de Catálogo e fluxos autenticados em produção dependem de operação/aceite, não podem ser concluídos por inspeção do código.
- **Não é correto declarar o plano inteiro concluído.** Existem pendências com implementação parcial e várias classificações antigas que precisam de reavaliação item a item antes de manter o backlog.

## Achados confirmados e próxima ação

| Prioridade | Frente | Estado em 30/10 | Próxima ação / prova de fechamento |
|---|---|---|---|
| P0 | ACLs de tabelas públicas | Confirmado live e parcial no código. Migration `20261016250000` revogou DML de `anon`, mas deixou privilégios estruturais. | Integrar migration corretiva, executar pelo workflow DDL aprovado e verificar grants efetivos e defaults no banco. O PR proposto também adiciona guard e testes. |
| P0 | Rate limit de IA | Parcial: a RPC compartilhada é atômica, mas falha de infraestrutura deixa o pré-filtro local autorizar chamadas. | Decidir e implementar comportamento fail-closed ou fallback com limite seguro; provar falha da RPC em teste. |
| P0/aceite | Segurança do E2E logado | Workflow usa `SUPABASE_SERVICE_ROLE_KEY` diretamente no teardown. O arquivo comprova referência, não configuração atual do secret no GitHub. | Mover o secret a environment protegido, auditar escopo e validar job de teardown. |
| P1 | CI principal | `41062325861`: E2E falhou por contraste escuro reportado entre 2,33:1 e 3,09:1; Node CI falhou em integridade de `tslib@2.8.1` no `edge-coverage-authz`; o CI Gate falhou. | Corrigir contraste e estabilizar/verificar origem/hash do pacote; rerodar workflow inteiro até gate verde. |
| P1 | Deploy Edge Functions | `deno check` falhou por falta de `@types/node`; #2371 está behind e #2380 blocked, com Node CI falhando. | Reconciliar as propostas em uma correção, validar com CI atual e confirmar deploy em ambiente apropriado. |
| P1 | Team Chat convites | Parcial: o frontend ainda consulta/cria/remove `department_invites` e grava em `department_audit_logs`, enquanto o plano define `department_invitations`. | Migrar o hook para o contrato canônico, cobrir RLS/auditoria e só então remover legado após prova de ausência de consumidores. |
| P1 | Talk X importação CRM | Não localizada no código/migrations: tabelas, RPCs, upload, mapeamento e resolução de conflitos descritos em F13. | Especificar e implementar o fluxo, ou atualizar formalmente o plano se a decisão de produto mudou. |
| P1 | Encaminhamento de arquivos | Parcial: painel de detalhe e seleção múltipla têm fluxo; botão individual de cartão/lista segue desabilitado. | Implementar ação unitária e provar em teste nos modos cartão e lista. |
| P1 | Reconciliação de chamadas Bitrix | Não-2xx do Bitrix pode retornar HTTP 200 e `reconciliados: 0`. | Expor falha operacional via status/contrato, preservar detalhes seguros e validar alertas/retry. |
| P1 | Funções Edge código × runtime | Um levantamento live reportou 82 funções ativas vs. 85 fontes executáveis locais; `ai-usage-outbox-drain`, `automation-suggest-reply`, `copilot-live`, `invite-user` e `recover-message-media` não constavam no runtime observado. | Comparar manifesto e versão implantada por função; classificar cada diferença como deploy pendente, remoção aprovada ou órfã, depois implantar e smoke-testar. |
| P1 | Configuração SIP | Logs das últimas 24h reportaram 1.260 respostas 503 de `get-sip-password` por ausência de `SIP_PASSWORD`. | Configurar o secret pelo mecanismo operacional aprovado e validar uma chamada autenticada sem revelar o valor. |
| P1 | Catálogo PromoGifts | Logs reportaram 24 erros 5xx em 75 chamadas e p95 ~141s, com timeout upstream/statement timeout. | Medir separadamente latência da consulta, rede e serviço externo; definir timeout/retry e observabilidade antes de alterar a integração. |
| P1/externo | Envio do Catálogo | Sem registro do primeiro envio real ponta a ponta. | Executar procedimento autenticado com número conectado e registrar IDs, resultado e evidência em `docs/catalogo/ENVIO_E2E.md`. |
| P1/externo | DB Live Guard | `41066127274` concluiu com falha em `fb57b4a5`. A evidência lista 70 divergências migration×ledger: 48 registros têm `statements` em prosa sem hash verificável, 20 têm SQL divergente e 2 têm nome divergente. Há também baseline de grants diferente, 33 tabelas e 1 view no banco ausentes do catálogo, 318 colunas só no banco, `types.ts` desatualizado e runtime-config sem prova de backup. O check MCP rejeita um `search_path` válido com `pg_temp` ao final; o novo `live-invariants` passou. | Resolver a falsa reprovação do `search_path` no guard; para os demais itens, abrir evidência por contrato e classificar/reconciliar sem alterar ledger ou banco por suposição; repetir o guard antes de DDL live. |
| P1/planejamento | Migração operacional | `db-migrate.yml` exige environment `producao-ddl`, aceita migration/bundles conhecidos, sem `apply_all_missing` ou confirmação específica destrutiva. | Resolver GA13–GA17 explicitamente; manter guardas e revisão por migration, sem aplicar lote indiscriminado. |
| P2 | Métrica de envios do Catálogo | `catalog_send_stats` existe nos tipos, sem consumidor identificado em `src`; painel “hoje/7 dias” não encontrado. | Implementar painel ou registrar decisão de produto e remover requisito. |
| P2/decisão | Política de download Catálogo | Plano diz que export CSV/fotos não consultam `can_download`; requer decisão sobre saída de dados. | Registrar regra de autorização e cobri-la no backend e UI antes de alterar exportações. |
| P2/decisão | Preview de mídia | `MediaPreview` abre URL assinada via `window.open`, divergindo da política D2 de manter preview no produto. | Confirmar a política vigente e adequar comportamento; validar URL, expiração e acesso. |
| P2 | Alvo Lighthouse | `performance-budget.json` declara que Lighthouse 90 não tem gate. | Decidir se o alvo é requisito contínuo; se for, adicionar medição reprodutível e limiar que não confunda bundle com Lighthouse. |
| P2 | Documentação Edge Functions | O inventário de arquitetura lista 74 funções em snapshot de 08/10, vs. 85 fontes locais e 82 remotas no levantamento recente. | Regenerar catálogo com fonte automatizada e registrar diferenças local × remoto. |

## O que os relatórios antigos classificam incorretamente

Estes exemplos foram encontrados implementados no `main` e não devem continuar no backlog como ausências sem nova evidência contrária:

- ElevenLabs B3/B4/B6: papel administrativo, allowlist de vozes e trilha de auditoria/consumo existem; isso não fecha o fail-open de rate limit.
- Auditoria `UPDATE` de `user_roles` existe em migration; o estado do trigger no banco ainda exige verificação live.
- Team Chat já integra paginação, renderização de mensagens, listener global de notificações e recuperação do rascunho após falha.
- Chamadas: filtro `all`/datas e contrato de gravação autenticada foram corrigidos.
- Inbox: `conversation_status` é usado para contagem de resolvidas; downloads da aba Arquivos consideram `downloadAllowed`; controles de modo possuem `aria-label`.
- No Catálogo/Arquivos, não confundir código parcialmente existente com o aceite de primeiro envio real, que continua sem evidência externa.
- Os números `2/200` do Talk X e “nada executado” do plano de telefonia derivam de baselines anteriores; não são medição atual de funcionalidades ausentes.
- Quatro achados de IA/Edge/performance de 03/10 e os itens de segurança Edge (preview, WebAuthn, health check, CORS e escape de HTML) indicados no relatório de 07/10 aparecem corrigidos no código atual; runtime de 82/85 funções e falta de `SIP_PASSWORD` mostram que código não prova deploy/configuração.
- Advisories agregados reportaram 418 initplans de RLS, 75 pares de policies permissivas, 41 FKs sem índice, 183 funções `SECURITY DEFINER` executáveis por `authenticated` e 6 com `search_path` mutável. São filas de triagem por objeto; contagem isolada não prova explorabilidade nem impacto.
- O ledger de IA diverge do README para IA-050 (registro diz ausente; README e `ai-circuit.ts` dizem entregue). Corrigir o estado e anexar evidência em vez de reimplementar sem necessidade.

## Estado do banco e limite de alteração

Na consulta read-only anterior desta auditoria, `origin/main` e o ledger canônico tinham exatamente 1.064 versões ativas. O branch de correção adiciona a versão `20261030135126`; até merge e execução pelo workflow, essa versão **não** deve aparecer no banco canônico. Não se aplicou DDL de produção nesta revisão.

O executor `postgres` não pode mudar defaults pertencentes a `supabase_admin`; esse residual já está documentado como fora da autoridade do executor. A correção proposta remove grants efetivos e defaults controláveis por `postgres`, mantendo explícito esse limite. Não se deve declarar o tema totalmente fechado até uma consulta read-only pós-apply confirmar as relações atuais e após-criação.

## Validação realizada neste branch

- `bash scripts/db-audit/check-live-invariants.test.sh`: **48 cenários aprovados**, incluindo concessões diretas e defaults inseguros para `TRUNCATE`, `REFERENCES` e `TRIGGER`.
- `bash scripts/db-audit/replay-local.sh`: **1.041/1.065 migrations aplicadas; 24 falhas classificadas como conhecidas; 0 drift inesperado; `REPLAY=verde`**. Replay descartável, sem acesso ao banco canônico.
- PR #2353 está integrada em `fb57b4a5`; não é mais uma pendência.
- PR #2383 contém a correção de ACL e este relatório; aguarda checks do GitHub.
- O artefato `db-live-evidence-41066127274-1` foi lido: `mcp_exec` e `mcp_exec_many` passam owner, grants, corpo e default; a única flag falsa observada é `search_path`, por aceitar apenas `pg_catalog, public` e não a configuração posterior e mais explícita `pg_catalog, public, pg_temp`. O patch local atualiza o contrato e o teste específico cobre a ordem correta e uma ordem insegura.
- O replay e os testes não substituem checks do PR no GitHub nem validação do guard live.

## Sequência recomendada

1. Revisar e integrar o PR de ACL depois de todos os checks obrigatórios verdes; executar migration via `producao-ddl` e verificar em leitura os grants resultantes.
2. Corrigir bloqueios atuais de E2E/Node CI e consolidar `deploy-functions` em uma única PR green e atualizada contra `main`.
3. Obter DB Live Guard concluído no SHA vigente; resolver os contratos que ele apontar antes de tratar novos DDL como sincronizados.
4. Implementar o rate limit fail-closed/fallback seguro e o teardown E2E em environment protegido.
5. Resolver em PRs separados F13 (importação Talk X), convites Team Chat, erros Bitrix e encaminhamento unitário de arquivos.
6. Fazer aceites externos de Catálogo e produção com evidência registrada.
7. Regerar/adjudicar por ID os inventários e planos antigos, preservando linhagem e decisão: não marcar todos os 1.110 itens como revalidados com base nesta auditoria por frentes.

## Limitações desta revisão

A revisão foi ampla por frentes, com cinco agentes especializados, consultas ao GitHub e leitura do banco, mas não executou homologação de cada funcionalidade, teste autenticado em produção nem reclassificação linha a linha dos 1.110 itens e das 5.166 tarefas históricas. Esses registros permanecem não revalidados até que cada um tenha evidência atual. Os estados externos e a fila de Actions podem mudar após 30/10/2026.
