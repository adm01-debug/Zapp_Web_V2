# Bloco 02 — Autenticação, autorização e privacidade (IA-011..IA-020)

**P0 do plano** — [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md).
Entregue em **dois lotes**, como o plano autoriza para contenção urgente ("lote mínimo próprio, com
testes e revisão"):

| Lote | Etapas | Conteúdo | Estado |
|---|---|---|---|
| **A — contenção** | IA-011, IA-012 (parcial), IA-013, IA-014 | identidade verificada nas funções sem nenhuma; assinatura de webhook bloqueante; autorização por objeto no áudio | mergeado em `92cd8952` (PR #1205) |
| **B — correções da verificação** | IA-011, IA-012, IA-013, IA-014 | as duas regressões funcionais que a verificação adversarial achou, header de assinatura ambíguo, contrato que provava ordem de verdade | **este PR** |
| **política** | IA-015, IA-016, IA-017, IA-019, IA-020 | leitura ≠ alteração por perfil, allowlist de endpoints/segredos, minimização de prompt, invalidação de caches | blocos 03/04/05 (ver tabela de etapas) |

**Laudo completo da verificação adversarial:** [`IA-011-a-IA-020-verificacao-adversarial.md`](./IA-011-a-IA-020-verificacao-adversarial.md)
— 5 verificadores independentes, achados com evidência crua, o que ficou pendente e **o que não foi
possível provar**.

## O que muda para quem usa

O lote A **não** era invisível para o usuário, ao contrário do que este documento afirmou antes: ele
quebrava o comando de voz (o cliente mandava a chave pública e passou a receber 401) e a classificação de
figurinhas recebidas (o webhook interno levava 403). **O lote B corrige as duas.** Depois dele o que
muda é só o que **deixa de ser possível**:

1. Nenhuma das 4 funções de IA paga processa requisição sem sessão de usuário verificada (antes,
   aceitavam qualquer portador da chave pública que o próprio front entrega no bundle).
2. O webhook da ElevenLabs recusa requisição sem assinatura válida e com timestamp fora da tolerância
   (antes: aceitava tudo e gravava o corpo cru em `audit_logs` com service role).
3. Transcrever áudio exige que a **mensagem** seja visível para quem pediu (antes: bastava conhecer o
   caminho do objeto no bucket privado).

## Etapas: o que foi feito, o que ficou e por quê

| Etapa | O que o plano pede | Estado | Onde / por quê |
|---|---|---|---|
| **IA-011** | Identidade verificada e autorização em toda entrada de IA | ✅ **feito** | `_shared/ai-auth.ts` aplicado em `voice-agent`, `classify-audio-meme`, `classify-emoji`, `classify-sticker` (as 4 sem nenhuma guarda — `IA-003` B1). **Correção do lote B:** o cliente do `voice-agent` passou a mandar o access token da sessão (`src/hooks/communication/useVoiceAgent.ts`). Ressalva medida: das outras funções de IA, as **21 exigiam identidade**, mas **10 endpoints de IA paga seguem sem cota** (`elevenlabs-*`, `voice-changer`, `sentiment-alert` — achado A6 do laudo) |
| **IA-012** | Separar identidades de serviço (usuário × worker × cron) | 🟡 **parcial** | `isServiceRoleRequest` compara em tempo constante; `requireAiIdentity` **recusa** identidade de serviço (403) e `requireAiIdentityOrService` aceita o worker interno com limite por IP. **Correção do lote B:** `classify-sticker` passou a usar o caminho `OrService` — com `requireAiIdentity` ele devolvia 403 ao webhook do WhatsApp (achado A2). Credencial de serviço **própria** (segredo dedicado, escopo mínimo, expiração) depende da fila/outbox do Bloco 05 |
| **IA-013** | Assinatura de webhook **validada de verdade** antes de qualquer efeito | ✅ **feito** | `_shared/webhook-signature.ts` + `elevenlabs-webhook/index.ts`: assinatura + timestamp + corpo original, **falha fechada** (sem secret → 401, não "processa mesmo assim"); `audit_logs` passa a gravar allowlist de campos, não o corpo cru. **Correção do lote B:** header com chave repetida (`v0=..,v0=..`) era resolvido por "último vence"; agora o header ambíguo é recusado (achado F1) |
| **IA-014** | Autorizar **cada objeto**, não só a origem da URL | ✅ **feito** | `_shared/ai-audio-authz.ts`: a mensagem é lida com o JWT do chamador (RLS decide), a `media_url` do registro é a fonte do objeto e a negativa é 404 idêntica para "não existe" e "não é seu". **Lote B:** ganhou teste de runtime (zero linhas ⇒ 404; visível ⇒ `media_url`; erro ⇒ 500) — antes só havia rejeições anteriores ao banco |
| **IA-015** | Distinguir leitura de alteração (perfil só-leitura não escreve) | 🟡 **parcial** | Aqui: identidade de serviço deixa de poder agir como usuário. O aceite pleno depende de um **papel somente-leitura**, que não existe no modelo (`IA-003` B10): decisão sua, bloco 19 |
| **IA-016** | Restringir destinos de rede (SSRF / exfiltração) | 🟡 **parcial** | O caminho de áudio usa allowlist de bucket + `_shared/ssrf.ts`. Falta a allowlist de **endpoint do provedor** (`custom_webhook` no `ai-proxy`) — Bloco 04 (`IA-035`/`IA-038`), mesmo arquivo |
| **IA-017** | Restringir a seleção de segredos do cofre | ⏭ **Bloco 04** | Mesmo arquivo (`ai-proxy`) e mesmo desenho do provider layer |
| **IA-018** | Revisar grants e permissões externas | ⏭ **externo (você)** | Não é código: depende de painel de terceiros (`IA-003` §D) |
| **IA-019** | Minimizar dados enviados a modelos | 🟡 **parcial** | Feito: o webhook não persiste mais corpo cru de terceiro. Minimização de **prompt** pertence aos blocos 03/08 |
| **IA-020** | Invalidar acessos e caches ao trocar contexto | ⏭ **blocos 03/07** | No servidor não há cache entre usuários (cada leitura revalida pelo JWT); o estado de tela é dos blocos 03/07 |

## Prova (o que foi medido, não afirmado)

### Teste que falha antes e passa depois (red-first)

`tests/contracts/ai-endpoints-auth.contract.test.ts` — **16 casos**. Exige, por leitura dos fontes:
guarda de identidade **antes** de qualquer chamada de provedor nas 4 funções; `requireAiIdentityOrService`
no `classify-sticker`; o cliente do voice-agent mandando o token da sessão; uso de
`assertMessageVisibleToCaller` **e** da `media_url` do registro antes do download; ausência da comparação
`===` com a service role key; verificador bloqueante no webhook, recusa antes de gravar e allowlist.

```
# ANTES do lote A (mesmo arquivo, código original):
 Tests  9 failed | 186 passed (195)
# depois do lote A:
 Test Files 8 passed (8) | Tests 195 passed (195)
# depois do lote B (contrato reescrito sem casar imports):
 Test Files 9 passed (9) | Tests 209 passed (209)
```

### Testes de unidade em Deno (35 casos)

```
deno test --config scripts/ci/deno.json --frozen --allow-env \
  supabase/functions/_shared/__tests__/webhook-signature.test.ts \
  supabase/functions/_shared/__tests__/ai-auth.test.ts \
  supabase/functions/_shared/__tests__/ai-audio-authz.test.ts \
  supabase/functions/_shared/__tests__/ai-audio-authz-runtime.test.ts \
  supabase/functions/_shared/__tests__/ai-auth-service-path.test.ts \
  supabase/functions/_shared/__tests__/webhook-signature-ambiguity.test.ts
ok | 35 passed | 0 failed
```

Cobrem: assinatura válida/expirada/futura (anti-replay), secret ausente (**falha fechada**), secret
errado, payload trocado, header malformado/legado/**ambíguo**, tolerância configurável, identidade de
serviço recusada (403), identidade de serviço aceita no caminho interno + teto por IP (429), ausência de
sessão (401), `messageId` ausente/fora de formato, negação por RLS (zero linhas ⇒ 404) sem vazar
existência, `media_url` do registro como fonte do objeto e o JWT do chamador viajando na consulta.

### Prova de regressão por mutação (o teste realmente pega?)

| Mutação aplicada ao código corrigido | Resultado |
|---|---|
| M1 `if (!secret) return { ok: false }` → `{ ok: true }` (volta a aceitar sem verificação) | **2 testes falham** |
| M2 `if (isServiceRoleRequest(req))` → `if (false && …)` (serviço volta a passar como usuário) | **1 teste falha** |
| M3 remover o 403 de service role em `requireAiIdentity` | **1 teste falha** |
| **M4** remover `audioUrl = objectAuthz.mediaUrl` (lote A: **sobreviveu**) | **1 falha agora** |
| **M5** baixar o objeto antes de autorizar por objeto (lote A: **sobreviveu**) | **2 falhas agora** |
| **M7** gravar em `audit_logs` antes do veredito (lote A: **sobreviveu**) | **1 falha agora** |
| **M8b** chamar o provedor antes de autenticar (lote A: **sobreviveu**) | **1 falha agora** |

Os quatro primeiros sobreviviam porque o contrato casava a **linha de import** em vez da chamada. Script
da prova: `/tmp/mut-b02b.py` (movimentos reais de código, nunca comentário; arquivo restaurado em
`finally`; `git diff --stat` conferido — zero mutante residual).

### Gates do projeto (exit code real)

| Gate | Resultado |
|---|---|
| `deno check` (typecheck das Edge Functions) nos 67 `index.ts` | exit 0 |
| `bun run test:contracts` | 209 passed |
| `bun run typecheck` (`tsc -b --force`) | exit 0 |
| `node scripts/ci/lint-ratchet.mjs` | baseline 971 / atual 955 / novas **0** |
| `bun run db:guard` | 1 violação no baseline / **0 novas**; 658 migrations válidas |
| `node scripts/edge-deploy/generate-manifest.mjs` | 67 funções, **98** arquivos-fonte, sha256 `989a3a6b…` |
| `gh pr checks 1205` | 8/8 verdes (Lint, Unit, Build, E2E, Security, Contrato DB offline, SonarCloud, CodeQL) |

## ⚠️ Três coisas que dependem de você antes de isto valer em produção

1. **`ELEVENLABS_WEBHOOK_SECRET` precisa existir nos Secrets das Edge Functions antes do deploy do
   `elevenlabs-webhook`.** A verificação é **falha fechada**: sem o secret o endpoint responde 401 e os
   eventos legítimos da ElevenLabs deixam de ser aceitos. O secret tem de ser o **mesmo** configurado no
   painel da ElevenLabs. **Provado em produção:** em 29/09 18:18:42Z o log diz *"assinatura presente mas
   secret nao configurado"* — o secret **não está** lá hoje.
2. **Deploy das funções.** O merge dispara o `deploy-functions.yml` automaticamente (não há card de
   aprovação no environment `producao-edge-functions`; a versão anterior deste documento dizia que havia).
   O que trava é a **infra**: fila compartilhada entre chats (1 rodando + 1 pendente por grupo) e o passo
   `Capturar e validar manifesto remoto pos-deploy` que roda ~24 min e **falha em todos os runs** — com
   isso, `smoke` e `Registrar tag de deploy` nunca executam. Estado no fechamento deste laudo:
   `ai-transcribe-audio`, `voice-agent`, `classify-emoji` e `classify-sticker` **publicados**;
   `classify-audio-meme` pendente de fila; `elevenlabs-webhook` retido pelo item 1.
3. **A cota das funções de IA é nominal hoje.** As 4 funções corrigidas não registram consumo em
   `ai_usage_logs`, e `enforceAiGuards` conta linhas dessa tabela — logo a cota diária nunca dispara
   (achado A3 do laudo; guarda ligada, ledger no Bloco 06). O mesmo vale para os 10 endpoints de IA paga
   listados em A6.

## Achados fora do escopo (não corrigidos de passagem)

| # | Achado | Onde |
|---|---|---|
| 1 | `logElevenLabsAuthShadow` é **código morto** (nenhum handler o importa). A leitura anterior, de que ele "segue usado por Evolution/WhatsApp/Gmail", era **imprecisa**: cada webhook tem o seu próprio helper (`logWebhookAuthShadow`, `logGmailOidcAuthShadow`, `WebhookSecurityService`) e todos seguem em modo sombra sem bloquear (`IA-003` A9 nos demais) | `_shared/hmac-validation.ts` + `webhook-auth-shadow.test.ts` |
| 2 | `elevenlabs-voice-design` cria voz persistente na conta compartilhada sem dono nem papel (`IA-003` B3) | bloco 13 |
| 3 | Voz/modelo escolhidos pelo cliente em `elevenlabs-tts/-tts-stream/-sts/-dialogue` (`IA-003` B4) | bloco 13 |
| 4 | Idempotência de **evento repetido** no webhook (dedup por id de evento) precisa de estrutura durável — vai com o ledger/outbox do Bloco 05 | bloco 05 |
| 5 | Consumo pago das funções `elevenlabs-*`, `voice-agent`, `classify-*` e `ai-transcribe-audio` continua **fora** do ledger de uso (`IA-003` B6) — é a causa do item 3 acima | bloco 06 |
| 6 | A RLS de `messages` não filtra ciclo de vida: mensagem apagada (`is_deleted=true`) continua transcrevível por quem enxerga o contato (achado DB-F1 do laudo; **medido:** 12 mensagens apagadas com mídia) | bloco 15/02 |
| 7 | O bucket `audio-memes` é **público** e está na allowlist do endpoint de transcrição (achado DB-F3, **confirmado**: 1 `media_url` já aponta para lá) | bloco 02 (próximo lote) |

## Aceite

- [x] As 4 funções de IA paga que não tinham identidade exigem sessão verificada e passam pela guarda de
      cota — **com a ressalva medida** de que a cota só passa a contar quando o consumo for registrado
      (Bloco 06, item 3 acima).
- [x] O cliente do `voice-agent` manda o token da sessão (a regressão A1 do lote A não existe mais).
- [x] O chamador interno de serviço do `classify-sticker` é aceito pelo caminho correto (regressão A2).
- [x] A comparação de service role key não é mais `===` (tempo constante) e o caminho de serviço tem limite.
- [x] Webhook da ElevenLabs recusa assinatura ausente/inválida/expirada/**ambígua** antes de qualquer
      gravação, e não persiste mais o corpo cru.
- [x] Áudio só é baixado depois de provar visibilidade da mensagem com o JWT do chamador; a URL do
      registro é a fonte do objeto — agora com teste de runtime.
- [x] Cada correção tem teste que falha antes e passa depois, mais prova de mutação — inclusive as 4
      mutações que **sobreviviam** ao contrato do lote A.
- [x] Etapas não fechadas neste lote estão declaradas com destino (bloco) e motivo.
- [ ] **Pendente de você:** criar `ELEVENLABS_WEBHOOK_SECRET`, publicar `classify-audio-meme` (fila) e,
      depois do secret, publicar `elevenlabs-webhook`.
