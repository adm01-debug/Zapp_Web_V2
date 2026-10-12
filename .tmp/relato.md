Especialista: senior (area-sql-banco / workersql)

Ponto 1 — backfill atrás da flag inbox.status-fsm
O que mudei: em supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql, o UPDATE de backfill agora só roda quando existe feature_flags.key = 'inbox.status-fsm' com enabled IS TRUE. O DISABLE/ENABLE do trigger update_contacts_updated_at continua só em volta desse UPDATE.
Teste que prova: C5 em supabase/tests/contacts_waiting_por_atribuicao.sql executa a migration real dentro da transação do teste. Vermelho sem a correção: troquei temporariamente a migration copiada para o container por uma versão sem o predicado da flag; comando `zapp-db-local psql . refazert41 -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql` retornou rc=3 com `ERROR: C5 FALHOU: migration real com flag desligada alterou o estado (waiting / ...)`. Verde com a correção: o mesmo comando retornou rc=0 e `NOTICE: contacts_waiting_por_atribuicao: C5 flag desligada OK (migration real nao mexeu no backfill)`.

Ponto 2 — C5 cobre flag desligada, flag ligada e idempotência
O que mudei: em supabase/tests/contacts_waiting_por_atribuicao.sql, substituí o C5 que repetia o UPDATE por blocos que reexecutam a migration real via `/tmp/20261011174630_contacts_waiting_por_atribuicao.sql`: primeiro com a flag desligada, depois com a flag ligada, e depois uma segunda rodada para garantir que o backfill não reescreve o carimbo.
Teste que prova: `docker cp supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql "$c:/tmp/20261011174630_contacts_waiting_por_atribuicao.sql" && zapp-db-local psql . refazert41 -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql` retornou rc=0 com os notices: `C5 flag desligada OK`, `C5 flag ligada OK` e `C5 idempotencia OK`.

Ponto 3 — relato ajustado com efeito esperado em promoção
O que mudei: este relato registra o comportamento corrigido: as cerca de 315 conversas abertas sem responsável só passam a "Aguardando" quando a flag `inbox.status-fsm` estiver ligada na promoção. Com a flag desligada, a migration cria/atualiza função e trigger, mas o backfill não muda nenhuma linha.
Teste que prova: a execução verde acima mostrou `UPDATE 0` na rodada com flag desligada e `UPDATE 1` na rodada sintética com flag ligada.

Rollback
Comando executado no banco local dentro de transação: rollback do bloco da migration seguido de ROLLBACK. Resultado: `DROP TRIGGER`, `DROP FUNCTION`, `ALTER TABLE`, `UPDATE 0`, `DELETE 1`, `ROLLBACK` (rc=0). Nada foi aplicado em produção.

Arquivos alterados (`git diff --name-only dia/2026-10-11...HEAD`): 3 arquivos no total, sendo 1 arquivo de teste.
.tmp/relato.md
supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql
supabase/tests/contacts_waiting_por_atribuicao.sql

Verificações executadas:
- `zapp-db-local up . refazert41` — rc=0.
- Vermelho sem a correção do backfill: rc=3, `ERROR: C5 FALHOU: migration real com flag desligada alterou o estado (waiting / ...)`.
- Verde com a correção: rc=0, notices `C1...C4`, `C5 flag desligada OK`, `C5 flag ligada OK`, `C5 idempotencia OK`, `ROLLBACK`.
- Rollback da migration em transação local — rc=0.
- `git diff --check` — rc=0.
- `zapp-verify . --rapido` — rc=0: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (74s)`.
- `zapp-verify . refazert41 --rapido` — rc=1 em `banco_local` por 120 diferenças de estrutura já existentes no retrato local/produção; não alterei manifesto, guarda nem lista de aceites para maquiar esse desvio.

Commit: af158cab7 fix(banco): respeita flag no backfill de aguardando
