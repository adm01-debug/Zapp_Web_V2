# Revisão semântica — scripts shell Auth

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. Estado: **COMPLETE**. Atualizado em 2026-10-04T06:28:00.799322+00:00.

Alocação: 12 arquivos / 3546 linhas. Leitura integral concluída: 12; parcial: 0; pendente: 0. Linhas realmente lidas: 3546.

Esta é revisão do código dos scripts/testes, não execução ou declaração de que a suíte passa. Assertions e mocks só sustentam o contrato que efetivamente exercitam. Ausência de teste genérico não gera um achado novo por arquivo.

## 1. `scripts/db-audit/contacts-soft-delete-and-status.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 754]]; total: 754 linhas; blob: `66be0a61f0debef3267b6630222d4fc83062b1d5`.

**Contrato exercitado:** Harness PostgreSQL17 descartável aplica nove migrations reais da F1 e verifica RED/GREEN dos CHECK/FSM, soft-delete individual/lote, ocultação em busca/contagem, remoção Sicoob, ACLs/helpers e reaplicação selecionada. Inclui SELECT real sob papel authenticated (519–524), update permitido/negado e erro de guard por mensagem; compara claims completos versus apenas sub e assinaturas2/5args.

**Fixtures e substituições:** Esquema anterior criado manualmente115–357 com helpers de visibilidade/admin simplificados, cinco contatos/perfis/filas e guards copiados; search_contacts é substituída manualmente398–446 por retorno23colunas antes das migrations finais.

**Controles positivos:** expect_failure exige erro nãozero e regex esperada67–86; casos positivos usam igualdade do valor. Claims completos ativam triggers e contraprovas comportamentais complementam consultas textuais de pg_get_functiondef.

**Limites e lacunas concretas:** Revisão fonte apenas: Docker/psql não executados. Não é replay integral779migrations nem prova do schema implantado; helpers/copias e ajuste manual do search são fronteiras explícitas. ACL PUBLIC/search_contacts e reaplicação soft-delete excluídas deliberadamente504–506/735–740. Asserts CRUD658–661 usam lista em has_table_privilege, que não discrimina cada privilégio; string de texto do helper não prova plano/custo. Estado final antecede migrations posteriores da cadeia.

**Adjudicação:** set -Eeuo pipefail, psql ON_ERROR_STOP, ready check duplo; trap remove container só com nome esperado e tempdir com prefixo validado44–52. Se executado, altera apenas fixtures/container especificado; nenhum comando executado nesta revisão. Limites de CRUD enviados ao revisor DB, sem novo ID.

## 2. `scripts/db-audit/gen-types.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 102]]; total: 102 linhas; blob: `d18aa236314e4b372720879947499e3a2add0c24`.

**Contrato exercitado:** Script invoca gen-types.sh real com CLI supabase stub, compara bytes do output/EOF, exige3tentativas em2timeouts+sucesso e falha persistente com3tentativas, e aviso de retry.

**Fixtures e substituições:** Executáveis shell fake no PATH; DSN fixture.invalid, CI vazio, retry delay0; contador em tempdir.

**Controles positivos:** cmp verifica linhas internas/EOF; falha persistente não aceita sucesso e contador evita passar só pelo exitcode.

**Limites e lacunas concretas:** Leitura sem executar; não usa CLI real/banco, outros tipos de erro ou saída inválida. Não verifica preservação de output anterior em falha nem argumentos enviados ao stub; depende cwd raiz por paths relativos.

**Adjudicação:** set-euo; mktemp único e trap EXIT remove pasta criada. Se executado, código real gen-types.sh continua fronteira de efeitos não analisada por este único script; não o executamos.

## 3. `scripts/db-audit/generic-migration-runtime.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 167]]; total: 167 linhas; blob: `53af2ab1dda15942931ab34bdd485182589d7c22`.

**Contrato exercitado:** Harness PG17 sem rede usa generic-migration-runtime.sql real, exige JSON não vazio com18campos, hashes formato64hex, invariância de duas leituras, mudanças por DDL/ACL/ledger e invariância de DML/ANALYZE/outroschema.

**Fixtures e substituições:** Schema mínimo t1/t2/f1 e ledger sintético; Docker postgres:17-alpine ou override;12snapshots de SQL real.

**Controles positivos:** Validação JSON evita falso positivo de dois arquivos vazios; corpo-only f1 alterado e ACL exercitados; conta12arquivos efetivos.

**Limites e lacunas concretas:** Não executado. Comparações diff verificam JSON completo, não cada hash isoladamente: mudança em contador pode satisfazer desigualdade sem provar sensibilidade do hash alegado. Policy+index mudam juntos119–123, portanto não isolam ambos; não cobre qualquer forma DDL nem TOCTOU inteiro do workflow. Comentário reconhece que contrato não prova semântica de migration.

**Adjudicação:** --network none, psql ON_ERROR_STOP, readiness consulta+logs; cleanup valida prefixo do container e remove test_dir de mktemp. Leitura inclui SQL/Node embutidos sem executá-los.

## 4. `scripts/db-audit/multiplix-scope.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 328]]; total: 328 linhas; blob: `f585bd05aa49853759d79c6402a742fe7caea80f`.

**Contrato exercitado:** Bloco estático procura shape de schemas e origem textual de scopePermissions; bloco vivo, quando habilitado, autentica contas agent/supervisor e compara count/search da Edge com RPC Singu assinada, incluindo campos scope forjados.

**Fixtures e substituições:** Sem stubs no bloco vivo: contas prévias de arquivo externo, JWT senha, service-role externo e HMAC via env ou leitura vault pela Management API; matriz esperada de papéis codificada242–250. Só fonte foi lida; nenhum arquivo de segredo/serviço acessado.

**Controles positivos:** Contagem comparada por caminhos Edge/RPC e há casos sem acesso a fornecedores para agente; erro HTTP conta diferente é detectado, retry restrito a5xx.

**Limites e lacunas concretas:** Ausência de credenciais/python/contas suficientes encerra0 como PULADO107–112/238–240; sucesso do comando sozinho não prova bloco vivo. Exige≥1agent+≥1supervisor, não exatamente3, mas imprime3perfis325. Grep/awk não provam fluxo de dados semântico. Search amostra5linhas, sem conteúdo ou carteira de cada linha. Para supervisor, contraprova forjada compara com0 (303), embora o payload forjado peça admin e referências sup/admin sejam iguais: esse ramo não discrimina escopo admin honrado. Não testa nav/rota/RLS e não é prova exaustiva de segmentos. Auth password cria sessão: comentário nenhuma escrita deve ser entendido sem mutation de dados de negócio, não ausência de efeito Auth; script não faz logout.

**Adjudicação:** Revisado integralmente inclusive Python embutido/consulta vault; não executado. Sem cleanup de sessão criada por login. Nenhum achado novo semântica produto contado; limites de evidência enviados ao root.

## 5. `scripts/db-audit/talkx-audience-rpc.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 413]]; total: 413 linhas; blob: `94d7473872c4f8e570f4690b907de7aaa881faaf`.

**Contrato exercitado:** Harness aplica/reaplica migration real X016 e verifica counts12/6/2/1/3, paginação keyset4+2 com IDs exatos/disjuntos, operadores e tipos, ACL público/interno, gate agente e união de segmentos/supressão.

**Fixtures e substituições:** Schema mínimo de Auth/perfis/contatos/segmentos/blacklist manual; helper visibilidade usa boolean visible em vez da cadeia canônica;12contatos com casos deleted/LID/inválido/expiração/remoção.

**Controles positivos:** expect_error verifica status+mensagem+SQLSTATE; paginação exige next_after e conjuntos exatos; supressão true/false altera6para8; RPC invocada sob papéis reais do container.

**Limites e lacunas concretas:** Não executado; contrato de migration isolada, sem RLS canônica de contatos/implantação. Operadores gt+gte/lt+lte agrupados deixam parte das condições redundantes para fixture; datas longe das fronteiras não validam recorte de meia-noite/DST. Não testa race/paginação sob alterações ou regra injetada fora dos poucos inválidos.

**Adjudicação:** Container PID-nome com trap EXIT; retry somente bootstrap e duas sondas; psql ON_ERROR_STOP. Nenhum processo iniciado nesta revisão.

## 6. `scripts/db-audit/talkx-audience-snapshot.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 346]]; total: 346 linhas; blob: `97fcb8cb9c5c660f3daad47f639def0c49f7a5bf`.

**Contrato exercitado:** X016+X017 reais sobre fixture verificam snapshot de segmento com6recipients exatos,2supressos/1inválido, total e timestamp, reexecução supervisor sem duplicar, mismatch revision40001, flag supressão false22023 e agente42501/anonsemEXECUTE.

**Fixtures e substituições:** Schema mínimo manual com9contatos Acme e2rascunhos; visibility helper simplificado; timezone helper aceita somente America/Sao_Paulo; nenhum SDK/UI.

**Controles positivos:** Inspeciona linhas persistidas e IDs, não apenas JSON de retorno; negativos exigem código e mensagem; aplica X017duasvezes.

**Limites e lacunas concretas:** Não executado; revisão antiga do título usa99 contraatual1 (mismatch futuro), não alteração concorrente real. supervisor substitui snapshot sequencialmente; sem concorrência, usuário inativo, estado não draft, origem contacts/CRM ou quantidade grande. Cabeçalho banco+front/hook não monta frontend.

**Adjudicação:** Trap EXIT limpa container do PID; bootstrap retry/double-ready e psql ON_ERROR_STOP; nenhum SQL executado nesta auditoria.

## 7. `scripts/db-audit/talkx-campaign-segments.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 366]]; total: 366 linhas; blob: `519f57d4306a4761456bc9cccf3ee95fb2af0f5a`.

**Contrato exercitado:** X057 real aplicada uma vez: catálogo da tabela/colunas/PK/unique/checks, RLS+nomes/comandos de5policies, coluna recipient nullable/índice ordenado, backfill4estados e publicação de2tabelas; inserts válidos e violações SQLSTATE confirmam constraints.

**Fixtures e substituições:** Schema mínimo manual de perfis/roles/campaigns/segments/recipients;5campanhas3segmentos; PG17 wal_level logical e publicação prévia.

**Controles positivos:** CASE_SEEN exige7casos, valores backfill exatos e casos0/11posição, duplicata PK/position e status inválido distinguem checks reais de texto.

**Limites e lacunas concretas:** Não executado. Explicitamente estrutural/aditivo: não prova RPC save/snapshot, ordenação de audiência ou fluxo realtime. RLS só ligada+catálogo de nomes/comandos, sem acesso sob authenticated/anon; não promove existência de policy a autorização. Replay é deliberadamente excluído24–27.

**Adjudicação:** Trap EXIT limpa container, bootstrap retenta somente início com dupla sonda, psql ON_ERROR_STOP; nenhum SQL executado nesta revisão.

## 8. `scripts/db-audit/talkx-draft-save.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 291]]; total: 291 linhas; blob: `3aa4bf86a5d6109ea614f3fb7d0d32f344ac1a64`.

**Contrato exercitado:** Aplica8migrations reais de draft/flags/step/owner/role; testa create idempotente por ator, conflito de payload, revisão stale sem alterar nome, gate agente/inativo, conexão viva/offline/instância vazia, mensagem vazia/4097, owner e responsible legado ignorado, agendamento bloqueado/liberado.

**Fixtures e substituições:** Schema manual mínimo, Auth helpers,4perfis/3connections, timezone limitadoSP. SQL sob SET ROLE authenticated com claims; conexão é linha sintética, não provedor vivo.

**Controles positivos:** Persistência de nome/revision/owner consultada após RPC; mesma chave em outro ator cria ID diferente; stale preserva dado e agendamento sem mensagem continua draft antes de contraparte válida.

**Limites e lacunas concretas:** Não executado nem replay integral; migrations posteriores não aplicadas. Maioria de negativos captura output com ||true e confere marcador, sem status/SQLSTATE separado (4097 inclui22023). Não testa requests concorrentes simultâneos, RLS/claims real da implantação ou entrega de agendamento. Desativação246 fica no mesmo comando que erro e não equivale a sessão revogada.

**Adjudicação:** Controle positivo dos gates is_active em TalkX restringe alcance de AUTH004. Trap EXIT/containerPID e ON_ERROR_STOP; sem executar comandos.

Relacionados, sem nova contagem: R2-AUTH-004.

## 9. `scripts/db-audit/talkx-metrics-view-invoker.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 253]]; total: 253 linhas; blob: `a7e46fd33e866363b0aefee7d64f90f863c916dc`.

**Contrato exercitado:** Harness fixture da view vulnerável exige guard real falhar e authenticated A/B lerem2campanhas; aplica/reaplica migration invoker e exige1porator, guardverde; mutações RESET/recreate/revoke/drop voltamguardvermelho.

**Fixtures e substituições:** View simplificada e policy de dono criadas manualmente;2perfis/2campanhas; guard SQL/migration reais carregados, schema mínimo sem demais policies vigentes.

**Controles positivos:** Authenticated de fato via SET LOCAL ROLE41–49, counts2→1 e guardstatus+mensagem; mutações adversárias dão controle de sensibilidade do guard.

**Limites e lacunas concretas:** Não executado. Caso service_role230–231 chama psql_query como postgres37 sem SET ROLE: não comprova acesso de service_role. Counts não medem métricas reais nem consumidor useTalkXInsights; fixture anterior declarada não comprova estado vivo e cadeia SQL completa não reproduzida.

**Adjudicação:** Cleanup valida prefixo container e trapsEXIT/INT/TERM; readinesstwo-logmarkers+SELECT; SQL ON_ERROR_STOP. Locus de papel incorreto enviado ao root para limite GOV003, sem novo finding Auth.

## 10. `scripts/db-audit/talkx-send-interval-teto-24h.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 193]]; total: 193 linhas; blob: `df4a279b05a9029de6309b45eb0974b5b95f503f`.

**Contrato exercitado:** A2 real aplicada/reaplicada: UPDATE direto extremo é recusado com nome da constraint,24h aceito; RPC acima24h devolve marcador invalid_talkx_limits_values, limites86400000 e5000 persistem.

**Fixtures e substituições:** Schema mínimo, perfil agent+helper admin via profiles.role (não user_roles), campanha única; Auth funções de claims e eventos manuais.

**Controles positivos:** Fronteira exata e24h+1 distinguidas; RPC sob SET LOCAL ROLE authenticated; valores salvos consultados após chamadas.

**Limites e lacunas concretas:** Não executado. Negativos não conferem status/SQLSTATE: psql sem VERBOSITYverbose; nome de constraint/erro não prova códigos23514/22023 anunciados. grep -qv na160 prova existir uma linha sem constraint, não ausência da constraint no output. Schema/migration isolados, sem gates posteriores, RLS completa ou consumo worker.

**Adjudicação:** Trap prefixo validado EXIT/INT/TERM, ON_ERROR_STOP e readiness; limite grep e promessa SQLSTATE comunicados ao root para evidência de testes.

## 11. `scripts/db-audit/talkx-v12-lifecycle-events.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 209]]; total: 209 linhas; blob: `28cfea1062d87f62a68124149ccb1300be2e1783`.

**Contrato exercitado:** V12 real troca fixture transição sem evento por4eventos started/paused/resumed/cancelled e completed; confere motivo pausa,5recipientscancelled, cancelado não completa e start emsending não duplica evento.

**Fixtures e substituições:** Schema mínimo manual, transição antiga copiada/simplificada, uma campanha5recipients; sequência rodando como postgres com claim role service_role.

**Controles positivos:** RED0/GREEN4 distingue persistência de evento; controle no-op e estado cancelado conferem retorno e contagem.

**Limites e lacunas concretas:** Não executado. Cabeçalho ator correto11 não é coberto: nenhum assert actor_id. claim service_role não troca role SQL, então não prova ACL/grants de service_role. Não reproduz cadeia atual, atores autenticados, worker concorrente ou ordem determinística de timestamps empatados; ORDER BY created_at168 sem desempate.

**Adjudicação:** Cleanup valida prefixo container, trapsEXIT/INT/TERM, ON_ERROR_STOP/readiness. Apenas leitura do SQL embutido.

## 12. `scripts/db-audit/talkx-v17-read-at.test.sh`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 124]]; total: 124 linhas; blob: `14d66a1aa014f580d2304933b06aec4b8d2c5f13`.

**Contrato exercitado:** Harness V17 aplica migration real após fixture RPC2args, chama delivered/read e exige retorno true, read_at preenchido, read_count1 mantido após segunda chamada.

**Fixtures e substituições:** Schema mínimo campanha/recipient/template_variants; função antiga copiada no heredoc; uma campanha/um recipient externo; postgres com claim service_role.

**Controles positivos:** Verifica dado persistido e contador, não apenas ausência de erro; segunda chamada testa não duplicar contador.

**Limites e lacunas concretas:** Não executado. psql wrapper9 usa ON_ERROR_STOP=0 inclusive setup/migration: erro SQL intermediário pode não interromper, embora asserts posteriores detectem parte das falhas. RED95 aceita substring genérica function, sem SQLSTATE/assinatura exata. Sem SET ROLE service_role, ACL real não é exercida; não testa erro/resultado da segunda chamada, read antes delivered, conexão errada, concorrência ou múltiplos recipients.

**Adjudicação:** Cleanup valida prefixo do container e trapsEXIT/INT/TERM; readinessconsulta+logs. Nenhum Docker/SQL executado nesta revisão; não conclui que suíte passa.

