# Auditoria integral de Telefonia, IA e Dashboard

**Baseline fixo:** 2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6. **Escopo:** leitura de documentação, Git, código e fontes de testes. Nenhum arquivo do repositório foi alterado; nenhum banco foi escrito, provedor pago chamado, áudio discado ou mensagem enviada.

## Resultado e cobertura

Foram reconciliadas individualmente **400 tarefas**: Telefonia T01–T100, IA IA-001–IA-200 e Dashboard DASH-001–DASH-100. O novo plano de Dashboard foi lido integralmente como documento externo do usuário, sem fingir que está versionado no Git. A cobertura de reconciliação não significa que 400 tarefas estejam implementadas ou aceitas.

Há **22 achados agrupados** em findings.json. Três defeitos centrais receberam revisão independente: a regressão SQL do Dashboard, o contrato dos filtros do histórico e o contrato binário de gravação. Os dois últimos também têm reprodução local dos hooks reais com dependências em memória, sem SDK, React ou banco real; a evidência está em audit/adversarial/cross-module-probes.json.

| Estado reconciliado | Telefonia | IA | Dashboard |
|---|---:|---:|---:|
| ACTIVE_REGRESSION | 2 | 0 | 7 |
| BLOCKED_EXTERNAL | 1 | 3 | 0 |
| DONE_VERIFIED | 4 | 0 | 0 |
| HUMAN_ACCEPTANCE | 2 | 4 | 2 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 45 | 26 | 5 |
| NEEDS_REVALIDATION | 25 | 3 | 25 |
| NOT_IMPLEMENTED | 5 | 1 | 2 |
| OBSERVATION_WINDOW | 0 | 1 | 0 |
| PARTIAL | 16 | 117 | 58 |
| PRODUCT_DECISION_REQUIRED | 0 | 1 | 1 |
| UNKNOWN | 0 | 44 | 0 |

Os quatro DONE_VERIFIED são **estritamente documentais/de artefato**: T01 corrige a linhagem, T02 registra decisões, T07 elimina teste placebo e cria teste real, T71 registra a decisão de manter a integração Bitrix no escopo. Nenhum deles certifica uma ligação, uma gravação, uma regra RLS viva ou produção. IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE preserva código que existe e sua cobertura de testes sem inventar uma execução. UNKNOWN significa ausência de prova suficiente, não prova de código ausente.

Cada linha de tasks.json contém o requisito/aceite literal, arquivo e linha de origem, estado documental, estado reconciliado, razão, implementação, testes, runtime, aceitação, caminhos, PRs/commits e trabalho restante. code_history registra o último commit de cada fonte inspecionada; sua relação é explicitamente de história da fonte, não de aceite da nova tarefa. pr_evidence.json inclui diffs dos merges contra o primeiro pai e verificação de que estão contidos no baseline.

## Telefonia: código até T74, com defeitos que os checkboxes não detectam

O plano contém 72 caixas marcadas e 28 abertas: T01–T74 estão marcadas, exceto T06 e T11; T75–T100 permanecem abertas. O cabeçalho ainda diz que fase 2 não começou e que #1494 aguarda o responsável. A cadeia Git e os metadados mostram #1494, #1585, #1703, #1830, #1851, #1858 e #1864 incorporados. A última entrega cobre T71–T74. O texto também registra que o login voltou a responder 200 em 03/10; portanto, o bloqueio de autenticação de 29/09 não deve continuar sendo citado como causa atual. Falta a prova específica de T06, não uma repetição do diagnóstico velho. [docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md:3](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md#L3)

### Histórico: a interface e a RPC discordam sobre filtros

O defeito mais imediato combina duas incompatibilidades. O frontend envia os valores all de canal, direção e resultado diretamente. A RPC search_my_calls interpreta apenas NULL como filtro desativado. Com defaults, comparar canal a all exclui chamadas válidas voip/whatsapp. Além disso, o período altera a queryKey, mas o payload nunca contém p_from/p_to. O KPI faz parte da normalização e envia datas, de modo que números e lista podem divergir mesmo usando o mesmo controle visual. A reprodução independente mostrou payloads idênticos para 7d e 30d e rejeição de uma chamada válida pelo predicado literal quando canal=all. [src/hooks/calls/useMyCalls.ts:35](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/hooks/calls/useMyCalls.ts#L35); [supabase/migrations/20260926800000_calls_telefonia_v2.sql:123](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/migrations/20260926800000_calls_telefonia_v2.sql#L123)

O aceite deve testar defaults e mudança de período contra o contrato do servidor. Ver apenas uma queryKey diferente ou uma chamada ao mock da RPC não verifica o resultado operacional. Esse achado afeta T35/T36/T37/T45 e seus fechamentos funcionais, sem apagar o fato de que o shell, a tabela e a paginação foram implementados.

### Gravação: resposta binária tratada como JSON

get-call-recording valida JWT, consulta calls sob RLS e retorna o corpo de áudio por Response, inclusive cabeçalhos de Range. useCallRecording espera um objeto com url. Um Blob/stream bem-sucedido não contém esse campo e o player retorna null. A reprodução em memória confirmou disponível=false para áudio/Blob e true para o JSON fornecido pelos mocks. Os seis testes da Edge só exercitam cabecalhosDoAudio; não chamam o handler nem provam 200/401/403. [src/hooks/calls/useCallRecording.ts:37](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/hooks/calls/useCallRecording.ts#L37); [supabase/functions/get-call-recording/index.ts:103](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/get-call-recording/index.ts#L103); [supabase/functions/get-call-recording/index.test.ts:12](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/get-call-recording/index.test.ts#L12)

A correção precisa escolher um contrato único de reprodução autenticada e testar a fronteira completa, preservando o requisito de não divulgar a URL do provedor. Remover um botão ou continuar retornando null não conclui T67/T73.

### Reconciliação Bitrix e homologação

sync-call-records procura o primeiro candidato pelo sufixo de nove dígitos dentro de ±90 segundos. Não impõe canal, direção nem rejeição de ambiguidade. Também grava CALL_FAILED_CODE cru em end_reason e pode substituir dados bons por null. Isso permite associação incorreta entre DDDs/canais e quebra a semântica de encerramento. A evidência é estática; não foi demonstrada exposição de gravação real. [supabase/functions/sync-call-records/index.ts:38](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/sync-call-records/index.ts#L38)

T11 é o exemplo correto de separação entre implementação e aceite: persistência com UUID estável, fila e retry existe e tem testes; a ligação real exigida continua sem evidência. O plano a desmarcou justamente por isso. T15 depende de provisionamento SIP; T72 de fonte/agenda Bitrix; T94–T97 de publicação, homologação com agente e consulta posterior. Resposta zero porque a variável Bitrix não está configurada não é integração validada.

As entregas finais específicas continuam faltando ou sem comprovação: relatório de contraste, e2e/telefonia.spec.ts, docs/telefonia/HOMOLOGACAO.md, snapshot final.json, seção Telefonia no CLAUDE.md, medições visuais, cobertura completa, teste real de áudio e aceite de encerramento. Não executamos nenhum desses fluxos ativos durante esta auditoria.

## IA: entregas reais, resíduos de integração e proposta documental

Blocos iniciais possuem artefatos de referência, inventário, matriz, contratos, roteamento, jobs, orçamento e rastreamento. IA-051–IA-057 têm PRs recentes de correlação, rota efetiva, streaming, reconciliação de consumo, preços, agregação e saúde. O ledger preserva essas implementações e diferencia uma biblioteca pura de seu consumo no caminho produtivo. Para IA-059–IA-200, fontes existentes e entregas herdadas foram relacionadas por tarefa; propostas não comprovadas continuam UNKNOWN ou parciais, sem concluir inexistência só porque não há PR com o número no título.

| Tema | Estado comprovado | Resíduo importante |
|---|---|---|
| IA-013 | HMAC, timestamp e corpo original são exigidos | Evento válido repetido insere de novo; erro de insert não é checado antes do 200 |
| IA-016/017 | Há proteção de origem em áudio e controle de configuração administrativa | Endpoint de provider e nome de secret não estão vinculados por allowlist segura |
| IA-021 | Vocabulário canônico PT-BR e aliases existem | useAIStats compara EN; demais leitores não cobrem legado/crítico/desconhecido uniformemente |
| IA-041/042 | Timeout de fetch e retry com budget existem | Timer termina nos headers; consumo do corpo/json escapa ao prazo |
| IA-050 | Degradação explícita por erro existe | Circuit breaker por falhas repetidas não existe |
| IA-054 | Helpers distinguem ação, tentativa e cobrança | Quota efetiva continua contando linhas de log; helpers não são consumidos nesse caminho |
| IA-055/056 | Preços por vigência, RPC de custo e totais no servidor existem | Custo real reconciliado e execução do aceite volumétrico não foram comprovados |
| IA-057 | Sem observações não vira 100% de sucesso | Visão ainda é de 50 chamadas ai-proxy/24h, sem toda a análise por provedor prevista |
| IA-058 | Projeto do mecanismo futuro foi entregue em #1839 | Não existe entrega de alertas/bloqueio em operação por esse PR |

A regra de segurança de IA-016/017 é relevante, mas seu modelo de ameaça deve ser preciso: ai_providers possui escrita administrativa. O problema exige configuração privilegiada maliciosa ou incorreta; não foi provado que um agente comum possa selecionar qualquer segredo. A leitura de Deno.env.get(secretName) e o fetch do endpoint configurado permanecem no dispatcher. Os snapshots de catálogo/manifesto apoiam ausência de CHECK específico, sem certificar um estado vivo. [supabase/functions/_shared/ai-generate.ts:444](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/_shared/ai-generate.ts#L444); [supabase/functions/_shared/ai-providers.ts:107](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/_shared/ai-providers.ts#L107)

IA-050 não deve ser absorvida pelo resumo de bloco: o próprio README diz que não foi entregue e, mais abaixo, afirma 001..050 entregues. IA-058 exige o cuidado inverso: o texto original pede projetar e chama o mecanismo de futuro. Seu documento entrega escopos, limiares e dedupe de incidentes, mas não alerta em produção. Foi classificado PARTIAL com status_native=DESIGN_ONLY, conforme a taxonomia comum, sem converter projeto em runtime. [docs/ia/README.md:29](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/ia/README.md#L29); [docs/audits/PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md:9](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/audits/PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md#L9)

Também foram conferidos consumidores posteriores: chatbot recebe connectionId e não o usa para selecionar flow/histórico; churn usa updated_at como interação e ignora resultado remoto; NextBestAction descarta erros de leitura; SupervisorCopilot pergunta sobre métricas que não envia no contexto; áudio-meme ainda usa nome/URL; insights TalkX têm caps e métrica lowClickCampaigns incompatível com sua query. Esses achados justificam manter abertas as tarefas correspondentes mesmo com infraestrutura comum disponível.

## Dashboard: fonte externa preservada e regressão posterior detectada

A origem das 100 tarefas é **Plano_Dashboard_100_Etapas_2026-09-30.md**, referência 2880cb9908a8bd2c5fd268f6b64b640fc0a4b222. O SHA256 do conteúdo extraído é **ac7fe70aba78f725c7d182bb50d9682c9eae48e090859f627d464d89650079e0**. Cada tarefa tem source_kind=external_user_document, nome original, número original, linha e caminho da extração. Essa origem é independente do plano de 50 etapas referenciado no README, cujo arquivo não foi encontrado no HEAD nem no git log --all por caminho.

### Regressão de dashboard_contact_counts

A última definição entre as quatro migrations root é 20260930400000, incorporada por #1371. Seu comentário declara cópia do corpo inicial com acréscimo de deleted_at IS NULL. Com isso, reintroduziu comparações erradas de assigned_to com auth.uid, retirou resolução de perfil/escopo efetivo, perdeu fuso São Paulo/search_path e voltou a juntar múltiplas linhas conversation_sla antes de contar a fila. A correção anterior #795 continua no histórico, mas a ordem das migrations prevalece sobre a existência desse PR. [supabase/migrations/20260930400000_dashboard_contact_counts_filter_deleted_at.sql:13](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/migrations/20260930400000_dashboard_contact_counts_filter_deleted_at.sql#L13); [supabase/migrations/20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql:1](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/migrations/20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql#L1)

A revisão independente confirmou a regressão e suas ressalvas: a função é SECURITY INVOKER por padrão, RLS continua valendo e CREATE OR REPLACE preserva ownership/ACL anteriores. Portanto, não se afirma bypass de RLS ou exposição irrestrita. A ausência de guard efetivo é uma regressão do contrato de escopo; o impacto vivo depende da definição publicada e das policies. O índice parcial de SLA restringe somente primeiras respostas ainda pendentes; permite múltiplas linhas respondidas no dia, suficientes para fanout.

### O que preservar e o que ainda falta

Ranking por período #809, rótulo Média7dias #781, keyset CSAT e relatório owner-only já existem e devem ser preservados. O README descreve versões antigas desses comportamentos. Em paralelo, ainda há problemas atuais: fila/estoque filtrados por updated_at, metas derivadas de criação de cadastro/análise IA, SLA100 sem denominador, NPS limitado a500, alertas limitados a400/5, presença confundida com habilitação, previousRank fictício e séries não ponderadas.

Realtime não recebe todos os filtros; mistura conexão com sucesso de fetch; usa batch mutável; não expira exatamente a janela móvel e não reconcilia toda corrida de snapshot/evento. Refresh do agregador retorna void, e ranking não descarta resposta antiga. Controles de IA/NPS/heatmap e periodicidade de relatório também não correspondem integralmente às fontes indicadas. O detalhe e os caminhos de cada uma das 100 etapas estão em dashboard_tasks.json.

## Ordem proposta para conclusão operacional futura

1. Corrigir as fronteiras concretas já demonstradas: filtros da Telefonia, áudio binário, reconciliação ambígua, corpo SQL regressivo, replay de webhook e quota por ação. Anexar regressões que chamem a implementação real.
2. Resolver as decisões de contrato: identidade/período/atendimento/amostra, presença, propriedade, política de secrets/destinos e desligamento por capacidade.
3. Preservar correções antigas e atualizar apenas claims/documentos divergentes. Não reconstruir plano50 ausente nem contar E53 Search Box como Dashboard100.
4. Com ambiente e autorização próprios, executar provas por usuário real, fonte configurada, definição SQL efetiva, datasets acima dos caps e fluxos completos. Registrar deploy/runtime separadamente do merge.
5. Obter aceite humano, janela de observação e liberação por capacidade. As tarefas finais não são substituídas por contagem de testes ou PRs.

## Artefatos e limites de uso

| Arquivo | Conteúdo |
|---|---|
| tasks.json | 400 registros completos, IDs sem colisão entre linhagens |
| telefonia_tasks.json / ia_tasks.json / dashboard_tasks.json | Recortes individuais completos |
| findings.json | 22 problemas agrupados com severidade, prova, impactos, correção e aceite |
| pr_evidence.json | Metadados, ancestralidade e arquivos de cada PR correlacionado |
| lineage.json | Fontes, plano50 ausente, correções preservadas e origem externa |
| coverage.json | Contagens e limites explícitos da auditoria |
| TASK_INDEX.md | Índice humano das 400 tarefas |

Resultados históricos de testes, screenshots citados e declarações de produção permanecem alegações atribuídas aos documentos quando o artefato não foi disponibilizado. Não foi reexecutada suíte de aplicação neste recorte. A auditoria conclui a reconciliação documental e estática; não autoriza mudança de código, banco, envio, ligação, deploy ou liberação.
