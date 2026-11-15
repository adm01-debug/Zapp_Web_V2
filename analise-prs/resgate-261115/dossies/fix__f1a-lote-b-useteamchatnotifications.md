# Dossiê — fix__f1a-lote-b-useteamchatnotifications (PR #2080)

- Ref: `origin/fix/f1a-lote-b-useteamchatnotifications` (tip `ee3d010db`, base `9d65fed62`, 2026-10-18)
- PR #2080 fechada 2026-11-01 sem merge. Comentário de fechamento alegou "main já mantém preferências em refs; diferença restante é só prettier" — **só cobre 1 das 3 causas da PR**.
- Pré-classificação: MISTO_CONFLITO · triagem 2026-11-08: JA_NA_MAIN (parcialmente errada).

## Propósito (3 causas no mesmo hook, corpo da PR)
1. HZ5-09 — canal realtime recriado a cada mudança de volume/preferência (deps do efeito) + falta de `uniqueRealtimeTopic` no nome do canal.
2. PE-75 — aviso de desktop saía por `usePushNotifications.showNotification` (exige Service Worker, desligado) → troca por `showBrowserNotification`.
3. HZ5-09 — participação na conversa sempre ia ao banco (`team_conversation_members`) em TODO INSERT de `team_messages`; passa a ler o cache do inbox (`queryKeys.inbox(profile.id)`, campo `members[].is_muted`) e só consulta o banco quando a conversa não está em cache.

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência na main |
|---|---|---|---|
| `src/hooks/chat/useTeamChatNotifications.ts` | deps só `[profile]`, prefs por ref | **INCORPORADA** (forma diferente: `notifSettingsRef`/`isQuietHoursRef`) | `origin/main:…useTeamChatNotifications.ts:28-35,93-94,140` |
| idem | `uniqueRealtimeTopic` no canal | **INCORPORADA** | `:9` import; `:47 .channel(uniqueRealtimeTopic('team-chat-notifications'))` |
| idem | `showBrowserNotification` + remoção de `usePushNotifications` | **INCORPORADA** (main ainda melhor: `onClick` navega com `{ cid }`) | `:5` import; `:126-130`; `git grep usePushNotifications origin/main -- src/hooks/chat/useTeamChatNotifications.ts` = 0 |
| idem | `membershipError` → `log.warn` + `return` | **INCORPORADA** | `:72-81` |
| idem | leitura do cache do inbox antes de ir ao banco (`useContext(QueryClientContext)`, `queryKeys.inbox`, `getQueryData`) | **PERDIDA** | `git log -S'getQueryData' origin/main -- src/hooks/chat/useTeamChatNotifications.ts` = vazio (nunca entrou). Main vai ao banco em todo evento (`:72-77`). Cache ainda existe com a forma esperada: `src/hooks/team-chat/useTeamConversations.ts:16` (`queryKey: queryKeys.inbox(profile?.id)`), `:57,:97` (`members` por conversa), `teamChatTypes.ts:78-84` (`TeamMember.profile_id`, `is_muted`) |
| `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx` | mock de `Notification` em vez de `usePushNotifications` | **INCORPORADA** (main mocka `@/utils/notificationSounds.showBrowserNotification`, `:61-66`, assert `:153`) | equivalente |
| idem | asserts "não vai ao banco quando a conversa está em cache" (`not.toContain('team_conversation_members')`) | **PERDIDA / invertida** | commit `61a973da6` (#2182, 2026-10-21) trocou os 3 asserts para `toContain` e injetou `h.membership` para o CI passar — os títulos dos testes (`:156 'não notifica nem vai ao banco…'`, `:178 'silencia conversa mutada ainda que esteja em cache'`) contradizem o que afirmam hoje |
| ambos | prettier (vírgulas finais, quebras) | **nenhum valor** | só formatação |

## Veredito: PERDIDA_PARCIAL (confiança alta)
Causas 1 e 2 estão na main. Causa 3 (cache do inbox) nunca entrou e ainda se aplica: a cada mensagem de equipe inserida, **cada cliente conectado** faz um SELECT em `team_conversation_members` mesmo com a conversa já carregada no inbox. Valor médio (carga de banco/latência do alerta, não bug visível).

`apagar_branch_seguro = false` até a causa 3 ser portada (ou o dono descartar a otimização).

## Lacuna a recuperar — hunks essenciais (adaptar à forma atual da main)

### `src/hooks/chat/useTeamChatNotifications.ts`
Imports:
```ts
import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/team-chat/queryKeys';
```
No corpo do hook (junto dos refs HZ5-09 já existentes na main `:28-35`) — guardar o client em ref para não entrar nas deps `[profile]`:
```ts
  // `useQueryClient()` lançaria sem `QueryClientProvider` — listener no nível do app (TC-007);
  // cache é só otimização: sem provider cai para a consulta direta.
  const queryClient = useContext(QueryClientContext);
  const queryClientRef = useRef(queryClient);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);
```
Substituir o bloco da main `:68-82` (consulta direta) por:
```ts
          // HZ5-09: o inbox já carrega `members` (com `is_muted`) de cada conversa no
          // cache (`queryKeys.inbox`) — quando a conversa está lá, sem ida ao banco.
          type ConversaEmCache = {
            id: string;
            members: Array<{ profile_id: string; is_muted: boolean }>;
          };
          const inboxCache = queryClientRef.current?.getQueryData<ConversaEmCache[]>(
            queryKeys.inbox(profile.id)
          );
          const conversaEmCache = inboxCache?.find((c) => c.id === msg.conversation_id);

          let membership: { id: string; is_muted: boolean | null } | null;
          if (conversaEmCache) {
            const membro = conversaEmCache.members.find((m) => m.profile_id === profile.id);
            membership = membro ? { id: msg.conversation_id, is_muted: membro.is_muted } : null;
          } else {
            const { data: membershipRows, error: membershipError } = await supabase
              .from('team_conversation_members')
              .select('id, is_muted')
              .eq('conversation_id', msg.conversation_id)
              .eq('profile_id', profile.id)
              .limit(1);
            if (membershipError) {
              log.warn('Falha ao confirmar participação na conversa; sem notificação:', membershipError.message);
              return;
            }
            membership = membershipRows?.[0] ?? null;
          }
```
Atenção: `useTeamConversations.ts:57` monta `members` com `TeamMember[]` (tem `profile_id` e `is_muted`), mas `TeamConversation.members` é opcional (`teamChatTypes.ts:73`) — usar `conversaEmCache.members ?? []` ao portar.

### `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx`
Reverter o que `61a973da6` fez nos 3 testes de cache (`:156`, `:178`, e o primeiro "notifica sem ir ao banco quando o cache diz que é membro"):
```diff
-    expect(h.fromTables).toContain('team_conversation_members');
+    expect(h.fromTables).not.toContain('team_conversation_members');
-    h.membership = [];                           // teste "não é membro" (cache)
-    h.membership = [{ id: 'm1', is_muted: true }]; // teste "mutada em cache"
```
Manter o teste "cai para o banco quando a conversa não está em cache" (`toContain`) e o de `permission denied`.

## Dependências
Nenhuma de banco/edge/workflow. Só front: `@tanstack/react-query` (já no projeto), `queryKeys.inbox` (já existe).

## Verificação adversarial

Parecer: **CONCORDA** com PERDIDA_PARCIAL. Tentei refutar por dois lados (lacuna já na main / lacuna removida de propósito / lacuna não encaixa mais) e as três tentativas falharam.

### 1. A lacuna NÃO está na main (confirmado lendo o arquivo, não o JSON)
`origin/main:src/hooks/chat/useTeamChatNotifications.ts:186-196` consulta o banco em **todo** INSERT de `team_messages`, sem nenhuma leitura de cache antes:
```
186  const { data: membershipRows, error: membershipError } = await supabase
187    .from('team_conversation_members')
188    .select('id, is_muted')
```
- `git grep -n "QueryClientContext\|getQueryData\|queryKeys.inbox" origin/main -- src/hooks/chat/useTeamChatNotifications.ts` = **0 ocorrências** (o arquivo da main nem importa `useContext`; linha 1: `import { useEffect, useRef, useSyncExternalStore } from 'react';`).
- Branch tem o caminho de cache em `:196-233` (`queryClient?.getQueryData<ConversaEmCache[]>(queryKeys.inbox(profile.id))` → `conversaEmCache.members.find(...)`, banco só no `else`).

### 2. NÃO foi removida de propósito — nunca entrou
- `git log -S'getQueryData' --oneline origin/main -- src/hooks/chat/useTeamChatNotifications.ts` = **vazio**
- `git log -S'QueryClientContext' … ` = **vazio**
- `git log -S'queryKeys.inbox' … ` = **vazio**
Nenhum commit da main jamais teve essas strings nesse arquivo; não há commit de `revert`/`remove` sobre a otimização. Os 12 commits do arquivo (de `76d4c778f` a `cb6576b2a`) não a tocam.

### 3. As causas 1 e 2 estão mesmo na main (triagem correta ao não reivindicá-las)
- refs HZ5-09: `:144-149` (`notifSettingsRef`/`isQuietHoursRef`), deps `:254 }, [profile]`
- tópico único: `:9` import, `:161 .channel(uniqueRealtimeTopic('team-chat-notifications'))` — forma **melhor** que a da branch (`'team-chat-notifications' + uniqueRealtimeTopic('')`, branch `:168`)
- PE-75: `:5` import `showBrowserNotification`, `:240-244` com `onClick: () => navigateToView('team-chat', { cid: msg.conversation_id })` — **melhor** que a branch (`:287-290` navega sem `cid`)
- `membershipError` → `log.warn` + `return`: `:192-195`

### 4. Teste invertido — confirmado no diff do commit, não só por leitura
`git show 61a973da6 -- …canal-estavel.test.tsx` (Wed Oct 21 23:01:36 2026, #2182, "6 insertions, 3 deletions"):
```
-    expect(h.fromTables).not.toContain('team_conversation_members');
+    expect(h.fromTables).toContain('team_conversation_members');
+    h.membership = [];
-    expect(h.fromTables).not.toContain('team_conversation_members');
+    expect(h.fromTables).toContain('team_conversation_members');
+    h.membership = [{ id: 'm1', is_muted: true }];
-    expect(h.fromTables).not.toContain('team_conversation_members');
+    expect(h.fromTables).toContain('team_conversation_members');
```
Hoje na main o teste `:145 'usa a associação do cache do inbox sem consultar o banco'` afirma em `:152` exatamente o contrário do próprio título. Idem `:156`/`:164` e `:178`/`:187`. Os 6 títulos de `it()` são **idênticos** nas duas versões — a main manteve a documentação do comportamento e jogou fora o comportamento.

### 5. A lacuna ainda encaixa na main (APIs existem)
- `origin/main:src/hooks/team-chat/queryKeys.ts:21-24` — `inbox(profileId)` → `['team-conversations', profileId]`
- `origin/main:src/hooks/team-chat/useTeamConversations.ts:16` usa essa chave; `:57` monta `members` como `TeamMember[]`; `:97` grava `members` na conversa
- `origin/main:src/hooks/team-chat/teamChatTypes.ts` — `TeamMember.profile_id` e `TeamMember.is_muted: boolean` existem; `TeamConversation.members?` é **opcional** (confirmado) → usar `conversaEmCache.members ?? []` ao portar, como o dossiê já alerta
- `@tanstack/react-query` já é dependência (`useTeamConversations.ts:2`)

### Ressalva ao portar (não muda o veredito, muda o cuidado)
Ler `is_muted`/participação do cache introduz janela de staleness: `useTeamConversations` usa `staleTime: 10000` / `refetchInterval: 30000`, e as invalidações de `queryKeys.inbox()` (`useTeamChatMutations.ts:122,145,162,…`, `useTeamChatMembers.ts:44`) rodam no **cliente que agiu**, não nos outros. Consequência possível por até ~30s no cliente que não agiu: recém-adicionado a uma conversa não recebe alerta (cache diz "não é membro"), ou conversa mutada em outro dispositivo ainda alerta. `useTeamConversations.ts:115-121` invalida por realtime e reduz a janela. Portar mantendo os 3 testes de cache honestos (`not.toContain`) e, se o dono preferir conservadorismo, tratar só o caso "é membro e não mutado" pelo cache e cair para o banco nos demais.

### Conclusão
Nenhuma prova de que a main cobre a causa 3. Veredito mantido: **PERDIDA_PARCIAL**, `apagar_branch_seguro = false`. Lacunas da triagem (hook + reversão dos asserts) estão corretas e completas — não achei hunk adicional de valor ≥ médio fora delas (o resto do diff é prettier e duas regressões da branch frente à main: nome do canal e `onClick` sem `cid`, que **não** devem ser portadas).
