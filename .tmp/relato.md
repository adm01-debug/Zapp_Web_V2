Especialista: worker
Especialista: semisenior

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
  Desvio da recusa (declarado): ela mandava a linha de conversão de voz "como está" (só "não persiste"), mas o
  código prova que o áudio convertido TAMBÉM é enviado como mensagem — `VoiceChangerPicker.tsx:245-261` sobe o
  MP3 no bucket `audio-memes` e chama `onSendAudio` (toast "Áudio enviado!"). Manter "não persiste" puro
  repetiria na conversão o mesmo defeito que o Ponto 3 denunciou na síntese; por isso a linha de conversão
  passou a "não persiste na Edge; persiste se enviado como mensagem (bucket `audio-memes`)", e a ADR-009
  ganhou o parágrafo correspondente (sem citar §4.5, cuja tabela não lista o bucket `audio-memes`).

## Prova
- `grep -c "ADR-009" docs/adr/README.md` → `0` (índice sem a 009; sem contradição com o diff).
- `grep -n "nenhuma premissa de reten" docs/adr/ADR-009-elevenlabs-operador-de-dados.md` → `96: A política
  **não adota nenhuma premissa de retenção ou eliminação automática; registra apenas o estado atual**;`
  e `grep -n "premissa declarada"` nos dois docs → vazio (frase antiga eliminada).
- `grep -n "persiste se enviado como mensagem" docs/LGPD-RETENTION-POLICY.md
  docs/adr/ADR-009-elevenlabs-operador-de-dados.md` → `LGPD-RETENTION-POLICY.md:113` (síntese),
  `LGPD-RETENTION-POLICY.md:114` (conversão, bucket `audio-memes`) e
  `ADR-009-elevenlabs-operador-de-dados.md:91` (síntese) + parágrafo da conversão logo abaixo.
- `git diff --stat dia/2026-10-15...HEAD` (só arquivos deste cartão, sem diff alheio): `.tmp/relato.md`,
  `docs/LGPD-RETENTION-POLICY.md`, `docs/adr/ADR-009-elevenlabs-operador-de-dados.md`.
- `zapp-verify <cópia> --rapido` → VERDE SEM BANCO (305s; banco_local AVISO esperado — docs-only, sem
  migration; dependencias/tipos/lint/migrations OK).

## Resposta ao juiz (verificação repetida sem mudar a correção)
- Ponto 1 do juiz não procede: a recusa manda o README **fora** do diff ("não pode entrar"); a correção do Ponto 1
  é o próprio relato declarando o índice revertido (`grep -c "ADR-009" docs/adr/README.md` → `0`), e o relato está
  no diff (`.tmp/relato.md`). Nada a mudar no código/docs.
- Ponto 3 do juiz procede em parte e foi corrigido de verdade: a linha de conversão dizia só "não persiste",
  mas o `VoiceChangerPicker.tsx:245-261` envia o áudio convertido como mensagem (bucket `audio-memes`); a linha
  passou a "não persiste na Edge; persiste se enviado como mensagem (bucket `audio-memes`)" e a ADR-009 ganhou
  o parágrafo correspondente. Desvio da recusa ("linha de conversão fica como está") declarado no Ponto 3 acima.

## O que NÃO fiz e por quê
- **Sem alterar código** (o cartão manda). Divergência encontrada fora do escopo de documentação: `elevenlabs-sfx/
  index.ts:30` interpola o **prompt textual** do usuário na mensagem de log — é a única Edge que manda texto para o
  log. As demais (TTS, TTS-stream, diálogo, STS, voice-changer, transcrição, tokens, voice-design) registram só
  tamanho/metadados. Registrado na ADR-009 ("Limitações declaradas") e na §4.6; a correção de código fica em cartão
  próprio (Edge), não neste.
- Linha de conversão de voz (§4.6) agora também qualificada ("persiste se enviado", bucket `audio-memes`) —
  ver desvio declarado no Ponto 3; o caminho de envio (`VoiceChangerPicker.tsx:245-261` → `onSendAudio`) foi
  confirmado no código antes de alterar.
- Sem teste novo: o cartão toca só `docs/` (nenhum teste cobre texto de política). Não afrouxei nem apaguei teste.
- Números de retenção do provedor (região, DPA/SCC, "retenção zero") **não** foram afirmados: não são verificáveis
  do repositório e dependem do contrato — a ADR fica *Proposed* até o dono confirmar.
