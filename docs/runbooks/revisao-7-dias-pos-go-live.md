# Runbook · Revisão de 7 dias pós-go-live (logs, cron, webhooks, custo)

> **Origem do item:** passo **100** — *"Handoff: revisão de 7 dias (logs, cron, webhooks, custo Supabase/Hostinger) e fechamento"* — em `docs/migration/PLANO.md`
> (última linha do inventário `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv`, classificado **NAO_VERIFICAVEL** / *"Atividade operacional"*).
> Não existe correção de código para este item: o que falta é a **leitura operacional** — e é exatamente isso que este runbook transforma em procedimento repetível.

**Quando:** 7 dias corridos depois do go-live; e com a mesma régua ao fim de cada ciclo grande de entrega.
**Quem executa:** **Joaquim** (dono do sistema).
**Perímetro:** a leitura é em **produção**, e produção aqui é **somente leitura**. **Agente não acessa produção** — nenhuma migration, deploy, push, reinício ou consulta ao banco de produção por agente; a coleta é feita pelo dono (Dashboard / MCP autorizado) e só o resultado agregado entra no fechamento.

**Por que a janela é de 7 dias:** é o menor intervalo que cobre uma semana inteira de `pg_cron` (inclui o fim de semana, quando ninguém está olhando) sem deixar o custo do mês fechar às cegas.

---

## 1. Logs — o que quebrou e ninguém viu

| Onde olhar | O que é sinal | Leitura saudável |
|---|---|---|
| Supabase Dashboard → Edge Functions → Logs (por função) | 5xx e `console.error` por função | nenhuma função com 5xx novo na semana; as que aparecerem têm causa explicada |
| `supabase/functions/csp-report/index.ts` | violações de CSP (modo report-only) | nenhuma origem nova fora da allowlist |
| `edge_rate_limits` (criada em `supabase/migrations/20260905020000_edge_rate_limits.sql`, limpeza em `supabase/functions/cleanup-rate-limit-logs/index.ts`) | 429 por chave/IP | picos de 429 são esperados em rajada; **persistente** = ajustar limite ou o cliente |
| `.github/workflows/db-live-guard.yml` (diário) | drift de schema entre repositório e banco | todos os dias verdes na semana |
| `.github/workflows/settings-guard.yml` (a cada 6 h) | proteção de branch/settings divergindo do baseline | todos verdes |

**Como fazer:** abra a lista de Edge Functions, filtre por `status >= 500` na janela; repita a leitura por função apenas para as que aparecerem. O erro que se repete em todo deploy costuma ser contrato (payload), não infraestrutura — anote a função, a mensagem e o horário.

**Sinais de `docs/runbooks/slo.md`:** a tabela de sinais por componente é a referência para saber qual log responde a qual pergunta.

## 2. Cron — o que não rodou

Fonte única: `cron.job_run_details` (histórico do `pg_cron`). A consulta de rotina está em `docs/ops/runbook-pg-cron-capacidade.md` (seção "Como verificar depois de qualquer mudança"):

```sql
-- últimos 7 dias, por job e status
select j.jobname, d.status, count(*),
       min(d.start_time) as primeira, max(d.start_time) as ultima
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where d.start_time > now() - interval '7 days'
group by 1, 2
order by 1, 2;

-- mensagens de falha agrupadas (a causa raiz vem primeiro)
select left(coalesce(return_message, '(nulo)'), 80) as msg, count(*)
from cron.job_run_details
where start_time > now() - interval '7 days' and status <> 'succeeded'
group by 1 order by 2 desc;
```

**Leitura saudável:** **zero** `job startup timeout` na semana, e nenhum job com sucesso interrompido por mais de um ciclo.
**Causa conhecida:** `job startup timeout` é **capacidade do banco** (`max_worker_processes` × `cron.max_running_jobs`), não culpa de um job só — o mecanismo e a mitigação de horários (migration `20261002541230_pg_cron_escalonar_jobs.sql`) estão medidos em `docs/ops/runbook-pg-cron-capacidade.md`. Se a janela reabrir, trate pela capacidade antes de otimizar job.
**Segredo do cron:** se algum job passou a devolver 401/403, o secret do `net.http_post` venceu — ver `docs/runbooks/cron-secret-rotation.md` (e `docs/runbooks/secret-rotation.md` para o resto).

## 3. Webhooks — o que chegou e não entrou

| Fonte | O que mede | Leitura saudável |
|---|---|---|
| `supabase/functions/evolution-webhook` | entregas do WhatsApp (Evolution GO) aceitas pela edge | ≥ 99,5 % das entregas com 2xx |
| `supabase/functions/_shared/hmac-validation.ts` | assinatura dos webhooks | nenhuma entrega aceita sem assinatura válida (modo estrito) |
| `supabase/functions/connection-health-check/index.ts` → tabela `connection_health_logs` | instância conectada/desconectada ao longo da semana | instância `PRINCIPAL` conectada ≥ 99 % das amostras |
| Retry do emissor (GO) | reenvio em falha | 5 tentativas / 30 s — falha definitiva aparece como perda, não como erro silencioso |

**Como fazer:** conte 2xx × não-2xx da edge na janela; compare com `connection_health_logs` para separar "webhook caiu" de "instância estava fora". Uma entrega que voltou 2xx mas não virou linha de mensagem é o caso que mais dói — confira a ingestão antes de declarar a semana boa.

## 4. Custo — o que fugiu do orçamento

| Fonte | O que mede | Leitura saudável |
|---|---|---|
| `scripts/db-audit/supabase-usage-guard.mjs` | uso do catálogo do Supabase contra o orçamento (rodado pelo `db:guard`) | `novas: 0` violações |
| `supabase/functions/searchbox-budget-alert/index.ts` (cron criado em `supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql`) | sessões do autocomplete contra o teto diário/mensal | nenhum alerta na semana = gasto dentro do teto |
| `searchbox_usage_daily` (`supabase/migrations/20260930760000_searchbox_usage_daily.sql`) | série diária de uso do Searchbox | sem degrau anômalo; o freio de 450 não foi atingido |
| Painel Hostinger (VPS) e Supabase (Usage) | custo do mês corrente | dentro do previsto; nenhuma cobrança nova surpresa |

**Como fazer:** compare o custo da semana com o da semana anterior. O que muda o custo aqui é **chamada externa por requisição** (Searchbox/Mapbox, IA) e **byte movido** (mídia) — se o número subiu, o eixo 3 (webhooks) e o eixo 1 (logs) dizem de onde veio.

## 5. Reviews que já rodam sozinhos (não precisa refazer à mão)

- `.github/workflows/db-live-guard.yml` — diário: drift de schema.
- `.github/workflows/settings-guard.yml` — a cada 6 h: proteção de branch e settings.
- `.github/workflows/types-sync.yml` — semanal: tipos/catálogo.
- `.github/workflows/branch-hygiene-audit.yml` — semanal: PRs parados há mais de 7 dias.
- `.github/workflows/codeql.yml` — semanal: análise de segurança.

Este runbook **não substitui** esses jobs: ele lê o resultado deles e cobre o que eles não veem (webhook aceito-e-não-entregue, erro de edge, custo).

## 6. Fechamento da revisão (checklist)

| # | Eixo | Resultado na semana | Evidência (link/print/consulta) |
|---|---|---|---|
| 1 | Logs | | |
| 2 | Cron | | |
| 3 | Webhooks | | |
| 4 | Custo | | |

**Aprovado quando:** os quatro eixos têm leitura registrada, e toda anomalia tem ou um responsável nomeado ou uma correção aberta. Sem isso, o passo 100 do plano **não** está fechado.

## 7. O que este runbook não faz

- **Não** executa nada em produção e **não** roda sozinho: é um procedimento, não uma automação. Quem opera é o dono.
- **Não** substitui os runbooks de incidente (`docs/runbooks/slo.md`, `docs/ops/runbook-pg-cron-capacidade.md`, `docs/runbooks/cron-secret-rotation.md`) — ele só decide **quando** olhar.
- **Não** guarda dado de cliente: o fechamento registra contagem/agregado, nunca conteúdo de conversa, telefone, CPF/CNPJ ou credencial.
