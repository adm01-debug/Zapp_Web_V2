# Runbook · pg_cron e capacidade do banco — investigação de 02/10/2026

**Status:** investigação **somente leitura**. Nada foi alterado no banco, nos jobs ou em configuração.
**Para quem:** decisão do Joaquim sobre capacidade do banco. O **TALK X 02** é o dono do Talk X e decide junto.
**Projeto:** `tnnnlkbymytvtqngbbqh` (Zapp Web V2).

---

## 1. O sintoma relatado

O job `talkx-scheduler-1min` (`cron.jobid = 11`, `SELECT public.trigger_talkx_engine_tick()`, `* * * * *`) apareceu com **46% de falha** num recorte das últimas horas de 01/10 para 02/10.

## 2. O que a investigação mediu

### 2.1 A falha não é do Talk X — é do banco inteiro

Todas as falhas do período têm a **mesma mensagem** (`cron.job_run_details.return_message`) e a **mesma janela**:

| job | succeeded | failed | primeira falha | última falha |
|---|---|---|---|---|
| `talkx-scheduler-1min` | 1251 | **187** | 01/10 14:45:00 | 02/10 09:47:00 |
| `tasks-notify-due` | 1251 | **187** | 01/10 14:45:00 | 02/10 09:47:00 |
| `expire-stale-agent-presence` | 624 | 96 | 01/10 17:26:00 | 02/10 09:46:00 |
| `multiplix-send-trigger` | 624 | 96 | 01/10 17:26:00 | 02/10 09:46:00 |
| `gmail-incremental-sync` | 239 | 49 | 01/10 14:45:00 | 02/10 09:40:00 |
| `connection-health-check` | 239 | 49 | 01/10 14:45:00 | 02/10 09:40:00 |
| `cleanup-edge-rate-limits` | 81 | 15 | 01/10 23:00:00 | 02/10 09:30:00 |
| `avatars-refresh` | 19 | 5 | 01/10 23:00:00 | 02/10 09:00:00 |

**684 falhas em 24 h**, todas com `return_message = 'job startup timeout'`, todas dentro da **mesma janela** (01/10 14:45 → 02/10 09:47), que **terminou sozinha**.

Doze jobs diferentes não falham do mesmo jeito ao mesmo tempo por causa de um deles. Isso é exaustão de recursos do banco.

### 2.2 O job do Talk X é rápido — não é ele que trava

| status | n | média | p95 | máx |
|---|---|---|---|---|
| succeeded | 1251 | **0,482 s** | 2,0 s | 55,2 s |
| failed | 187 | 23,3 s | 84,2 s | **285,2 s** |

A duração das falhas (até 285 s) é **o tempo esperando um backend até desistir** — não é o job rodando. O nome da mensagem já diz: o pg_cron não conseguiu **iniciar** o job. Otimizar `trigger_talkx_engine_tick()` não muda nada: p95 de 2 s não justifica trabalho.

### 2.3 A configuração que explica o startup timeout

| parâmetro | valor | leitura |
|---|---|---|
| `max_worker_processes` | **6** | **gargalo real** — workers de background/paralelos disputam 6 slots |
| `cron.max_running_jobs` | **32** | o pg_cron pode *pedir* muito mais backends do que o banco consegue abrir |
| `cron.use_background_workers` | off | cada job ocupa um backend normal |
| `max_connections` | 60 | (+3 reservadas ao superuser) |
| `cron.database_name` | postgres | — |

**Mecanismo:** quando os slots se esgotam (pooler do app + os jobs de minuto + workers paralelos dentro de um teto de 6), o launcher do pg_cron espera e desiste com `job startup timeout`. Quando a pressão cai, os jobs voltam sozinhos — foi o que aconteceu às 09:47.

### 2.4 Agravante de pico

**Três jobs disparam no mesmo segundo**, todos `* * * * *`:

- `talkx-scheduler-1min` (11)
- `ai-jobs-tick-1min` (19)
- `tasks-notify-due` (16)

## 3. As 4 propostas (nada aplicado)

| # | proposta | dono |
|---|---|---|
| 1 | **A causa é capacidade do projeto, não o job.** `max_worker_processes=6` + o regime de `max_connections=60` — decisão de nível de projeto no Supabase | Joaquim |
| 2 | **Baixar `cron.max_running_jobs`** (32 → próximo da capacidade real), para o pg_cron parar de prometer o que o banco não entrega: falha organizada em vez de timeout | Joaquim |
| 3 | **Desafogar o segundo zero:** `ai-jobs-tick-1min` e `tasks-notify-due` não precisam rodar a cada minuto — mover para `*/2` ou `*/5` tira dois backends por minuto da disputa | TALK X 02 |
| 4 | **Não otimizar `trigger_talkx_engine_tick()`** — p95 de 2 s. O ganho está em não nascerem três jobs no mesmo segundo | TALK X 02 |

## 4. Como verificar depois de qualquer mudança

```sql
-- distribuição por status e mensagem nas últimas 24 h
select left(coalesce(return_message,'(nulo)'),60) as msg, status, count(*)
from cron.job_run_details
where start_time > now() - interval '24 hours'
group by 1,2 order by 3 desc;
```

Critério de sucesso: **zero** `job startup timeout`, e a janela de falha não reabrir.

## 5. Armadilha de leitura

46% de falha no recorte de 6 h é real, mas é **sintoma do banco**. Se o TALK X 02 mexer só no job do Talk X, a falha continua aparecendo nos outros onze — foi exatamente isso que a correlação entre os 12 jobs mostrou.

## 6. Escopo desta investigação

Somente leitura: `cron.job`, `cron.job_run_details`, `pg_settings` e o ledger. **Nenhuma** alteração em cron, configuração ou código do Talk X.
