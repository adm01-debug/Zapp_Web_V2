# 🔬 AUDITORIA TÉCNICA EXAUSTIVA — ZAPP (Promo Brindes)

> Executada em 2026-09-27 · Auditor: Hermes (Arquiteto Sênior + QA) · Repo `adm01-debug/Zapp_Web_V3`
> Método: **toda nota tem medição**. Onde não houve acesso, está escrito **NÃO AUDITÁVEL**.
> Nota do prompt: "22 dimensões" — os critérios detalhados listam **20**. Auditei as 20.

---

## FASE 0 — INVENTÁRIO (medido)

| Item | Medida |
|---|---|
| Repositório / branch | `adm01-debug/Zapp_Web_V3` · `main` = `5e24bec6e` (4.406 arquivos versionados) |
| Frontend | React + Vite + TS + Tailwind/shadcn · **432.020 LOC** em `src/` (2.383 arquivos) · 13 features · 82 rotas · 47 páginas |
| Backend | **125 Edge Functions (Deno)**, **67.530 LOC** · self-hosted Supabase (`zapp`/`evo`/`public`) |
| Banco | **467 tabelas + 730 views** (zapp 388+258 · evo 76+33 · public 3+439) · 290 FKs · 1.296 índices · **1.514 policies RLS** · 367 triggers |
| Testes | **688 arquivos** · 115.345 LOC · 9.484 passando (medido) · 110 E2E · 129 contratos de edge |
| CI/CD | **54 workflows** · 11 contextos obrigatórios (branch protection) |
| Migrations | **165 no repo** × **861 aplicadas** |
| Documentação | **1.031 arquivos** em `docs/` (44 estado · 40 ADRs · 10 runbooks) |
| Integrações | Evolution API (WhatsApp) · Bitrix24 (`bitrix-api` + `SECURITY.md`) · n8n (fora do repo) · Sentry · Cloudflare · Traefik/Swarm |
| Ambientes | **prod = `https://zapp.atomicabr.com.br`** (+ 2 domínios espelho) · **sem staging/preview** |
| Último deploy | hoje 15:31Z · `5e24bec6e` · **prod == main** (validado por `version.json`) |
| Bundle (gzip, medido em prod) | entry **482 KB** · vendor-react **753 KB** · charts 470 KB · pdf 423 KB · sentry 284 KB |

---

## FASE 1 — AS 20 DIMENSÕES

### 1. Arquitetura — **7/10**
- ✅ Feature-based (`src/features/*`, 13), `_shared/` para as edges, **40 ADRs**, plano de desacoplamento em 100 etapas (`docs/decouple/PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md`).
- ⚠️ **125 edge functions** é superfície gorda; `src/hooks/useEvolutionApiManagement.ts` = **1.617 linhas**, `useExternalApiManagement.ts` = **1.510** (god-modules).
- ⚠️ `public` com **439 views** = herança de esquema; `src/integrations/supabase/types.ts` não reflete o banco real (388 erros ao regenerar).
- **Gap p/ 10:** boundaries por feature não fiscalizados por lint; deps circulares não medidas.
- **Ação:** regra de lint de import entre features + teto de 400 linhas por arquivo num `score-ratchet`.

### 2. Autenticação — **7/10**
- ✅ Supabase Auth (JWT) com guard `requireUser` em todas as edges; tratamento de 401/403 com **halt deliberado** (não silencioso) — `useEvolutionAutoReconnect.ts:512-516`.
- ✅ Sem 401 silencioso: o erro vira evento (`connection:credential-error`) + log estruturado.
- ❌ **MFA não evidenciado**; rate limiting/brute-force no login **não evidenciado** (depende do GoTrue); password policy **não evidenciada**.
- **Gap p/ 10:** MFA, política de senha e lockout explícitos.
- **Ação:** habilitar MFA no GoTrue (self-hosted) + documentar política em `docs/ENV_SETUP.md`; `RATE LIMIT` por IP no Traefik para `/auth/v1/token`.

### 3. Autorização — **9/10**
- ✅ **RLS em 466 de 467 tabelas (100%)** — única exceção medida: **`zapp.cookies_config`**; 1.514 policies; `security_invoker` em views (há check obrigatório "Verify security_invoker on all views").
- ✅ RBAC por role (`requireAdminOrSupervisor`), RPCs `SECURITY DEFINER` com checagem de claims, campo sensível mascarado (`zapp.mask_chan*`), **audit trail** (`zapp.pii_access_log`, `ops.hermes_change_log`).
- **Gap p/ 10:** 1 tabela sem RLS + testes de RLS por role não evidenciados.
- **Ação:** migration `ALTER TABLE zapp.cookies_config ENABLE ROW LEVEL SECURITY` + policies espelhando a tabela irmã; teste negativo/positivo por role.

### 4. Banco de Dados — **6/10**
- ✅ Migrations versionadas e **transacionais**; 290 FKs; 1.296 índices; constraints validadas por gate vivo (`DB Invariants`).
- ❌ **687 migrations aplicadas sem arquivo no repo** (shadow) — governança real quebrada; `docs/ops/RUNBOOK-MIGRATION-DRIFT.md` existe, decisão não executada.
- ❌ Catálogo de schema **divergente** (objetos externos injetados + 14 funções novas do `zapp` ausentes) — `DB Guard` vermelho **de propósito**.
- ⚠️ Sem partitioning documentado; backup/restore **não verificado** (216 referências no repo, sem teste de restore medido).
- **Ação:** executar `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md` (materializar/documentar as 687) e fechar o catálogo pelo caminho canônico.

### 5. CI/CD — **8/10**
- ✅ **54 workflows**, 11 checks obrigatórios, typecheck, **129 contratos de edge** (deno), testes de migration, **CodeQL**, **gitleaks**, E2E em VPS real, deploy em 3 estágios (build/deploy/health).
- ✅ Branch protection ativa (`branch-protection-sentinel.yml` com `EXPECTED_CONTEXTS`).
- ❌ **Sem staging/preview por PR**; rollback **manual** (tag de imagem); sem versionamento semântico/changelog automático; notificação de falha não evidenciada.
- ⚠️ `concurrency` com `cancel-in-progress` cancela runs de pushes consecutivos (A-F7-001) — comportamento projetado, mas confunde.
- **Ação:** job de preview no PR + `docs/ops/RUNBOOK-ROLLBACK.md` (5 linhas: `gh workflow run deploy-vps.yml -f sha=<anterior>`).

### 6. Data Integrity — **7/10**
- ✅ Migrations atômicas; `DB Invariants` como gate; auditoria de alterações (`ops.hermes_change_log`); webhooks com **HMAC verificado** (`webhook-hmac-selftest`); `deleted_at` em **54 arquivos/13 migrations** (soft delete existe).
- ❌ Idempotência de ingestão **não testada** (o dedupe existe, sem teste de replay evidenciado); sem optimistic locking evidenciado.
- **Gap p/ 10:** teste de replay de webhook (mesmo evento 2×) + política de soft delete documentada.
- **Ação:** teste de contrato "webhook duplicado não duplica mensagem" no pacote de contratos das edges.

### 7. Documentação — **9/10**
- ✅ **1.031 arquivos** em `docs/`: 40 ADRs, 44 docs de estado, 10 runbooks, `ENV_SETUP.md`, `CLAUDE.md` (407 linhas), `AGENTS.md`, 13 docs de incidente.
- ✅ Decisões de migração/limpeza registradas com evidência.
- ❌ Sem OpenAPI/Swagger dos 125 endpoints de edge; sem CHANGELOG automatizado; dicionário de dados não evidenciado.
- **Ação:** gerar `docs/api/openapi.yaml` a partir do router de `evolution-api`/`bitrix-api` (os 2 maiores) e publicar.

### 8. Infraestrutura / DevOps — **7/10**
- ✅ **DB não é alcançável publicamente** (medido: `ECONNREFUSED` por TCP do runner) — segmentação real; **Swarm secrets + Supabase Vault**; SSL por Traefik/Cloudflare; health checks (`edge-health`, `connection-health-check`); Cloudflare na borda.
- ❌ Sem IaC (compose versionado ≠ Terraform); **sem staging**; DR não evidenciado.
- **NÃO AUDITÁVEL:** backups/restore (agenda e teste), sizing/autoscaling, CVEs da imagem base — exige acesso ao host.
- **Ação:** `pg_dump` diário para off-site + **teste de restore trimestral** documentado.

### 9. Logging / Monitoring — **9/10**
- ✅ Logs **JSON estruturados** com `{ts, level, module, sid, msg, ctx}` (provado no console de produção colado); **Sentry** ativo; métricas de negócio próprias (`[ZAPP_METRIC]` TTM/rota); `sid` correlaciona a sessão; **22 `retention-days`** nos workflows; detecção de **burst de 401** no banco (`evolution_alerts`).
- ❌ Uptime monitoring externo não evidenciado; PII aparece em log de cliente (telefone no console).
- **Ação:** Better Stack/UptimeRobot nos 3 domínios + mascarar telefone no log de cliente.

### 10. Observabilidade — **6/10**
- ✅ Error tracking (Sentry) + métricas de negócio + funções de saúde no banco (`fn_health_preflight`, `fn_system_health_score`) + stack de watchdogs (`evolution-watchdogs`/`evo-reconcile`).
- ❌ **Sem tracing distribuído** (n8n → Supabase → Bitrix = caixa preta); sem SLOs/SLIs; sem dashboards evidenciados; sem feature flags.
- **Ação:** definir 3 SLOs (disponibilidade do app, latência P95 de envio, taxa de webhook processado) e um dashboard único.

### 11. Lógica de Negócio — **8/10**
- ✅ Regras no **backend** (RPCs + edges) com front consumindo = fonte única; 688 arquivos de teste; SLA/roteamento/filas com testes; `loop_protection_active` e `auto_reconnect` como máquinas de estado explícitas; timezone America/Sao_Paulo.
- ❌ Dinheiro: sem uso de NUMERIC evidenciado nas tabelas de pedido (verificar antes de assumir); regras sensíveis hardcoded em alguns hooks.
- **Ação:** mover as 3 regras de SLA hardcoded para tabela de configuração + teste de contrato.

### 12. Manutenibilidade — **7/10**
- ✅ **20 `any` em 432k LOC** e **5 `console.log`** — excepcional; **8 TODOs**; hábito de poda registrado (commits `poda-actions-mortas`); Dependabot ativo.
- ❌ God files (1.617 e 1.510 linhas); 388 erros ao adotar os tipos reais; `src/integrations/supabase/types.ts` defasado.
- **Ação:** quebrar os 2 god files por responsabilidade + ratchet de tamanho por arquivo.

### 13. Operacionalidade — **8/10**
- ✅ Deploy reprodutível por workflow (3 jobs); 10 runbooks; incidentes documentados; **circuit breaker real** (`isInstancePaused` + backoff + `loop_protection`); **degradação graciosa provada hoje** (app seguiu operando com a Evolution em 401).
- ❌ Rollback não documentado em runbook único; feature flags ausentes; zero-downtime não verificado (Swarm `--force` reinicia tasks).
- **Ação:** runbook de rollback (1 página) + flag para desligar a Evolution individualmente no front.

### 14. Performance — **6/10**
- ✅ Boot medido em produção: **TTM 1.651 ms**; code-splitting por vendor; **limitador de concorrência próprio** (o `Supabase slot acquire` do log); react-query com cache.
- ❌ **Entry 482 KB gzip** (limite do prompt: 250 KB) + vendor-react 753 KB + charts 470 KB + pdf 423 KB — payload inicial pesado (vendor-pdf/charts não deveriam carregar no boot).
- ❌ N+1 e paginação server-side não verificados; sem Web Vitals monitorados; sem teste de carga.
- **Ação:** import dinâmico de `pdf`/`charts`/`motion` por rota + `web-vitals` reportando ao Sentry; medir LCP real de 3 rotas.

### 15. Qualidade de Código — **8/10**
- ✅ ESLint + **husky + lint-staged + commitlint** (provado: commit com maiúscula é rejeitado); conventional commits na prática; **gitleaks** no pipeline; 20 `any`; style guide no `CLAUDE.md`.
- ❌ Sem PR template evidenciado; sem relatório de cobertura; god files.
- **Ação:** `.github/pull_request_template.md` com checklist (teste, migration, rollback).

### 16. Segurança — **8/10**
- ✅ **CodeQL + gitleaks + "Security & Compliance" + "Verify security_invoker on all views"** são checks obrigatórios; CORS restrito (`_shared/cors.ts`); webhooks assinados; guards de auth em todas as edges; RLS 100%; **mascaramento de PII + log de acesso a PII**; segredos em Swarm secret/Vault (nunca no repo).
- ❌ **Rotação de segredos falhou na prática**: a chave da Evolution está inválida em 3 cópias (env, vault, tabela) — incidente de hoje; pen test não realizado; 1 tabela sem RLS.
- **Ação (P0):** rotacionar `EVOLUTION_API_KEY` + eliminar as cópias mortas; checklist trimestral de rotação (`evolution_api_consumers.rotation_needed` já sinaliza 3).

### 17. Testes — **8/10**
- ✅ 688 arquivos / 115k LOC; **9.484 passando**; E2E em VPS real; 129 contratos de edge; testes de migration; testes de segurança (ex.: `bitrix-api/__tests__/security.test.ts`).
- ❌ Sem número de cobertura medido; sem teste de carga; flakiness conhecida (faketimes/fila); tempo total do CI não medido.
- **Ação:** `vitest --coverage` com meta 70% em `src/features/**` + `k6` no endpoint de envio.

### 18. Tipagem / Type Safety — **6/10**
- ✅ `strict: true`; **20 `any` explícitos** em 432k LOC; tipos do banco gerados (`supabase gen types` no repo).
- ❌ **O tipos gerados não são adotáveis hoje: 388 erros em ~60 arquivos** — o app consulta colunas/nomes que o schema real não confirma (`useQueueDetails.ts`, `ChatPopup.tsx`). Isso é **risco de correção latente**, não só de tipos.
- **Ação:** projeto de saneamento em ondas (começar pelos 12 arquivos com erro de coluna inexistente); depois regenerar `types.ts` e fechar o gate do catálogo.

### 19. Validação — **8/10**
- ✅ **282 schemas Zod** compartilhados; validação server-side nas edges (422 estruturado); constraints/CHECK no banco com gate; **213 referências de validação de MIME/magic bytes**; normalização BR (telefone via `whatsapp-cloud-normalizer`); transições de estado guardadas.
- ❌ Sem validação de CPF/CNPJ evidenciada; mensagens de erro não auditadas uma a uma.
- **Ação:** schema Zod único para os 5 payloads mais críticos (pedido, contato, mensagem, campanha, transação).

### 20. Operações (Processos) — **8/10**
- ✅ Branches + PR + conventional commits; deploys por workflow documentado; 13 documentos de incidente; backlog técnico visível (ADRs + planos de 100 etapas); Dependabot ativo.
- ❌ Sem SLA de code review; sem rotina trimestral de segurança; sinos de "quem faz o quê" em incidente não formalizados.
- **Ação:** `docs/ops/ONCALL-E-INCIDENTES.md` (severidades, quem chama quem, template de post-mortem).

---

## FASE 2 — CONSOLIDAÇÃO

```
╔══════════════════════════════════╦═══════╦══════════════════════════════════════════════════╗
║ DIMENSÃO                         ║ NOTA  ║ GAP PRINCIPAL PARA 10/10                          ║
╠══════════════════════════════════╬═══════╬══════════════════════════════════════════════════╣
║ 1.  Arquitetura                  ║ 7/10  ║ god files + boundaries não fiscalizados           ║
║ 2.  Autenticação                 ║ 7/10  ║ MFA, política de senha e lockout não evidenciados ║
║ 3.  Autorização                  ║ 9/10  ║ 1 tabela sem RLS (zapp.cookies_config)            ║
║ 4.  Banco de Dados               ║ 6/10  ║ 687 migrations shadow + catálogo divergente       ║
║ 5.  CI/CD                        ║ 8/10  ║ sem staging/preview; rollback manual              ║
║ 6.  Data Integrity               ║ 7/10  ║ idempotência de webhook sem teste de replay       ║
║ 7.  Documentação                 ║ 9/10  ║ sem OpenAPI dos 125 endpoints de edge             ║
║ 8.  Infraestrutura / DevOps      ║ 7/10  ║ sem IaC/staging; DR e restore não verificados     ║
║ 9.  Logging / Monitoring         ║ 9/10  ║ sem uptime externo; PII no log de cliente         ║
║ 10. Observabilidade              ║ 6/10  ║ sem tracing distribuído, SLOs ou dashboards       ║
║ 11. Lógica de Negócio            ║ 8/10  ║ regras de SLA hardcoded                           ║
║ 12. Manutenibilidade             ║ 7/10  ║ god files + 388 erros de tipo latentes            ║
║ 13. Operacionalidade             ║ 8/10  ║ rollback sem runbook único; sem feature flags     ║
║ 14. Performance                  ║ 6/10  ║ entry 482 KB gzip (limite 250 KB)                 ║
║ 15. Qualidade de Código          ║ 8/10  ║ sem PR template e sem cobertura medida            ║
║ 16. Segurança                    ║ 8/10  ║ rotação de segredos falhou (chave Evolution)      ║
║ 17. Testes                       ║ 8/10  ║ cobertura não medida; sem teste de carga          ║
║ 18. Tipagem / Type Safety        ║ 6/10  ║ 388 erros ao adotar os tipos reais do banco       ║
║ 19. Validação                    ║ 8/10  ║ sem validação de CPF/CNPJ                         ║
║ 20. Operações (Processos)        ║ 8/10  ║ sem SLA de review nem rotina de segurança         ║
╠══════════════════════════════════╬═══════╬══════════════════════════════════════════════════╣
║ NOTA GERAL PONDERADA             ║ 7.5/10║ (pesos do prompt: ×3 Seg/Auth/Autz/DI, ×2 Banco/║
║                                  ║       ║  Tipagem/Validação/Testes/Arquitetura)           ║
╚══════════════════════════════════╩═══════╩══════════════════════════════════════════════════╝
```

### Top 10 ações por ROI (impacto ÷ esforço)

| # | Ação | Impacto | Esforço | Onde |
|---|---|---|---|---|
| 1 | **RLS em `zapp.cookies_config`** (única tabela desprotegida) | Alto | **Mínimo** | migration 3 linhas |
| 2 | **Rotacionar `EVOLUTION_API_KEY`** + eliminar as 3 cópias mortas | Alto | Baixo | VPS + vault + tabela |
| 3 | **Religar o WhatsApp `wpp2`** por QR | Alto | Baixo | app (dono) |
| 4 | **Runbook de rollback** (1 página) + ensaio cronometrado | Alto | Baixo | `docs/ops/` |
| 5 | **Lazy-load de `pdf`/`charts`/`motion`** (entry 482 KB → meta < 300 KB) | Alto | Baixo | `vite.config` + rotas |
| 6 | **Cobertura medida** + meta 70% em `src/features/**` | Alto | Médio | CI |
| 7 | **Saneamento de tipos** em ondas (388 erros; começar pelos 12 de coluna inexistente) | Alto | Alto | `src/**` |
| 8 | **Materializar/documentar as 687 migrations shadow** | Alto | Médio | migration/docs |
| 9 | **OpenAPI** das 2 maiores edges (`evolution-api`, `bitrix-api`) | Médio | Médio | docs |
| 10 | **3 SLOs + dashboard único** (app, envio, webhook) | Médio | Médio | Sentry/Grafana |

### Roadmap em 3 ondas

**🔴 Quick Wins (1–3 dias):** #1 RLS `cookies_config` · #2 rotação da chave · #3 QR do WhatsApp · #4 runbook de rollback · #5 lazy-load · PR template.

**🟠 Sprint 1 (1–2 semanas):** #6 cobertura · #8 migrations shadow · #10 SLOs/dashboard · uptime externo · teste de replay de webhook · políticas de senha/MFA documentadas.

**🟡 Sprint 2 (2–4 semanas):** #7 saneamento de tipos (ondas) · #9 OpenAPI · quebra dos god files · staging/preview por PR · teste de carga (k6) · migration de RLS tests por role.

---

## NOTA FINAL — 7.5/10

Sistema **maduro acima da média** para uma operação do tamanho da Promo Brindes: RLS praticamente total (466/467), 1.514 policies, 688 arquivos de teste, 54 workflows de CI, 1.031 documentos com 40 ADRs, logs estruturados com correlator de sessão, degradação graciosa **provada em produção hoje** (o app continuou funcionando com a Evolution API em 401) e um incidente de credencial que o próprio sistema sinalizou no console. O que segura a nota longe de 9-10 não é falta de engenharia, é **dívida de consistência**: 687 migrations aplicadas sem arquivo no repositório, catálogo de schema divergente (gate vermelho por medição verdadeira), tipos do banco que o app não consegue adotar (388 erros) e rotação de segredos que falhou na prática — os quatro são o **mesmo tema**: o código e o banco evoluíram por caminhos diferentes. Fechar esses quatro leva o sistema a ~8.5; os itens de staging, tracing/SLOs e IaC completam o 10.

---

## CORREÇÕES DESTA AUDITORIA (medidas depois da primeira versão)

Três itens foram **revisados para cima** ao medir mais fundo — registro aqui para a nota ser confiável:

| Dimensão | Antes | Agora | Por quê |
|---|---|---|---|
| 14. Performance | 6/10 | **8/10** | Erro meu de grandeza: comparei **bytes raw** (curl no CDN) com alvos em **gzip**. Os números reais: entry **~144 KB gz** (budget 600 KB), total inicial **~1,2 MB gz** (budget 2 MB) → o app **passa** no próprio orçamento. Além disso existe `scripts/check-performance-budget.mjs` + `performance-baseline.json` desde 04/08 — **gate órfão, nenhum workflow o chamava** (corrigido no PR #1601, que rodou em 1m22s e passou). |
| 13. Operacionalidade | 8/10 | **9/10** | `docs/deploy/runbook-deploy-versionado.md` (231 linhas) já documenta rollback com `--image` explícito, tag imutável `production-<sha12>` e o input `image_tag` — runbook existe; restou mesmo só feature flag. |
| 15. Qualidade de Código | 8/10 | **8/10** | `.github/PULL_REQUEST_TEMPLATE.md` já existe (desde 24/08) e cobre conventional commits, E46, rollback de migration e segredos — o gap "sem PR template" que eu apontei **não existia**. |
| 3. Autorização | 9/10 | **9/10** | O único gap prático listado (1 tabela sem RLS) foi **fechado**: `zapp.cookies_config` agora tem RLS ligada + policy de admin/supervisor e nenhuma de escrita (PR #1600, aplicado no banco canônico). O 9 permanece pelo que ainda falta medir: testes de RLS por role. |

**Nota geral ponderada revisada: 7.6/10** (mesmos pesos do prompt).

### O que a auditoria NÃO tinha visto e apareceu na execução
1. **`zapp.cookies_config` era um vazamento real** (dimensão 16, não só 3): guarda cookie/token/csrf e estava com RLS **desligada** — a policy existia, mas policy sem RLS é inerte, e `authenticated` mantinha SELECT/INSERT/UPDATE/DELETE. Qualquer usuário logado lia as credenciais na tabela **e** pela view `public.cookies_config` (`security_invoker=true` herda a RLS do chamador; sem RLS na origem, não havia o que herdar). Estado medido antes: `rls=false policies=1 grants_auth=DELETE,INSERT,SELECT,UPDATE`. **Corrigido e aplicado** (PR #1600).
2. **`prospeccao` ficava fora das minhas contagens de RLS** (eu media só `public`, `zapp`, `evo`). Auditado: `prospeccao.cookies_config` tem RLS ligada e **zero policies** = exclusivo do service_role, correto desde `20260927123617`.
3. **Gate de performance órfão**: existia, funcionava, e nada o executava — por isso o bundle podia crescer sem registro. Ligado no PR #1601.
4. **Nota de método**: ao auditar cobertura de RLS e de ferramentas, conte **por schema** e **imprima a lista de arquivos**, não só a contagem — dois erros desta auditoria nasceram de glob/contagem incompletos.

---

## CORREÇÕES — 2ª RODADA (itens que eu apontei como gap e **já existiam**)

Simulei antes de executar e **evitei 5 trabalhos inúteis**. Registrando cada um, porque nota de auditoria só vale se o erro for corrigido com o mesmo destaque:

| Item que eu apontei como gap | Realidade medida | Dimensão |
|---|---|---|
| "Idempotência de webhook **sem teste de replay**" | **Existe**: `supabase/functions/evolution-webhook/__tests__/contract.test.ts:66` — `Deno.test("Idempotência: dedup por sha256(instance:event:body) + markEventProcessed")`, asserindo `duplicate: true` e os estados `rejected/duplicate/processed/error` | 6 |
| "**Cobertura não medida**" | **Medida e com threshold**: `ci.yml:491` roda `bun run test -- --coverage` + upload do relatório + gate de `coverage-summary.json`; `vitest.config.ts:79-87` define `lines 25 / functions 18 / branches 15` | 17 |
| "687 migrations shadow = **governança quebrada**" | **Governança documentada e decidida**: `docs/ops/migrations-manifest.csv` (668 linhas, com `bucket`, `action`, `risk`, `evidence`) + `MIGRATIONS_CLEANUP_DECISIONS.md` (9 DELETE / 283 ARCHIVE / 94 BACKFILL-FILE / 206 TOMBSTONE) + `RUNBOOK-MIGRATION-DRIFT.md` | 4 |
| "**Regras de SLA hardcoded**" | **Externalizadas**: `zapp.sla_delivery_rules` (`warning_threshold_minutes`, `breach_threshold_minutes`, `applies_to`, `is_active`) e `useSLAConfigurations.ts` lê/escreve a tabela `sla_configurations`; o `120` é apenas default de formulário | 11 |
| "PII (telefone) em log de cliente" | **Não evidenciado**: `src/lib/logger.ts` — em PROD o logger emite **só a mensagem** (`console.debug(msg)`), descartando os argumentos com objeto. Nenhum `console.log` cru manda JID/telefone | 9 |
| "`prospeccao` exposto" | Já fechado desde `20260927123617`; hoje `prospeccao.cookies_config` tem RLS ligada e **zero policies** (service_role-only, correto) | 3/16 |

**Lição de método (a que mais custou):** antes de declarar um gap de *cobertura de teste*, *gate* ou *documentação*, procure o artefato e **imprima a lista**. Contagem e glob incompletos geraram 6 afirmações erradas nesta auditoria — todas corrigidas aqui.

### Executado nesta 2ª rodada
- **INV-7 (novo invariante live de RLS)** — PR [#1602](https://github.com/adm01-debug/Zapp_Web_V3/pull/1602): `scripts/sql/check-rls-coverage.sql` + step no `db-invariants.yml`, no mesmo desenho do INV-6. Provado nos dois sentidos no banco canônico: escopo real `total=471 sem_rls=0` (passa) e mutation com `archive` → **dispara** acusando as 2 tabelas sem RLS. `DB Invariants` = pass no PR.
- **Gate de performance ligado** — PR [#1601](https://github.com/adm01-debug/Zapp_Web_V3/pull/1601) (rodou em 1m24s e passou).
- **RLS em `zapp.cookies_config`** — PR [#1600](https://github.com/adm01-debug/Zapp_Web_V3/pull/1600), já aplicado no banco canônico.

---

## ACHADO NOVO (P1) — o único invariante live do repositório nunca rodou

Descoberto ao validar o INV-7 **no log do CI** (não por leitura de código). O passo do INV-6 terminava assim em toda execução:

```
::warning::sem conectividade com o banco a partir do runner. Invariante nao verificado.
```

Causa medida: o secret `SUPABASE_DB_URL` **existe** (01/08/2026) e `psql` é instalável — mas o Postgres **não é publicado fora da malha do Swarm** (decisão de segurança correta). Logo `psql "$SUPABASE_DB_URL"` de fora nunca conecta, o passo cai no `exit 0`, e o INV-6 ficou **decorativo desde que nasceu**. É a mesma classe do gate de performance órfão: **gate que existe, não verifica e ninguém percebe** — só que este estava **verde**.

Rota que funciona provada: `docker exec` no container `supabase_db` (a mesma do drift-check), com `docker cp` do manifesto para `/scripts/sql/` porque o `\copy` lê do lado **cliente** do psql. Com a rota ligada, o INV-6 **rodou e reprovou**:

```
NOTICE:  [INV-6] publicacao tem 22 tabelas; manifesto tem 68
WARNING: [INV-6] 3 tabela(s) na publicacao fora do manifesto:
         [zapp.evolution_alerts, zapp.evolution_realtime_events, zapp.realtime_message_fanout]
ERROR:   [INV-6] REGRESSAO: 49 tabela(s) do manifesto sumiram de supabase_realtime
```

| Lado | Composição |
|---|---|
| Manifesto (68) | 50 `zapp` · 12 `evo` · 5 `email_app` · 1 `financeiro` |
| Publicação hoje (22) | 19 `zapp` · 3 `evo` — **só schemas deste app** |

- As 6 de `email_app`/`financeiro` saírem = **desacoplamento** explicado (schemas de outros sistemas).
- As **31 `zapp` + 9 `evo`** que saíram da publicação, e as 3 que entraram (redesenho de realtime), **precisam de confirmação de intenção** — não dá para inferir do repositório, e regenerar o manifesto é decisão de fluxo de dados em produção.
- **Decisão minha:** a correção da rota **não** entrou no PR (deixaria um check obrigatório vermelho sem o time ter decidido o conteúdo). O achado fica aqui e no corpo do PR #1602, com o passo a passo da correção e a medição.

**Nota de método desta rodada:** dois dos achados mais valiosos não vieram de ler código — vieram de **ler o log do CI** e de **conferir, no banco, se o gate realmente afirma algo**. Vale como regra: antes de confiar num gate, prove que ele já **reprovou** alguma vez; se nunca reprovou, verifique se ele executa.

---

## 3ª RODADA — validação adversarial do que eu mesmo implementei (27/09)

Cinco verificadores independentes em paralelo (red-team de RLS, qualidade de policies, mutação do gate de perf, quebra do INV-7, estado final/paridade), e eu refiz pessoalmente cada achado crítico. Método de impersonação que faltava: `DO $$ … SET LOCAL ROLE authenticated; … RAISE EXCEPTION 'marcador=%', n $$` em **um único** comando (o gateway só devolve a última linha; `begin; … rollback;` volta vazio e engana).

### Defeitos encontrados NO MEU trabalho — corrigidos

| Defeito | Como foi pego | Correção |
|---|---|---|
| **INV-7 vacuidade**: `_total` calculado e nunca usado → escopo que casasse 0 tabelas imprimia `INV-7 OK — 0 tabelas` (**verde com cobertura zero**) | quebra do INV-7 | guardas `_total = 0` e escopo de 4 schemas, provadas por mutação (`GUARD_VACUIDADE_DISPAROU: escopo {pgbouncer} casou 0 relacoes`; `GUARD_ESCOPO_DISPAROU: 3 de 4`) |
| **INV-7 `grep -m1`**: com dois stacks `supabase_db*` escolhe no chute e passa verde lendo o banco errado (reproduzido: `INV-7 OK — 0 tabelas`) | quebra do INV-7 + meu próprio WSL tem 2 containers | seleção determinística: só entra container com o schema `zapp`; >1 candidato = **erro**. Em CI: `Rota 1 (docker exec em supabase_db.1.343…) — invariante BLOQUEANTE` + `NOTICE: 471 tabelas` |
| **Afirmação falsa sobre a view**: eu escrevi que `public.cookies_config` expunha as linhas de `zapp.cookies_config` | verificador 5 | **é falso**: `pg_get_viewdef` → `FROM prospeccao.cookies_config`. Corrigido no arquivo do #1602; o texto errado segue no arquivo mergeado do #1600 e no teste (arquivo mergeado não se edita — pendência registrada) |
| **Premissa falsa do PR #1601**: eu declarei o gate de performance "órfão, nenhum workflow chama" | verificador 3 | **falso**: `quality-gate.yml` linhas 179-180 já rodavam `bun run perf:budget` desde 04/08. Meu PR criou uma **segunda invocação duplicada** (mergeado). O gap real é outro: `main` **não tem required status checks** — nenhum gate bloqueia merge, todos são advisory |
| **Migration não segura em `from scratch`** + **lint ML-001** | CI do próprio PR | `REVOKE`/`COMMENT` exigiam objetos do histórico shadow → guardas `to_regclass`/`to_regprocedure`; a frase que o lint proíbe estava no texto do meu `COMMENT` → reescrita. `Apply migrations from scratch` = **pass** |

### Falhas NO SISTEMA (não minhas) — encontradas e verificadas por mim

| Severidade | Achado | Situação |
|---|---|---|
| **P0** | `zapp.get_official_credentials_by_phone_id(text)` — função com direitos do dono, `EXECUTE` para `authenticated`, **sem checagem**, devolvendo `access_token` + `app_secret` do WhatsApp. A policy da tabela era decorativa nesse caminho | **CORRIGIDO E APLICADO** (PR #1603, versão `20260927172437`): `exec_auth=true → false`, `exec_service=true` preservado |
| **P0** | 7 funções de probe/health de cookie/LUX com `EXECUTE` para `authenticated` (escrevem na tabela de cookies, disparam HTTP com o cookie, apagam log) | **CORRIGIDO** no mesmo PR (`probe_auth=false`) |
| Média | `authenticated` mantinha `INSERT/UPDATE/DELETE` em `zapp.cookies_config` (proteção dependia de um único portão) | **CORRIGIDO** (`write_auth=false`) |
| **Alta** | **5 matviews** legíveis sem RLS: prova empírica — como `authenticated`, `mv_conversations_summary` devolve **243 linhas** e a base `zapp.conversations` devolve **0**. Matview não aceita RLS (Postgres recusa) | **pendente** — exige decisão (revogar SELECT ou expor via view `security_invoker`) |
| **Alta** | **229 das 258 views de `zapp`** sem `security_invoker` → executam com direitos do dono (BYPASSRLS) e furam a RLS da base | **pendente** — correção em massa, precisa de cuidado |
| Média | `om_reader`, `metabase_reader`, `dyad_reader` têm SELECT na tabela de credencial; `om_reader` é `BYPASSRLS` + login. O `PLANO_100` do repo já registra isso como pendente (etapa 52) | **pendente** — SQL pronto no PR #1603 |
| Média | `db-migrate` **não roda no commit de merge** (0 runs no `12cad8652`) e para no primeiro erro: `20260927210000_multiplix_*` está pendente desde `abc07b44b`. O ledger da minha migration veio do meu apply, não do pipeline | **reportado** (migration é de outro agente) |
| Baixa | `ratchet-tighten` vermelho na main desde 26/09 por `401 Bad credentials` (GH_TOKEN morto) — infra, não bloqueia (não é obrigatório) | **reportado** |

### Exageros que eu derrubei (verificação própria)

- "Até `anon` forja entrada de auditoria": **`anon` não tem grant de INSERT** nessas tabelas (`has_table_privilege=false`). O real é *qualquer autenticado*.
- "`sentry_config` vaza DSN para authenticated": a policy `USING(true)` existe, mas **DSN do Sentry é identificador público por design** (vai para o browser) — decisão defensável, não furo.
- "Views: `public` 439/439 com `security_invoker`": medi **229 de 258 em `zapp` sem** o flag — o número do outro verificador estava invertido.

### Números independentes (eu × verificador)

`471` objetos RLS ✅ · `0` sem RLS ✅ · `9` com RLS e zero policy ✅ · `20/20` partições ✅ · estado vivo == arquivo ✅ · produção == main ✅ · **`10` vs `40`** tabelas sem RLS fora de schemas de sistema (eu estava impreciso: são 10 fora de sistema, 40 no banco inteiro) ❌ corrigido · **0** segredos nos arquivos que adicionei ✅
