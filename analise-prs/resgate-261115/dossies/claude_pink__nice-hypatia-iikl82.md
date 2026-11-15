# claude_pink/nice-hypatia-iikl82 (PR #2511) — OBSOLETA

- `ref`: `origin/claude_pink/nice-hypatia-iikl82` · `tip` 8b3efcceb (2026-11-01)
- `merge_base`: d7af7a671 (2026-10-19) · main hoje: dac285f62 (2026-11-15)
- **539 commits de main depois do merge_base**; 55 commits na branch; 351 arquivos, +10716/-5505.
- Triagem anterior (2026-11-08) marcou `OBSOLETA`. **Confirmado por leitura de código**, com motivo mais grave do que "velha": a branch também é **regressiva**.

## Propósito da branch
Mega-branch de consolidação de CI: "fix: consolidate all CI fixes from PRs #2091 #2035 #2097 #2104 #2042", `fix(tests): add withCorrelation to all vi.mock('@/lib/logger') em 294 testes`, 13 "lotes" de testes de inbox, regeneração de baselines (eslint/typecheck/github-settings) e um plano de 650 linhas para integrar 153 branches. A própria branch tem 4 commits de socorro ("restaurar N arquivos corrompidos por agentes background") — e **não restaurou tudo**.

## Composição das 344 lacunas
| classe | qtd | achado |
|---|---|---|
| arquivos de teste | 305 | **302 já existem na main** (`git cat-file -e origin/main:<path>` ok). A main resolveu o problema do mock de logger na origem: `src/lib/logger.ts:78` `withCorrelation`, `:89` `createLogger`, `:100` `getLogger`. A reescrita de andaime da branch é *alternativa*, não cobertura perdida — ex.: `src/hooks/__tests__/helpers/alertBehaviorTestKit.ts` main = 194 linhas **byte-idêntico ao merge_base**, branch reescreveu para 346. |
| testes ausentes da main | 3 | `ContactPurchasesPanel.erro-gravacao`, `ContactPurchasesPanel.total-erro-data`, `useContactPurchases.criar` → módulo **removido de propósito**: `bd4c4bd7a chore(crm): remove módulo de pagamentos/compras do front (decisão 2026-11-03) (#2690)`. Na main não existe nenhum arquivo `*ContactPurchase*`. |
| baselines gerados | 4 | `scripts/ci/eslint-baseline.json` (+1585/-1475), `typecheck-baseline.json`, `github-settings-baseline.json`, `migration-evidence.json` — artefato de uma árvore 539 commits atrás. |
| workflows | 4 | já na main ou superados (abaixo). |
| docs | 1 | `docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.md` (650 linhas), ausente da main, substituído por esta própria triagem. |
| código `src/` | 27 | ideias **já na main, em versão melhor** (abaixo) + **regressões** (abaixo). |

## Ideia por ideia: já está na main (prova)
| branch | main (melhor) |
|---|---|
| `src/services/chat.service.ts` uploadAudio com extensão/contentType reais | `origin/main:src/services/chat.service.ts:60-72` — mapa `extByMime` (webm/ogg/m4a/mp3) + comentário Safari-mp4 |
| `InternalNotesPanel` menção com nomes reais | `origin/main:src/components/inbox/collaboration/InternalNotesPanel.tsx:18,30,69` + testes `InternalNotesPanel.mentionFallback.test.tsx`, `useMentionableProfiles.test.tsx:124` |
| `StatusChips` recebendo `counts` | `origin/main:.../StatusChips.tsx:13-19` união discriminada `{counts}|{conversations}` — **e preserva o fix R2-INB-056 (#349) que a branch apagou** |
| `utilities.css` `safe-area-*` / `scrollbar-none` | na main + teste de contrato `src/styles/__tests__/mobileAreaSeguraRolagem.test.ts:47,132,147,161` |
| `SIDEBAR_SECTIONS` + `'memoria'` | `origin/main:.../sidebarSections.ts:26` tem `'memoria'` **e** `'atendimento'` |
| `VirtualizedRealtimeList` `onReopen?` | `origin/main:.../VirtualizedRealtimeList.tsx:84,114,260,317` ligado ponta a ponta (`ConversationReopenDialog`, `ChatPanel.tsx:67,477`, `RealtimeInboxView.tsx:480`, `ConversationListSidebar.tsx:627`) |
| `useTeamChatPanel` `isError`/`refetch` | `origin/main:.../useTeamChatPanel.ts:106,107,526,531,532` |
| `TalkXTopView` + `'paused'` | `origin/main:.../TalkXView.tsx:66` tem `'paused'` **e** `'report'` |
| `SettingsView` → `AppearanceSettings isSaving/onSave` | `origin/main:.../SettingsView.tsx:74,225` via `saveAppearanceSettings` |
| playwright 1.63.0 → 1.64.1 | `origin/main:.github/workflows/ci.yml:484`, `e2e-talkx.yml:94`; `package.json` `@playwright/test ^1.64.0`. `e2e-logado.yml` da main não instala mais playwright (reestruturado) |
| `db-guard` `pg_isready -U postgres` | `origin/main:.github/workflows/db-guard.yml:63` já usa `pg_isready -U postgres -d postgres` (mais forte) |
| `migration-evidence` entrada 20261016240000 | `origin/main:scripts/db-audit/migration-evidence.json:1156-1157` |

Alvo refatorado (obsoleta): `SuppressionReasonCode` em `useTalkXSuppression.ts` — na main `BlacklistEntry`/`AddBlacklistEntryInput` **saíram** desse arquivo (400 → 293 linhas) e viraram interface local em `src/components/talkx/TalkXSuppression.tsx:43`, pelo commit `e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)`.
Alvo resolvido melhor (obsoleta): `Index.tsx` `setTimeout(() => setShowWelcome(true), 0)` — a main derivou o valor: `origin/main:src/pages/Index.tsx:103-104` `const showWelcome = !welcomeDismissed && ...`, sem `setState` em effect.

## Regressões exclusivas da branch (NÃO portar)
1. **Conexões WhatsApp destruídas.** `src/components/connections/ConnectionsView.tsx`: merge_base 241 linhas → branch **73**; main hoje 285. A branch trocou `useConnectionsManager`, `BusinessHoursDialog`, `ConnectionQueuesDialog`, `InstanceSettingsDialog`, `NumberReputationMonitor` e a trava E42 (`MULTI_CONNECTION_LOCKED_MESSAGE`) por stubs novos: `src/hooks/connections/useConnections.ts` (16 linhas, `select('*')` sem RLS-awareness nem erro), `src/components/connections/ConnectWhatsAppDialog.tsx` (dialog vazio com um botão "Fechar"), `src/types/connections.ts` (1 linha de re-export).
2. **Carteira de Clientes destruída.** `src/components/wallet/ClientWalletView.tsx`: 135 → **35** linhas (main: 137). Saíram `useClientWallet`, `PageHeader`, diálogo "Nova Regra" (nome, vendedor, conexão WhatsApp, prioridade) e a tabela de regras; entraram `src/hooks/wallet/useWallet.ts` (retorna sempre `wallet=null`, `transactions=[]`), `WalletCard.tsx`, `TransactionList.tsx`.
3. **Guarda de segurança do banco removida.** `scripts/db-audit/consolidar-veredito.mjs`: a branch apaga o passo `live-invariants` ("RLS, security_invoker, matview exposta, search_path de SECURITY DEFINER, policy de escrita aberta, referência pendurada"). Main **mantém** (2 ocorrências em `origin/main:scripts/db-audit/consolidar-veredito.mjs`).
4. **Guarda de settings esvaziada.** `scripts/ci/github-settings-guard.unit.mjs`: 396 → **25** linhas (-376). Main hoje: 451 linhas.
5. **Stubs que duplicam/sombream a main**: `src/shadcn/ui/button.tsx` (re-export de `@/components/ui/button`), `src/components/ui/AuroraBorealis.tsx` (main: `src/components/effects/AuroraBorealis.tsx`), `src/components/ui/FloatingParticles.tsx` (main: `src/components/dashboard/FloatingParticles.tsx` e `src/components/voice/FloatingParticles.tsx`).
6. **Corrupção de acentos em comentários/strings**: `RealtimeInboxView.tsx` "sustentá-la" → "susténtá-la"; `ChatPanel.tsx` "realce" → "realçe"; `SettingsView.tsx` "Aparência" → "Aparencia" e `—` → `--`; `TalkXTemplateEditor.tsx` `{'{{'}var{'}}'}` → `{'{{'+'var'+'}}'}` e `;` removido após `useState([])`.
7. **Escape de tipo**: `supabase.rpc('transfer_conversation' as never, …)` em `ChatPanel.tsx` e `RealtimeCollaboration.tsx`. A main centralizou em `src/lib/inbox/transferConversation.ts:41,44,48` **sem** o cast.
8. `RealtimeInboxView.tsx` rebaixa `<InboxEmptyChat waitingCount unreadCount onNewConversation />` para `<InboxEmptyChat />`.
9. `QueueAlertsDisplay.tsx`: tinha dois `aria-label` no mesmo `<Button>` (JSX inválido/duplicado); a branch só remove o segundo — ruído.

## Única lacuna que contradiz a main (registrar, não portar)
`src/components/talkx/TalkXTemplates.tsx` — a branch renomeia o painel **"Mais convertidos" → "Maior taxa de resposta"** (commit `5f0e8464a`) e enfraquece o comentário T04-039. A main **mantém** `title="Mais convertidos"` (`origin/main:.../TalkXTemplates.tsx:357`) com 3 asserções fixando o rótulo (`TalkXTemplatesRail.test.tsx:130,139,151`) e os comentários T04-039 em `useTalkXTemplates.ts:86` e `useTalkXTemplatesConversion.ts:4`. Já existe "Maior taxa de resposta média" em `TalkXAnalytics.tsx:567` — a nomenclatura atual é deliberada. Valor: baixo (rótulo de UI).

## Veredito
**OBSOLETA** · `apagar_branch_seguro = true`.
Nada exclusivo da branch vale recuperação: o útil está na main em versão igual ou melhor (provado arquivo a arquivo acima), os 3 testes exclusivos cobrem módulo removido por decisão (#2690), e o resto exclusivo é stub/regressão/acento corrompido. Além disso 310 dos 351 arquivos dão `CONFLICT` contra a main — a branch não é mergeável nem após rebase sem reescrita total.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA · `apagar_branch_seguro = true`.** Tentei refutar e falhei. Base: `merge_base d7af7a671` (2026-10-19), tip `8b3efcceb` (2026-11-01), `origin/main dac285f62`; `git rev-list --count d7af7a671..origin/main` = **539**.

### 1. Varredura exaustiva de cobertura de teste (não amostra)
Dos 351 arquivos do diff, **306** são de teste/spec. Rodei `git cat-file -e origin/main:<path>` nos 306: **303 existem na main**, 3 ausentes (só os de `ContactPurchases*`/`useContactPurchases`). Depois contei casos (`it(`/`test(`) na branch vs na main **nos 303** e comparei: **o único arquivo em que a branch tem mais casos que a main é `scripts/db-audit/n011-storage-policies-dedup.test.mjs` (branch 11 × main 10)**. Em todos os outros 302 a main tem o mesmo número ou mais. Não há cobertura perdida.

### 2. O único delta de teste investigado a fundo (n011) — main é mais forte
A branch tem 3 asserções textuais sobre o bloco `-- Rollback:`; a main as substituiu por simulação real: `origin/main:scripts/db-audit/n011-storage-policies-dedup.test.mjs:150` ("o estado drifted e semeado pelas CREATE POLICY do rollback real") + testes `replay limpo` (:264) e `replay drifted` (:271), que **executam** o SQL do rollback no simulador de policies. Os casos que a branch preserva já existiam no merge_base e foram trocados de propósito na main pelo commit `4b9585052` (#2156) — confirmado por `git log -S'o rollback recria as 2 policies removidas' d7af7a671..origin/main`. Perda zero.

### 3. Conferi uma a uma as substituições alegadas (todas confirmadas na main)
- `uploadAudio` mime real → `origin/main:src/services/chat.service.ts:60-73` (mapa `extByMime` webm/ogg/m4a/mp3 + `contentType`), mais completo que o `split('/')[1]` da branch.
- Menções com nomes reais → `origin/main:src/components/inbox/collaboration/InternalNotesPanel.tsx:18,30`; hook em `useMentionableProfiles.ts:82`.
- `StatusChips` → `origin/main:.../StatusChips.tsx:13-19` aceita `counts` **ou** `conversations` (união discriminada) e **preserva o fix R2-INB-056 (#349)** em :31-40, que a branch apagou.
- `safe-area-*`/`scrollbar-none` → `origin/main:src/styles/utilities.css:74-80`, com fallback `env(..., 0)` que a branch não tem.
- Aba `memoria` → `origin/main:.../sidebarSections.ts:26` (main tem `memoria` **e** `atendimento`).
- `TalkXTopView 'paused'` → `origin/main:src/components/talkx/TalkXView.tsx:66` (main tem `paused` **e** `report`).
- Erro/retry no team chat → `origin/main:src/components/team-chat/useTeamChatPanel.ts:106,107,532`.
- Reabrir conversa → `origin/main:src/components/inbox/VirtualizedRealtimeList.tsx:84,114` + `ConversationReopenDialog` (:19) + `ChatPanel.tsx:67,477`; a branch só declara a prop `onReopen?`, sem implementação.
- `AppearanceSettings isSaving/onSave` → `origin/main:src/components/settings/SettingsView.tsx:225` com hook dedicado `saveAppearanceSettings` (:74) e botão em `AppearanceSettings.tsx:159`.
- Mocks `getLogger`/`createLogger` → `origin/main:src/test/volumeControlMocks.ts:13-16`; e `loggerMock()` do kit de alertas já expõe `createLogger` na main (`alertBehaviorTestKit.ts:141`).
- `playwright@1.64.1` → já na main (`ci.yml:484`, `e2e-talkx.yml:94`); `@playwright/test ^1.64.0` no `package.json:113`.
- `--health-cmd pg_isready -U postgres` → a main é mais estrita: `origin/main:.github/workflows/db-guard.yml:63` usa `pg_isready -U postgres -d postgres`.
- Entrada de ledger `20261016240000_search_events_rls_decision` → já na main (`migration-evidence.json:1156`).

### 4. Regressões exclusivas da branch (reconfirmadas por contagem de linhas)
`ConnectionsView.tsx` base 241 → branch **73** (main 285) · `ClientWalletView.tsx` base 135 → branch **35** (main 137) · `github-settings-guard.unit.mjs` base 396 → branch **25** (main 451) · `reduzirMovimentoInboxCrmConexoes.test.tsx` **6 casos → 1** (main 6) · `LocationPicker.gpsAtrasado.test.tsx` 236 → **155** linhas · `consolidar-veredito.mjs`: a branch **remove o passo `live-invariants`** (diff explícito), que a main mantém em :42 e :63 · `eslint-baseline.json` base 7658 → branch **13228** (dívida de lint nova; main 8874) · `typecheck-baseline.json`: a branch baseliniza **erros de sintaxe TS1005 em arquivos de teste** que ela própria quebrou · `ChatPanel.tsx`/`RealtimeCollaboration.tsx`: `supabase.rpc('transfer_conversation' as never, …)` (fuga de tipos) · `RealtimeInboxView.tsx`: remove `waitingCount`/`unreadCount`/`onNewConversation` do `InboxEmptyChat` (main os passa em :541; props em `InboxEmptyChat.tsx:58-65`) · acentos corrompidos ("realçe", "susténtá-la", "Aparencia", "—" → "--").

### 5. Itens exclusivos restantes — todos de valor < médio
- Rótulo `"Maior taxa de resposta"` (`TalkXTemplates.tsx`): contradiz a main, cujo rótulo está fixado por 3 asserções (`TalkXTemplatesRail.test.tsx:130,139,151`) e citado em `useTalkXTemplates.ts`/`useTalkXTemplatesConversion.ts`. Semântica idêntica (ranking por taxa de resposta); só o rótulo difere. Valor baixo — registra-se, não recupera.
- `export type SuppressionReasonCode` (`useTalkXSuppression.ts`): alias cosmético; a main mantém a união inline. Sem ganho de comportamento.
- `docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.md` (650 linhas): plano medido contra `origin/main = ee2947491` (2026-10-18), "153 branches, 82 PRs". Totalmente defasado (539 commits depois) e histórico — valor nenhum para código.
- `alertBehaviorTestKit.ts`: 194 → 346 linhas, mas 0 casos de teste (é andaime) e a main cobre os mesmos exports + `contactRow`. Abordagem alternativa.
- `PGUSER: postgres` no step de comparadores do `db-guard.yml`: a main **evita de propósito** PG* ambiente — os scripts derivam a conexão da URL (`psql-environment.mjs:88`) e há teste garantindo não-vazamento (`psql-safe.test.mjs:78`). Portar seria contra o desenho atual.

### 6. Não mergeável (reconfirmado)
`git merge-tree --write-tree --name-only origin/main origin/claude_pink/nice-hypatia-iikl82` → exit 1, **310 arquivos em conflito** de 351.

### Correções de precisão no dossiê da triagem (não mudam o veredito)
1. São **306** arquivos de teste no diff e **303** na main (o dossiê diz 305/302).
2. `alertBehaviorTestKit.ts` na main **não é** byte-idêntico ao merge_base: blob `0d9470852` vs `9ac6edc43` — a main acrescentou `createLogger` ao `loggerMock()` (:141). O número de linhas (194) coincide, daí a confusão. A conclusão (abordagem alternativa, sem cobertura perdida) continua válida.
