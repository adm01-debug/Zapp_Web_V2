# Verificação adversarial do Bloco 02 (IA-011 a IA-014) — 29/09/2026

Este documento é o **laudo** do lote de contenção P0. Ele existe porque um PR verde não é
prova: o lote A passou em todos os gates, foi mergeado em `92cd8952` e **mesmo assim** tinha
duas regressões funcionais, uma cota inoperante e asserções de contrato vazias. Nada disso
aparece por leitura otimista — só por tentativa de quebrar.

## 1. Como foi verificado

Cinco verificadores independentes, em paralelo, cada um com uma lente e a instrução de
**tentar derrubar** as alegações (não de confirmá-las). Nenhum achado entrou sem comando e
saída crua; cada um declarou o que **não** conseguiu medir.

| # | Lente | Escopo |
|---|---|---|
| 1 | Identidade e cota | `_shared/ai-auth.ts`, ordem guarda×provedor nas 4 funções, varredura de completude dos 21 endpoints de IA |
| 2 | Webhook e dados | `_shared/webhook-signature.ts`, ordem veredito×gravação, allowlist de `audit_logs`, forja/replay |
| 3 | Banco e RLS | `_shared/ai-audio-authz.ts` + policies reais de `messages`/`storage.objects` + buckets (impersonation) |
| 4 | Cobertura e regressão | testes no CI, manifesto, chamadores das funções alteradas, **mutation testing** |
| 5 | Produção real | `list_edge_functions` (version/`updated_at`/`ezbr_sha256`), sondas HTTP, logs, `audit_logs` |

## 2. Achados e destino

### 2.1 Corrigidos no lote B (este PR)

| ID | Sev. | Achado | Evidência (antes) | Correção |
|---|---|---|---|---|
| **A1** | **crítico** | O cliente do `voice-agent` mandava a **anon key pública** como credencial; com a identificação exigida no lote A, ele passaria a receber **401 para 100% dos usuários** (comando de voz morto). | `src/hooks/communication/useVoiceAgent.ts:54` → `src/hooks/voice/processTranscript.ts:16-17` (`Authorization: Bearer ${supabaseKey}`), único call site de `voice-agent` | `useVoiceAgent` resolve `supabase.auth.getSession()` e envia `data.session?.access_token`; contrato trava isso |
| **A2** | **alto** | `classify-sticker` devolvia **403** ao chamador interno (webhook do WhatsApp, service role) → toda figurinha nova perdia a categoria sem erro visível. | `_shared/evolution-webhook-messages.ts:404` (service key) + `catch {}` em `:409` | passa a usar `requireAiIdentityOrService` (mesmo caminho do `ai-transcribe-audio`) |
| **F1** | baixo | Header de assinatura com chave repetida (`t=..,v0=..,v0=..`) fazia o parser **escolher** o valor ("último vence") — invertido, era recusado. | `webhook-signature.ts:46-50` | chave repetida ⇒ header malformado (recusa inteira) + 3 testes |
| **F4** | **médio** | As asserções de ordem do contrato eram **vazias**: `source.indexOf('verifyElevenLabsSignature')` casava a **linha de import**. Quatro mutações de ordem sobreviviam com o contrato verde. | mutantes M4/M5/M7/M8b sobreviveram no lote A | contrato lido **sem imports** + prova de mutação: **4/4 agora detectados** (§4) |
| **DB-F2** | médio | Não havia **nenhuma prova automatizada** da negação por RLS: os testes do lote A só cobriam rejeições anteriores ao banco. | `ai-audio-authz.test.ts` (4 casos, todos pré-banco) | `ai-audio-authz-runtime.test.ts`: zero linhas ⇒ 404, visível ⇒ `media_url`, erro ⇒ 500, e **o JWT do chamador viaja na consulta** |
| **F3** | info | A documentação dizia que `logElevenLabsAuthShadow` segue usado por evolution/whatsapp/gmail. Falso: cada webhook tem o seu helper e o da ElevenLabs é código morto. | `grep` nos 4 handlers | corrigido em `IA-011-a-IA-020-contencao-P0.md` |
| **A3/A6/…** | — | Texto do lote A dizia "sessão verificada **+ cota**" e "as outras 21 funções já chamavam `requireAuth` + `enforceAiGuards`". | ver §2.2 | corrigido em `IA-011-a-IA-020-contencao-P0.md` |

### 2.2 Pendentes, com destino (não são regressão deste PR)

| ID | Sev. | Achado | Evidência | Bloco |
|---|---|---|---|---|
| A3 | alto | **A cota é nominal**: as 4 funções nunca gravam em `ai_usage_logs`, então `enforceAiGuards` conta 0 e a cota diária nunca dispara. | `grep logAiUsage\|callAiWithTracking` = 0 hits nessas funções; teste com `count=501` responde 429 (o mecanismo funciona, falta a linha) | 06 |
| A4 | médio | `enforceAiGuards` **falha aberto** em erro de infra (PostgREST fora, tabela ausente, secret faltando) — a cota desaparece para todas as funções de IA. | `_shared/ai-guards.ts:49-52` (`if (error) return null`), `:56-59` (`catch → null`) | 06 |
| A5 | médio | Limite por IP em **memória do isolate** e com IP lido do trecho mais à direita do `x-forwarded-for` (controlável se o proxy não reescrever). | `ai-auth.ts:96-102`, `validation.ts:193-210`, `:262-270`; o limitador persistente (`consume_rate_limit`) já existe e não é usado | 06 |
| A6 | médio | **10 endpoints de IA paga** têm identidade mas nenhuma cota: `elevenlabs-tts`, `-tts-stream`, `-sfx`, `-sts`, `-dialogue`, `-voice-design`, `-agent-token`, `-scribe-token`, `voice-changer`, `sentiment-alert`. Dois deles **devolvem token ao cliente**, que passa a consumir por fora. | grep individuais por função | 06 |
| A7 | baixo | Recusas (401/403/429) não deixam trilha — só erro ≥ 500 é logado. | `validation.ts:122-133` | 06 |
| A8 | baixo | Normalização permissiva do header: `slice(7).trim()` aceita `\n`/`\t` no fim do token. | `ai-auth.ts:38` | 06 |
| F2 | baixo | O corpo é lido por inteiro (`req.text()`) antes de verificar, sem teto de tamanho. | `elevenlabs-webhook/index.ts:19` | 05 |
| F5 | baixo | A "allowlist" é de **campos**, não de valores: `status`/`entity_id` são escalares do emissor. | `index.ts:53-63` | 05 |
| DB-F1 | médio | A RLS de `messages` **não filtra ciclo de vida**: mensagem com `is_deleted=true` (ou contato excluído/conversa fechada) continua transcrevível por quem enxerga o contato. **Medido:** 49.318 mensagens, 132 apagadas, 7.875 com mídia e **12 com mídia em mensagem apagada** (0 em contato excluído/conversa fechada). | policy crua em §3 + SQL medido | 15 / 02 |
| DB-F3 | baixo (**confirmado**) | O bucket `audio-memes` é **público** (`storage.buckets.public=true`) e está na allowlist do endpoint. **Medido:** já existe **1 mensagem** com `media_url` nesse bucket (as demais: `whatsapp-media` 4.750, `audio-messages` 2.774, host externo 350) — para esse objeto, "conhecer a URL concede o áudio" é verdade hoje. | SQL medido + `storage.buckets` + `APPROVED_AUDIO_BUCKETS` | 02 |
| DB-F4 | baixo | `media_url` de host externo (ex.: `mmg.whatsapp.net`) ⇒ 400 falha fechada: áudio legado não transcreve. | amostra real de `messages.media_url` | 02 |
| P1 | **p0** | **Divergência merge→produção:** `classify-audio-meme` e `elevenlabs-webhook` ainda rodam o código **antigo**. | `ezbr_sha256`/`updated_at` inalterados + sonda 422 + log `[WEBHOOK_AUTH_SHADOW]` vivo | ver §5 |
| P2 | p1 | **Infra de deploy**: fila compartilhada (1 rodando + 1 pendente por grupo; o resto é cancelado) e o passo `Capturar e validar manifesto remoto pos-deploy` roda ~24 min e **falha em todos os runs** — `smoke` e `Registrar tag de deploy` nunca rodam. | runs 36601680272/36600998789/36583351162/36560547941; passo `Deploy` = 13 s | infra (fora do plano) |
| P3 | p1 | Instabilidade de produção na janela: Cloudflare 522 e `/auth/v1`/`/rest/v1` pendurados. | log de `talkx-scheduler` 19:52Z | infra |
| P4 | p2 | `version` da função **não** indica deploy (dezenas de funções ganharam +1 com `ezbr_sha256` idêntico). Só `ezbr_sha256`/`updated_at` valem. | dois snapshots de `list_edge_functions` | infra |

### 2.3 Depende de ação do Joaquim

- **`ELEVENLABS_WEBHOOK_SECRET` não existe nos Secrets da função** (provado por log de produção
  às 18:18:42Z: *"assinatura presente mas secret nao configurado"*). O código novo é **falha
  fechada**: publicado sem o secret, ele recusa **100%** dos eventos, inclusive os legítimos da
  ElevenLabs. Antes de publicar `elevenlabs-webhook`: criar o secret no Supabase (Edge Functions →
  Secrets) com o **mesmo valor** configurado no painel da ElevenLabs.
- As **duas** linhas criadas em `audit_logs` às 18:06:50Z e 18:11:15Z (`action=elevenlabs_webhook_unknown`,
  `details={"probe":"…"}`) são **das minhas sondagens** — foram elas que provaram que o defeito A9 estava
  vivo em produção. Existem outras 3 linhas antigas (agosto/2026, `details` vazio ou `x_invalid_payload`),
  que **não** são minhas. Não removi nenhuma: escrita em banco fora de migration é proibida para mim.

## 3. O que está provado (e como)

- **Buckets de áudio são privados.** `audio-messages`/`whatsapp-media` com `public=false`; a rota
  `/storage/v1/object/public/audio-messages/...` devolve **404 Bucket not found** para objeto real.
  As URLs em `media_url` são *locators*, não acesso.
- **A RLS nega de verdade.** `messages` com RLS ligada; único SELECT é `messages_select_policy` TO
  `authenticated` (três ramos: admin/supervisor, contato do agente, membro ativo da fila).
  Medido por impersonation na mesma execução: `anon`→0 linhas, `authenticated` sem perfil→0,
  admin→1, supervisor→1, dono→1. Negado o SELECT, negada a transcrição (404).
- **A `media_url` do registro é a fonte do objeto** — e agora isso é testado
  (`ai-audio-authz-runtime.test.ts`), não só lido.
- **O parser de assinatura resiste a forja**: sem secret, sem header, header malformado,
  `t` negativo/float/huge, HMAC de corpo A com corpo B, corpo com espaços/ordem de chaves/BOM,
  assinatura truncada ou com prefixo `sha256=` — tudo recusado. Tolerância ±300 s exata
  (301 recusado nos dois lados). Replay dentro da janela é aceito **de propósito** (bloco 05).
- **A ordem do handler do webhook** é: CORS → leitura do corpo → veredito → 401 se falhar →
  parse → `createClient` → insert. Nenhum efeito antes do veredito.
- **Ordem nas 5 funções de IA**: guarda antes de `requireEnv`, `req.json()` e `fetch` de provedor
  (voice-agent 90<113, classify-emoji 19<51, classify-sticker 17<38, classify-audio-meme 17<43,
  ai-transcribe-audio 71<168). Antes da guarda, só `handleCors`.
- **Nada mais no repo quebra**: `deno check` (67 `index.ts`), `typecheck`, `lint-ratchet` (0 novas),
  `db:guard` (0 novas), manifesto fresco (67 funções / 98 arquivos) e CI do #1205 verde nos 8 checks.

## 4. Prova de mutação (o contrato pega regressão?)

| Mutante | Antes (lote A) | Agora (lote B) |
|---|---|---|
| M4 — remover `audioUrl = objectAuthz.mediaUrl` | **sobreviveu** | **detectado** (1 falha) |
| M5 — baixar o objeto antes de autorizar | **sobreviveu** | **detectado** (2 falhas) |
| M7 — gravar em `audit_logs` antes do veredito | **sobreviviu** | **detectado** (1 falha) |
| M8b — chamar o provedor antes de autenticar | **sobreviveu** | **detectado** (1 falha) |
| M1 — `if (!secret)` devolvendo `ok:true` | detectado | detectado |
| M2 — desligar `isValidUUID` | detectado | detectado |
| M3 — remover o 403 de service role | detectado | detectado |

Script da prova: `/tmp/mut-b02b.py` (movimentos **reais** de código, nunca comentário; arquivo
restaurado em `finally`; `git diff --stat` conferido ao fim — zero mutante residual).

## 5. Estado de produção no fechamento deste laudo

| Função | Código novo em produção? | Prova |
|---|---|---|
| `ai-transcribe-audio` | **sim** (18:02:05Z) | `ezbr_sha256` novo + bundle com `requireAiIdentityOrService` |
| `voice-agent` | **sim** (18:27:21Z) | idem |
| `classify-emoji` | **sim** (19:17:19Z) | idem |
| `classify-sticker` | **sim** (19:42:24Z) | idem |
| `classify-audio-meme` | **não** | hash e `updated_at` de baseline |
| `elevenlabs-webhook` | **não, de propósito** | falta o secret (§2.3) |

Pendência operacional: publicar `classify-audio-meme` (fila de deploy, §2.2/P2) e, após o secret
existir, `elevenlabs-webhook`.

## 6. Lacunas desta verificação (o que não foi provado)

1. **RLS real fim-a-fim em teste automatizado** — a negação foi medida por SQL (impersonation), mas
   não há teste que rode a policy real no CI. O teste novo prova o contrato do módulo, não a policy.
2. **Comportamento do código novo em produção** — não observei o 401 vindo do próprio
   `requireAiIdentity` ao vivo: `/auth/v1` estava fora do ar na janela (522) e o gateway responde
   antes. Para as 4 publicadas, a prova é "código novo no bundle", não "resposta nova observada".
3. **Contagens por bucket e ciclo de vida** — medidas depois, pelo gateway MCP de leitura do projeto
   (`media_url`: `whatsapp-media` 4.750 / `audio-messages` 2.774 / externo 350 / `audio-memes` **1**;
   `messages`: 49.318 total, 132 apagadas, 7.875 com mídia, **12** com mídia apagada). O que segue não
   medido é apenas: quantas dessas 12 têm áudio transcrito por alguém de fora do escopo do contato.
4. **`x-forwarded-for` reescrito pelo proxy?** — não medido; se for reescrito, o A5 perde a parte
   de spoofing e resta o limite × isolates.
5. **`ELEVENLABS_WEBHOOK_SECRET` ausente** se apoia em uma linha de log (18:18:42Z) — nome de env
   divergente não foi descartado.
