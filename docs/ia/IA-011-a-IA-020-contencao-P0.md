# Bloco 02 — Autenticação, autorização e privacidade (IA-011..IA-020)

**P0 do plano** — [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md).
Este bloco foi entregue em **dois lotes**, como o próprio plano autoriza para contenção urgente
("lote mínimo próprio, com testes e revisão"):

| Lote | Etapas | Conteúdo | Estado |
|---|---|---|---|
| **A — contenção** | IA-011, IA-012 (parcial), IA-013, IA-014 | identidade verificada nas funções sem nenhuma; assinatura de webhook bloqueante; autorização por objeto no áudio | **este PR** |
| **B — política** | IA-015, IA-016, IA-017, IA-019, IA-020 | leitura ≠ alteração por perfil, allowlist de endpoints/segredos, minimização de prompt, invalidação de caches | blocos 03/04/05 (ver tabela de etapas) |

**Referência de execução:** `origin/main` @ `5c34975ebbe95ae806702816f9c6f84ecfa98130`
(tree `9777322613f1b39a3cfdf4265e6465f25e67b3ff`, 29/09/2026 14:40 -0300).
**Branch:** `hermes/ia-bloco-02-autenticacao-2609291441ea04`.

## O que muda para quem usa

Nada muda no uso normal — e é isso que se espera de um lote de contenção. O que muda é o que **deixa de
ser possível**:

1. Nenhuma função de IA paga processa requisição sem sessão de usuário verificada (antes, 4 delas
   aceitavam qualquer portador da chave pública que o próprio front entrega no bundle).
2. O webhook da ElevenLabs recusa requisição sem assinatura válida, com timestamp dentro da tolerância
   (antes: aceitava tudo e gravava o corpo cru em `audit_logs` com service role).
3. Transcrever áudio exige que a **mensagem** seja visível para quem pediu (antes: bastava conhecer o
   caminho do objeto no bucket privado).

## Etapas: o que foi feito, o que ficou e por quê

| Etapa | O que o plano pede | Estado | Onde / por quê |
|---|---|---|---|
| **IA-011** | Identidade verificada e autorização em toda entrada de IA | ✅ **feito** | `_shared/ai-auth.ts` (`requireAiIdentity`) aplicado em `voice-agent`, `classify-audio-meme`, `classify-emoji`, `classify-sticker` — as 4 que não tinham identidade, cota nem trilha (`IA-003` B1). As outras 21 funções de IA já chamavam `requireAuth` + `enforceAiGuards`; conferido por leitura, sem alteração |
| **IA-012** | Separar identidades de serviço (usuário × worker × cron) | 🟡 **parcial** | `isServiceRoleRequest` compara a service role key em tempo constante e o worker (`evolution-webhook`) passa a ter limite por IP; `requireAiIdentity` **recusa** a identidade de serviço nos endpoints de usuário (403). Credencial de serviço **própria** (segredo dedicado, escopo mínimo, expiração) depende da fila/outbox do Bloco 05 — criar agora seria criar a estrutura que aquele bloco substitui |
| **IA-013** | Assinatura de webhook **validada de verdade** antes de qualquer efeito | ✅ **feito** | `_shared/webhook-signature.ts` + `elevenlabs-webhook/index.ts`: assinatura + timestamp + corpo original, **falha fechada** (sem secret configurado → 401, não "processa mesmo assim"); gravação em `audit_logs` passa a ser allowlist de campos, não o corpo cru |
| **IA-014** | Autorizar **cada objeto**, não só a origem da URL | ✅ **feito** | `_shared/ai-audio-authz.ts`: a mensagem é lida com o JWT do chamador (RLS decide), a `media_url` do registro passa a ser a fonte do objeto baixado, e a negativa é 404 idêntica para "não existe" e "não é seu" |
| **IA-015** | Distinguir leitura de alteração (perfil só-leitura não escreve) | 🟡 **parcial** | Neste PR: identidade de serviço deixa de poder agir como usuário. O aceite pleno depende de um **papel somente-leitura** que não existe no modelo (`IA-003` B10 — `admin`/`supervisor`/`agent` apenas): é decisão sua, no bloco 19 |
| **IA-016** | Restringir destinos de rede (SSRF / exfiltração) | 🟡 **parcial** | O caminho de áudio já usava allowlist de bucket + `_shared/ssrf.ts`; o que falta é a allowlist de **endpoint do provedor** (`custom_webhook` no `ai-proxy`) — vai junto com a reescrita do provedor no Bloco 04 (`IA-035`/`IA-038`), onde o mesmo código é tocado |
| **IA-017** | Restringir a seleção de segredos do cofre | ⏭ **Bloco 04** | Mesmo arquivo (`ai-proxy`) e mesmo desenho do provider layer; fazer agora = fazer duas vezes |
| **IA-018** | Revisar grants e permissões externas | ⏭ **externo (você)** | Não é código: depende de acesso ao painel do CRM/terceiros. Sem alteração aqui (registrado em `IA-003` §D) |
| **IA-019** | Minimizar dados enviados a modelos | 🟡 **parcial** | Feito: o webhook não persiste mais corpo cru de terceiro. A minimização de **prompt** (fontes internas, notas, dados de contato) pertence aos blocos 03/08, que reescrevem os prompts |
| **IA-020** | Invalidar acessos e caches ao trocar contexto | ⏭ **blocos 03/07** | No servidor não há cache de resultado entre usuários (cada leitura revalida pelo JWT). O estado de tela (memória, histórico, ações pendentes) é o mesmo arquivo dos blocos 03/07 — `/workspace` de frontend |

## Prova (o que foi medido, não afirmado)

### Teste que falha antes e passa depois (red-first)

`tests/contracts/ai-endpoints-auth.contract.test.ts` (9 casos) exige, por leitura dos fontes: guarda de
identidade **antes** de qualquer chamada de provedor nas 4 funções, uso de `assertMessageVisibleToCaller`
**antes** do download do áudio, ausência da comparação `===` com a service role key, uso do verificador
bloqueante no webhook e ausência de gravação do corpo cru.

```
# ANTES do fix (mesmo arquivo, código original):
 Tests  9 failed | 186 passed (195)
# DEPOIS:
 Test Files 8 passed (8)  |  Tests 195 passed (195)
```

### Testes de unidade em Deno (22 casos, todos os adversariais cobertos)

```
deno test --config scripts/ci/deno.json --frozen --allow-env \
  supabase/functions/_shared/__tests__/webhook-signature.test.ts \
  supabase/functions/_shared/__tests__/ai-auth.test.ts \
  supabase/functions/_shared/__tests__/ai-audio-authz.test.ts
ok | 22 passed | 0 failed
```

Cobrem: assinatura válida/expirada/futura (anti-replay), secret ausente (**falha fechada**), secret
errado, payload trocado, header malformado/legado, tolerância configurável, identidade de serviço
recusada (403), ausência de sessão (401), `messageId` ausente/fora de formato, e negativa que não vaza
existência.

### Prova de regressão por mutação (o teste realmente pega?)

| Mutação aplicada ao código corrigido | Resultado |
|---|---|
| `if (!secret) return { ok: false }` → `{ ok: true }` (volta a aceitar sem verificação) | **2 testes falham** (`SEM secret configurado`, `nenhuma entrada adversária produz ok=true`) |
| `if (isServiceRoleRequest(req))` → `if (false && …)` (serviço volta a passar como usuário) | **1 teste falha** (`identidade de serviço é recusada (403)`) |

Ambas as mutações foram revertidas; nenhuma sobra no diff (`grep -rn "MUTAÇÃO TEMPORÁRIA\|false &&"` = vazio).

### Gates do projeto (exit code real)

| Gate | Resultado |
|---|---|
| `deno check` (typecheck das Edge Functions) nos 6 arquivos alterados | limpo |
| `bun run test:contracts` | 195 passed |
| `bun run typecheck` (`tsc -b --force`) | exit 0 |
| `node scripts/ci/lint-ratchet.mjs` | baseline 971 / atual 966 / novas **0** |
| `bun run db:guard` | 1 violação no baseline / **0 novas**; 655 migrations válidas |
| `node scripts/edge-deploy/generate-manifest.mjs` | 67 funções, **98** arquivos-fonte, sha256 `893121a8…` (regerado: +3 módulos compartilhados) |

## ⚠️ Duas coisas que dependem de você antes de isto valer em produção

1. **Deploy manual das 4 funções + webhook** (environment protegido `producao-edge-functions`): o merge
   não põe a correção no ar. Enquanto não houver deploy, o achado P0 continua vivo em produção.
2. **Secret `ELEVENLABS_WEBHOOK_SECRET`** precisa existir nos Secrets das Edge Functions **antes** do
   deploy do `elevenlabs-webhook`. A verificação agora é **falha fechada**: sem o secret, o endpoint
   responde 401 e os eventos legítimos da ElevenLabs (faturamento/status de TTS) deixam de ser aceitos.
   O secret precisa ser o **mesmo** configurado no painel da ElevenLabs para o webhook.

## Achados fora do escopo (não corrigidos de passagem)

| # | Achado | Onde |
|---|---|---|
| 1 | `logElevenLabsAuthShadow` fica **sem uso** depois desta mudança — o helper de modo sombra continua existindo para os outros 3 webhooks (Evolution, WhatsApp, Gmail), que ainda observam assinatura sem bloquear (`IA-003` A9 nos demais) | `_shared/hmac-validation.ts` + `webhook-auth-shadow.test.ts` |
| 2 | `elevenlabs-voice-design` cria voz persistente na conta compartilhada sem dono nem papel (`IA-003` B3) | bloco 13 |
| 3 | Voz/modelo escolhidos pelo cliente em `elevenlabs-tts/-tts-stream/-sts/-dialogue` (`IA-003` B4) | bloco 13 |
| 4 | Idempotência de **evento repetido** no webhook (dedup por id de evento) precisa de estrutura durável — vai com o ledger/outbox do Bloco 05 | bloco 05 |
| 5 | Consumo pago das funções `elevenlabs-*`, `voice-agent`, `classify-*` e `ai-transcribe-audio` continua **fora** do ledger de uso (`IA-003` B6) | bloco 06 |

## Aceite

- [x] As 4 funções de IA paga que não tinham identidade agora exigem sessão verificada e passam por cota.
- [x] A comparação de service role key não é mais `===` (tempo constante) e o caminho de serviço tem limite.
- [x] Webhook da ElevenLabs recusa assinatura ausente/inválida/expirada **antes** de qualquer gravação, e
      não persiste mais o corpo cru.
- [x] Áudio só é baixado depois de provar visibilidade da mensagem com o JWT do chamador; a URL do
      registro passou a ser a fonte do objeto.
- [x] Cada correção tem teste que falha antes e passa depois, mais prova de mutação.
- [x] Etapas não fechadas neste lote estão declaradas com destino (bloco) e motivo — nenhuma foi
      silenciosamente ignorada nem "resolvida pela metade".
- [ ] **Pendente de você:** aprovar o deploy das funções e criar `ELEVENLABS_WEBHOOK_SECRET` (ver acima).
