# Pendências de CI — bloqueios que exigem ação humana

> Gerado em 2026-10-30 pela sessão de correção de CI (`claude/keen-galileo-dxai3p`).
> Cada item indica o workflow, o erro exato e o que o Joaquim precisa fazer.

---

## ~~1. `types-sync` — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T01:45:45Z**

A coluna `is_pinned` já existia no banco de produção. `src/integrations/supabase/types.ts` na SHA `ca89064` confirma:
- Linha 2088: `is_pinned: boolean` (Row)
- Linha 2100: `is_pinned?: boolean` (Insert)
- Linha 2112: `is_pinned?: boolean` (Update)

**Evidência:** run [`40987628915`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40987628915) (SHA `ca89064`) — `conclusion=success`.
`bunx tsc --noEmit` na SHA `ca89064` = **0 erros**. Não requer mais ação.

---

## 2. `e2e-logado` — timeout na edge function `auth-login` / runs cancelados

**Workflow:** `.github/workflows/e2e-logado.yml`
**Último run na main:** [`40965991521`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40965991521) (SHA `a1b27118`) — **cancelled**

**Erro exato:**
```
Error: page.goto: net::ERR_ABORTED
  → POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auth-login
  → 504 Gateway Timeout (após 3 tentativas)
```

**Causa raiz:** A edge function `auth-login` não respondeu em tempo hábil — timeout de infraestrutura (Supabase Functions / cold start sob carga). Não há código errado; é instabilidade pontual de infra.

**Ação imediata necessária:** nenhuma (falha pontual de infra). Reavaliar se reaparecer em mais de 2 runs consecutivos.

---

## ~~3. `settings-guard` — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T01:42:39Z**

**Fix aplicado:** PR #2355 mergeado em SHA `ca89064b`.
**Evidência:** run [`40986380985`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40986380985) (SHA `ca89064`) — `conclusion=success`.

Não requer mais ação.

---

## 4. `db-live-guard` — todos os 7 checks do contrato DB vivo falharam

**Workflow:** `.github/workflows/db-live-guard.yml`
**Último run na main com falha:** [`40282111471`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40282111471) (SHA `2d97c44c`, 2026-10-26) — **failure**

**Causa raiz:** Versions `20261026210300`, `20261026220300`, `20261026230300` no ledger de produção sem arquivo local em `supabase/migrations/`.

**Fix aplicado:** [PR #2359](https://github.com/adm01-debug/Zapp_Web_V2/pull/2359) — 3 arquivos SQL criados com DDL exato do ledger (reconciliação pura, sem DDL novo). Aguardando merge após CI verde.

**Status:** ⏳ Aguardando CI verde no PR #2359 para merge.

---

## ~~5. `deploy-functions` — diretório de evidência criado mas vazio — RESOLVIDO~~

**Status:** ✅ **RESOLVIDO em 2026-10-30T02:53Z**

**Workflow:** `.github/workflows/deploy-functions.yml`
**Último run na main com falha:** [`40988248151`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40988248151) (SHA `ca89064`, 2026-10-30) — **failure**

**Causa raiz:** `scripts/edge-deploy/preparar-artifact-deploy.sh` criava `$DESTINO` vazio quando acionado sem deploy real → `upload-artifact` falhava.

**Fix aplicado:** [PR #2358](https://github.com/adm01-debug/Zapp_Web_V2/pull/2358) mergeado em SHA `43ab27a` — guarda no final do script: grava `sem-deploy.json` quando `$DESTINO` estiver vazio. `workflow_dispatch` disparado após merge para confirmar.

---

## 6. `db-migrate` — bloqueio de segurança por drift no ledger (design intencional)

**Workflow:** `.github/workflows/db-migrate.yml`
**Último run na main com falha:** [`40236186538`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40236186538) (SHA `2d97c44c`, 2026-10-25) — **failure**

**Causa raiz:** Mesma que db-live-guard — 3 versions órfãs. Fix no [PR #2359](https://github.com/adm01-debug/Zapp_Web_V2/pull/2359).

**Status:** ⏳ Aguardando merge do PR #2359.

---

## 7. `branch-hygiene-audit` — timeout recorrente (job ultrapassa 14h)

**Workflow:** `.github/workflows/branch-hygiene-audit.yml`
**Último run na main:** [`40289875804`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40289875804) (SHA `2d97c44c`, 2026-10-26) — **cancelled** (após ~14h)

**Causa raiz:** O job processa todas as branches e ultrapassa o timeout do GitHub Actions. Não há código errado — o repositório tem muitas branches.

**Ação imediata necessária:** nenhuma bloqueante (não afeta deploys nem o CI de PRs). Avaliar `timeout-minutes` explícito ou paginação limitada por data.

---

## 8. `db-guard` — fix ECR→ghcr.io bloqueado pela Regra 8 (PR #2354)

**Workflow:** `.github/workflows/db-guard.yml`
**Último run confirmado na main:** [`40965991318`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40965991318) (SHA `a1b27118`) — **success** (ECR estava acessível naquele momento)

**Erro que pode reaparecer:**
```
toomanyrequests: Data limit exceeded
```
O ECR público (`public.ecr.aws/supabase/postgrest:v14.5`) limita pulls anônimos por IP nos runners do GitHub.

**Fix pronto:** [PR #2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) — altera `.github/workflows/db-guard.yml` linha 68: `public.ecr.aws/supabase/` → `ghcr.io/supabase/` (mesmo SHA digest `sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b`).

**Por que está bloqueado:** Regra 8 do fluxo Git — toca `.github/workflows/`.

**O que o Joaquim precisa fazer:**
1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/pull/2354
2. Verificar que os checks de CI estão verdes
3. Mergear o PR (squash-merge)

---

*Atualizado em 2026-10-30T02:55 UTC. §5 RESOLVIDO (PR #2358 mergeado). §4/§6: fix em PR #2359 aguardando CI.*
