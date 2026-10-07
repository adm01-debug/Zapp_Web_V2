# ANÁLISE — FAZER E RECEBER LIGAÇÕES PELO WHATSAPP NO ZAPP (07/10/2026)

> Pedido do dono: o botão "Ligar via WhatsApp" deve ligar pelo WhatsApp, e as ligações recebidas pelo WhatsApp devem ser atendidas no sistema.
> Este documento é pesquisa e recomendação. Nenhum código foi alterado. Fontes ao final; o que não foi possível verificar está marcado.

## 1. Estado verificado no projeto
- WhatsApp = **Evolution GO** (protocolo não oficial do WhatsApp Web), 1 linha `PRINCIPAL`, número `551146375517` (`docs/design/TELEFONIA_STATUS.md`). Telefonia SIP = **Bitrix24 SIP Connector** (WSS 8089, `sip.js`).
- O projeto **não usa a Cloud API oficial** da Meta em nenhum ponto do código (só aparece em documentos).
- O canal WhatsApp é **só eventos, sem áudio**, por decisão registrada (T24, `src/lib/calls/WhatsAppCallAdapter.ts`: `dial` → NotSupported; atender = "atenda no aparelho"). O webhook `CALL` (`callId`, `isVideo`, `status:"offer"`) já chega e alimenta o alerta de chamada recebida.
- O provider de chamadas (`CallSessionProvider.dial`) disca sempre por `voip`; ignora o canal escolhido no menu.

## 2. Caminho A — API oficial: WhatsApp Business Calling API (Meta Cloud API)
Fatos da documentação oficial da Meta:
- Ligações de voz (VoIP) de entrada e de saída pelo WhatsApp. Sinalização por Graph API + webhooks (padrão) ou SIP; mídia por **WebRTC** (ICE + DTLS + SRTP), áudio **OPUS** (também PCMA/PCMU).
- **Recebida:** webhook do campo `calls` com `event:"connect"`, `call_id` e `session.sdp` (offer). A empresa responde em ~30–60 s com `POST <PHONE_NUMBER_ID>/calls` e `action` = `pre_accept` → `accept` (com SDP answer), ou `reject` / `terminate`. **Ligações recebidas são gratuitas.**
- **Saída:** `POST <PHONE_NUMBER_ID>/calls` com `action:"connect"` + SDP offer; a SDP answer volta no webhook. Exige **permissão do cliente por par empresa×usuário** (mensagem de pedido de permissão). Limites de produção: **100 chamadas/dia por par**; 4 sem resposta seguidas revogam a permissão. Cobrança por **pulso de 6 s**; as tarifas em BRL passam a valer em **01/07/2026** (o valor exato não estava legível na página consultada: **conferir**).
- **Requisitos:** número **na Cloud API (não no app WhatsApp Business)**; app assinado no campo `calls`; permissão `whatsapp_business_messaging`; limite diário de mensagens **≥ 2.000 destinatários únicos**. Brasil é país suportado para saída.
- **Não verificado:** se o número pode ser migrado do app/Evolution GO para a Cloud API mantendo o histórico, e se a Coexistência (app + API no mesmo número) permite o Calling API (a documentação lida não diz). **Só o dono consegue confirmar no Business Manager.**
- Encaixe técnico: o **navegador do agente vira o telefone** (`RTCPeerConnection`): o backend (Edge Function) repassa SDP à Graph API; o webhook devolve a SDP answer. A opção SIP da Meta exigiria um servidor SIP nosso (o Bitrix24 SIP Connector não é um tronco genérico para a Meta; **não verificado**).

## 3. Caminho B — não oficial: Evolution GO PR #141 + `meowcaller`
- A `whatsmeow` nunca implementou atender chamada nem mídia. O PR **#141** da Evolution GO ("answer/dial/control WhatsApp calls and stream their audio/video over WebSocket") usa a biblioteca `purpshell/meowcaller` e adiciona: `POST /call/answer`, `/call/hangup`, `/call/dial` (saída), `/call/react`, `/call/video/upgrade` e outros, mais `GET /call/stream/:callId` (WebSocket com áudio **PCM16LE em base64**; vídeo H.264). O autor testou com conta e telefone reais (atender, rejeitar, desligar; áudio e vídeo).
- **Situação:** PR **aberto desde 29/07/2026, não mesclado**; a última versão publicada é a **0.7.2 (03/07/2026)**, sem isso. Seria preciso compilar e manter um fork próprio da Evolution GO. O `meowcaller` é projeto de pesquisa (MIT, 271 estrelas, 21 issues abertas) e o próprio DISCLAIMER diz que **não é autorizado nem afiliado à Meta/WhatsApp**.
- **Risco:** protocolo não oficial viola os termos do WhatsApp. O repositório registra um **bloqueio da Meta em 25/09/2026** (`PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS`). Perder o número principal seria grave.
- Esforço de tela: o front receberia PCM16 por WebSocket e teria de tocar/capturar áudio (AudioWorklet, reamostragem).

## 4. Caminho C — manter como está
Eventos e "atenda no aparelho". Já existe; não liga pelo WhatsApp.

## 5. Recomendação
**Caminho A em produção.** O caminho B só como laboratório, num **número reserva**, nunca no número principal. Antes de construir o A, o dono precisa confirmar no Business Manager: (1) o limite diário de mensagens do número (precisa ser ≥ 2.000 únicos); (2) se o número pode ir para a Cloud API ou se vale registrar um número novo só para ligações; (3) a tarifa em BRL.

## Fontes
- Meta, Calling API: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling (e subpáginas `user-initiated-calls`, `business-initiated-calls`, `calling/pricing`).
- Evolution GO, PR #141: https://github.com/evolution-foundation/evolution-go/pull/141 · `meowcaller`: https://github.com/purpshell/meowcaller
