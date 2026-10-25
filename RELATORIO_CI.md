# Relatório CI — PR #2218 (branch `claude_05/brave-mccarthy-zvzky4`)

> Gerado em 2026-10-24 pela sessão de stop-hook CI.

---

## §1 — Inventário de workflows na `main` (rùltimo run por workflow)

| Workflow | Run ID | Conclusão | Link |
|---|---|---|---|
| ci.yml | 40214754253 | `tailure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253) |
| db-guard.yml | 40214793402 | `failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214793402) |
| db-live-guard.yml | 39992011721 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39992011721) |
| types-sync.yml | 40214756578 | `failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214756578) |
| settings-guard.yml | 40213169735 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40213169735) |
| branch-hygiene-audit.yml | 40136442984 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40136442984) |
| auto-update-pr-branch.yml | 40214754284 | `failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754284) |
| codeql.yml | 40213170502 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40213170502) |
| deploy-functions.yml | 39904383705 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39904383705) |
| e2e-logado.yml (PR) | 40214754254 | `cancelled` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754254) |
| e2e-talkx.yml | 40032670242 | `failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40032670242) |
| talkx-status-regen.yml | 39766137586 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39766137586) |
| crm-sync-worker.yml | 38682326275 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/38682326275) |
| db-migrate.yml | 38671629144 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/38671629144) |
| supabase-sync.yml | 38671629093 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/38671629093) |
| targeted-ledger-evidence.yml | 38671629178 | `success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/38671629178) |

---

## §2 — Baseline local (registrado antes das alterações)

Registrado no comit inicial da sessão (`8bad01793` -> `833edf743`):

| Etapa | Resultado |
?---|---|
| `bun install` | ✅ (dependências instaladas) |
| `bun run build` | ✅ (build succeeded) |
| `bun run lint` | ✅ (exit 0) |
| `typecheck-ratchet.mjs` | ✅ (baseline=93 atual=0 novas=0 ⇒ exit 0) |
| bInivet Tests (local)` | ⚨ pré-existentes documentadas em §6 |

---

## §3 — Tabela de correções

| Problema | Arquivo | Correção | Status |
|---|---|---|---|
| PK-14: `window.history.replaceState` bypassa MemoryRouter nos testes | `src/hooks/inbox/useInboxFilters.ts` | Substituir por `useSearchParams` do react-router-dom | ✅ fixado, 9/9 testes passando |

---

## §4 ℔ Estado dos checks obrigatórios (head `833edf743`)

| Check | Estado | Observação |
|---|---|---|
| 🔍 Lint & TypeCheck | ✅ success | typecheck-ratchet exit 0 |
| 🧣 Unit Tests | ⚘ failure | ~(130+ pré existentes, documentados em §6 ) |
| 🇻 Build | ✦ skipped | cascate de CI Gate (pré existente) |
| 🔚 Security Audit | ✅ success | |
| Contrato DB offline | ☘ failure | SM migration errors pré existentes (§3 de PENDENCIAS.md) |
| 🎉‏�� E2E Tests (Playwright) | ☘ cancelled | secrets E2E_SUPABASE_URL + E2E_SUPABASE_PASSWORD faltando (§1 de PENDENCIAS.md) |

---

## §5 — Commits da branch (cronológico)

| SHA | Mensagem |
|---|---|
| `88f5a31aa` | init: primeira versão da branch |
| `d13682dd3` | chore: add RELATORIO_CI.md e PENDENCIAS.md |
| `37b02930e` | fix(PK-12): refator basePrefs usando memo para evitar loop infinito |
| `8f935c591` | chore: atualizar RELATORIO_CI.md com prova do build local |
| `a51076cec` | fix(PK-13): corrigir useSearchParamsIntegration test assertion |
| `1a56c0301` | chore: RELATORIO_CI.md atualizado com provas do CI |
| `a36bebe06` | fix(PK-13): propagar searchParams corretamente no useInboxFilters |
| `0718a150a` | fix(PK-13): corrigir teste de integração com a URL de param |
| `ba3e0314e` | fix(PK-14): usar useSearchParams em lugar de window.location.search |
| `8bad01793` | fix: corrigir useInboxFilters para usar useSearchParams completamente |
| `833edf743` | chore: RELATORIO_CI.md atualizado com provas de CI do comit atual |

---

## §6 ℔ Antes · Depois (por categoria)

| Categoria | Antes (`88f5a31aa`) | Depois (`833edf743`) |
|---|---|---|
| Unit Tests | ~130+ falhando | ~ 130+ falhando (pré existentes, não introduzidos) |
| TypeCheck (typecheck-ratchet) | baseline=93 atual=0 | baseline=93 atual=0 novas=0 |
| Lint | ✅ exit 0 | ✅ exit 0 |
| Build | ✅ exit 0 | ✅ exit 0 |
| PK-14 (useSearchParams) | 9/9 testes falhando | 9/9 testes passando |
| E2E Tests | `cancelled` (secrets faltando) | `cancelled` (idem) |
| Contrato DB offline | failure (pré existente) | failure (pré existente) |

---

## §7 ℔ Prova do HEAD `8bad01793` (anterior)

Run do CI neste commit: [actions/runs/40214314297](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297)

| Job | Conclusão | Link |
|---|---|---|
| 🔍 Lint & TypeCheck | `✅ success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| 🧣 Unit Tests (shard 1/3) | `⚘ failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| 🧣 Unit Tests (shard 2/3) | `⚘ failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| 🧣 Unit Tests (shard 3/3) | `⚘ failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| 🇻 Build | `♦ skipped` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| 🔚 Security Audit | `₅ success` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| Contrato DB offline | `⚘ failure` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |
| 🎉‏�� E2E Tests (Playwright) | `⚘ cancelled` | [link](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214314297) |

---

## §8 — Prova do HEAD `aatual (`833edf743`)

Run do CI neste commit: [actions/runs/40214754253](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253)

| Job | Conclusão | Nota |
|---|---|---|
| © Lint & TypeCheck | `₅ success` | typecheck-ratchet baseline=93 atual=0 novas=0 |
| © Unit Tests (shard 1/3) | `⚘ failure` | ~(130+ testes pré existentes, não introduzidos por PK-14) |
| © Unit Tests (shard 2/3) | `⚘ failure` | PK-14 confirmado ausente nas falhas |
| © Unit Tests (shard 3/3) | `⚘ failure` | PK-14 confirmado ausente nas falhas |
| © Build | `♦ skipped` | CIGate cascade (pré existente) |
| © Security Audit | `₅ success` | |
| Contrato DB offline | `⚘ failure` | SM migration errors pré existentes |
| 🎉‏�� E2E Tests (Playwright) | `⚘ cancelled` | secrets E2E_SUPABASE_URL + E2E_SUPABASE_PASSWORD faltando |

> **Nota:** PK-14 (`useInboxFilters.type-url.test.tsx`) confirmado ausente nas falhas dos 3 shards do run `40214754253` -- PK-14 fixado completamente. Falhas restantes são pré-existentes (§6 de PENDENCIAS.md).

---

Relatório gerado pela sessão de CI - PR #2218 - 2026-10-25.
Unit Tests falantes são pré-existentes (não introduzidos por PK-14).
E2E bloqueado por falta de secrets (ahão do Joaquim).
Contrato DB offline bloqueado por migration errors pré-existentes (documentados em PENDENCIAS.md §3).
Tipo de ação necessária: configuração de secrets)
