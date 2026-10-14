Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261014020402_voice_command_logs_lgpd.sql` (novo): retenção LGPD do log de comandos de voz.
  1) CHECK `transcript`/`response` em no máximo 2000 caracteres, **NOT VALID** de propósito — não revalida as linhas já gravadas (não quebra histórico nem dispara gatilho) e passa a valer para todo INSERT/UPDATE novo; a validação retroativa fica para o cartão de expurgo (comentado no arquivo).
  2) policy de DELETE `"Users can delete own voice logs"` (`USING auth.uid() = user_id`): o titular apaga só os próprios registros (a de SELECT já restringia a leitura; faltava a de DELETE).
  3) `public.purge_voice_command_logs(p_retention_days DEFAULT 90, p_limit DEFAULT 1000)` — expurgo por prazo (PD-13: 90 dias desta família), **em lote (LIMIT)** e **repetível**: cada chamada apaga no máximo `p_limit` por lote, com teto de 100 lotes, até `deleted = 0`. `SECURITY DEFINER` + `SET search_path = public, pg_temp` + `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role`, guardando por `auth.role() = 'service_role'` e validando faixas de parâmetro (mesmo padrão de `public.purge_talkx_expired_data`). Idempotente (constraint só entra se faltar, policy recriada, `CREATE OR REPLACE`).
- `docs/LGPD-RETENTION-POLICY.md`: linha de `voice_command_logs` (90 dias, Legítimo interesse, Excluir) na tabela 4.3 e item 7 na seção 5.4 chamando a função.
- `supabase/tests/voice_command_logs_lgpd.sql` (novo): suíte T1..T12 no banco LOCAL, exercitando os papéis de verdade.

Nota de arquivo: a versão `20261014020120_...` foi criada e aplicada no LOCAL e **corrigida** (o contador de lotes contava o lote vazio final); como não se edita migration já aplicada, ela foi substituída por `20261014020402_...` (idempotente) e o arquivo antigo saiu de `supabase/migrations/`.

## Esquema e políticas atuais (item 1, lidos no banco LOCAL antes de editar)
`public.voice_command_logs` veio da migration `20260407153654`: colunas `id` uuid PK (`gen_random_uuid()`), `user_id` uuid NOT NULL, `transcript` text NOT NULL, `action` text NOT NULL, `response` text, `data` jsonb DEFAULT `'{}'`, `duration_ms` int, `success` bool DEFAULT true, `created_at` timestamptz DEFAULT `now()`; índices em `user_id` e `created_at`. A migration `20260926200000` (e17) somou a FK `voice_command_logs_user_id_fkey` → `auth.users(id)` ON DELETE CASCADE NOT VALID. No banco local (antes desta migration): RLS ligado, `force_rls = false`, **duas** policies — `Users can insert own voice logs` (INSERT) e `Users can read own voice logs` (SELECT), ambas só para `authenticated` e sobre o próprio `user_id`; **nenhuma** de DELETE; **nenhum** CHECK de tamanho; **nenhum** gatilho (a indexação de `created_at` já serve o filtro de prazo do expurgo, por isso não criei índice novo).

## Prova
Banco LOCAL descartável `v2-26101322425bea` (`zapp-db-local up . v2-26101322425bea` → `UP_EXIT=0`), migrations reais aplicadas; a migration entrou por `hermes-db-migrar` (`APLICADA no banco LOCAL ... produção não foi tocada`).

- verde depois: `zapp-db-local psql . v2-26101322425bea < supabase/tests/voice_command_logs_lgpd.sql` → `OK — voice_command_logs_lgpd: todas as provas (T1..T12) passaram` + `ROLLBACK`, `GREEN_RC=0`.
- vermelho antes (mesmos arquivos, com `DROP POLICY ...`/`DROP FUNCTION ...` na frente, dentro da transação): `ERROR: FALHOU: T5: o titular A deveria ter apagado os proprios registros`, `RED_RC=3`.
- rollback de verdade: executei as 4 linhas do `-- Rollback:` no banco local → `fn_pos_rollback` vazio e `policies = 2` (só as de INSERT/SELECT restaram); reapliquei a migration (`REAPPLY_RC=0`) e o verde voltou a passar.
- papéis reais: o teste faz `SET LOCAL ROLE authenticated/anon/service_role` + `request.jwt.claims` e prova o que passa (gravar/apagar o próprio) e o que é negado (apagar/ler de outro, anon gravar/ler/apagar, authenticated executar o expurgo). Fixture dos titulares em `auth.users` com `session_replication_role=replica`.
- efeitos colaterais conferidos: `voice_command_logs` não tem gatilho (`pg_trigger` = 0 linhas), RLS ligado, `force_rls = false`; a migration só mexe em CONSTRAINT/policy da própria tabela e no GRANT da função nova — nenhum ACL/papel de objeto existente mudou.
- `zapp-verify . --rapido` → `OK dependencias / OK db_guard / OK tipos / OK lint / OK migrations` e `VERIFY: VERDE SEM BANCO (163s)` (`VERIFY_RC=0`). "SEM BANCO" é esperado: o `--rapido` só compara com o banco quando recebe o nome do conjunto; a prova de banco é a suíte SQL acima, no banco LOCAL da tarefa.

## O que NÃO fiz e por quê
- Arquivos do diff: são os 3 do cartão (`supabase/migrations/20261014020402_voice_command_logs_lgpd.sql`, `supabase/tests/voice_command_logs_lgpd.sql` — o único de teste — e `docs/LGPD-RETENTION-POLICY.md`) mais `.tmp/relato.md`, que é este próprio relato (arquivo versionado na base). Não há outro arquivo tocado.
- Não toquei no front: `src/hooks/voice/logVoiceCommand.ts` só faz INSERT (fire-and-forget), não precisa mudar.
- Não agendei cron: o job de expurgo por política é de outro cartão (branch `v2/lgpd-retencao-jobs-26101301294d35`, **retido no portão, não integrado**); a função fica pronta para ele chamar. Registrei em `kanban_comment`.
- Não liguei o teste ao CI: `supabase/tests/*.sql` roda via `zapp-db-local psql`; amarrar/registrar é do worker ci. REGISTRO PENDENTE: `supabase/tests/voice_command_logs_lgpd.sql`.
