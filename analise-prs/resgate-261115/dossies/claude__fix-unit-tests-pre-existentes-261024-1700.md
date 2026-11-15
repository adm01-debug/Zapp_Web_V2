# claude/fix-unit-tests-pre-existentes-261024-1700 (PR #2219)

- `merge_base` 2d97c44 (2026-10-24) · `tip` df8883db (2026-10-25) · 87 commits · 117 arquivos · 89 com lacuna / 1360 linhas
- Veredito: **PERDIDA_PARCIAL** (99% INCORPORADA/OBSOLETA; sobra 1 correção real pequena)
- `apagar_branch_seguro`: **false** (só depois de portar MFAVerify)

## Propósito
Maratona de 87 commits "corrigir falhas pré-existentes de unit test/typecheck/lint" sobre a main de
24/10. Além dos testes, arrastou features e correções de produto: X112 (lista/grade em segmentos),
X156 (campanha pausada → tela própria), X079 (células do kit na Visão geral), SL-016 (busca
server-side no chat de equipe), aba "Tarefas agendadas" no AdminView, contagem server-side do
AuditLogDashboard, validação de telefone DDI 55, avatar com URL assinada, áudio por MIME real.

## Por que quase tudo morreu
A main andou 3 semanas (base 24/10 → hoje 15/11) e **reimplementou cada um desses itens de forma
própria e geralmente melhor** (hook dedicado em vez de lógica no componente). Os testes da branch
foram escritos contra o código-fonte da branch, que a main não tem mais — portar quebraria.
O arquivo `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` foi **apagado de propósito**
na main por `e1f2ee4dd` ("fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)").

## Arquivo × achado × evidência (amostra que cobre todos os grupos)

| Branch trazia | Estado na main | Evidência |
|---|---|---|
| AdminView: aba `cron` + `admin_list_cron_jobs` inline | Extraído em componente+hook próprios | `origin/main:src/components/admin/CronJobsTab.tsx`, `src/components/admin/useTarefasAgendadas.ts` |
| `useAdminData`: avatar com signed URL | Presente | `origin/main:src/components/admin/useAdminData.ts` (`avatarObjectPath`) |
| `AuditLogDashboard`: `Stats` + 4 counts server-side no componente | Extraído em hook | `origin/main:src/components/security/AuditLogDashboard.tsx:11,70` → `useAuditLogDashboard` |
| `MediaMigrationTool`: AlertDialog + pendingCount | Presente | `origin/main:src/components/admin/MediaMigrationTool.tsx:12-19,311` |
| `ConnectionsView`: `formatPhoneNumber` + validação DDI55 | Presente com outro nome | `origin/main:src/components/connections/ConnectionsView.tsx:72,79-89,164` (`telefoneValido` + `PhoneInput`) |
| `AvatarUpload`: `avatarExtFromUrl` + limpeza de órfão | Presente com outro nome | `origin/main:src/components/settings/AvatarUpload.tsx:20,26,67,99` (`formatoAnterior`/`formatoDaUrl`) |
| `RealtimeInboxView`: fallback not-found/error | Presente | `origin/main:src/components/inbox/RealtimeInboxView.tsx` (`selectedContactFallbackStatus`) |
| `InboxEmptyChat`: props waiting/unread | Presente | `origin/main:src/components/inbox/InboxEmptyChat.tsx:58-65` |
| `PasswordResetRequestsPanel`: `isAccessDeniedError` | Presente | `origin/main:src/lib/rlsError.ts` + `PasswordResetRequestsPanel.tsx` |
| X156 campanha pausada | Presente | `origin/main:src/components/talkx/TalkXCampaignPaused.tsx`, `TalkXView.tsx` (4× `pausedCampaignId`) |
| X112 lista/grade | Presente, estado no hook | `origin/main:src/hooks/integrations/useTalkXSegments.ts:718,725,822`; `TalkXSegments.tsx:57,467,505` |
| X079 células do kit | Presente | `origin/main:src/components/talkx/TalkXOverview.tsx` + `kit/cells.tsx` (`EntityCell`) |
| SL-016 busca server-side | Presente | `origin/main:src/components/team-chat/useTeamChatPanel.ts:74,291,336,344,357,362` |
| `useTeamMessages(onEvent)` update/delete | Presente, com ref estável | `origin/main:src/hooks/team-chat/useTeamMessages.ts:52,56,61` |
| `chat.service`: extensão/contentType por MIME | Presente | `origin/main:src/services/chat.service.ts:62-74` |
| `useCallRecording`: arrayBuffer→Blob | Presente | `origin/main:src/hooks/calls/useCallRecording.ts:82-83` |
| `workItemFormat`: hora local do ISO com offset | Presente | `origin/main:src/hooks/tasks/workItemFormat.ts:65-74` |
| `useDashboardKpi`: `p_from/p_until` | Presente com fallback para assinatura antiga | `origin/main:...useDashboardKpi.ts:95-104`; produção tem **as duas** funções (`pg_proc`: `p_since,p_queue,p_agent` e `p_from,p_until,p_queue,p_agent`) |
| `useAgentCelebrations`: janela de corrida | Presente com tolerância de relógio | `origin/main:src/hooks/gamification/useAgentCelebrations.ts:190` (`marcoMontagem` + `TOLERANCIA_RELOGIO_MS`) |
| `outbound-message.service`: dono da fila offline | Presente | `origin/main:src/services/outbound-message.service.ts:379-412` (`readAuthenticatedUserId`) |
| `useWarRoomAlerts`, `useKnowledgeBase`, `useUserSettings`, `useDiagnosticsData`, `useInboxFilters`, `command-palette`, `phone-input`, `GoogleCalendarIntegration`, `TalkXTemplateEditor`, `TalkXHelpCenter`, `useTalkXSegments` (guard `ponteOnly`), `SegmentSideList` (sem `primary-glow`), `vitest.config.ts` (`TZ`) | Todos presentes | greps conferidos um a um na `origin/main` |
| `useInboxBulkActions`: arquivar via `assigned_to=null` | **A branch regrediu**: a main arquiva por `conversation_status` via RPC de lote | `origin/main:src/hooks/inbox/useInboxBulkActions.ts:188-250` — NÃO portar |
| `WhatsAppTemplatesManager`: gate `isAdmin` | Main gateia por `isSupervisor` (decisão mais nova e mais ampla) | `origin/main:src/components/catalog/WhatsAppTemplatesManager.tsx:39` — NÃO portar |
| ~60 arquivos `__tests__`, `eslint-baseline.json`, `known-violations.json`, `schema-manifest.json`, `ESTADO.md`, `docs/talkx/ARQUITETURA.md`, `docs/DB-INVENTORY.md`, `.github/.keep-ci`, `talkx-docs-drift.unit.mjs` | Baselines gerados/âncoras de doc de 3 semanas atrás; testes escritos contra o fonte da branch | valor **nenhum** — regerar é o caminho, portar não |

## Lacuna a recuperar (1 item que vale)

### `src/components/mfa/MFAVerify.tsx` — auto-verificação dispara antes dos fatores carregarem
A main está idêntica à base (`MAIN_UNCHANGED_SINCE_BASE`, patch aplica limpo). Hoje, em
`origin/main:src/components/mfa/MFAVerify.tsx:71-75`, o efeito chama `handleVerify()` assim que o
código tem 6 dígitos; se `factors` ainda não chegou, `handleVerify` (linha 48) cai em
"Nenhum fator MFA encontrado", **não limpa o código**, e como a dependência é só `[code]` nada
tenta de novo quando os fatores chegam — a pessoa trava no login com MFA até reeditar o código.
Hunk a portar (base→branch):

```diff
   useEffect(() => {
-    if (code.length === 6 && !verifying) {
+    if (code.length === 6 && !verifying && factors.length > 0) {
+      // eslint-disable-next-line react-hooks/set-state-in-effect
       void handleVerify();
     }
-  }, [code]);
+  // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [code, factors]);
```

Observação: os dois `eslint-disable` vieram do baseline da branch; confira as regras ativas na main
antes de copiá-los (pode não precisar).

### Lacuna menor (opcional, valor baixo)
`src/hooks/system/useGlobalSettings.ts` + `src/components/settings/IntegrationKeysSection.tsx`: a
branch adicionou `useGlobalSettings(options?: { enabled?: boolean })` (`enabled: options?.enabled ?? true`
no `useQuery`) e chamava `useGlobalSettings({ enabled: isAdmin })`. Na main, `IntegrationKeysSection.tsx:41`
chama o hook sem gate e só depois retorna cedo em `:83` (`if (!isAdmin)`), ou seja, não-admin ainda
dispara uma consulta a `global_settings` que o RLS recusa. Sem impacto visível para o usuário.

### Não portar
- `src/hooks/chat/useScheduledReports.ts:144`: a branch trocava o toast para "Erro ao atualizar o
  relatorio" (sem acento) só para casar com um teste — piora o texto.
- `src/components/talkx/kit/primitives.tsx`: spread de props no `Th` sem consumidor na main.

## Verificação adversarial

Parecer: **CONCORDO** com PERDIDA_PARCIAL. `apagar_branch_seguro = false` até portar o MFAVerify.
(Checkout local está em `claude/feat-radar-live-mount-261115-1302` com arquivos modificados; tudo
abaixo foi lido via `git show`/`git grep origin/main`, sem tocar no working tree.)

### 1. A lacuna do MFA é real e ainda vale (confirmada)
- `git show origin/main:src/components/mfa/MFAVerify.tsx` (153 linhas) ainda tem, em **:71-75**,
  `if (code.length === 6 && !verifying) { void handleVerify(); } }, [code]);` — sem o guard
  `factors.length > 0` e sem `factors` na dependência. Idêntico à base.
- Não foi removido de propósito: `git log -S'factors.length > 0' --oneline origin/main --
  src/components/mfa/MFAVerify.tsx` → **zero commits**; o último commit que tocou o arquivo na main é
  `025d0258d` (lote 880 cartões), anterior ao tema.
- O trabalho encaixa: `useMFA` na main continua exportando `factors` (`src/hooks/auth/useMFA.ts:72,250`),
  então o hunk aplica como está.
- Severidade confirmada contra o código da main, não só contra o JSON: `useMFA` nasce com
  `const [loading, setLoading] = useState(false)` (`useMFA.ts:71`) e só liga `loading` dentro de
  `fetchFactors` (`:77-78`), que roda em efeito pós-montagem. Ou seja existe janela real com
  `loading=false` + `factors=[]` em que o input (`MFAVerify.tsx:107`, `disabled={verifying || loading}`)
  aceita os 6 dígitos — colar o código ou autofill de gerenciador de senha basta. Pior: quando
  `fetchFactors` **rejeita**, `loading` volta a `false` e `factors` fica `[]` para sempre; digitar o
  código troca a mensagem correta ("Não foi possível carregar seus métodos…", `:33`) por
  "Nenhum fator MFA encontrado" (`:49`), sem limpar o campo e sem nova tentativa (`deps = [code]`).
- O teste existente da main (`src/components/mfa/__tests__/MFAVerify.erroFoco.test.tsx`) mocka
  `factors` já preenchido, então **não cobre** esse caminho — portar o fix pede um teste novo.
- Ressalva: o guard `factors.length > 0` é mais fraco que o `handleVerify`, que exige fator
  `status === 'verified'` (`:47`). Ao portar, use `factors.some(f => f.status === 'verified')`.

### 2. Tentei refutar as coberturas alegadas — todas se confirmaram
- `AuditLogDashboard.tsx:11` importa `useAuditLogDashboard` e `:70` desestrutura `{ stats, logs,
  nomesPorUsuario, loading, error }`; `src/hooks/security/useAuditLogDashboard.ts` existe.
- `RealtimeInboxView.tsx:530-534` usa `selectedContactFallbackStatus` com os dois estados.
- `PasswordResetRequestsPanel.tsx:13,40,57` já usa `isAccessDeniedError` + `ACCESS_DENIED_MESSAGE`.
- `InboxEmptyChat.tsx:60,65,95-102` já recebe/usa `waitingCount`/`unreadCount`.
- `ConnectionsView.tsx:11,79-89,164` tem `telefoneValido` + `PhoneInput` + `phoneError role="alert"`.
- `AvatarUpload.tsx:20,26,67` tem `formatoAnterior`/`formatoDaUrl`.
- X156: `TalkXCampaignPaused.tsx` existe na main (blob `60f9338f`) e `TalkXView.tsx` tem 4×
  `pausedCampaignId`. X112: `useTalkXSegments.ts:725,822` guarda `viewMode`/`setViewMode`.
- "Não portar" confirmados: `WhatsAppTemplatesManager.tsx:39` é
  `const { isSupervisor: canWrite } = useUserRole()` — portar o `isAdmin` da branch **restringiria**
  o acesso de propósito já decidido.
- Confirmei também que o diff de `DashboardView.test.tsx` é **regressão**: a branch reescreve o teste
  para afirmar que o aviso `dash-kpis-period-notice` aparece e que o rótulo continua "Números de
  hoje" — o oposto do E34 que a main já entrega. Não portar.

### 3. Lacuna menor confirmada (segue valor baixo)
`origin/main:src/hooks/system/useGlobalSettings.ts:46` é `export function useGlobalSettings()` sem
parâmetro, e `IntegrationKeysSection.tsx:41` chama o hook antes do early-return de `:83`. A consulta
a `global_settings` sai mesmo para não-admin e o RLS recusa. Sem sintoma para o usuário; melhoria de
ruído, não correção.

### 4. Nada além disso
Varri os arquivos com `MAIN_UNCHANGED_SINCE_BASE` em busca de hunk útil esquecido: sobram só dois
ajustes de robustez de teste (`ConnectionsView.erro-dialogo.test.tsx` + um `waitFor` no trigger;
`PasswordResetRequestsPanel.abas.test.tsx` + mock de `framer-motion`), sem efeito em produto —
valor baixo, não mudam o veredito.
