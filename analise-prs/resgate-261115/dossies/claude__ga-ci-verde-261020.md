# claude__ga-ci-verde-261020 — OBSOLETA

- Ref: `origin/claude/ga-ci-verde-261020` · tip `3d4cf85c6` · merge_base `351ccb2a6` (2026-10-23) · 45 commits · PR #2138
- 159 arquivos, 111 com lacuna, 13.024 linhas de lacuna (11.115 delas só em `supabase/schema-manifest.json`, artefato gerado)

## Propósito
Branch guarda-chuva de "CI verde" de 20–21/10: merge de 16 sub-branches (`ga-fa1-render-mocks`, `ga-fa2-timeouts`,
`ga-fa3-a11y`, `ga-fa4-elementos`, `ga-fa5-assercoes`, `ga-g1..g11`) para zerar o lote de testes/contratos de CI
daquele dia (`git log 351ccb2a6..origin/claude/ga-ci-verde-261020`). Conteúdo: asserções e mocks de teste,
nomes acessíveis/`data-testid`, contratos de workflow/inventário, docs e o manifesto de schema regerado.

## Prova central: a main fez o mesmo trabalho por conta própria
- `e1f2ee4dd` (2026-10-27, **176 arquivos**) — `fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)`:
  toca quase todos os arquivos de lacuna desta branch (`git log 351ccb2a6..origin/main -- <arquivo>` lista
  esse commit em WhisperMode, TalkXOverview, AuditLogDashboard, useTeamChatPanel, InboxEmptyChat, command-palette,
  MessageReactions, TalkXCampaignRunning, TalkXWizardDelivery, useTeamChatNotifications, useTeamMessages).
- A main avançou 20.372 linhas sobre os mesmos arquivos depois do merge_base (`counts.lines_main_has_branch_lacks`).

## Prova decisiva: o tip **não compila**
1. `supabase/functions/evolution-api/index.ts` — a branch **apaga** 95 linhas que a main ainda tem
   (`set-presence`, `set-settings`, `get-settings`, `get-webhook` com o caminho GO, `send-template`,
   `mark-unread`, `find-chats`, `find-messages`, `goHistoryNotSupported`) e corta ~30 ações de
   `_shared/evolution-control-authz.ts` (`CONTROL_ACTIONS`: integrações `set-*/get-*`, templates, labels).
   Portar = remover capacidade de WhatsApp em produção. É reversão de main, não trabalho novo.
2. `src/components/ui/sonner.tsx:3` importa `registrarToast` de `@/lib/lazyToast`, mas
   `git show origin/claude/ga-ci-verde-261020:src/lib/lazyToast.ts | grep export` só mostra `export const toast`
   (L49) — o export não existe no próprio tip nem na main (`git grep registrarToast origin/main -- src` = vazio).
   `src/lib/__tests__/lazyToast.test.ts` da branch testa esse export inexistente.
3. `src/components/talkx/TalkXCampaignRunning.tsx` importa `TalkXAbVariantStat` e consome `abStats`/
   `setSelectedCampaignId` de `useTalkX`; a branch **não toca** `src/hooks/integrations/useTalkX.ts`
   (`git diff --name-only ... -- src/hooks/integrations/` não lista o arquivo) e `TalkXAbVariantStat`/`ab_enabled`
   não existem nem no merge_base nem na main.
   Logo o "CI verde" alegado na PR #2138 não se sustenta.

## Arquivo × achado × evidência (amostra que cobre as categorias)
| Arquivo | Achado | Evidência na main |
|---|---|---|
| `supabase/schema-manifest.json` (11.115 linhas) | artefato gerado; a verdade é o banco ao vivo | regerado por `scripts/supabase_snapshot/`; valor nenhum |
| `.github/workflows/ci.yml` — `--coverage` + upload de coverage (E72) | **main decidiu o contrário** | `ci.yml` (origin/main) L289-291: "Vitest roda em shards sem coletar coverage. Não tente anexar `coverage/` ... o upload anterior era no-op" |
| `.github/workflows/ci.yml` — `Setup Deno` no job node-scripts | já na main | `ci.yml` (origin/main) L131 `denoland/setup-deno@22d081ff` |
| `.github/workflows/deploy-functions.yml` — bun install antes do `deno check` | main resolveu de outro jeito | `deploy-functions.yml` (origin/main) L473-490: `deno install --frozen=false` + `npm install --no-save @types/node@25.9.9` (W99/W100/GR-001) |
| `scripts/ci/check-test-inventory.mjs` — allowlist p/ `scripts/vercel/ignore-build.unit.mjs` | **main matou o mecanismo** | `check-test-inventory.mjs` (origin/main) L66-70: `export const ALLOWLIST_NODE = new Set();` + "novas suítes Node sem bloco `run:` devem falhar no inventário em vez de entrar nesta lista" |
| `scripts/ci/talkx-docs-drift.unit.mjs` + `docs/talkx/ARQUITETURA.md` (banner TalkXCampaignPaused ligado) | já na main | `talkx-docs-drift.unit.mjs` (origin/main) L180-184 `assert.match(/<TalkXCampaignPaused\b/)`; banner da `ARQUITETURA.md` L7-8 "já está ligado"; `TalkXView.tsx` L54/L426 |
| `src/components/talkx/useCampaignEditor.ts` — X131 `railSummary` via `talkx_resolve_audience` | main implementou melhor em outro lugar | `TalkXCampaignWizard.tsx` L722-733: `useTalkXCampaignSummary(...)` no `WizardRail`, com "—" quando indisponível; teste `TalkXCampaignWizard.resumo-servidor.test.tsx` |
| `src/components/inbox/VoiceChangerPicker.tsx` — PK-17 upload p/ `voice-changer-tmp` + URL assinada | **contrato oposto na main, por decisão** | `src/components/inbox/__tests__/VoiceChangerPicker.voz-temporaria.test.tsx` L10-16: "Contrato atual (substitui o upload do picker para `voice-changer-tmp/<uid>/`): o picker NÃO fala com o Storage ... entrega o áudio como `Blob`" |
| `src/components/inbox/quick-replies/QuickReplyCardList.tsx` — AlertDialog de exclusão | já na main, em outro arquivo | `src/components/inbox/QuickRepliesManager.tsx` L166 + `__tests__/QuickRepliesManager.exclusao-confirmada.test.tsx` L73 |
| `src/styles/utilities.css` — `safe-area-top/bottom`, `scrollbar-none` | já na main | `src/styles/utilities.css` L74-76 + `src/styles/__tests__/mobileAreaSeguraRolagem.test.ts` L132-134 |
| `src/components/ui/command-palette.tsx` — listbox/`aria-activedescendant` | já na main | `command-palette.tsx` L249, L271, L296, L310, L338 |
| `src/components/inbox/MessageReactions.tsx` — `useReacaoUnica` | já na main | `MessageReactions.tsx` (origin/main) tem `useReacaoUnica` (3 ocorrências) + `__tests__/MessageReactions.autoria-unica.test.tsx` |
| `src/hooks/team-chat/useTeamMessages.ts` — eventos de realtime tipados | já na main com outro nome | `useTeamMessages.ts` (origin/main) L48-62: `TeamMessageEvent` + `onEventRef` |
| `src/components/talkx/TalkXSegments.tsx` (maior lacuna, 108 linhas novas) | a11y/testids/painel já na main | `git grep` na main: `segments-view-grid`, `segment-card`, "Recontar público" em `TalkXSegments.tsx` + `__tests__/TalkXSegments.viewMode.test.tsx` e `TalkXSegments.detailPanel.test.tsx` |
| `src/components/admin/MediaMigrationTool.tsx` | já na main | `countPendingMedia`, `fetchMigrationHistory`, "Progresso da migração de mídia" em `MediaMigrationTool.tsx`/`mediaMigration.service.ts` + 2 testes |
| `src/components/inbox/WhisperMode.tsx` | já na main (seletores diferentes) | main tem `audio_path` (6×) e "Enviar nota de sussurro" em `WhisperMode.tsx`; os `data-testid="sussurro-*"` da branch não são usados pelos testes da main |
| ~60 arquivos de teste de cauda longa (lacuna 1–3 linhas) | varredura mecânica: 0–2 linhas novas por arquivo que não existam em `origin/main` | script de varredura em `/tmp/claude-0/.../scratchpad/ga-ci/scan.json` |

## Lacunas reais que sobraram (nada de alto valor)
### 1. `src/hooks/ui/useCustomShortcuts.ts` — rótulo ⌘ no Mac (valor baixo, portável)
Main ainda escreve "Ctrl" no Mac (`useCustomShortcuts.ts` origin/main L272), embora
`src/components/a11y/a11yComponents.tsx` L75 já use ⌘. Hunk da branch:
```ts
function rotuloDoModificadorCtrl(): string {
  const plataforma = typeof navigator === 'undefined' ? '' : navigator.platform || '';
  return plataforma.includes('Mac') ? '⌘' : 'Ctrl';
}
// em formatShortcut:
-    if (binding.modifiers.ctrlKey) parts.push('Ctrl');
+    if (binding.modifiers.ctrlKey) parts.push(rotuloDoModificadorCtrl());
```

### 2. `src/components/inbox/CRMAutoSync.tsx` — nome duplicado no wrapper do tooltip (valor baixo)
Main mantém `<span tabIndex={0} role="button" aria-disabled="true" aria-label="CRM não configurado">` em volta
de um `<Button>` que já tem nome — dois controles com o mesmo nome. A branch remove `role`/`aria-label`/
`aria-disabled` dos dois wrappers (estado "sem CRM" e "contato não encontrado"). **Atenção ao portar:** o hunk da
branch também adiciona `aria-label={tooltipText} title={tooltipText}` num `<Button>` que já tem `aria-label` —
atributo JSX duplicado; portar só a remoção dos wrappers.

### 3. Não portáveis / sem valor
- `src/components/talkx/TalkXCampaignRunning.tsx` — bloco A/B N-120 (`AbTestResults`): depende de
  `useTalkX` expor `abStats`/`TalkXAbVariantStat` e de campos `ab_*` na campanha; nada disso existe na main nem
  no tip. Recuperar exige a feature A/B inteira (hook + colunas), não este hunk.
- `src/components/ui/sonner.tsx` + `src/lib/deployment-update.ts` + `src/lib/__tests__/lazyToast.test.ts` —
  dependem de `registrarToast` em `src/lib/lazyToast.ts`, que não existe em lugar nenhum.
- `src/components/gamification/MiniGameDialogs.tsx` — `onComplete(score, xp)`: o consumidor da main
  (`TrainingMiniGames.tsx` L68-80 `handleGameComplete(finalScore)`) não usa XP; parâmetro morto.
- `.github/workflows/vercel-env-cleanup.yml` — `set -euo pipefail` num passo de um único `node ...`: sem efeito.
- `supabase/functions/evolution-api/index.ts` e `_shared/evolution-control-authz.ts` — **não portar**: são
  remoções que a main reverteu/superou (ver "Prova decisiva", item 1).

## Veredito
**OBSOLETA** (confiança alta). O objetivo (CI verde do lote de 21/10) foi atingido na main por `e1f2ee4dd` e pelos
PRs subsequentes; onde a main difere, difere por decisão registrada (coverage, `deno install`, contrato do
VoiceChangerPicker, allowlist vazia). O tip não compila (3 referências a exports inexistentes) e contém reversão
de edge de WhatsApp. `apagar_branch_seguro = true` — as duas lacunas de valor baixo estão com o hunk acima.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA**. Tentei refutar hunk por hunk e a main cobre tudo de valor ≥ médio,
em geral em forma melhor. Apagar a branch é seguro (PR #2138 fecha com ela).

Tentativas de refutação que FALHARAM (main já tem, com evidência):
- `onReopen` na linha + `ConversationReopenDialog`: `origin/main:src/components/inbox/VirtualizedRealtimeList.tsx:19,84,413,779`.
- Estados de fallback do contato fora da lista: `origin/main:src/components/inbox/RealtimeInboxView.tsx:530-534`
  (+ testes `RealtimeInboxView.contato-fora-lista.test.tsx`, `useRealtimeInbox.contato-fora-lista.test.tsx`).
- Nota de voz no sussurro: `origin/main:src/components/inbox/WhisperMode.tsx:18,19,41,293,318,464,520`
  (`useAudioRecorder`, `audio_path`, `useWhisperCount`).
- `useAdminData`: camada `invokeEdge` (L9,491-503) e avatar em bucket privado com
  `avatarObjectPath`/`createSignedUrl` (L25,238,242) — a main usa `AVATAR_SIGNED_URL_TTL_SECONDS`.
- `MediaMigrationTool`: contagem e histórico existem, extraídos para serviço —
  `origin/main:src/components/admin/MediaMigrationTool.tsx:9,10,57,66,77,81` →
  `src/services/mediaMigration.service.ts` (`countPendingMedia`, `fetchMigrationHistory`).
- Uma reação por autor com rollback: `origin/main:src/components/inbox/MessageReactions.tsx:15-19,40,53-62,98,153`.
- Abort da prévia de voz: `origin/main:src/components/inbox/VoiceSelector.tsx:72,104,124,134,137,164`.
- `setup-deno` no CI: `origin/main:.github/workflows/ci.yml:131` (e L215).

Achado NOVO que REFORÇA o descarte (hunk da branch seria regressão):
- `src/components/catalog/WhatsAppTemplatesManager.tsx`: a branch gateia a escrita em `isAdmin`.
  A RLS real de `whatsapp_templates` é `is_admin_or_supervisor(auth.uid())` (policies "Admins can insert
  templates" / "Admins can manage templates", consulta `db_list_policies` em `tnnnlkbymytvtqngbbqh`,
  2026-11-15). A main gateia em `isSupervisor: canWrite` (`origin/main:…:39,58-141`), o que CASA com a RLS,
  por decisão registrada em `2420d0a28 fix(templates): libera gestão a supervisores conforme RLS (#2334)`.
  Portar o hunk da branch esconderia os botões de supervisores que PODEM escrever.

Provas da triagem que confirmei de forma independente:
- Tip não compila (2 de 2): `origin/claude/ga-ci-verde-261020:src/components/ui/sonner.tsx:3` importa
  `registrarToast`, e `src/lib/lazyToast.ts` do próprio tip só exporta `toast` (L49); `git grep registrarToast
  origin/main -- src` = vazio. E `TalkXCampaignRunning.tsx:17,515-519,628` usa `TalkXAbVariantStat`/`abStats`
  de `useTalkX`, que não existem em nenhuma ref (`git grep … origin/main origin/claude/ga-ci-verde-261020 --
  src/hooks/integrations/useTalkX.ts` = vazio) e a branch não altera esse arquivo.
- Reversão de edge: `git diff --stat 351ccb2a6 REF -- supabase/functions/evolution-api/index.ts
  supabase/functions/_shared/evolution-control-authz.ts` = 8 inserções, 132 deleções. Contagem por ação
  (main → tip): `set-presence` 2→0, `set-settings` 1→0, `get-settings` 2→0, `send-template` 2→0,
  `mark-unread` 3→0, `find-chats` 2→0, `find-messages` 2→0. Portar = perda de funcionalidade em produção.
- Coverage em shards: `origin/main:.github/workflows/ci.yml:289-291` rejeita o artifact por escrito
  ("o upload anterior era no-off"/no-op; exige agregação dos shards). Decisão registrada, não lacuna.
- `deploy-functions.yml`: a main resolve `@types/node` com `deno install --frozen=false` +
  `npm --prefix supabase/functions install --no-save @types/node@25.9.9`
  (`origin/main:.github/workflows/deploy-functions.yml:473-494`, notas W99/W101/GR-001) — solução própria,
  diferente do `bun install` da branch. Não é lacuna.

Lacunas remanescentes (confirmadas, ambas de valor BAIXO — não mudam o veredito):
1. `src/hooks/ui/useCustomShortcuts.ts`: `formatShortcut` ainda empurra `'Ctrl'`
   (`origin/main:…:269-276`), sem variante ⌘ no Mac. Hunk salvo acima.
2. `src/components/inbox/CRMAutoSync.tsx`: a main mantém `role="button"` + `aria-label` no wrapper
   (L64,66 e L129,131) enquanto o `<Button>` interno já tem o mesmo `aria-label` (L73,138) — dois controles
   com o mesmo nome acessível. Portar SÓ a remoção do wrapper; o hunk da branch repete `aria-label` no
   `<Button>` (atributo JSX duplicado).
