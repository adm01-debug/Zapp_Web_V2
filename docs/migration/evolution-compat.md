# Evolution GO × Evolution API v2 — Compatibilidade (steps 26/62/63)

**Atualizado:** 2026-08-27 sessão 4 — endpoints confirmados via Swagger (`/swagger/index.html`) e código-fonte (`/tmp/evgo`).

## Estado atual

| Item | Valor |
|---|---|
| Servidor | `https://evolution-go-rxj2.srv1481814.hstgr.cloud` (VPS Hostinger) |
| Versão | Evolution GO 0.7.2 · licença **ATIVA** |
| Instância | `PRINCIPAL` · id `c66e1968-fe9e-4686-8c31-ed64bf0d5de6` |
| Número | `5511 4637-5517` (`551146375517:41@s.whatsapp.net`) · perfil "Promo Brindes" |
| Token da instância | `a6834638-7061-47c8-a081-674767ce6737` |
| Webhook | `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook` (setado no DB, validado disparando) |
| Events | `MESSAGE,CONNECTED,DISCONNECTED,QRCODE,MESSAGES_UPSERT` |

## Modelo de autenticação (CRÍTICO para step 63)

Duas classes de rota, mesma header `apikey`, valores diferentes:

| Classe | Header | Rotas |
|---|---|---|
| **Admin** | `apikey: <GLOBAL_API_KEY>` | `/instance/create`, `/instance/all`, `/instance/info/:id`, `/instance/delete/:id`, `/instance/logs/:id`, `/instance/forcereconnect/:id`, proxy |
| **Per-instance** | `apikey: <TOKEN_DA_INSTÂNCIA>` | `/send/*`, `/instance/status`, `/instance/qr`, `/instance/connect`, `/instance/disconnect`, `/instance/:id/advanced-settings`, `/chat/*`, `/message/*`, `/group/*`, `/user/*`, `/label/*` |

⚠️ A Evolution API v2 usa a global key para tudo. No GO, mandar a global em rota per-instance = `{"error":"not authorized"}`. As edge functions precisarão do **token da instância** (novo secret: `EVOLUTION_INSTANCE_TOKEN`).

## Webhook — mecânica real

- **NÃO existe** `/webhook/set/{instance}` nem `/webhook/find/{instance}` (Evolution API v2 style).
- Webhook por instância mora na coluna `instances.webhook` (DB `evogo_users`, postgres user `evolution`).
- Caminho oficial da API: `POST /instance/connect` aceita `webhookUrl` + `events` no payload e persiste.
- O dispatch lê a instância **fresca do DB a cada evento** (`GetInstanceByID`) → UPDATE no DB vale sem restart.
- `WEBHOOK_URL` (env global no compose) dispara para TODAS as instâncias **em paralelo** ao webhook por instância → **entrega duplicada**. Decisão: NÃO usar a env global.
- Retry: 5 tentativas, 30s de intervalo, depois desiste (`webhook failed after maximum retries`).
- Validado em produção 2026-08-27 11:51: evento `Message` disparou POST no destino, recebeu 404 (function ainda não deployada — esperado até Fase 5).

## Mapa de endpoints — Swagger completo

### O que as edge functions usam hoje (Evolution API v2) × equivalente GO

| Edge functions (v2) | Evolution GO | Nota de adaptação |
|---|---|---|
| `POST /message/sendText/{instance}` | `POST /send/text` | instância vai pelo token no header, não na URL. Payload muda: `{"number","text"}` |
| `POST /message/sendMedia/{instance}` | `POST /send/media` | idem |
| `GET /instance/fetchInstances` | `GET /instance/all` | admin key |
| `GET /instance/connectionState/{instance}` | `GET /instance/status` | token da instância |
| `POST /instance/create` | `POST /instance/create` | igual (admin) |
| `POST /instance/connect/{instance}` | `POST /instance/connect` | aceita webhookUrl no payload |
| `POST /webhook/set/{instance}` | **NÃO EXISTE** | usar `/instance/connect` ou UPDATE no DB |
| `POST /chat/whatsappNumbers/{instance}` | `POST /user/check` | verifica se número tem WhatsApp |
| `GET /chat/findMessages/{instance}` | **NÃO EXISTE** direto | histórico via `POST /chat/history-sync` |
| `POST /message/markMessageAsRead/{instance}` | `POST /message/markread` | payload diferente |
| profile fetch | `POST /user/info`, `POST /user/avatar` | |

### Swagger completo do GO (referência)

- **Call:** `POST /call/reject`
- **Chat:** `POST /chat/{archive,history-sync,mute,pin,unarchive,unmute,unpin}`
- **Community:** `POST /community/{add,create,remove}`
- **Group:** `POST /group/{create,description,info,invitelink,join,leave,name,participant,photo,settings}` · `GET /group/{list,myall}`
- **Instance:** ver tabela de auth acima
- **Label:** `POST /label/{chat,edit,message}` · `GET /label/list` · `POST /unlabel/{chat,message}`
- **License:** `GET /license/{activate,register,status}`
- **Message:** `POST /message/{delete,downloadmedia,edit,markplayed,markread,presence,react,status}`
- **Newsletter:** `POST /newsletter/{create,info,link,messages,subscribe}` · `GET /newsletter/list`
- **Passkey:** `GET /passkey-ceremony/{token}` · `POST /passkey-ceremony/{token}/{confirm,response}`
- **Polls:** `GET /polls/{pollMessageId}/results`
- **Send:** `POST /send/{button,carousel,contact,link,list,location,media,poll,sticker,text}` · `POST /send/status/{media,text}`
- **User:** `POST /user/{avatar,block,check,info,privacy,profileName,profilePicture,profileStatus,unblock}` · `GET /user/{blocklist,contacts,privacy}`

## Impacto no step 63 (adaptação `_shared/evolution`)

1. **Novo secret** `EVOLUTION_INSTANCE_TOKEN` (além de `EVOLUTION_API_KEY` global) — adicionar em secrets.md.
2. Reescrever os paths: URL não carrega mais `{instance}`; a instância é resolvida pelo token.
3. Payloads de envio mudam (`number`/`text` no GO vs estrutura v2).
4. Endpoints sem equivalente direto (findMessages) → avaliar se alguma function depende deles e propor alternativa. **Só mexer com APROVADO.**
