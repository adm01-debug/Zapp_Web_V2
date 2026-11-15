# Dossiê — `claude/confident-bardeen-ndq0ch` (PR #2195)

- tip `229e32a7f` · merge-base `17976eb8b` · 35 commits (2026-10-23), 25 arquivos.
- Propósito: branch de **conserto de CI** ("corrige falhas de CI — testes unitários e Contrato DB offline"):
  mocks nos testes do ChatMessagesArea, canal Realtime estável no chat de equipe, fila offline no logout,
  ARIA do command-palette, fail-closed de `real_sector/real_uf` no Talk X, remoção do hook morto
  `useTalkXSuppression()` (Z008), erro RLS sanitizado no painel de reset de senha, stub `contacts` no teste N-095.
- Triagem anterior (2026-11-08): `JA_NA_MAIN`. Tip NÃO é ancestral de `origin/main` (`git merge-base --is-ancestor` → NO).

## Veredito: **PERDIDA_PARCIAL** (1 lacuna real, valor baixo) · apagar branch: **não** (regra 5)

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `.github/workflows/db-guard.yml` (+`PGUSER: postgres`) | obsoleta/ruído | main não tem `PGUSER`; o teste N-095 roda em `db-guard.yml:916` e o script usa `docker exec … psql -U postgres` (`talkx-campaign-recipients-page.test.sh:34,45`) — a env não é necessária |
| `ESTADO.md` (âncoras `useKnowledgeBase.ts:138/:209`) | obsoleta (gerado) | main `ESTADO.md:43` aponta `:137/:208`, que batem com `useKnowledgeBase.ts:137,208` da main |
| `scripts/db-audit/talkx-campaign-recipients-page.test.sh` (mover `CREATE TABLE contacts` antes de `talkx_recipients`) | ruído | `talkx_recipients.contact_id uuid NOT NULL` sem FK (linha 80); `contacts` já existe na main (linha 93); ordem irrelevante. Branch ainda tira o bit executável (755→644) — regressão, não portar |
| `src/components/inbox/RealtimeInboxView.tsx` (`cachedConversations ?? []`) | ruído | `useRealtimeInbox.ts:92` ← `useOfflineCache` devolve `effectiveData = semDadosVivosOffline ? (cachedData \|\| conversations) : conversations` (`src/hooks/system/useOfflineCache.ts:106,115`) — sempre array |
| `src/components/talkx/useCampaignEditor.ts` (`Promise.all`→`allSettled`) | obsoleta (contradiz fail-closed) | `countAudience` lança em `assertNoPonteOnlyFields` (`useTalkXSegments.ts:280,311`); `allSettled` engoliria o erro e deixaria `counts[s.id]` indefinido. Main mantém `Promise.all` (`useCampaignEditor.ts:684`) |
| `src/components/talkx/TalkXOverview.tsx` (`aria-label={`Ações de ${c.name}`}`) | incorporada (refatorada) | menu de linha virou `kit/table.tsx:45-54` (`aria-label={label}`); teste `kit/__tests__/TalkXTable.test.tsx:148` espera `/Ações de Campanha/` |
| `src/components/ui/command-palette.tsx` (`role=listbox/option`) | incorporada | `command-palette.tsx:271` (`role="listbox"`), `:296,:310,:338` (`role="option" aria-selected`) |
| `src/hooks/auth/useAuth.tsx` (`offlineSendQueue.clear()` no logout) | incorporada | `useAuth.tsx:26-32` `esvaziarFilaDeEnvioOffline`, chamada em `:175` e `:249` |
| `src/hooks/chat/useTeamChatNotifications.ts` (canal estável + refs) | incorporada | `:144-149` refs de settings/quietHours; `:161` `uniqueRealtimeTopic('team-chat-notifications')`; `:254` deps `[profile]`. `permissionRef/showNotificationRef` dispensáveis: main usa `Notification` direta (`:218`) |
| `src/hooks/contacts/__tests__/useContainerColumns.test.ts` | incorporada | `:33` `Object.defineProperty(this.element, 'getBoundingClientRect', …)` |
| `ChatMessagesArea.{agrupar-envio,loop,movimento-reduzido,pagination}.test.tsx` | obsoleta (mesma necessidade, outra forma) | main tem `ResizeObserverMock` (agrupar :21, loop :21, mov :42, pag :27), spy de `getBoundingClientRect` (loop :51, pag :63) e `vi.mock('@tanstack/react-virtual', importActual…)` (loop :59, mov :18). NÃO VERIFICADO rodando a suíte nesta triagem |
| `src/hooks/integrations/useKnowledgeBase.ts` (estado `error`) | incorporada | `:61,:65,:73,:75,:237` |
| `src/hooks/integrations/useTalkXSegments.ts` | incorporada/obsoleta | `requiresPreResolution`→`ponteOnly` (`:66,:80,:81,:209`), `findPreResolutionField`→`assertNoPonteOnlyFields` (`:280,:311`), `lead_origin comingSoon` (`:90`). `comingSoon` em `real_*` CONTRADIZ a main (teste `:351` "real_* continua regra completa"; `a6fbadfa3`). Regex `quoted` equivalente. `allSettled` em `refreshEstimates` (`:791`) — mesmo motivo do editor |
| `src/hooks/integrations/__tests__/useTalkXSegments.test.ts` | obsoleta | expectativas presas a `comingSoon` em `real_*`; main `:130,:351-360` testa o desenho `ponteOnly` |
| `src/hooks/integrations/useTalkXSuppression.ts` (remove hook Z008) | incorporada | main sem `useTalkXSuppression()`/`BlacklistEntry`/`useMutation` (grep vazio); removido em `e1f2ee4dd`; guarda `__tests__/useTalkXSuppression.hook-morto.test.ts` |
| `__tests__/useTalkXSuppression.test.tsx` (branch apaga) | obsoleta — **não apagar** | arquivo da main é outro teste (X184 `useTalkXSuppressionActivity`, cabeçalho linhas 6-14) |
| `useTeamMessages.canal-e-reconexao.test.tsx`, `a11y-ferramentas-ia`, `FilesTab.fase6`, `dashboard-rls-authorization.test.sh` | incorporadas | `missing_in_main=0` / PRESENT_BYTE / PRESENT_REVERSE_APPLIES |
| `src/components/security/PasswordResetRequestsPanel.tsx` | **PERDIDA (parcial)** | main `:40,:57` aplica `isAccessDeniedError(error)` sobre `new Error(parsed.message)` — só código/fragmento de mensagem (`rlsError.ts:19-27,42-53`). **HTTP 403 por `status` não é detectado**: a edge devolve 403 com "Only admins can approve password resets"/"Access denied" (`supabase/functions/approve-password-reset/index.ts:130,151`), nenhum bate em `ACCESS_DENIED_FRAGMENTS` → toast mostra o texto cru em inglês em vez de `ACCESS_DENIED_MESSAGE`. Teste `acesso-negado.test.tsx` só cobre `42501` (`:42`) |

## Lacuna a recuperar (valor baixo — UX de mensagem; sem vazamento de dado)

`src/components/security/PasswordResetRequestsPanel.tsx` — checar `isAccessDeniedError` no `ParsedEdgeError` (tem `status`) antes de descartar para `Error`. Hunk da branch (commit `229e32a7f`), aplicar nos dois handlers:

```diff
-      if (error) throw new Error((await parseEdgeError(error, 'Erro ao aprovar')).message);
+      if (error) {
+        const parsed = await parseEdgeError(error, 'Erro ao aprovar');
+        if (isAccessDeniedError(parsed)) throw new Error(ACCESS_DENIED_MESSAGE);
+        throw new Error(parsed.message);
+      }
```
(idem com `'Erro ao rejeitar'` em `handleReject`). Manter o `catch` atual da main. Teste sugerido: estender
`src/components/security/__tests__/PasswordResetRequestsPanel.acesso-negado.test.tsx` com `FunctionsHttpError` `context.status=403`.

## Não portar
- `comingSoon` em `real_sector/real_uf` e `Promise.allSettled` (contradizem fail-closed vigente).
- Deleção de `useTalkXSuppression.test.tsx` (arquivo da main é outro teste).
- `PGUSER` no db-guard e chmod 644 do script N-095.

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL`. Branch **não** pode ser apagada antes de portar a lacuna.
Base: `origin/main` em `dac285f62`; worktree == `origin/main` nos arquivos usados como prova (`git diff --stat origin/main HEAD` vazio nesses caminhos).

### A lacuna é real (confirmada, não só alegada)
- `PasswordResetRequestsPanel.tsx:33` e `:52` da main fazem `throw new Error((await parseEdgeError(...)).message)` —
  o `Error` nu **perde `code` e `status`**; o `catch` (`:40`, `:57`) chama `isAccessDeniedError(error)` sobre esse `Error`.
- `rlsError.ts:42-53`: detecta por `code` ∈ {42501, PGRST301}, por `status/statusCode === '403'` **ou** por fragmento
  (`row-level security`, `permission denied`, `insufficient privilege`, `forbidden`).
- Caminho do 403 da edge: `errorResponse(msg, 403)` serializa `{ error: "<msg>" }` (`_shared/validation.ts:144-161`)
  → `parseEdgeError` cai no ramo "código plano" (`invokeEdge.ts:218-221`) → `code="Only admins can approve password resets"`,
  `status=403`, `message` igual ao `code`. Nenhum fragmento bate e o `403` é descartado no `new Error(...)`
  → **toast exibe o texto cru em inglês** (`approve-password-reset/index.ts:130` e `:151`).
- Não foi remoção deliberada: `git log -S"isAccessDeniedError(parsed)" origin/main -- <painel>` → **vazio** (nunca existiu na main).
- Ainda encaixa: `isAccessDeniedError` aceita `unknown` e lê `shape.status` (`rlsError.ts:48`), e `ParsedEdgeError.status: number|null`
  (`invokeEdge.ts:127`) → `String(403)==='403'` → `true`. O hunk da branch aplica como está.
- Teste: `PasswordResetRequestsPanel.acesso-negado.test.tsx:39-46` mocka erro **sem `context`** (code 42501, mensagem com
  `row-level security`) — passa pelo fragmento; nenhum caso com `context.status=403`. Cobertura do 403 realmente ausente.

### Refutações que tentei e falharam (tudo o que a triagem chamou de incorporada/obsoleta se sustenta)
- **Testes do `ChatMessagesArea` (o "NÃO VERIFICADO" do dossiê): EXECUTEI.**
  `npx vitest run ChatMessagesArea.{agrupar-envio,loop,movimento-reduzido,pagination}.test.tsx useContainerColumns.test.ts`
  → **5 arquivos, 24 testes, 100% verdes em 3,09 s** na main. Os mocks da branch (ResizeObserver reentrante,
  `getBoundingClientRect` no protótipo, mock de `@tanstack/react-virtual`) não recuperam nada: obsoletos de fato.
- `useTeamChatNotifications.ts`: main tem o canal estável — `uniqueRealtimeTopic('team-chat-notifications')` (:161),
  refs de `notifSettings`/`isQuietHours` (:144-149) e deps **`[profile]`** (:254, com o comentário HZ5-09). `channelIdRef`+UUID da branch é a mesma solução.
- `useAuth.tsx`: `esvaziarFilaDeEnvioOffline` (:26-28, `offlineSendQueue.clear()`) chamada em `:175` e `:249`. Incorporada.
- `useKnowledgeBase.ts`: estado `error` em `:61,:65,:73,:75` e exportado em `:237`. Incorporada (forma condensada).
- `command-palette.tsx`: `role="listbox"` (:271) e `role="option" aria-selected` (:296,:310,:338). Incorporada (o `aria-label`
  difere — "Acesso rápido" vs "Resultados da busca": equivalente).
- `TalkXOverview.tsx`: botão de ações virou `kit/table.tsx:54` (`aria-label={label}`). Incorporada.
- `RealtimeInboxView.tsx` (`?? []`): `useOfflineCache.ts:106-107` devolve `cachedData || conversations` — sempre array;
  a main já usa `.find`/`.reduce` direto (`useRealtimeInbox.ts:131`, `RealtimeInboxView.tsx:236`). Ruído.
- `useTalkXSegments.ts`: `ponteOnly` (:66,:80,:81,:209) + `assertNoPonteOnlyFields` (:280,:311,:333) entregam o MESMO
  fail-closed de `requiresPreResolution`/`findPreResolutionField`. `comingSoon` em `real_*` e `Promise.allSettled`
  contradizem o desenho vigente (`a6fbadfa3`, #2240) — não portar, como diz o dossiê.
- `useTalkXSuppression.ts`: superfície de exports **idêntica** entre main e branch (`SUPPRESSION_ACTIVITY_*`,
  `fetchTalkXSuppressionActivity`, `useTalkXSuppressionActivity`, `useTalkXSuppressionStats`) — o hook morto já não existe
  em nenhum dos dois. A deleção de `__tests__/useTalkXSuppression.test.tsx` pela branch apagaria o teste X184 da main: **não portar**.
- `db-guard.yml`: main sem `PGUSER` (grep = 0) e o script usa `psql -U postgres` explícito. Desnecessário.
- `talkx-campaign-recipients-page.test.sh`: main `100755`, branch `100644` (`git ls-tree`) — a branch **regride** o bit
  executável; a reordenação do `CREATE TABLE contacts` é irrelevante (sem FK). Não portar.

Nenhum hunk de valor ≥ médio fora da lacuna já listada. Nenhuma lacuna adicional.
