# claude__fix-pd79-compat-pre-migration-261111 — PR #2972

- Ref: `origin/claude/fix-pd79-compat-pre-migration-261111` (tip `d4e880c76`), merge-base `65cf3854`
- 7 commits, 13 arquivos, +773/-72
- **Veredito: OBSOLETA** · `apagar_branch_seguro: true` · confiança alta

## Propósito da branch (dois blocos)
1. **Compatibilidade "antes da migration"**: a Edge/front publica no push da `main`, mas a migration
   `20261111160000_outbound_post_started.sql` (colunas `delivery_post_started_at`,
   `delivery_claim_expires_at`, `manually_resolved_at` e RPCs) só roda pelo `db-migrate`. A branch
   adicionou fallback de `42703`/`PGRST202` em 4 arquivos (claim do message-delivery, webhook
   send.message, effect-reconcile, hook do painel C110) + testes.
2. **Resolução manual só de `sending`**: migration `20261111180000_resolve_unconfirmed_somente_sending.sql`,
   hook `.eq('status','sending')`, banner volta a oferecer reenvio para `failed` definitiva,
   lease vivo → 409, guard `.is('manually_resolved_at', null)` nos UPDATEs do recibo tardio.

## Prova decisiva do bloco 1 (fallbacks = código morto)
Produção (MCP `SUPABASE - ZAPP WEB V2 - MCP`, somente leitura):

```
select version,name from supabase_migrations.schema_migrations
where version in ('20261111160000','20261111180000','20261112170000');
→ 20261111160000 outbound_post_started
→ 20261112170000 resolve_unconfirmed_somente_sending
```

As colunas existem em produção. Todo caminho `42703` da branch é inalcançável. O `20261111180000`
não existe no ledger (foi substituído pelo `20261112170000`).

## Prova do bloco 2 (substância já na `main`, via PR #3046)
`git log --diff-filter=A origin/main -- supabase/migrations/20261112170000_...sql` → `f32855df6`
("chore: pacote 2 — ... e PD79 (#3046)"). PR #2996 (que refazia a #2972) está **CLOSED, não
mergeada** — o conteúdo entrou pelo pacote #3046.

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261111180000_resolve_unconfirmed_somente_sending.sql` | **INCORPORADA, com melhoria.** Mesmo SQL em `origin/main:supabase/migrations/20261112170000_resolve_unconfirmed_somente_sending.sql`; o `diff` só acusa cabeçalho reescrito, remoção de `BEGIN;/COMMIT;` (exigência do `db_query`) e a guarda extra `IF p_outcome IS NULL OR p_outcome NOT IN (...)` (a da branch gravava `'failed'` com `p_outcome` NULL). Já aplicada em produção. | `diff <(git show <tip>:...180000...) <(git show origin/main:...170000...)` |
| `src/hooks/delivery/useUnconfirmedMessages.ts` | **INCORPORADA** o essencial: `origin/main:…:38` tem `.eq('status','sending')` com o mesmo comentário. A `main` ainda acrescenta o `invalidateQueries` no `message_not_resolvable` (`:77`), que a branch não tinha. **Resíduo vivo**: backoff de erro + revalidação ao montar (ver "Lacuna residual"). O restante (`isSchemaNotReadyError`, `schemaReady`, poll pré-DDL de 5 min) é código morto. | `git show origin/main:src/hooks/delivery/useUnconfirmedMessages.ts` |
| `src/components/inbox/chat/SendErrorBanner.tsx` | **INCORPORADA, byte a byte na intenção.** `origin/main:…:50-52`: `function podeReenviarComoTexto(mensagem) { return !!mensagem && mensagem.type === 'text'; }` e o comentário PD-79 (`:44-48`) idêntico em conteúdo. | `git show origin/main:…SendErrorBanner.tsx \| sed -n '44,52p'` |
| `supabase/functions/message-delivery/index.ts` | **INCORPORADA** o essencial: lease vivo → `IN_PROGRESS_FAILURE` (`origin/main:…:550-552`), `select` já com `delivery_claim_expires_at, delivery_post_started_at` (`:703`), tolerância restrita a `PGRST202` com log `level:'alert'` (`:781-791`). Só falta `isMissingColumnError`/`readUnclaimedMessage` (fallback 42703) = morto. | `git show origin/main:…index.ts \| sed -n '695,715p;775,795p'` |
| `supabase/functions/_shared/evolution-webhook-msg-handlers.ts` | **INCORPORADA, com melhoria.** `origin/main:…:53` e `:93` já têm `.is('manually_resolved_at', null)` nos dois UPDATEs (a corrida que a branch fechava); a `main` ainda filtra `.eq('status','sending')` na busca da pendente (`:81`), o que a branch **não** fazia. Só falta o fallback 42703 = morto. | `git show origin/main:…msg-handlers.ts \| sed -n '39,96p'` |
| `supabase/functions/_shared/effect-reconcile.ts` | **OBSOLETA.** O diff é só o fallback 42703 no UPDATE guardado por `manually_resolved_at`. A `main` mantém a versão direta (`let q = …; if (rule.sourceTable === "messages") q = q.is("manually_resolved_at", null)`). Coluna existe em produção. | `git diff <mb> <tip> -- …effect-reconcile.ts` |
| `supabase/functions/_shared/__tests__/effect-reconcile.test.ts` | **OBSOLETA.** 32 linhas de teste do fallback 42703 (`makeUpdateClient(columnExists)`). Testa código morto. | item JSON `missing_sample` |
| `supabase/functions/_shared/__tests__/send-message-manual-resolution-compat.test.ts` | **OBSOLETA.** Arquivo novo, 66 linhas, inteiramente dedicado ao `42703` do `handleSendMessage` pré-migration. | `NEW_FILE_ABSENT_IN_MAIN` |
| `supabase/functions/message-delivery/index.test.ts` | **OBSOLETA** o que falta: o mock ganhava `missingColumns`/`is()` para simular 42703. A `main` já cobre o caso vivo: `Deno.test('PD-79 [pré-DDL]: RPC mark_outbound_post_started ainda inexistente (PGRST202) não derruba o envio…')` (`origin/main:…index.test.ts:833`), 52 `Deno.test` no arquivo. | `git show origin/main:…index.test.ts \| grep -n 'PGRST202'` |
| `src/hooks/delivery/__tests__/useUnconfirmedMessages.test.tsx` | **INCORPORADA** o essencial: `origin/main:…:42` `it('filtra só status=sending, carimbado, não resolvido e do contato')`, `:57` grupo, `:66` erro do PostgREST, `:73` P0002 invalida, `:84` outro erro não invalida. O que falta são os `it()` de pré-DDL (42703/PGRST202) e do `unconfirmedRefetchInterval`. | `git show origin/main:…useUnconfirmedMessages.test.tsx \| grep -n 'it('` |
| `src/components/inbox/chat/__tests__/UnconfirmedMessagesPanel.test.tsx` | **INCORPORADA.** `origin/main` tem 7 `it()` cobrindo lista vazia, erro, permissão de agente, resolução supervisor, spinner e `groupId`. As 2 linhas "faltantes" são só o nome do caso ("inclusive pré-DDL") e uma linha de mock. | `git show origin/main:…UnconfirmedMessagesPanel.test.tsx \| grep -n 'it('` |
| `src/components/inbox/chat/__tests__/SendErrorBanner.test.tsx` | **INCORPORADA** (mecânico: `hunk = PRESENT_REVERSE_APPLIES`). | item JSON |
| `supabase/deployment-manifest.json` | **Artefato gerado**, valor nenhum. Hashes do estado da branch; a `main` tem os seus, regenerados por `scripts/edge-deploy/generate-manifest.mjs`. Nunca portar à mão. | item JSON |

## Lacuna residual (única coisa viva fora da `main`) — valor baixo
`src/hooks/delivery/useUnconfirmedMessages.ts`: a `main` usa `refetchInterval: 30_000` fixo e herda
`staleTime: 5min`, `refetchOnMount: false`, `refetchOnWindowFocus: false` do
`src/lib/queryClient.ts:13-22`. A branch trocava por backoff em erro + revalidação ao montar/focar.
Sem o ramo `schemaReady` (morto), o que ainda faz sentido é:

```ts
const POLL_MS = 30_000;
const ERROR_BACKOFF_BASE_MS = 60_000;
const ERROR_BACKOFF_MAX_MS = 10 * 60_000;

/** Intervalo do polling a partir do estado da query (exportado para teste). */
export function unconfirmedRefetchInterval(q: {
  state: { status: string; errorUpdateCount?: number };
}): number {
  if (q.state.status === 'error') {
    const n = Math.max(1, q.state.errorUpdateCount ?? 1);
    return Math.min(ERROR_BACKOFF_BASE_MS * 2 ** (n - 1), ERROR_BACKOFF_MAX_MS);
  }
  return POLL_MS;
}
// no useQuery:
    refetchInterval: unconfirmedRefetchInterval,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
```

Efeito: em erro (permissão/rede) o painel espera 1 → 2 → 4 → 8 → 10 min em vez de bater a cada 30 s;
ao abrir a conversa revalida na hora em vez de mostrar cache de até 5 min. Não corrige bug: o painel
C110 funciona hoje. Risco de portar: nenhum fluxo de envio toca nisso.

## Conclusão
Bloco 2 (o que valia) está integralmente na `main` pelo pacote #3046, em versão melhor que a da
branch (NULL em `p_outcome`, `.eq('status','sending')` na pendente, `invalidateQueries` no P0002).
Bloco 1 virou código morto com a `20261111160000` aplicada em produção. Resta um refinamento de
polling de valor baixo, transcrito acima. Branch pode ser apagada.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** · `apagar_branch_seguro: true`. Tentei refutar por três ângulos
(hunk vivo não coberto, substituição insuficiente, lacuna residual subestimada) e os três falharam.

**1. Produção confirma o código morto (leitura própria, MCP `SUPABASE - ZAPP WEB V2 - MCP`).**
- `supabase_migrations.schema_migrations` → `20261111160000 outbound_post_started` e
  `20261112170000 resolve_unconfirmed_somente_sending` presentes; `20261111180000` (a da branch)
  ausente.
- `information_schema.columns` em `public.messages` → `delivery_claim_expires_at`,
  `delivery_post_started_at`, `manually_resolved_at` **existem**. Logo todo ramo `42703` da branch
  (message-delivery `readUnclaimedMessage`, msg-handlers `dupCheck`/`pendingLookup`,
  effect-reconcile `runUpdate(false)`, hook `isSchemaNotReadyError`/`schemaReady`) é inalcançável.
- `pg_get_functiondef('public.resolve_unconfirmed_message')` → contém
  `p_outcome IS NULL OR p_outcome NOT IN ('sent', 'not_delivered') THEN RAISE EXCEPTION 'invalid…`
  e referencia `'sending'`: a versão **da `main`** (com a guarda de NULL) é a que está viva.

**2. A branch não está só "coberta" — ela REGRIDE a `main` em todo arquivo vivo.** `git diff origin/main d4e880c76`:
- `supabase/functions/message-delivery/index.ts`: a branch **remove** o import e a checagem
  `isInstancePaused` (C121, instância pausada não envia), **remove** `recordDeliveryAttempt`/
  `DeliveryAttemptOutcome` e suas 5 chamadas (P1-1, histórico em `message_attempts`), **remove**
  `delivery_attempt_count` do type `Claim` e o `try/catch` em volta de `mark_outbound_post_started`.
  Único acréscimo real: `isMissingColumnError` + `readUnclaimedMessage` (morto).
- `supabase/functions/_shared/evolution-webhook-msg-handlers.ts`: o `pendingLookup` da branch **não
  tem** `.eq('status','sending')`, que a `main` tem em `:47` — sem ele uma linha `failed`/resolvida à
  mão rouba o `external_id` da mensagem nova. Regressão direta.
- `src/components/inbox/chat/SendErrorBanner.tsx`: a branch **remove** o `toast` de "Mensagem não
  enviada" no `catch` do reenvio que a `main` tem em `:121-128`.
- `supabase/functions/_shared/effect-reconcile.ts`: diff vs `main` é só o wrapper `runUpdate` + repique
  `42703`. Morto.

**3. A lacuna residual é mesmo de valor baixo — e menor do que o dossiê diz.** `git log -S` na `main`
para `isSchemaNotReadyError` e `unconfirmedRefetchInterval` → **vazio**: nunca entraram, não houve
remoção deliberada a respeitar. Sobre o backoff: `src/lib/queryRetry.ts:37-39` já lista `42501`,
`42P01`, `42703` (e 401/403/404) como erro permanente, então a `main` **já não** faz tempestade de
retry; o backoff só espaçaria o `refetchInterval` de 30 s em erro persistente com a conversa aberta.
Sobre `staleTime: 0`/`refetchOnMount: 'always'`: com `refetchInterval: 30_000` ativo na remontagem, a
janela de dado velho é ≤ 30 s, não os 5 min do `staleTime` global. Nenhum bug, nenhum efeito de
negócio. Mantenho "baixo" e **não** rebaixo o veredito para PERDIDA_PARCIAL.

Nenhum hunk de valor ≥ médio fora da `main`. Apagar a branch não perde nada; portá-la perderia C121,
`message_attempts`, o filtro `status=sending` da pendente e o toast do reenvio.
