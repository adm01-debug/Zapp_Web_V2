# claude_05/festive-carson-ub43wu — triagem semântica

- Ref: `origin/claude_05/festive-carson-ub43wu` · tip `697e94dd6` (2026-11-11) · merge_base `2d97c44c` (2026-10-24) · 50 commits à frente
- PRs com este tip: nenhuma. Sem comentário de fechamento, sem triagem anterior.
- Pré-classificação mecânica: MISTO_CONFLITO (21 arquivos com lacuna, 354 linhas)

## Propósito
Sessão de "fix CI": corrigiu as falhas de **Unit Tests** (mocks de jsdom/TanStack Virtual, ARIA da paleta de
comandos, notificações do chat interno, deep-link `?type=` do Inbox, erro de leitura da base de conhecimento,
hook morto do Talk X), ajustou 2 scripts de `db-audit`/workflow, regenerou `deployment-manifest.json`,
reconciliou uma migration de drift e manteve um diário de CI em `PENDENCIAS.md` / `RELATORIO_CI.md`.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência na `main` |
|---|---|---|
| `src/hooks/chat/useTeamChatNotifications.ts` | INCORPORADA (abordagem superada, melhor) | `main:5` `import { showBrowserNotification }`, `main:144/147` refs de settings, `main:240` `showBrowserNotification(...)`, `main:254` `}, [profile]`; canal por `uniqueRealtimeTopic('team-chat-notifications')` (`main:161`) em vez do `:${profile.id}` da branch |
| `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx` | INCORPORADA (equivalente) | `main:62` dubla `showBrowserNotification` → `h.show`; `main:153` espera `('💬 Teams: Ana', any(String), {tag:'team-msg-c1'})`. A `FakeNotification` da branch cobre o mesmo contrato por outro caminho |
| `src/components/ui/command-palette.tsx` | INCORPORADA (superset) | `main:226` `listboxId`, `main:232` `scrollIntoView({block:'nearest'})`, `main:245-249` `role=combobox`+`aria-activedescendant`, `main:266` `role=status`, `main:271` `role=listbox`, `main:296/310/338` `role=option`+`aria-selected`. A branch duplicava `id="cmd-palette-list"` em dois `div` (HTML inválido); a main usa um só |
| `src/hooks/inbox/useInboxFilters.ts` | INCORPORADA | `main:2/97` `useSearchParams`, `main:106` `searchParams.get('type')`, `main:116/168` deps e normalização; `contactTypeFromUrl()`/`window.history.replaceState` já não existem na main |
| `src/hooks/auth/useAuth.tsx` | INCORPORADA | `main:12` import de `offlineSendQueue`, `main:28` `await offlineSendQueue.clear()` |
| `src/hooks/integrations/useKnowledgeBase.ts` | INCORPORADA (melhor) | `main` tem `const [error, setError]` e `setError(articlesRes.error?.message ?? filesRes.error?.message ?? null)` dentro de `try/catch`; a branch fazia `return` cedo e perdia os dados parciais |
| `src/hooks/integrations/useTalkXSegments.ts` | INCORPORADA | `origin/main:src/hooks/integrations/useTalkXSegments.ts:90` `lead_origin ... comingSoon: true` |
| `src/hooks/integrations/useTalkXSuppression.ts` + `__tests__/useTalkXSuppression.test.ts` | INCORPORADA | `git grep "export function useTalkXSuppression" origin/main` = vazio (hook morto removido); a main ainda tem o guarda `__tests__/useTalkXSuppression.hook-morto.test.ts` (proíbe reintrodução) e `useTalkXSuppression.test.tsx` |
| `src/hooks/system/useDiagnosticsData.ts` | INCORPORADA (equivalente) | `main:293-294` comentário + sem `throw`; `main:317` `classifyHealth(connectionsCountError ?? dbError, ...)` |
| `src/hooks/team-chat/useTeamReadState.ts` | INCORPORADA | `main` tem `if (!conversationId || !hasOwnMessages) return;` e dep `hasOwnMessages` |
| `src/hooks/contacts/__tests__/useContainerColumns.test.ts` | INCORPORADA | `main:33` `Object.defineProperty(this.element, 'getBoundingClientRect', {...})` |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` | INCORPORADA | `main:63` `getBCRSpy = vi.spyOn(Element.prototype,'getBoundingClientRect')` |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | INCORPORADA | `main:23-24` `vi.mock('@/hooks/system/useDownloadPermission', ...)` |
| `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` | INCORPORADA | idêntico à main (byte) |
| `playwright.config.ts` | INCORPORADA | `origin/main:playwright.config.ts:153` `geolocation:{latitude:0,longitude:0}, permissions:['geolocation']` |
| `scripts/db-audit/user-sessions-expire.test.sh` | INCORPORADA (superset) | `origin/main:...:14` `PG_IMG="${N008_POSTGRES_IMAGE:-${POSTGRES_TEST_IMAGE:-postgres:17-alpine}}"` |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | INCORPORADA | já na main (reverse-apply) |
| `supabase/migrations/20261026210300_...trig.sql` | INCORPORADA | arquivo existe na main; `diff` main×branch = só 4 linhas de comentário, SQL idêntico. Produção (`tnnnlkbymytvtqngbbqh`, leitura): `schema_migrations` tem `20261026210300`, `pg_proc.team_reactions_force_conversation_id`=1, trigger `..._trig`=1 |
| `.github/workflows/db-guard.yml` | OBSOLETA (coberto por outro caminho) | A branch punha `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` no step N-008. Na main o step (`:1434-1437`) não tem esse env, mas o job `offline-contract` define `POSTGRES_TEST_IMAGE` em `env:` (`:67-68`, digest pinado) e o `user-sessions-expire.test.sh:14` já lê `POSTGRES_TEST_IMAGE` como fallback → mesma imagem pinada, env de step redundante |
| `ChatMessagesArea.agrupar-envio.test.tsx` · `ChatMessagesArea.movimento-reduzido.test.tsx` | OBSOLETA | O mock de `getBoundingClientRect` já não é necessário: rodei na árvore atual (idêntica à main nesses 2 arquivos e em `ChatMessagesArea`) `npx vitest run` nos dois → **2 arquivos / 5 testes passam** sem o mock |
| `scripts/ci/fila-merge.mjs` | OBSOLETA (alvo apagado de propósito) | O arquivo **não existe na main**: apagado (com `fila-merge.unit.mjs`, −371 linhas) no commit `41853318c` "pacote 6 — as 26 PRs abertas integradas num ciclo de CI (#3113)" (2026-11-14). Nenhum workflow da main referencia `fila-merge` (só docs em `docs/_arquivo/`). O retry de HTTP 504 da branch não tem onde morar |
| `PENDENCIAS.md` | OBSOLETA | main reescrita em `1d4702804` (2026-11-15); o topo da main é "# PENDÊNCIAS CI — 2026-11-12" com outra estrutura. O texto da branch é diário de sessão de Nov/01–12 |
| `RELATORIO_CI.md` | OBSOLETA | main reescrita em `cb6576b2a` (2026-11-13), hoje "RELATÓRIO CI — fix-ci-workflows-hxupgs / fix-ci-workflows-261112-0400" |
| `ESTADO.md` | OBSOLETA | A branch corrigia a âncora do `ai-kb-ingest` para `:130`/`:201`; a main tem `:137`/`:208` (`ESTADO.md:43`), que casam com o código atual (`useKnowledgeBase.ts:137` e `:208` são os dois `functions.invoke('ai-kb-ingest')`) |
| `supabase/deployment-manifest.json` | OBSOLETA | regeneração da branch está velha: `ai-audio-authz.ts` com `bytes 7475` na branch × `7464` na main; `manifest_sha256` da main `def318ea...` ≠ branch `42fcdc0b...`. O manifesto da main é gerado por automação a cada mudança de edge |

## Veredito
**INCORPORADA** (confiança alta). Todo o trabalho de engenharia da branch está na `main`, em vários casos com
implementação melhor (paleta com um único `listbox`, `useKnowledgeBase` sem `return` cedo, canal de notificação
por `uniqueRealtimeTopic`). O resíduo não incorporado é inútil hoje: diário de CI superado, manifesto de deploy
vencido, âncoras de `ESTADO.md` erradas, 2 mocks de teste desnecessários (testes passam sem eles) e um patch
para `scripts/ci/fila-merge.mjs`, script apagado de propósito na main em 2026-11-14.

**Nada a recuperar.** `apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar a triagem (veredito INCORPORADA). Resultado: **não refutada — concordo**. `origin/main` em `dac285f62`.
Varri os 27 arquivos do `git diff 2d97c44c origin/claude_05/festive-carson-ub43wu` (`--stat`: 437+/1024−).
Em TODOS os arquivos de código o `git diff origin/main origin/<branch>` só REMOVE coisa da main — a main é superset:

- `src/hooks/chat/useTeamChatNotifications.ts` — a branch removeria `uniqueRealtimeTopic` (`origin/main:161`) voltando
  ao canal fixo `team-chat-notifications:${profile.id}`, e removeria o `cid` do `navigateToView('team-chat', { cid })`
  (`origin/main:243`/`:267`). Único delta "novo" da branch é `useLayoutEffect` para os refs — sem efeito prático: na main
  o efeito dos refs (`:146-149`) é declarado antes do efeito do canal (`:155`) e já corre primeiro no mount. Valor: nenhum.
- `src/components/ui/command-palette.tsx` — a main tem TODA a ARIA (`listboxId` `:226`, `scrollIntoView` `:232`,
  `role=combobox`+`aria-activedescendant` `:245-249`, `role=status` `:266`, `role=listbox` `:271`,
  `role=option`+`aria-selected` `:296/:310/:338`) **mais** o retorno de foco (`focusReturnRef`, `captureFocusOrigin`,
  `restoreFocusOrigin`) e o dedup de recentes no acesso rápido, que a branch não tem.
- `src/hooks/inbox/useInboxFilters.ts` — deep-link `?type=` idêntico em semântica na main (`:106-112`:
  `typeParam !== null ? normalizeContactType(typeParam) : storedPrefs?.contactType ?? null`).
- `src/hooks/integrations/useKnowledgeBase.ts` — main `:61/:65/:73-76` usa `setError(...)` sem `return` cedo (melhor).
- `src/hooks/auth/useAuth.tsx` — main `:12/:28` + helper `esvaziarFilaDeEnvioOffline()` com try/catch (a branch fazia
  `void offlineSendQueue.clear()` cru, sem proteger o logout).
- `src/hooks/team-chat/useTeamReadState.ts` — a branch REMOVERIA `isError` do retorno. Regressão.
- `src/hooks/integrations/useTalkXSegments.ts` / `useTalkXSuppression.ts` — a branch é anterior a X101/X115/ponteOnly;
  removeria ~190 linhas da main. `git grep 'export function useTalkXSuppression' origin/main` = vazio (hook morto
  removido de propósito; a main mantém `__tests__/useTalkXSuppression.hook-morto.test.ts` como guarda).
- `src/hooks/system/useDiagnosticsData.ts` — equivalente: main `classifyHealth(connectionsCountError ?? dbError, …)` `:317`.
- `playwright.config.ts`, `scripts/db-audit/*.test.sh` — a branch reverteria `workers: 2`, `usesExternalHttpsServer`,
  `wait-postgres-final-start.sh`, `--no-healthcheck`, o predecessor de migration e o fallback
  `${N008_POSTGRES_IMAGE:-${POSTGRES_TEST_IMAGE:-postgres:17-alpine}}` (`origin/main:…user-sessions-expire.test.sh:14`).
- `supabase/migrations/20261026210300_…trig.sql` — só 4 linhas de comentário; SQL idêntico.

Resíduo alegado, testado um por um:
1. `.github/workflows/db-guard.yml` (`N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}`) — **redundante provado**:
   o step N-008 (`origin/main:1434-1437`) está no job `offline-contract` (`:45`→`:1685`), que já define
   `POSTGRES_TEST_IMAGE` com digest pinado no `env:` do job (`:68`), e o script lê esse fallback (`:14`). Mesma imagem.
2. Os 2 mocks de `getBoundingClientRect` nos testes de `ChatMessagesArea` — **desnecessários provados pela causa**:
   `src/test/setup.ts:131-146` já define `HTMLElement.prototype.getBoundingClientRect` (800×600) globalmente, com
   comentário explícito "@tanstack/react-virtual no jsdom". Rodei nas versões da main (idênticas à árvore local):
   `npx vitest run …agrupar-envio.test.tsx …movimento-reduzido.test.tsx` → **2 arquivos / 5 testes passam**.
   Também rodei `useContainerColumns.test.ts` + `useTeamChatNotifications.canal-estavel.test.tsx` → **20 testes passam**
   (o `writable: true` que a branch acrescentava não é necessário: o teste usa `defineProperty`, não atribuição).
3. `scripts/ci/fila-merge.mjs` (retry 504/ECONNRESET) — **alvo inexistente**: `git ls-tree origin/main scripts/ci/`
   não tem `fila-merge*`; apagado em `41853318c` ("pacote 6 …", −204 e −167 linhas com o `fila-merge.unit.mjs`);
   `git grep -l execComRetry origin/main` só acha `docs/_arquivo/`. Nenhum workflow ou script da main referencia.
4. `PENDENCIAS.md` / `RELATORIO_CI.md` — diários de sessão de Nov/01-12; main reescrita depois
   (`1d4702804` e `cb6576b2a`; topo da main: "# PENDÊNCIAS CI — 2026-11-12" / "RELATÓRIO CI — fix-ci-workflows-hxupgs").
5. `ESTADO.md` — as âncoras da branch (`:130`/`:201`) estão ERRADAS para o código atual; a main (`ESTADO.md:43`)
   aponta `:137`/`:208`, que são exatamente os dois `functions.invoke('ai-kb-ingest')` de
   `origin/main:src/hooks/integrations/useKnowledgeBase.ts:137` e `:208`. Pegar a branch pioraria o doc.
6. `supabase/deployment-manifest.json` — manifesto da branch é menor e vencido (main tem ~290 linhas a mais;
   `manifest_sha256` main `def318ea…` × branch `42fcdc0b…`); regenerado por automação, último toque em `dac285f62` (hoje).

Nenhum hunk de valor ≥ médio fora da main. Veredito mantido: **INCORPORADA**; `apagar_branch_seguro = true`.
