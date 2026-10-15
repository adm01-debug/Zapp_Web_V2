# Paridade V3 -> V2: doc 26, fatia HZ5 (fluxos, banco, órfãos, achados A1-A10)

Escopo: seções 2, 3, 7 e 9 de `~/projetos/Zapp_Web_V3/docs/estado/26-hooks-raiz-4.md`. Somente leitura. Data: 13/10/2026.

## 0. Método, fontes e limites

- V3 lida no código real (`~/projetos/Zapp_Web_V3/src`, `supabase/migrations`). O doc 26 está defasado em pontos que importam (ver 0.2).
- V2 lida em `~/hermes-workspaces/Zapp_Web_V2/.integrador` (último commit `96dd72dc5f`, 12/10 20:09).
- Banco: `zapp-db-local psql . <conjunto>` somente leitura.
  - O conjunto `v2-integrador` está DEFASADO: 156 tabelas, 9 crons, sem `user_sessions.auth_session_id`, apesar de a migration `20261004181921` existir no repositório. Não serve de prova de ausência.
  - Usei `v2-26101308095bf3` (182 tabelas, 11 crons, 341 funções, construído em 13/10 08:09). Confirmei que ele e o `v2-integrador` concordam em tudo que é "ausente" (as 8 tabelas V3 ausentes não existem em nenhum dos dois, nem em nenhuma migration do repositório).
  - Ele pode conter migrations de cartões ainda não integrados. Onde a diferença importa, conferi o arquivo de migration em `supabase/migrations`.
- Cartões: `buscar_todos.py` (título+corpo, não arquivados). Registro `JÁ-COBERTO:t_xxxx status`. O banco do quadro dá "database disk image is malformed" quando o Hermes grava; repeti após alguns segundos.
- NÃO rodei vitest/tsc/playwright/build.

### 0.1 Legenda
Classe: LACUNA | MELHORIA | DECISÃO | V2-MELHOR | EQUIVALENTE | MORTO | JÁ-COBERTO. Severidade A/M/B. Perfil dono conforme BRIEF.

### 0.2 Onde o doc 26 está errado (confirmado no código)
1. `useSLAMetrics` NÃO lê `conversation_sla`/`profiles` via `safeClient`: usa a RPC `rpc_sla_dashboard` (SECURITY DEFINER, relógio UTC, 'all' = 365 dias, devolve também o bloco "resolução").
2. `useScheduledMessages.ts` já traz o corpo da correção CAMPANHAS-09 (RLS e dispatcher `zapp.fn_dispatch_scheduled_messages` + cron `scheduled-messages-dispatch` existem na V3). A seção 8 ("nenhum cron/edge dispara") e o A1 estão desatualizados.
3. `useTalkX` chama as Edge `talkx-add-recipients` e `talkx-control` (existem na V3, não constam na tabela de Edge do doc).
4. `useUIInteractionManagement` chama a Edge `revoke-session` e a RPC `sessions_list`. O doc cita só `detect-new-device` e as tabelas `user_devices`/`user_sessions`.
5. `useSearchManagement` chama também a RPC `search_chat_messages`, que o doc não lista.
6. `useWarRoomAlerts` e `useSecurityAuditLogs` assinam `schema: 'zapp'`. Na V2 o schema é `public`.
7. `useTranscriptionNotifications` na V3 escuta `evo.evolution_messages`, tabela que não existe na V2 (a V2 escuta `public.messages`).
8. `useSyncToCRM` na V3 tem `isConfigured: boolean|null` via `rpc_get_crm_sync_config` com cache de 5 min. A afirmação "RPC é stub" não aparece no código lido.

---

## 1. Seção 2: fluxos ponta a ponta

### 1.1 SLA

**V3.**
- Painel: `useSLAMetrics` -> `rpc_sla_dashboard(p_period)` (SECURITY DEFINER; chama `fn_require_app_user`, não filtra por visibilidade do agente) -> JSON `{overall, byAgent}` validado por `isRPCResult`. Refetch 60 s.
- Regras: `useSLARulesCounts` (select simples em `sla_rules`) e `useSLAScopeNames` (contacts/queues/profiles com `isValidUUID`).
- Invalidação: `queryKeys.sla.*` centralizadas.

**V2.**
- `hooks/sla/useSLAMetrics.ts`: calcula no navegador a partir de `conversation_sla` com `contacts!inner(assigned_to)`, paginado por `fetchAllRows` (ordem por `id`, falha se incompleto). `tallyFirstResponse` compartilhado com o histórico (R2-SLA-001).
  - Pendente não entra no denominador.
  - Sem amostra a taxa é 0, nunca 100.
  - 'all' sem limite inferior (R2-SLA-002).
- Contagens por escopo: inline em `components/settings/SLARulesManager.tsx:12-35`.
- Nomes por escopo: inline em `components/settings/sla/ScopeRulesList.tsx:27-60`.
- RLS: `conversation_sla` SELECT = admin/supervisor OU contato atribuído a agente visível (`get_visible_agent_ids`); `sla_rules` SELECT/escrita só admin/supervisor.
- Grants: anon tem DML (ver HZ5-14).

**Diferenças.**
- V2-MELHOR: tally único com histórico; "Todos" real; pendente tratada; respeita a visibilidade por RLS (a RPC V3 é DEFINER e ignora a visibilidade do agente); sem "resolução" (fora de escopo).
- V3 melhor em: a data do período é decidida no servidor (V2 usa `startOfDay` do navegador, o que desloca o "Hoje" por fuso, mas é o dia local do usuário). Sem validação de payload (`isRPCResult`) porque não há RPC.
- V2 PIOR: `ScopeRulesList` não filtra por `isValidUUID` antes de `.in('id', ...)`: um `contact_id` inválido derruba a consulta 22P02. As contagens por escopo (`else if` exclusivas) divergem do filtro de lista de `useSLARules` (não exclusivo): uma regra com `company` + `queue_id` conta em "Empresa" e aparece nas duas abas.
- Custo: a leitura paginada baixa TODAS as linhas do período ao navegador (aba "Todos" = tabela inteira) a cada 60 s.

Classe: EQUIVALENTE com 2 itens.
- HZ5-01 MELHORIA B (hugo): extrair `useSLARulesCounts`/`useSLAScopeNames` da V3 para `hooks/sla/`, com `isValidUUID` e contagem coerente com o filtro da lista. Pronto: teste com regra `company`+`queue_id` mostra a mesma contagem na aba e no selo; `contact_id` inválido não gera chamada.
- HZ5-02 MELHORIA M (workersql+hugo): agregar o painel de SLA no servidor (RPC SECURITY INVOKER, `get_visible_agent_ids`, tally igual ao do `slaFirstResponse.ts`), parâmetro de fuso `America/Sao_Paulo`. Pronto: "Todos" com 50k linhas faz 1 chamada pequena; números idênticos aos atuais (teste de equivalência).

### 1.2 Mensagens agendadas e relatórios agendados

**V3 (mensagens).**
- Hook: `useScheduledMessages` com `enabled: !!user && isValidUUID(contactId)`, toast único em erro RLS (`isRlsDeniedError`), validação `scheduledAt > now` no hook, `maybeSingle`.
- Estado 'sending' no union.
- Dispatcher no banco com claim atômico.

**V2 (mensagens).**
- `hooks/chat/useScheduledMessages.ts`.
  - Lê só `status='pending'`, com faixa de datas e paginação (R2-MOD-029).
  - Erro de leitura vira `isError`, não lista vazia.
  - `refetch` exposto.
- Tabela `scheduled_messages`: RLS por `created_by` ou admin/supervisor, 4 políticas. Sem CHECK de status, sem trigger.
- No banco vivo NÃO há cron nem função que envie (`cron.job` sem `scheduled`/`dispatch`).
- Cartões `t_f23e9286` -> `t_f26645dd` -> `t_e1542b46` -> `t_0f85a8b6` (todos `done`, linhagem esgotou refazer, última entrega com pendência de CHECK de status e auditoria). JÁ-COBERTO, ainda não integrado.

**Diferenças e riscos no hook V2 (confirmados no código).**
1. Sem validação de data futura no hook (V3 tem). Conferir se a tela valida; a RLS não.
2. Sem `enabled: !!user` nem `isValidUUID(contactId)`.
3. `cancelMutation` não tem `onError` (exceção sem toast quando a RLS nega) e faz `update({status:'cancelled'}).eq('id')` SEM `.eq('status','pending')`. O criador consegue "cancelar" uma mensagem já enviada ou em envio e reescrever o histórico.
4. A RLS de UPDATE (`USING created_by...`, sem `WITH CHECK`, sem restrição de coluna/transição) deixa o criador mudar `sent`->`pending` e reenviar, ou editar `content` depois de enviada. Isso importa quando o despachante entrar.
5. A RLS de INSERT não checa que o contato é visível ao criador: dá para agendar para um contato que ele não vê (FK só). O despachante (DEFINER) enviaria.
6. Union de status sem `'sending'` (o cartão do enviador vai usar).
7. `.single()` no insert (V3 usa `maybeSingle` por causa do PGRST116).

Classe: o executor é JÁ-COBERTO (cadeia acima). Os itens 3-7 são LACUNA.
- HZ5-03 LACUNA M (workersql): trigger BEFORE UPDATE em `scheduled_messages` que só permite `pending -> cancelled` ao usuário (e edição de conteúdo/horário enquanto pendente); o despachante (service_role/postgres) faz `pending -> sending -> sent|failed`. WITH CHECK de INSERT com `is_contact_visible_to_user(contact_id, auth.uid())`. CHECK de `status`, `message_type`. Arquivos: nova migration + `supabase/tests`. Pronto: teste com papel agent mostra negado `sent->pending`, negado agendar contato invisível, cancelar pendente ok. Integrar com o cartão `t_0f85a8b6` (mesmo CHECK de status).
- HZ5-04 LACUNA B (hugo): no hook, `.eq('status','pending')` no cancelamento + `onError` com toast, `enabled` com `user` e UUID válido, data futura, `'sending'` no tipo. Arquivos: `hooks/chat/useScheduledMessages.ts` e testes.

**V3 (relatórios).**
- `useScheduledReports` (React Query, `created_by: profile.id`, formato fixo 'email').
- A V3 admite "pg_cron não existe no repo".

**V2 (relatórios).**
- `hooks/chat/useScheduledReports.ts`: estado local, edição, "Enviar agora" via Edge `send-scheduled-report`, `calculateNextSendAt` no navegador. Recalcula `next_send_at` em toda edição (um relatório diário editado às 23h só dispara amanhã às 8h; um editado às 7h dispara em 25h).
- RLS: tudo só admin/supervisor.
- Autorização da Edge: cartão `t_6c9c20f3` (done). Falha de envio não avança `last_sent_at`: `t_547a6a74`, `t_535fbc51`, `t_93d23ae3` (done).
- Cron: nenhum job no banco vivo chama `send-scheduled-report`. Cartão `t_c2f65e14` (running) "agendadores que a interface promete: relatórios, fechamento automático, limpeza" -> JÁ-COBERTO.
- Diferença de identidade: V2 grava `created_by: user?.id` (UUID do Auth) e a V3 grava `profile.id`. Existe o trigger `set_scheduled_report_config_owner` que só preenche quando nulo, então o valor do Auth fica. Sem FK, sem erro, mas o dono não bate com o resto do sistema.
- Validação de e-mail só `includes('@')`.
- Observação de regra do dono: relatório por e-mail é "envio para fora do sistema". Já existe na V2; registro como DECISÃO para o Joaquim, sem propor remoção.
- HZ5-05 LACUNA B (hugo): gravar `created_by` com `profile.id` (ou deixar o trigger preencher) e validar e-mail com regex mínima. Pronto: teste de hook.
- HZ5-06 DECISÃO B (Joaquim): relatórios agendados por e-mail x regra "nenhuma informação sai do sistema".

### 1.3 TalkX (campanhas, supressão, ao vivo)

**V3.**
- `useTalkX`: CRUD direto em `talkx_campaigns`/`talkx_recipients` + Edge `talkx-add-recipients` e `talkx-control` (pausar/retomar/arquivar). Agendado por cron `talkx-scheduler-check` (canonical) -> Edge `talkx-scheduler`.
- `useTalkXBlacklist`: SELECT com join `contacts`, INSERT com `blocked_by`, DELETE físico (`staleTime: Infinity`).
- `useTalkXCampaignLive`: polling 15 s.

**V2.**
- Máquina de estados por RPC (`transition_talkx_campaign`, `save_talkx_campaign_draft`, `replace_talkx_draft_recipients`, `claim_/complete_talkx_recipient` etc.) e triggers de imutabilidade (`enforce_talkx_campaign_mutability`).
- Cron `talkx-scheduler-1min` (vault `talkx_scheduler_url`) + Edge `talkx-scheduler`, `talkx-send`, `talkx-link`, `talkx-report`, `talkx-storage-purge`.
- Ao vivo: `useTalkXLiveChannel` com 3 assinaturas `postgres_changes` filtradas por campanha, estado `live/degraded/offline`, polling só quando degradado (15 s). Tabela `talkx_recipients` publicada sem PII (`talkx_recipients_realtime_pii_strip`).
- Supressão: `talkx_blacklist` com `phone`, `origin`, `expires_at`, `removed_at` (append-only, sem DELETE físico), `reason_code`; `talkx_recipient_is_suppressed` só `service_role`.
- RLS: blacklist só admin/supervisor (SELECT/INSERT/DELETE); campanhas por `created_by` (+ admin vê todas); destinatários pela campanha.

Classe: V2-MELHOR em tudo. Edge `talkx-add-recipients`/`talkx-control` são MORTO na V2 (substituídas por RPC).

Achados V2:
- HZ5-07 DECISÃO B (iris): `components/talkx/TalkXSuppression.tsx:649-656` exibe "Importar contatos" e "Exportar lista" desabilitados, e há tipos de evento `suppression_import/export` e rótulo "Exportação". Contraria a regra "Zapp sem importar/exportar". Remover os botões, o texto "ainda não estão disponíveis" e os dois tipos do vocabulário da trilha. Pronto: tela sem os cartões de ação e teste de snapshot.
- Realtime de `talkx_campaigns`: publicação conferida (`talkx_campaigns`, `talkx_recipients`, `talkx_segments`, `talkx_templates`, `talkx_campaign_events`).

### 1.4 Team Chat

**V3.**
- Rascunho em `localStorage['team_draft_<conv>']` (sem dono: vaza entre contas no mesmo navegador).
- Colar imagem: upload em `team-chat-files/<profile.id>/<conv>/<ts>_paste.<ext>` e URL assinada de 7 dias gravada na mensagem.
- Membros: perfis ativos com filtro `excludeId`, INSERT em `team_conversation_members`.
- Notificações via `app_notifications` (schema zapp).

**V2.**
- `hooks/chat/useTeamChatDraft.ts`: chave `zapp.teamchat.draft:<profileId>:<conv>` e remoção do legado sem leitura (V2-MELHOR). `uploadTeamMedia` devolve locator (bucket+path), sem URL assinada persistida (R2-DB-020).
- `hooks/team-chat/useTeamChatMembers.ts`: filtra membros já existentes antes do INSERT, toast de sucesso/erro.
- `hooks/chat/useTeamChatNotifications.ts`: escuta `public.team_messages` INSERT, ignora própria mensagem e conversa aberta, consulta `is_muted`, som com volume do painel, push com `tag` por conversa.
- Realtime: `team_messages` e `team_conversation_members` publicados; `team_messages` com REPLICA IDENTITY DEFAULT (INSERT não precisa de `old`).
- Storage `team-chat-files` privado; políticas: INSERT `folder[1] = current_profile_id()`; SELECT `folder[1] = auth.uid() OR admin OR membro via team_messages`; DELETE próprio `folder[1] = auth.uid()` e admin.

**Achados V2 (confirmados no banco).**
1. A política SELECT tem `tm.media_path = name` dentro de subconsulta cujo alias `p` (profiles) tem coluna `name`: `name` resolve para `profiles.name`, não para `storage.objects.name`. Fora o dono (que compara com `auth.uid()`, também errado porque o upload usa `profile.id`) e admin, ninguém lê o anexo direto. DELETE próprio compara `auth.uid()` com pasta de `profile.id`. JÁ-COBERTO: `t_5a914b66`/`t_25d85051`/`t_f1c4bc72` (R2-DB-020, "derivar de `storage.objects.name` com qualificação explícita", `done`) e `t_c174d398` (N-012, `done`). Não integrado.
2. `team-chat-files` não tem `file_size_limit` no banco: a migration `20260927270012` faz `INSERT ... ON CONFLICT DO NOTHING` sobre bucket que já existia sem limite. `uploadTeamMedia` e o fluxo de colar imagem (`useTeamChatDraft.handlePaste`) não validam tamanho; só `TeamFileUploader` valida (`MAX_TEAM_CHAT_FILE_SIZE`). Colar imagem enorme passa. JÁ-COBERTO provável: `t_b39f929f` N-010 "limite de tamanho nos buckets privados de mídia e voz" (`done`); falta o cartão confirmar que `team-chat-files` está na lista e acrescentar a checagem no colar.
3. A assinatura do canal de notificações é recriada a cada mudança de `notifSettings`/`permission`/`isSubscribed` (efeito com 8 dependências) e o nome do canal é fixo (`team-chat-notifications`). Hoje há 1 instância (`TeamChatNotificationsListener`). A consulta de associação é 1 por INSERT, apesar de a RLS do Realtime já filtrar por membro.

- HZ5-08 LACUNA M (hugo): `handlePaste`/`uploadTeamMedia` validar `MAX_TEAM_CHAT_FILE_SIZE` e tipo (usar `teamChatRules`). Pronto: teste colar imagem 60 MB recusa com toast e sem upload.
- HZ5-09 MELHORIA B (hugo): ler `notifSettings` por `ref` no listener (canal estável), `uniqueRealtimeTopic` e dispensar a consulta de associação quando `is_muted` vier do cache de conversas. Pronto: mudar volume não recria canal (teste com contagem de `channel()`).
- Confirmar no cartão N-010 (`t_b39f929f`) que o `team-chat-files` entra no limite: se não, HZ5-10 LACUNA M (workersql): `UPDATE storage.buckets SET file_size_limit=52428800 WHERE id='team-chat-files'`.

### 1.5 Segurança e WebAuthn

**V3.**
- `useSecurityAuditLogs`: `security_audit_logs` (últimas 24 h, limite 50, join `profiles`), 4 contagens KPI (negados 24 h, mudança de permissão 24 h, logins admin 7 d, falhas RLS 24 h), Realtime INSERT. A própria V3 marca a tabela como "nunca ativada em produção até 2026-08".
- `useSecurityAlerts`/`useUserSecurityAlerts`: funções async sobre `security_alerts`.
- `useWebAuthn`: 295 linhas, registro/autenticação/remoção/renomeio via Edge `webauthn` + `passkey_credentials`.

**V2.**
- Não existe `security_audit_logs`. O equivalente é `audit_logs` (SELECT só `has_role(admin)`; INSERT/UPDATE/DELETE por usuário bloqueados) lido por `components/security/AuditLogDashboard.tsx:85` (`.limit(200)`, sem Realtime, KPIs sobre 200 linhas). Cartão `t_4d66a644` (ready, workersql, RPC de resumo por período, só admin) -> JÁ-COBERTO.
- Alertas: `components/security/RateLimitRealtimeAlerts.tsx` (não resolvidos, resolve com `is_resolved/resolved_at`, sem `resolved_by`) e `SecurityOverview.tsx:90-98`.
- `hooks/auth/useWebAuthn.ts` (186 linhas): mesmas ações, com `.eq('user_id', user.id)` extra em renomear/remover.
- `passkey_credentials`: RLS por `user_id = auth.uid()` nas 4 operações. Edge `webauthn` com validação criptográfica (`t_874eb216`, `t_76e36281` done). Login por passkey (`t_5a5e526f`, `t_14915bab`, `t_4f5b387e` done). `t_b0415cc5` (todo, edgar) "passkey sem e-mail digitado, sem enumeração e com limite" cobre o login.

**Achados V2 novos.**
- HZ5-11 LACUNA A/M (workersql): `security_alerts` tem RLS só admin/supervisor (`Admins can manage security alerts` ALL e `Admins can insert`). `SecurityOverview` busca `.eq('user_id', user.id)` para QUALQUER usuário. Para agente/atendente a consulta devolve 0 linhas sem erro e a tela mostra "conta sem atividades suspeitas": falsa tranquilidade (o V3 tem o mesmo desenho, mas lá `useUserSecurityAlerts` já era "dado do próprio usuário"). Corrigir com política SELECT `user_id = auth.uid()` (somente leitura do próprio) ou RPC DEFINER `my_security_alerts(limit)`. Arquivos: migration + `components/security/SecurityOverview.tsx` + teste de RLS. Pronto: agente com alerta próprio vê; não vê o de outro; não consegue UPDATE.
- HZ5-12 LACUNA M (workersql+workerauth): `passkey_credentials` aceita INSERT e UPDATE direto do cliente (`user_id = auth.uid()`), sem passar pela Edge. O hook V2 só faz select/update de `friendly_name`/delete. Um token roubado pode cadastrar uma passkey persistente sem cerimônia de verificação no servidor (a cerimônia ainda exige prova do autenticador no login, mas `public_key` e `counter` ficam sob controle do cliente; o contador pode ser reiniciado, o que anula a proteção contra clonagem). Corrigir: remover INSERT/UPDATE de `authenticated`; `GRANT UPDATE(friendly_name)`; INSERT só `service_role` (Edge). Pronto: teste com papel authenticated nega INSERT e `UPDATE counter`; renomear continua.
- HZ5-13 MELHORIA B (iris): `AuditLogDashboard` sem Realtime nem "Atualizado há..."; a V3 invalida a lista em INSERT. `audit_logs` está na publicação. Cobrir junto de `t_4d66a644`.
- HZ5-14: privilégios do `anon` (TRUNCATE/REFERENCES/TRIGGER e DML) em ~120 tabelas, incluindo `passkey_credentials`, `user_sessions`, `security_alerts`, `scheduled_*`. JÁ-COBERTO: `t_9ad2f3a0` (done) e `t_949c75c4` (ready) "tirar TRUNCATE, TRIGGER e REFERENCES de anon e authenticated em todas as tabelas"; `t_007f8fb0`, `t_1fe716ed`, `t_6207b23f`. Verificar que o cartão também revoga DML do anon nessas tabelas (RLS protege hoje, mas é defesa em profundidade).

**Dispositivos e sessões (parte de "UI consolidada" da V3).**
- V3: `detect-new-device`, `user_devices`, `sessions_list` (RPC), `revoke-session` (Edge), `currentSessionId` extraído do JWT.
- V2: `hooks/ui/useDeviceDetection.ts` usa `user_sessions.auth_session_id` e Edge `revoke-auth-sessions` (escopos `local`/`others`), falha fechada: não remove o dispositivo se a revogação falhar. V2-MELHOR.
- V2 faltas: sem `currentSessionId`/marca "esta sessão" (a V3 tem); `loading` fica `true` para sempre se `user` for nulo (efeito só liga quando há usuário; estado inicial `true`); `trustDevice` relança erro enquanto o chamador pode não tratar.
- HZ5-15 MELHORIA B (hugo): expor `currentSessionId` (claim `session_id` do JWT) e marcar a sessão atual na lista; `setLoading(false)` quando não há usuário. Pronto: teste do hook com e sem usuário.
- Pendência de ambiente: o banco local `v2-integrador` não tem `auth_session_id`; a Edge `detect-new-device` e o hook referenciam a coluna. Reconstruir o conjunto (não é defeito de código).

### 1.6 Voz, STT, TTS

**V3.**
- `useSpeechToText`: Web Speech, `continuous` falso por padrão, `onResult` só no final, vibração 15 ms.
- `useTextToSpeech`: Web Speech (`speechSynthesis`), escolha de voz por `voiceURI`/nome.
- `useVoiceActionHandler`: navegação/filtro apenas por `toast` (nada muda de fato na lista); a busca dispara a Edge `voice-copilot-action` (`search_contacts`) fire-and-forget; loga em `voice_command_logs`.

**V2.**
- `hooks/communication/useSpeechToText.ts` (165 linhas): `continuous: true`, `onEnd`, proteção de corrida (`recognitionRef.current !== recognition`), `log.warn` no erro.
- `hooks/communication/useTextToSpeech.ts`: ElevenLabs via Edge `elevenlabs-tts`/`-stream`, cancelamento por `requestId`/`AbortController`, volume global (`attachMediaVolume`). Sem fallback para `speechSynthesis` (só `hooks/voice/playTtsAudio.ts` usa `speechSynthesis`).
- `hooks/voice/voiceActionPlan.ts` + `useVoiceAgent` (ponte): cada ação vira parâmetros de URL (`q`, `status`, `agent`, ...), anunciando só o que mudou (R2-INB-046). V2-MELHOR.
- `voice_command_logs` existe; RLS: o próprio usuário insere e lê. Log por `fetch` cru (comentário "may not be in generated types yet") em `hooks/voice/logVoiceCommand.ts`; cartão `t_9b5f097e` (ready, hugo) "limites da sessão do microfone, log com timeout, retry correto e um único `useVoiceAgent`" cobre.
- Há dois hooks `useVoiceAgent`: `hooks/communication/useVoiceAgent.ts` (336 linhas, Scribe) e `hooks/voice/useVoiceAgent.ts` (ponte de ação). Mesma exportação com semântica diferente: risco de importar o errado. `t_9b5f097e` também menciona "um único `useVoiceAgent`".
- Edge `voice-copilot-action` existe na V2 (com testes, catálogo, `voice-copilot-authz`), mas NENHUM código do front V2 a chama (`grep` no `src` só acha um comentário em `lib/postgrestFilters.ts`). O chamador provável é a ferramenta do agente ElevenLabs configurada fora do repositório. Cartões do plano de voz (`t_b8b573c3`, `t_b6eb108a`, `t_6dec2fc6`, `t_9ae66b75`, `t_2608317c`) só mexem na Edge.
- HZ5-16 DECISÃO M (workeria): confirmar quem chama `voice-copilot-action` em produção. Se for a ferramenta do ElevenLabs, registrar no `voice-agent` (`purpose: 'copilot'`) e documentar; se não houver chamador, o plano "copiloto de voz vira assistente real" fica sem entrada. Pronto: doc curto + teste de contrato do corpo `{action, params}`.
- HZ5-17 MELHORIA M (workeria): TTS com fallback local (`speechSynthesis`) quando a Edge falha, a cota do ElevenLabs acaba ou o usuário está offline. Também evita enviar o texto a um terceiro nesses casos. Pronto: teste simula 500 da Edge e fala é reproduzida localmente com toast discreto.

### 1.7 UI consolidada (swipe, sidebar, aria, view transition, tema, zen)

Conferido sem diferença relevante: `useSidebarCollapse` (mesma chave `zapp-sidebar-collapsed`, padrão recolhido, evento `toggle-sidebar`), `useSidebarFavorites`, `useAriaAnnouncer`, `useViewTransition`, `useZenMode`, `useTheme` (chave `theme`, `matchMedia`), `useSwipeNavigation`.
- V3 tem bug que a V2 corrigiu: `el.textContent = '<svg ...>'` no indicador de swipe mostra o código SVG como texto; a V2 usa `innerHTML` (V2-MELHOR).
- `useSidebarState` (agregador) e `useThemeAudit`/`VisualValidationChecklist` não existem na V2: MORTO/ferramenta de desenvolvimento (a V3 varre `querySelectorAll('*')` com `getComputedStyle` só em DEV).
- `useSwipeGesture` (V2) não tem consumidor: o gesto de responder/encaminhar está em `components/mobile/SwipeableMessage` -> MORTO.
- HZ5-18 MORTO B (hugo): remover `hooks/ui/useSwipeGesture.ts` (mais seu teste e a linha em `hooks/ui/index.ts:28`). Pronto: `grep` sem referência, build verde.
- Favoritos da sidebar (`sidebar-favorites`) e tema (`theme`) ficam por navegador, sem dono. Convenção da casa é `zapp.<area>:<userId>` (como o rascunho do chat e o histórico de busca). HZ5-19 MELHORIA B (hugo): escopar por usuário com migração do valor antigo. A coluna `user_settings.theme` existe e não é sincronizada por nenhum dos dois lados.

### 1.8 Configurações

**V3.**
- `useUserSettings`/`useSettingsManagement` com React Query + `safeClient`, campos `simulation_mode_enabled`, `global_sla_warning_minutes`, `global_sla_critical_minutes`, `global_sla_notification_message`, 5 tipos de som, `webhook_preferences`, `onboarding_steps`, `global_settings`.
- `simulation_mode_enabled` só alimenta dados fictícios em `ParticipantStatsGraph` (estatística simulada).

**V2.**
- `hooks/system/useUserSettings.ts`: `useState/useEffect`; salva só `browser_notifications_enabled, theme, language, compact_mode, tts_voice_id, tts_speed` (o som e o silêncio pertencem a `useNotificationSettings`). O banco tem os 5 tipos de som com CHECK de valores, `sound_volume` 10-100, `UNIQUE(user_id)`.
- `hooks/system/useGlobalSettings.ts` e `hooks/ui/useOnboardingChecklist.ts` (checklist derivado de `profiles`, `whatsapp_connections`, `user_settings`, `message_templates`; dispensa em `localStorage` por usuário): sem tabela `onboarding_steps`. V2-MELHOR (nada para manter).
- `webhook_preferences`: não existe na V2 nem há tela de webhooks admin (pertence a auditoria admin, não a esta fatia).
- RLS `user_settings`: próprio usuário; `global_settings`: SELECT admin/supervisor, escrita admin.

**Achado V2.**
- HZ5-20 LACUNA M (hugo): se a leitura inicial de `user_settings` falhar (erro, offline), o hook sai com `DEFAULT_SETTINGS` e `isLoading=false`; o usuário aperta "Salvar" e o `upsert` sobrescreve tema/idioma/voz/velocidade com padrões. A V3 devolve `null` e não inicializa o formulário. Corrigir: marcar `loadFailed` e desabilitar salvar com aviso e tentar de novo. Pronto: teste com leitura falhando não chama `upsert`.
- Observação: várias instâncias do hook (o próprio comentário do código admite) fazem 1 leitura cada; a V3 compartilha via cache. HZ5-21 MELHORIA B (hugo): migrar a leitura para React Query com chave `['user-settings', userId]`.

### 1.9 WhatsApp (modelos, fluxos, logs)

**Modelos.**
- V3: `useWhatsAppTemplates` + `syncFromEvolution` (Edge `evolution-templates`, que a própria V3 documenta exigir service role/cron: o navegador recebe 401, logo a sincronização nunca funcionou).
- V2: `hooks/integrations/useWhatsAppTemplates.ts` com selo "(local)" (`TEMPLATE_STATUS_SCOPE`), sem Meta. Tabela `whatsapp_templates` (SELECT autenticados, escrita admin/supervisor). V2-MELHOR/honesto. Edge `evolution-templates` e tabela `evolution_message_templates`: MORTO (não portar).

**Fluxos.**
- V3: `useWhatsAppFlows`.
- V2: consultas inline em `components/whatsapp-flows/WhatsAppFlowsBuilder.tsx:66,88,100,117` (sem hook). `whatsapp_flows` com colunas `flow_json`, `screens`, `status`, `whatsapp_flow_id`, `published_at`; RLS SELECT autenticados, escrita admin/supervisor. Cartões `t_945354b5` (done, "salvar telas confirma de verdade e Publicado não é falso") e `t_a3c004b7` (done, leitura aberta de 27 tabelas) -> JÁ-COBERTO. Linha 66 ignora `error` do select; coberto por `t_945354b5` apenas se o cartão tocou a leitura (conferir).

**Logs.**
- V3: `useWhatsAppLogs` lê `provider_message_log`, `whatsapp_cloud_webhook_pings`, `dispatch_error_logs`. A própria V3 diz "Módulo Providers: nunca ativado em produção até 2026-08".
- V2: nenhuma das 3 tabelas existe (nem em migration). Equivalentes que existem: `connection_health_logs` (admin/supervisor; `ConnectionHealthPanel`), `webhook_failures` (somente `service_role`; `MonitoringEventTimeline`), `messages.status`/erro de entrega, `talkx_delivery_log`, `multiplix_delivery_items`.
- HZ5-22 MORTO B: não portar `provider_message_log`/`whatsapp_cloud_webhook_pings`/`dispatch_error_logs`. Pendência a decidir (DECISÃO M, workermensageria): hoje o admin não tem tela para "mensagens que falharam ao sair" fora do Monitor; avaliar uma lista de `messages` com `status='failed'` por conexão sobre dados que já existem.

### 1.10 War Room e alertas

**V3.**
- `useWarRoomAlerts`: `warroom_alerts` não lidos (limite 50), filtra `alert_type` válidos, Realtime INSERT e UPDATE (canal com sufixo aleatório), push, `dismissAlert`.
- `useWarRoomData`: devolve `alerts: []` fixo.
- `useWebhookHealthAlerts`: stubs.

**V2.**
- `hooks/business/useWarRoomAlerts.ts`: consulta + Realtime INSERT (canal fixo `warroom-alerts-realtime`, schema `public`), som respeitando mudo/horário de silêncio/volume do painel, dupla sinalização em crítico, push com `requireInteraction`. Monitor de violação de SLA a cada 60 s, 1 alerta por incidente com `dedupe_key` (índice único parcial `ux_warroom_alerts_dedupe_key`, R2-MOD-074), leitura paginada.
- `components/dashboard/WarRoomDashboard.tsx:43-47` usa `realtimeAlerts` de `useWarRoomAlerts`, então a tela mostra alertas reais.
- `useWarRoomData` (V2) também devolve `alerts: [] as WarRoomAlert[]` (linha 108), mas o campo não é lido: dívida morta. Agentes: presença real via `agent_presence`; espera/risco `null` quando não medidos.
- `warroom_alerts`: RLS tudo admin/supervisor; tabela publicada; REPLICA IDENTITY FULL; coluna `dismissed_by` nunca preenchida (nem V3 nem V2).

**Diferenças (V2 pior).**
1. Sem assinatura de UPDATE: se outro supervisor dispensa o alerta, o painel só atualiza no polling de 30 s.
2. Não valida `alert_type` (cast `as 'critical'|'warning'|'info'`; um `sla_breach` da V3/Edge chega com tipo fora do union).
3. O monitor de SLA roda no navegador de quem estiver com o War Room aberto: sem ninguém na tela não há alerta (a V3 é igual, mas dependente de função de banco; ver HZ5-03/cron).
4. `dismissAlert` não preenche `dismissed_by` nem trata erro.

- HZ5-23 MELHORIA B (hugo): assinar UPDATE de `warroom_alerts`, validar `alert_type`, gravar `dismissed_by = profile.id` e `onError` no dispensar. Pronto: teste de hook com evento UPDATE removendo o alerta da lista.
- HZ5-24 MORTO B (hugo): remover `alerts` e o tipo `WarRoomAlert` duplicado de `hooks/business/useWarRoomData.ts:108` (e o export do tipo, se `WarRoomAlertRow` puder importar de `useWarRoomAlerts`). Pronto: `grep 'alerts: \[\]'` sem resultado.
- Moderação do monitor de SLA no servidor: DECISÃO M (workersql), possível junto de `t_c2f65e14` (agendadores que a interface promete). Cartões existentes do War Room (`t_6c6261a2` dedupe, `t_6ec46e56` duplicata de desconexão) já cobrem a idempotência.

### 1.11 Fluxo extra: CRM (`useSyncToCRM`)

**V3.** `sync_conversation_to_crm` não existe em nenhuma migration; a V3 trata como RPC "não implementada".
**V2.** Fila de saída: gatilho `trg_enqueue_crm_sync_from_closure` em `conversation_closures`, tabela `crm_sync_outbox`, Edge `crm-integration` ações `enqueueSync` (enfileira e processa já) e `processOutbox` (lote, exige `service`, cron ou admin). Gate `useCRMIntegrationEnabled` (`crm.integration` e cliente externo).
- Classe: V2-MELHOR, mas com um buraco real:
- HZ5-25 LACUNA A/M (edgar+workersql): NENHUM cron nem caller chama `processOutbox` e `cleanup_crm_sync_outbox` (`cron.job` sem `crm`; nenhum `cron.schedule` em migrations toca CRM). O gatilho enfileira em todo fechamento, o `enqueueSync` responde `{synced:false, queued:true, reason}` quando o CRM externo falha e nada tenta de novo; linhas ficam em `retry`/`pending` para sempre. Corrigir: `cron.schedule('crm-sync-outbox','*/2 * * * *', ...)` chamando `crm-integration` com `x-cron-secret` (padrão `talkx-scheduler-1min`) e agendar a limpeza diária. Pronto: teste de banco/cron presente e teste da Edge com fila `retry` sendo drenada. Envio ao CRM externo é feature existente; registro DECISÃO sobre a regra "nada sai do sistema" para o Joaquim, sem propor remover.

---

## 2. Seção 3: tabelas, RPCs, canais, Edge Functions e buckets

Legenda de colunas: V2 existe? (conjunto `v2-26101308095bf3`; ausência confirmada também nas migrations), RLS (`rls=t` e número de políticas), grants anon (todas as tabelas `public` herdam DML+TRUNCATE+TRIGGER+REFERENCES para `anon` e `authenticated`; só `audit_logs`, `team_conversation_members` e `conversation_analyses` estão limpas para anon; ver HZ5-14).

### 2.1 Tabelas

| Tabela V3 | V2 | RLS V2 | Observação |
|---|---|---|---|
| `sla_rules` | sim | t, 4 | só admin/supervisor lê e escreve; V3 idem |
| `conversation_sla` | sim | t, 3 | SELECT por visibilidade; INSERT/UPDATE admin/supervisor |
| `contacts`, `queues`, `profiles` | sim | t | fora desta fatia |
| `scheduled_messages` | sim | t, 4 | sem CHECK de status; sem enviador no banco vivo (HZ5-03, cadeia `t_0f85a8b6`) |
| `scheduled_reports` | sim | t, 3 | só admin/supervisor; sem cron (`t_c2f65e14`) |
| `search_insights` | AUSENTE | n/a | V3 a declara "módulo inativo/vazio"; MORTO |
| `search_history` | AUSENTE | n/a | V2 guarda histórico em `localStorage` por usuário (`zapp.search.history:<uid>`); V2-MELHOR |
| `security_alerts` | sim | t, 2 (só admin) | usuário comum não lê o próprio (HZ5-11) |
| `security_audit_logs` | AUSENTE | n/a | V3: "nunca ativada em produção"; V2 usa `audit_logs`; `t_4d66a644` (ready) |
| `audit_logs` | sim | t, 4 | SELECT só `has_role(admin)`; INSERT/UPDATE/DELETE bloqueados ao cliente; publicada em Realtime; sem anon |
| `conversation_analyses` | sim | t, 2 | SELECT/INSERT por visibilidade do contato; sem UPDATE/DELETE; sem anon |
| `user_settings` | sim | t, 3 | próprio usuário; `UNIQUE(user_id)`; 5 tipos de som com CHECK |
| `global_settings` | sim | t, 2 | SELECT admin/supervisor; ALL `is_admin` |
| `webhook_preferences` | AUSENTE | n/a | sem tela de webhooks admin; MORTO |
| `onboarding_steps` | AUSENTE | n/a | checklist derivado; V2-MELHOR |
| `tags`, `contact_tags` | ausentes no conjunto novo | n/a | função EXCLUÍDA por decisão do dono; só registro |
| `talkx_campaigns`, `talkx_recipients`, `talkx_blacklist` | sim | t (5/4/4) | detalhes na seção 1.3 |
| `team_conversation_members` | sim | t, 4 | `tcm_insert_member`: qualquer MEMBRO ou admin adiciona qualquer pessoa (igual V3); sem anon |
| `user_roles`, `permissions` | sim | t (2/2) | roles: ALL só admin, SELECT próprio ou admin/supervisor |
| `user_devices`, `user_sessions` | sim | t (5/4) | `user_sessions.auth_session_id` só na migration `20261004181921`; DML do usuário sobre `user_sessions` permitido (INSERT/UPDATE/DELETE próprio) |
| `warroom_alerts` | sim | t, 4 | + `dedupe_key`, `dismissed_by`; publicada, FULL |
| `passkey_credentials` | sim | t, 4 | INSERT/UPDATE direto do cliente (HZ5-12) |
| `whatsapp_flows`, `whatsapp_templates` | sim | t (2/3) | SELECT autenticados, escrita admin/supervisor |
| `provider_message_log`, `whatsapp_cloud_webhook_pings`, `dispatch_error_logs` | AUSENTES | n/a | V3 "nunca ativado"; MORTO (HZ5-22) |
| `evo.evolution_messages` | AUSENTE (schema `evo` não existe) | n/a | V2 notifica via `public.messages` UPDATE; V2-MELHOR (filtro `old.transcription_status`; `messages` com REPLICA IDENTITY FULL) |
| `voice_command_logs` (não listada no doc) | sim | t, 2 | usuário insere e lê o próprio |

Objetos que a V3 usa sem ter migration própria (V3 "referencia fantasma"):
- `sync_conversation_to_crm`, `get_search_insights`, `search_chat_messages`, `search_knowledge_base` (0 migrations em `supabase/migrations`). A V2 define `search_knowledge_base` (SECURITY INVOKER, `EXECUTE` só authenticated/service_role) e a tipa em `integrations/supabase/types.ts:12002`.
- `scheduled_reports_manage`: a V3 só sugere em comentário.
- `evolution_message_templates`, `rpc_get_crm_sync_config`, `sessions_list`, `rpc_sla_dashboard` existem em 1-2 migrations V3 mas nenhuma na V2 (equivalentes na V2 por outros caminhos, ver seção 1).

### 2.2 RPCs
| RPC | V3 | V2 |
|---|---|---|
| `sync_conversation_to_crm` | inexistente nas migrations | não usada; fila `crm_sync_outbox` (HZ5-25) |
| `search_knowledge_base` | sem migration, cast `as unknown` | existe e tipada: V2-MELHOR |
| `get_search_insights` | sem migration | ausente, sem tela; MORTO |
| `search_chat_messages` | sem migration | ausente; busca na conversa é no cliente sobre mensagens carregadas (`hooks/chat/useChatSearch.ts`); cartões de UI `t_15632e12`/`t_ed3292b3` (done) e `t_18059d65` (ready) tratam o aviso de limite; busca no histórico completo é DECISÃO M (workersql+hugo): RPC de busca por conversa com RLS |
| `rpc_sla_dashboard` | existe | ausente; cálculo no cliente (HZ5-02) |
| `sessions_list` | existe | ausente; substituído por `user_sessions` + `revoke_auth_sessions` |
| `rpc_get_crm_sync_config` | existe | ausente; `useCRMIntegrationEnabled` + `crm.integration` |

### 2.3 Canais Realtime
| Canal V3 | V2 |
|---|---|
| `security_audit_logs` (`zapp`) | não há; `audit_logs` publicada mas sem assinante (HZ5-13) |
| `evo.evolution_messages` UPDATE | substituído por `public.messages` UPDATE (`transcription-notifications`, com flag `desativado` contra notificação tardia) |
| `typing-presence-<conversa>` | `typing:<conversa>` (mesmo nome usado pela Edge `evolution-webhook-handlers.ts:217` para `contact_typing`); presença com chave por aba, identidade real, sem confundir colega com contato (R2-INB-026): V2-MELHOR. Canais privados/autorizados: `t_db7ea742`, `t_4312e781`, `t_325685d7` (done) -> JÁ-COBERTO; `realtime.messages` não tem política no banco vivo (o cartão `t_db7ea742` cria) |
| `warroom-alerts-realtime:<rand>` | `warroom-alerts-realtime` (fixo; uma só instância); só INSERT (HZ5-23) |
| outros V2 conferidos | `team-chat-notifications` (1 instância), `talkx-live-<id>` com `uniqueRealtimeTopic`, `sla-breaches`, `agent-presence-changes` |

### 2.4 Edge Functions
| Edge | V3 | V2 |
|---|---|---|
| `sentiment-alert` | usada | existe (`requireAuth`, rate limit 30/min por usuário+IP); `t_8ab75067` (ready), `t_bf8b0974`, `t_52d2bf85` cobrem CORS/escape/padrão. `getRecentAlerts` do hook V2 não tem chamador |
| `detect-new-device` | usada | existe; upsert por `(user_id, auth_session_id)`; `t_e369658a`/`t_0efdfb40` (e-mail com escape) done |
| `webauthn` | usada | existe, validação criptográfica (done) |
| `ai-proxy` | usada | existe (muito mais provedores) |
| `voice-copilot-action` | chamada do front | existe, sem chamador no front (HZ5-16) |
| `evolution-templates` | usada, 401 do navegador | AUSENTE; MORTO |
| `revoke-session` | usada | trocada por `revoke-auth-sessions`; V2-MELHOR |
| `talkx-add-recipients`, `talkx-control` | usadas | ausentes; RPCs `replace_talkx_draft_recipients`/`transition_talkx_campaign` |
| `send-scheduled-report` | usada | existe, sem cron (`t_c2f65e14`) |
| `crm-integration` | n/a | existe, `processOutbox` sem caller (HZ5-25) |

### 2.5 Buckets
| Bucket | V3 | V2 |
|---|---|---|
| `team-chat-files` | upload `<profile.id>/<conv>/<ts>_paste.<ext>`, URL assinada de 7 dias gravada | privado; locator canônico; políticas com defeito de qualificação (`name`) e identidade divergente (`t_5a914b66`/`t_f1c4bc72`/`t_c174d398`, done); sem `file_size_limit` no banco (HZ5-08/10); `allowed_mime_types` definido |
| Demais V2 (confirmados) | n/a | `audio-memes`, `stickers`, `custom-emojis` públicos; `avatars` público 5 MB; `audio-messages`, `whatsapp-media` privados. Limites: `t_f9419117`/`t_b39f929f` (done) |

---

## 3. Seção 7: órfãos

Doc 26 diz "zero órfãos". Na V3 isso é falso ou incompleto:
- `useWarRoomData.alerts` é sempre `[]` (campo morto).
- `useWebhookHealthAlerts` é stub (5 campos).
- `useSecurityAlerts`/`useUserSecurityAlerts` são funções, não hooks.
- `useSearchManagement` sem importador direto (só barris).

Na V2 (importadores fora de testes e barris):
- `hooks/system/useVersions.ts`: sem consumidor. JÁ-COBERTO: `t_e9a1cfe7` (ready, hugo, "remover o hook de versões de entidade sem uso").
- `hooks/ui/useSwipeGesture.ts`: sem consumidor (HZ5-18).
- `hooks/business/useWarRoomData.alerts` e `WarRoomAlert`: morto (HZ5-24).
- `useSentimentAlerts.getRecentAlerts`: sem chamador; remover a função ou usá-la (`audit_logs` só admin lê, então devolveria `[]` a outros papéis). HZ5-26 MORTO B (hugo).
- Dois `useVoiceAgent` (communication e voice): `t_9b5f097e` (ready) trata.
- `useGlobalSettings` e `useOnboardingChecklist` com consumidores reais.

---

## 4. Seção 9: A1-A10 (a V2 sofre do mesmo problema?)

| A | Problema V3 | V2 | Veredito |
|---|---|---|---|
| A1 | RLS ausente + cron inexistente em `scheduled_messages` | RLS existe (4 políticas). O enviador NÃO existe no banco vivo; a cadeia `t_f23e9286`->`t_0f85a8b6` (done, não integrada) cria. RLS/UPDATE sem máquina de estados e INSERT sem visibilidade de contato | MESMO PROBLEMA PARCIAL: JÁ-COBERTO (enviador) + HZ5-03 (estados e visibilidade) + HZ5-04 (hook) |
| A2 | `useSyncToCRM` mascara RPC stub | Não há RPC stub; `enqueueSync`+outbox funciona; erro de rede vira `queued:true` sem retentativa | V2 NÃO sofre do stub; sofre de outro: sem worker (HZ5-25) |
| A3 | `useSecurityAlerts`/`useUserSecurityAlerts` são funções com nome `use*` | Não existem; lógica inline em `RateLimitRealtimeAlerts` e `SecurityOverview` | NÃO SE APLICA; mas o dado do usuário comum é bloqueado pela RLS (HZ5-11) |
| A4 | `useWarRoomData.alerts` fixo `[]` | Mesmo campo fixo, porém não lido; o dashboard usa `useWarRoomAlerts` | Dívida morta (HZ5-24); a tela funciona |
| A5 | `useWebhookHealthAlerts` com stubs | Hook inexistente; sem tela de limiares de webhook | NÃO SE APLICA |
| A6 | RPCs sem tipagem (`as unknown`) | `search_knowledge_base` tipada (`types.ts:12002`); `get_search_insights`/`search_chat_messages` não existem | V2 NÃO sofre |
| A7 | canal com `Math.random()` pode acumular | V2 usa nomes fixos ou `uniqueRealtimeTopic`; `transcription-notifications` tem `removeChannel` no cleanup; 1 instância por hook | NÃO SOFRE hoje; risco latente se duas instâncias montarem um nome fixo (`team-chat-notifications`, `warroom-alerts-realtime`, `transcription-notifications`); ver HZ5-09 |
| A8 | crons de TalkX e relatórios a confirmar | TalkX: cron `talkx-scheduler-1min` presente no banco. Relatórios: sem cron (`t_c2f65e14` running). Mensagens agendadas: cadeia acima. CRM outbox: sem cron (HZ5-25) | PARCIAL; 2 cobertos por cartão, 1 novo |
| A9 | 14 barris de re-export | V2 espalha por pasta e `index.ts`; sem consolidação "god-hook"; 2 hooks com o mesmo nome (`useVoiceAgent`) | NÃO é problema; V2 evita os god-hooks. Único ponto: nome duplicado |
| A10 | `safeClient` sobre tabelas possivelmente inexistentes | V2 não usa `safeClient` nem essas tabelas; usa `connection_health_logs`/`webhook_failures` | NÃO SE APLICA (HZ5-22) |

---

## 5. Resumo de cartões propostos (HZ5-xx)

| Id | Classe | Sev | Perfil | Resumo |
|---|---|---|---|---|
| HZ5-01 | MELHORIA | B | hugo | contagens/nomes de escopo de SLA com `isValidUUID` e contagem coerente |
| HZ5-02 | MELHORIA | M | workersql+hugo | painel de SLA agregado no servidor |
| HZ5-03 | LACUNA | M | workersql | máquina de estados e visibilidade em `scheduled_messages` (junto de `t_0f85a8b6`) |
| HZ5-04 | LACUNA | B | hugo | hook: cancelar só pendente, `onError`, `enabled`, data futura, `'sending'` |
| HZ5-05 | LACUNA | B | hugo | `created_by` e e-mail do relatório agendado |
| HZ5-06 | DECISÃO | B | Joaquim | relatório por e-mail x regra de nada sair |
| HZ5-07 | DECISÃO | B | iris | tirar Importar/Exportar da supressão do TalkX |
| HZ5-08 | LACUNA | M | hugo | tamanho/tipo ao colar imagem no chat de equipe |
| HZ5-09 | MELHORIA | B | hugo | canal de notificações do chat de equipe estável |
| HZ5-10 | LACUNA | M | workersql | `file_size_limit` de `team-chat-files` (condicional ao `t_b39f929f`) |
| HZ5-11 | LACUNA | A/M | workersql | usuário comum lê os próprios `security_alerts` |
| HZ5-12 | LACUNA | M | workersql+workerauth | `passkey_credentials`: sem INSERT/UPDATE direto do cliente |
| HZ5-13 | MELHORIA | B | iris | Realtime no painel de auditoria (junto de `t_4d66a644`) |
| HZ5-14 | JÁ-COBERTO | - | - | grants do anon: `t_9ad2f3a0`, `t_949c75c4` |
| HZ5-15 | MELHORIA | B | hugo | sessão atual marcada, `loading` sem usuário |
| HZ5-16 | DECISÃO | M | workeria | quem chama `voice-copilot-action` |
| HZ5-17 | MELHORIA | M | workeria | fallback local de TTS |
| HZ5-18 | MORTO | B | hugo | remover `useSwipeGesture` |
| HZ5-19 | MELHORIA | B | hugo | favoritos/tema escopados por usuário |
| HZ5-20 | LACUNA | M | hugo | não salvar configurações se a leitura falhou |
| HZ5-21 | MELHORIA | B | hugo | `useUserSettings` em React Query |
| HZ5-22 | MORTO/DECISÃO | B/M | workermensageria | não portar tabelas de log de provedor; lista de envios falhos |
| HZ5-23 | MELHORIA | B | hugo | War Room: UPDATE, tipo válido, `dismissed_by` |
| HZ5-24 | MORTO | B | hugo | `alerts: []` de `useWarRoomData` |
| HZ5-25 | LACUNA | A/M | edgar+workersql | cron para `processOutbox` e limpeza do CRM |
| HZ5-26 | MORTO | B | hugo | `getRecentAlerts` sem chamador |

---

## 6. Itens com V2-MELHOR registrados (não devolver)
SLA com tally único e "Todos" real; rascunho do chat por usuário e locator privado; supressão e campanhas do TalkX por RPC, imutabilidade e Realtime sem PII; revogação real de sessões Auth com falha fechada; plano de ação de voz que altera a URL de verdade; presença de digitação com identidade e canais privados; notificação de transcrição com cancelamento; checklist de onboarding derivado; modelos de WhatsApp rotulados como locais; monitor de SLA do War Room idempotente; sem `evolution_messages`/`evo`; histórico de busca por usuário.

## 7. O que NÃO consegui ler ou confirmar
- Banco de PRODUÇÃO (não é permitido): o que a V3 diz de produção ("nunca ativado") é citação dos comentários das migrations dela.
- Se `Excel`/`PDF` do relatório agendado e a Edge `send-scheduled-report` entregam dados fora do sistema além do e-mail (li o hook e o início da Edge, não o corpo inteiro).
- Se `t_b39f929f` (N-010) inclui `team-chat-files` (corpo lido só no começo).
- Se `t_945354b5` corrigiu também a leitura da lista de `WhatsAppFlowsBuilder.tsx:66`.
- Quem chama `voice-copilot-action` em produção (configuração do agente ElevenLabs fora do repositório).
- `TeamChatView`, `ChatPanel` e componentes de tela que consomem os hooks de rascunho/agendamento (não verifiquei se a tela valida data futura ao agendar).
- O conjunto `v2-integrador` está defasado; não pude confirmar o estado do banco com TODAS as migrations do `.integrador` aplicadas (usei o conjunto mais novo + leitura das migrations).
- Não li os 59 hooks da V3 linha a linha; li os do escopo de fluxos desta fatia (SLA, agendamentos, TalkX, chat de equipe, segurança, voz, UI consolidada, configurações, WhatsApp, War Room, CRM) e os cruzamentos de tabela/RPC/Edge/canal/bucket.
