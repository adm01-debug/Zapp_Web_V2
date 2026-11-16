# Dossiê PR #2128

**Título:** fix(ci): Fases 2+3 do plano GA27-GA47
**Branch:** `claude/fix-ga-fase23-edge-e2e-261020-2200`
**Head SHA:** `420aae58834fc0d4358aa6701a55da3f72307eb2`
**Base SHA:** `351ccb2a651f0394b5e78fd660695c09b4f799cf` (BEHIND main@c4c7139e)
**Criado em:** 2026-10-20
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

(Requer resolução do conflito — `mergeable_state: "dirty"` — via `update_pr_branch` antes do merge)

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 17 (CI workflows, scripts edge-deploy, scripts CI, 1 arquivo de app — mudança trivial)

### Diff lido — trechos-chave

**`ci.yml` — E2E PR: troca de browsers (GA27-adjacent):**
```diff
-  run: bun run test:e2e -- --project=chromium --project=chromium-theme ... --project=firefox-email-navy --project=webkit-email-navy
+  run: bun run test:e2e -- --project=chromium --project=chromium-theme ... --project=chromium-email-navy --project=chromium-telefonia
```
Remove `firefox-email-navy` e `webkit-email-navy` do CI de PR (cross-browser passa para `e2e-logado`). Adiciona `chromium-telefonia`.

**`deploy-functions.yml` — GA30 (rollback para script):**
```diff
-  # 42 linhas de Node.js inline resolvendo o deployment
+  # GA30: resolvedor extraido para scripts/edge-deploy/resolve-rollback-ref.mjs
+  node "$RUNNER_TEMP/edge-tooling/scripts/edge-deploy/resolve-rollback-ref.mjs"
```
Lógica de rollback (busca último deployment bem-sucedido ANTERIOR ao SHA atual) extraída para script testável com `resolve-rollback-ref.unit.mjs`.

**`deploy-functions.yml` — GA32 (secrets via `--env-file`):**
```diff
-  supabase secrets set CRON_SECRET="$CRON_SECRET" --project-ref "$PROJECT_REF"
+  # GA32: valor fora do argv (aparece no ps). `printf` e builtin do bash.
+  ENVFILE="$(mktemp)"; chmod 600 "$ENVFILE"
+  printf 'CRON_SECRET=%s\n' "$CRON_SECRET" > "$ENVFILE"
+  supabase secrets set --env-file "$ENVFILE" --project-ref "$PROJECT_REF"
+  rm -f "$ENVFILE"
```
Segredo nunca entra nos argumentos de processo (visível no `ps`).

**`deploy-functions.yml` — GA33 (preflight como warning):**
```diff
-  echo "::error::Preflight read-only do CRM falhou (HTTP $STATUS)."
-  exit 1
+  echo "::warning::Preflight do CRM falhou (HTTP $STATUS) -- crm-integration fora do deploy; demais funcoes seguem (GA33)."
+  CRM_PREFLIGHT_OK=false
```
Falha de preflight do CRM agora é aviso, não erro fatal — demais funções continuam sendo deployadas.

**`deploy-functions.yml` — GA32 (headers via `-K envfile`):**
```diff
-  -H "apikey: $EXTERNAL_SUPABASE_SERVICE_ROLE_KEY" \
-  -H "Authorization: Bearer $EXTERNAL_SUPABASE_SERVICE_ROLE_KEY" \
+  HDR_CRM="$(mktemp)"; chmod 600 "$HDR_CRM"
+  printf 'header = "apikey: ...\n' > "$HDR_CRM"
+  -K "$HDR_CRM" \
```
Headers de credencial passados via file, não inline.

**`scripts/edge-deploy/health-check.mjs`** — novo/atualizado: verifica endpoint de health das edge functions.

**`scripts/edge-deploy/resolve-rollback-ref.mjs`** — NOVO: extração da lógica de rollback (com testes unitários).

**`src/hooks/chat/useFilesContainerColumns.ts`** — ÚNICA mudança de app:
```diff
+// eslint-disable-next-line react-hooks/exhaustive-deps -- sem deps intencional: re-mede a cada render
   useLayoutEffect(() => {
```
Apenas adiciona comentário `eslint-disable-next-line` — zero mudança de lógica.

**`deploy-functions.yml` — ignore `__fixtures__`:**
```diff
+  - '!supabase/functions/**/__fixtures__/**'
```
Evita deploy desnecessário quando só fixtures de teste mudam.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — GA32 é melhoria de segurança real (segredos fora de ps); GA30 extrai lógica testável; GA33 melhora resiliência do deploy |
| 2 | Traz regressão? | **NÃO** — única mudança de app (`useFilesContainerColumns.ts`) é só um eslint-disable comment sem impacto em runtime |
| 3 | Já está em main? | **NÃO** — `resolve-rollback-ref.mjs`, `--env-file`, `-K envfile`, `chromium-telefonia` são adições novas |
| 4 | Regra de negócio correta? | **SIM** — segredos via file em vez de argv é prática recomendada; preflight como warning preserva deploy das demais funções mesmo com CRM externo fora |

## Bloqueio atual

`mergeable_state: "dirty"` — conflito com `main`. Base SHA `351ccb2a` (mesmo da PR #2126) indica que essas duas branches têm origem comum anterior à main. Sem auto_merge — requer merge manual.

## Ação necessária

1. Atualizar branch contra `main` (`update_pr_branch`).
2. Aguardar os 6 checks obrigatórios ficarem verdes.
3. Fazer merge manual (squash).
