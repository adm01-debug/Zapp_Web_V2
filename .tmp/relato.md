Especialista: worker

## O que mudou e por quê
- `docs/LGPD-RETENTION-POLICY.md` (v1.0 → v1.1): nova seção **§4.6 Operadores e sub-processadores — ElevenLabs
  (voz e transcrição)** com a tabela do que sai para o provedor (texto do roteiro nas Edges de síntese; áudio do
  cliente na transcrição; áudio do atendente na conversão de voz; áudio direto do navegador nos tokens de tempo
  real), a retenção no produto, a base legal e a pendência de confirmação contratual; cita a ADR-009; acrescenta o
  provedor ao §2 (sistemas abrangidos), marca o item de documentação no §9 e registra a revisão no §11.
  Linha de síntese corrigida nesta rodada: "não persiste na Edge; persiste se enviado como mensagem (§4.5)".
- `docs/adr/ADR-009-elevenlabs-operador-de-dados.md` (novo): a ADR que a política cita. Traz a tabela das 11 Edges
  que falam com a ElevenLabs (endpoint e `arquivo:linha`), o que cada uma registra no log (tamanho/metadados) e no
  ledger, a base legal, a retenção do produto × a do provedor (a confirmar, sem premissa adotada), a transferência
  internacional, a auditoria do webhook (allowlist, sem corpo cru) e as limitações declaradas.
- `docs/adr/README.md`: **não** entrou no diff — o portão de saída acusa arquivo modificado fora da lista do cartão
  (`docs/ (o documento de LGPD indicado no item G11)`); a linha do índice foi revertida para o conteúdo da base. A
  ADR-009 segue alcançável pela citação no §4.6 da política.

Fonte de cada fato: código da cópia viva da V2 (13/10), endereços em `supabase/functions/**` citados `arquivo:linha`
na ADR. Ledger = `ai_usage_logs` (`supabase/functions/_shared/ai-usage.ts:388`; metadados `provider`/`endpoint`/
`billing_unit`, nunca conteúdo) — a §4.6 e a ADR ficam consistentes com ele.

## Pontos do revisor ([refazer 1])
- Ponto 1: relato afirmava que o `docs/adr/README.md` indexava a 009, mas o diff mostra o índice revertido.
  Corrigido neste relato: a seção Prova abaixo declara `grep -c "ADR-009" docs/adr/README.md` → `0` (índice sem a
  009, revertido de propósito); seção Prova única, sem duplicata.
- Ponto 2: frase "adota como premissa declarada a retenção mínima" removida da ADR-009; no lugar
  (ADR-009, retenção do lado do provedor): "não adota nenhuma premissa de retenção ou eliminação
  automática; registra apenas o estado atual".
- Ponto 3: confirmado no código que o áudio sintetizado PODE ser enviado como mensagem — cadeia:
  `ChatInputToolbars.tsx:81` (`onAudioReady={onAudioSend}`) → `TextToAudioButton.tsx:113-131`
  ("Enviar Áudio" entrega o blob sintetizado) → `ChatPanel.tsx:483`
  (`onAudioSend={(blob) => handlers.handleAudioSend(blob, onSendAudio)}`) →
  `useRealtimeInbox.ts:186` (`ChatService.uploadAudio` + `sendMessage(..., 'audio', ...)`) →
  `chat.service.ts:111-114` (upload no bucket `audio-messages`, retenção §4.5: 2 anos). Por isso a coluna
  Retenção no produto (§4.6) e a ADR-009 agora dizem "persiste se enviado como mensagem (§4.5)".

## Prova
- `grep -c "ADR-009" docs/adr/README.md` → `0` (índice sem a 009; sem contradição com o diff).
- `grep -n "nenhuma premissa de reten" docs/adr/ADR-009-elevenlabs-operador-de-dados.md` → `96: A política
  **não adota nenhuma premissa de retenção ou eliminação automática; registra apenas o estado atual**;`
  e `grep -n "premissa declarada"` nos dois docs → vazio (frase antiga eliminada).
- `grep -n "persiste se enviado como mensagem" docs/LGPD-RETENTION-POLICY.md
  docs/adr/ADR-009-elevenlabs-operador-de-dados.md` → `LGPD-RETENTION-POLICY.md:113` e
  `ADR-009-elevenlabs-operador-de-dados.md:91`.
- `git diff --stat 93360f20be^...HEAD` (só arquivos deste cartão, sem diff alheio): `.tmp/relato.md`,
  `docs/LGPD-RETENTION-POLICY.md`, `docs/adr/ADR-009-elevenlabs-operador-de-dados.md`.

## O que NÃO fiz e por quê
- **Sem alterar código** (o cartão manda). Divergência encontrada fora do escopo de documentação: `elevenlabs-sfx/
  index.ts:30` interpola o **prompt textual** do usuário na mensagem de log — é a única Edge que manda texto para o
  log. As demais (TTS, TTS-stream, diálogo, STS, voice-changer, transcrição, tokens, voice-design) registram só
  tamanho/metadados. Registrado na ADR-009 ("Limitações declaradas") e na §4.6; a correção de código fica em cartão
  próprio (Edge), não neste.
- Linha de conversão de voz (§4.6) mantida como "não persiste": o `VoiceChangerPicker` envia por outro caminho
  (bucket `audio-memes`, `VoiceChangerPicker.tsx:201-224`), fora do ponto 3 da recusa (só síntese). Achado registrado
  em `kanban_comment`, sem alterar — correção, se desejada, em cartão próprio.
- Sem teste novo: o cartão toca só `docs/` (nenhum teste cobre texto de política). Não afrouxei nem apaguei teste.
- Números de retenção do provedor (região, DPA/SCC, "retenção zero") **não** foram afirmados: não são verificáveis
  do repositório e dependem do contrato — a ADR fica *Proposed* até o dono confirmar.
