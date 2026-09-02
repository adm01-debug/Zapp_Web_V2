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
Header `apikey`: admin = GLOBAL_API_KEY · instância = token da instância
(`GetInstanceByToken` — a instância é resolvida pelo próprio token, sem header extra).
Endpoints admin com `{instanceId}` no PATH (info/delete/logs/forcereconnect/proxy)
exigem o UUID da instância, não o nome — a edge `evolution-api` resolve nome→id
via `GET /instance/all` antes de chamar.

## Estado do adapter — auditoria exaustiva 2026-08-28 (swagger da instância + fonte oficial)
Rotas adicionadas ao `evolution-go-routes.ts` (antes passavam intactas → 404):
findContacts→GET /user/contacts · archiveChat→/chat/archive|/chat/unarchive ·
fetchProfile/fetchBusinessProfile→/user/info {number:[…]} ·
fetchProfilePicture→/user/avatar · updateProfileName→/user/profileName {name} ·
updateProfileStatus→/user/profileStatus {status} · removeProfilePicture→/user/profilePicture {image:''} ·
updatePrivacySettings→/user/privacy (lowercase v2→camelCase GO; last→lastSeen) ·
findLabels→GET /label/list · handleLabel→/label/chat|/unlabel/chat {jid,labelId} ·
webhook/set→/instance/connect {webhookUrl, subscribe:["ALL"], immediate} ·
instance/create→{name,token} (v2 mandava instanceName) · sendContact→{vcard:{fullName,organization,phone}} ·
sendList footer→footerText · quoted propagado em media/áudio/sticker.
Correções fora do tradutor:
- Proxy: resposta de envio GO `{data:{Info:{ID…}}}` ganha `key:{id,remoteJid,fromMe}`+`messageId`
  v2-compat (external_id volta a ser gravado pelo frontend).
- evolution-sync: findContacts/webhook-set via tradutor; sync-messages → `notSupported`
  explícito na GO (histórico chega por webhook, D4/D6).
- recover-corrupted-audios / migrate-media-storage: via `evoFetch`+`extractBase64Media`
  (na GO, lookup só por key.id degrada com log honesto — sem waE2E.Message completo não há download).
- Webhook adapter: shapes whatsmeow traduzidos para ChatPresence (typing), Presence,
  PushName, Contact, LabelEdit, LabelAssociationChat/Message, CallOffer/Notice;
  ConnectFailure/TemporaryBan → connection.update close.
- Nota swagger: annotation de /user/profileName|profileStatus aponta SetProfilePictureStruct
  ({image}) por engano; o handler real usa {name}/{status} (confirmado no fonte).

## Campanha de validação com 5 agentes — 2026-08-28 (pós-113ae2e)
Simulações contra o fonte GO v0.7.x + swagger da instância; 15 gap-detectors do
harness de webhooks fecharam após as correções. CORREÇÕES DESTA RODADA:
- **D1 CORRIGIDA**: `POST /instance/connect` PERSISTE webhook/subscribe do body —
  body vazio APAGA o webhook da instância e o guard `instance.Webhook != ""`
  bloqueia até o WEBHOOK_URL global (fonte: instance_service.go:209-241 +
  whatsmeow.go:2313). Todo connect agora reafirma {webhookUrl, subscribe:["ALL"],
  immediate} — fluxo de QR virou auto-reparador.
- fetchAllGroups→**/group/list** (GetJoinedGroups); /group/myall filtra por dono
  com JID mutilado e está `// TODO: not working` no fonte (retornava vazio).
- Mídia recebida: waE2E serializa **URL maiúsculo** (pb.go) e, com WEBHOOKFILES,
  o binário vem em `Message.base64` — adapter iça base64/mediaUrl para o topo
  (formato v2) e o pipeline tenta base64→URL→API, com validação de magic-bytes.
- reactionMessage/protocolMessage: keys `ID/remoteJID` (waCommon) normalizadas;
  MESSAGE_EDIT(14)→messages.edited, REVOKE(0)→messages.delete, demais→no-op.
- QR: campo real é `data.qrcode` (dataURI); `data.code` é string de pareamento.
  QRTimeout limpa o QR vencido e marca disconnected.
- HistorySync→messages.set (conversations[].messages[].message, cap 500/evento).
- react/markread: JID vai completo sem device (número puro corrompia @g.us/@lid).
- update-privacy: GO exige os 7 campos — edge faz GET /user/privacy + merge.
- create-instance: GO exige token — edge gera default e devolve na resposta.
- sendPtv→type 'ptv' nativo · buttons/list: footer obrigatório (default ' ') ·
  /group/participant: Content-Type text/json contorna bug do middleware de JID
  (zera arrays em application/json) — CONFIRMAR LIVE.
- Respostas normalizadas no proxy: /label/list→[{id,name,color}] (GO manda
  label_id/label_name/label_color) · /user/check→[{exists,jid,number}] (GO manda
  Users[{IsInWhatsapp,JID,Query}]).
- Banco (pré-existentes, fora do tradutor): qrcode.updated gravava status
  'pending' (viola o CHECK; correto: qr_pending) · sync de contatos usava
  onConflict composto sem constraint (42P10; padrão insert+23505) ·
  warroom_alerts do health-check usava colunas inexistentes · cores de label
  idx→hex · guard de reação em stub sem contact_id · recibo de msg própria sem
  external_id não cria mais stub duplicado.
Herdados do v2, documentados e NÃO alterados: msg de grupo gravada como DM do
participante · contato @lid com pseudo-fone · eco SendMessage descartado sem
linha local · ReadSelf→delivered em inbound (cosmético) · labelassociationmessage
tagueia o contato. PENDENTE DECISÃO (migration): UNIQUE parcial em
messages.external_id (corrida de duplicatas sob retry/paralelismo).
