# RELATÓRIO CI — fix-ci-workflows-hxupgs

> Sessão: `https://claude.ai/code/session_01RfQzo6go41Q6ZGmSkVmz7W`  
> Data: 2026-11-05  
> Branch de trabalho: `claude/fix-ci-workflows-hxupgs`  
> SHA main no início: `fa7d88227ec4b75a3fc3d2a8a07cfab13d4733fd`

---

## 1. Baseline local (ANTES de qualquer alteração de código)

Todos os comandos rodados em `/home/user/Zapp_Web_V2` (clone do commit `fa7d882`).

| Etapa | Comando | Resultado | Saída relevante |
|---|---|---|---|
| Instalação | `bun install --frozen-lockfile` | ✅ exit 0 | `Checked 668 installs across 710 packages (no changes) [121.00ms]` |
| Build | `bun run build` | ✅ exit 0 | `✓ built in 20.00s` |
| TypeCheck | `npx tsc --noEmit -p tsconfig.app.json` | ✅ exit 0 | Nenhum erro de tipo |
| Lint | `npx eslint src/components src/hooks src/pages src/services --max-warnings=0` | ✅ exit 0 | Sem warnings nem erros |
| Integridade CLAUDE.md | `node scripts/ci/check-claude-md-integrity.mjs` | ✅ exit 0 | `CLAUDE.md OK: 4 secoes presentes, 28199 bytes.` |
| Guard Supabase | `node scripts/db-audit/supabase-usage-guard.mjs` | ✅ exit 0 | `Violacoes totais: 4 \| no baseline: 4 \| novas: 0` |
| Node CI scripts | `node --test scripts/ci/*.unit.mjs` (CI: job `🦧 Node CI Scripts`) | ✅ success | `conclusion: success` via CI run 42030848895 |
| Unit Tests (vitest) | PR check `🧪 Unit Tests (${{ matrix.shard }}/3)` | `skipped` | Esperado para PR com apenas arquivos de documentação |

**Conclusão do baseline:** código base do `main` em `fa7d882` está limpo; nenhuma falha ou regressão preexistente encontrada.

---

## 2. Inventário de workflows com falha

Consulta: últimas 50 runs com `conclusion=failure` na `main` (2026-11-04).

| Workflow | Última run com falha | SHA | Motivo |
|---|---|---|---|
| CI/CD Pipeline (`ci.yml`) | #11112 | `451373f5` | Flaky webkit: timeout em `e2e/email-navy-visual.spec.ts` |
| Contexto (`contexto.yml`) | #42 | `03e9568` | Erro 500 transitório do GitHub Push API |
| DB Guard (`db-guard.yml`) | #10654 | `fa7d882` | Permissão multiplix |
| Deploy Edge Functions (`deploy-functions.yml`) | #956 | `afd8c7ca` | Manifesto desatualizado (`ai-usage-outbox-drain` ausente) |
| E2E Logado (`e2e-logado.yml`) | #1489 | `451373f5` | Timeout de auth setup (`AUTH_LOGIN_TIMEOUT_MS`) |

---

## 3. Estado final (2026-11-05)

| Workflow | Estado | Última run na main | SHA | Evidência |
|---|---|---|---|---|
| CI/CD Pipeline | ✅ **VERDE** | #11129 | `fa7d882` | [run](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42008724693) `conclusion: success` |
| Contexto | ✅ **VERDE** | #43 | `03e9568` | `conclusion: success` |
| DB Guard (offline) | ✅ **VERDE** | #10655 | `fa7d882` | `conclusion: success` |
| E2E Logado | ✅ **VERDE** | #6779 | `fa7d882` | [run](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42008724841) `conclusion: success` |
| Deploy Edge Functions | ❌ **BLOQUEADO** | #956 | `afd8c7ca` | Ver `PENDENCIAS.md` |

### Anti-regressão

Checks do PR #2730 (commit `306c7022`) todos verdes: CI Gate ✅, TypeCheck ✅, Workflow lint ✅, Security Audit ✅, E2E Tests ✅, Edge contracts ✅, Replay migrations ✅. Nenhum workflow antes verde ficou vermelho.

---

## 4. Deploy Edge Functions — detalhe

- **Erro (run #956):** `Deployment manifest is stale: supabase/deployment-manifest.json`
- **Última run real na main:** #956 em `afd8c7ca`. O commit `fa7d882` não alterou `supabase/functions/` nem `supabase/config.toml`, por isso não disparou o workflow. Run #956 é o estado atual do workflow para a main.
- **Causa raiz:** PR #2707 adicionou `ai-usage-outbox-drain` sem gerar novo manifesto. O `generate-manifest.mjs` está dentro do mesmo PR.
- **Bloqueio:** PR #2707 toca `supabase/deployment-manifest.json` (AGENTS.md regra 3) e contém DDL (regra 8). Aguarda aprovação do dono.

---

## 5. Comparação baseline × final

| Métrica | Baseline | Final |
|---|---|---|
| Workflows com última run em falha | 5 | 1 (bloqueado por PR externo) |
| Build local | ✅ OK | ✅ OK |
| TypeCheck local | ✅ OK | ✅ OK |
| Lint local | ✅ OK | ✅ OK |
| Novas violações Supabase | 0 | 0 |
| Regressões introduzidas | — | **Nenhuma** |
