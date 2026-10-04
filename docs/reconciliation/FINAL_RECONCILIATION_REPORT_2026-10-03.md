# Relatório final de reconciliação — 03/10/2026

## Resultado e decisão

**A auditoria autorizada está concluída neste baseline.** O resultado é uma base rastreável para distinguir o que foi entregue, o que mudou de intenção, os defeitos presentes, os aceites sem prova atual e os históricos que devem ser preservados. A fila de correções é uma consequência documentada da auditoria; sua implementação não fez parte desta missão.

Baseline de produto: [`2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`](https://github.com/adm01-debug/Zapp_Web_V2/commit/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6). Persistência restrita a `docs/reconciliation/**`, na branch `docs/reconciliation-checkpoint-20261003`, no [draft PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869). As conclusões usam esse commit fixado e snapshots datados dos serviços externos.

**Atualização posterior ao baseline:** o [adendo final](reports/git/FINAL_REMOTE_DELTA.md) examinou o avanço para `4e73c7767858f00c577c29efd8cc86f5bea117a9` (PR #1870, 03/10 às 22:50:32 UTC). Ele reconhece a integração e o deploy de Talk X X028, conserva o aceite real pendente e registra três riscos residuais, além da persistência do placar defasado. As contagens deste corpo continuam no baseline original.

O [MASTER_LEDGER](MASTER_LEDGER.json) contém **5.166 registros provenientes de 62 fontes**. Foram produzidas **3.062 avaliações individuais**, com a profundidade de revisão explícita em cada uma. Outros **2.104 registros históricos** preservam a origem e a sucessão, sem fingir uma certificação individual de implementação. Os registros incluem versões antigas, fases, requisitos e emendas: **o total não é um backlog de funcionalidades nem permite calcular um percentual global de conclusão.**

## 1. Cobertura e rastreabilidade

| Superfície | Cobertura concluída | Limite de interpretação |
| --- | --- | --- |
| Arquivos do baseline | 4.065 arquivos; 76.818.044 bytes; zero divergências de blob | Hash e leitura estrutural não são revisão semântica de cada linha. |
| Texto | 677.490 linhas | Inclui documentação, SQL, testes e código; não é métrica de aceite. |
| AST TypeScript/JavaScript | 2.394 arquivos; zero erros de parse; 12.261 relações de importação | Parse não substitui typecheck, integração ou runtime. |
| Git | 9.643 commits catalogados; 58 branches comparadas; 197 commits exclusivos | Metadados e grafo completos; nem todos os patches históricos receberam revisão semântica. |
| GitHub | 1.828 PRs + 41 issues; IDs 1–1869 sem lacunas; 12 PRs e 14 issues abertas | Estado fixado no snapshot da coleta; não é aprovação de merge. |
| Fontes de requisitos | 62 fontes resolvidas; 5.166 registros | Versões, fases e emendas são preservadas; não somar como backlog. |
| Avaliação individual | 3.062 | Profundidades explícitas: revisão de contrato, triangulação, documentação ou evidência histórica. |
| Avaliação somente de linhagem | 2.104 | Registro histórico com origem/sucessão; sem certificação individual de implementação. |
| Banco no repositório | 801 SQL de migration: 779 ativos + 22 arquivados; 73 entradas edge | Não houve nova sessão SQL nem leitura direta do catálogo vivo. |
| Graphify | 3.452 fontes; 19.319 nós e 49.910 arestas; zero chamadas LLM | Grafo estático; não prova ausência de consumidores dinâmicos. |

As fontes completas estão no [manifesto de entradas](evidence/consolidation-inputs.json), no [catálogo documental](SOURCE_CATALOG.json) e no [registro de planos](PLAN_REGISTRY.json). Os hashes dos arquivos publicados ficam no [manifesto de artefatos](evidence/ARTIFACT_MANIFEST.json). A [revisão independente](evidence/independent-consolidation-review.json) verifica a preservação das referências, intervalos, justificativas e dimensões.

Foram recuperados quatro planos que existem somente fora de main e a definição histórica do Team Chat V3 em seu ref correspondente. Também foi recuperado integralmente o documento externo **Plano_Dashboard_100_Etapas_2026-09-30.md**, com SHA256 `ac7fe70aba78f725c7d182bb50d9682c9eae48e090859f627d464d89650079e0`; sua [cópia de referência](sources/Plano_Dashboard_100_Etapas_2026-09-30.md) não foi confundida com arquivo da main. A referência `claude/PLANO_DASHBOARD_50_ETAPAS.md` permanece não recuperada; nenhuma de suas supostas etapas foi inventada.

### Distribuição dos registros

| Estado | Registros |
| --- | --- |
| DONE_VERIFIED | 271 |
| PARTIAL | 838 |
| NOT_IMPLEMENTED | 220 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 858 |
| VALIDATED_FAIL | 35 |
| SUPERSEDED | 1.539 |
| NO_LONGER_APPLICABLE | 20 |
| PRODUCT_DECISION_REQUIRED | 227 |
| BLOCKED_EXTERNAL | 67 |
| BLOCKED_TECHNICAL | 8 |
| HUMAN_ACCEPTANCE | 50 |
| OBSERVATION_WINDOW | 13 |
| ACTIVE_REGRESSION | 27 |
| NEEDS_REVALIDATION | 949 |
| UNKNOWN | 44 |

`DONE_VERIFIED` vale apenas para o aceite explicitado. Exemplos incluem documentos, guardas estáticas e um diagnóstico de drift que admite o resultado `DRIFT_BLOCKING`; isso não significa banco corrigido. `NEEDS_REVALIDATION` e `UNKNOWN` não significam ausência de código. Um mesmo defeito pode afetar etapas de vários planos, inclusive históricos. A [taxonomia](STATUS_TAXONOMY.md) define os estados e impede essa dupla contagem.

## 2. Achados que mudam o próximo trabalho

Há **104 registros no catálogo de achados**, com fontes e tarefas relacionadas. Alguns descrevem a mesma causa atravessando módulos; outros registram medições, lacunas de aceitação ou conflitos de decisão. A severidade prioriza o impacto examinado e não presume exploração em produção. O [catálogo legível](FINDINGS.md) e o [JSON completo](FINDINGS.json) preservam esses limites.

### Multiplix: o caminho de edição, fila e envio não fecha um contrato único

O composer cria o rascunho e os destinatários e inicia o dispatch, sem passar pela materialização de blocos e itens esperada pelo motor. O worker lê itens, mas monta a mensagem com template/mídia globais; o fechamento ainda consulta a fila antiga de recipients. Essas divergências explicam por que componentes presentes e PRs integradas não bastam para certificar o envio final.

Probes locais com entradas sintéticas e transporte em memória reproduziram o uso do template global no lugar do bloco, a substituição vazia de variável ausente e a ausência de retentativa limitada após 429. O mesmo caminho conserva riscos de credencial global e quota calculada sobre a estrutura antiga. Isso não comprova execução de SQL nem entrega real ao provedor. Os casts/cancelamentos já corrigidos em F59 foram preservados como entregues. Evidência: [relatório Talk X/Multiplix](reports/modules/TALKX_MULTIPLIX.md), [probes](evidence/multiplix-offline-probes.json), achados MX01–MX09.

### Telefonia: contratos de filtros, gravação e reconciliação exigem correção

O hook envia `all` ao filtro que a RPC trata como valor literal; somente NULL significa ausência de filtro. O período altera a chave de cache sem transmitir `p_from`/`p_to`. Na gravação, o consumidor espera JSON com URL, enquanto a edge retorna áudio: o comportamento do cliente Supabase fixado no lock foi reproduzido localmente e não entrega o objeto esperado pelo player.

A reconciliação Bitrix seleciona a primeira chamada por sufixo de nove dígitos e não demonstra os controles necessários para ambiguidades, DDD, canal, direção e paginação. Persistência SIP e presença do código de gravação não encerram a chamada real exigida por T11. Evidência: [Telefonia/IA/Dashboard](reports/modules/TELEFONIA_IA_DASHBOARD.md), [probes cruzados](evidence/cross-module-probes.json), TEL-PERIOD-001, TEL-RECORDING-001 e TEL-RECONCILIATION-001.

### Dashboard e IA: métricas calculadas e escopo de dados continuam divergentes

A migration de soft-delete `20260930400000_dashboard_contact_counts_filter_deleted_at.sql` reintroduziu um corpo anterior da função após a correção da #795. O filtro de exclusão lógica é útil, mas reaparecem diferenças entre identidade Auth/perfil, conversão de agente, janela temporal e contagem por fila. Um contraexemplo de um contato com dois SLAs demonstra a multiplicação do total pelo join. A função continua `SECURITY INVOKER`; RLS e ACL anteriores não desapareceram. **Não foi demonstrado bypass de RLS nem exposição anônima.** A conclusão é sobre a última definição versionada, sem consulta atual do corpo vivo.

Na IA, o consumidor de sentimento compara vocabulário inglês com o contrato canônico em português. O webhook ElevenLabs valida assinatura, mas não deduplica a entrega nem verifica o erro de insert antes de responder sucesso. A quota real não está ligada integralmente à separação entre ação, tentativa e cobrança; o timeout não cobre toda a leitura do corpo. Há também decisões e funcionalidades de IA sem evidência suficiente, mantidas como UNKNOWN quando apropriado. Evidência: [relatório do módulo](reports/modules/TELEFONIA_IA_DASHBOARD.md), [história das definições](evidence/function-definition-history.json), DASH-SQL-REGRESSION-001 e achados IA-*.

### Team Chat: contratos de banco e componentes existentes não estão integrados de forma consistente

Mídia usa três contratos incompatíveis entre caminho de storage, mensagem e renderização. A última definição da conversa direta perdeu a proteção de concorrência; RPCs de saída/remoção usam `role`, enquanto o schema possui `member_role`. O Panel não incorpora toda a paginação, reações e ticks já existentes. Mute é lido e escrito em lugares distintos, e notificações dependem da montagem da view.

O gerenciamento de departamentos está inacessível pela UI porque falta `canManageDepartments`; seus contratos inválidos são defeitos latentes a resolver antes de ligar o acesso. Não se trata de evidência de segredo exposto pela tela atual. A revisão encontrou 271 asserts tautológicos nos dois testes extensos e não os contou como prova funcional. Evidência: [relatório Team Chat](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md), [qualidade dos testes](evidence/test_quality_inventory.json), TC-001–TC-015.

### Arquivos, Gmail e Catálogo: falhas pequenas de contrato produzem resultado incorreto

Em Arquivos, a interface mostra a quantidade total selecionada, mas encaminha somente a seleção que permanece no filtro. O probe seleciona dois itens, filtra um e encaminha somente um; com todos fora do filtro, a ação fica sem efeito. A invalidação omite a chave `media-gallery-counts`; `staleTime=30s` não é uma atualização periódica.

No Gmail, HTTP 207 com `success:false` atravessa o wrapper como sucesso de transporte e gera toast positivo; a conta não é invalidada. A análise distingue a continuação não consumida pelo chamador da paginação incremental que já existe na edge. Nos programas de engenharia, Cline054 registra ainda o webhook com OIDC observacional e seleção da conta pelo `emailAddress` do corpo usando service role. Esse risco foi analisado estaticamente; nenhuma chamada exploratória foi enviada. Gmail cron bloqueia por segredo e a API pública desativada responde 410, portanto as rotas não foram generalizadas como equivalentes.

No Catálogo, paginação por offset ordenada apenas por nome pode omitir produtos empatados, mesmo com deduplicação. O contraexemplo legal A/B, depois B/D, retorna A/B/D e perde C. A medição de desempenho anterior à última alteração visual requer repetição; payload acima da meta e reação da UI a 429 continuam aceites distintos. O 429 foi de fato exercitado no histórico, e correções recentes de rate limit foram reconhecidas. Evidência: [outros módulos](reports/modules/OTHER_MODULES.md), [reproduções](evidence/other-module-reproductions.json), [programas de engenharia](reports/modules/ENGINEERING_PROGRAMS.md), OTH-001–OTH-015.

### Multi-conexão, etiquetas e interface: limites de isolamento e de medição

Há caminhos que recorrem à credencial global mesmo ao operar outra conexão. Um probe importou o código atual e retornou `open` para `Connected=false, LoggedIn=true`, contrariando o contrato `connecting`. Trocar a conexão padrão usa updates separados e pode anunciar sucesso sem examinar os erros. Renomear/excluir labels ignora a instância e atua pelo prefixo global `wa:<labelId>:`. O scheduler de pausa/retomada existe e não foi classificado ausente. Evidência: [Multi-conexão](reports/modules/MULTI_CONEXAO_50.md), [Etiquetas](reports/modules/ETIQUETAS_100.md), [probes](evidence/transversal-semantic-probes.json).

Na interface, o layoutguard reporta cinco casos, dos quais dois são limites do scanner; há padding somado em Talk X/Multiplix. O teste de largura mede overflow em 1280, sem provar a ocupação exigida em 1920. SalesView/Journey usam rótulos mais amplos que os dados: compras somente concluídas e média derivada de amostra limitada. A matriz visual contém capturas cheia/vazia idênticas. Evidência: [layout/tipografia](reports/modules/LAYOUT_TYPOGRAPHY.md), [SalesView/Journey](reports/modules/SALESVIEW_JOURNEY.md).

Em Skins, o autosave marca a configuração como salva mesmo quando a gravação por quota falha; JSON `null` em storage provoca TypeError na inicialização. Em Volume, o caminho nativo cria AudioContext que não fecha no detach, e a extração recente do player de Telefonia deixou o áudio fora do hook global. As reproduções usam storage, estado e WebAudio simulados; não houve incidente observado nem audição em aparelho. Talk Me preserva idempotência SQL existente, mas mantém lacunas de prévia expandida, resposta incerta e aceite online. Evidência: [Talk Me/Skins/Volume](reports/modules/TALKME_MEDIA_SKINS.md), [Skins](evidence/skins-probe-results.json) e [Volume](evidence/volume-offline-results.json).

## 3. Históricos, decisões e entregas que devem ser preservados

Os planos F e TC de Team Chat coexistem. O TC foi commitado 114 segundos depois do F, mas não o substitui expressamente. Contratos de WhatsApp, reações e dependências divergem; F17 e TC17 não são equivalentes por número. A [matriz de conflitos](evidence/team_chat_plan_authority_conflicts.json) e o [crosswalk](evidence/team_chat_f_tc_crosswalk.json) mantêm os dois namespaces.

O Banco Único presume uma origem VPS e destino Singu que não correspondem à autoridade atual do ZAPP Cloud. Há 175 requisitos do corpo original, ou 178 incluindo emendas, condicionados à decisão de arquitetura; eles não viraram tarefas automaticamente executáveis. As PRs Singu #7/#44/#45/#48/#52 permanecem externas e não foram ligadas aos números homônimos do ZAPP. [Relatório Banco Único](reports/modules/BANCO_UNICO_201.md).

Nos planos históricos de banco, cancelamentos de 27/08, etapas3–6, permanecem cancelados. `mask_channel_credentials` era NO-OP e foi removida; recriá-la para fechar um plano antigo seria regressivo. MFA, lockout e Gmail possuem sucessores reais. `_superseded` e migrations estrangeiras arquivadas são memória obrigatória, não resíduos descartáveis. [Reconciliação histórica de banco](reports/modules/HISTORICAL_DATABASE.md).

A revisão também preserva correções posteriores de Contatos/Tarefas, Talk Me, Skins/volume, percentuais/periodização de SalesView, legenda/contraste e E2E. Decisões explícitas de dispensa ou reversão visual não viram pendências novas. A [linhagem por fonte](MODULE_LINEAGES.md) e os relatórios de especialidade identificam os sucessores e limites em cada etapa.

## 4. Git, PRs, issues e infraestrutura

As 58 comparações remotas concordam com o grafo local. Dos 197 commits exclusivos, 20 são merges e 177 não são; há três equivalências exatas de patch na janela examinada, quatro commits vazios e 170 patches sem correspondência exata. Ausência de patch-id igual não prova funcionalidade ausente: squash, reimplementação e mudanças posteriores exigem comparação por contrato.

Há 12 PRs abertas e 14 issues abertas no snapshot. Todas as PRs abertas mostram `combined_status=success`, mas seis têm check-runs em falha: **#1863, #1699, #1636, #1584, #1439 e #1206**. A #1430 tem E2E cancelado. Esse é um exemplo concreto de por que status agregado não autoriza merge. [Auditoria de PRs/issues](reports/git/PR_ISSUE_AUDIT_2026-10-03.md) e [registro de trabalho ativo](ACTIVE_WORK_REGISTRY_2026-10-03.md).

O DB Live Guard coletado registra **779 migrations no repositório contra 781 no ledger**, com extras `20261003182707` e `20261003192707`, além de diferenças em tipos/catálogo/manifesto/grants. São fixtures de mídia de Arquivos observadas no run, não justificativa para reparar histórico automaticamente. A falha de DB offline decorre de bootstrap/socket PostgreSQL, exit2, antes dos contratos: é bloqueio de infraestrutura, não reprovação SQL demonstrada. A falha SonarCloud e o 403/null do settings guard são registrados separadamente. [Relatório GitHub](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

A branch `claude/confident-babbage-ivgmmn` conserva 37 commits exclusivos e 87 arquivos diferentes, incluindo 21 commits posteriores ao head fechado na #1151. Contém trabalho funcional e mudanças incompatíveis em guardas globais. A [quarentena](evidence/branch_quarantine.json) exige reconciliação seletiva; não recomenda merge integral. Três branches ancestrais têm integração comprovada no grafo, mas nenhuma foi excluída. O inventário de resíduos contém candidatos, não autorização de poda.

## 5. Verificações realizadas e o que elas demonstram

- Hash e inventário de todos os 4.065 arquivos do baseline, sem divergências; parse AST de 2.394 fontes sem erros e zero importação interna literal não resolvida no escopo do analisador.
- Comparações das 58 branches e catálogo dos 9.643 commits; fontes históricas verificadas no ref de definição correto.
- 150 testes existentes de contratos CI, cinco guardas CLI e 31 testes existentes de Talk X/preflight aprovados. O status gerado de Talk X diverge do arquivo atual, e essa falha foi preservada.
- Guard tipográfico e dez testes aprovados; guard de layout com cinco apontamentos adjudicados, sem tratar falsos positivos como bugs.
- Probes locais de Multiplix, Telefonia, Dashboard, Arquivos, Gmail, Catálogo e Multi-conexão com fixtures e transporte em memória. O sucesso do harness significa reprodução do resultado declarado, que pode ser um defeito.
- Skins e Volume acrescentam 307 critérios verificados com APIs simuladas; 304 passaram e três reproduziram defeitos. Isso não equivale a testes em navegador real ou hardware.
- Conferência dos JSONs, dos registros por plano, das cinco dimensões, das fontes/linhas, das associações de PRs, dos vínculos de achados, dos destinos de evidência e do escopo exclusivo de documentação.

As evidências executáveis ficam em [reproduce/](reproduce/README.md) e os resultados em `evidence/`. O [laudo adversarial](reports/adversarial/INDEPENDENT_REVIEW_2026-10-03.md) limita as conclusões de segurança, distingue mocks de banco real e corrige inferências excessivas.

**Limites mantidos:** não houve nova sessão SQL, nova homologação SIP, reexecução de toda a suíte do produto, medição visual completa nem leitura semântica de todos os patches de todos os anos. Esses aceites permanecem expressos nos registros; não foram substituídos por uma contagem verde.

## 6. Encerramento e próxima ordem técnica

O trabalho autorizado termina com a consolidação, validação e persistência deste pacote no mesmo PR de documentação. Não ficam etapas desta auditoria agendadas implicitamente. Correções funcionais, aceites operacionais e decisões externas identificados aqui são trabalhos posteriores, com entradas e critérios concretos em [EXECUTION_WAVES.md](EXECUTION_WAVES.md).

A sequência proposta é: estabelecer evidência confiável de banco/CI; corrigir isolamento e contratos de execução; corrigir cálculos e semântica de interface; coletar os aceites reais; só então avaliar resíduos e integração seletiva de branches. Cada frente usa os IDs já consolidados, preserva os sucessores e exige prova que corresponda ao comportamento alterado. Não é necessário gerar outro plano gigante nem repetir os programas antigos literalmente.
