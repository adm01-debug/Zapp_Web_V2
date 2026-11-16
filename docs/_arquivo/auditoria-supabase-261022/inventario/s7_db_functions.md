# S7 — Funções de Banco: Exception Handling e Race Conditions

**Coletado em:** 2026-11-01

## Estatísticas Gerais

| Métrica | Valor |
|---|---|
| Total de funções (public) | 481 |
| plpgsql com BEGIN | 402 |
| plpgsql com BEGIN + EXCEPTION | **251** (62%) |
| plpgsql com BEGIN mas SEM EXCEPTION | **95** (24%) |

## Funções com BEGIN mas Sem EXCEPTION

```sql
SELECT count(*) FILTER (WHERE has_begin AND NOT has_exception) as begin_no_exception
FROM (
  SELECT p.prosrc LIKE '%EXCEPTION%' as has_exception, p.prosrc LIKE '%BEGIN%' as has_begin
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.prokind='f' AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
) x;
-- Resultado: 95
```

**Funções de alto risco (sem EXCEPTION, com BEGIN — sample):**
- `accept_department_invite` — fluxo de join de equipe
- `admin_inbox_silence` — mutação de estado
- `ai_budget_reserve` — operação financeira/quota (**maior preocupação**)
- `app_bootstrap` — inicialização crítica
- `auto_assign_contact` — lógica de negócio
- `cancel_ai_job` — operação de estado
- `catalog_rate_limit_hit` — rate limiting

## SECURITY DEFINER

- 402 funções SECURITY DEFINER
- **0 sem search_path** (todas protegidas) ✓

## Race Conditions

Funções de "claim" usam `SELECT FOR UPDATE SKIP LOCKED` — padrão correto para filas. ✓
`close_conversation_atomic` usa EXCEPTION — transação atômica com rollback. ✓

## Funções de Alto Volume (pg_cron)

| Função | Job | Falhas históricas |
|---|---|---|
| `trigger_talkx_engine_tick()` | talkx-scheduler-1min | 4950 |
| `notify_due_tasks()` | tasks-notify-due | 2407 |
| `trigger_ai_jobs_tick()` | ai-jobs-tick-1min | 2035 |

Todas as falhas por pool exhaustion, não por bug na função.