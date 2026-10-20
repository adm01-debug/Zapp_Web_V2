# Auditoria de paridade V3 -> V2, doc 07 (2a passada): leitura de mensagens, status WhatsApp, presença/last seen, identidade de contato

Data: 13/10/2026. Somente leitura. V3 = `origin/main` de Zapp_Web_V3; V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador`. Recorte: §2.1, §2.2, §2.3, §2.4 e achados A1, A9, A10, A11, A13, A18 do `docs/estado/07-features-inbox-services.md`.

## 0. O que o doc 07 diz e o código real da V3 desmente (importante para quem lê o doc)

O doc é de 09/08 e está defasado. Comportamento REAL na V3 (origin/main):

| Doc 07 diz | Código real V3 |
|---|---|
| `fetchMessagesByContact(contactJid, limit, before)` sobre `evolution_messages` (schema evo) | `messageRepository.ts:37-46`: `dbFrom('messages')` por `contact_id` UUID, `order created_at ASC`, `.range(from, from+limit-1)` (offset, sem cursor, sem desempate por id), com `abortSignal`. Se não for UUID devolve `[]` (`:38`). `listByContactJid` (RPC `listMessagesLite`) existe mas não é usado pelo serviço. |
| `getAllMessagesForContact(contactJid, contactId)` com sort e dedup por id | `messageService.ts:38-135`: UM parâmetro (`contactId`) + `signal`. Laço que baixa TODO o histórico em páginas de 1000 (`:52-68`), junta `whisper_messages` (só se UUID, `:75-103`), ordena por `created_at` (`:113-121`). NÃO há dedup por id (o doc errou). Erro em qualquer página derruba tudo (`:60`). Abort entre páginas (`:53`) e erro de abort não vai para o Sentry (`:128-131`). |
| realtime em `evolution_messages` | `messageRepository.ts:107-138`: canal `messages:${contactId}` em `zapp.realtime_message_fanout` (INSERT/UPDATE/DELETE com `contact_id=eq.`), payload normalizado por `normalizeMessage`. |
| `touchLastSeen(supabase, userId)`, timer deslizante | `touchLastSeen.ts:12-41`: SEM argumentos; se já há timer ou voo, ignora (não é janela deslizante); `lastWriteAt` calcula o atraso; lê `auth.getUser()`, `profiles.update({last_seen}).eq('user_id', user.id)`; erro do PATCH é logado (`:33`). |
| `useInboxHeartbeat` só em teste | `useInboxHeartbeat.ts` é o hook real (THROTTLE 240s, HEARTBEAT 180s, offline após 30s oculto, `pagehide`, `online/offline`) e escreve `profiles.online_status` + `last_seen` com `.eq('id', profileId)` (`:36-43`), ao contrário do `touchLastSeen` (`user_id`). |
| `findStatusMessages(instanceId, jid)`, `getContact(contactId)` | `whatsappStatusRepository.ts:60-90`: `getContact(phone)` por telefone, `getConnectedWhatsAppConnection` = QUALQUER conexão `connected` `limit(1)` sem ordem, `findStatusMessages(instanceName)` traz 200 registros do feed de status da INSTÂNCIA inteira e o filtro por contato é feito no navegador (`whatsappStatusService.ts:110-155`). Presença é sempre `{isOnline:false, lastSeen:null}` (`:157-161`): a "presença" da V3 é fixa. O `sendChatPresence('paused')` é enviado ao contato a cada abertura e o resultado é descartado (`:110-113`). |
| `ContactRef` com `evolution_contacts` / `rpc_get_contact` | `useFallbackContact.ts`: ramifica UUID -> `contacts.id`; JID -> `contacts.phone` -> `evolution_contacts.remote_jid`; proxy externo só com `useExternalDb`; estratégia C (contato sintético) SEMPRE (`:143-157`), com comentário de incidente (#732): sem ela a tela ficava vazia para sempre. |

Conclusão: o que vale comparar é o comportamento real acima, não o texto do doc.

## 1. Tabela de itens

Legenda: EQUIVALENTE, MELHOR_NA_V2, DECISAO, LACUNA (nova ou já coberta).

| # | Item (comportamento) | Classificação | Evidência V3 (arquivo:linha) | Evidência V2 | Cartão existente |
|---|---|---|---|---|---|
| 1 | Leitura de mensagens: paginação | MELHOR_NA_V2 | `messageService.ts:52-68` baixa tudo (while sem teto); `messageRepository.ts:41-43` offset por `.range` | `src/hooks/chat/useMessages.ts:28,114,153-197`: página 100 mais recentes + cursor `loadOlderMessages`; `src/services/chat.service.ts:32-80` ordena `created_at,id` DESC e cursor `(created_at,id)` estável (SL-099) | n/a |
| 2 | Ordenação / desempate | MELHOR_NA_V2 | `messageService.ts:113-121` só por `created_at` ASC, sem id | `chat.service.ts:42-43,70-71` `created_at,id`; merge com `Map` + sort (`useMessages.ts:123-137`) | n/a |
| 3 | Deduplicação | MELHOR_NA_V2 | V3 NÃO dedup (doc errado) | `useMessages.ts:124-129,181,209-211`: Map por id; INSERT repetido ignorado | n/a |
| 4 | Corrida realtime x refetch (overlay) | MELHOR_NA_V2 | sem equivalente | `useMessages.ts:36,77-82,129-136` overlay com geração (#310 R2-INB-013); testes `useMessages.overlay.test.tsx` | n/a |
| 5 | Estados carregando/erro/vazio/silencioso | MELHOR_NA_V2 | `useMessages` da V3 usa `getAllMessagesForContact` sem cursor | `useMessages.ts:99-102,141-150` refetch silencioso; `error`, `loading`, `loadingOlder`, `hasOlder` | n/a |
| 6 | Cancelamento por troca de contato | EQUIVALENTE (V2 por geração, não por AbortSignal) | `messageService.ts:48-54,125-131` `signal` + RCA 2026-08-21/22 | `useMessages.ts:51,86,117-119,143-148` `requestGenerationRef` descarta resposta velha; a requisição em si NÃO é abortada (`ChatService.fetchMessages` sem `abortSignal`) | PF1 (rajada de consultas ao trocar) cobre o custo |
| 7 | Reconexão do realtime | MELHOR_NA_V2 | só canal simples | `useMessages.ts:353-364` `onReconnect` refetch silencioso; `useMessages.reconexao.test.tsx` | RT1 (feito) |
| 8 | Realtime: tabela/escopo do canal | DECISAO | `messageRepository.ts:105-138` `realtime_message_fanout` (espelho não particionado da era evo) | `useMessages.ts:366-373` canal em `messages` com filtro `contact_id`; DELETE por `id` sem exigir colunas (SL-104) | n/a |
| 9 | Guarda de UUID antes de consultar | LACUNA (P2, nova) | `messageRepository.ts:38,54,82`; `useConversationActions.ts` `markAsRead` valida `isValidUUID` | `ChatService.fetchMessages` (`chat.service.ts:32`), `RealtimeService.markMessagesAsRead` (`realtime.service.ts:208`) e o fallback `.eq('id', selectedContactId)` (`useRealtimeInbox.ts:97-101`) não validam: id não-UUID (deep link, evento `open-contact-chat`) vira 400 `invalid input syntax for type uuid` e `error` na tela | nenhum |
| 10 | Sussurros (notas internas) na leitura | DECISAO / já coberto | `messageService.ts:75-103` mistura `whisper_messages` na linha do tempo | V2 mantém painel à parte `WhisperMode.tsx:291-320` (últimos 20, `refetchInterval 10s`) e contador `useWhisperCount.ts` (sem conteúdo) | WH1, WH2, WM1 |
| 11 | Sussurro: marcar como lido | LACUNA (P1, nova; confirmar no banco) | V3 não marca | `WhisperMode.tsx:342-350` faz `UPDATE whisper_messages SET is_read=true WHERE contact_id=? AND is_read=false` sem filtrar `target_agent_id` e SEM tratar erro; nas migrations só há políticas de SELECT/INSERT/DELETE para `whisper_messages` (`20260317222442:150-158`, `20260317222757:51`, `20260317223223:41`); `grep -i update` em todas as migrations que citam whisper = 0. Sem política de UPDATE o PATCH afeta 0 linhas: o selo de não lidos nunca zera, e se a política vier sem filtro o remetente marca como lido o que ele mesmo enviou | WM1 não cobre (só destino e erro do INSERT) |
| 12 | Status WhatsApp: fluxo repositório/serviço | EQUIVALENTE | `whatsappStatusService.ts:69-164` | `src/hooks/integrations/useWhatsAppStatus.ts:138-271` (mesma lógica copiada para dentro do hook; `instance_id` é o nome da instância na V2, como em `ConnectionsView.tsx:70`) | WS1 |
| 13 | Status WhatsApp: tela que consome | LACUNA já coberta | `WhatsAppStatusSection.tsx:15-61` + `StoryViewer` | hook só usado em teste (`grep` em `src`) | WS1 (t_20151931) |
| 14 | Status WhatsApp: `buildPhoneNeedles` (com/sem 55, com/sem 9) | EQUIVALENTE | `whatsappStatusService.ts:20-43` | `useWhatsAppStatus.ts:74-97` idêntico | n/a |
| 15 | Status WhatsApp: privacidade do feed (servidor devolve o feed de status da instância inteira) | LACUNA (P1, nova) | `whatsappStatusService.ts:110-155` filtra no navegador | `supabase/functions/evolution-api/index.ts:913-921` busca `status@broadcast` (200 registros) e devolve tudo; `evolution-control-authz.ts:146` classifica `find-status-messages` como READ, liberado a QUALQUER autenticado, sem checar que o usuário enxerga o contato (a regra SEND de contato não vale para READ) | WS1 só faz a tela; nenhum cartão trata o escopo no servidor |
| 16 | Status WhatsApp: efeito colateral `send-chat-presence 'paused'` | LACUNA (P2, nova; pior que a V3 só no peso) | `whatsappStatusService.ts:110-113` (resultado descartado) | `useWhatsAppStatus.ts:210-213`: cada abertura/refresh envia presença ao contato, resultado ignorado; é ação SEND (`evolution-control-authz.ts:120`) | nenhum (WS1 não manda remover) |
| 17 | Status WhatsApp: cancelamento por troca de telefone / unmount | LACUNA (P2, nova) | `useWhatsAppStatus` V3 tem `AbortController` mas ele não chega ao serviço (decorativo); `useMountedRef` | V2 só usa `mountedRef` (`useWhatsAppStatus.ts:129-136,216,263`): trocar de contato rápido deixa a resposta velha sobrescrever a nova (sem token de geração) | WS1 (incluir) |
| 18 | Status WhatsApp: escolha da conexão | EQUIVALENTE (mesma fraqueza) | `whatsappStatusRepository.ts:67-74` qualquer `connected` `limit(1)` sem ordem | `useWhatsAppStatus.ts:161-170` idem; `.eq('phone')` + `maybeSingle` falha com telefone duplicado e cai na "qualquer conexão" | WS1 (incluir: usar a conexão do contato, e dizer quando não há) |
| 19 | Presença online/offline do CONTATO | DECISAO + cartão | V3 devolve sempre `isOnline:false` (`whatsappStatusService.ts:157-161`) | cabeçalho mostra ponto neutro (R2-INB-030) | PS1 (t_ea70c782, edgar) e PS2 (t_5cca1a48, iris): presença real |
| 20 | A1: `.eq('user_id')` vs `.eq('id')` em `profiles` | DECISAO (V2 não tem esse modelo) | `touchLastSeen.ts:26-32` | `profiles` da V2 não tem `last_seen` nem `online_status` (`types.ts`: `last_seen` só em `contact_identity_map`); presença do agente é a tabela `agent_presence` com `user_id = auth.uid()` (`20260924195600_agent_presence_server_side.sql:15-37`) | n/a |
| 21 | A9: estado global de módulo (um timer por aba) | EQUIVALENTE | `touchLastSeen.ts:7-9` | `useAgentPresence.ts:30-45` store de módulo + `useSyncExternalStore`, `joinSeq` evita corrida; montado uma vez em `AppShell.tsx:57` | n/a |
| 22 | Heartbeat: periodicidade/expiração | MELHOR_NA_V2 | `useInboxHeartbeat.ts:7-9` 180s, throttle 240s; sem expirar no servidor | `useAgentPresence.ts:19-23` 25s, stale 75s no cliente; `20260925100542_agent_presence_server_ttl.sql` cron a cada 2 min marca offline após 90s | n/a |
| 23 | A11: `pagehide` / aba oculta / `online`-`offline` / cleanup condicional | LACUNA já coberta | `useInboxHeartbeat.ts:69-96,109-134` | `useAgentPresence.ts` não escuta `pagehide`, `visibilitychange`, `online/offline`; `leave()` só no logout/desmontagem (`:128-146`) | PD-91 (cobre e manda portar os testes) |
| 24 | Heartbeat: testes | LACUNA já coberta | `useInboxHeartbeat.simulacao.test.ts`, `.keepAlive.test.ts`, `touchLastSeen.simulacao.test.ts` | V2 só tem `src/hooks/crm/__tests__/useAgentPresence.test.ts` | PD-91, PD-95 |
| 25 | Privacidade de presença (quem lê `agent_presence`) | LACUNA já coberta | `profiles` RLS | `agent_presence` SELECT `USING (true)` para `authenticated` (`20260925...server_side.sql:22-26`) | PD-01 (27 tabelas de leitura aberta) |
| 26 | Sinal de "agente ausente" para reatribuição | LACUNA (P1, nova; complementa PF-09; confirmar no banco) | V3 usava `profiles.last_seen` (`touchLastSeen`) como sinal; a RPC da V3 citava coluna inexistente (`...fix_reassign_absent_agents_last_seen_at.sql:4`) | V2 definiu ausente = nenhuma `user_sessions` ativa com `last_activity_at` recente (`reassign_absent_agents`, mesma migration `:34-56`). Mas `last_activity_at` só é gravado em `detect-new-device/index.ts:253-262`, chamado por `useDeviceDetection.checkDevice` (`:102-123`), e esse hook só roda quando as telas de Segurança montam (`SecurityOverview.tsx:77`, `DevicesPanel.tsx:14`). Nada atualiza a sessão durante o uso, então quase todo agente online há mais de 30 min conta como "ausente" e o botão "Reatribuir Ausentes" (`AgentReassignmentPanel.tsx`, `WarRoomDashboard.tsx:124`) move a carteira de gente trabalhando. A presença real já existe (`agent_presence`, heartbeat 25s) e não é usada | PF-09 (t_9ba1d0c7) trata o escopo (só conversas abertas, simulação), mas aceita "sessão recente" como definição de ausente; não corrige o sinal |
| 27 | A10: aba Arquivadas ignora os outros filtros | DECISAO (V2 mais restritiva) | `inboxFilterPipeline.ts:120-121,146-153,223,314`: com `archivedTab` só busca vale; `computeInboxTabCounts` (`:349-358`) conta sempre não arquivadas | `useInboxFilters.ts:105-114`: chip Arquivadas = `conversation_status==='archived'` + fila + busca/painel; `passesExtraFilters` (`chipCounts.ts:94-154`) aplica também status/atendente/datas do painel, então um filtro de painel ativo esvazia a aba sem aviso | n/a (teste `useInboxFilters.arquivadas.test.tsx`; contagem e lista compartilham `passesExtraFilters`, MELHOR no ponto "número = tamanho da lista") |
| 28 | A10: contagem dos chips = tamanho da lista | MELHOR_NA_V2 | invariante documentada em `inboxFilterPipeline.ts:349` | `chipCounts.ts:207` mesma função para lista e contador; `chipCounts.test.ts` | n/a |
| 29 | A13: cadeia de resolução do contato selecionado | LACUNA parcial (P2, nova) | `useFallbackContact.ts:31-168`: UUID, JID->phone->`evolution_contacts`, proxy, sintético sempre; erros viram `log.warn` e a cadeia segue; `isArchived: Boolean(deleted_at)` (`:183`) | `useRealtimeInbox.ts:94-109`: só `contacts.eq('id')`; erro = `log.error` e para; contato inexistente/sem permissão = `fallbackContact` nulo, a tela mostra `InboxEmptyChat` (`RealtimeInboxView.tsx:411`) sem carregando, sem erro, sem "contato não encontrado", sem tentar de novo. Como a lista tem teto de 500 contatos (PD-74), abrir por notificação/busca global/`open-contact-chat` um contato fora da amostra cai nesse ramo | PD-73/PD-74 (lista) não cobrem; nenhum cartão cobre o estado vazio mudo |
| 30 | A13: JID/telefone como identidade (`ContactRef`, `@lid`, `@g.us`) | DECISAO | `contactRef.ts:58-86` | V2 identifica sempre por UUID de `contacts`; `@lid` resolvido por `contact_identity_map` (`20260901100003_create_contact_identity_map_e32.sql`); sem modo externo | JG1 (endereço de GRUPO para editar/reagir/apagar) |
| 31 | A13: testes do fallback | LACUNA (P2, nova) | `useFallbackContact.test.ts` (160 linhas), `contactRef.test.ts` (303) | nenhum teste do fallback de contato selecionado em `src/hooks/inbox/__tests__/` (7 arquivos, nenhum cobre o `useEffect` de `useRealtimeInbox.ts:94-109`) | PD-95 não lista |
| 32 | Marcar como lido (consumidor do `touchLastSeen` na V3) | LACUNA já coberta | `markMessagesRead.ts:16-62` (classificação de erro transitório) + `useConversationActions.ts:40-170` (debounce, otimista, retry, flush no unmount) | `realtime.service.ts:208-220` 1 UPDATE por seleção, sem retry; `useRealtimeMessages.ts:253-267` só atualiza o estado depois do sucesso | PD-91 |
| 33 | A18: mistura `dbFrom` / `supabase` | DECISAO | `whatsappStatusRepository.ts:61,68` | V2 usa `supabase` direto (sem camada `dbFrom`/datasource) | n/a (sem impacto funcional) |
| 34 | Acessibilidade da seção de status | LACUNA já coberta | `WhatsAppStatusSection.tsx` `aria-label` no botão atualizar | sem tela | WS1 (pede aria-label, teclado) |

Contagem: 34 itens. EQUIVALENTE 5 (6, 12, 14, 18, 21); MELHOR_NA_V2 8 (1, 2, 3, 4, 5, 7, 22, 28); DECISAO 7 (8, 10, 19, 20, 27, 30, 33); LACUNA já coberta por cartão 6 (13, 23, 24, 25, 32, 34); LACUNA nova 8 (9, 11, 15, 16, 17, 26, 29, 31).

## 2. Lacunas reais sem cartão (priorizadas)

### P1

**L1. Sinal de "agente ausente" nunca é atualizado (item 26)**
- O que fazer: `reassign_absent_agents` (e a escolha do substituto) deve usar `agent_presence` (status diferente de `offline` e `updated_at` recente) em vez de `user_sessions.last_activity_at`, que só muda quando alguém abre a tela de Segurança. Alternativa: um heartbeat leve que atualize `user_sessions.last_activity_at` (não recomendo: a presença já existe). Teste de banco: agente com heartbeat recente não é reatribuído; agente sem heartbeat há mais de N min é; `p_dry_run` não grava. Fazer junto do PF-09 (mesma função) para não gerar duas migrations conflitantes.
- Perfil: workersql (função SQL + teste); hugo só se mexer no painel (confirmação já pedida em outro cartão).
- Arquivos: nova migration `supabase/migrations/<ts>_reassign_absent_usa_agent_presence.sql` (CREATE OR REPLACE sobre `20260829040000_fix_reassign_absent_agents_last_seen_at.sql`), `src/hooks/crm/useAgentReassignment.ts`, `src/components/inbox/AgentReassignmentPanel.tsx`.
- Conferir no banco real: definição vigente de `reassign_absent_agents` (pode ter sido refeita na migration `20261003272707_reconcile_local_replay_with_canonical.sql`, citada no PF-09) e quantas linhas de `user_sessions` têm `last_activity_at` nos últimos 30 min.

**L2. `find-status-messages` devolve o feed de status da instância inteira a qualquer autenticado (item 15)**
- O que fazer: no servidor, aceitar `contactId` (ou `number`), validar `is_contact_visible_to_user` e filtrar `records` pelos candidatos de telefone (mesma lógica de `buildPhoneNeedles`) ANTES de responder; negar sem alvo (fail-safe, como as ações SEND). Mover o filtro do navegador para o servidor. Coordenar com WS1 (tela) para o hook passar o `contactId`.
- Perfil: edgar.
- Arquivos: `supabase/functions/evolution-api/index.ts:913-921`, `supabase/functions/_shared/evolution-control-authz.ts` (nova classe de ação "read de contato" ou mover para o resolvedor de alvo das SEND), testes Deno em `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`; `src/hooks/integrations/useWhatsAppStatus.ts`.

**L3. Sussurro "marcar como lido" sem política de UPDATE e sem filtro de destinatário (item 11; confirmar no banco)**
- O que fazer: política `FOR UPDATE` em `whisper_messages` só para quem é `target_agent_id` (coluna `is_read` apenas, via função ou `WITH CHECK`); no front filtrar `target_agent_id = meu perfil`, tratar o erro e só zerar o selo após sucesso; teste de RLS: remetente não marca o próprio sussurro como lido, destinatário marca, terceiro não.
- Perfil: workersql (política + prova) e iris/hugo (ajuste de `WhisperMode.tsx`; combinar com WM1, mesmo arquivo).
- Arquivos: nova migration `supabase/migrations/<ts>_whisper_messages_update_destinatario.sql`; `src/components/inbox/WhisperMode.tsx:342-350`; `src/hooks/chat/useWhisperCount.ts`.

### P2

**L4. Abrir contato fora da lista: estado vazio mudo (itens 29 e 9)**
- O que fazer: no efeito de `useRealtimeInbox.ts:94-109` expor estados `carregando` / `não encontrado` / `erro (tentar de novo)`; a tela mostra mensagem útil em vez de `InboxEmptyChat`; validar UUID antes de consultar (e em `ChatService.fetchMessages`, `markMessagesAsRead`), sem 400 no console; usar `deleted_at` / `conversation_status` do contato carregado para marcar arquivada no cabeçalho.
- Perfil: hugo (hook) + iris (estado de tela, se pedir componente novo).
- Arquivos: `src/hooks/inbox/useRealtimeInbox.ts`, `src/components/inbox/RealtimeInboxView.tsx`, `src/services/chat.service.ts`, `src/services/realtime.service.ts`, `src/utils/uuid.ts` (se existir).

**L5. Não enviar `send-chat-presence` ao abrir o status do contato e cancelar resposta velha (itens 16, 17)**
- O que fazer: remover o `send-chat-presence 'paused'` do hook (resultado descartado e ação SEND ao contato); guardar token de geração por telefone para ignorar resposta atrasada; escolher a conexão do contato e mostrar "sem conexão" em vez de usar uma qualquer. Pode ser absorvido pelo WS1 se o dono do cartão ler este relatório.
- Perfil: hugo.
- Arquivos: `src/hooks/integrations/useWhatsAppStatus.ts`, `src/hooks/__tests__/useWhatsAppStatus.test.ts`.

**L6. Testes do contato selecionado fora da lista (item 31)**
- O que fazer: portar os casos do `useFallbackContact.test.ts` da V3 que fazem sentido na V2 (UUID existente, inexistente, erro de rede, troca rápida de id sem corrida, lista que passa a conter o contato).
- Perfil: workertestes.
- Arquivos: `src/hooks/inbox/__tests__/useRealtimeInbox.contatoForaDaLista.test.tsx` (novo).

## 3. Já coberto (não criar cartão)

PD-91 (pagehide, aba oculta, marcar como lido em lote com retry, mensagem que chega com a conversa aberta), PD-95 (testes de presença), PD-01 (leitura aberta de `agent_presence`), PD-73/PD-74 (lista, paginação), WS1 (tela de stories), PS1/PS2 (presença real do contato), WH1/WH2/WM1 (sussurro), RT1/RT2 (realtime), JG1 (endereço de grupo), PF-09 (reatribuição por ausência/sobrecarga), PF1 (rajada de consultas ao trocar de conversa).

## 4. O que NÃO consegui verificar

- Banco real: se `whisper_messages` tem política de UPDATE criada fora das migrations versionadas (item 11); definição vigente de `reassign_absent_agents` e dados de `user_sessions.last_activity_at` (item 26); se `whisper_messages` está hoje na publicação do realtime (a migration `20260828190000` o inclui, mas a nota de `useWhisperCount.ts` diz que foi removido; o painel tem polling de 10 s, então o efeito é só latência).
- Runtime: nada foi executado. Não medi o custo real de `find-status-messages` (200 registros por chamada) nem se a Evolution GO responde (`goHistoryNotSupported` em `evolution-api/index.ts:914` indica que na GO a rota devolve erro; então em instâncias GO a seção de stories ficaria sempre vazia, mesmo com WS1 pronto).
- Se, na V2, a mensagem que chega com a conversa aberta fica sem marcar como lida (afirmado pelo PD-91; não reexecutei).
- Se existem outros chamadores de `useDeviceDetection` fora de `src/components/security` (busca por texto não achou).
- Não conferi a definição de `isArchived()` em `chipCounts.ts` contra o banco (quantos contatos têm `conversation_status='archived'`).

## 5. Atestado pós-entrega (conferência 14/10/2026 contra a `dia/2026-10-14`)

- **Stories vazio em instâncias GO: confirmado no código.** `supabase/functions/evolution-api/index.ts:914`: em instância GO (`isGoFlavor`), `find-status-messages` retorna `goHistoryNotSupported('find-status-messages')` sem consultar a Evolution. Logo, em provedor GO a seção de stories fica sempre vazia mesmo com o WS1 pronto — o vazio é "provedor não entrega", não defeito do hook (`src/hooks/integrations/useWhatsAppStatus.ts`).
