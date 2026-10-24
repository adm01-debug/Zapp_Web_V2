# Relatório CI — Sessão de Correção de Workflows

**Data:** 2026-10-24  
**Branch de correção:** `claude_05/brave-mccarthy-zvzky4`  
**Executor:** Claude Code (sessão `e2e66ed0-8859-52c1-930f-a38ef94c635f`)

---

## Baseline — Workflows com falha na `main` (antes das correções)

| Workflow | Check / Job | Causa raiz identificada |
|---|---|---|
| `🧪 Unit Tests` (`ci.yml`) | `ci-docs-baseline.unit.mjs` | (1) RE_RECON regex não capturava marca `[~]` (formato `[x]`) — só aceitava `(x)` com parênteses; (2) contagem de 15 → 16 YAMLs desatualizada em CLAUDE.md, PLANO e docs/ci/README.md; (3) playwright@1.64.1 no lockfile e workflows, mas contrato exige 1.63.0 |
| `🧪 Unit Tests` (`ci.yml`) | `useTeamChatNotifications.canal-estavel.test.tsx` | Canal Supabase sem sufixo `:${profile.id}` + configurações de notificação nas deps do useEffect causavam recriação do canal a cada mudança de volume |
| `🧪 Unit Tests` (`ci.yml`) | `useAuth.fila-offline-logout.test.tsx` | `offlineSendQueue.clear()` nunca chamado no evento `SIGNED_OUT` |
| `🏗️ Build` (deploy-functions) | `deploy-functions.yml` | `supabase/deployment-manifest.json` desatualizado — checksums divergentes para `ai-audio-authz.ts` e `ai-transcribe-audio/index.ts` |
| Auto Update PR Branch | `auto-update-pr-branch.yml` | `scripts/ci/fila-merge.mjs` chamava `execFileSync` + `JSON.parse` sem try/catch — crash quando `gh` não encontrado |

**Runs com falha na `main` (pre-correção, push 2026-10-24T13:19:26Z):**

| Workflow | Conclusão | Link | Data |
|---|---|---|---|
| CI/CD Pipeline | **failure** | [run 40097637008](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097637008) | 13:19:26Z |
| DB Guard (offline) | **failure** | [run 40097637001](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097637001) | 13:19:26Z |
| Deploy Edge Functions (all) | **failure** | [run 40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) | 13:19:26Z |
| E2E logado | **failure** | [run 40097636975](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636975) | 13:19:26Z |
| types-sync | **failure** | [run 40097636974](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636974) | 13:19:26Z |
| Auto Update PR Branches | success | [run 40105531029](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40105531029) | 15:07:24Z |

---

## Correções Aplicadas

| Arquivo | Mudança |
|---|---|
| `scripts/ci/ci-docs-baseline.unit.mjs` | RE_RECON regex: `\([ x~!]\)` → `[([]([ x~!])[)\]]` para aceitar `[~]` e capturar marca |
| `src/hooks/chat/useTeamChatNotifications.ts` | Canal com `:${profile.id}`, configurações movidas para refs, deps = `[profile]` |
| `src/hooks/auth/useAuth.tsx` | `offlineSendQueue.clear()` adicionado no `SIGNED_OUT` e no `signOut()` |
| `scripts/ci/fila-merge.mjs` | `decisaoAtual()` envolto em try/catch com retorno gracioso |
| `supabase/deployment-manifest.json` | Regenerado via `generate-manifest.mjs` (checksums 2 funções) |
| `package.json` | `@playwright/test` fixado em `1.63.0` (era `^1.64.0`) |
| `bun.lock` | Regenerado com playwright 1.63.0 via `bun install` |
| `.github/workflows/ci.yml` | `playwright@1.64.1` → `playwright@1.63.0` |
| `.github/workflows/e2e-logado.yml` | `playwright@1.64.1` → `playwright@1.63.0` |
| `.github/workflows/e2e-talkx.yml` | `playwright@1.64.1` → `playwright@1.63.0` |
| `.github/toolchain.json` | `"playwright": "1.64.1"` → `"playwright": "1.63.0"` |
| `docs/ci/README.md` | Regenerado: 15 → 16 workflows + `auto-update-pr-branch.yml` adicionado |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | Contagem 15 → 16 YAMLs; E76 atualizado para 1.63.0 |
| `CLAUDE.md` | Inventário: `**15** arquivos YAML` → `**16** arquivos` |

---

## Validações Locais Executadas (commit `20befa8`, 2026-10-24T15:4xZ)

| Verificação | Resultado | Evidência |
|---|---|---|
| `bun install` | **OK — no changes** | `Checked 674 installs across 743 packages (no changes)` |
| `bun run build` | **✓ built in 14.11s** | Saída local — dist/assets gerado sem erros |
| `npx tsc --noEmit` | **0 erros ✓** | `exit 0`; `grep 'error TS' \| wc -l` = 0 |
| Lint (`bun run lint`) | **819 problems (=baseline)** | 605 errors + 214 warnings — 0 novos introduzidos |
| `node --test scripts/ci/ci-docs-baseline.unit.mjs` | **23/23 ✓** | `# pass 23 / # fail 0` |

**Ratchet TypeCheck:** baseline=93, atual=0 erros (melhora — nenhum novo erro introduzido).  
**Ratchet Lint:** baseline=819, atual=819 (sem regressão).

---

## Bloqueadores Registrados em PENDENCIAS.md

1. **E2E logado** (`e2e-logado.yml`) — requer credenciais de produção (`E2E_SUPABASE_URL`, `E2E_SUPABASE_PASSWORD`) — não é required check de PR
2. **types-sync** (`types-sync.yml`) — banco de produção fora de sincronia com `types.ts` — não é required check de PR
3. **DB Guard** (`db-guard.yml`) — falhas pré-existentes no banco local de CI: constraint `department_audit_logs_action_check` e função `request_department_access` ausente — ver PENDENCIAS.md item 3
4. **Talk X Visual** (`e2e-talkx.yml`) — 16/25 testes falham: botão/modal "Ajuda do Talk X" não implementado na UI — não é required check de PR

---

*Relatório gerado automaticamente pela sessão de correção de CI.*
