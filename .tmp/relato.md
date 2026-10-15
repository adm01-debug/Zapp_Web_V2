Especialista: senior (area-front-hooks)

Refazer 1 do cartão `fix-rede-cliente-supabase-timeout` — entrego sobre o
trabalho anterior (commits `a4325ab252` + `f0325d7ca7`, já presentes neste
workspace), ponto a ponto da recusa do revisor.

Ponto 1 — allowlist de RPC de leitura (`src/integrations/supabase/client.ts`):
removi `talkx_overview_stats` e `talkx_engine_window_open` (voltam ao padrão
seguro: sem retry) e incluí `get_own_gmail_accounts` (leitura real, usada em
`useGmail.ts` e `GmailWebhookMonitor.tsx`). `talk_me_list_waiting` já estava
na lista (nada a fazer). `falantes-query`, `home-lists` e `user-active-status`
NÃO foram incluídos: não existem em `src/` nem `supabase/` (`grep -r`, zero
resultados) e nem poderiam casar — o extrator só aceita `[a-z0-9_]` e hífen
nunca casa; incluí-los seria entrada morta. Auditoria completa das RPCs reais
via `grep -rhoP "\.rpc\(\s*'..."` (58 nomes distintos; escritas como
`transfer_conversation`, `close_conversation_atomic`, `talk_me_claim` seguem
fora da lista).
Teste: `allowlist de RPC: get_own_gmail_accounts repete; talkx_* não repetem`
(`client.fetch.test.ts`). Vermelha sem a correção (2 falhas nesse arquivo:
`get_own_...` rejeitava em 1 chamada e as `talkx_*` repetiam); verde com ela
(2 chamadas + resolve; `talkx_*` 1 chamada cada).

Ponto 2 — `boundedFetch` com `Request` com body (`client.ts`): o signal do
chamador agora é lido de `init.signal ?? input.signal`, e um `Request` pronto
é reemitido via `new Request(original, { signal, duplex: 'half' se há body })`
— método, URL, cabeçalhos e corpo do original são encaminhados e o timeout de
12s passa a valer para ele. O original é consumido (uso único), o que já é
compatível com `hasUnreplayableBody` (esse caso nunca entra em retry).
`duplex: 'half'` com corpo string/stream verificado em node 24 antes de
escrever o código. Teste: `Request com body reutiliza o signal do chamador`
— vermelha sem (abort ignorado; só `TimeoutError` após 12s), verde com
(`AbortError` imediato, 1 chamada). Teste extra de caracterização: reemissão
preserva método/URL/cabeçalhos, vale o timeout e não repete.

Ponto 3 — `useAuth` (`src/hooks/auth/useAuth.tsx`): o `catch` agora só marca
`profileUnavailable` em falha TRANSITÓRIA
(`respostaVigente && isTransientProfileFailure(err)`, predicado exportado de
`auth.service.ts`). A reserva por geração já existia na entrada (`++` antes do
fetch) e nos dois gates (sucesso e erro checam geração + identidade); o teste
3 pré-existente prova o descarte da resposta atrasada. Teste novo:
`erro 5xx (sobe sem retry) não marca profileUnavailable` — vermelha sem
(flag `true` após retries indevidos), verde com (flag `false`, `from` ×1,
`profile` null). O teste do 400 continua verde (agora chega via throw e o
gate segura a flag).

Ponto 4 — retry do `fetchProfile` (`src/services/auth.service.ts`):
transitório agora é SÓ `TypeError` de rede e `TimeoutError`; `AbortError` não
repete; 4xx/5xx do PostgREST sobem (throw) na hora, sem repetir. Caminho de
auth inalterado: 401/PGRST301/jwt tenta `refreshSession` e, sem sessão nova,
devolve `null` como antes. Testes: `timeout é transitório` (novo — vermelha
sem: devolvia `null` em 1 chamada; verde: 3 chamadas + lança); `5xx sobe na
hora` e `400 sobe na hora` (atualizados de ×3/`null` para ×1 + throw —
mudança mandada pela recusa: "o resto sobe na hora sem repetir").

Ponto 5 — `window.location.href` no teste do `useAuth`: conferi — o arquivo
NÃO contém nenhuma atribuição a `location` (`rg location` nos 3 arquivos de
teste novos: zero resultados; o único `href = '/'` do `src` está em
`ErrorBoundary.tsx`, fora deste cartão). Implementei mesmo assim o guard
ordenado: `beforeEach` captura `window.location.href`, `afterEach` restaura
se mudou.

Regressão ao lado: `AuthService.fetchProfile` só é chamado por `useAuth.tsx`
(`rg` confirma; os outros `fetchProfile` do repo são de Evolution/API e
callbacks locais). `refreshProfile` é aguardado em `AvatarUpload.tsx` dentro
de `withFeedback` (erro vira toast — comportamento pré-existente para
transitórios, estendido a 4xx/5xx por ordem da recusa; sem defeito novo).
`boundedFetch` com entrada não-`Request` gera byte a byte o mesmo `init` de
antes. `isTransientProfileFailure` exportado é aditivo.

Arquivos (`git diff --name-only`, exato):
src/hooks/auth/__tests__/useAuth.perfil-indisponivel.test.tsx
src/hooks/auth/useAuth.tsx
src/integrations/supabase/__tests__/client.fetch.test.ts
src/integrations/supabase/client.ts
src/services/__tests__/auth.service.fetchProfile.test.ts
src/services/auth.service.ts

Verificação (resultado real, sem número à mão):
- `npx vitest run` nos 3 arquivos do cartão + 2 suítes vizinhas
  (`auth.service.test.ts`, `useAuth.perfil-identidade.test.tsx`): 5 passed,
  26 passed.
- Prova vermelho/verde: com o `src` escondido via `git stash push` (só os 3
  arquivos de `src`, testes mantidos), 6 testes falham (allowlist,
  caller-signal, timeout-transitório, 5xx-sem-retry, 400-sobe,
  5xx-não-marca); com o `src` restaurado (`git stash pop stash@{0}` —
  stashes de outros agentes intocados), os 26 passam.
- `npx tsc -b --force`: rc=0. `npx eslint` nos 6 arquivos: 0 errors
  (1 warning pré-existente `react-refresh/only-export-components` em
  `useAuth.tsx:254`).
- Diff do refazer: 6 arquivos, 19953 caracteres (teto 90k OK); sem
  identificador de produção em linha adicionada.

Nota de workspace: `hermes-tarefa-iniciar` responde CONGELADO e o guard
proíbe `git worktree add` em `~/projetos`; trabalhei no workspace original
do cartão (branch `v2/fix-rede-cliente-supabase-timeout-26101302457cf3`),
cujos commits `a4325ab252`+`f0325d7ca7` já são o trabalho anterior — o
`cherry-pick` ordenado era desnecessário. Commit novo só com os 6 arquivos
acima, escopo = os 5 pontos da recusa.
