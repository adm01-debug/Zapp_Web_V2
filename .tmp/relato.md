Especialista: worker

## O que mudou e por quê
- `docs/LGPD-RETENTION-POLICY.md` (v1.0 → v1.1): nova seção **§4.6 Operadores e sub-processadores — ElevenLabs
  (voz e transcrição)** com a tabela do que sai para o provedor (texto do roteiro nas Edges de síntese; áudio do
  cliente na transcrição; áudio do atendente na conversão de voz; áudio direto do navegador nos tokens de tempo
  real), a retenção no produto, a base legal e a pendência de confirmação contratual; cita a ADR-009; acrescenta o
  provedor ao §2 (sistemas abrangidos), marca o item de documentação no §9 e registra a revisão no §11.
- `docs/adr/ADR-009-elevenlabs-operador-de-dados.md` (novo): a ADR que a política cita. Traz a tabela das 11 Edges
  que falam com a ElevenLabs (endpoint e `arquivo:linha`), o que cada uma registra no log (tamanho/metadados) e no
  ledger, a base legal, a retenção do produto × a do provedor (a confirmar), a transferência internacional, a
  auditoria do webhook (allowlist, sem corpo cru) e as limitações declaradas.
- `docs/adr/README.md`: índice da ADR-009 (data 2026-10-13).

Fonte de cada fato: código da cópia viva da V2 (13/10), endereços em `supabase/functions/**` citados `arquivo:linha`
na ADR. Ledger = `ai_usage_logs` (`supabase/functions/_shared/ai-usage.ts:388`; metadados `provider`/`endpoint`/
`billing_unit`, nunca conteúdo) — a §4.6 e a ADR ficam consistentes com ele.

## Prova
- Item G11 exige "documento citado em `docs/LGPD-RETENTION-POLICY.md`": o §4.6 cita
  `docs/adr/ADR-009-elevenlabs-operador-de-dados.md` (link relativo `adr/ADR-009-...`) e o `docs/adr/README.md`
  indexa a 009.
- `zapp-verify . --rapido` → a linha de resultado está no bloco FATOS MEDIDOS deste fechar (verificação do cartão;
  verde).
- Grep das Edges citadas: `git grep -n "api.elevenlabs.io" -- supabase/functions/` lista as 11 Edges da tabela; o
  log de cada uma sai só com tamanho/metadados, exceto a divergência do item abaixo.

## O que NÃO fiz e por quê
- **Sem alterar código** (o cartão manda). Divergência encontrada fora do escopo de documentação: `elevenlabs-sfx/
  index.ts:30` interpola o **prompt textual** do usuário na mensagem de log — é a única Edge que manda texto para o
  log. As demais (TTS, TTS-stream, diálogo, STS, voice-changer, transcrição, tokens, voice-design) registram só
  tamanho/metadados. Registrado na ADR-009 ("Limitações declaradas") e na §4.6; a correção de código fica em cartão
  próprio (Edge), não neste.
- Sem teste novo: o cartão toca só `docs/` (nenhum teste cobre texto de política). Não afrouxei nem apaguei teste.
- Números de retenção do provedor (região, DPA/SCC, "retenção zero") **não** foram afirmados: não são verificáveis
  do repositório e dependem do contrato — a ADR fica *Proposed* até o dono confirmar.
