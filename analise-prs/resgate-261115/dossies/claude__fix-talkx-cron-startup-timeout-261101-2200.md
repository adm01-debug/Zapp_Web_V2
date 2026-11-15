# claude__fix-talkx-cron-startup-timeout-261101-2200 — OBSOLETA

- Ref: `origin/claude/fix-talkx-cron-startup-timeout-261101-2200` (tip `9db8ac785`, base `1252bb5a4`, 2026-11-01)
- PR: 2514 (fechada). Triagem 2026-11-08: OBSOLETA — **confirmado com dados de produção**.
- Diff: 1 arquivo, +244 linhas — `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` (migration nova, ausente na main).
- Commits: `c79519c78` (fix CRITICAL-3), `b72e9d3a2` (retenção 7→30d), `f8fb0ae0b` (sintaxe PL/pgSQL), `9db8ac785` (merge main).

## Propósito declarado
Corrigir 4.007 falhas em 30 d (9,3%) do job `talkx-scheduler-1min`, atribuídas a:
C1 falta de índice em `cron.job_run_details(jobid, start_time)` → seq scan de 69 MB → statement timeout;
C2 `talkx_engine_cron_runs` sem janela temporal; C3 `WHEN OTHERS` não captura `query_canceled` (57014);
bônus: advisory lock contra sobreposição de ticks. Mais um job de retenção de 30 d.

## Arquivo × achado × evidência (produção `tnnnlkbymytvtqngbbqh`, somente leitura)

| Hunk | Estado na main / produção | Evidência |
|---|---|---|
| Migration `20261026200300` | nunca aplicada | `select version from supabase_migrations.schema_migrations where version='20261026200300'` → `null`; `git ls-tree origin/main supabase/migrations/` sem o arquivo |
| **Retenção** (`cleanup-cron-run-details-30d`, 30 d) | **superada na main por versão mais rígida (7 d)** | `origin/main:supabase/migrations/20261102022200_cron_historico_retencao_7d.sql` (migration de 2026-11-02, posterior à branch); em produção: `cron.job` tem `cron-historico-retencao-7d \| 17 3 * * * \| delete from cron.job_run_details where coalesce(end_time,start_time) < now() - interval '7 days'`; `schema_migrations` contém `20261102022200`. Linha mais antiga hoje: `min(start_time)=2026-11-08` (74.621 linhas), ou seja o job de 7 d está funcionando |
| **C2** janela de 14 d em `talkx_engine_cron_runs` | ausente, mas virou **no-op**: com retenção de 7 d nunca existe linha com mais de 7 d | `pg_get_functiondef('public.talkx_engine_cron_runs(integer)')` → corpo idêntico ao da branch, **exceto** a linha `AND start_time > now() - interval '14 days'`. `position('14 days' in …)=0` |
| **C1** `CREATE INDEX idx_job_run_details_jobid_start ON cron.job_run_details` | ausente **e inaplicável pelo fluxo do projeto** | `pg_indexes` em `cron.job_run_details` só tem `job_run_details_pkey (runid)`. Dono da tabela = `supabase_admin`; `has_schema_privilege('postgres','cron','CREATE')=false`, `has_schema_privilege('service_role','cron','CREATE')=false`, `rolsuper(postgres)=false`, `pg_has_role('postgres','supabase_admin','USAGE')=false`. O 1º statement da migration falharia com permissão negada e abortaria a transação inteira |
| **C3** `WHEN query_canceled` no bloco `talkx_engine_alerts()` + advisory lock no tick | ausente; única lacuna tecnicamente aplicável | `pg_get_functiondef('public.trigger_talkx_engine_tick()')`: `position('pg_try_advisory_xact_lock')=0`, `position('query_canceled')=0`. O resto do corpo vivo é **byte-idêntico** ao da branch (nenhuma divergência posterior a 2026-11-01) |

## Premissa do diagnóstico está desfeita
Últimos 7 dias em produção (`cron.job_run_details` x `cron.job`):

- `talkx-scheduler-1min`: 10.075 execuções, **6 falhas = 0,06%** (era 9,3%).
- As falhas não são do talkx: ocorrem em **rajadas globais**, o mesmo minuto para 7–9 jobs distintos
  (`2026-11-14 11:15`, `2026-11-10 18:25`, `16:33`, `14:03`, `01:22`, `2026-11-08 13:42` — 6 eventos em 7 dias),
  todas com `return_message = 'job startup timeout'`, isto é, o *launcher* do pg_cron não conseguiu
  iniciar o worker, não statement timeout de query. C1/C2 não endereçam isso.

Ou seja: a causa real do volume de falhas era o crescimento da tabela, e a main já resolveu isso
por outro caminho (`cron-historico-retencao-7d`, 2026-11-02) — mais rígido que os 30 d da branch.

## Observação operacional (não é da branch, mas apareceu na verificação)
`cron.job_run_details` ainda ocupa **73 MB de heap para 74.621 linhas** (`pg_table_size`), com
`n_dead_tup=8.347`, `n_live_tup=0` e `last_autovacuum = null`: o DELETE diário remove linhas mas
não devolve espaço, e a tabela é de `supabase_admin` (autovacuum não a cobre como tabela de usuário).
Um `VACUUM FULL`/`REINDEX` nessa tabela exige `supabase_admin` — é item do dono, não desta branch.

## Lacuna residual (único trecho ainda aplicável, valor baixo)
Em `public.trigger_talkx_engine_tick()`, dois acréscimos. Para portar basta um
`CREATE OR REPLACE` do corpo vivo (que é idêntico ao da branch) com estes dois pontos:

1. Logo depois do `PERFORM set_config('request.jwt.claim.role','service_role', true);`:

```sql
  -- Advisory lock transacional: se um tick anterior ainda estiver rodando, skip.
  -- pg_try_advisory_xact_lock libera automaticamente no fim da transação.
  IF NOT pg_try_advisory_xact_lock(hashtext('trigger_talkx_engine_tick')) THEN
    RETURN;
  END IF;
```

2. No bloco X033 dos alertas (a cada 5 min), trocar o handler por:

```sql
    BEGIN
      PERFORM public.talkx_engine_alerts();
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
      WHEN query_canceled THEN
        NULL;
    END;
```

Notas para quem portar: `WHEN OTHERS` em PL/pgSQL realmente não captura `query_canceled` (57014) —
a correção é legítima; mas a ordem da branch (`OTHERS` antes de `query_canceled`) é frágil, o idiomático
é `WHEN query_canceled OR OTHERS` ou pôr `OTHERS` por último. Nos últimos 7 dias **não houve** nenhuma
falha do tick por cancelamento nem evidência de ticks sobrepostos — daí valor baixo.
**Não porte o `CREATE INDEX` em `cron.job_run_details`**: a migration não tem privilégio para isso.

## Veredito
**OBSOLETA.** A necessidade (parar as falhas do `talkx-scheduler-1min` por crescimento de
`cron.job_run_details`) já está atendida na main por `20261102022200_cron_historico_retencao_7d.sql`,
aplicada e ativa em produção; a janela de 14 d virou no-op; o índice C1 é inaplicável com os
privilégios do projeto; e a taxa de falha caiu de 9,3% para 0,06%, com a causa remanescente sendo
`job startup timeout` global do pg_cron, que esta branch não trata.

`apagar_branch_seguro = true` — o único trecho ainda aplicável (advisory lock + `query_canceled`,
valor baixo) está transcrito integralmente acima; nada se perde ao apagar a branch.

## Verificação adversarial

Papel: refutar a triagem (OBSOLETA). Resultado: **não foi possível refutar — concordo com OBSOLETA.**
Tudo reconferido do zero (git somente leitura em `origin/main` @ `dac285f62`, produção `tnnnlkbymytvtqngbbqh` só SELECT).

### 1. O diff é 1 arquivo e nada mais
`git diff 1252bb5a4 origin/claude/fix-talkx-cron-startup-timeout-261101-2200 --stat` → único arquivo
`supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql`, +244/-0. Não há hunk escondido
em `src/`, edge ou workflow. `git ls-tree origin/main supabase/migrations/` não traz o arquivo
(o vizinho alfabético é `20261026200000_contact_notes_pinned.sql`); `supabase_migrations.schema_migrations`
com `version='20261026200300'` → 0 linhas. Confirmado: nunca entrou na main nem no banco.

### 2. A substituição alegada cobre a necessidade — abri o arquivo da main
`origin/main:supabase/migrations/20261102022200_cron_historico_retencao_7d.sql` existe e é mais rígido
que a branch: agenda `cron-historico-retencao-7d` com
`delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'`.
Melhor que o `cleanup-cron-run-details-30d` da branch em dois pontos além da janela:
usa `coalesce(end_time, start_time)` (a branch exige `end_time IS NOT NULL`, logo deixava órfã toda linha
de run que nunca terminou — exatamente as `job startup timeout`) e é idempotente dentro de `do $$ ... pg_extension`.
Em produção: `schema_migrations` tem `20261102022200`; `cron.job` tem o job com esse mesmo comando;
`min(start_time) = 2026-11-08 03:17` com 74.785 linhas — a janela de 7 d está sendo respeitada.

### 3. C1 não é só "ausente": a migration da branch **não aplica**
`current_user` da conexão oficial = `postgres`; `cron.job_run_details` é de `supabase_admin`;
`pg_has_role('postgres','supabase_admin','USAGE')=false`, `rolsuper(postgres)=false`,
`has_schema_privilege('postgres','cron','CREATE')=false` (idem `service_role`).
`pg_indexes` em `cron.job_run_details` tem só `job_run_details_pkey`.
O `CREATE INDEX` é o **primeiro statement** do arquivo: ele aborta a transação e nada mais da migration
roda. Portar a branch como está é impossível, não apenas inútil.

### 4. C2 é no-op confirmado, e sem o índice seria no-op de qualquer forma
`position('14 days' in pg_get_functiondef('public.talkx_engine_cron_runs(integer)'))=0` → a janela não está lá.
Mas com retenção de 7 d nenhuma linha tem mais de 7 d (item 2), então o filtro não eliminaria nenhuma linha;
e sem o índice de C1 (item 3) o predicado não evita o seq scan. Valor efetivo: zero.

### 5. A lacuna residual é a que a triagem apontou, e é baixa — verifiquei linha a linha
Baixei `pg_get_functiondef('public.trigger_talkx_engine_tick()')` e comparei com o corpo da branch:
o corpo vivo é idêntico, com exatamente **duas** diferenças, ambas as alegadas
(`position('pg_try_advisory_xact_lock')=0`, `position('query_canceled')=0`). Nenhuma divergência posterior
a 2026-11-01, ou seja, a main também não evoluiu a função por outro caminho — e também não há regressão
em portar. Por que continua baixo:
- sem rastro de cancelamento: `public.talkx_alerts` com `57014`/`query_canceled` no payload → 0 linhas;
- sem rastro de tick sobreposto: 10.075 execuções em 7 d (= 1/min cheio, 10.080 minutos) e as 6 falhas
  são todas `job startup timeout`, isto é, o worker nem começou — não há tick longo atropelando o seguinte.
- ressalva técnica mantida: `WHEN OTHERS` de fato não captura 57014, mas engolir `query_canceled` também
  engole `statement_timeout`/`pg_cancel_backend` do bloco de alertas; portar isso é escolha, não correção óbvia.

### 6. A premissa do diagnóstico está desfeita (reconferida)
`talkx-scheduler-1min` em 7 d: 10.075 execuções / 6 falhas = **0,06%** (a branch partia de 9,3%).
As 46 falhas de **todos** os jobs em 7 d se concentram em 6 minutos, cada um derrubando 7–9 `jobid`
distintos de uma vez (`2026-11-14 11:15` 9 jobs, `2026-11-10 18:25` 8, `16:33` 7, `14:03` 7, `01:22` 8,
`2026-11-08 13:42` 7), 100% com `return_message = 'job startup timeout'` — launcher do pg_cron sem worker
disponível, não statement timeout de query. C1, C2, C3 e o advisory lock não tocam nisso.

### Parecer
`concorda = true`, `veredito_final = OBSOLETA`, `apagar_branch_seguro = true`. Não encontrei nenhum hunk
de valor ≥ médio fora da main. O único trecho aplicável (12 linhas: advisory lock + braço `query_canceled`)
está transcrito integralmente na seção "Lacuna residual" acima, com o aviso de não portar o `CREATE INDEX`.
