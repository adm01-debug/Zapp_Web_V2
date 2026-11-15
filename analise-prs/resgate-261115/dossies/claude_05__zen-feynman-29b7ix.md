# claude_05/zen-feynman-29b7ix (PR #2211) — OBSOLETA

- `ref`: `origin/claude_05/zen-feynman-29b7ix` · tip `c49753c71` · merge_base `17976eb8b` (23/10) · 17 commits, último 25/10/2026
- Triagem anterior (2026-11-08) marcou #2211 como `JA_NA_MAIN` — **confirmado por leitura de código**, com duas ressalvas de valor baixo (abaixo).

## Propósito
Branch de "limpeza de CI" de 25/10: corrigir 119 falhas pré-existentes da suíte, erros de typecheck
(RPCs ausentes em `types.ts`), uma falha de sintaxe no workflow `auto-update-pr-branch.yml` e publicar
um relatório de análise das 146 PRs abertas. No caminho, levou melhorias reais de UX/a11y em
WarRoom, Auditoria, Talk X Segmentos e Dashboard.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência na `main` |
|---|---|---|
| `.github/workflows/auto-update-pr-branch.yml` | **OBSOLETA** — o arquivo não existe mais | apagado em `41853318c` ("pacote 6", 14/11); `git ls-tree origin/main .github/workflows/` não lista |
| `.gitignore` (`analise-prs/`) | **OBSOLETA/contrária** — a main **versiona** esse diretório | `git ls-tree -r origin/main analise-prs` → 20+ arquivos versionados |
| `analise-prs/RELATORIO_PRS.md` (201 linhas) | **OBSOLETA** — substituído por relatório mais novo | `origin/main:analise-prs/RELATORIO_PRS.md:1` = "sessão de 11–12/11/2026" |
| `ESTADO.md` (âncora `migrate-media-storage`) | **INCORPORADA** | `origin/main:ESTADO.md:98` → `MediaMigrationTool.tsx:97`, que é de fato a linha do `invokeEdge('migrate-media-storage')` |
| `FEATURE_REGISTRY.md` | `warroom`: **INCORPORADA** (`main:64` idêntico); `media-migration`: **OBSOLETA** (`main:79` → `src/lib/invokeEdge.ts`, porque o hook da branch não existe) | — |
| `src/__tests__/a11y/icon-buttons-baseline.json` | **INCORPORADA** — as 3 entradas do WarRoom já saíram | `git show origin/main:…/icon-buttons-baseline.json \| grep WarRoomDashboard` → vazio |
| `src/components/admin/MediaMigrationTool.tsx` + `src/hooks/admin/useMediaMigrationData.ts` | **OBSOLETA** — a main tirou o Supabase do componente por outra via, mais completa: `src/services/mediaMigration.service.ts` (mesmos prefixos `mmg./pps.whatsapp.net`, mesmo `audit_logs` action=`media_migration` limit 10, mesmo join em `profiles`), com histórico, confirmação e estados de erro | `origin/main:src/services/mediaMigration.service.ts:21-60`; `MediaMigrationTool.tsx:9-10,74-84` (328 linhas vs 80 da branch) |
| `src/components/dashboard/DashboardView.tsx` | **INCORPORADA** (as 3 mudanças) | `main:117-120` (`kpiPeriodo` → `from/until` na RPC), `main:184` (`filters={tab === OVERVIEW_TAB ? … : null}`), `main:217` (título do bloco segue o período), `main:225` (aviso refinado em vez de removido) |
| `src/components/dashboard/WarRoomDashboard.tsx` | **INCORPORADA** — tudo, em versão melhor (a main ainda distingue `modoProp`) | `main:52-53` (dispensa otimista), `main:83-91` (rollback + `toast.error`), `main:62-64` (`carregando`/`falhaDeLeitura`), `main:114` `role="status"`, `main:126` `role="alert"` + `main:132` refetch, `main:166` `role="log"`, `main:107-109` `aria-label`, `main:76-78` `fullscreenchange`, `motion-safe:` em 99/103/108/158 |
| `src/components/dashboard/ProgressiveDisclosureDashboard.tsx` | **OBSOLETA** — muleta de teste (trocar `useQueryClient()` por `useContext(QueryClientContext)` só para renderizar sem provider). A main mantém `useQueryClient()` (`main:37`) e os testes envolvem em `QueryClientProvider` (`__tests__/GamificationSection.customizacao.test.tsx:39`) |
| `src/components/dashboard/overview/GamificationSection.tsx` | **OBSOLETA e pior** — a branch apaga o fallback `useDashboardWidgets()`; a main mantém o fallback **e** o pai já passa a prop | `main:27-29`; `DashboardView.tsx:307` passa `visibleWidgets={widgetConfig.visibleWidgets}` |
| `src/components/dashboard/useSentimentData.ts` | **INCORPORADA** | `main:146` (`setFetchError`), `main:234` retorna `error`/`isError`/`incomplete`; consumidor já lê tudo em `SentimentAlertsDashboard.tsx:14` |
| `src/components/gamification/__tests__/AchievementToast.test.tsx` | **INCORPORADA** — helper equivalente e mais completo | `main:122-131` `entregarConquistas()` (mesma ideia: conquista chega pelo aumento de `agent_stats.achievements_count`) |
| `src/components/security/AuditLogDashboard.tsx` | **INCORPORADA** — a main refez por hook: contagens no servidor, janelas 24h/7d, nomes de usuário, desempate por `id`, erro → "—" | `origin/main:src/hooks/security/useAuditLogDashboard.ts:12,113,153-154,167`; `AuditLogDashboard.tsx:70,105,110-114`. **Único resto**: a sub realtime de `audit_logs` para recontar os KPIs (valor baixo) |
| `src/components/talkx/TalkXSegments.tsx` | **INCORPORADA** — e a main vai além | `main:745` `describeRule`, `main:781` "Principais critérios", `main:794` "Recontar público", `main:790-792` campanha desabilitada em segmento inativo, `main:763` texto de origem, `main:95-107` `closePanel` com `selectedRowRef.focus()` + Esc, `main:88-94` escolhe a versão mais fresca entre cache e seleção (resolve melhor o que a branch tentava com `selectedId`) |
| `src/components/talkx/segments/TalkXSegmentBuilder.tsx` | **INCORPORADA** — o Esc com guarda de "não salvo" existe, no pai | `TalkXSegments.tsx:260-271`: Esc com `activeEditing` chama `builderGuardRef.current(closeBuilder)` — mesma semântica do `requestExit` da branch |
| `src/components/ui/__tests__/VolumeDial.test.tsx` | **INCORPORADA** — mesma técnica (rect centrado na origem, clique em `(0,-100)` = 50%) | `main:100-107` |
| `src/hooks/business/useWarRoomData.ts` | **OBSOLETA e contrária** — a branch engole o erro das RPCs e devolve agentes/filas zerados. A main **propaga** o erro de propósito, porque o WarRoom agora tem estado de erro na tela | `main:100-129` (`if (today.error) throw today.error`) + `WarRoomDashboard.tsx:126` `role="alert"` |
| `src/hooks/chat/useFilesContainerColumns.ts` | **INCORPORADA** (byte a byte) | `main:84-89` já com `}, [ref]);` |
| `src/integrations/supabase/types.ts` | **INCORPORADA** — as 9 assinaturas de RPC estão lá (regeradas pelo `types-sync`) | `grep` em `origin/main:src/integrations/supabase/types.ts` acha `admin_list_cron_jobs`, `admin_toggle_cron_job`, `app_bootstrap`, `enqueue_group_outbound_message`, `inbox_unread_total`, `search_email_threads`, `transfer_conversation`, `warroom_agent_today`, `warroom_queue_stats`; último sync `143f44afd` |
| `src/pages/__tests__/n066-a11y-combobox-progressbar.test.tsx` | **OBSOLETA** — o mock extra (`like`/`limit`/`in`) só servia ao `MediaMigrationTool` reescrito pela branch; a main acessa o banco pelo service | `main:9` mantém o mock simples |
| `src/components/inbox/chat/ChatMessagesArea.tsx` | **OBSOLETA**, valor baixo — `data-message-id` foi posto na linha virtual para um teste; na main os testes põem o atributo na própria bolha mockada | ausente em `origin/main:…/ChatMessagesArea.tsx`; presente em `__tests__/ChatMessagesArea.agrupar-envio.test.tsx:60`, `…movimento-reduzido.test.tsx:78`, `…pagination.test.tsx:77`, `ChatPanel.entrega-conversa.test.tsx:130` |

## Veredito
**OBSOLETA** — nada de valor foi perdido. Todo o trabalho útil (WarRoom, Auditoria, Talk X Segmentos,
Dashboard, `types.ts`, testes) está na `main` por implementação equivalente ou melhor; o que não está
teve o alvo apagado de propósito (o workflow), foi substituído por outra abordagem (service de mídia,
hook de auditoria, mocks de teste) ou **contradiz** a main (fallback silencioso no WarRoom, `.gitignore`
de um diretório que a main versiona, remoção do fallback da gamificação).

Branch segura para apagar.

## Resíduos (valor baixo, só se sobrar tempo — não recuperar em pacote)
1. `src/hooks/security/useAuditLogDashboard.ts` — não reassina `audit_logs` em realtime: os 4 KPIs da
   tela de auditoria só recontam ao trocar filtro/remontar. Hunk da branch (adaptar ao hook, não ao
   componente):
   ```ts
   useEffect(() => {
     const canal = supabase
       .channel('audit-logs-dashboard')
       .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => { fetchStats(); })
       .subscribe();
     return () => { supabase.removeChannel(canal); };
   }, [fetchStats]);
   ```
2. `src/components/inbox/chat/ChatMessagesArea.tsx:407` — `data-message-id={message.id}` no wrapper da
   linha virtual (gancho de depuração/E2E). Não é exigido por nenhum teste da main.

## Verificação adversarial

**Concordo: OBSOLETA. Branch segura para apagar.** `origin/main` = `dac285f62`. Os 23 arquivos do
`git diff 17976eb8b c49753c71` foram conferidos um a um (o `--stat` fecha em 23 — nada fora do dossiê).

Refutações que tentei e falharam (cada alegação da triagem foi reaberta no arquivo da main):

- **Workflow** — `git ls-tree origin/main .github/workflows/` não lista `auto-update-pr-branch.yml`;
  apagado em `41853318c` ("pacote 6", #3113). O fix da branch é 1 linha (`--jq --arg` → `| jq -r --arg`,
  linha 188): correto, mas sem alvo. Nenhum workflow equivalente nos 21 que restaram na main.
- **`.gitignore`** — `git show origin/main:.gitignore | grep analise` → vazio, e a main versiona
  `analise-prs/` (20+ arquivos). Aplicar a linha da branch destrairia o diretório. Contrária.
- **`analise-prs/RELATORIO_PRS.md`** — `origin/main:analise-prs/RELATORIO_PRS.md:1` = "sessão de
  11–12/11/2026"; o da branch é de 25/10. Superado.
- **WarRoomDashboard** — li o diff da branch inteiro e a main 40–170: dispensa otimista + rollback +
  `toast.error` (`main:52-53,83-91`), `fullscreenchange` (`main:74-78`), `aria-label` nos 3 ícones
  (`main:107-109`), `role="status"`/`role="alert"` + "Tentar de novo" (`main:114,126-134`),
  `role="log"`+`aria-live` (`main:166-168`), `motion-safe:`. Main é superior: distingue `modoProp`
  (com dados por prop não mostra carregando/erro) e usa `Skeleton` em vez de `div` pulsante.
- **`useWarRoomData`** — `origin/main:src/hooks/business/useWarRoomData.ts:103-105` (`if (today.error)
  throw today.error`) e `:152` (`if (error) throw error`) propagam de propósito, com teto
  `WARROOM_MAX_ROWS` e `null ≠ 0`. O `try/catch` da branch devolveria agentes/filas zerados e
  esconderia a falha da tela de erro. Recuperar seria regressão.
- **`AuditLogDashboard`** — `origin/main:src/hooks/security/useAuditLogDashboard.ts` faz contagem de
  servidor (`count:'exact', head:true`, :113), janelas 24 h/7 d (:200-204), `COUNT(DISTINCT)` paginado
  com `usuariosUnicosIncompleto` (:128-144), desempate por `id` (:152-155), nomes via `profiles` (:163)
  e geração anti-corrida (:191,208). Cobre e supera o `fetchStats` da branch.
- **`TalkXSegments` / `TalkXSegmentBuilder`** — `main:745` `describeRule` (com `is_set`/`is_empty`),
  `main:757` `SegmentDetailRail`, `main:781` "Principais critérios", `main:794` "Recontar público",
  `main:88-94` escolhe a versão mais fresca entre cache e seleção (resolve o que a branch tentava com
  `selectedId`), `main:95-107` `closePanel` devolve o foco à linha + Esc, `main:261-271` Esc do
  construtor via `builderGuardRef` + `onGuardChange` (`TalkXSegmentBuilder.tsx:45,127,131`). Main vai
  além (favorito, `data-testid="segment-card"`, Enter/Espaço na linha).
- **Mídia** — `origin/main:src/services/mediaMigration.service.ts:20-31` (`countPendingMedia`, mesmos
  prefixos) e `:33-62` (`fetchMigrationHistory`, `audit_logs` action=`media_migration`, `HISTORY_LIMIT`
  10, join em `profiles`); componente na main com 328 linhas, `role="status"`/`aria-live`, `toast`,
  `invokeEdge` (:97). O hook `useMediaMigrationData` da branch é subconjunto. Âncoras conferidas:
  `ESTADO.md:98` → `MediaMigrationTool.tsx:97` = a linha real do `invokeEdge('migrate-media-storage')`;
  `FEATURE_REGISTRY.md:79` aponta `src/lib/invokeEdge.ts` (correto, o hook da branch não existe).
- **Dashboard / sentimento / gamificação** — `DashboardView.tsx:119-120` (`from`/`until` na RPC),
  `:184` (`filters` só na aba overview), `:217` (título segue o período), `:225` (aviso refinado, não
  removido); `useSentimentData.ts:92,146,234` (`error`/`isError`); `GamificationSection.tsx:27-29`
  mantém o fallback `useDashboardWidgets()` **e** `DashboardView.tsx:307` passa a prop — a branch
  apagava o fallback.
- **Testes** — `VolumeDial.test.tsx:100-107` usa a mesma técnica (rect na origem, `clientY:-100` = 50%);
  `AchievementToast.test.tsx:122-131` tem `entregarConquistas()` variádico (mais completo que o
  `entregarConquista` da branch); `icon-buttons-baseline.json` sem nenhuma entrada de `WarRoomDashboard`;
  `useFilesContainerColumns.ts:80-88` idêntico; `types.ts` tem as 9 assinaturas (`admin_list_cron_jobs`
  :12422 com `last_run_at`/`last_status`/`last_return_message`, `transfer_conversation` :15353, etc.) —
  arquivo **gerado** pelo `types-sync`, recuperar à mão seria errado.

Resíduos reconfirmados (ambos valor **baixo**, nenhum ≥ médio — não mudam o veredito):
1. `useAuditLogDashboard.ts` — a sub realtime de `audit_logs` **nunca existiu na main** (conferido em
   `025d0258d^` e `025d0258d`: sem canal antes e depois) e **nunca existiu no merge-base** — é trabalho
   só da branch, não removido de propósito. Mas o hunk, como está, dispara 4 contagens + 1 leitura
   paginada de 7 dias **por INSERT**, sem debounce, numa tabela que grava toda ação sensível: aplicá-lo
   cru é tempestade de query. Só valeria adaptado (debounce/throttle). O componente da main também não
   expõe o `recarregar` que o hook já devolve (`AuditLogDashboard.tsx:70`) — caminho mais barato se o
   dono quiser atualizar sem remontar.
2. `ChatMessagesArea.tsx` `data-message-id` — sem consumidor: `git grep data-message-id origin/main --
   src e2e scripts` só acha o atributo em bolhas **mockadas** dentro de testes (12 ocorrências, todas
   em `__tests__/`). Nenhum E2E depende.

Segurança da deleção: PR #2211 está **closed** (31/10, `merged_at: null`), fechada pelo próprio dono
como duplicata — "auto-update-pr-branch e settings-guard estão cobertos pela PR #2354". Nenhuma PR
aberta aponta para `claude_05/zen-feynman-29b7ix`.
