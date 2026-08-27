# Evolution GO — Inventário de gaps e descobertas (v2 → GO)

> Fonte: doc oficial (docs.evolutionfoundation.com.br/evolution-go) + swagger da instância
> (`evolution-go-rxj2.srv1481814.hstgr.cloud/swagger/doc.json`) + validação empírica.
> Instalada: `evoapicloud/evolution-go:latest` na VPS Hostinger 1481814. Instância: PRINCIPAL.

## Descobertas da doc que MUDAM decisões

### D1. Webhook POR INSTÂNCIA existe (não é só global)
`POST /instance/connect` aceita `{webhookUrl, subscribe: ["ALL"], immediate, phone}`.
→ action `set-webhook` do proxy PODE ser mapeada (reconecta com webhook novo).
→ `get-webhook`: sem endpoint de leitura — not_supported.
Global (`WEBHOOK_URL` env) e por instância COEXISTEM (ambos disparam).

### D2. Payload do webhook GO (formato oficial da doc)
`{event, data, instanceId, instanceToken}` — instalação atual envia `instanceName`
(validado empiricamente: ingest funcionando). Adapter deve aceitar AMBOS
(`:latest` pode mudar o campo a qualquer update).

### D3. Eventos GO ≠ eventos v2 (nomes reais, case-sensitive lowered no adapter)
| GO | v2 equivalente | adapter atual |
|---|---|---|
| Message | messages.upsert | ✅ |
| SendMessage | send.message | ❌ FALTA |
| Receipt (state: Read/ReadSelf/Delivered, MessageIDs[]) | messages.update | ⚠️ mapeado sem traduzir formato |
| Connected/PairSuccess/QRSuccess | connection.update (open) | ✅ |
| LoggedOut/Disconnected | connection.update (close) | ✅ |
| QRCode/QRTimeout | qrcode.updated | ✅ |
| ChatPresence/Presence | presence.update | ✅ |
| HistorySync | messages.set | ✅ |
| Contact | contacts.upsert | ✅ |
| PushName | contacts.update | ❌ (adapter tem 'pushnamesetting', nome real é PushName) |
| GroupInfo | group.update | ✅ |
| JoinedGroup | groups.upsert | ✅ |
| LabelEdit | labels.edit | ✅ |
| LabelAssociationChat / LabelAssociationMessage | labels.association | ❌ (adapter tem 'labelassociation' que não bate) |
| CallOffer | call | ✅ |
| CallTerminate / CallRelayLatency | call | ❌ FALTA |
| OfflineSyncCompleted | — (log only) | n/a |
| Archive | — (chats.update) | n/a |
| NewsletterJoin/Leave | — | n/a |

### D4. Mídia vem NO webhook (`WEBHOOKFILES=true` no compose)
Mensagens de mídia trazem `Message.base64` (MinIO desativado).
→ ingest de mídia não depende de `getBase64FromMediaMessage`.
→ `/message/downloadmedia` da GO existe como fallback (exige waE2E Message completo).

### D5. `EVENT_IGNORE_STATUS=true` no compose
Stories/Status NÃO geram eventos. `find-status-messages` + StoryViewer ficam sem
fonte de dados na GO. Tratamento: not_supported (mudar env se um dia precisar).

### D6. `DATABASE_SAVE_MESSAGES=true`
GO persiste mensagens no Postgres dela (`evogo_users`). Porta futura para
histórico via SQL — NÃO é API pública; não construir sobre schema interno.

### D7. Retry policy do webhook GO
5 tentativas, intervalo 30s, timeout 30s, exige HTTP 2xx.

## Endpoints v2 usados pelo proxy → status na GO

### Mapeados (45) — adapter traduz
fetchInstances→/instance/all · restart→/instance/reconnect · findContacts→/user/contacts ·
whatsappNumbers→/user/check · getBase64FromMediaMessage→/message/downloadmedia ·
deleteMessageForEveryone→/message/delete · updateMessage/update→/message/edit ·
markMessageAsRead→/message/markread · updateBlockStatus→/user/block ·
sendPresence(chat)→/message/presence · sendText→/send/text · sendMedia→/send/media ·
sendWhatsAppAudio→/send/media · sendSticker→/send/sticker · sendLocation→/send/location ·
sendContact→/send/contact · sendReaction→/message/react · sendPoll→/send/poll ·
sendList→/send/list · sendButtons→/send/button · sendStatus→/send/status/text ·
archiveChat→/chat/archive · delete→/message/delete · fetchAllGroups→/group/list ·
create→/group/create · findGroupInfos/participants→/group/info ·
updateGroupSubject→/group/name · updateGroupDescription→/group/description ·
updateParticipant→/group/participant · updateSetting→/group/settings ·
inviteCode→/group/invitelink · acceptInviteCode→/group/join · leaveGroup→/group/leave ·
updateGroupPicture→/group/photo · fetchProfile/BusinessProfile→/user/info ·
updateProfileName→/user/profileName · updateProfileStatus→/user/profileStatus ·
updateProfilePicture/remove→/user/profilePicture · fetchProfilePicture→/user/avatar ·
updatePrivacySettings→/user/privacy · findLabels→/label/list · handleLabel→/label/chat ·
set-webhook→/instance/connect(webhookUrl) [NOVO pela doc]

### Sem equivalente GO (→ 501 not_supported gracioso)
/instance/setPresence · /settings/set+find · /webhook/find · /chat/findChats ·
/chat/findMessages · /chat/markMessageAsUnread · /message/sendPtv ·
/message/sendTemplate · /group/inviteInfo · /group/revokeInviteCode ·
/group/toggleEphemeral · find-status-messages (EVENT_IGNORE_STATUS=true) ·
chatwoot · typebot · openai · dify · flowise · evolutionBot · rabbitmq · sqs ·
kafka · nats · pusher · template · business · evoai · n8n · proxy(set) · call(offer)

### Exclusivos GO (disponíveis, sem action no proxy hoje)
/chat/mute,unmute,pin,unpin · /message/markplayed · /message/status ·
/send/carousel · /send/link · /send/status/media · /community/* · /newsletter/* ·
/user/blocklist,unblock · /label/edit,message,unlabel · /instance/pair,logs,
forcereconnect,advanced-settings · /polls/{id}/results

## Auth GO
Header `apikey`: admin = GLOBAL_API_KEY · instância = token da instância.
Header `instanceId` (UUID) em endpoints de instância.
