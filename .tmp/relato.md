Especialista: edgar

## Ponto 1 — sanitizeInstanceResponse lia o corpo duas vezes (recusa: `response.json()` consome; `return response` devolve corpo já lido)
Mudei `supabase/functions/evolution-api/index.ts`: `TOKEN_KEYS`, `TOKEN_CONTAINER_KEYS`, `stripInstanceToken` e `sanitizeInstanceResponse` saíram de dentro do `handleEvolutionApi` para escopo de módulo (`sanitizeInstanceResponse` agora exportada). A função lê o corpo UMA vez com `const raw = await response.text()`, tenta `JSON.parse(raw)` e, se falhar, devolve `new Response(raw, { status: response.status, headers: response.headers })` — status e corpo não-JSON chegam intactos. Os 3 call sites (`list-instances`, `instance-info` GO e v2) passam `corsHeaders` explicitly. Os demais chamadores de `stripInstanceToken` (`create-connection`, linhas ~469/~512) resolvem para a mesma função em escopo de módulo, código idêntico movido — comportamento deles inalterado (Deno type-check + suite verde prova).
Teste: `R2EXT-AGENDA: sanitizeInstanceResponse devolve resposta não-JSON intacta (status e corpo)` — chama a função real com `Response` 502 HTML e confere status 502 e corpo byte a byte.

## Ponto 2 — faltava teste do caminho de erro do provedor (502 HTML em `instance-info`)
Acrescentei em `supabase/functions/evolution-api/index.test.ts` o teste `R2EXT-AGENDA: instance-info (v2) com erro não-JSON do provedor não vira 500`: servidor falso local responde 502 HTML, o handler `instance-info` é chamado de verdade e a prova confere `status !== 500`, envelope `{ error: true }` e `status: 502` preservado no corpo. Nota técnica (verificado no código, `evolution-api-proxy.ts`): o proxy converte erro do provedor no envelope JSON `{ error: true, status }` ANTES do sanitize — por isso o ponta a ponta prova envelope+status, e a preservação byte a byte do corpo não-JSON é provada pelo teste direto do Ponto 1.
Vermelho antes: com o `index.ts` antigo (via `git stash` só dele), a suite nem compila — `sanitizeInstanceResponse` não era exportada (`error: Type checking failed` no import do teste). Verde depois: `ok | 37 passed | 0 failed`.

## Ponto 3 — teste de 403 só conferia POST (`fake.posts`); relato dizia "ZERO I/O"
Troquei nos 3 testes `R2EXT-AGENDA: <ação> sem papel devolve 403` o fake `createFakeEvolution` (só registra POST em `posts`) pelo `createInstanceReadFake` local, que registra TODA requisição (GET e POST) em `fake.requests`, e a asserção virou `fake.requests.length === 0`. Um GET ao provedor agora falharia o teste; antes passaria despercebido. Vale para as 3 ações (`find-chats`, `find-contacts`, `get-media-base64`). Também restaurei no teste `list-instances (v2)` a asserção de rota (`fake.gets.includes("/instance/fetchInstances")`) e o `assertSemCredencial` (cobre token aninhado), para não afrouxar o teste ao reescrevê-lo.

## Ponto 4 — SÓ O RELATO: primeira linha e `fetch-profile-picture` em tela de agente
Primeira linha agora exatamente `Especialista: edgar`. Sobre `fetch-profile-picture`: `git grep -n "fetch-profile-picture\|fetchProfilePicture" -- src/ tests/ e2e/` encontra SÓ o exportador `src/hooks/integrations/useEvolutionApi.ts:35` e testes de payload/hook; `git grep -- 'src/components/**' 'src/pages/**' 'src/features/**'` mostra que nenhuma tela chama `fetchProfilePicture` (a `InstanceSettingsDialog` usa `getSettings/setSettings/fetchProfile/updateProfile*`, sem `fetchProfilePicture`/`fetchBusinessProfile`). Mantido em control sem quebrar UI. `stripInstanceToken` não tem chamador em `_shared/` (só no próprio `index.ts`, acima) — a mudança hash+arrays não afeta outro módulo.

## Arquivos (`git diff --name-only`)
supabase/functions/evolution-api/index.test.ts
supabase/functions/evolution-api/index.ts

## Verificação
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts` → `ok | 37 passed | 0 failed`
- `--filter "R2EXT-AGENDA"` → `ok | 10 passed | 0 failed | 27 filtered out`
- `deno test ... supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 10 passed | 0 failed`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (22s)` (OK db_guard/tipos/lint/migrations; `banco_local` AVISO = sem nome de conjunto — o cartão não tem migration)

## Classes finais (pedido original, item 4)
- **control:** find-chats, find-contacts, find-messages, find-status-messages, get-media-base64, get-settings, get-webhook, fetch-profile, fetch-profile-picture, fetch-business-profile, find-labels, find-templates, get-chatwoot, get-typebot, typebot-sessions, get-openai, get-dify, get-flowise, get-evolution-bot, get-rabbitmq, get-sqs, get-proxy, get-evoai, get-n8n, get-kafka, get-nats, get-pusher, get-catalog, get-collections (movidos neste trabalho sobre a base).
- **read:** list-instances, status, instance-info, check-numbers, list-groups, group-info, group-participants, group-invite-code, invite-info.
- **send:** inalterado.
