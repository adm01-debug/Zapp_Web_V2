Especialista: Edgar (area-edge-api)

## O que mudou e por quê
Cartão composto — 5 defeitos no `evolution-api`, todos na mesma tela de conexões.

- `supabase/functions/evolution-api/index.ts` — (1) connect/status/disconnect falavam
  DIRETO com a Evolution (fora do proxy), sem timeout e sem catch: provedor pendurado
  segurava a função até o limite da plataforma e o front recebia 500 cru. Agora cada
  `fetch` leva `AbortSignal.timeout(sessionTimeoutMs())` (env
  `EVOLUTION_SESSION_TIMEOUT_MS`, default 10s) e o throw/aborto vira
  `200 { error:true, status:0, message }` pelo helper `providerUnreachable`; o poll de
  QR (`fetchQr`) engole o abort e devolve vazio em vez de subir 500. O `status` de
  dentro do connect GO passou a devolver a mesma resposta amigável.
- `index.ts` — (2) `delete-instance` com a instância já ausente na Evolution devolvia
  404 e travava o front, deixando a linha de `whatsapp_connections` fantasma na lista.
  Agora, sem id na GO (ou 404 na exclusão, reconhecido por `isInstanceGonePayload`),
  apaga a linha local, trilha `connection_deleted` com `details.reason=instance_gone`
  e devolve `{ error:true, code:'INSTANCE_GONE' }` (200) para o front recarregar.
  Erro NÃO-ausência (5xx etc.) mantém o comportamento anterior (devolve o corpo do erro).
- `index.ts` + `supabase/functions/_shared/schemas.ts` — (3) `create-connection` gravava
  o telefone cru do formulário. Passei a validar/normalizar por
  `normalizeBrazilianPhone` (novo, em `schemas.ts`) antes do INSERT e a usar o valor
  normalizado no corpo enviado à Evolution: DDD na lista válida, tamanho 10/11 após
  tirar o DDI 55, inserção do nono dígito em celular antigo; saída E.164 só-dígitos com
  DDI 55 (mesmo formato canônico de `_shared/messaging/phone.ts`). Telefone inválido →
  `422 VALIDATION_ERROR`, sem tocar o provedor.
- `schemas.ts` — (4) `EvolutionApiRequestSchema` ganhou um `superRefine` que trava
  `instanceName`/`instance` em `/^[A-Za-z0-9_-]{1,128}$/` (o nome vira path/query da
  URL do provedor). `index.ts` também passou `encodeURIComponent` no filtro de
  `list-instances`.
- `index.ts` — (5) teto por USUÁRIO além do teto por IP: `create-connection`,
  `delete-instance` e `disconnect` caem no balde `mut` (10/60s) e o poll de `status`
  do QR num balde `poll` (120/60s), DEPOIS da matriz de autorização (quem não tem
  permissão não consome cota). Corte em 429 com mensagem amigável, sem I/O no provedor.
- `supabase/functions/evolution-api/index.test.ts` — 11 testes novos (B2-01..B2-08),
  incluindo o connect pendurado de verdade (`fake-evolution` modo `timeout`), o 404 da
  GO, telefone inválido e o estouro do teto por usuário. `supabase/deployment-manifest.json`
  regenerado por `node scripts/edge-deploy/generate-manifest.mjs`.

## Prova
- vermelho antes: `git checkout HEAD~1 -- supabase/functions/evolution-api/index.ts supabase/functions/_shared/schemas.ts && deno test --allow-all --no-check --filter "B2-" supabase/functions/evolution-api/index.test.ts`
  → `./supabase/functions/evolution-api/index.test.ts (uncaught error) ... FAILED | 0 passed | 1 failed (9ms)`
  (o módulo sob teste não existia com timeout, INSTANCE_GONE nem telefone validado).
- verde depois: `deno test --allow-all --no-check supabase/functions/evolution-api/index.test.ts`
  → `ok | 52 passed | 0 failed (5s)`
  (no B2-01 o log do próprio handler mostra `"error":"The operation was aborted due to timeout"`,
  provando que o ramo de timeout foi exercitado, não o de resposta rápida.)

## Sensibilidade
Toca `delete` de `whatsapp_connections` e teto de requisição (rota que usa `is_admin`,
`checkRateLimit`). Nada foi afrouxado: o gate admin-only da exclusão continua (CX0 passou),
a exclusão só acontece no caminho de ausência do provedor, e o teto é mais restritivo que
antes, não mais frouxo. Nenhum acesso a produção; `EVOLUTION_API_URL` sempre aponta para
servidor local falso. Muda para quem chama `evolution-api`: `delete-instance` pode devolver
`{ error:true, code:'INSTANCE_GONE' }` em vez de 404, e `create-connection` pode devolver
422 para telefone inválido (antes gravava o valor cru).

## Ressalva
O gate do schema recusa (422) nomes de instância fora de `[A-Za-z0-9_-]` em qualquer ação.
O front gera esses nomes (`generateInstanceName` → `[a-z0-9_]`) e as conexões legadas em
uso são seguras; se alguma instância legada tiver nome com espaço/acento, ela passaria a
receber 422 e precisaria ser renomeada. Registrei aqui porque é mudança de contrato.

## O que NÃO fiz e por quê
- Não mexi em `evolution-session-routes.ts`: com o gate do schema, o nome já não entra
  cru na URL, e o `encodeURIComponent` no filtro cobre a query — mudar a montagem de rota
  não era necessário e aumentaria o diff.
- Não adicionei retry ao ciclo de sessão: o proxy (fora do escopo) já tem circuit breaker;
  aqui o problema era o 500 cru, que o timeout+catch resolve.
