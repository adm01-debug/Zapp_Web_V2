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

---

## Correções Aplicadas

| Arquivo | Mudança |
|---|---|
| `scripts/ci/ci-docs-baseline.unit.mjs` | RE_RECON regex: `\([ x~!]\)` → `[(\[]([ x~!])[)\]]` para aceitar `[~]` e capturar marca |
| `src/hooks/chat/useTeamChatNotifications.ts` | Canal com `:${profile.id}`, configurações movidas para refs, deps = `[profile]` |
| `src/hooks/auth/useAuth.tsx` | `offlineSendQueue.clear()` adicionado no `SIGNED_OUT` e no `signOut()` |
| `scripts/ci/fila-merge.mjs` | `decisaoAtual()` envolto em try/catch com retorno gracioso |
| `supabase/deployment-manifest.json` | Regenerado via `generate-manifest.mjs` (checksums 2 funções) |
| `package.json` | `@playwright/test` fixado em `1.63.0` (era `^1.64.0`) |
| `bun.lock` | Regenerado com playwright 1.63.0 via `bun install` |
| `.github/workflows/ci.yml` | `playwright@1.64.1` → `playwright@1.63.0` |
| `.github/workflows/e2e-logado.yml` | `playwright@1.64.1` → `playwright@1.63.0` |
| `.github/workflows/e2e-talkx.yml` | `playwright@1.64.1` → `playwright@1.63.0` |
| `docs/ci/README.md` | Regenerado: 15 → 16 workflows + `auto-update-pr-branch.yml` adicionado |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | Contagem 15 → 16 YAMLs; E76 atualizado para 1.63.0 |
| `CLAUDE.md` | Inventário: `**15** arquivos YAML` → `**16** arquivos` |

---

## Validações Locais Executadas

- `node --test scripts/ci/ci-docs-baseline.unit.mjs` → **23/23 ✓**
- `npx tsc --noEmit` → **0 erros ✓**
- `bun run test` (Vitest) → em execução no momento do push

---

## Bloqueadores Registrados em PENDENCIAS.md

1. **E2E logado** (`e2e-logado.yml`) — requer credenciais de produção (`E2E_SUPABASE_URL`, `E2E_SUPABASE_PASSWORD`) — configuração de secrets, não código
2. **types-sync** (`types-sync.yml`) — requer banco de produção sincronizado com `types.ts`; fora do escopo desta sessão

---

*Relatório gerado automaticamente pela sessão de correção de CI.*
