# Paridade V3 -> V2: hooks S-Z, fatia 02 (prefixo HZ3)

Fatia: 14 hooks. V3 em `~/projetos/Zapp_Web_V3/src/hooks`, V2 em `~/hermes-workspaces/Zapp_Web_V2/.integrador/src`. Só leitura. O banco foi consultado por `docker exec ... psql` no conjunto `v2-integrador` (a CLI `zapp-db-local psql` exige a pasta da cópia como argumento) e pelo `supabase/schema-manifest.json` (retrato da produção).

## Resumo

| Hook V3 | Onde está na V2 | Classe |
|---|---|---|
| useTeamChatNotifications | `hooks/chat/useTeamChatNotifications.ts` + `components/team-chat/TeamChatNotificationsListener.tsx` | V2-MELHOR (+ HZ3-001, B) |
| useTeamMemberDetails | `hooks/team-chat/useTeamMemberDetails.ts` | V2-MELHOR em segurança; LACUNA M (HZ3-002) |
| useTeamPermissions | inline em `components/agents/ConfigurePermissionsDialog.tsx` | EQUIVALENTE (HZ3-003, B) |
| useTextToSpeech | `hooks/communication/useTextToSpeech.ts` | V2-MELHOR em ciclo de vida; DECISÃO (HZ3-004) |
| useTheme | `hooks/ui/useTheme.ts` | V2-MELHOR (timers) (HZ3-005, B) |
| useThemeAudit | ausente | MORTO (HZ3-006) |
| useTranscriptionNotifications | `hooks/communication/useTranscriptionNotifications.ts` | V2-MELHOR; riscos M (HZ3-007) |
| useTypingPresence | `hooks/chat/useTypingPresence.ts` | V2-MELHOR (HZ3-008, B) |
| useUIInteractionManagement | partido em `hooks/ui/*` | EQUIVALENTE; bug herdado B (HZ3-009) |
| useUIManagement | `hooks/ui/useTheme.ts`, `useZenMode.ts`, `useAmbientColor.ts` | EQUIVALENTE |
| useUndoableAction | `hooks/system/useUndoableAction.ts` | V2-MELHOR (HZ3-010) |
| useUniversityHelp | `hooks/ui/useUniversityHelp.ts` | V2-MELHOR (HZ3-011) |
| useUrlFilters | `hooks/system/useUrlFilters.ts` | V2-MELHOR; resíduo de tags JÁ-COBERTO (HZ3-012) |
| useUserSecurityAlerts | inline em `components/security/SecurityOverview.tsx:92` | LACUNA A/M de RLS (HZ3-013) |

Achados que merecem cartão (os demais estão como conferido):
1. HZ3-013 (A/M): usuário comum não lê os próprios `security_alerts`. A tela de Segurança diz "sem atividades suspeitas" sem nunca poder mostrar nada.
2. HZ3-007 (M): a notificação de transcrição depende de `REPLICA IDENTITY FULL` em `messages`. O cartão SL-104 caminha para `DEFAULT`. Além disso, todo admin recebe aviso de toda transcrição.
3. HZ3-002 (M): a seção "Próximos Aniversários" do Team Chat ficou morta por design (o `birthday` saiu do contrato seguro) e a tela continua mostrando "Nenhum aniversário cadastrado".
4. HZ3-004 (DECISÃO): o TTS da V2 envia o texto da mensagem à ElevenLabs. A V3 usava Web Speech e nada saía do navegador.

---

## HZ3-001 useTeamChatNotifications

**V3 (de fato):** `hooks/useTeamChatNotifications.ts` é só um re-export de `useTeamChatNotificationsManagement` (`hooks/useNotificationManagement.ts:357`). Esse hook:
- assina `INSERT` em `zapp.app_notifications` com canal de sufixo aleatório;
- empilha TODO insert em estado local, sem filtrar por usuário nem por tipo, sem carga inicial e sem som, push, silêncio ou conversa em foco;
- expõe `markAsRead` (update `is_read`).

O doc 26 chama de "notificações de Team Chat com read tracking". Na prática é uma caixa de entrada genérica sem filtro. A V3 tinha bug: depende de RLS para não vazar notificação alheia.

**V2:** modelo completamente diferente e melhor.
- `hooks/chat/useTeamChatNotifications.ts:128-218`: escuta `INSERT` em `public.team_messages` (publicada no realtime; RLS "Members can view conversation messages" entrega só mensagens de conversas de que o usuário é membro).
- Ignora mensagem própria. Consulta `team_conversation_members` com `limit(1)` para ler `is_muted`. Aplica `shouldNotifyTeamMessage` (`lib/teamChatRules`), respeita horário de silêncio e volume do painel (`settings.soundVolume`), busca o nome do remetente e dispara push com `tag` por conversa.
- `components/team-chat/TeamChatNotificationsListener.tsx` fica no nível do app (TC-007), e a conversa em foco chega por store (`useSyncExternalStore`). A V3 só ouvia dentro de `TeamChatView`.

**Lacunas V3 -> V2:** nenhuma funcional. A V3 tinha `markAsRead` em `app_notifications`; a V2 faz leitura por `mark_team...` do inbox (cartão SL-016 `t_fa74f49b`), então EQUIVALENTE.

**Riscos/bugs V2:**
- `:182` exige `isSubscribed` (assinatura de push) além de `permission === 'granted'` para mostrar a notificação do navegador. Quem concedeu permissão mas não assinou o push fica sem aviso visual, só com som.
- Uma consulta de membership por evento recebido (o RLS já garante que é membro; a consulta só serve para `is_muted`).
- O canal `team-chat-notifications` tem nome fixo. Se houver um segundo montador, o Supabase reaproveita o canal e o `removeChannel` de um derruba o do outro. Hoje só existe o Listener global (grep: `team-chat-notifications` aparece só em `hooks/chat/useTeamChatNotifications.ts:149`). Documentar a regra de montador único.

**Classe:** V2-MELHOR. **Proposta B (MELHORIA, sev B, dono hugo):** trocar `isSubscribed` por `permission === 'granted'` quando `showNotification` puder usar o service worker local; manter o mapa de silenciadas em cache (lista do inbox já traz `is_muted`) para dispensar a consulta por evento. Arquivo: `hooks/chat/useTeamChatNotifications.ts`. Critério: teste com permissão concedida e push não assinado dispara `showNotification`; e nenhuma query a `team_conversation_members` por evento.

## HZ3-002 useTeamMemberDetails

**V3:** lê `profiles` direto (`PROFILE_FIELDS` incl. `email`, `phone`, `birthday`) para o outro membro (direct) ou para os membros do grupo/departamento (`department_id`).

**V2:** `hooks/team-chat/useTeamMemberDetails.ts` usa só a RPC `get_team_profiles` (SECURITY DEFINER, só ativos, e-mail e telefone só para admin; cartão `t_387f8842` `done`, "detalhes de colegas usam RPC segura #240-A"). Departamento: a V2 cria conversa de departamento como grupo com membership via RPC `create_team_group_conversation`, então `type === 'group'` cobre (cartão `t_f05eefd8` `done`). Ler `profiles` direto é barrado por RLS para agentes, então o código da V3 não funcionaria na V2.

**V2-MELHOR:** segurança (PII fora do navegador de agentes).

**LACUNA M (HZ3-002-A):** o contrato da RPC não traz `birthday`. `toMemberProfile` fixa `birthday: null` (`:30-44`). Consequência: `components/team-chat/TeamMemberProfileHeader.tsx:64-93` (cartão de aniversário do colega) nunca aparece, e `components/team-chat/TeamMemberDetails.tsx:95-118` ("Próximos Aniversários") sempre mostra "Nenhum aniversário cadastrado". A interface promete algo que nunca funciona. A V3 funcionava (lia `profiles.birthday`).
- **Correção proposta:** RPC nova `get_team_birthdays()` (SECURITY DEFINER, `authenticated`, só ativos) devolvendo `id, birthday_day, birthday_month` sem ano, para evitar expor a idade. Ou, se o dono decidiu esconder aniversário, remover as duas seções da UI (hoje enganam). Isto é DECISÃO do dono + implementação.
- **Perfil:** workersql (RPC/grant) + hugo (`useTeamMemberDetails`) + iris (ajuste de `getBirthdayInfo` sem ano). **Critério:** teste de componente: grupo com 2 colegas com aniversário mostra os dois ordenados por `daysUntil`; teste SQL: usuário comum não recebe ano de nascimento.
- JÁ-COBERTO? `buscar_todos` com `aniversári`/`birthday` só acha CT-039/RD-074 (contatos, não equipe) e o `t_387f8842` que causou a lacuna. Sem cartão cobrindo o Team Chat.

**Riscos V2 (B):** a RPC devolve a equipe inteira e o filtro por IDs é no cliente (`loadConversationMembers`); duas consultas (perfil direto e grupo) com chaves de cache diferentes repetem a RPC. Proposta: uma chave única `['team-profiles']` com `staleTime` de alguns minutos (já existe `useTeamProfiles` em `hooks/crm/useTeamProfiles`, reaproveitar).

## HZ3-003 useTeamPermissions

**V3:** 3 queries (`user_roles`, `permissions`, `profiles` por nome) com `staleTime` de 5 min, só para o diálogo de permissões.

**V2:** não existe o hook. `components/agents/ConfigurePermissionsDialog.tsx:21-45` faz as mesmas leituras inline (`user_roles`, `permissions`) e usa `useTeamProfiles` (RPC) no lugar de `profiles`. Grep: `useTeamPermissions` não aparece em `src` na V2. O diálogo é somente leitura nas duas versões.

**RLS V2 conferida no banco:** `user_roles` SELECT = próprio ou admin/supervisor; `permissions` SELECT = admin/supervisor. Para um agente comum, o diálogo mostra só o próprio papel e a lista "Permissões Disponíveis" vazia, e `profile.email` vem `NULL` (a RPC mascara). Isso é correto como segurança, mas a tela não avisa. Não verifiquei se `agents` é visível a agentes (`pages/ViewRouter.tsx:47` mapeia `'agents'` sem a regra de acesso; não rastreei o menu).

**Classe:** EQUIVALENTE. **MELHORIA B (hugo/iris):** extrair `useTeamPermissions` com `staleTime: 5*60_000` (queryKeys `['user-roles-overview']` e `['permissions-list']` não têm `staleTime`, refazem a cada abertura) e esconder o botão "Configurar permissões" de quem não é admin/supervisor. Critério: reabrir o diálogo em menos de 5 min não gera nova request; agente não vê o botão.

## HZ3-004 useTextToSpeech

**V3:** Web Speech API (`speechSynthesis`) local, zero rede. Voz por `voiceURI`/`name`, velocidade livre, sincroniza `initialVoiceId/Speed` quando as preferências chegam depois do mount, `cancel()` no unmount.

**V2:** `hooks/communication/useTextToSpeech.ts` chama as Edge `elevenlabs-tts` / `elevenlabs-tts-stream` (JWT via `edgeAuthHeaders`) e toca um `Audio` com volume global (`attachMediaVolume`). Tem: geração vigente (`requestIdRef`) com abort do fetch, soltura idempotente do player, velocidade limitada a 0,5-2,0 com troca ao vivo, limpeza de `[Imagem]` e troca de URL por "link", toast de erro, derivação de estado sem effect. Cartões já integram vários desses (t_5600e2d9, t_199bb4f1, t_d892b7f3). Edge: `requireAuth`, limite de 20/min por usuário, linha no ledger (`logAiUsageDetached`), log sem trecho do texto.

**V2-MELHOR:** ciclo de vida, cancelamento e custo controlado.

**DECISÃO (HZ3-004-A, sev M):** o texto da mensagem do cliente sai do sistema para a ElevenLabs. A regra do dono é "nenhuma informação sai do sistema". Aqui o texto sai a cada clique em "ouvir". Se a regra vale para mensagens de cliente, a V2 regrediu em privacidade em relação ao Web Speech da V3. Perguntar ao dono: (a) manter ElevenLabs como está; (b) voltar ao Web Speech local como padrão; (c) Web Speech como padrão com ElevenLabs só quando o agente escolher a voz premium.

**MELHORIA (HZ3-004-B, sev B, dono workeria):** fallback para `speechSynthesis` quando a Edge responde 429/5xx ou falta chave (hoje só mostra toast). Arquivo: `hooks/communication/useTextToSpeech.ts`. Critério: simular 429 e ouvir via `speechSynthesis.speak`; teste do hook com `window.speechSynthesis` mockado.

**Risco V2 (B):** `speak()` não limita o tamanho do texto no cliente. Não li o `ElevenLabsTTSSchema` para saber o teto no servidor.

## HZ3-005 useTheme (barril de `useUIManagement.useThemeManagement`)

**V3:** store global com `localStorage('theme')`, resolve `system`, ouvinte `matchMedia`, classes `light/dark` na raiz, animação de 300 ms. O doc diz "sincronização entre abas". **Não existe `storage` listener** para a chave `theme` na V3 (conferi o arquivo inteiro): é afirmação falsa do doc.

**V2:** `hooks/ui/useTheme.ts` é o mesmo código, com melhorias: cancela timers pendentes quando o último hook desmonta (evita `document is not defined` no teardown de testes) e cancela o timer de transição anterior em `setTheme`. `ThemeInitializer.tsx:25-40` ouve `storage` só para a chave do preset (`STORAGE_KEY` de presets), não para `theme`.

**Classe:** V2-MELHOR. **MELHORIA B (hugo):** ouvir o evento `storage` com `key === 'theme'` em `initializeTheme`, chamando `updateThemeState(valor, false)`, para que claro/escuro troque em todas as abas. Critério: disparar `StorageEvent('storage', {key:'theme', newValue:'dark'})` e ver `document.documentElement.classList.contains('dark')`.

## HZ3-006 useThemeAudit

**V3:** em DEV, 2 s depois do tema, varre o DOM atrás de fundos que fogem do OLED (`rgb(31,41,55)`, `rgb(17,24,39)`, `rgb(9,9,11)`), confere fonte `--font-sans` e `--primary`. Só em `import.meta.env.DEV`; consumido por `VisualValidationChecklist` e `App.tsx`.

**V2:** grep `useThemeAudit` em `src`: sem resultado. **Classe: MORTO.** É ferramenta de desenvolvimento (varre `document.querySelectorAll('*')` com `getComputedStyle`, caro). Não portar. Se quiser o efeito, o caminho é um teste e2e/visual (workertestes), já que o designer mantém os tokens. Sem cartão proposto.

## HZ3-007 useTranscriptionNotifications

**V3:** canal `transcription-notifications:<aleatório>` em `evo.evolution_messages` UPDATE; dispara quando `new.transcription` existe e `old.transcription` não. Som/navegador/toast conforme preferências e horário de silêncio. Bug A7 do doc: o sufixo aleatório e a reassinatura a cada mudança de `settings`.

**V2:** `hooks/communication/useTranscriptionNotifications.ts` escuta `public.messages` UPDATE. Gatilho: `transcription_status === 'completed'` e antes não completo, com `transcription` presente e `processedIdsRef` por id (anti-duplicidade). Busca o nome do contato, corta a prévia em 100 caracteres, aborta se o hook foi desativado durante a busca (defeito #339, teste `useTranscriptionNotifications.desativacao.test.ts`), pede permissão do navegador, tem tipo de som e volume próprios. Gate `settings.transcriptionNotificationEnabled` aplicado antes de assinar. V2-MELHOR.

**Riscos V2 (conferidos no banco):**
1. **Acoplamento com `REPLICA IDENTITY FULL` (sev M).** `public.messages` está com `relreplident = 'f'` (FULL) hoje. A guarda `oldData?.transcription_status !== 'completed'` só funciona porque `payload.old` traz todas as colunas. O cartão SL-104 (`t_122c907c`, `done`, branch `v2/t-122c907c-sl-104-2610082216deb8`) e `docs/audits/slow-queries-2026-09.md` caminham para tirar o FULL (a UPDATE de "marcar como lido" custa 551 ms). Se `messages` voltar a `DEFAULT`, `old` só traz `id`, a condição vira sempre verdadeira, e cada UPDATE seguinte de uma mensagem já transcrita (status de entrega, edição) dispara de novo o aviso uma vez por id e por sessão do navegador.
   - **Correção:** não depender de `old`. Gravar o carimbo `transcribed_at` na Edge que escreve a transcrição (cartão `t_dfe3e171`) e notificar só quando `new.transcribed_at` estiver nos últimos ~30 s, ou publicar a conclusão em outra tabela/canal (insert em `app_notifications` filtrado por `user_id`). Dono: workersql (coluna) + hugo (hook). **Critério:** teste do hook com `payload.old = {id}` e `new.transcription_status='completed'` antigo (`transcribed_at` de 1 h) NÃO notifica; com carimbo novo notifica uma vez.
   - **JÁ-COBERTO?** Não achei cartão que ligue SL-104 a este hook (`buscar_todos` com `transcription_status`/`REPLICA IDENTITY` retorna `t_c669cff5`, `t_dfe3e171`, `t_122c907c`, `t_a2d49ea1`, nenhum cita este hook).
2. **Ruído para admin/supervisor (sev M).** A política `messages_select_policy` dá SELECT total a admin/supervisor, e o realtime respeita o RLS. Todo admin recebe toast, som e notificação de navegador de TODA transcrição de TODA conversa. A V3 tinha o mesmo comportamento. **Correção:** notificar só quando o contato é do usuário (`contacts.assigned_to = meu profile`) ou a fila é minha. Obter por RPC/joined payload, ou filtrar na Edge criando a notificação. Dono hugo; critério: admin sem conversa atribuída não recebe aviso.
3. (B) O canal tem nome fixo `transcription-notifications`; dois montadores colidem. Hoje só `pages/Index.tsx` e `SoundCustomizationPanel.tsx` o usam (o painel só para prévia, conferir que não monta o hook).

## HZ3-008 useTypingPresence

**V3:** presence channel `typing-presence-<conversationId>`, `track({userId,userName,isTyping})` e auto-parada em 3 s. O aviso de "contato digitando" não existe de verdade: `isContactTyping = typingUsers.length > 0`, ou seja, presença de colega é tratada como contato.

**V2:** `hooks/chat/useTypingPresence.ts` corrige isso. Presença é só de agente (`isColleagueTyping`), e o contato digitando vem de broadcast `contact_typing` (emitido por `supabase/functions/_shared/evolution-webhook-handlers.ts`) com auto-limpeza em 5 s. Chave de presença por aba (`identidade#escopo`), dedupe de colega com várias abas, normalização de identidade de preenchimento (`'agent'`), e `ChatPanel.tsx:229` passa a identidade real (`useLoggedAgentIdentity`, cartão R2-INB-026).

**Classe:** V2-MELHOR. **B (MELHORIA, dono hugo):**
- `setTyping` não confere se o canal já está `SUBSCRIBED`; um `track` anterior à assinatura é descartado/erro silencioso (V3 chamava `track` depois do `SUBSCRIBED`). Guardar `subscribedRef` e enfileirar o último estado.
- Não há registro de `CHANNEL_ERROR/TIMED_OUT` (a V3 usava `logChannelError`); no `subscribe` só trata `SUBSCRIBED`.
- Ao desmontar com `isTyping: true`, o `track(false)` não é enviado antes de `removeChannel` (o colega vê "digitando" até o servidor expirar a presença, alguns segundos). Enviar `untrack()` no cleanup.
- **Critério:** teste do hook: `handleTypingStart` antes de `SUBSCRIBED` não perde o estado; cleanup chama `untrack`.

## HZ3-009 useUIInteractionManagement (swipe, device, aria, view transition, sidebar)

God-hook de 6 módulos. Conferi cada um contra a V2:
- **useSwipeGesture / useSwipeNavigation:** `hooks/ui/useSwipeGesture.ts`, `useSwipeNavigation.ts`: código idêntico. A V3 tem um bug: monta o indicador com `el.textContent = '<svg ...>'` (mostra o texto cru do SVG). A V2 usa `innerHTML` com string constante. **V2-MELHOR**.
- **useAriaAnnouncer:** `hooks/ui/useAriaAnnouncer.ts` idêntico (`role="status"`, `aria-live="polite"`, `#aria-route-announcer`). A V3 ainda exporta o componente `AriaAnnouncer`; a V2 não precisa dele (o uso fica em `AppShell`/`ViewRouter`). EQUIVALENTE.
- **useViewTransition:** a V2 silencia `finished/ready/updateCallbackDone` sem log de debug. EQUIVALENTE.
- **useSidebarState (collapse + favoritos, máx. 6):** `hooks/ui/useSidebarCollapse.ts` e `useSidebarFavorites.ts`, iguais. O evento `toggle-sidebar` existe nas duas. EQUIVALENTE.
- **useDeviceDetection** (`hooks/ui/useDeviceDetection.ts`), diferenças:
  - V2 revoga sessões reais por Edge `revoke-auth-sessions` (escopos `local` e `others`; cartão R2-AUTH-004 `t_2d1a0d32`), falha-fechada na remoção do dispositivo. V3 chamava `revoke-session` e marcava `user_sessions` inativas. **V2-MELHOR**.
  - V3 lista sessões pela RPC `sessions_list` (auth.sessions reais) e marca a sessão atual pelo claim `session_id` do JWT (`extractSessionIdFromToken`). A V2 lê `user_sessions` ativa e o painel marca "atual" por `session.device_id === currentDeviceId` (`DevicesPanel.tsx:66`), ou seja, por dispositivo, não por sessão. `sessions_list` não existe no banco da V2 (`pg_proc` só tem `get_team_profiles`). **JÁ-COBERTO:** `t_b4c0ae4e` ("painel de sessões usa a RPC e a sessão atual vem do JWT", `done`) e `t_fec4c503` ("lista de sessões só mostra sessões que existem", `done`). Não propor de novo; basta conferir na integração.
  - V3 seleciona `user_devices.*` incl. `city`, `country`; a V2 omite (a tabela tem as colunas, mas `detect-new-device` não as preenche e `DeviceCard.tsx` não as exibe). Cartões `t_3ad1d94f`/`t_56469d1e` tratam do `select('*')`. Sem proposta: preencher cidade/país exigiria consulta de geolocalização externa, fora da regra do dono, salvo base local.
  - V3 tem `mountedRef` para evitar setState após unmount (inócuo no React 18). Sem diferença relevante.
- **Bug herdado nas duas (HZ3-009-A, sev B, dono hugo):** `getBrowserInfo` testa `ua.includes('Chrome')` antes de Edge/Opera (Edge e Opera têm "Chrome" na UA, viram "Chrome") e `ua.includes('Linux')` antes de Android (Android vira "Linux"), `Mac` antes de iOS (iPhone tem "like Mac OS X", vira "macOS"). Resultado: a lista de dispositivos e o e-mail de novo dispositivo (Edge `detect-new-device`) mostram nome errado. Correção: testar `Edg/`, `OPR/`, `Firefox/` antes de `Chrome`; `Android`, `iPhone|iPad` antes de `Linux`/`Mac`. Arquivo: `hooks/ui/useDeviceDetection.ts` (extrair função pura `parseUserAgent` com teste). Critério: UAs reais de Edge, Android Chrome, iPhone Safari retornam `Edge`, `Android`, `iOS`.
- Impressão digital: canvas, idioma, resolução, `hardwareConcurrency`. Trocar de monitor muda a resolução e gera "dispositivo novo". Cartão `t_656037fe` (dispositivo único por usuário e impressão digital, `ready`) cobre a deduplicação do lado do banco. Sem proposta nova.

## HZ3-010 useUndoableAction

**V3:** executa a ação já (otimista), toast Sonner de 5 s com "Desfazer", `onCommit` ao fim. Bug: um segundo `execute` antes do fim sobrescreve `pendingActionRef` sem encerrar o anterior, e o botão "Desfazer" do toast velho desfaz a operação nova.

**V2:** `hooks/system/useUndoableAction.ts` corrige isso (R2-PLAT-007): identidade por operação, encerra a anterior (`toast.dismiss` + `onCommit`), o clique de um aviso velho não age. Teste `useUndoableAction.r2-plat-007.test.ts`. Único consumidor, `hooks/inbox/useInboxBulkActions.ts:108`, passa `onCommit` vazio.

**Classe:** V2-MELHOR. **Risco B:** no unmount os timers são limpos sem chamar `onCommit` nem desfazer, e o toast segue visível com "Desfazer" funcionando via ref. Hoje inofensivo porque `onCommit` é vazio. Documentar, ou dispensar o toast no cleanup se algum dia `onCommit` fizer algo.

## HZ3-011 useUniversityHelp

**V3 e V2:** mesma lógica (seleção de mensagens, tom, filtro cliente/atendente, período, 3 s de intervalo mínimo, prompt de sistema idêntico, Edge `ai-proxy`, modelo `google/gemini-3-flash-preview`).

**V2 acrescenta:** `useAiRequestGeneration` (IA-048): descarta resposta de IA em voo quando muda o contato ou o período; `requestId` para o ledger de consumo do `ai-proxy` (IA-051); contador `inFlightRef` que impede spinner preso. A V3 podia exibir resposta do contato anterior.

**Classe:** V2-MELHOR. **Risco B nas duas:** o intervalo de 3 s (`lastCallRef`) é gravado antes de a chamada ser validada e ao falhar a requisição continua bloqueando o retry por 3 s. Aceitável. O prompt manda enviar a conversa (conteúdo de cliente) ao provedor de IA via `ai-proxy`; já existente e fora do escopo desta fatia.

## HZ3-012 useUrlFilters

**V3:** status, tags, agente, de/até e busca `q` na URL (`replace: true`); `clearFilters` apaga TODOS os parâmetros (inclusive `?view=`).

**V2:** `hooks/system/useUrlFilters.ts`:
- **busca fora da URL** (um link copiado vazaria telefone/nome do contato; cartões `t_e71cb4ab`/`t_6a78aba9` N-046, `t_06f76a32`);
- `clearFilters` só apaga os parâmetros de filtro e preserva `?view=`; limpa o `?q=` legado.

**Classe:** V2-MELHOR.

**Resíduo:** ainda existe `tags` no estado da URL (`:11`, `:18`, `:45`, `:64`) e em `hooks/inbox/useInboxFilters.ts:65,79`. Tags é função EXCLUÍDA. **JÁ-COBERTO:** `t_26bbc7fe` (`done`, iris, remove tags do inbox) e `t_8bc7aee7` (`done`, hugo, remove dos hooks) e `t_957a0d3a` (`ready`, senior, "[refazer 1]"). Sem proposta nova. Na integração, conferir que `UrlFiltersState.tags` e `PARAM_KEYS.tags` saem de `useUrlFilters`.

## HZ3-013 useUserSecurityAlerts

**V3:** função async (não é hook) `fetchUserSecurityAlerts(userId)`: `security_alerts` do usuário, 5 mais recentes. Usada em `SecurityOverview`. A V3 tinha a política `security_alerts_self_select` (migration `20260804000000_canonical_schema_squash_133_migrations.sql:9966`).

**V2:** o hook não existe. A mesma consulta está inline em `components/security/SecurityOverview.tsx:92` (`.eq('user_id', user.id).order(created_at desc).limit(5)`) com melhoria: erro de leitura marca `alertsError` em vez de passar por "sem atividades suspeitas".

**LACUNA A/M (HZ3-013-A), conferida no banco e no retrato da produção:** `security_alerts` na V2 só tem 2 políticas: "Admins can manage security alerts" (ALL, `is_admin_or_supervisor`) e "Admins can insert security alerts". **Não existe política de SELECT para o dono do alerta** (`schema-manifest.json` `/policies/security_alerts` confirma só as duas). Um agente comum consulta sem erro e recebe lista vazia. A tela diz que a conta não tem atividades suspeitas, mesmo quando o `detect-new-device` (cartão N-167) e o limite de taxa gravaram alertas para ele. A proteção de conta que o painel promete não funciona para quem mais precisa.
- **Correção:** migration com `CREATE POLICY security_alerts_self_select ON public.security_alerts FOR SELECT TO authenticated USING (user_id = auth.uid());`. Sem UPDATE/DELETE para o dono (resolução continua do admin).
- **Dono:** workersql. **Arquivos:** `supabase/migrations/<novo>_security_alerts_self_select.sql`; teste SQL/RLS em `supabase/tests`.
- **Critério:** como agente A, `select` em `security_alerts where user_id = A` retorna as linhas dele e zero de B; o `SecurityOverview` do agente mostra o alerta recém-criado.
- **JÁ-COBERTO?** `buscar_todos 'security_alerts'` achou N-167 (e-mail, `t_0efdfb40`/`t_e369658a`), `t_c2f65e14` (agendadores), `t_cdd10955`/`t_499a66ad` (alerta de rate limit). Nenhum trata de leitura pelo dono. Sem cobertura.

**Risco B nas duas:** `unresolvedAlerts` conta só dentro dos 5 carregados; alerta não resolvido mais antigo some do contador. Proposta: `select('id', {count:'exact', head:true}).eq('is_resolved', false)` para o contador (hugo/iris, `SecurityOverview.tsx`).

---

## Itens FORA DO ESCOPO ou excluídos (registrados)
- Tags: `useUrlFilters` e `useInboxFilters` ainda carregam `tags`. Exclusão por decisão do dono já em cartão (HZ3-012).
- Exportar/baixar/copiar: o link com filtros na URL da V3 era um modo de compartilhar visão; a V2 tirou a busca por PII. Sem proposta.
- Envio a terceiros: `useTextToSpeech` (ElevenLabs) e `useUniversityHelp` (`ai-proxy`) mandam conteúdo de conversa a provedores. Já decisão de produto; só o TTS foi levantado como DECISÃO por ter alternativa local (HZ3-004-A).

## O que não consegui ler / verificar
- `useNotificationManagement.ts` da V3 só nos trechos da `useTeamChatNotificationsManagement` e da vizinha de segurança (não o arquivo inteiro).
- Não abri `lib/teamChatRules`, `utils/notificationSounds`, `useNotificationSettings` completo da V2, nem o `ElevenLabsTTSSchema` (teto de texto no servidor).
- Não verifiquei quem enxerga a tela `agents` (HZ3-003) nem se `SoundCustomizationPanel` monta `useTranscriptionNotifications` (HZ3-007, item 3).
- O banco consultado é o conjunto `v2-integrador` local (migrations da branch `dia`), não a produção. Para `security_alerts` confirmei também no `schema-manifest.json` (retrato da produção). Replica identity de `messages` (FULL) vale para o local; a produção não foi verificada.
- Cartões `done` não integrados (R2-AUTH-004, IA-048, etc.) foram lidos só por título/relato, não pelos diffs.
- Não rodei testes, tsc nem build.
