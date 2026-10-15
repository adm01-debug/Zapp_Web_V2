# ADR-009: ElevenLabs registrada como operador de dados (voz e transcrição)

- **Status:** Proposed — aguarda a confirmação do contrato do provedor pelo dono (região de
  processamento, DPA/SCC e retenção do lado do provedor)
- **Data:** 2026-10-13
- **Contexto:** lacuna G11 do relatório da auditoria de paridade V3 → V2 (arquivo de trabalho
  `paridade-11/achados_2_ia_voz.md`, item 51): a `docs/LGPD-RETENTION-POLICY.md` não citava a
  ElevenLabs, embora as funções de voz e transcrição enviem texto de conversa e áudio a esse
  provedor.

## Contexto

O Zapp Web V2 atua como **operador** de dados (documento de retenção, §3): trata dados pessoais
em nome do controlador. As funções de voz e transcrição do produto enviam, para um provedor
externo (ElevenLabs), duas categorias de conteúdo:

- **texto** escrito pelo atendente ou gerado pelo produto (síntese de voz, diálogo, design de
  voz, efeitos/música) — pode conter dados pessoais quando o roteiro cita o cliente;
- **áudio** do cliente (transcrição de mensagens recebidas) e do atendente (conversão de voz,
  conversa em tempo real).

Até esta ADR, esse fluxo não estava registrado na política de retenção: o documento listava
tabelas e buckets, mas nenhum operador/sub-processador externo. Sem o registro, não há base
documental para o titular saber que o conteúdo da conversa sai da infraestrutura do produto.

## Decisão

Registrar a **ElevenLabs** como **operador/sub-processador** do Zapp Web V2 para as
capacidades de voz e transcrição, com o que sai, a finalidade, a base legal, a retenção do lado
do provedor e a transferência internacional declarados. O detalhe vive nesta ADR; a política
de retenção resume e cita este documento (§4.6).

### O que sai para a ElevenLabs

| Edge (V2) | O que sai | Endpoint no provedor | Chamador |
|---|---|---|---|
| `elevenlabs-tts` | texto da mensagem (roteiro do atendente) | `/v1/text-to-speech` (`supabase/functions/elevenlabs-tts/index.ts:33`) | front, autenticado |
| `elevenlabs-tts-stream` | texto da mensagem, em streaming | `/v1/text-to-speech/<voz>/stream` (`elevenlabs-tts-stream/index.ts:34`) | front, autenticado |
| `elevenlabs-dialogue` | roteiro de diálogo multi-voz (texto) | `/v1/text-to-dialogue` (`elevenlabs-dialogue/index.ts:71`) | front, autenticado |
| `elevenlabs-sts` | **áudio do atendente** gravado no app | `/v1/speech-to-speech/<voz>` (`elevenlabs-sts/index.ts:145`) | front, autenticado |
| `voice-changer` | **áudio do atendente** gravado no app | `/v1/speech-to-speech/<voz>` (`voice-changer/index.ts:79`) | front, autenticado |
| `ai-transcribe-audio` | **áudio do cliente** (mensagem recebida) | `/v1/speech-to-text` (`ai-transcribe-audio/index.ts:447`) | front e webhook de serviço |
| `elevenlabs-scribe-token` | nenhum conteúdo: emite credencial de uso único | `/v1/single-use-token/realtime_scribe` (`elevenlabs-scribe-token/index.ts:23`) | front, autenticado |
| `elevenlabs-agent-token` | nenhum conteúdo: emite credencial de sessão de conversa | `/v1/convai/conversation/token` (`elevenlabs-agent-token/index.ts:25`) | front, autenticado |
| `elevenlabs-voice-design` | descrição textual da voz (e o texto de prévia) | `/v1/text-to-voice/create-previews` e `create-voice-from-preview` (`elevenlabs-voice-design/index.ts:34,101`) | front, autenticado |
| `elevenlabs-sfx` | prompt textual de efeito/música | `/v1/sound-generation` e `/v1/music` (`elevenlabs-sfx/request.ts:20,25`) | front, autenticado |
| `elevenlabs-webhook` | **entrada** (o provedor envia eventos ao produto) | n/a (`elevenlabs-webhook/index.ts`) | provedor |

**Conexão direta do navegador (dois casos):** o token de transcrição em tempo real e o token de
conversa do agente são usados pelo navegador com o SDK `@elevenlabs/react`
(`src/components/inbox/RealtimeTranscription.tsx:2`, `src/hooks/communication/useVoiceAgent.ts:2`).
Nesses dois fluxos o áudio do microfone sai **direto do dispositivo para a ElevenLabs**, sem
passar pela Edge do produto; o servidor só emite a credencial de uso único.

### O que as Edges registram (log e ledger)

Nenhuma Edge de **síntese/conversão/transcrição** grava o texto ou o áudio: o log carrega
**tamanho e metadados**, nunca o conteúdo.

| Edge | O que registra no log | Ledger (`ai_usage_logs`) |
|---|---|---|
| `elevenlabs-tts` | nº de caracteres, voz, modelo (`index.ts:29`) | sim — unidade `character` (`:59-74`) |
| `elevenlabs-tts-stream` | nº de caracteres, voz (`index.ts:30`) | sim — unidade `character` (`:60`) |
| `elevenlabs-dialogue` | nº de linhas do roteiro (`index.ts:67`) | sim — unidade `character` (`:93`) |
| `elevenlabs-sts` | tamanho do áudio, voz, modelo (`index.ts:137`) | sim — unidade `second` (`:158`) |
| `voice-changer` | preset, tamanho do áudio (`index.ts:66`) | **não** (dívida declarada; ver limitações) |
| `ai-transcribe-audio` | bucket/path do objeto, tamanho/tipo, tamanho da transcrição (`index.ts:428,496`) | **não** (dívida declarada; ver limitações) |
| `elevenlabs-scribe-token` | apenas o evento (`index.ts:20`) | sim — `none`, `usage_unknown` (`:32`) |
| `elevenlabs-agent-token` | `agent_id` (`index.ts:21`) | sim — `none`, `usage_unknown` (`:35`) |
| `elevenlabs-voice-design` | tamanho da descrição, nome da voz (`index.ts:31,98`) | sim — unidade `request` (`:43,109`) |
| `elevenlabs-sfx` | **o prompt textual** (`index.ts:30`) — divergência aberta, ver limitações | sim — unidade `request` (`:46`) |
| `elevenlabs-webhook` | `request_id` do evento (`index.ts:145`) | n/a |

O **ledger de IA** (`ai_usage_logs`) é a fonte única do consumo pago: cada linha grava
`function_name`, `user_id`, modelo, status e `durationMs`, e o detalhe do provedor vai em
`metadata` (`provider: "elevenlabs"`, `endpoint`, `billing_unit`, `billing_quantity`,
`http_status`) — as colunas de token ficam NULL com `usage_unknown: true` quando a unidade não é
token (`supabase/functions/_shared/ai-usage.ts:388`; IA-053 — "não medi" nunca vira 0). O ledger
guarda **metadados de consumo, nunca o texto nem o áudio**.

### Retenção, base legal e transferência internacional

- **Base legal:** a mesma que rege a conversa de atendimento (§4.1 do documento de retenção) —
  execução de contrato / legítimo interesse **do controlador**. O Zapp Web trata os dados como
  operador, por instrução do controlador; o consentimento, quando exigido, é coletado pelo
  controlador.
- **Retenção do lado do produto:** a transcrição do áudio do cliente é gravada na tabela
  `messages` (`ai-transcribe-audio/index.ts:495`) e segue a retenção de `messages` (§4.1:
  2 anos, anonimizar). Os áudios continuam nos buckets (§4.5). As Edges não persistem conteúdo
  por si — devolvem o áudio/transcrição e descartam.
  O áudio sintetizado **persiste se enviado como mensagem (§4.5)** (botão "Enviar Áudio":
  `TextToAudioButton.tsx:113-131` grava via `ChatService.uploadAudio`, `chat.service.ts:111`,
  no bucket `audio-messages`). O mesmo vale para o áudio convertido: o `VoiceChangerPicker`
  ("Enviar", `VoiceChangerPicker.tsx:245-261`) sobe o MP3 no bucket `audio-memes` e chama
  `onSendAudio`, que envia como mensagem — portanto também **persiste se enviado** (sem prazo
  de retenção declarado para o bucket `audio-memes`, que não consta da tabela do §4.5).
- **Retenção do lado do provedor:** **a confirmar com o dono**. O contrato/plano da ElevenLabs
  (que define a retenção do provedor) não é verificável do repositório.
  A política **não adota nenhuma premissa de retenção ou eliminação automática; registra apenas o estado atual**;
  a confirmação contratual é requisito para que esta ADR passe de *Proposed* a *Accepted*.
- **Transferência internacional:** o provedor não opera no Brasil — há transferência
  internacional de texto e áudio. A região de processamento e o instrumento contratual
  (DPA / cláusulas-padrão) também precisam ser confirmados no contrato.

### Auditoria do webhook de entrada

O `elevenlabs-webhook` **não** grava o corpo cru do provedor: depois do endurecimento IA-013 /
IA-WEBHOOK-001, a linha em `audit_logs` guarda só um allowlist — `event_type`, `request_id`,
`status` e `signature_verified` (`elevenlabs-webhook/index.ts:116-127`), com `dedupe_key` estável
e retenção de `audit_logs` (§4.3: 5 anos, obrigação legal).

## Consequências

- Positivas: o titular e o controlador passam a ter registro do operador de voz/transcrição, do
  que sai, para onde vai e por quê; a documentação fica consistente com o ledger de consumo e com
  o log real das Edges.
- Negativas / riscos: (1) a retenção do provedor e o instrumento de transferência internacional
  seguem **não confirmados** — a ADR fica *Proposed* até o dono confirmar o contrato; (2) duas
  Edges (`voice-changer`, `ai-transcribe-audio`) fazem chamada paga sem linha no ledger (dívida
  declarada, cartões G3/G4 do mesmo relatório).

## Limitações declaradas (não mascaradas)

1. **`elevenlabs-sfx` loga o prompt.** `elevenlabs-sfx/index.ts:30` interpola o prompt textual do
   usuário na mensagem de log. É a única Edge que manda texto para o log; as demais registram só
   metadados. Corrigir exige alterar código, fora do escopo desta ADR (achado G11 é
   documentação); a correção segue em cartão próprio.
2. **Ledger ausente em duas Edges.** `voice-changer` e `ai-transcribe-audio` não importam
   `logAiUsageDetached` (`_shared/__tests__/consumo-pago-no-ledger.test.ts` lista ambas como
   `PENDENTES_DECLARADAS`); o consumo pago dessas duas não aparece no relatório de custo.
3. **Estado de produção não certificado.** Esta ADR descreve o código do repositório; quais
   Edges estão publicadas e qual o plano contratado da ElevenLabs não foram verificados.

## Referências

- `docs/LGPD-RETENTION-POLICY.md` §4.6 (resumo e citação desta ADR)
- Relatório da auditoria de paridade V3 → V2: item 51 / lacuna G11 (`paridade-11/achados_2_ia_voz.md`)
- `supabase/functions/_shared/ai-usage.ts` (ledger `ai_usage_logs`)
- ADR-004 (gates), ADR-005 (máquina de estados de conversa)
