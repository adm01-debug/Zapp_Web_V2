# claude__fix-talkx-cron-startup-timeout-261025-1700 — PERDIDA_PARCIAL

- Ref: `origin/claude/fix-talkx-cron-startup-timeout-261025-1700` (tip `671b5294f`, merge_base `2d97c44cf`, 2 commits, 2026-10-25)
- PR: #2245. Triagem anterior marcou "DUPLICATA" — **confirmado**: a branch irmã `origin/claude/fix-talkx-cron-startup-timeout-261101-2200` (commit `c79519c78`, 2026-11-01) traz a MESMA migration `20261026200300`, mais nova e corrigida. Nenhuma das duas está na main (`git merge-base --is-ancestor c79519c78 origin/main` → NAO-ESTA-NA-MAIN; `git ls-tree origin/main -- supabase/migrations/20261026200300_*` → vazio).

## Propósito
Atacar 4.007 falhas (9,3% em 30d) do cron `talkx-scheduler-1min`, atribuídas a statement timeout. Quatro peças:
- **C1** índice composto `idx_job_run_details_jobid_start` em `cron.job_run_details (jobid, start_time DESC, runid DESC)`;
- **C2** janela de 14 dias no SELECT dinâmico de `public.talkx_engine_cron_runs`;
- **C3** handler `WHEN query_canceled` no bloco de alertas de `public.trigger_talkx_engine_tick` (WHEN OTHERS não captura SQLSTATE 57014);
- **Bônus** `pg_try_advisory_xact_lock(hashtext('trigger_talkx_engine_tick'))` contra sobreposição de ticks + job de retenção `cleanup-cron-run-details-7d` (`0 4 * * *`).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `auditoria-supabase/progresso.json` (+89 linhas) | **Obsoleto, valor nenhum.** Snapshot da auditoria em 2026-10-25; a main tem versão consolidada muito posterior (483 linhas, `fase_0_fechamento_20261108`, timestamp 2026-11-08T23:20Z) | `git log -1 origin/main -- auditoria-supabase/progresso.json` → `f120344f9 2026-11-10 chore(auditoria): consolida achados.json/RELATORIO/progresso — FASES 0 e A (#2844)` |
| `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` (+214) | **Não está na main nem em produção** (exceto a retenção, coberta por equivalente) | ver abaixo, peça por peça |

### Produção (somente leitura, MCP `SUPABASE - ZAPP WEB V2 - MCP`, 2026-11-15)
- `select version,name from supabase_migrations.schema_migrations where version in ('20261026200300','20261102022200')` → **só** `20261102022200 cron_historico_retencao_7d`. A migration da branch **nunca foi aplicada**.
- `select indexname from pg_indexes where schemaname='cron' and tablename='job_run_details'` → só `job_run_details_pkey`. **C1 ausente.**
- `pg_get_functiondef` de `talkx_engine_cron_runs` e `trigger_talkx_engine_tick`: `tem_janela_14d=false`, `tem_advisory_lock=false`, `tem_query_canceled=false`. **C2, C3 e o lock ausentes.**
- `cron.job`: existe `cron-historico-retencao-7d` (`17 3 * * *`, ativo); **não** existe `cleanup-cron-run-details-7d`. → a retenção da branch está coberta por `origin/main:supabase/migrations/20261102022200_cron_historico_retencao_7d.sql` (`delete from cron.job_run_details where coalesce(end_time,start_time) < now() - interval '7 days'`). **Portar a branch como está criaria um SEGUNDO job de retenção duplicado.**

### O problema original praticamente desapareceu
- `cron.job_run_details` jobid=11 (7 dias retidos, 10.650 runs): **6 falhas = 0,06%** (era 9,3%). Mensagem das 6: **`job startup timeout`** — é o pg_cron não conseguindo subir o background worker, **não** statement timeout; C1/C2/C3 não tratam isso.
- Duração dos ticks em 7d: média 0,77 s, máx 20,91 s, **0 runs acima de 60 s** → o advisory lock não tem sobreposição real para impedir hoje.
- C2 (janela de 14 dias) ficou redundante: a retenção da main já mantém só 7 dias.
- C1 ainda tem ganho real, mas menor: `EXPLAIN (ANALYZE)` da consulta da UI → `Seq Scan on job_run_details ... Rows Removed by Filter: 72970`, `Buffers: shared hit=9309`, 77 ms quente (tabela 81 MB, `seq_tup_read=32.577.514`).

## Lacuna a recuperar (única com valor)
**C1 — índice composto.** Fonte canônica: a branch irmã `origin/claude/fix-talkx-cron-startup-timeout-261101-2200` (mesma migration, handler `WHEN query_canceled` com sintaxe correta; nesta branch os handlers saem como `WHEN OTHERS THEN NULL WHEN query_canceled THEN NULL;` na mesma linha).

Hunk a portar (apenas isto; migration nova com timestamp atual):
```sql
-- C1: índice composto — elimina seq scan em job_run_details para qualquer jobid
CREATE INDEX IF NOT EXISTS idx_job_run_details_jobid_start
  ON cron.job_run_details (jobid, start_time DESC, runid DESC);
```
Ao portar, **remover** o bloco `SELECT cron.schedule('cleanup-cron-run-details-7d', ...)` (duplica `cron-historico-retencao-7d` já em produção) e **não** reaplicar C2 (janela de 14 d sobre dados de 7 d) nem o advisory lock (sem sobreposição medida), salvo decisão do dono.

## Veredito
**PERDIDA_PARCIAL** — a retenção entrou na main por equivalente (`20261102022200`); C1/C2/C3/lock não entraram. Do que falta, só C1 ainda faz sentido (valor médio, performance da UI de cron); C2 e o lock ficaram sem razão de ser, e as falhas residuais são de outra causa (`job startup timeout`).

`apagar_branch_seguro`: **false**. Nada de único se perde (a irmã `...-261101-2200` é superset), mas o veredito não é INCORPORADA/OBSOLETA — e a irmã também está fora da main, então a decisão de apagar deve ser tomada junto com ela.

## Verificação adversarial

**Discordo: veredito_final OBSOLETA, `apagar_branch_seguro=true`.** A triagem acertou todos os fatos de ausência (reconferidos), mas errou na conclusão: a única peça que ela mandou portar (C1) **não pode ser executada pelo papel das migrations** e, além disso, **já é desnecessária** — o índice que a UI precisa existe.

### 1. C1 é inexecutável pelo fluxo de DDL do repo (bloqueio de privilégio)
MCP `SUPABASE - ZAPP WEB V2 - MCP`, produção, 2026-11-15, somente leitura:
- `pg_class.relowner` de `cron.job_run_details` → **`supabase_admin`**; `current_user` das migrations → **`postgres`**.
- `pg_roles.rolsuper` de `postgres` → **false**; `pg_has_role('postgres','supabase_admin','USAGE')` → **false**; papéis de `postgres`: `pg_monitor, pg_signal_backend, pg_read_all_data, pg_create_subscription, anon, authenticated, service_role, authenticator, supabase_privileged_role, snapshot_reader, zapp_agente_leitura` (nenhum é o dono).
- `pg_namespace.nspacl` do schema `cron` → `{supabase_admin=UC/supabase_admin,postgres=U*/supabase_admin,snapshot_reader=U/postgres}` → `postgres` tem **U** (USAGE), **não tem C** (CREATE); `has_schema_privilege('postgres','cron','CREATE')` → **false**.

`CREATE INDEX ... ON cron.job_run_details` exige ser dono da tabela (ou membro do papel dono) — `postgres` não é. A migration portada **falharia no apply**, derrubando o deploy. Não é à toa que a retenção que *entrou* na main (`origin/main:supabase/migrations/20261102022200_cron_historico_retencao_7d.sql`, linhas 12-13) só agenda um `DELETE` e documenta exatamente esse limite: "O DELETE roda como o dono do job (postgres), que tem DELETE em cron.job_run_details". DML passa; DDL em schema alheio, não.

### 2. C1 também é desnecessário: a `pkey` existente já resolve, 1.750× mais rápido
A lentidão vem do `ORDER BY start_time DESC`, não da falta de índice — `runid` é sequencial e monotônico com `start_time`, e já existe `job_run_details_pkey (runid)`.

Consulta atual da UI (`talkx_engine_cron_runs`, jobid=11, limit 60) — `EXPLAIN (ANALYZE, BUFFERS)`:
```
Limit → Sort (start_time DESC NULLS LAST, runid DESC)
  → Seq Scan on job_run_details  Filter: (jobid = 11)
     Rows Removed by Filter: 63977   Buffers: shared hit=9309
Execution Time: 1653.536 ms
```
Mesma consulta trocando só o `ORDER BY` para `runid DESC`:
```
Limit → Index Scan Backward using job_run_details_pkey  Filter: (jobid = 11)
     Rows Removed by Filter: 407   Buffers: shared hit=59
Execution Time: 0.938 ms
```
1.653 ms → 0,94 ms; 9.315 → 59 buffers. E essa correção é um `CREATE OR REPLACE FUNCTION public.talkx_engine_cron_runs` — schema `public`, dentro do que `postgres` pode fazer. Ou seja: a necessidade real é atendida por **uma linha em `public`**, não pelo índice em `cron` que a branch tentava criar.

### 3. Resto reconferido (a triagem está certa nos fatos)
- `supabase_migrations.schema_migrations where version in ('20261026200300','20261102022200')` → só `20261102022200`. `pg_indexes` schema `cron` tabela `job_run_details` → só `job_run_details_pkey`.
- `cron_runs_def_tem_janela14d=false`, `tick_tem_advisory=false`, `tick_tem_query_canceled=false`, `tick_tem_storage_purge=true`; `cron.job` com comando em `job_run_details` → só `cron-historico-retencao-7d` (`17 3 * * *`, ativo) → portar a branch como está criaria job de retenção duplicado.
- Falhas 7d do `talkx-scheduler-1min`: 6 em 10.075 (**0,06%**), `return_message` único = `job startup timeout`; duração máxima 20,91 s (teto 60 s) → C3 e advisory lock sem fato que os sustente.
- **Não houve remoção deliberada**: `git log -S'idx_job_run_details_jobid_start' origin/main` → vazio; `git log -S'cleanup-cron-run-details-7d' origin/main` → vazio; `git grep idx_job_run_details_jobid_start origin/main` → sem ocorrência. Nunca esteve na main.
- Sem risco de regressão a avaliar: a última migration da main que redefine `trigger_talkx_engine_tick` é `20261009160000_talkx_storage_purge_drain.sql`, anterior ao merge-base — mas isso é irrelevante, porque nada da branch deve ser portado.
- `auditoria-supabase/progresso.json`: main tem 483 linhas com `fase_0_fechamento_20261108` (`f120344f9`, 2026-11-10) contra o snapshot de 2026-10-25 da branch → obsoleto, confirmado.

### Conclusão
Nada nesta branch é recuperável: C1 não aplica (privilégio) e não é preciso (pkey + `ORDER BY runid`), C2/C3/lock perderam a razão de ser, a retenção já entrou por equivalente e o `progresso.json` é snapshot vencido. A premissa da branch (9,3% por statement timeout) não existe mais (0,06%, `job startup timeout` = worker do pg_cron). **OBSOLETA**, branch segura para apagar — a irmã `...-261101-2200` carrega a mesma migration e cai no mesmo bloqueio de privilégio, então não serve de motivo para segurar esta. A lentidão da UI de cron continua aberta, mas como **trabalho novo** (trocar o `ORDER BY` de `talkx_engine_cron_runs`), não como resgate.
