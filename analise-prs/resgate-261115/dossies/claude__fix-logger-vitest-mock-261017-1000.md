# claude__fix-logger-vitest-mock-261017-1000 — OBSOLETA

- Ref: `origin/claude/fix-logger-vitest-mock-261017-1000` (tip `bdfa4e670`, 10 commits, merge_base `f66d7331` de 2026-10-16)
- PR #2035 — **CLOSED, não mergeada** (`closedAt 2026-10-31`), título "fix: mock global @/lib/logger no Vitest — desbloqueia CI de todos os PRs do Copiloto RADAR".
  Comentário de fechamento: "FECHAR — MEGA-PR (319 arquivos, 30+ conflitos) … base 151 commits atrás".
- 319 arquivos / 8.643 inserções, dos quais **294 são arquivos de teste** alterados só na forma do mock de `@/lib/logger`.

## Propósito
`src/lib/logger.ts` lê `import.meta.env.DEV` no topo do módulo; mocks parciais de `@/lib/logger`
(`getLogger` só) quebravam os testes que importavam o logger indiretamente. A branch resolveu com
(a) `vi.mock('@/lib/logger')` **global** em `src/test/setup.ts` e (b) reescrita dos 294 mocks locais
para a forma completa (`makeLogger` + `createLogger`/`getLogger`/`logger`/`log`/`generateCorrelationId`/
`getSessionId`/`logPerformance`), mais atualização dos baselines de ESLint/TypeCheck e ~17 "fixes de tipo"
em arquivos de produção (quase todos `as any` em RPCs e afrouxamento de props).

## Prova de que a necessidade está resolvida na main
- main `dac285f62` (2026-11-15): `statusCheckRollup = SUCCESS` — `✅ CI Gate (required check)`, `🏗️ Build`,
  `🎭 E2E`, `🧩 Node CI Scripts` todos SUCCESS. Ou seja: a suíte passa **sem** o mock global.
- main tem **308** arquivos de teste com `vi.mock('@/lib/logger'…)`, **298** já com `createLogger` e
  **272** com `withCorrelation` — a main fez o mesmo saneamento arquivo a arquivo, por outro caminho.
  Amostra nos próprios arquivos que a branch tocou:
  - `src/components/admin/__tests__/GmailWebhookMonitor.falha-consulta.test.tsx:38-41` (main) já traz `createLogger` + `withCorrelation`.
  - `src/components/auth/__tests__/ProtectedRoute.acesso-negado.test.tsx:49-53` (main) traz `log` + `getLogger` + `createLogger`.
  - `src/lib/__tests__/audit.test.ts:11-15` (main) idem.
- Varredura mecânica: das 294 lacunas em arquivos de teste, **0** são de outra natureza que não a forma do
  mock do logger (`missing_sample` 100% `makeLogger`/`vi.fn`/`withCorrelation`).

## Arquivo × achado × evidência (não-teste)

| Arquivo | O que a branch fazia | Estado na main | Veredito |
|---|---|---|---|
| `src/test/setup.ts` (+23) | `vi.mock('@/lib/logger')` global | ausente; main usa mock por arquivo (308 arquivos) e CI verde | superada |
| `scripts/ci/eslint-baseline.json` (+731/-2077) | baseline de 363 ocorrências | baseline da main é outro, regenerado; CI verde | artefato gerado, sem valor |
| `scripts/ci/typecheck-baseline.json` (+351) | baseline de 50 erros | idem | artefato gerado, sem valor |
| `scripts/db-audit/check-migration-drift.mjs` | adiciona `'sql-sha256'` aos `expectedKeys` de `pinned-replay` | main NÃO tem o campo (`check-migration-drift.mjs` bloco PINNED_REPLAY) e as **74** exceções `ledger-divergence/pinned-replay` de `scripts/db-audit/migration-evidence.json` têm exatamente as 11 chaves sem `sql-sha256`. `hasExactKeys` é exato → aplicar isso **quebraria o DB Guard nas 74 exceções** | obsoleta e nociva |
| `src/components/admin/useTarefasAgendadas.ts` | `(supabase as any).rpc(...)` + 2 `eslint-disable` | main:45 e main:72 usam cast **tipado** (`supabase.rpc as unknown as (fn: string) => …`) | incorporada (melhor) |
| `src/components/inbox/ChatPanel.tsx` / `RealtimeCollaboration.tsx` | `(supabase as any).rpc('transfer_conversation')` | main extraiu helper tipado `transferConversation({…})` (ChatPanel:405, RealtimeCollaboration:65) | incorporada (melhor) |
| `src/hooks/team-chat/useTeamReadState.ts` | `(supabase as any).from('team_message_read_state')` | main:77-78 acessa a view **sem cast** (já nos types) | obsoleta |
| `src/components/dashboard/useSentimentData.ts` | retorna `error: null, isError: false, incomplete: false` fixos | main:234 retorna `error: fetchError, isError: fetchError !== null, incomplete` reais | incorporada (melhor) |
| `src/components/team-chat/useTeamChatPanel.ts` (+19) | MIN_SEARCH_CHARS, `retrySearch`, `searchIsCapped`, `messagesError`, `refetchMessages`, `olderError`, limite 100 | tudo na main: `:18 MIN_SEARCH_CHARS`, `:74 olderError`, `:106-107`, `:282`, `:336 retrySearch`, `:344`, `:362 searchIsCapped`, `:526-533` | incorporada |
| `src/components/inbox/contact-details/sidebar/sidebarSections.ts` | adiciona `'memoria'` | main:26 tem `'memoria'` **e** `'atendimento'` | incorporada |
| `src/components/talkx/TalkXView.tsx` | `TalkXTopView` + `'paused'` | main:66 tem `'paused'` e `'report'` | incorporada |
| `src/components/queues/QueueAlertsDisplay.tsx` | remove o 2º `aria-label` duplicado (mantinha o de `queueName`) | main:93 tem **um só** `aria-label` (o de `alertLabels`) — duplicata já resolvida | incorporada |
| `src/components/gamification/TrainingMiniGames.tsx` (-37) | remove o crédito de XP (`creditMiniGameXp`, R2-AUTH-043) | main também **não** credita: `__tests__/TrainingMiniGames.creditoXp.test.tsx:7-8` documenta "a decisão D4 tirou"; `creditMiniGameXp` não aparece mais no componente | incorporada |
| `src/components/gamification/miniGamesData.ts` | campo opcional `xpReward?` | ausente na main e sem consumidor (main não credita XP) | obsoleta, sem valor |
| `src/components/connections/ConnectionCard.tsx` | troca `onOpenChange={handleDisconnectDialogOpenChange}` por `setConfirmDisconnect` | main:250 mantém `handleDisconnectDialogOpenChange` | **regressão** da branch |
| `src/components/connections/ConnectionsView.tsx` | embrulha `onDisconnect` em `(c) => { void … }` | main:264 mantém `onDisconnect={handleDisconnect}`, CI verde | obsoleta |
| `src/components/settings/AppearanceSettings.tsx` | torna `isSaving`/`onSave` **opcionais** | main:22-23 mantém obrigatórios. A própria review automática da PR #2035 marcou como bug High: "The appearance save button crashes — `handleSave` still calls `onSave` unconditionally". Foi o que gerou TS18048/TS2722 no baseline da branch | **regressão** da branch |
| `tsconfig.app.json` | `exclude: ["src/hooks/copilot","src/components/copilot"]` | main não exclui e tem os dois diretórios completos (ex.: `src/hooks/copilot/useAiJudge.ts`, `src/components/copilot/GhostTextOverlay.tsx`). Era gambiarra para "desbloquear push" (commit `5a8ccf5ec`) | obsoleta e nociva (tiraria 2 pastas do typecheck) |
| `src/types/contact.ts`, `src/hooks/business/useWarRoomData.ts`, `src/hooks/realtime/realtimeUtils.ts`, `src/hooks/analytics/useGoalsDashboard.ts`, `src/hooks/team-chat/useTeamMessages.ts` | — | `missing_in_main = 0` / `PRESENT_REVERSE_APPLIES` | incorporadas |

## Única coisa realmente ausente da main (código morto, valor baixo)
`src/hooks/copilot/usePromptInjectionGuard.ts` — arquivo novo (38 linhas), **nunca importado**:
`git grep -l usePromptInjectionGuard <branch> -- src/` só devolve o próprio arquivo. Nasceu no lote
inacabado do copiloto que a própria branch excluiu do tsconfig. Não existe equivalente na main
(`grep -i injection` em `src/hooks/copilot src/components/copilot` = 0; "CV-113" = 0). Conteúdo íntegro,
para quem quiser portar depois sem a branch:

```ts
export interface UsePromptInjectionGuardOptions { text: string; }
export interface PromptInjectionResult { isSafe: boolean; suspiciousPattern: string | null; }

// Common prompt-injection patterns in PT-BR and EN
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(suas|as|suas\s+anteriores|all\s+previous)\s+instru[çc][oõ]es?/i,
  /aja\s+como/i,
  /voc[eê]\s+[eé]\s+agora/i,
  /novo\s+sistema\s+de\s+instru[çc][oõ]es?/i,
  /\[system\]/i,
  /\{system\}/i,
  /assistente[,:\s]+ignore/i,
  /forget\s+(your|previous)\s+instructions?/i,
  /you\s+are\s+now\s+a/i,
  /dan\s+mode/i,
  /jailbreak/i,
  /prompt\s+injection/i,
];

/** CV-113 — defesa client-side contra instrução embutida (heurística pura). */
export function usePromptInjectionGuard({ text }: UsePromptInjectionGuardOptions): PromptInjectionResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return { isSafe: false, suspiciousPattern: pattern.source };
  }
  return { isSafe: true, suspiciousPattern: null };
}
```
Recuperar só faz sentido junto com a UI/edge que use o resultado (hoje nada usa) — e guardrail de
injeção que vale é no servidor, não no cliente.

## Veredito
**OBSOLETA.** O problema que a branch atacava (CI travada por mock incompleto de logger) está resolvido
na main por outro caminho, com CI verde em `dac285f62`. Das 319 lacunas: 294 são a forma do mock de teste
(já completa na main), 2 são baselines gerados, 17 fixes de tipo estão na main em versão melhor (cast
tipado / helper `transferConversation` / estado de erro real) ou são regressões (AppearanceSettings,
ConnectionCard), 3 seriam nocivos se aplicados hoje (`sql-sha256` no drift guard, `exclude` do copiloto no
tsconfig) e 1 é código morto nunca importado (`usePromptInjectionGuard.ts`, colado acima).
`apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar a triagem (veredito OBSOLETA). Resultado: **não refutada — concordo (OBSOLETA, apagar é seguro)**.
Refs conferidas: merge-base `f66d7331`, tip da branch `bdfa4e67` (= tip da PR #2035), `origin/main` em `dac285f62`.

### 1. A substituição alegada cobre a necessidade (o motivo da branch existir)
- PR #2035 (`github_graphql`): `state=CLOSED`, `merged=false`, `closedAt=2026-10-31`, 319 arquivos, título
  "mock global @/lib/logger no Vitest — desbloqueia CI".
- `origin/main` `dac285f62` (2026-11-15), `statusCheckRollup.state = SUCCESS`, com
  `🧪 Unit Tests (1/3|2/3|3/3) = SUCCESS`, `🔎 TypeCheck`, `🏗️ Build`, `🎭 E2E`, `🧩 Node CI Scripts`,
  `✅ CI Gate` todos SUCCESS. `git show origin/main:src/test/setup.ts` **não tem** `vi.mock('@/lib/logger')`
  (grep por `logger|vi.mock` só acha texto de mensagem de erro nas linhas 121-122).
  → a suíte da main passa **sem** o mock global: a necessidade da branch já está resolvida por outro caminho.
- Caminho da main: `git grep -l "vi.mock('@/lib/logger'" origin/main -- src` = **308 arquivos**;
  300 arquivos de teste citam `createLogger`.

### 2. Varredura por hunk útil não coberto (os 294 arquivos de teste)
- Lacunas dos arquivos de teste, agregadas do JSON (`missing_sample` **não truncado**: 0 arquivos com
  `missing_in_main > len(missing_sample)`), dão só a forma do mock: `error/debug/warn/info: vi.fn()`,
  `withCorrelation`, `createLogger`, `getLogger`, `generateCorrelationId`, `getSessionId`,
  `logPerformance`, `logAsyncPerformance`. Nenhuma linha de outra natureza.
- `git diff f66d7331 bdfa4e67 -- '*test*' | grep '^+' | grep -E '\b(it|test|describe)\(|expect\('` →
  **saída vazia**: a branch não adiciona um único caso de teste ou assertiva nova. É só reformatação de mock.

### 3. Os 24 arquivos fora de teste, um a um (tudo conferido na main)
| arquivo | na main |
|---|---|
| `sidebar/sidebarSections.ts` (`'memoria'`) | main tem `'memoria'` **e** `'atendimento'` + seção completa (`ConversationMemorySection.tsx`, testes) — `origin/main:…/sidebarSections.ts:26` |
| `team-chat/useTeamChatPanel.ts` (busca) | main cobre tudo e melhor: `MIN_SEARCH_CHARS` (:18), `olderError` (:74), `isError/refetch` (:106-107), `p_limit: SEARCH_LIMIT` (:291), `retrySearch` (:336), `searchBelowMinChars` (:344), `searchIsCapped` (:362) |
| `useSentimentData.ts` | branch devolve stub `error: null, isError: false, incomplete: false`; main devolve estado real: `setFetchError` (:146) e `error: fetchError, isError: fetchError !== null, incomplete` (:234) — branch é **pior** |
| `ChatPanel.tsx` / `RealtimeCollaboration.tsx` | branch usa `(supabase as any).rpc('transfer_conversation')`; main usa helper tipado — branch é pior |
| `useTarefasAgendadas.ts` | branch `(supabase as any).rpc`; main usa cast tipado nas RPCs |
| `useTeamReadState.ts` | branch `(supabase as any).from('team_message_read_state')` com eslint-disable; main já resolvida sem `any` solto |
| `types/contact.ts` | main já tem `presence_status/presence_updated_at/last_seen_at` (:12,:17-19) |
| `realtime/realtimeUtils.ts` | main já tem `sender_participant_jid` (:139) |
| `useGoalsDashboard.ts` | main já tem `hasData?` (:18) e o usa (:177,:183) |
| `TalkXView.tsx` | main já tem `'paused'` **e** `'report'` em `TalkXTopView` (:66) |
| `QueueAlertsDisplay.tsx` | duplicata de `aria-label` já resolvida na main, mantendo o rótulo melhor (`alertLabels[alert.type]`, :93); a branch mantinha o pior |
| `AppearanceSettings.tsx` | branch torna `isSaving`/`onSave` opcionais; main mantém obrigatórios e `SettingsView.tsx:225` passa os dois — tornar opcional só esconderia erro e quebraria o Salvar. **Regressão** |
| `ConnectionCard.tsx` | branch troca `handleDisconnectDialogOpenChange` por `setConfirmDisconnect`; main mantém o handler (:77,:250). **Regressão** |
| `TrainingMiniGames.tsx` + `miniGamesData.ts` | branch remove o crédito de XP; main também não credita no cliente, por política (`PB-18/D4`, cabeçalho do arquivo) — nada a portar, e `xpReward` sem consumidor |
| `scripts/ci/*-baseline.json` | artefatos regenerados; os da main são os vigentes com CI verde |

### 4. Os itens nocivos, confirmados por medição
- `scripts/db-audit/check-migration-drift.mjs`: a branch adiciona `'sql-sha256'` aos `expectedKeys` de
  `pinned-replay`, e a validação é `hasExactKeys` (exata, `check-migration-drift.mjs:209`).
  `migration-evidence.json` da main: **74** itens `ledger-divergence/pinned-replay`, **0** com a chave
  `sql-sha256` → aplicar quebraria o DB Guard nas 74 exceções. Confirmado.
- `tsconfig.app.json`: a branch exclui `src/hooks/copilot` e `src/components/copilot`;
  `git ls-tree -r origin/main` nessas pastas = **97 arquivos de produção** → tiraria 97 arquivos do typecheck.
  Confirmado como nocivo.

### 5. Única lacuna real, e por que não sustenta PERDIDA_PARCIAL
`src/hooks/copilot/usePromptInjectionGuard.ts` (38 linhas) não existe na main e não tem equivalente.
Mas: `git grep usePromptInjectionGuard` na branch (fora do próprio arquivo) = **0 importadores** — a própria
branch tirou a pasta do typecheck. É uma heurística regex puramente client-side (lista de padrões tipo
`jailbreak`, `aja como`), contornável e sem UI/edge que a consuma. Valor **baixo**, não ≥ médio → não muda
o veredito. Conteúdo íntegro já está colado neste dossiê, caso um dia haja consumidor.

### Veredito da verificação
`concorda = true` · `veredito_final = OBSOLETA` · `apagar_branch_seguro = true`.
Nada de valor ≥ médio se perde; dois hunks da branch são regressões e três seriam nocivos hoje.
