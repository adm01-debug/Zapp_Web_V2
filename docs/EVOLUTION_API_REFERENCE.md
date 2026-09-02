# ⚡ EVOLUTION API v2 — Análise Técnica Completa

> ⚠️ **REFERÊNCIA HISTÓRICA (v2).** A instalação oficial em produção é a **Evolution GO**
> (`evoapicloud/evolution-go` na VPS Hostinger — `evolution-go-rxj2.srv1481814.hstgr.cloud`).
> O código continua falando o "dialeto" v2 internamente e o tradutor
> `supabase/functions/_shared/evolution-go-routes.ts` converte cada chamada para o
> contrato GO; o webhook GO é normalizado por `_shared/evolution-go-adapter.ts`.
> Mapa completo de paridade/gaps: `docs/migration/GO_GAPS.md`.

> **Guia de Referência Máxima** | Todos os Endpoints • Webhooks • Integrações • Automações  
> Versão de Referência: Evolution API v2.x (2025) | `doc.evolution-api.com/v2`

---

## 📋 ÍNDICE

1. [O que é a Evolution API](#1-o-que-é-a-evolution-api)
2. [Instalação & Configuração](#2-instalação--configuração)
3. [Gestão de Instâncias](#3-gestão-de-instâncias)
4. [Envio de Mensagens](#4-envio-de-mensagens)
5. [Webhooks & Eventos](#5-webhooks--eventos)
6. [Gestão de Chats & Contatos](#6-gestão-de-chats--contatos)
7. [Gestão de Grupos](#7-gestão-de-grupos)
8. [Perfil & Configurações](#8-perfil--configurações)
9. [Labels (Etiquetas)](#9-labels-etiquetas)
10. [Integração: Chatwoot](#10-integração-chatwoot)
11. [Integração: Typebot](#11-integração-typebot)
12. [Integração: OpenAI](#12-integração-openai)
13. [Integração: Dify](#13-integração-dify)
14. [Integração: Flowise](#14-integração-flowise)
15. [Integração: Evolution Bot](#15-integração-evolution-bot)
16. [Canais de Mensageria](#16-canais-de-mensageria)
17. [Armazenamento S3 / Minio](#17-armazenamento-s3--minio)
18. [WhatsApp Business Cloud API (Meta Oficial)](#18-whatsapp-business-cloud-api-meta-oficial)
19. [KPIs & Monitoramento](#19-kpis--monitoramento)
20. [Casos de Uso & Automações](#20-casos-de-uso--automações)

---

## 1. O que é a Evolution API

A **Evolution API** é uma plataforma open-source de integração WhatsApp que vai muito além de uma simples API de mensagens. Suporta múltiplas instâncias, integrações com IA, chatbots, CRMs e sistemas de mensageria em tempo real.

Originalmente criada como API de controle WhatsApp baseada no CodeChat, utilizando a biblioteca **Baileys**. Evoluiu para uma plataforma completa com múltiplas camadas de integração.

### 1.1 Arquitetura Geral

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Core API | Node.js + TypeScript | Processamento de requisições REST |
| WhatsApp (Baileys) | Baileys Library | Conexão via WhatsApp Web (gratuito) |
| WhatsApp (Cloud API) | Meta Business API | Conexão oficial paga da Meta |
| Banco de Dados | PostgreSQL / MongoDB / SQLite | Persistência de dados |
| Cache | Redis | Sessões e filas de mensagens |
| Mensageria | RabbitMQ / Kafka / SQS | Eventos em tempo real |
| Armazenamento | S3 / Minio | Arquivos de mídia |
| WebSocket | Socket.IO | Eventos em tempo real via WS |

### 1.2 Tipos de Conexão WhatsApp

| Tipo | Tecnologia | Custo | Uso Ideal |
|------|-----------|-------|-----------|
| **Baileys** | WhatsApp Web (Baileys) | Gratuito | Bots, automações, multi-atendimento |
| **Cloud API (Oficial)** | Meta Business API | Pago por mensagem | Empresas grandes, compliance |

> ⚠️ A conexão via Baileys não é oficialmente suportada pela Meta e pode resultar em banimento de número. Use com moderação e boas práticas.

### 1.3 Multi-Instâncias

A Evolution API suporta múltiplas instâncias simultâneas por servidor. Cada instância representa um número de WhatsApp diferente conectado.

- Cada instância tem seu próprio token de API
- Cada instância pode ter sua própria URL de webhook
- **Modo Container**: 1 instância por container (ideal para microserviços)
- **Modo padrão**: N instâncias por servidor

---

## 2. Instalação & Configuração

### 2.1 Docker (Recomendado)

```yaml
# docker-compose.yml básico
version: '3.8'
services:
  evolution-api:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=https://seu-dominio.com
      - AUTHENTICATION_API_KEY=sua-chave-secreta
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://user:pass@db:5432/evolution
      - CACHE_REDIS_URI=redis://redis:6379
    volumes:
      - evolution_data:/evolution/instances
```

### 2.2 Variáveis de Ambiente Essenciais

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `SERVER_URL` | URL pública do servidor | `https://api.minha-empresa.com` |
| `AUTHENTICATION_API_KEY` | Chave global de autenticação | `minha-chave-forte-123` |
| `DATABASE_PROVIDER` | Banco: postgresql/mongodb/sqlite | `postgresql` |
| `DATABASE_CONNECTION_URI` | String de conexão do banco | `postgresql://user:pass@host/db` |
| `CACHE_REDIS_URI` | URI do Redis para cache | `redis://redis:6379` |
| `CACHE_REDIS_ENABLED` | Ativa cache Redis | `true` |
| `LOG_LEVEL` | Nível de log: ERROR/WARN/INFO/DEBUG | `INFO` |
| `WEBHOOK_GLOBAL_URL` | URL global para todos os webhooks | `https://n8n.empresa.com/webhook/wpp` |
| `WEBHOOK_GLOBAL_ENABLED` | Ativa webhook global | `true` |
| `WEBHOOK_EVENTS_MESSAGES_UPSERT` | Habilita evento de mensagem recebida | `true` |
| `S3_ENABLED` | Ativa armazenamento S3 | `false` |
| `S3_BUCKET` | Nome do bucket S3 | `evolution-media` |
| `RABBITMQ_ENABLED` | Ativa integração RabbitMQ | `false` |
| `KAFKA_ENABLED` | Ativa integração Kafka | `false` |
| `SQS_ENABLED` | Ativa integração AWS SQS | `false` |
| `OPENAI_ENABLED` | Ativa integração OpenAI | `true` |
| `TYPEBOT_ENABLED` | Ativa integração Typebot | `true` |
| `CHATWOOT_ENABLED` | Ativa integração Chatwoot | `true` |
| `DIFY_ENABLED` | Ativa integração Dify | `false` |
| `FLOWISE_ENABLED` | Ativa integração Flowise | `false` |
| `WEBSOCKET_ENABLED` | Ativa WebSocket | `true` |
| `WEBSOCKET_GLOBAL_EVENTS` | Eventos globais via WS | `true` |

---

## 3. Gestão de Instâncias

> Instâncias são o coração da Evolution API. Cada instância = 1 número WhatsApp. Todos os demais endpoints operam dentro do contexto de uma instância.

### 3.1 Endpoints de Instância

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/instance/fetchInstances` | Lista todas as instâncias do servidor |
| `GET` | `/instance/fetchInstances?instanceName=nome` | Busca instância específica |
| `POST` | `/instance/create` | Cria nova instância |
| `GET` | `/instance/connect/{instance}` | Gera QR Code para conexão |
| `GET` | `/instance/connectionState/{instance}` | Retorna status de conexão |
| `PUT` | `/instance/restart/{instance}` | Reinicia a instância |
| `DELETE` | `/instance/logout/{instance}` | Desconecta (logout) a instância |
| `DELETE` | `/instance/delete/{instance}` | Exclui permanentemente a instância |
| `POST` | `/instance/setPresence/{instance}` | Define presença |
| `GET` | `/instance/info/{instance}` | Informações detalhadas |

### 3.2 Criar Instância — Body Completo

```json
POST /instance/create
{
  "instanceName": "minha-empresa-vendas",
  "token": "token-opcional-customizado",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",

  "webhook": {
    "url": "https://n8n.empresa.com/webhook/wpp",
    "byEvents": true,
    "base64": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
  },

  "chatwoot": {
    "enabled": true,
    "accountId": "1",
    "token": "token-chatwoot",
    "url": "https://chatwoot.empresa.com",
    "signMsg": true,
    "reopenConversation": true,
    "conversationPending": false,
    "nameInbox": "WhatsApp Vendas"
  },

  "typebot": {
    "enabled": true,
    "url": "https://typebot.empresa.com",
    "typebot": "slug-do-bot",
    "expire": 60,
    "keywordFinish": "#sair",
    "delayMessage": 1000,
    "unknownMessage": "Não entendi",
    "listeningFromMe": false
  },

  "proxy": {
    "enabled": false,
    "host": "proxy.empresa.com",
    "port": "3128",
    "protocol": "http",
    "username": "user",
    "password": "pass"
  }
}
```

### 3.3 Estados de Conexão

| Estado | Descrição | Ação Recomendada |
|--------|-----------|-----------------|
| `open` | Conectado e ativo | Nenhuma ação necessária |
| `close` | Desconectado | Reconectar via `/instance/connect` |
| `connecting` | Aguardando QR Code scan | Exibir QR Code ao usuário |
| `refused` | Conexão recusada | Verificar credenciais e número |

### 3.4 Set Presence

```json
POST /instance/setPresence/{instance}
{
  "presence": "available"
}
// Valores: available | unavailable | composing | recording | paused
```

---

## 4. Envio de Mensagens

### 4.1 Mapa Completo de Endpoints

| Método | Endpoint | Tipo de Mensagem |
|--------|----------|-----------------|
| `POST` | `/message/sendText/{instance}` | Texto simples com formatação |
| `POST` | `/message/sendStatus/{instance}` | Status/Story |
| `POST` | `/message/sendMedia/{instance}` | Imagem, vídeo, documento, gif |
| `POST` | `/message/sendWhatsAppAudio/{instance}` | Áudio como nota de voz |
| `POST` | `/message/sendSticker/{instance}` | Sticker (figurinha) |
| `POST` | `/message/sendLocation/{instance}` | Localização GPS |
| `POST` | `/message/sendContact/{instance}` | Cartão de contato vCard |
| `POST` | `/message/sendReaction/{instance}` | Reação emoji |
| `POST` | `/message/sendPoll/{instance}` | Enquete |
| `POST` | `/message/sendList/{instance}` | Lista interativa |
| `POST` | `/message/sendButtons/{instance}` | Botões interativos |
| `POST` | `/message/markMessageAsRead/{instance}` | Marcar como lida |
| `POST` | `/message/markMessageAsUnread/{instance}` | Marcar como não lida |
| `POST` | `/message/archiveChat/{instance}` | Arquivar chat |
| `DELETE` | `/message/delete/{instance}` | Deletar para todos |
| `PUT` | `/message/update/{instance}` | Editar mensagem |

### 4.2 Send Text

```json
POST /message/sendText/{instance}
{
  "number": "5511999999999",
  "text": "Olá! *negrito* _itálico_ ~riscado~\n\nNova linha",
  "delay": 1200,
  "quoted": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "ID_DA_MENSAGEM_ORIGINAL"
    },
    "message": { "conversation": "Mensagem citada" }
  },
  "mentionsEveryOne": false,
  "mentioned": ["5511888888888"]
}
```

### 4.3 Send Media

```json
POST /message/sendMedia/{instance}
{
  "number": "5511999999999",
  "mediatype": "image",
  "mimetype": "image/jpeg",
  "caption": "Legenda da imagem",
  "media": "https://url-da-imagem.com/foto.jpg",
  "fileName": "nome-do-arquivo.jpg",
  "delay": 1000
}
```

### 4.4 Send Buttons

```json
POST /message/sendButtons/{instance}
{
  "number": "5511999999999",
  "title": "Escolha uma opção",
  "description": "Como posso te ajudar hoje?",
  "footer": "Empresa XPTO - Suporte",
  "buttons": [
    { "type": "reply", "displayText": "✅ Falar com Vendas", "id": "btn_vendas" },
    { "type": "reply", "displayText": "🛠️ Suporte Técnico", "id": "btn_suporte" },
    { "type": "reply", "displayText": "📋 Ver Catálogo", "id": "btn_catalogo" }
  ]
}
```

### 4.5 Send List

```json
POST /message/sendList/{instance}
{
  "number": "5511999999999",
  "title": "Menu de Opções",
  "description": "Selecione uma das categorias",
  "footer": "Powered by Evolution API",
  "buttonText": "📋 VER OPÇÕES",
  "sections": [
    {
      "title": "Produtos",
      "rows": [
        { "title": "📱 Smartphones", "description": "Ver linha completa", "rowId": "prod_smartphone" },
        { "title": "💻 Notebooks", "description": "Ofertas da semana", "rowId": "prod_notebook" }
      ]
    },
    {
      "title": "Serviços",
      "rows": [
        { "title": "🔧 Assistência Técnica", "description": "Agendar visita", "rowId": "serv_assistencia" }
      ]
    }
  ]
}
```

### 4.6 Send Poll

```json
POST /message/sendPoll/{instance}
{
  "number": "5511999999999",
  "name": "Qual horário prefere para a reunião?",
  "selectableCount": 1,
  "values": ["09:00", "14:00", "16:00", "Qualquer horário"]
}
```

### 4.7 Send Location

```json
POST /message/sendLocation/{instance}
{
  "number": "5511999999999",
  "name": "Nossa Loja Principal",
  "address": "Av. Paulista, 1000 - Bela Vista, São Paulo",
  "latitude": -23.5648,
  "longitude": -46.6516
}
```

### 4.8 Send Contact

```json
POST /message/sendContact/{instance}
{
  "number": "5511999999999",
  "contact": [{
    "fullName": "João Silva",
    "wuid": "5511888888888",
    "phoneNumber": "11888888888",
    "organization": "Empresa XYZ",
    "email": "joao@empresa.com",
    "url": "https://empresa.com"
  }]
}
```

### 4.9 Send Reaction

```json
POST /message/sendReaction/{instance}
{
  "key": {
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": false,
    "id": "3EB0C767D360A23D02C3"
  },
  "reaction": "👍"
}
// String vazia "" remove a reação
```

### 4.10 Send WhatsApp Audio (Nota de Voz)

```json
POST /message/sendWhatsAppAudio/{instance}
{
  "number": "5511999999999",
  "audio": "https://url-do-audio.com/audio.mp3",
  "encoding": true,
  "delay": 500
}
```

---

## 5. Webhooks & Eventos

### 5.1 Configuração de Webhook

```json
POST /webhook/set/{instance}
{
  "enabled": true,
  "url": "https://n8n.empresa.com/webhook/evolution",
  "webhookByEvents": true,
  "webhookBase64": false,
  "events": [
    "APPLICATION_STARTUP", "QRCODE_UPDATED", "CONNECTION_UPDATE",
    "MESSAGES_SET", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE",
    "SEND_MESSAGE", "CONTACTS_SET", "CONTACTS_UPSERT", "CONTACTS_UPDATE",
    "PRESENCE_UPDATE", "CHATS_SET", "CHATS_UPSERT", "CHATS_UPDATE", "CHATS_DELETE",
    "GROUPS_UPSERT", "GROUP_UPDATE", "GROUP_PARTICIPANTS_UPDATE",
    "NEW_JWT_TOKEN", "TYPEBOT_START", "TYPEBOT_CHANGE_STATUS",
    "LABELS_EDIT", "LABELS_ASSOCIATION", "CALL"
  ]
}
```

> `webhookByEvents: true` → adiciona sufixo `/NOME_DO_EVENTO` na URL  
> `webhookBase64: true` → mídias chegam em base64 no payload

### 5.2 Catálogo Completo de Eventos (25+)

| Evento | Quando Dispara | Dados Principais |
|--------|---------------|-----------------|
| `APPLICATION_STARTUP` | Servidor/instância inicia | instanceName, version |
| `QRCODE_UPDATED` | QR Code gerado/atualizado | qrcode (base64), count |
| `CONNECTION_UPDATE` | Status de conexão muda | state: open/close/connecting, statusReason |
| `MESSAGES_SET` | Histórico inicial carregado | messages[], isLatest, progress |
| `MESSAGES_UPSERT` | Nova mensagem recebida/enviada | key, message, messageType, pushName, participant |
| `MESSAGES_UPDATE` | Mensagem atualizada (lida/entregue) | key, update: {status} |
| `MESSAGES_DELETE` | Mensagem deletada | key do remoteJid |
| `SEND_MESSAGE` | Mensagem enviada pela API | key, message, status |
| `CONTACTS_SET` | Contatos sincronizados (início) | contacts[] |
| `CONTACTS_UPSERT` | Novo contato adicionado | id, pushName, profilePictureUrl |
| `CONTACTS_UPDATE` | Contato atualizado | id, pushName |
| `PRESENCE_UPDATE` | Status de presença muda | id, presences: {lastKnownPresence, lastSeen} |
| `CHATS_SET` | Chats sincronizados no início | chats[] |
| `CHATS_UPSERT` | Novo chat criado | id, name, unreadCount |
| `CHATS_UPDATE` | Chat atualizado | id, lastMsgTimestamp |
| `CHATS_DELETE` | Chat deletado | id |
| `GROUPS_UPSERT` | Grupo criado ou atualizado | id, subject, desc, participants[] |
| `GROUP_UPDATE` | Dados do grupo atualizados | id, subject, desc, restrict, announce |
| `GROUP_PARTICIPANTS_UPDATE` | Participantes mudaram | id, participants[], action: add/remove/promote/demote |
| `NEW_JWT_TOKEN` | Token JWT renovado | token |
| `TYPEBOT_START` | Typebot iniciado para contato | remoteJid, typebotId |
| `TYPEBOT_CHANGE_STATUS` | Status do Typebot muda | remoteJid, status: opened/paused/closed |
| `LABELS_EDIT` | Etiqueta criada/editada/deletada | id, name, color, deleted |
| `LABELS_ASSOCIATION` | Etiqueta associada a mensagem/chat | label, chatId, messageId |
| `CALL` | Chamada de voz/vídeo recebida | from, callId, isVideo, status |

### 5.3 Estrutura do Payload MESSAGES_UPSERT

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C767D360A23D02C3"
    },
    "pushName": "Nome do Contato",
    "participant": "5511999999999@s.whatsapp.net",
    "messageType": "conversation",
    "message": {
      "conversation": "Texto da mensagem"
    },
    "messageTimestamp": 1716919200,
    "status": "DELIVERY_ACK",
    "instanceId": "uuid-da-instancia"
  }
}
// status: ERROR | PENDING | SERVER_ACK | DELIVERY_ACK | READ | PLAYED
// messageType: conversation | imageMessage | audioMessage | documentMessage
//              videoMessage | stickerMessage | locationMessage | contactMessage
//              reactionMessage | pollCreationMessage | buttonsResponseMessage | listResponseMessage
```

### 5.4 Webhook Global vs Por Instância

| Tipo | Configuração | Uso Recomendado |
|------|-------------|----------------|
| Global | `WEBHOOK_GLOBAL_URL` no `.env` | Monitoramento centralizado |
| Por Instância | `POST /webhook/set/{instance}` | Rotas diferentes por número/cliente |
| Por Evento (URL) | `webhookByEvents: true` | n8n/Make separados por tipo de evento |

---

## 6. Gestão de Chats & Contatos

### 6.1 Endpoints de Chats

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/chat/findChats/{instance}` | Lista todos os chats (paginado) |
| `GET` | `/chat/findMessages/{instance}` | Busca mensagens de um chat |
| `GET` | `/chat/findStatusMessage/{instance}` | Mensagens de status |
| `POST` | `/chat/whatsappNumbers/{instance}` | Verifica se números têm WhatsApp |
| `POST` | `/chat/markMessageAsRead/{instance}` | Marca como lida |
| `POST` | `/chat/markMessageAsUnread/{instance}` | Marca como não lida |
| `POST` | `/chat/archiveChat/{instance}` | Arquivar/desarquivar chat |
| `DELETE` | `/chat/deleteMessageForEveryone/{instance}` | Deletar para todos |
| `PUT` | `/chat/updateMessage/{instance}` | Editar mensagem |
| `GET` | `/chat/findContacts/{instance}` | Lista contatos (paginado) |
| `POST` | `/chat/getBase64FromMediaMessage/{instance}` | Download de mídia em base64 |

### 6.2 Verificar Números WhatsApp

```json
POST /chat/whatsappNumbers/{instance}
{
  "numbers": ["5511999999999", "5521888888888", "5531777777777"]
}

// Resposta:
[
  { "number": "5511999999999", "numberExists": true, "jid": "5511999999999@s.whatsapp.net" },
  { "number": "5521888888888", "numberExists": false },
  { "number": "5531777777777", "numberExists": true, "jid": "5531777777777@s.whatsapp.net" }
]
```

### 6.3 Buscar Mensagens com Filtros

```
GET /chat/findMessages/{instance}?remoteJid=5511999999999@s.whatsapp.net&page=1&offset=50

Parâmetros disponíveis:
  remoteJid      = número@s.whatsapp.net ou grupo@g.us
  page           = página (padrão: 1)
  offset         = itens por página (padrão: 20, máx: 100)
  timestampStart = unix timestamp início
  timestampEnd   = unix timestamp fim
```

### 6.4 Download de Mídia (base64)

```json
POST /chat/getBase64FromMediaMessage/{instance}
{
  "message": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C767D360A23D02C3"
    },
    "message": { "imageMessage": {} }
  },
  "convertToMp4": false
}
```

---

## 7. Gestão de Grupos

### 7.1 Endpoints de Grupos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/group/create/{instance}` | Criar novo grupo |
| `GET` | `/group/fetchAllGroups/{instance}` | Listar todos os grupos |
| `GET` | `/group/findGroupInfos/{instance}?groupJid=...` | Detalhes de grupo |
| `GET` | `/group/participants/{instance}?groupJid=...` | Listar participantes |
| `PUT` | `/group/updateGroupSubject/{instance}` | Atualizar nome |
| `PUT` | `/group/updateGroupDescription/{instance}` | Atualizar descrição |
| `PUT` | `/group/updateParticipant/{instance}` | Adicionar/remover/promover |
| `PUT` | `/group/updateSetting/{instance}` | Configurar permissões |
| `GET` | `/group/inviteCode/{instance}?groupJid=...` | Obter link de convite |
| `PUT` | `/group/revokeInviteCode/{instance}` | Revogar link de convite |
| `GET` | `/group/inviteInfo/{instance}?inviteCode=...` | Info pelo link |
| `POST` | `/group/acceptInviteCode/{instance}` | Entrar pelo link |
| `DELETE` | `/group/leaveGroup/{instance}` | Sair de um grupo |
| `PUT` | `/group/updateGroupPicture/{instance}` | Alterar foto do grupo |
| `POST` | `/group/toggleEphemeral/{instance}` | Ativar mensagens temporárias |

### 7.2 Criar Grupo

```json
POST /group/create/{instance}
{
  "subject": "Nome do Grupo",
  "description": "Descrição do grupo aqui",
  "participants": ["5511999999999", "5521888888888", "5531777777777"]
}

// Resposta:
{
  "groupJid": "120363295648424210@g.us",
  "inviteCode": "AbCdEfGhIjKlMn"
}
```

### 7.3 Gerenciar Participantes

```json
PUT /group/updateParticipant/{instance}
{
  "groupJid": "120363295648424210@g.us",
  "action": "add",
  "participants": ["5511999999999", "5521888888888"]
}
// action: add | remove | promote | demote
// promote = tornar admin | demote = remover admin
```

### 7.4 Configurações do Grupo

```json
PUT /group/updateSetting/{instance}
{
  "groupJid": "120363295648424210@g.us",
  "action": "announcement"
}
// announcement = só admins enviam
// not_announcement = todos enviam
// locked = só admins editam info
// unlocked = todos editam info
```

---

## 8. Perfil & Configurações

### 8.1 Endpoints de Perfil

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/profile/fetchProfile/{instance}` | Dados do perfil |
| `PUT` | `/profile/updateProfileName/{instance}` | Alterar nome |
| `PUT` | `/profile/updateProfileStatus/{instance}` | Alterar recado/status |
| `PUT` | `/profile/updateProfilePicture/{instance}` | Alterar foto |
| `DELETE` | `/profile/removeProfilePicture/{instance}` | Remover foto |
| `GET` | `/profile/fetchProfilePicture/{instance}` | URL da foto de qualquer número |
| `POST` | `/profile/fetchBusinessProfile/{instance}` | Dados do perfil business |
| `PUT` | `/profile/updatePrivacySettings/{instance}` | Configurar privacidade |

### 8.2 Configurações de Privacidade

```json
PUT /profile/updatePrivacySettings/{instance}
{
  "readreceipts": "all",
  "profile": "contacts",
  "status": "contacts",
  "online": "all",
  "last": "contacts",
  "groupadd": "contacts"
}
// Valores: all | contacts | contact_blacklist | none | match_last_seen
```

### 8.3 Settings da Instância

```json
POST /settings/set/{instance}
{
  "rejectCall": true,
  "msgCall": "Não posso atender. Envie mensagem.",
  "groupsIgnore": false,
  "alwaysOnline": true,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false
}

GET /settings/find/{instance}
```

---

## 9. Labels (Etiquetas)

Labels permitem categorizar chats e mensagens. **Funcionam apenas com WhatsApp Business App.**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/label/findLabels/{instance}` | Listar todas as etiquetas |
| `POST` | `/label/handleLabel/{instance}` | Adicionar/remover etiqueta de chat |

```json
POST /label/handleLabel/{instance}
{
  "number": "5511999999999",
  "labelId": "1",
  "action": "add"
}
// action: add | remove
```

**Eventos de Labels:**
- `LABELS_EDIT` — etiqueta criada, renomeada ou deletada
- `LABELS_ASSOCIATION` — etiqueta associada ou removida de chat/mensagem

---

## 10. Integração: Chatwoot

> Chatwoot é uma plataforma open-source de atendimento ao cliente. Todas as mensagens do WhatsApp chegam no Chatwoot como conversas gerenciáveis por equipe humana.

### 10.1 Configuração

```json
POST /chatwoot/set/{instance}
{
  "enabled": true,
  "accountId": "1",
  "token": "token-do-agente-chatwoot",
  "url": "https://chatwoot.empresa.com",
  "signMsg": true,
  "reopenConversation": true,
  "conversationPending": false,
  "nameInbox": "WhatsApp Principal",
  "mergeBrazilContacts": true,
  "importContacts": true,
  "importMessages": true,
  "daysLimitImportMessages": 7,
  "signDelimiter": "\n",
  "autoCreate": false
}

GET    /chatwoot/find/{instance}
DELETE /chatwoot/delete/{instance}
```

### 10.2 Parâmetros Explicados

| Parâmetro | Função |
|-----------|--------|
| `signMsg` | Adiciona assinatura do atendente nas mensagens |
| `reopenConversation` | Reabre conversa existente do mesmo contato |
| `conversationPending` | Inicia conversa como pendente (fila de espera) |
| `mergeBrazilContacts` | Unifica contatos com/sem dígito 9 extra |
| `importContacts` | Importa agenda do WhatsApp para o Chatwoot |
| `importMessages` | Importa histórico de mensagens |
| `daysLimitImportMessages` | Quantos dias de histórico importar |

### 10.3 Fluxo de Funcionamento

```
Cliente envia msg WhatsApp
        ↓
Evolution API recebe
        ↓
Cria/atualiza conversa no Chatwoot
        ↓
Atendente responde pelo Chatwoot
        ↓
Evolution API entrega no WhatsApp
```

---

## 11. Integração: Typebot

> Typebot é uma plataforma de chatbots visuais (drag-and-drop). Permite criar fluxos conversacionais sofisticados sem código.

### 11.1 Configuração

```json
POST /typebot/set/{instance}
{
  "enabled": true,
  "url": "https://typebot.empresa.com",
  "typebot": "slug-do-typebot",
  "expire": 20,
  "keywordFinish": "#fim",
  "delayMessage": 1000,
  "unknownMessage": "Não entendido",
  "listeningFromMe": false,
  "stopBotFromMe": true,
  "keepOpen": false,
  "debounceTime": 10
}

GET    /typebot/find/{instance}
DELETE /typebot/delete/{instance}

GET    /typebot/fetchSessions/{instance}?typebotId=slug
POST   /typebot/changeStatus/{instance}
POST   /typebot/startTypebot/{instance}
```

### 11.2 Triggers (Gatilhos)

```json
// Por keyword
{ "triggerType": "keyword", "triggerOperator": "contains", "triggerValue": "oi" }

// Por regex
{ "triggerType": "keyword", "triggerOperator": "regex", "triggerValue": "^(oi|olá|ola)$" }

// Para todos sem bot ativo
{ "triggerType": "all" }

// Ativado manualmente via API
{ "triggerType": "none" }
```

### 11.3 Variáveis Injetadas no Typebot

| Variável | Descrição |
|----------|-----------|
| `contact.name` | Nome do contato |
| `contact.number` | Número do WhatsApp |
| `contact.pushName` | Nome definido no WhatsApp |
| `contact.profilePicUrl` | URL da foto de perfil |
| `msg.type` | Tipo da mensagem (text, image, audio...) |
| `msg.content` | Conteúdo da mensagem |

---

## 12. Integração: OpenAI

### 12.1 Configuração

```json
POST /openai/set/{instance}
{
  "enabled": true,
  "openAiApiKey": "sk-sua-chave-openai",
  "expire": 30,
  "keywordFinish": "#sair",
  "delayMessage": 1000,
  "listeningFromMe": false,
  "stopBotFromMe": true,
  "speechToText": false,

  "botType": "assistant",
  "assistantId": "asst_xxxxxxxxxxxxx",
  "model": "gpt-4o",
  "systemMessage": "Você é um assistente de vendas da Empresa XYZ...",
  "maxTokens": 500,
  "temperature": 0.7,

  "triggerType": "all"
}
```

### 12.2 Funcionalidades

| Função | Descrição | Config |
|--------|-----------|--------|
| GPT Chat Completion | IA responde baseada em system prompt | `botType: chatCompletion` |
| OpenAI Assistants | Usa Assistants com tools e files | `botType: assistant` + `assistantId` |
| Speech-to-Text (Whisper) | Transcreve notas de voz recebidas | `speechToText: true` |
| Text-to-Speech | Converte respostas em áudio | Via OpenAI TTS API |
| Function Calling | Webhook externo para funções | `functionUrl` |

---

## 13. Integração: Dify

```json
POST /dify/set/{instance}
{
  "enabled": true,
  "apiUrl": "https://api.dify.ai",
  "apiKey": "app-xxxxxxxxxxxxxx",
  "botType": "agent",
  "expire": 30,
  "triggerType": "all",
  "keywordFinish": "#fim",
  "listeningFromMe": false,
  "stopBotFromMe": true,
  "speechToText": false
}
// botType: chatBot | textGenerator | agent | workflow
```

---

## 14. Integração: Flowise

```json
POST /flowise/set/{instance}
{
  "enabled": true,
  "apiUrl": "https://flowise.empresa.com",
  "apiKey": "chave-flowise",
  "chatflowId": "uuid-do-fluxo",
  "expire": 30,
  "triggerType": "keyword",
  "triggerValue": "oi"
}
```

---

## 15. Integração: Evolution Bot

```json
POST /evolutionBot/set/{instance}
{
  "enabled": true,
  "expire": 10,
  "keywordFinish": "#sair",
  "delayMessage": 800,
  "triggerType": "keyword",
  "triggerOperator": "equals",
  "triggerValue": "oi",
  "unknownMessage": "Opção inválida",
  "listeningFromMe": false,
  "stopBotFromMe": true,
  "apiUrl": "https://seu-backend.com/bot-handler",
  "apiKey": "chave-de-acesso"
}
```

---

## 16. Canais de Mensageria

### 16.1 Comparativo

| Canal | Protocolo | Ideal Para | Latência |
|-------|-----------|-----------|---------|
| Webhook HTTP | REST/HTTP POST | n8n, Make, integrações simples | Baixa |
| WebSocket | WS/WSS | UIs em tempo real, dashboards | Muito Baixa |
| RabbitMQ | AMQP | Microserviços, alta confiabilidade | Baixa |
| Apache Kafka | Kafka Protocol | Big data, alto volume | Baixa-Média |
| Amazon SQS | AWS SDK | Arquiteturas AWS, serverless | Média |

### 16.2 Configuração RabbitMQ

```bash
# .env
RABBITMQ_ENABLED=true
RABBITMQ_URI=amqp://user:pass@rabbitmq:5672
RABBITMQ_EXCHANGE_NAME=evolution_exchange
RABBITMQ_GLOBAL_ENABLED=true

# Filas criadas automaticamente:
# evolution.{instanceName}.{NOME_DO_EVENTO}
# Ex: evolution.minha-empresa.MESSAGES_UPSERT
```

```json
POST /rabbitmq/set/{instance}
{
  "enabled": true,
  "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
}
```

### 16.3 Configuração WebSocket

```javascript
// .env
// WEBSOCKET_ENABLED=true
// WEBSOCKET_GLOBAL_EVENTS=true

// Cliente JavaScript (Socket.IO):
const socket = io("https://evolution.empresa.com", {
  query: { instance: "minha-instancia", apikey: "chave" }
});

socket.on("messages.upsert", (data) => {
  console.log("Nova mensagem:", data);
});

socket.on("connection.update", (data) => {
  console.log("Status:", data.state);
});
```

### 16.4 Configuração Kafka

```bash
# .env
KAFKA_ENABLED=true
KAFKA_CONF_BROKERS=kafka:9092
KAFKA_CONF_CLIENT_ID=evolution-api
KAFKA_CONF_GROUP_ID=evolution-consumer
```

---

## 17. Armazenamento S3 / Minio

```bash
# .env
S3_ENABLED=true
S3_ACCESS_KEY=sua-access-key
S3_SECRET_KEY=sua-secret-key
S3_BUCKET=evolution-media
S3_PORT=443
S3_ENDPOINT=s3.amazonaws.com    # ou minio.empresa.com
S3_USE_SSL=true
S3_REGION=us-east-1
S3_SKIP_POLICY=false
```

> Quando ativo, as URLs das mídias no webhook apontarão para seu bucket S3 em vez das URLs temporárias do WhatsApp.

---

## 18. WhatsApp Business Cloud API (Meta Oficial)

### 18.1 Criar Instância Cloud API

```json
POST /instance/create
{
  "instanceName": "empresa-cloud-api",
  "integration": "WHATSAPP-BUSINESS-CLOUD",
  "token": "token-permanente-meta",
  "number": "5511999999999",
  "businessId": "ID_BUSINESS_MANAGER",
  "wabaId": "ID_WABA",
  "phoneNumberId": "ID_PHONE_NUMBER"
}
```

### 18.2 Templates (HSM)

```json
POST /message/sendTemplate/{instance}
{
  "number": "5511999999999",
  "template": {
    "name": "nome_do_template",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "João Silva" },
          { "type": "text", "text": "Pedido #12345" }
        ]
      }
    ]
  }
}

POST   /template/create/{instance}
GET    /template/find/{instance}
DELETE /template/delete/{instance}
```

---

## 19. KPIs & Monitoramento

### 19.1 KPIs Essenciais

| KPI | Fonte / Fórmula | Meta |
|-----|----------------|------|
| Taxa de Entrega | DELIVERY_ACK / enviadas × 100 | > 95% |
| Taxa de Leitura | READ / entregues × 100 | > 70% |
| Tempo Médio de Resposta | Timestamp resposta - recebimento | < 5 min |
| Taxa de Opt-out | Bloqueios / contatos únicos × 100 | < 1% |
| Uptime da Instância | Tempo online / total × 100 | > 99% |
| Taxa de Reconexão | Eventos CONNECTION_UPDATE=close | < 1/dia |
| Volume de Mensagens/hora | Count MESSAGES_UPSERT | Monitorar tendências |
| Taxa de Resolução Bot | Sessões finalizadas sem escalada / total | > 60% |
| Tempo de Sessão Bot | Duração média sessões ativas | Monitorar |
| Taxa de Conversão | Leads qualificados / total sessões | Definir por fluxo |

### 19.2 SLAs Recomendados

| Processo | SLA | Alerta em |
|----------|-----|-----------|
| Entrega de mensagem | < 30 segundos | > 2 minutos |
| Conexão QR Code | < 5 minutos | > 10 minutos |
| Reconexão automática | < 3 minutos | > 5 minutos |
| Webhook processado | < 10 segundos | > 1 minuto |
| Download de mídia | < 30 segundos | > 2 minutos |
| Resposta do bot | < 5 segundos | > 15 segundos |

---

## 20. Casos de Uso & Automações

### 🟢 RECEITA 1 — Atendimento Inteligente com Triagem

```
[WEBHOOK] MESSAGES_UPSERT chega no n8n
  → Filtrar: grupo? → ignorar | fromMe? → ignorar
  → Checar: existe sessão ativa de bot?
    → Não: POST /typebot/startTypebot/{instance}
    → Sim: Typebot processa automaticamente
  → Ao fim do Typebot: criar lead no CRM via API
```

### 🟢 RECEITA 2 — Notificações Automáticas de Pedidos

```
[TRIGGER] Novo pedido no ERP
  → POST /message/sendText → confirmação ao cliente
[TRIGGER] Pedido despachado
  → POST /message/sendTemplate → link de rastreio
[WEBHOOK] Cliente responde
  → n8n decide: FAQ automático ou escalar para humano
```

### 🟢 RECEITA 3 — Qualificação de Leads com OpenAI

```
Cliente envia "oi"
  → Bot OpenAI com system prompt de qualificação
  → Bot coleta: empresa, cargo, necessidade, orçamento
  → n8n registra lead qualificado no CRM
  → Score ≥ 7: notificar vendedor no Slack
  → Score < 7: enviar material educativo
```

### 🔴 RECEITA 4 — Disparos em Massa (Boas Práticas)

```
1. Verificar números: POST /chat/whatsappNumbers
2. Filtrar apenas quem tem WhatsApp
3. Delay aleatório 1500ms~4000ms entre mensagens
4. Personalizar com nome do contato
5. Monitorar MESSAGES_UPDATE para confirmar entrega
6. Parar se taxa de erros > 5%
```

> ⚠️ Disparos em massa violam os Termos de Serviço do WhatsApp. Use sempre com consentimento (opt-in).

### Integração com Bitrix24

| Ação no WhatsApp | Automação no Bitrix24 |
|-----------------|----------------------|
| Nova mensagem recebida | Criar atividade/lead no CRM |
| Cliente responde 'SIM' ao orçamento | Mover deal para 'Aprovado' |
| Bot coleta dados completos | Criar contato + empresa |
| Cliente agenda via Typebot | Criar evento no Calendar |
| Reclamação recebida | Abrir ticket no Helpdesk |
| Pedido confirmado | Criar task para logística |

### Estratégia Multi-Bot por Instância

```
Bot 1: Atendimento geral    (triggerType: "all")       → menor prioridade
Bot 2: Suporte técnico      (trigger keyword: "suporte")
Bot 3: Vendas               (trigger regex: "comprar|preço|valor")
Bot 4: Agendamento          (trigger keyword: "agendar")

Prioridade: keyword > all
keywordFinish acionado → volta para bot "all"
stopBotFromMe: true → humano assume enviando mensagem pela instância
```

---

## 🗺️ MAPA COMPLETO — TODOS OS ENDPOINTS

```
/instance
  POST   /create
  GET    /fetchInstances
  GET    /connect/{instance}
  GET    /connectionState/{instance}
  PUT    /restart/{instance}
  DELETE /logout/{instance}
  DELETE /delete/{instance}
  POST   /setPresence/{instance}

/webhook
  POST   /set/{instance}
  GET    /find/{instance}

/settings
  POST   /set/{instance}
  GET    /find/{instance}

/message
  POST   /sendText/{instance}
  POST   /sendStatus/{instance}
  POST   /sendMedia/{instance}
  POST   /sendWhatsAppAudio/{instance}
  POST   /sendSticker/{instance}
  POST   /sendLocation/{instance}
  POST   /sendContact/{instance}
  POST   /sendReaction/{instance}
  POST   /sendPoll/{instance}
  POST   /sendList/{instance}
  POST   /sendButtons/{instance}
  POST   /sendTemplate/{instance}         [Cloud API]
  POST   /markMessageAsRead/{instance}
  POST   /markMessageAsUnread/{instance}
  POST   /archiveChat/{instance}
  DELETE /delete/{instance}
  PUT    /update/{instance}

/chat
  GET    /findChats/{instance}
  GET    /findMessages/{instance}
  GET    /findStatusMessage/{instance}
  GET    /findContacts/{instance}
  POST   /whatsappNumbers/{instance}
  POST   /getBase64FromMediaMessage/{instance}
  POST   /markMessageAsRead/{instance}
  POST   /markMessageAsUnread/{instance}
  POST   /archiveChat/{instance}
  DELETE /deleteMessageForEveryone/{instance}
  PUT    /updateMessage/{instance}

/group
  POST   /create/{instance}
  GET    /fetchAllGroups/{instance}
  GET    /findGroupInfos/{instance}
  GET    /participants/{instance}
  PUT    /updateGroupSubject/{instance}
  PUT    /updateGroupDescription/{instance}
  PUT    /updateParticipant/{instance}
  PUT    /updateSetting/{instance}
  GET    /inviteCode/{instance}
  PUT    /revokeInviteCode/{instance}
  GET    /inviteInfo/{instance}
  POST   /acceptInviteCode/{instance}
  DELETE /leaveGroup/{instance}
  PUT    /updateGroupPicture/{instance}
  POST   /toggleEphemeral/{instance}

/profile
  GET    /fetchProfile/{instance}
  PUT    /updateProfileName/{instance}
  PUT    /updateProfileStatus/{instance}
  PUT    /updateProfilePicture/{instance}
  DELETE /removeProfilePicture/{instance}
  GET    /fetchProfilePicture/{instance}
  POST   /fetchBusinessProfile/{instance}
  PUT    /updatePrivacySettings/{instance}

/label
  GET    /findLabels/{instance}
  POST   /handleLabel/{instance}

/chatwoot
  POST   /set/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}

/typebot
  POST   /set/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}
  GET    /fetchSessions/{instance}
  POST   /changeStatus/{instance}
  POST   /startTypebot/{instance}

/openai
  POST   /set/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}

/dify
  POST   /set/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}

/flowise
  POST   /set/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}

/evolutionBot
  POST   /set/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}

/rabbitmq
  POST   /set/{instance}
  GET    /find/{instance}

/sqs
  POST   /set/{instance}
  GET    /find/{instance}

/template                              [Cloud API]
  POST   /create/{instance}
  GET    /find/{instance}
  DELETE /delete/{instance}
```

---

> **Evolution API v2** — Open Source WhatsApp Integration Platform  
> GitHub: [github.com/EvolutionAPI/evolution-api](https://github.com/EvolutionAPI/evolution-api)  
> Docs: [doc.evolution-api.com/v2](https://doc.evolution-api.com/v2)  
> Docker: `atendai/evolution-api:latest`
