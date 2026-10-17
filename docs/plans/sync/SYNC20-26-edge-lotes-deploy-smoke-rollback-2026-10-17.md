# SYNC20-26 — Edge: lotes, ordem de deploy, smoke e rollback (plano; nenhum deploy)

Cartão: `t_3aa66bf7`. Especialista: Edgar (area-edge-api). Data: 17/10/2026.
Escopo: **DOC-ONLY, LOCAL-ONLY.** Este documento não sobe nada; descreve o que o dono executa.
Base deste plano: branch `v2/sync20-26-...` a partir de `dia/2026-10-17` (HEAD `d723a90107`); remoto de referência `origin/main` = `a9b4d6c6fb`.

## 0. Veredito em uma linha

O sync de Edge **não é um "sobe tudo"**: `_shared/cors-origins.ts` (novo) é importado — via `_shared/validation.ts` — pelas **84** funções do remoto, então esse arquivo sobe primeiro e sozinho; o resto sobe em lotes que fecham contrato (webhooks, tracking, envio, e-mail, IA, auth) e o rollback é **por grupo que compartilha `_shared`**, nunca função a função, porque uma Edge nova com `_shared` velha (ou o contrário) quebra em runtime.

## 1. Insumos (mapas aceitos, cada um na sua rama)

| Cartão | Rama | Commit | Arquivo lido |
|---|---|---|---|
| SYNC20-08 | `v2/sync20-08-edge-resgate-3-funcoes-so-orig-261017095806bf` | `471132efac` | diff: 3 funções só-origin + `supabase/config.toml` + manifesto |
| SYNC20-10 | `v2/sync20-10-seguranca-banco-rls-26101709499002` | `902ea8fb53` | `docs/audits/AUDITORIA_SYNC20-10_SEGURANCA_BANCO_2026-10-17.md` |
| SYNC20-16 | `v2/sync20-16-mensageria-talkx-multiplix-2610171101300d` | `10808547b5` | `docs/plans/sync/F06-F15-mensageria-talkx-multiplix-mapa-2026-10-17.md` |
| SYNC20-17 | `v2/sync20-17-ia-divergencias-2610171114c1fc` | `ca6776b874` | `docs/plans/sync/SYNC20-17-ia-divergencias-funcoes-flags-2026-10-17.md` |
| (AG3, mapa F15) | — | `be74dc5b7` | `docs/plans/sync/F06-F07-F15-edge-ci-mapa-2026-10-17.md` |

Os mapas moram em ramas que ainda não foram integradas a esta; por isso o plano os cita por rama + commit, em vez de copiá-los.

## 2. Estado medido (o que os lotes têm de fechar)

Medido em `HEAD` e em `origin/main` neste workspace:

| Métrica | HEAD (`dia/2026-10-17`) | `origin/main` |
|---|---|---|
| Funções em `supabase/functions/<nome>/index.ts` | 81 | 84 |
| Funções em `supabase/deployment-manifest.json` | 81 | 84 |
| Arquivos-fonte do bundle (`source_file_count`) | 162 | 168 |
| `verify_jwt: true` / `false` | 67 / 14 | 70 / 14 |
| Seções `[functions.*]` em `supabase/config.toml` | 18 | 19 |

Só-origin (existem no remoto, não no HEAD): `_shared/cors-origins.ts`, `_shared/sts-upload.ts`, `_shared/talkx-tracking-token.ts` e as funções `ai-usage-outbox-drain`, `automation-suggest-reply`, `invite-user`.
Só-HEAD: nenhuma.
Só-origin em `config.toml`: `[functions.invite-user]` (`verify_jwt = true`).

Arquivos de função com conteúdo divergente entre HEAD e `origin/main`: **43** = 11 em `_shared/` + 32 entrypoints (lista nominal no mapa F06 do AG3). Os 81 menos esses 32 não têm diff de fonte próprio; mudam só pelo bundle porque importam `_shared/`.

Reprodução (rodado agora, verde):

    node scripts/edge-deploy/generate-manifest.mjs --check
    -> Edge manifest OK: 81 functions, 162 source files, sha256=d6433a04...
    jq -r '.summary' supabase/deployment-manifest.json
    -> {"function_count":81,"source_file_count":162,"verify_jwt_true":67,"verify_jwt_false":14}
    jq -r '[.functions[]|select(.verify_jwt==false)]|length' (origin/main)  -> 14

## 3. Grafo de dependência do bundle (por que `_shared` vem antes)

O bundle de cada função embute os `_shared/` que ela importa (o manifesto lista `source_files` por função). Consumidores medidos no manifesto de `origin/main`:

| Arquivo `_shared/` | Quem importa (medido) | Consequência de subir fora de ordem |
|---|---|---|
| `cors-origins.ts` (novo) | **84 funções** (todas, via `validation.ts`) | É a base: sobe primeiro, em commit próprio |
| `validation.ts`, `schemas.ts`, `secure-random.ts` | praticamente todas | idem — mudam o digest de quase todo o manifesto |
| `sts-upload.ts` (novo) | `elevenlabs-sts`, `voice-changer` | essas 2 falham se subirem antes |
| `talkx-tracking-token.ts` (novo) | `talkx-link`, `talkx-send` | idem |
| `evolution-webhook-messages.ts` + `evolution-webhook-handlers.ts` | `evolution-webhook` e, por reuso, `classify-sticker`, `fetch-link-preview`, `recover-message-media` | par que sobe junto; quem reusa tem de ser rechecado no mesmo lote |
| `evolution-api-proxy.ts` | `evolution-api`, `message-delivery`, `multiplix-send`, `talkx-send/process-recipient` | sobe depois do lote de tracking |
| `evolution-control-authz.ts`, `evolution-types.ts` | família evolution/multiplix | idem |
| `gmail-helpers.ts` | família `gmail-*` | junto do lote de e-mail |
| `cron-secret-auth.ts` | funções de cron | junto do lote de cron |
| `ai-feature-flags.ts` | família `ai-*` | junto do lote de IA (tem teste próprio — ver §6) |

Regra de ouro: **quem importa sobe depois de quem é importado.** Um deploy de função cujo import não existe ainda falha na publicação; uma Edge antiga com `_shared` novo pode aceitar tráfego com contrato misto (sem crash, o que é pior).

## 4. Lotes (ordem de deploy)

Cada lote = uma janela de `workflow_dispatch` do `deploy-functions.yml` (ver §5). Para cada lote: `dry_run=true` primeiro, depois real. Não misture lotes na mesma janela.

- **L0 — base `_shared` (sem webhook).** `_shared/cors-origins.ts` (novo), `_shared/sts-upload.ts` (novo), `_shared/validation.ts`, `_shared/schemas.ts`, `_shared/secure-random.ts`, `_shared/cron-secret-auth.ts`, `_shared/gmail-helpers.ts`. É o lote que muda o `deployment-manifest.json` inteiro; sobe em commit próprio e **antes de tudo**. Nada de função de negócio aqui além das que fecham com esses arquivos.
- **L1 — webhooks (par obrigatório).** `_shared/evolution-webhook-messages.ts` + `_shared/evolution-webhook-handlers.ts` + `evolution-webhook/index.ts`, no mesmo dispatch; rechecagem nominal de `classify-sticker`, `fetch-link-preview`, `recover-message-media` (mesmo lote ou L7, desde que o par já esteja no ar).
- **L2 — tracking Talk X (trio).** `_shared/talkx-tracking-token.ts` + `talkx-send/index.ts` + `talkx-send/process-recipient.ts` + `talkx-link/index.ts`.
- **L3 — envio/mensageria.** `_shared/evolution-api-proxy.ts`, `_shared/evolution-control-authz.ts`, `_shared/evolution-types.ts` + `evolution-api/index.ts`, `multiplix-send/index.ts`, `talkx-scheduler/index.ts`, `talkx-report/index.ts`, `message-delivery`. **Depois de L2** (o `process-recipient` que consome `evolution-api-proxy` já está no ar).
- **L4 — e-mail.** `gmail-oauth/index.ts`, `gmail-sync/index.ts`, `gmail-cron-sync/index.ts`, `gmail-send/index.ts`, `gmail-webhook/index.ts`, `send-email/index.ts`, `send-scheduled-report/index.ts`.
- **L5 — IA.** `_shared/ai-feature-flags.ts` + `ai-suggest-reply/index.ts`, `ai-transcribe-audio/index.ts`, `elevenlabs-sfx/index.ts`, `elevenlabs-sts/index.ts` (depende do `sts-upload` de L0), `voice-changer/index.ts` + as novas `ai-usage-outbox-drain/index.ts`, `automation-suggest-reply/index.ts`.
- **L6 — auth + config.** `auth-login/index.ts`, `create-user/index.ts`, `revoke-auth-sessions/index.ts`, `webauthn/index.ts`, `approve-password-reset/index.ts`, `detect-new-device/index.ts`, `invite-user/index.ts` (nova) — esta última **junto** da seção `[functions.invite-user] verify_jwt = true` que o SYNC20-08 acrescentou ao `config.toml`.
- **L7 — restantes.** `batch-fetch-avatars/index.ts`, `connection-health-check/index.ts`, `crm-integration/index.ts`, `webhook-diagnostic/index.ts`, `get-sip-password/index.ts`, e os reusos de L1 que sobrarem.
- **L8 — verify_jwt=false e cron, um a um.** As 14 sem gateway (`auth-login`, `batch-fetch-avatars`, `connection-health-check`, `crm-integration`, `csp-report`, `elevenlabs-webhook`, `evolution-webhook`, `gmail-cron-sync`, `gmail-webhook`, `public-api`, `searchbox-budget-alert`, `sync-call-records`, `talkx-link`, `whatsapp-webhook`) e as alimentadas por cron sobem **um dispatch por função**, com o smoke extra de §5. `public-api` responde 410 (desativada) — o smoke confere o 410.

Cobertura: os 43 arquivos divergentes + 3 `_shared` novos + 3 funções novas + `config.toml` + manifesto ficam todos assignados a um lote acima; `ai-usage-outbox-drain`/`automation-suggest-reply`/`invite-user` entram em L5/L6 junto do `verify_jwt=true` que o manifesto lhes dá.

## 5. Smoke por lote

O que o CI **já** roda por função depois de cada deploy (`smoke-functions.mjs`, dentro do próprio workflow) prova só o contrato de borda, não a regra de negócio:

- `OPTIONS` com origem permitida (`https://zapp-web-v2.vercel.app`) → `200/204` **com** `access-control-allow-origin` daquela origem (CORS libera o certo);
- `OPTIONS` com origem negada (`https://edge-smoke.invalid`) → sem `access-control-allow-origin` igual à origem nem `*` (CORS não vaza);
- `POST` anônimo (sem JWT) → **401** em toda função `verify_jwt=true` e nas 3 de auth interna (`crm-integration`, `connection-health-check`, `batch-fetch-avatars`);
- `public-api` → **410**.

Isso **não** prova assinatura de webhook, idempotência, rate-limit nem o caminho de negócio. Por lote, quando o lote toca esses pontos, o responsável roda também (fora do CI, contra o ambiente de destino):

- **L1 (webhooks):** POST sem assinatura HMAC → 401/403 **e** o evento não é processado (nada gravado); POST com assinatura inválida → nega; a taxa de duplicação do `evolution-webhook` devolve **429 com `Retry-After`** (risco W2 do mapa de mensageria).
- **L2/L3 (Talk X / envio):** reenvio do mesmo `?r=<token>` **não** grava a linha duas vezes (idempotência por token — W4); `away-message` não duplica o envio quando o mesmo webhook chega repetido (W3).
- **L5 (IA):** a resposta de `ai-suggest-reply` **não** devolve nome de contato em log/corpo (LGPD — o mapa de IA tirou o nome da requisição); `elevenlabs-sfx` e `ai-transcribe-audio` recusam mimetype/bytes inválidos **antes** de chamar o provedor.
- **L6 (auth):** `auth-login` mantém a mesma resposta para "não existe" e "senha errada" (status + corpo) e não revela existência de conta.
- **L8 (verify_jwt=false/cron):** a função nega sem o segredo/assinatura própria (o gateway não protege); `csp-report` e `searchbox-budget-alert` continuam aceitando só o chamador esperado.

O dry-run de cada lote publica o plano local × remoto (`deploy-plan.mjs`), e a atestação pós-deploy (`collect-remote.mjs`) confirma que o digest remoto bateu com o manifesto. Só depois disso o smoke por função é lido.

## 6. Rollback

Não existe "rollback de uma Edge" no Supabase: o que existe é **republicar uma versão anterior**. O caminho real é o input `source_ref` do `deploy-functions.yml` — "SHA/tag anterior da main para rollback". Então:

- **Rollback de um lote = re-disparar o workflow com `source_ref=<sha do commit imediatamente anterior ao lote>`**, para o **mesmo conjunto de funções** do lote (não uma função solta). O `concurrency` é **por função**, então redisparar a mesma função troca só o pendente dela; funções diferentes não se anulam — dá para reverter o lote em paralelo.
- **Rollback de L0 (`_shared`) é o mais sensível:** o `_shared` antigo é incompatível com as Edges novas que passaram a depender de `cors-origins.ts`. Se L0 precisar voltar, ele volta **em bloco** com todos os lotes que já subiram depois dele (voltar à árvore do commit pré-L0), porque uma `validation.ts` velha não exporta o que os entrypoints novos importam.
- **Antes de reverter, congele a fila:** nenhum dispatch de função do conjunto pode estar pendente no grupo de concorrência dela, senão o redeploy de rollback entra atrás do deploy ruim.
- **Registre a reversão:** o workflow grava `register-deployment.mjs`; o registro tem de apontar o novo SHA e o escopo, para a atestação seguinte não confundir reversão com deriva.

## 7. Riscos abertos (do que os mapas levantaram)

| Risco | Onde | Mitigação no deploy |
|---|---|---|
| `verify_jwt` | 14 funções sem gateway (L8) | sobem uma a uma, com o smoke de negação (§5) |
| `rate-limit` do webhook | `evolution-webhook` (L1) | provar 429 + `Retry-After` antes de liberar o lote |
| idempotência de mentira | `away-message` (W3), Talk X `?r=` (W4) | reenvio no smoke não pode gravar/duplicar |
| LGPD | IA deixou de logar nome do contato (L5) | smoke checa que o nome não sai no corpo/log |
| flag sem consumidor | `ai-feature-flags.ts` CV-010 (L5) | decisão do SYNC20-17 sobre o teste (manter o arquivo de teste atual vs. trazer o extra) tem de estar fechada **antes** de L5; resgatar o arquivo sem o teste derruba o teste local |
| `public-api` desativada | L8 | smoke espera 410; não "consertar" para 200 |

## 8. Gates (entrada e saída)

Antes de abrir a primeira janela (entrada):

- `node scripts/edge-deploy/generate-manifest.mjs --check` verde na árvore que vai subir (§2).
- `supabase/config.toml` congelado e com as 19 seções; `[functions.invite-user] verify_jwt = true` presente.
- Suíte verde: unit tests de `scripts/ci/` e `scripts/edge-deploy/`; banco reconciliado (achados do SYNC20-10: `app_settings` órfão, deriva de `realtime`, `schema-manifest` defasado) fechados pela trilha de banco (SYNC20-23) — **enquanto o banco não estiver reconciliado, não se abre janela.**
- `dry_run=true` do primeiro lote publica o plano sem publicar nada.

Depois de cada lote (saída):

- Atestação pós-deploy verde (digest remoto = manifesto) e smoke por função sem `FAIL` para o escopo do lote.
- Zero `changed_outside_scope` inesperado: como o `escopo all` publica cada função, **não rode `escopo all` junto de deploy por função**.
- `register-deployment` gravou o SHA e o escopo do lote.

## 9. Critério de parada (abortar o lote)

Pare e não abra o lote seguinte se, no lote corrente: (a) a atestação não estabilizar em 10 min (passo tem teto próprio) — o run **não** termina em success; (b) qualquer função do lote der `FAIL` no smoke de negação; (c) a contagem do manifesto não bater com o esperado; (d) aparecer mudança de contrato com quem chama de fora (ex.: `source_ref`, assinatura `v1` do Bitrix). Em qualquer desses casos, a ação é **reverter o lote** (§6) e escalar para o dono — Edge não tem "meio deploy".

## 10. Limites deste documento

- Não executa nada: nenhum `workflow_dispatch`, nenhum `supabase functions deploy`, nenhum toque em produção.
- Não decide *quem* tem permissão de abrir a janela: `workflow_dispatch` só roda em `refs/heads/main` e no environment `producao-edge-functions` — a autorização é do Joaquim.
- Não substitui a ordem por **conteúdo** das tabelas dos mapas: para cada arquivo, o detalhe do que mudou está nos mapas de origem (SYNC20-08/10/16/17 e AG3/F06).
