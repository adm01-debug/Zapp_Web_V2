# Bloco 05 — Execução resiliente, filas e controle de consumo (IA-041..IA-050)

**P1 do plano, com limites de segurança P0** — [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md)
(seção "Bloco 05", linhas 328-399). Dependências declaradas pelo plano: IA-025, IA-031.

O bloco entrega a **execução resiliente e o controle de consumo** da camada de IA: prazos por capacidade e
cancelamento propagado, retentativas disciplinadas com jitter, limite compartilhado atômico, reserva de
orçamento antes da chamada, fila durável de jobs com estados padronizados, efeitos idempotentes,
cancelamento fora de contexto, ledger de uso garantido e degradação honesta. Entregue em **5 PRs**, mais
**2 PRs de auditoria** da série (Blocos 04/05).

## O que muda para quem usa

1. **Nenhuma chamada fica pendurada.** Cada chamada de IA ganha um teto de tempo por **capacidade**
   (texto 30 s; visão 60 s; áudio STT/TTS 120 s; áudio STS 150 s); o estouro aborta o `AbortController` do
   provedor e volta como `504 / TIMEOUT`, distinguível de um `502` de rede.
2. **Queda de rede não vira tempestade.** `classifyFailure` separa falha transitória (5xx, 408, 429,
   rede/timeout) de permanente (4xx) e de estado desconhecido; só a transitória é retentada, com backoff
   exponencial e *full jitter*, sob um teto global de tentativas e um orçamento de tempo da operação
   inteira.
3. **O limite é compartilhado e atômico.** Um contador em memória por isolate deixava de ser confiável
   (zerava a cada cold start); o veredito passa a vir de um `INSERT ... ON CONFLICT (key) DO UPDATE` em um
   único statement no Postgres, por usuário, organização, serviço e provedor.
4. **O orçamento é reservado antes da chamada.** A decisão de gasto é do servidor: uma reserva atômica por
   dono (`pg_advisory_xact_lock`) só insere se couber no teto; o uso real é liquidado por
   `actual_tokens`, e reservas de execução interrompida são reconciliadas. Valor estimado **nunca** é
   faturamento.
5. **Operações longas viram jobs duráveis.** O job aceito sobrevive ao isolate que morre no meio: estado
   durável no banco, `idempotency_key UNIQUE`, lease por token, heartbeat, expiração e claim concorrente
   sem corrida (`FOR UPDATE SKIP LOCKED`).
6. **Estados padronizados.** Vocabulário **fechado de sete valores** (queued, running, partial, succeeded,
   failed, cancelled, outcome_unknown) igual na interface, no worker e no banco; `partial` **não** é
   concluído.
7. **Efeitos idempotentes e contexto revalidado.** Chaves estáveis + índices únicos parciais impedem
   duplicar tarefa/aviso/análise; um claim durável impede o segundo POST de teste; respostas de uma
   solicitação antiga são descartadas no front e revalidadas antes do efeito no servidor.
8. **O ledger não se perde.** O registro de consumo crítico é entregue a `EdgeRuntime.waitUntil` quando o
   runtime oferece, em vez de descartar a promessa.

## PRs

| PR | SHA do merge | Data | Etapas | O que entregou |
|---|---|---|---|---|
| #1510 | `903e7f7fea2453d3cc626a585536bd71dfeef84a` | 02/10/2026 01:16Z | IA-041, IA-042 | Prazos por capacidade e retentativas disciplinadas |
| #1529 | `c052b54c2ad9cde06d420e7c525e4a9df1868a44` | 02/10/2026 03:08Z | IA-043, IA-044 | Limite compartilhado atômico e reserva de orçamento; migration `20261002361230` |
| #1546 | `b70433c9c681149663261e4bec227c7d51b99792` | 02/10/2026 05:35Z | IA-045, IA-046 | Fila durável de jobs e estados padronizados; migration `20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| #1571 | `0bea0da54ff3e1e4807e1b9116e6e3736798530e` | 02/10/2026 11:08Z | IA-047, IA-048, IA-049 | Efeitos idempotentes, cancelamento fora de contexto e ledger garantido; migration `20261002411230_ia047_idempotencia_de_efeitos.sql` |
| #1602 | `64c06bfc56467c044aeaafaa51e4126a3d42cc50` | 02/10/2026 13:52Z | IA-049 | Classificador de áudio e agente de voz no despacho central; `_shared/ai-usage.ts` com `logAiUsageDetached` |

**PRs de auditoria dos Blocos 04/05 (continuação da mesma série):**

| PR | SHA do merge | Data | O que entregou |
|---|---|---|---|
| #1609 | `f5c7bfec4d4d6179b054dae1b67e3f8dd1bdb183` | — | Prova real do orçamento/rate limit em produção com a conta de teste `multiplix.compras@promobrindes.com.br`; artefato `scripts/qa/prova-orcamento-rate-limit.sh` |
| #1627 | `73d808b841f2303b9de48f0ff70b79a983757cee` | — | Migration `20261002511230_cron_ai_jobs_tick_fora_do_minuto_zero.sql`: o cron `ai-jobs-tick-1min` sai do minuto 0 (`* * * * *` → `1-59 * * * *`) |

## Etapas: o que foi feito e onde

### IA-041 / IA-042 — PR #1510

- **IA-041 (prazos ponta a ponta):** `_shared/ai-generate.ts` define
  `DEFAULT_TIMEOUT_MS_BY_CAPABILITY` — `text`/todas as finalidades 30 s, `vision` 60 s, `audio_stt`/`audio_tts`
  120 s, `audio_sts` 150 s. Um `timeoutMs` explícito do chamador vence o padrão. O estouro aciona o
  `AbortController` dentro do provedor e volta do `catch` como `AbortError`/`TimeoutError`, classificado como
  `TIMEOUT` (504). `_shared/ai-providers.ts` ganhou `options.timeoutMs` nos três ramos de chamada
  (`callLovableAI`, `callOpenAICompatible`, `callCustomWebhook`); sem `timeoutMs` nenhum timer/signal é
  criado (sem regressão).
- **IA-042 (retentativas limitadas):** `classifyFailure(status, err?)` classifica em `transient` /
  `permanent` / `state_unknown`. `withRetry` mantém a assinatura `(fn, maxRetries=2, baseDelayMs=500)` e
  ganha `options.budgetMs` (orçamento total da operação): só `transient` é retentado, com *full jitter* e
  piso de 1 ms; `MAX_TOTAL_ATTEMPTS = 4` é o teto global de tentativas. Contrato:
  `tests/contracts/ai-resilience-prazos-retry.contract.test.ts`.

### IA-043 / IA-044 — PR #1529

Migration `supabase/migrations/20261002361230_ia043_ia044_rate_limit_e_orcamento.sql` (classe CONTRATO,
aplicada pós-merge pelo integrador).

- **IA-043 (limite distribuído):** `_shared/ai-guards.ts` ganhou `sharedRateLimit`,
  `aiRateLimitScopeKey` (escopos `user`/`org`/`service`/`provider`) e `checkSharedAiRateLimits`. O contador
  atômico é a RPC `ai_rate_limit_hit(p_key, p_window_start)` sobre `edge_rate_limits`: um único
  `insert ... on conflict (key) do update`, com a janela embutida na chave; `ai_rate_limit_purge` faz a
  limpeza por tempo (NULL não apaga nada). Se a infraestrutura cai, o guard **falha aberto** e registra
  `source: "local"` — nunca confundido com o veredito da fonte de verdade.
- **IA-044 (reserva de orçamento):** `_shared/ai-budget.ts` (`reserveBudget`, `settleBudget`,
  `releaseBudget`, `reconcileBudget`) sobre a tabela `ai_budget_reservations` (RLS habilitada; RPCs
  `ai_budget_reserve`/`ai_budget_settle`/`ai_budget_release`/`ai_budget_reconcile`, `security definer`, com
  `pg_advisory_xact_lock(hashtext(coalesce(p_user_id::text,'anon')))`, `idempotency_key UNIQUE` e status
  `reserved|settled|released|expired`). O `estimatedTokens` só dimensiona a reserva; só o `actualTokens`
  do `settle` é uso real. `reserveBudget` falha **aberto** em erro de infraestrutura (a IA segue, com o
  motivo em `reason`), mas **fecha** quando a RPC nega (`allowed:false`) ou devolve 0 linhas. No despacho,
  reserva negada = HTTP 429 `BUDGET_EXCEEDED` e o provedor **não** é chamado. Contrato:
  `tests/contracts/ai-rate-limit-e-orcamento.contract.test.ts`.

### IA-045 / IA-046 — PR #1546

Migration `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` (classe
contrato/aditiva).

- **IA-045 (jobs duráveis):** tabela `public.ai_jobs` (RLS sem policy; só `service_role`), com
  `idempotency_key UNIQUE`, `lease_token`/`lease_expires_at`, `heartbeat_at`, `expires_at`,
  `priority (0..1000)`, `max_attempts`, três índices parciais e funções
  `enqueue_ai_job` / `claim_ai_jobs` / `heartbeat_ai_job` / `finish_ai_job` / `reap_ai_jobs` / `cancel_ai_job`
  (todas `security definer`, `search_path = public, pg_temp`, exigem `auth.role() = 'service_role'`,
  `EXECUTE` revogado de public/anon/authenticated). O claim roda os reapers — de lease vencido (volta para
  `queued` com backoff exponencial, ou `failed` se esgotou tentativas) e de expiração (`failed/EXPIRED`) —
  e arrenda até o limite com `FOR UPDATE SKIP LOCKED`. `_shared/ai-jobs.ts` encapsula as RPCs, **não falha
  aberto** (erro de infraestrutura lança `AiJobInfraError`; `false` de heartbeat/finish/cancel é
  *resultado* — lease perdido — não exceção).
- **IA-046 (estados):** vocabulário **congelado de sete valores** e mapa de transições
  (`queued→running|cancelled`; `running`/`partial→partial|succeeded|failed|cancelled|outcome_unknown`;
  terminais sem saída). O mesmo vocabulário habita os três artefatos sob um contrato de teste:
  `_shared/ai-jobs.ts` (worker), `src/lib/aiJobs/status.ts` (interface, com rótulos pt-BR — `partial` =
  "Parcial — ainda em andamento", `outcome_unknown` = "Resultado incerto — verificar") e o `check` de
  `ai_jobs.status` na migration. Worker `ai-jobs-worker` (edge) consome o tick; cron `ai-jobs-tick-1min`
  faz `net.http_post` para ele, autenticado por `x-cron-secret` do Vault (`get_ai_jobs_cron_secret`, RPC
  `security definer`) ou Bearer de usuário. Contrato:
  `tests/contracts/ai-jobs-estados-e-durabilidade.contract.test.ts`.

### IA-047 / IA-048 / IA-049 — PR #1571

Migration `supabase/migrations/20261002411230_ia047_idempotencia_de_efeitos.sql` (classe aditiva).

- **IA-047 (efeitos idempotentes):** três colunas **NULLABLE** novas (`conversation_tasks.client_task_id`,
  `conversation_analyses.request_key`, `notifications.dedupe_key`) e três **índices únicos parciais**
  (`where <coluna> is not null`), de modo que o histórico com chave nula convive sem colisão; mais a tabela
  `talkx_test_send_claims` (RLS, `request_key UNIQUE`) — um claim durável registrado antes do POST, para
  que repetir o mesmo pedido **não** reabra o envio. Contrato:
  `tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts`.
- **IA-048 (cancelar fora de contexto):** identidade de requisição e revalidação de contexto antes do
  efeito — `src/lib/aiRequest/context.ts` (+ teste), revalidação no servidor
  (`_shared/__tests__/ai-context-revalidation.test.ts`, com marcas nos consumidores
  `ai-conversation-analysis`, `ai-conversation-summary`, `ai-proxy`, `ai-suggest-reply`,
  `ai-enhance-message`, `_shared/ai-conversation-pipeline.ts`, `_shared/schemas.ts`) e descarte de resposta
  obsoleta no front (`AIConversationAssistant.ia048`, `AISuggestions.ia048`, `ConversationSummary.ia048`,
  `useObjectionDetector.ia048`, todos em `__tests__/`).
- **IA-049 (ledger garantido):** `_shared/ai-usage.ts` expõe `logAiUsageDetached`, que entrega a promessa
  do insert a `EdgeRuntime.waitUntil` quando disponível e, quando não, **aguarda** — nunca descarta a
  promessa (o vazamento que transformava consumo pago em registro perdido).

### IA-049 — PR #1602

- **Conclusão da dívida do IA-033 (áudio/voz no despacho central):** `classify-audio-meme` (purpose
  `tagging`) e `voice-agent` (purpose `copilot`) passam a usar `generateWithRouting`; nenhum dos dois
  referencia mais o endereço fixo do gateway (confirmado por busca no workspace). O `voice-agent` preserva o
  tratamento explícito de `429` ("Rate limit exceeded") e `402` ("AI credits exhausted") e deriva a mensagem
  de demora do `504`.
- **IA-049 (ledger):** `logAiUsageDetached` é o registro destacado descrito acima; o `ai-proxy` o utiliza.
- **IA-050 (abrir circuito e degradar honestamente):** a **degradação honesta está entregue** — os códigos
  explícitos `429`/`402` são preservados na migração de voz e o `504/TIMEOUT` é distinguível de um `502`
  (IA-041), e a reserva de orçamento separa `denied` de `infrastructure_error` (IA-044). Já a **abertura de
  circuito** (suspender provedores com falhas repetidas, limitar concorrência) **não foi entregue**:
  verificado por medição em 02/10/2026 — nenhum PR cita `IA-050` (`gh pr list --search IA-050` devolve lista
  vazia) e não existe contagem de falhas nem suspensão por provedor em `supabase/functions/**`. Fica como
  pendência declarada, não como etapa concluída.

### Auditoria — PRs #1609 e #1627

- **#1609:** prova **real, em produção**, do orçamento e do rate limit com a conta de teste
  `multiplix.compras@promobrindes.com.br`, via o artefato `scripts/qa/prova-orcamento-rate-limit.sh`
  (recusa rodar sem `PROVA_PRODUCAO=sim`; nunca imprime senha/token).
- **#1627:** migration `20261002511230_cron_ai_jobs_tick_fora_do_minuto_zero.sql`. No minuto 0 de cada hora
  coincidiam 9 jobs agendados num banco com `max_worker_processes=6`, e o agendador falhava por
  "job startup timeout"; o tick da fila de IA sai do minuto 0 (`1-59 * * * *`), mantendo a cadência de 1
  minuto.

## Provas

**Contratos em `tests/contracts/` (arquivos lidos no workspace; contagem = casos `it`/`test` no arquivo):**

| Contrato | Casos | Cobre |
|---|---|---|
| `ai-resilience-prazos-retry.contract.test.ts` | 22 | IA-041 / IA-042 |
| `ai-rate-limit-e-orcamento.contract.test.ts` | 30 | IA-043 / IA-044 |
| `ai-jobs-estados-e-durabilidade.contract.test.ts` | 33 | IA-045 / IA-046 |
| `ia047-idempotencia-de-efeitos.contract.test.ts` | 18 | IA-047 |

Além desses, `supabase/functions/_shared/ai-usage.test.ts` cobre `logAiUsageDetached` (IA-049) e
`supabase/functions/_shared/__tests__/ai-context-revalidation.test.ts` cobre a revalidação (IA-048).

**Provas declaradas de banco e PostgreSQL descartável:**

| Etapa / PR | Prova |
|---|---|
| IA-043/IA-044 (#1529) | 6 funções com assinatura congelada no banco canônico; tabela `ai_budget_reservations` com RLS e 3 índices |
| IA-045/IA-046 (#1546) | PostgreSQL 16 descartável: **12/12** (claim concorrente de 5 workers sem duplicidade; `partial` não terminal; transição inválida levanta `22023`; rollback). No banco canônico: **8 funções** com `anon_exec=false`, `ai_jobs` com `rls=true`, **4 índices**, cron `ai-jobs-tick-1min` ativo |
| IA-047..IA-049 (#1571) | PostgreSQL 16 descartável: **15/0** (o segundo pedido idêntico é recusado por `23505`; linhas antigas de chave nula convivem pelo índice parcial). No banco canônico: 3 colunas novas, 3 índices únicos parciais, `talkx_test_send_claims` com RLS |
| Auditoria #1609 | Contagens medidas no banco: `ai_budget_reservations` **0 → 4**, `edge_rate_limits` **32 → 51**, `ai_usage_logs` **21 → 26** |

**Integridade de deploy:** em cada PR que tocou `supabase/functions/**`, o `deployment-manifest.json` foi
regenerado e os arquivos-chave foram conferidos **byte-idênticos** à `main` após o merge (`git diff`
vazio) — declarado pela execução.

## Limites e o que não foi provado

- **A cobertura de testes de integração do Bloco 05 foi feita em PostgreSQL descartável (container), não
  em produção.** As provas 12/12 e 15/0 acima reproduzem o estado a partir da especificação num banco
  descartável; não são o banco canônico.
- **IA-050 não entregue (declarado, não mascarado).** A abertura de circuito — suspender temporariamente
  provedores com falhas repetidas — **não existe** como código no repositório. Medido em 02/10/2026:
  `gh pr list --state all --search "IA-050"` devolve lista vazia (nenhum PR) e a busca em
  `supabase/functions/**` por contagem de falhas/suspensão não encontra mecanismo algum (o único casamento é
  a palavra "short-circuits" num comentário de `_shared/ai-guards.ts`). O que existe e foi verificado é a
  degradação honesta: `429`/`402`/`504` explícitos e a separação `denied` × `infrastructure_error`.
- **O handler `ai.generate` do worker está DESLIGADO por padrão** (flag `AI_JOBS_ENABLE_AI_GENERATE`):
  sem a flag, o handler nem carrega a pilha de geração e o job termina `failed`. Os handlers registrados
  no worker são `ai_jobs.reap_expired`, `ai.generate` (atrás da flag) e `effect.reconcile`.
- **6 testes de `scripts/ci/*.unit.mjs` não rodam no ambiente local do executor** porque fazem `git init`
  (bloqueado por guarda). É limitação de ambiente, não falha do código.
- **O deploy de Edge Functions é automático no merge na `main`** (o environment `producao-edge-functions`
  tem só branch policy; nenhum card de aprovação humana aparece). Não há, portanto, aprovação manual a
  registrar entre o merge e a função no ar.

## Achados fora do escopo (não corrigidos)

- **Contenção do agendador `pg_cron` resolvida só pela metade.** A migration do #1627 tira **apenas** o
  cron `ai-jobs-tick-1min` do minuto 0 e **declara** que os outros dois `* * * * *` (`talkx-scheduler-1min`
  e `tasks-notify-due`) continuam no minuto 0, com 9 concorrentes contra `max_worker_processes=6`
  (medido: 234 falhas "job startup timeout" em cada). Não corrigido nesta série.
- **A dívida declarada do IA-033 no ratchet de roteamento ficou obsoleta.** O contrato
  `tests/contracts/ai-central-routing-ratchet.contract.test.ts` mantém a constante `DIVIDA_IA_033` listando
  `voice-agent` e `classify-audio-meme` como "ainda falam com o gateway antigo", mas o PR #1602 migrou os
  dois (nenhum referencia o endereço fixo). Como a lista é uma *allowlist*, o teste continua verde: é uma
  entrada de inventário desatualizada, não uma regressão.
- **Comentário desatualizado no worker.** O cabeçalho de `supabase/functions/ai-jobs-worker/index.ts`
  afirma que "a migration deste PR cria o segredo no Vault, mas NÃO cria essa RPC" (`get_ai_jobs_cron_secret`);
  a migration `20261002371230` **cria** a RPC. É um comentário defasado — o guard não fica fail-closed por
  ausência da função.
