- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 23s;OK lint 0s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 18:31, gerados por máquina: valem mais que números escritos à mão)
```
 ...20261015211601_auditoria_config_operacional.sql | 130 ++++++
 supabase/tests/auditoria_config_operacional.sql    | 483 +++++++++++++++++++++
 2 files changed, 613 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015211601_auditoria_config_operacional.sql, supabase/tests/auditoria_config_operacional.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261015211601_auditoria_config_operacional.sql (novo): um gatilho
  AFTER INSERT/UPDATE/DELETE por tabela de configuracao operacional (public.queues,
  public.queue_members, public.whatsapp_connection_queues, public.rate_limit_configs) chamando
  public.audit_operational_config() — SECURITY DEFINER, RETURNS trigger, SET search_path =
  pg_catalog, public, EXECUTE revogado de PUBLIC/anon/authenticated (funcao de gatilho nao se
  chama por RPC). Cada operacao grava UMA linha em audit_logs: user_id = auth.uid(),
  entity_type = nome da tabela, entity_id = uuid do registro, action = vocabulario do cartao
  (queue_created|queue_updated|queue_deleted, queue_member_*, connection_queue_linked|
  connection_queue_unlinked|connection_queue_updated, rate_limit_config_*), details =
  {op, new|old|changed, actor_kind, actor_db_role, actor_app_name, actor_addr}. No UPDATE entram
  SO as colunas que mudaram (updated_at fica fora: e reescrito por update_*_updated_at em toda
  mudanca); no DELETE entra o estado anterior inteiro. Na migration nao ha tabela, coluna, policy,
  dado, indice ou GRANT novo — so o REVOKE da propria funcao.
- supabase/tests/auditoria_config_operacional.sql (novo): suite .sql no padrao do repo (superficie
  minima + \i dos arquivos REAIS que criam as tabelas/policies + \i da migration do cartao),
  rodando o DML como os papeis reais (SET LOCAL ROLE authenticated + request.jwt.claims). Cobre:
  1 evento = 1 linha, autor certo, diff minimo, estado anterior no DELETE, desvincular,
  usuario comum nao altera config (RLS) nem forja a trilha (sem policy de INSERT em audit_logs),
  EXECUTE revogado, e o rollback do proprio arquivo rodado verbatim (sem os gatilhos, nada e
  gravado). O cabecalho traz a receita de execucao em banco descartavel.

## Prova
- vermelho antes (suite sem a migration, `-v sem_conserto=1`):
  `ERROR: AUDIT-CFG FALHOU [T0g os quatro gatilhos do cartao existem]: esperado 4, obtido 0` (exit 3).
- verde depois (mesma suite): 60 PASS, ultima linha `NOTICE: PASS [L1 total de eventos do cartao = 14] -> 14`,
  `TODOS OS BLOCOS PASSARAM — auditoria da configuracao operacional` (exit 0). Log em .tmp/verde-t_a8be1908.log.
- banco local: `hermes-db-migrar supabase/migrations/20261015211601_auditoria_config_operacional.sql`
  -> `APLICADA no banco LOCAL 'v2-26101518086c9d' (producao nao foi tocada)`.
  Depois do ajuste de vocabulario (created/updated/deleted) reapliquei o MESMO arquivo com
  `zapp-db-local psql . v2-26101518086c9d < supabase/migrations/20261015211601_auditoria_config_operacional.sql`
  (CREATE OR REPLACE, idempotente) porque o hermes-db-migrar recusa reaplicar arquivo ja anotado como
  APLICADA_LOCAL; o arquivo commitado e exatamente o que foi reaplicado.
- smoke no banco local, schema real (BEGIN/ROLLBACK, nada persistiu): INSERT em queues ->
  `queue_created | queues | tem_id t | actor_kind service_role_or_direct_sql`; 4 gatilhos presentes
  (audit_queues_config, audit_queue_members_config, audit_connection_queues_config,
  audit_rate_limit_configs_config) e nenhum dos dois update_*_updated_at tocado por mim.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (198s)` (o banco nao entra nesse modo: o
  fechar nao passa nome de conjunto).
- guarda secdef no banco local: a minha funcao NAO aparece na lista; a guarda acusa 4 offenders
  PRE-EXISTENTES de outros cartoes (enforce_conversation_status_transition, get_last_message_dates,
  is_account_locked, set_conversation_status) — nao toco neles.

## Efeitos colaterais (passada antes do relato)
- Gatilhos das 4 tabelas lidos antes: so os update_*_updated_at (BEFORE UPDATE) + os meus (AFTER).
  Meu codigo nao faz UPDATE em nada: so um INSERT em audit_logs, na mesma transacao do DML (atomico).
- audit_logs nao tem gatilho proprio; o INSERT do definer nao passa por RLS (provado: authenticated
  grava a fila e o evento sai, mesmo sem policy de INSERT em audit_logs).
- Nenhum GRANT/papel/ACL existente mudado; a resposta e a mesma para registro existente e inexistente.
- Trade-off assumido e documentado: se um INSERT em audit_logs falhar, a transacao do autor reverte
  junto — rastro garantido e o mesmo contrato dos gatilhos de papel que ja existem.

## O que NAO fiz e por que
- src/integrations/supabase/types.ts sem mudanca: os tipos gerados nao carregam funcao de gatilho
  (audit_role_changes tambem nao esta la) e o passo `tipos` do zapp-verify passou.
- A allowlist de acoes do log_audit_event e do cartao PE-19: deixei o vocabulario escrito no
  cabecalho da migration e registrei o handoff em kanban_comment (nao crio a lista aqui).
