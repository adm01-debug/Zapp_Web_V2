# PENDÊNCIAS CI — Zapp Web V2

**Data:** 2026-10-30  
**Sessão:** https://claude.ai/code/session_01RfQzo7rsZ224WzBjCBKxqx

---

## 1. `db-guard` — job "Replay local das migrations" (ECR rate limit)

**Workflow:** `.github/workflows/db-guard.yml`  
**Job:** `Replay local das migrations`  
**Status no último run (run 41000590444):** ❌ failure  
**Erro exato:**
```
Error response from daemon: toomanyrequests: Data limit exceeded
```
**Imagem afetada:** `public.ecr.aws/supabase/postgres:17.6.1.159@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f`  
**Causa raiz:** ECR Public Gallery impõe limite de data transfer para IPs sem autenticação (~1 GB/dia por IP de runner). Os runners do GitHub Actions atingem o limite quando vários runs puxam a imagem no mesmo período.  
**Impacto:** Job não é required check — não bloqueia merge. Mas acusa failure no histórico do db-guard.  
**Remediação:** Mesma do item 2 abaixo (migrar para `ghcr.io/supabase/postgres`). PR #2354 cobre ambos.  
**Bloqueio:** Regra 8 — altera `.github/workflows/db-guard.yml`.

---

## 2. `db-guard` — imagem `public.ecr.aws/supabase/postgres` → `ghcr.io`

**Workflow:** `.github/workflows/db-guard.yml`  
**PR aberta:** [#2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) (`claude/fix-db-guard-ecr-261030`)  
**Erro exato no baseline:**
```
toomanyrequests: Data limit exceeded
```
**Causa raiz:** ECR Public Gallery removeu acesso anônimo irrestrito; pull da imagem `public.ecr.aws/supabase/postgres:17.6.1.159` falha por rate limit nos runners do GitHub Actions.  
**Fix proposto:** Substituir todas as referências de `public.ecr.aws/supabase/postgres` por `ghcr.io/supabase/postgres` no workflow, que oferece acesso autenticado com o `GITHUB_TOKEN` já disponível.  
**Ação necessária do Joaquim:** Revisar e aprovar PR #2354 (toca `.github/workflows/db-guard.yml` — Regra 8).

---

## 3. `branch-hygiene-audit` — timeout no step de auditoria

**Workflow:** `.github/workflows/branch-hygiene-audit.yml`  
**Erro exato:** Timeout excedido no step de auditoria de branches (run termina sem conclusão, workflow marcado como failure/timed out).  
**Causa raiz:** O step de auditoria não tem timeout explícito; com muitas branches no repositório, o loop de listagem de refs ultrapassa o timeout padrão do job.  
**Fix necessário:** Adicionar `timeout-minutes:` ao step ou ao job, e/ou implementar paginação no script de auditoria.  
**Ação necessária do Joaquim:** Autorizar mudança em `.github/workflows/branch-hygiene-audit.yml` (Regra 8: workflow CI).

---

## 4. `e2e-logado` — 504 Gateway Timeout no edge `auth-login`

**Workflow:** `.github/workflows/e2e-logado.yml`  
**Erro exato:** `504 Gateway Timeout` ao chamar edge function `auth-login` durante os testes E2E autenticados.  
**Causa raiz:** Problema de infraestrutura Supabase (cold start ou timeout do Supabase Edge Runtime), não do código do workflow nem dos testes. O erro é intermitente e coincide com picos de carga no projeto.  
**Impacto:** `🎭 E2E Tests (Playwright)` é required check — quando `e2e-logado` falha por este timeout, o required check falha e bloqueia merge.  
**Ação necessária do Joaquim:** Investigar configuração de warmup da edge function `auth-login` no projeto Supabase `tnnnlkbymytvtqngbbqh`; considerar retry no workflow ou keep-alive periódico da função.

---

## 5. `DB Migrate (production)` — verificação pendente pós-PR #2359

**Workflow:** `.github/workflows/db-migrate.yml`  
**Último run (run #40236186538, dispatch 2026-10-25, SHA `2d97c44c`):** ❌ failure  
**Erro exato:**
```
##[error]O ledger remoto possui versions sem arquivo local; db push foi bloqueado antes do CLI.
remote_only_count=3
```
**Step que falhou:** `Exigir alvo único ou bundle atômico conhecido` (run com `APPLY: false`)  
**Causa raiz:** 3 versions existiam no ledger de produção (`supabase_migrations.schema_migrations`) sem arquivo `.sql` correspondente no repo: `20261026210300`, `20261026220300`, `20261026230300`.  
**Fix aplicado:** PR #2359 (mergeada ✅ em 2026-10-30) adicionou os 3 arquivos `.sql` com o DDL exato já em produção (reconciliação pura — nenhum DDL novo).  
**Status atual:** Causa raiz corrigida. Um novo dispatch com `apply=false` (dry-run) confirmaria o sucesso, mas conecta ao banco de produção para leitura do ledger.  
**Ação necessária do Joaquim:** Disparar `db-migrate.yml` com `apply=false` (dry-run) e `target_version` igual à última migration do repo para confirmar que `remote_only_count=0` após a PR #2359 (Regra 8: workflow que conecta ao banco de produção).
