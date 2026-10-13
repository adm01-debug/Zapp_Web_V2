Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- `supabase/functions/message-delivery/index.ts`: o corpo de erro da entrega passa a carregar
  `error` (mensagem fixa pt-BR), `code` (estável), `retryable` e `ambiguous`. Fonte única do código
  por ramo: `classifyProviderFailure()` (recusa do provedor) + `unconfirmedReceiptFailure()` /
  `preDispatchFailure()`; o corpo é montado só em `deliveryFailureBody()`/`deliveryFailureResponse()`.
  Assim EV1/M2 conseguem traduzir "número inválido" sem confundir com "instância desconectada" e
  sem oferecer reenvio cego quando o POST já saiu.
- `supabase/functions/message-delivery/index.test.ts`: testes de RAMO de verdade do handler (o
  handler ganhou um parâmetro opcional `deps` só para isto; os defaults de produção são os reais
  `requireAuth`/`enforceRateLimit`/`createClient`/`requireEnv`/`evoFetch`).

Mapa por ramo (antes → depois):
- taxa do próprio Zapp estourou: `errorResponse('Rate limit exceeded', 429)` → `429` + `code=rate_limited`, `retryable=true`, `ambiguous=false`.
- claim vazio e não enviado: `errorResponse('...already in progress...', 409)` → `409` + `code=in_progress`.
- recusa 4xx do provedor: `502` "Message provider rejected the delivery" → `422` `invalid_number` (número/não registrado), `409` `instance_unavailable` (instância desconectada/401), ou `422` `provider_rejected` (demais).
- 429 do provedor: → `429` + `code=rate_limited`.
- 5xx do provedor: `502` → `502` + `code=provider_unavailable`, `ambiguous=true`; reconciliação continua só aqui (o `enqueueDeliveryReconciliation` passou a seguir `failure.ambiguous`, que só é true no 5xx — mesmo efeito de antes).
- 200 sem id, recibo não gravado, e exceção DEPOIS do POST: `502` → `502` + `code=receipt_unconfirmed`, `ambiguous=true`, reconciliação igual a antes.
- exceção ANTES do POST (mídia/payload do pedido não montável): `502` "Message delivery failed" → `422` + `code=media_invalid`, `ambiguous=false`, SEM chamar o provedor e SEM reconciliar.

## Sensibilidade
- O diff toca: leitura de `SUPABASE_SERVICE_ROLE_KEY` (inalterada) e a resposta do rate limit (`enforceRateLimit` só foi injetado para teste; a lógica não mudou).
- Nenhuma proteção afrouxada: `requireAuth` continua antes de ler o corpo; nenhum segredo/PII voltou na resposta. Prova: no teste do 5xx o corpo do provedor traz o telefone (`5511999999999`) e o texto de erro, e o teste afirma que NENHUM dos dois aparece em `JSON.stringify(body)`.
- Nenhuma referência a banco/endpoint de produção: o teste injeta um cliente falso e um `evoFetch` falso; nenhuma rede, nenhum segredo.
- O que muda para quem chama: `error` continua no mesmo campo e continua sendo a mensagem; os campos novos são aditivos. O status HTTP de falha do provedor mudou (era sempre `502`) — o cliente (`outbound-message.service.ts`) trata qualquer não-2xx como erro e lê só `.error`.

## Prova
- Escopo do diff (checagem mecânica do fechar): 6 arquivos, 2 de teste, 11 casos de teste novos.
- vermelho antes: `git show cd9f5e69e8:supabase/functions/message-delivery/index.ts > .../index.ts` e `deno test --no-check supabase/functions/message-delivery/index.test.ts` → `error: SyntaxError: The requested module './index.ts' does not provide an export named 'classifyProviderFailure'` / `FAILED | 0 passed | 1 failed` (a base não tem código estável nem os helpers). Arquivo restaurado em seguida; `git diff --stat` ficou vazio.
- verde depois: `deno test supabase/functions/message-delivery/index.test.ts` → `ok | 22 passed | 0 failed (38ms)`, type-check limpo. (A contagem de testes novos/alterados do commit está no bloco FATOS MEDIDOS.)

## Dependência trazida (PD-79, cartão pai t_8c6419cf)
A seção DEPENDÊNCIA do cartão manda literalmente rodar `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges dia/2026-10-13..<sha do pai>)` antes de começar — por isso estes arquivos entraram no commit mesmo não estando em "ARQUIVOS QUE PODE TOCAR": são a banda OBRIGATÓRIA do pai, não um achado do escopo. Vieram
íntegros do pai (`a4d3f44074`, `4a9d27aa6f`), sem alteração minha, para o schema local ter a coluna/RPC do PD-79:
- `supabase/migrations/20261013210004_outbound_post_started.sql` (coluna + RPC do POST iniciado)
- `scripts/db-audit/message-delivery-phase1-behavior.test.sh` (auditoria do pai)
- `scripts/db-audit/message-delivery-phase1-runtime.sql` (runtime de auditoria do pai)
Os arquivos escritos por este cartão são os 2 de `message-delivery` (`index.ts` e `index.test.ts`); o commit tem 6 arquivos no total, contando `.tmp/relato.md`.

## O que NÃO fiz e por quê
- Não liguei `mark_outbound_post_started` (coluna/RPC do PD-79): essa chamada é do cartão irmão do PD-79 (t_ea8decbb), não veio por dependência para este workspace. O `ambiguous` foi derivado do ponto do código (`providerPostAttempted`), como o cartão permite.
- Não mexi em `_shared/validation.ts`: a mudança ficou contida no `message-delivery`, então nenhuma outra Edge que usa `errorResponse` muda de comportamento.
- `p_retryable` em `fail_outbound_message` continua `false` (sem mudança): uma nova tentativa segue sendo ação explícita do operador. O `retryable` da resposta é o sinal separado para o cliente.
- No ramo de claim vazio, `ambiguous=false`: o caso "POST iniciado + lease vencido" só é distinguível pela marca do PD-79, que não está integrada nesta base — quem resolve esse ramo é o fluxo PD-78/PD-79 (`fail_outbound_unclaimed`), fora deste cartão.
- `code=media_invalid` cobre qualquer carga inválida ANTES do POST (mídia ou payload persistido), não só mídia.
