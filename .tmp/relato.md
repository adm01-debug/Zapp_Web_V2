Especialista: worker (testes) (area-testes-do-produto)

# Fixture do talkx-monitor-panel.test.sh (bloco motor N-117)

## Numeros do diff (conferidos)
- `git diff --stat 63e3556d76 HEAD` = **2 arquivos, 1 deles de teste**:
  `A scripts/db-audit/talkx-monitor-panel.test.sh` (403 linhas, o unico arquivo que o cartao
  permite tocar) e `M .tmp/relato.md` (este relato). Nenhum outro arquivo entrou na branch.

## O que mudou e por quê
- `scripts/db-audit/talkx-monitor-panel.test.sh` (unico arquivo do escopo): o schema minimo do
  teste criava `talkx_recipients` sem o trigger `update_talkx_recipients_updated_at`; a migration
  X140 faz `ALTER TABLE ... DISABLE TRIGGER update_talkx_recipients_updated_at` e, sem o trigger,
  abortava — o teste morria em "(0) migration do monitor aplicada". Passei a criar no fixture a
  funcao real `public.update_updated_at_column()` e o trigger, como na base (migrations
  20251215024517 e 20260409000457).
- `scripts/db-audit/talkx-monitor-panel.test.sh`: o caso (10) ("migration replayavel") reaplicava
  SOMENTE a migration do monitor (X140), que nao tem o bloco motor; isso derrubava a funcao do
  N-117 vinda da migration do engine health e `health.motor` deixava de existir — era a causa real
  do `FAIL: motor.stalled_campaign [esperado: true | obtido: ]`. Passei a reaplicar tambem a
  migration do engine health logo depois, para o estado final ficar igual ao da base.
- `scripts/db-audit/talkx-monitor-panel.test.sh`: a view de fixture passa a espelhar as colunas e
  tipos da view real `talkx_engine_health` (migration 20261003242707): kind text, observed_at
  timestamptz, metric_count bigint, metric_rate numeric, status text, return_message text.

## Prova
Comando: `bash scripts/db-audit/talkx-monitor-panel.test.sh`

- vermelho antes (fixture sem o trigger, medido na 1a rodada): `FAIL: migration do monitor nao aplicou`
  (`ERROR: trigger "update_talkx_recipients_updated_at" for table "talkx_recipients" does not exist`).
- vermelho antes (caso 10 reaplicando so o X140): `FAIL: motor.stalled_campaign [esperado: true | obtido: ]`
  — 13 PASS antes dele, inclusive `PASS: (10)`.
- verde depois: `PASS: todos os 20 casos medidos`, com
  `PASS: (11) bloco motor presente em health com stalled_campaign=true, stale_lease=true,
  outcome_unknown_24h=3, failure_rate_15m=0.12, cron_status=ok` — os 5 criterios de aceite do cartao.
- mutacao do terceiro item: voltei `metric_rate` para `double precision` (o tipo do fixture anterior)
  mantendo as outras duas correcoes -> `PASS: todos os 20 casos medidos`. Ou seja, o tipo sozinho NAO
  era a causa da falha (a causa eram os dois itens acima); manter `numeric` e fidelidade a view real.
  Logs: `.tmp/run1.txt`, `.tmp/run2.txt`, `.tmp/run3-mut-tipo.txt`, `.tmp/run4-final.txt`.

## O que NAO fiz e por que
- NAO commitei as duas migrations que o teste exercita (`20261010060000_talkx_monitor_panel.sql` e
  `20261010085230_talkx_monitor_panel_engine_health.sql`) nem `scripts/ci/check-test-inventory.mjs`:
  o cartao permite so o arquivo de teste (reorientacao do supervisor, 13/10). Para rodar as duas
  provas acima restaurei as migrations apenas no worktree, executei e as retirei antes do commit:
  o diff da branch contra a base `63e3556d76` tem 2 arquivos — o teste
  (`A scripts/db-audit/talkx-monitor-panel.test.sh`, o unico do escopo) e este relato
  (`M .tmp/relato.md`) — e mais nada.
- `depende de t_e295a21f` (N-117 motor health) e da migration X140 do monitor panel: nenhuma das duas
  esta na branch do dia, entao na base o teste para em
  `FAIL: migration ausente: supabase/migrations/20261010060000_talkx_monitor_panel.sql`
  (log `.tmp/run5-base-sem-migration.txt`). Os 5 criterios de aceite ficam verdes assim que as duas
  migrations entrarem; nao os medi contra a base porque a base nao tem o codigo que o teste mede.
- `REGISTRO PENDENTE: scripts/db-audit/talkx-monitor-panel.test.sh` — a entrada em `db-guard.yml`
  (ou na ALLOWLIST de `check-test-inventory.mjs`) e do dono do workflow; `node scripts/ci/check-test-inventory.mjs`
  acusa o arquivo como orfao (5 orfaos hoje, 4 deles ja na base: department-invite-contract-audit-vocabulary,
  talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race). Nao editei o
  inventario: fora do escopo do cartao.
