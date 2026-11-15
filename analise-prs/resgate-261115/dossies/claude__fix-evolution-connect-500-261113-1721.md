# Dossiê — claude__fix-evolution-connect-500-261113-1721 (PR #3041)

**Branch:** `origin/claude/fix-evolution-connect-500-261113-1721` · tip `d8a2c92d8` · merge-base `cb6576b2a` (2026-11-13) · 2 commits.
**Propósito:** no `connect` do fluxo Evolution GO (`supabase/functions/evolution-api/index.ts`), um `fetch()` à GO que lançava (rede caída / `AbortSignal.timeout`) subia ao catch geral e virava HTTP 500 opaco. A branch envolve cada fetch em `goFetch(stage, …)` que converte a exceção em `GoConnectFetchError(status 502/504/503)`, capturado no catch geral e devolvido como `200 {error:true,status,message}` com a etapa em PT-BR. Mais 9 testes Deno.

Commits: `40e61a352 fix(evolution): connect da GO responde com a etapa que falhou em vez de 500` · `d8a2c92d8 docs(estado): âncoras do evolution-webhook acompanham as linhas do connect`.

## Veredito: **OBSOLETA** — superada pela #3045 (`098a648f6`, na main), que cobre a mesma necessidade com mais escopo. `apagar_branch_seguro = true`.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência na main |
|---|---|---|---|
| `supabase/functions/evolution-api/index.ts` | CONFLICT (32 linhas ausentes) | **Superado.** Todos os 6 fetches que a branch envolvia em `goFetch` usam `safeFetch(url, init, timeoutMs)` na main, que nunca lança (`try/catch` devolve `{ok:false, kind:'timeout'\|'network'}`) e cada chamador responde `200 + {error:true, code:'go_unreachable', status: 504/502}`. | `_shared/evolution-go-token-sync.ts:36-52` (safeFetch); `evolution-api/index.ts:13` (import), `:693-699` (comentário "13/11: nenhum fetch deste fluxo pode LANÇAR"), `:767` connect, `:815` qr, `:864` status (`:865-868` → fail 504/502 go_unreachable), `:937` /instance/all, `:962` delete, `:968-973` create com retry em `:975-978`, `:984` reconnect; catch geral `:1530` só recebe o que não é do connect. |
| `supabase/functions/evolution-api/index.test.ts` | CONFLICT (70 linhas ausentes) | **Superado em forma; comportamento coberto por outros arquivos.** Os testes da branch assertam mensagens da própria branch (`"iniciar a conexão"`, `"Tente novamente"`), que não existem na main → falhariam contra a main. Os cenários estão em `connect-go-token.test.ts` e `connect-orfa-prazo.test.ts`. Pequena lacuna: não há teste explícito "DELETE ok + create **lança** (rede) → 503 + 2 tentativas" nem "create lança só na 1ª → retry recupera" (a main cobre create **lento/estrangulado**, não create que rejeita). Código da main já trata (safeFetch devolve `ok:false` → cai no mesmo retry `:975` e no 503 `:980`). | `connect-go-token.test.ts:115` (rede → go_unreachable), `:123` (timeout connect → 504), `:131` (qr timeout), `:144` (QR lento sem delete/create), `:157` (teto 40 s), `:286` (status rede), `:351` (safeFetch timeout real não lança); `connect-orfa-prazo.test.ts:202,213,223` (delete/create com prazo). |
| `ESTADO.md` | CONFLICT (1 linha) | **Obsoleto.** A branch só reposicionava âncoras `evolution-api/index.ts:537/603/785` para o arquivo da branch. Na main a linha `evolution-webhook` aponta `index.ts:635` e `:764`, que batem com as ocorrências reais de `functions/v1/evolution-webhook` na main. | `origin/main:ESTADO.md:82`; `git grep -n 'functions/v1/evolution-webhook' origin/main -- supabase/functions/evolution-api/index.ts` → 635, 764. |
| `supabase/deployment-manifest.json` | CONFLICT (4 linhas) | **Obsoleto.** Hashes/bytes (`90583`, `77a7af…`) são do `index.ts` da branch. Main tem os seus (`104679`, `e841c2…`, `manifest_sha256 def318…`), regerados em `dac285f62`. | `origin/main:supabase/deployment-manifest.json:643-645, 2814`. |
| `src/hooks/evolution/useEvolutionApiCore.ts` | PRESENT_REVERSE_APPLIES | Já na main (prova mecânica). | — |
| `src/hooks/evolution/__tests__/useEvolutionApiCore.test.ts` | PRESENT_REVERSE_APPLIES | Já na main. | — |
| `src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts` | PRESENT_REVERSE_APPLIES | Já na main. | — |
| `src/hooks/evolution/__tests__/useEvolutionGroups.test.ts` | PRESENT_BYTE | Idêntico. | — |

Comentário de fechamento da PR (#3041 substituída pela #3045, `098a648f6`; `d5120825f chore(pacote): retira #3041 do pacote`) **confirmado pelo código**, não só pelo comentário.

## Lacuna residual (valor baixo, opcional)

Dois casos de teste que a main não tem explicitamente — portáveis para `supabase/functions/evolution-api/connect-go-token.test.ts` usando o helper `run(...)` já existente lá (sessão órfã com stub de `/instance/all`), ajustando os asserts ao contrato da main (`code`/`message` da main, status 503 com a mensagem `"foi removida da Evolution GO"`):

```ts
// Branch (index.test.ts, +1824..+1840) — adaptar ao helper da main:
Deno.test("connect (GO): DELETE ok + create lança → 503 com a mesma mensagem da recriação falha", async () => {
  const r = await connectComGoLancando("create", NET_ERR());          // stub: fetch de /instance/create rejeita (TypeError)
  assertEquals(r.res.status, 200, r.text);
  assertEquals(r.body.error, true);
  assertEquals(r.body.status, 503);
  assert(String(r.body.message).includes("foi removida da Evolution GO"), r.body.message);
  assert(r.calls.includes("DELETE /instance/delete/go-1"), r.calls.join(","));
  assertEquals(r.calls.filter((c) => c === "POST /instance/create").length, 2, "rede na 1ª tentativa ainda ganha o retry");
});

Deno.test("connect (GO): create lança só na 1ª tentativa → retry recria e não devolve o 503", async () => {
  const r = await connectComGoLancando("create", NET_ERR(), 1);       // rejeita só 1 vez
  assertEquals(r.res.status, 200, r.text);
  assertEquals(r.calls.filter((c) => c === "POST /instance/create").length, 2, r.calls.join(","));
  assertEquals(String(r.body.message ?? "").includes("foi removida da Evolution GO"), false, r.text);
});
```

Stub da branch (referência): `/instance/qr → {data:{}}`, `/instance/status → {data:{Connected:false,LoggedIn:false}}`, `/instance/all → {data:[{name:"PRINCIPAL",id:"go-1",jid:"5511999990001@s.whatsapp.net"}]}`, demais → `{}`; `EVOLUTION_API_FLAVOR=go`, `EVOLUTION_INSTANCE_NAME=PRINCIPAL`, `resetInstanceTokenCache()`.

Nada mais a recuperar: a implementação (`GoConnectFetchError`/`goFetch`) não deve ser portada — conflitaria com o `safeFetch` + orçamento de prazo (`hardDeadline` 40 s, `within()`) que a main já tem e que é mais seguro (não apaga instância sem prazo para recriar).

## Verificação adversarial

**Concordo: OBSOLETA. `apagar_branch_seguro = true`.** Tentei refutar hunk por hunk; não achei nada de valor ≥ médio fora da main.

1. **Substituição realmente cobre a necessidade (checado no arquivo da main, não no comentário da PR).**
   `origin/main:supabase/functions/_shared/evolution-go-token-sync.ts:24-51` — `safeFetch` tem `try/catch`
   explícito e devolve `{ok:false, kind:'timeout'|'network'}`: não lança nem em `TimeoutError`/`AbortError`
   nem em `TypeError` de DNS/conexão. Comentário no próprio arquivo cita o 500 de 13/11 como causa.
2. **Nenhum `fetch` cru sobrou no bloco `connect` da main.** `grep -n 'await fetch('` em
   `origin/main:supabase/functions/evolution-api/index.ts` → só `:287`, `:632`, `:1177`, `:1446`; nenhuma
   dentro de 690-1000 (o `connect`). As 4 restantes são de outras actions — `:632` está na
   `create-connection`, dentro de `try/catch` best-effort (`:638-642`). Logo os 6 `goFetch` da branch não
   têm equivalente faltando.
3. **Cada falha vira 200, não 500.** `:767` connect → `:785` `fail(504/502,'go_unreachable')`; `:815` qr →
   `:856`; `:864` status → `:867`; `:937` `/instance/all` (envolvido também em `try/catch`, `:946`) → `goOrphan`
   fica nulo → 409 com mensagem PT-BR em `:934`; `:962` delete → `!delOk` cai no 409 de `:1003`; `:968-973`
   create com retry em `:974-978` e **503 com a mesma mensagem da branch** em `:980`; `:984` reconnect.
4. **`create` que *rejeita* (rede) já é tratado.** `safeFetch` devolve `ok:false`, a condição
   `!(createFetch.ok && createFetch.response.ok)` (main `:974` e `:979`) é a mesma do create que responde
   non-2xx → retry de 2 s e, falhando, o 503. Ou seja, o comportamento dos 2 testes da branch está
   implementado; só não há teste explícito. Lacuna **test-only, valor baixo** — mantida como registrada.
5. **Front já na main (não confiei no `PRESENT_REVERSE_APPLIES`).** `edgeErrorBodyMessage` existe em
   `origin/main:src/hooks/evolution/useEvolutionApiCore.ts:67` e é usada em `:134`; o `it.fails` virou `it`
   em `origin/main:src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts:312`.
6. **`ESTADO.md` e `deployment-manifest.json` são artefatos gerados.** A linha da branch só trocava
   `evolution-go-routes.ts:221`→`:263`; a da main (`origin/main:ESTADO.md:82`) aponta
   `evolution-api/index.ts:635` e `:764`, que são as ocorrências reais de `functions/v1/evolution-webhook`
   na main (`git grep` → 635, 764). Os hashes da branch descrevem o `index.ts` da branch, que não existe na
   main — portá-los quebraria o manifesto.
7. **Não é remoção proposital mal interpretada.** As 5 linhas "removidas pela branch que seguem na main"
   são o corpo do `create`/503/reconnect, que a main mantém em forma `safeFetch` — nada foi perdido.

Nenhum hunk de valor ≥ médio fora da main. Branch pode ser apagada.
