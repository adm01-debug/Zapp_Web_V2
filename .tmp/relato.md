Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261007095739_indeterminate_optout_outbox.sql: removi `ALTER TABLE public.messages DISABLE TRIGGER update_messages_updated_at` e o `ENABLE TRIGGER` correspondente do ramo `v_existing.id IS NOT NULL` de `ingest_inbound_message`. A funcao nao e SECURITY DEFINER e roda como service_role, entao o ALTER falharia em producao com "must be owner of table messages", alem de tomar ACCESS EXCLUSIVE em `messages` a cada redelivery e mudar o `updated_at` fora do escopo. O UPDATE de redelivery ficou igual ao do ingest anterior; o gatilho da tabela nunca e tocado.
- Mesmo arquivo: `CREATE TABLE public.inbound_message_effects` passou a `CREATE TABLE IF NOT EXISTS` e a constraint `inbound_message_effects_effect_check` ja nasce com `'optout_resolve'` na lista (antes era criada sem esse valor e depois dropada/recriada na mesma migration). A idempotencia nao quebra dado existente: reaplicar nao recria a tabela nem perde linhas.

## Prova
- Migration aplica limpo no banco local da tarefa: `hermes-db-migrar supabase/migrations/20261007095739_indeterminate_optout_outbox.sql` → `BEGIN ... COMMIT` + `APLICADA no banco LOCAL 'v2-2610120027a9c6' (produção não foi tocada).`
- Recriacao completa do banco local (`zapp-db-local up . v2-2610120027a9c6`, 823 migrations na sequencia): migration entra sem falha; `TRAVAS: conferidas (DNS da produção preso, agendador desligado, pg_net sem envio)`.
- Estado real dos objetos no banco reconstruido (psql):
  - `select count(*) from information_schema.tables where table_schema='public' and table_name='inbound_message_effects';` → `1`
  - `select pg_get_constraintdef(oid) from pg_constraint where conname='inbound_message_effects_effect_check';` → `CHECK ((effect = ANY (ARRAY['optout_suppress'::text, 'talkx_reply'::text, 'multiplix_reply'::text, 'optout_resolve'::text])))`
  - `select pronargs, (position('DISABLE TRIGGER' in prosrc)=0 and position('ENABLE TRIGGER' in prosrc)=0) from pg_proc where proname='ingest_inbound_message';` → `12|t` (o corpo de 12 argumentos nao tem DISABLE/ENABLE TRIGGER)
  - `select tgname, tgenabled::text from pg_trigger where tgname='update_messages_updated_at';` → `update_messages_updated_at|O` (gatilho segue ligado, nunca desabilitado)
- Rollback da primeira linha `-- Rollback:` (`.tmp/rollback.sql`, executado com ON_ERROR_STOP=1 sobre o banco reconstruido): `DROP FUNCTION / DROP FUNCTION / DROP TABLE` → `rollback_rc=0`; depois: tabela=0, drain=0, ingest=1 (volta a so a versao anterior). Reapliquei a migration em seguida: tabela=1.
- `zapp-verify . --rapido` → `OK db_guard / OK tipos / OK lint / OK migrations` + `VERIFY: VERDE SEM BANCO` (o fechar chama sem o nome do conjunto, entao banco_local fica como AVISO; modo normal da fabrica).

## Pontos do revisor (só em [refazer])
- Ponto 1: DISABLE/ENABLE TRIGGER removidos do ramo `v_existing.id IS NOT NULL`; UPDATE de redelivery igual ao ingest anterior. Provado por `pronargs=12` sem `DISABLE TRIGGER`/`ENABLE TRIGGER` no corpo e pelo gatilho `update_messages_updated_at` ainda `enabled=O`.
- Ponto 3: `CREATE TABLE IF NOT EXISTS` + constraint nasce com `'optout_resolve'` (sem DROP/ADD logo depois). Provado pela definicao da constraint lida do catalogo.
- Ponto 4: tirei do relato a prova de `updated_at` (saiu junto com o item 1). A falha do zapp-verify full em FilesTab e nao relacionada a este cartao (arquivo de frontend; o cartao proibe tocar frontend) — e aqui o criterio e o `--rapido`, que esta verde.
- Teste dedicado: por decisao do cartao, vai no cartao separado t_5e529f7e; nao toquei em supabase/tests nem em scripts/db-audit.

## Sobre o juiz barato (alarme falso — explico, não mudo o código)
- "Não achei no diff um teste que falharia sem a sua mudança": o proprio cartao decide que o teste dedicado vai no cartao separado t_5e529f7e e limita ARQUIVOS QUE PODE TOCAR a migration. Acrescentar teste aqui seria arquivo fora da lista do cartao. A prova deste cartao e a mudanca de estrutura lida do catalogo (constraint e corpo da funcao) e o rollback com ON_ERROR_STOP=1.
- "o UPDATE em messages dispara o gatilho BEFORE UPDATE que regrava updated_at / desligue só esse gatilho ou preserve a coluna": nao procede aqui. O proprio motivo do revisor manda o contrario — remover o DISABLE/ENABLE TRIGGER e "manter o UPDATE como era no ingest anterior", e a secao O QUE NAO MUDAR diz "nao mudar comportamento de updated_at (fora do escopo)". O gatilho disparando na redelivery e o comportamento anterior do ingest, nao um efeito novo desta migration: o diff nao mexe no gatilho nem em updated_at. Desligar o gatilho (ou preservar a coluna) seria exatamente a mudanca de comportamento que o cartao proibe, e o ALTER exige ser dono da tabela (falha como service_role). Repito o mesmo fechar sem mudar o codigo.

## O que NÃO fiz e por quê
- Nao adicionei teste neste cartao: o cartao manda o teste completo no cartao separado (t_5e529f7e) e limita os arquivos a migration.
- Nao toquei frontend, `talkx_optout_keywords` nem comportamento de `updated_at` (fora do escopo).
- Nao mexi em GRANT, papel ou policy: o cartao nao pede; a migration mantem REVOKE/GRANT que ja existiam.
