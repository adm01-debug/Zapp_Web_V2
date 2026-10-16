Especialista: senior (area-sql-banco)

Refazer aplicado sobre o trabalho anterior: trouxe o commit 83bb5c882 (migration/teste/types de instance_pauses) e corrigi só os pontos da recusa, sem arquivos fora do escopo.

Ponto 1 — supervisor sem perfil/prova completa
- O que mudei: em supabase/tests/instance_pauses.sql criei o perfil sintético do supervisor (v_sup_prof) junto dos demais perfis e adicionei o bloco T5b: supervisor pausa e retoma a própria instância, provando paused_by e resumed_by com o profile_id real dele.
- Teste que prova: zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql.
  Verde depois: NOTICE instance_pauses: T1..T9 OK — 12 grupo(s); NOTICE instance_pauses: suite OK (... T5 retoma idempotente ... T10 rollback executado e estado restaurado).

Ponto 2 — pausa vencida sobrescrita por nova pausa manual
- O que mudei: em supabase/migrations/20261011183812_instance_pauses.sql, pause_instance agora fecha pausas vencidas da mesma instância antes do INSERT (resumed_at = paused_until), preservando reason, paused_by, paused_until e created_at da linha antiga; o novo INSERT cria uma nova linha aberta. Em supabase/tests/instance_pauses.sql, T7b cobre esse fluxo e exige 2 linhas.
- Vermelho antes: apliquei temporariamente as funções sem o fechamento de vencidas e rodei a suíte nova; falhou com ERROR: T7b FALHOU: pausa vencida + nova pausa manual deveria manter 2 linhas (encontrou 1).
- Verde depois: reapliquei a migration corrigida e a mesma suíte SQL passou com NOTICE instance_pauses: T1..T9 OK — 12 grupo(s) e NOTICE instance_pauses: suite OK (... T7 vencida nao conta ... T10 rollback executado e estado restaurado).

Ponto 3 — auto_pause_instance em cima de pausa manual vencida
- O que mudei: em supabase/migrations/20261011183812_instance_pauses.sql, auto_pause_instance recebeu o mesmo fechamento prévio de pausas vencidas antes do UPSERT, para não sobrescrever histórico manual antigo. Em supabase/tests/instance_pauses.sql, T8b cria uma pausa manual vencida, chama auto_pause_instance como service_role e confere que a linha antiga foi fechada/preservada e que a nova linha é auto=true, paused_by NULL.
- Vermelho antes: a prova temporária sem fechamento de vencidas falhou antes no mesmo defeito-raiz (T7b encontrou 1 linha, porque a linha vencida era atualizada em vez de criar histórico novo).
- Verde depois: zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql passou; T8b faz parte dos 12 grupos reportados pela suíte.

Ponto 4 — is_instance_paused não normalizava espaços da instância
- O que mudei: em supabase/migrations/20261011183812_instance_pauses.sql, is_instance_paused compara p.instance com btrim(p_instance). Em supabase/tests/instance_pauses.sql, T1 consulta a instância com espaços em volta e exige true.
- Vermelho antes: depois de adicionar o teste e antes da correção, hermes-db-migrar supabase/migrations/20261011183812_instance_pauses.sql && zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql falhou com ERROR: T1 FALHOU: is_instance_paused deveria aplicar btrim no parametro de consulta.
- Verde depois: a mesma suíte SQL passou com NOTICE instance_pauses: T1..T9 OK — 12 grupo(s) e NOTICE instance_pauses: suite OK.

Ponto 5 — rollback precisa ser executado, não só descrito
- O que mudei: mantive o rollback executável no cabeçalho da migration e ampliei supabase/tests/instance_pauses.sql para executar o bloco de rollback em SAVEPOINT, conferir remoção de funções/tabela e dar ROLLBACK para restaurar o estado local.
- Teste que prova: na saída verde aparece SAVEPOINT, DROP FUNCTION x4, DROP TABLE, ROLLBACK e NOTICE instance_pauses: suite OK (... T10 rollback executado e estado restaurado).

Arquivos alterados (git diff --name-only dia/2026-10-11...HEAD):
.tmp/relato.md
src/integrations/supabase/types.ts
supabase/migrations/20261011183812_instance_pauses.sql
supabase/tests/instance_pauses.sql

Verificações executadas:
- Vermelho T1/btrim: hermes-db-migrar supabase/migrations/20261011183812_instance_pauses.sql && zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql -> exit 3, ERROR: T1 FALHOU: is_instance_paused deveria aplicar btrim no parametro de consulta.
- Vermelho T7b/histórico vencido: zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < .tmp/instance_pauses_sem_fechamento_vencida.sql && zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql -> exit 3, ERROR: T7b FALHOU: pausa vencida + nova pausa manual deveria manter 2 linhas (encontrou 1).
- Verde SQL local: zapp-db-local psql . v2-2610112155e997 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql -> exit 0, NOTICE instance_pauses: T1..T9 OK — 12 grupo(s); NOTICE instance_pauses: suite OK (... T10 rollback executado e estado restaurado).
- zapp-verify . --rapido -> exit 0, OK dependencias, OK db_guard, OK tipos, OK lint, OK migrations; VERIFY: VERDE SEM BANCO. O banco local foi coberto pelo comando SQL específico acima.

Autorrevisão:
- Não alterei CI, guardas, manifesto, docs ou tela.
- Não há escrita dupla dependente fora do banco: o fechamento da vencida e a nova pausa ficam na mesma função SQL.
- Nenhum erro de banco/rede novo é ignorado; não há catch ou fallback novo.
- O teste executa SQL real no banco local e executa o rollback da migration.
- Diff total abaixo do limite: 4 arquivos, 997 inserções e 14 deleções no commit, todos do pedido original/refazer (inclui .tmp/relato.md exigido pelo fechamento).
