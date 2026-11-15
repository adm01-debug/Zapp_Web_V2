# Dossiê — fix__f1a-lote-b-authprovider (PR #2063)

**Ref:** `origin/fix/f1a-lote-b-authprovider` · tip `81543b9` · merge-base `9d65fed` (2026-10-18) · 2 commits, 2 arquivos, só testes.

## Propósito
Destravar 2 testes vitest que quebravam com `useAuth must be used within an AuthProvider`:
1. `329a7c2e8 chore(fmt): prettier nos arquivos` — só formatação (remove vírgula final em args/params, quebra linhas).
2. `81543b967 fix(test): useAuth sem AuthProvider no teste` — adiciona mocks de `useUserRole` (AgentsView.conexoes) e de `useAuth`/`useGlobalIncomingMessageAlerts`/`createLogger` (team-chat-notifications-mount).

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência na `main` |
|---|---|---|---|
| `src/components/agents/__tests__/AgentsView.conexoes.test.tsx` | 9 linhas "faltando" | **Incorporada**. O único hunk funcional (mock de `@/hooks/system/useUserRole`) já está na main, texto idêntico; as demais linhas são só reformatação prettier (vírgula final / quebra de linha). | `origin/main:src/components/agents/__tests__/AgentsView.conexoes.test.tsx:109-110` — `vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }) }))`. Entrou em `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main", +5 linhas neste arquivo). Dependência ainda real: `AgentsView.tsx:335` monta `InviteAgentDialog`, que chama `useUserRole` (`InviteAgentDialog.tsx:26`), que chama `useAuth` (`useUserRole.ts:28`). |
| `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` | 16 linhas "faltando" | **Incorporada (versão da main é mais completa)**. Os 3 hunks funcionais existem na main: `createLogger` no mock de `@/lib/logger` (main inclui debug/warn/withCorrelation), mock de `@/hooks/auth/useAuth` (`{ profile: null }` — suficiente para `DeferredProviders`), mock de `@/hooks/realtime/useGlobalIncomingMessageAlerts`. Restante = reformatação prettier. | `origin/main:...team-chat-notifications-mount.test.ts:15-17` (createLogger), `:56-64` (useAuth + useGlobalIncomingMessageAlerts, com o mesmo comentário explicativo). Entrou em `61a973da6` (#2182, logger) e `e1f2ee4dd` (+17 linhas). |

## Sobre a formatação (commit 329a7c2e8)
`.prettierrc` da main tem `trailingComma: "es5"`; a main mantém vírgula final em parâmetros de função (`extra: Partial<Conexao> = {},`) que o prettier removeria. Nenhum workflow em `.github/workflows` roda `prettier --check` (`git grep prettier origin/main -- .github/workflows package.json` → só devDependency). Cosmético, sem efeito em CI nem em comportamento. Valor: nenhum.

## Veredito
**INCORPORADA** — confiança alta. Tudo que a branch resolvia (os 2 testes vermelhos por falta de AuthProvider) está na main desde `e1f2ee4dd` (2026-10-27), com mocks equivalentes ou mais completos. A triagem anterior (2026-11-08) marcou "OBSOLETA"; o mais preciso é INCORPORADA: a intenção entrou por outro commit.

**Lacunas a recuperar:** nenhuma.
**Apagar branch:** seguro.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA caçando qualquer hunk de valor ≥ médio na branch que não estivesse na `main`. **Não encontrei nenhum — concordo com a triagem.**

Escopo real da branch (`git diff --stat 9d65fed origin/fix/f1a-lote-b-authprovider`): 2 arquivos, só testes, 40 inserções / 9 deleções. Nada de src de produção, migration, edge ou workflow.

Hunk por hunk, confrontado com `origin/main`:

| Hunk da branch | Estado na `main` | Prova |
|---|---|---|
| `vi.mock('@/hooks/system/useUserRole', …)` em AgentsView.conexoes | Presente, corpo **idêntico** | `origin/main:src/components/agents/__tests__/AgentsView.conexoes.test.tsx:108-111` (comentário + mock com `isAdmin: true, isSupervisor: true, loading: false`) |
| `createLogger` no mock de `@/lib/logger` | Presente e **mais completo** (debug/warn/withCorrelation) | `origin/main:src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts:14-17` |
| `vi.mock('@/hooks/auth/useAuth', …)` | Presente como `{ profile: null }` | `…team-chat-notifications-mount.test.ts:55-57`; a branch devolve 4 campos (`user`, `session`, `loading`), porém `DeferredProviders` lê **só** `profile` — `origin/main:src/App.tsx:108-109` (`const { profile } = useAuth(); useGlobalIncomingMessageAlerts({ myProfileId: profile?.id ?? null })`). Campos extras são defensivos, valor nulo. |
| `vi.mock('@/hooks/realtime/useGlobalIncomingMessageAlerts', …)` | Presente, **idêntico** | `…team-chat-notifications-mount.test.ts:58-60`, com comentário equivalente em `:52-54` |
| Reformatação prettier (vírgula final, quebra de linha, `useAgentPendingCounts` multilinha) | A `main` mantém o formato antigo de propósito | Nenhum `prettier --check` no CI: `git grep -i prettier origin/main -- .github/workflows package.json` devolve só a devDependency (`package.json:133-134`), e `scripts/ci/inventario-rotas.unit.mjs:216` registra por escrito que "o repo nao roda `prettier --check` no CI". Valor: zero. |

Prova de que o objetivo da branch está cumprido na `main`: os 2 arquivos de teste na árvore local são **byte-idênticos** aos de `origin/main` (`git diff origin/main -- <os 2 arquivos>` → vazio) e rodam verdes: `npx vitest run src/components/agents/__tests__/AgentsView.conexoes.test.tsx src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` → **2 arquivos / 9 testes passando, 4.09s** (executado nesta sessão, HEAD `346c62601` = `origin/main` + 1 commit de copilot que não toca esses arquivos). Nenhum `useAuth must be used within an AuthProvider`.

Commit que incorporou: `e1f2ee4dd` ("fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)", Tue Oct 27 02:35:52 2026 -0300), confirmado ancestral de `origin/main` via `git merge-base --is-ancestor`. Não é revert nem remoção disfarçada: o conteúdo está lá, em versão igual ou superior.

**Parecer:** INCORPORADA mantida, confiança alta. `apagar_branch_seguro = true`. Zero lacunas adicionais.
