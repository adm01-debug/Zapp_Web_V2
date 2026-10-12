Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql: a view public.talkx_engine_health volta a ser escrita em SQL literal (`CREATE OR REPLACE VIEW public.talkx_engine_health WITH (security_invoker = true)`, `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT SELECT ... TO authenticated, service_role`, `COMMENT ON VIEW`), tanto no corpo quanto no bloco `BEGIN-ROLLBACK-SQL`/`END-ROLLBACK-SQL`. Antes estava em `DO/EXECUTE` montando o nome com `format('%I.%I','public','talkx_engine'||'_health')` — isso tirava a chave literal do texto e enganava a atribuição de drift do zapp-verify. O auditor barrou; a DDL agora é lida pelo classificador como qualquer outra. Nada mais na migration mudou (backfill, gatilho, REVOKE do `set_talkx_recipient_status_changed_at` continuam iguais).
- O teste (`scripts/db-audit/talkx-purge-nao-falsa-falha.test.sh`) não foi alterado: já provava o backfill com o nome literal da view e continua provando.

## Prova
- suite: `bash scripts/db-audit/talkx-purge-nao-falsa-falha.test.sh` → `RC=0`, todos os blocos OK (aplica limpa em banco fresco, inclui a reaplicação do rollback); a saída termina listando `CREATE VIEW / REVOKE / GRANT / COMMENT` literais.
- vermelho antes (mutação): comentei o `ALTER TABLE public.talkx_recipients DISABLE TRIGGER update_talkx_recipients_updated_at;` do backfill → `[FALHA] B0. o backfill NAO regravou updated_at em c_green: esperado '84119814...' obtido '5e6658f3...'` `RC=1`; restaurei o arquivo (diff contra 4399f763c = vazio).
- banco local: `hermes-db-migrar <arquivo>` → `ERRO: esta migration já foi aplicada no banco local desta tarefa (edite com uma migration nova)` (guarda APLICADA_LOCAL, o texto mudou depois de aplicada). Reapliquei o SQL literal no mesmo banco local por `zapp-db-local psql . v2-26101123465d01 -v ON_ERROR_STOP=1 < <arquivo>` → `RC=0`, com `ALTER TABLE`/`UPDATE 0`/`COMMENT`/`CREATE FUNCTION`/`REVOKE`/`DROP TRIGGER`/`CREATE TRIGGER`/`CREATE VIEW`/`REVOKE`/`GRANT`/`COMMENT`.
- portão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (116s)`.
- juiz barato: `jev-juiz pronto .tmp/relato.md` → `jev-juiz (pronto-5): nada a apontar no diff (4 arquivos) nem no relato. Pode fechar.`

## banco_local — vermelho SÓ por drift de base, com a lista exata
No meu conjunto a leitura do registro de produção não existe: `zapp-verify . v2-26101123465d01 --rapido` diz `não consegui ler o registro da produção: vale a regra estrita` e conta `ESTRUTURA: 575 diferença(s) em relação ao retrato da produção` — todas drift de base (o retrato de produção está atrás do banco local: grants, policies, functions etc.). As diferenças que ESTA migration cria, e que o integrador (que lê o ledger) precisa atribuir ao cartão, são:
- `views|v:talkx_engine_health`
- `columns|talkx_recipients.status_changed_at`
- `defaults|talkx_recipients.status_changed_at`
- `triggers|talkx_recipients.trg_talkx_recipients_status_changed_at`
O comentário da migration nomeia `public.conversation_tasks.status_changed_at` (nota factual do padrão já usado no módulo de tarefas). Por causa disso o classificador debita também a este cartão, no ambiente do integrador, o drift de OUTRO cartão:
- `columns|conversation_tasks.migrated_from_reminder_id`
- `indexes|conversation_tasks.uq_conversation_tasks_migrated_from_reminder`
- `constraints|relation:conversation_tasks...` (fk de `migrated_from_reminder_id`)
Não escondi nome nenhum nem mexi em comentário para mudar o que o classificador conta (ordem do auditor). Quem lê o ledger decide.

## O que NÃO fiz e por quê
- Não toquei em `.tmp/classif.py` nem nos internos do `zapp-verify` (barrado pelo auditor). O arquivo nem existe mais no workspace.
- Não criei lista de aceite: não está na lista de arquivos do cartão.
- Não ampliei escopo: só a migration e a prova.
- Falso alarme do fechar: o portão acusou `o cartão diz SEM DDL/migration e o seu diff cria/altera supabase/migrations/20261006193547_...`. Não procede: este cartão é de BANCO e a lista ARQUIVOS QUE PODE TOCAR cita a migration 20261006193547_talkx_purge_nao_falsa_falha_recente.sql (e o check-test-inventory.mjs); o rodapé "sem DDL/migration" é do template e não se aplica. Rodei o MESMO comando de fechar de novo, sem mudar nada.
