# claude/feat-message-delivery-post-iniciado-261101-1937 (PR #2528) — INCORPORADA

- tip `229bb20a394bc9c460359c02d73a19a0235f6562` · merge_base `1252bb5a4` · 22 commits · 2026-11-01
- PR #2528: **CLOSED, não mergeada**. Título: "test(message-delivery): cobre PD-79 no edge + mark que lança vira 503 [C110] [DECISAO HUMANA] (empilhado na #2496)".
  Comentário de fechamento (verificado via GraphQL): "Fechado pelo autor: o coordenador pediu para nao abrir PR (so branch local)."
- Triagem anterior (2026-11-08) marcou `DECISAO_DONO` — **hipótese refutada**: não há decisão pendente, o trabalho já está na main E aplicado em produção (provas abaixo).

## Propósito
PD-79 / C110 / PD-80: carimbo durável do POST iniciado (`messages.delivery_post_started_at` +
RPC `mark_outbound_post_started` chamada IMEDIATAMENTE antes do POST ao provedor, fail-closed),
`claim_outbound_message` recusando linha já carimbada (nunca reenviar WhatsApp duplicado),
painel de resolução manual (`resolve_unconfirmed_message`, `manually_resolved_at`),
código de erro estável no `message-delivery` e guards no webhook.

## Onde esse trabalho está hoje
Mergeado na main pela **PR #2496**, commit `9727aaedd` (2026-11-11,
"feat(message-delivery): carimbo do POST iniciado (PD-79) + código de erro estável (PD-80) [C110]"),
que é ancestral de `origin/main` (`git merge-base --is-ancestor 9727aaedd origin/main` = 0).
A #2528 era um *stack* em cima da #2496 com apenas 2 arquivos a mais (index.ts + index.test.ts).

### Produção (MCP `SUPABASE - ZAPP WEB V2 - MCP`, somente leitura)
- `supabase_migrations.schema_migrations`: `20261111160000 outbound_post_started`,
  `20261112170000 resolve_unconfirmed_somente_sending`, `20261113171400 varredura_mensagens_presas_em_enviando`.
  **`20261101133000` NÃO existe no ledger** (e não deve existir — ver aviso no fim).
- `pg_proc`: `mark_outbound_post_started`, `resolve_unconfirmed_message`, `claim_outbound_message`,
  `guard_message_delivery_internal_fields`, `log_message_attempt` — todas presentes.
- `public.messages`: `delivery_post_started_at`, `manually_resolved_at`, `delivery_attempt_count`,
  `delivery_claim_expires_at` — todas presentes.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101133000_outbound_post_started.sql` | INCORPORADA — **byte-idêntica** à `supabase/migrations/20261111160000_outbound_post_started.sql` da main (só renomeada p/ timestamp posterior) | `diff` das duas versões = 0 linhas (484 linhas cada). Migration aplicada em produção como `20261111160000`. |
| `scripts/db-audit/message-delivery-phase1-behavior.test.sh` | INCORPORADA — única diferença é o nome do arquivo de migration | linha 703: branch `20261101133000_…`, main `20261111160000_…`. Resto idêntico. |
| `scripts/db-audit/message-delivery-phase1-runtime.sql` | IDENTICAL_TO_MAIN | mecânico (PRESENT_BYTE) |
| `src/components/inbox/ChatPanel.tsx` | INCORPORADA | PRESENT_REVERSE_APPLIES; main monta `UnconfirmedMessagesPanel` (`git grep UnconfirmedMessages origin/main -- src/components/inbox/ChatPanel.tsx`) |
| `supabase/functions/_shared/effect-reconcile.ts` | INCORPORADA | PRESENT_REVERSE_APPLIES; main tem `manually_resolved_at` no arquivo |
| `src/components/inbox/chat/SendErrorBanner.tsx` | OBSOLETA — main **inverteu de propósito** a regra do branch | branch: `return !mensagem.delivery_post_started_at` (carimbo bloqueia reenvio). Main: `return !!mensagem && mensagem.type === 'text'` + comentário "o banner só recebe `status === 'failed'`, que é resultado DEFINITIVO … Por isso o carimbo não bloqueia o reenvio". Main também adicionou `toast` de falha que o branch não tem. |
| `src/hooks/delivery/useUnconfirmedMessages.ts` | OBSOLETA/superada — main é estritamente mais nova | branch: `.not('status','in','("sent","delivered","read")')`; main: `.eq('status','sending')` (migration `20261112170000_resolve_unconfirmed_somente_sending`). Main ainda ganhou suporte a grupo (`conversationGroupId`), cast tipado em vez de `@ts-expect-error`, e invalidate em `message_not_resolvable`. |
| `src/components/inbox/chat/UnconfirmedMessagesPanel.tsx` | INCORPORADA + evoluída | as 2 "linhas faltantes" são a assinatura antiga; main adicionou `groupId?: string \| null` e repassa a `useUnconfirmedMessages(contactId, groupId)` |
| `supabase/functions/_shared/evolution-webhook-messages.ts` | INCORPORADA + evoluída | branch: `.is('external_id', null)`; main: `.eq('status','sending').is('external_id', null)` (mais restritivo, com comentário "linha 'failed' ou resolvida à mão … roubaria o external_id"). Main acrescentou `markWebhookPostStarted()` (PD-79 nos envios automáticos AWAY/CHATBOT-L1) e `maskJidForLog`. |
| `supabase/functions/_shared/evolution-webhook-msg-handlers.ts` | INCORPORADA + evoluída | main tem os mesmos UPDATEs com predicado atômico **mais** `.is('manually_resolved_at', null)` e `.eq('status','sending')` |
| `supabase/functions/message-delivery/index.ts` | INCORPORADA, exceto 1 escolha rejeitada (abaixo) | main tem `mark_outbound_post_started` antes do POST, `PreDispatchInfraError('mark_outbound_post_started_failed')` no `catch` (= o fix exclusivo da #2528), `delivery_post_started_at` no `select`, `receipt_unconfirmed`. Main vai além: tolera `PGRST202` (pré-DDL), 409 `in_progress` com lease vivo, `recordDeliveryAttempt`, `isInstancePaused` (C121). |
| `supabase/functions/message-delivery/index.test.ts` | INCORPORADA em comportamento; 1 assert rejeitado + 1 helper ausente | main tem 6 testes `Deno.test('PD-79…')` (index.test.ts:833–941) cobrindo pré-DDL PGRST202, erro do carimbo bloqueia antes do POST (`providerCalled === false`), lease vivo → 409, lease vencido → 502 `receipt_unconfirmed`, 42883 não tolerado, exceção → 503 `provider_unavailable` não ambíguo. |
| `supabase/deployment-manifest.json` | Artefato gerado (bytes/sha256) — valor nenhum | main tem sua própria versão regenerada no merge da #2496 |

## Único ponto DELIBERADAMENTE rejeitado pela main (OBSOLETO, não portar)
Branch: `classifyProviderFailure` inspecionava o **body antes** do early-return de 5xx, e o teste exigia
`classifyProviderFailure(503, { message: 'Connection Closed' }).code === 'instance_unavailable'`
("marca no corpo vence o status").

Main decidiu o contrário, no mesmo commit `9727aaedd`:
`supabase/functions/message-delivery/index.ts` — "5xx: falha do lado do provedor; o body não é confiável
para disambiguar" (5xx retorna `provider_unavailable`, `ambiguous: true`, antes de olhar o body), e
`supabase/functions/message-delivery/index.test.ts:546` fixa
`classifyProviderFailure(503, { message: 'Connection Closed' }).code === 'provider_unavailable'`.
Portar a versão do branch **quebraria** esse teste da main.

## Lacuna residual (valor baixo, endurecimento de teste — opcional)
Main prova a ordem carimbo→POST indiretamente (quando o carimbo falha, `providerCalled === false`) e
**não** assere os argumentos do carimbo em lugar algum
(`git grep "rpcArgs(client, 'mark_outbound_post_started')" origin/main` = vazio).
O branch tinha um helper que registra a ordem dos eventos e assere ordem + argumentos.
Hunk portável (de `supabase/functions/message-delivery/index.test.ts` do branch):

```ts
/** Cliente fake que registra a ORDEM entre o carimbo (RPC) e o POST (provedor). */
function makeOrderedClient(cfg: Parameters<typeof makeClient>[0]) {
  const events: string[] = [];
  const inner = makeClient(cfg);
  const client: FakeClient = {
    ...inner,
    async rpc(fn: string, args?: Row) {
      events.push(`rpc:${fn}`);
      return inner.rpc(fn, args);
    },
  };
  return { client, events, inner };
}

Deno.test('PD-79: carimbo ok -> chama mark_outbound_post_started com id+token ANTES do POST e envia', async () => {
  const { client, events } = makeOrderedClient({ claim: { data: [CLAIM], error: null } });
  // ... deps com evoFetch que faz events.push('provider:post')
  const args = rpcArgs(client, 'mark_outbound_post_started');
  if (!args) throw new Error('mark_outbound_post_started não foi chamado');
  assertEqual(args.p_message_id, MESSAGE_ID, 'mark p_message_id');
  assertEqual(args.p_claim_token, 'token-1', 'mark p_claim_token');
  assertEqual(events.filter((e) => e === 'provider:post').length, 1, 'POST ao provedor exatamente 1x');
  const markAt = events.indexOf('rpc:mark_outbound_post_started');
  const postAt = events.indexOf('provider:post');
  const completeAt = events.indexOf('rpc:complete_outbound_message');
  if (!(markAt >= 0 && markAt < postAt && postAt < completeAt)) {
    throw new Error(`ordem inválida (esperado mark < POST < complete): ${events.join(' > ')}`);
  }
});
```
Ao portar, **não** trazer a linha do assert de 503 → `instance_unavailable` (rejeitada pela main)
e adaptar ao `makeClient` atual da main (que ganhou `rpcThrows`, `resetInstanceTokenCache`, etc.).

## AVISO (destrutivo) — não aplicar a migration do branch
`supabase/migrations/20261101133000_outbound_post_started.sql` é a MESMA DDL já aplicada em produção
como `20261111160000`. Aplicá-la de novo rodaria `create or replace function` de
`claim_outbound_message`/`guard_message_delivery_internal_fields` com o corpo de 2026-11-01, **revertendo**
as correções posteriores (`20261112170000`, `20261113171400`). Esse arquivo não deve ser recuperado.

## Veredito
**INCORPORADA** (confiança alta). Branch está estritamente atrás da main em todos os 13 arquivos.
`apagar_branch_seguro = true` — o único item não portado é um assert de teste de valor baixo, já
transcrito acima, e um assert rejeitado de propósito.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar arquivo por arquivo (`git diff` branch→main) e não
achei nenhum hunk de valor ≥ médio ausente na main. Em todos os 13 arquivos a main é igual ou estritamente
superior.

Evidências (`B = origin/claude/feat-message-delivery-post-iniciado-261101-1937`, main = `dac285f62`):

1. **Migration**: `diff <(git show $B:supabase/migrations/20261101133000_outbound_post_started.sql) <(git show
   origin/main:supabase/migrations/20261111160000_outbound_post_started.sql)` → vazio (484 linhas, byte-idêntica).
   Só o nome muda, e o `scripts/db-audit/message-delivery-phase1-behavior.test.sh:703` da main já aponta para o
   nome novo — a única "lacuna" desse arquivo é o nome antigo.
2. **Produção** (MCP `SUPABASE - ZAPP WEB V2`, SELECT): `mig_20261111160000=1`, `mig_20261101133000=0`,
   `fn_mark=1`, `fn_resolve=1`, `col_post_started=1`, `col_manual=1`. O carimbo PD-79 está ativo em produção.
3. **`9727aaedd` é ancestral de `origin/main`** (`git merge-base --is-ancestor` → 0).
4. **Fix exclusivo da #2528 está na main**: `supabase/functions/message-delivery/index.ts:774-795` —
   `catch { throw new PreDispatchInfraError('mark_outbound_post_started_failed'); }`, com o refinamento extra
   PGRST202 (pré-DDL tolerado) que a branch não tem.
5. **Main vai além da branch** no mesmo tema: `delivery_claim_expires_at` no select do claim vazio e
   `IN_PROGRESS_FAILURE` (409 `in_progress`) para lease vivo (`index.ts:547-552, 703`);
   `recordDeliveryAttempt`/`log_message_attempt` (P1-1); `isInstancePaused` (C121);
   `markWebhookPostStarted` no webhook de ausência/chatbot L1 (`_shared/evolution-webhook-messages.ts:366-392`);
   filtros `.eq('status','sending')` e `.is('manually_resolved_at', null)` nos handlers do webhook.
6. **Testes PD-79 na main** (`index.test.ts`): pré-DDL PGRST202 (l.833), erro P0001 bloqueia antes do POST
   (l.852: `provedorChamado` falso prova carimbo→POST), 42883 não tolerado (l.904), exceção = 503 (l.921),
   lease vivo = 409 (l.867), lease vencido = 502 `receipt_unconfirmed` (l.885), carimbo não chamado com
   instância pausada (l.317) e guarda de ORDEM no fonte (l.339-350).
   Só falta o assert dos **argumentos** do carimbo (`p_message_id`/`p_claim_token`) e o `makeOrderedClient`.
   Valor baixo: a ordem já está provada por comportamento e por guarda de fonte.
7. **O assert do 503 é rejeição deliberada, não lacuna**: `index.test.ts:546` da main afirma
   `classifyProviderFailure(503,{message:'Connection Closed'}).code === 'provider_unavailable'`, e
   `index.ts:172-178` checa 5xx ANTES do corpo de propósito ("o body não é confiável para disambiguar"),
   mantendo a inspeção de corpo para 429/4xx. Portar o hunk da branch quebraria a main.
8. **Checagem do único risco de negócio real** — a main removeu o bloqueio de reenvio por
   `delivery_post_started_at` em `SendErrorBanner.tsx`. Não é regressão: em `index.ts:806-812` o caso
   ambíguo **não** chama `failClaim` (só reconcilia), e `index.ts:860-862` não falha o claim quando o POST
   saiu — a linha fica em `sending`. `failClaim` usa `p_retryable: false` (l.515). Logo `status='failed'` é
   sempre resultado definitivo e o banner não pode oferecer reenvio de mensagem possivelmente entregue.
   O painel C110 (`useUnconfirmedMessages` da main, `.eq('status','sending')`) cobre o caso ambíguo.
9. **PR #2528**: `state=closed`, `merged=false`, `merge_commit_sha` nunca aplicado, base era outra branch
   (`claude/…-261101-1701`, empilhamento), delta própria = 2 arquivos / +134 −5.
10. **Sem revert**: `git log` de `20261111160000_outbound_post_started.sql` tem só `9727aaedd`; nenhum commit
    de revert/remoção do carimbo em `message-delivery/index.ts`.

Sobre o `DECISAO_DONO` anterior: não há decisão pendente — o DDL já foi aplicado e aprovado em produção
(ledger `20261111160000`), e a regra do dono não exige decisão para edge/DDL já mergeado.

`apagar_branch_seguro = true`.
