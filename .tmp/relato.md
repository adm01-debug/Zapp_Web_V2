Especialista: senior (area-edge-api)

[refazer 1 de 2] A recusa pede SÓ o relato. Nesta rodada mudou **um** arquivo: `.tmp/relato.md`.
`supabase/functions/automation-suggest-reply/index.ts`, `supabase/functions/automation-suggest-reply/index.test.ts` e
`ESTADO.md` continuam byte a byte como a recusa mandou manter (conferido: `git show HEAD:ESTADO.md | sha1sum` é o
mesmo do commit anterior, e `git diff HEAD~1 --name-only` desta rodada lista só `.tmp/relato.md`).

## Ponto 1 — cada mudança do diff citada por `arquivo:linha`

`ESTADO.md` (as três mudanças do arquivo, que é o diff todo dele):
- `ESTADO.md:7` — cabeçalho: `Base: dia/2026-10-11. 82 edges com index.ts em supabase/functions/.` (era 81).
- `ESTADO.md:38-45` — tabela de totais: linha 40 `| A | 55 |` (era 54) e linha 45 `| **total** | **82** |` (era 81); B/C/D/E seguem 1/3/6/17.
- `ESTADO.md:65` — linha NOVA da tabela: ``| `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |``, entre `auto-close-conversations` (`ESTADO.md:64`) e `batch-fetch-avatars` (`ESTADO.md:66`) — ordem alfabética da tabela.
- A âncora citada existe de verdade: `src/hooks/chat/useAutomationSuggestions.ts:192` contém `await supabase.functions.invoke('automation-suggest-reply', {` (linha conferida nesta rodada lendo `188-196` do arquivo). `src/` não é tocado pelo diff.

`supabase/functions/automation-suggest-reply/index.ts` — arquivo NOVO, 348 linhas; trechos principais:
- `index.ts:48` — `export interface AutomationSuggestReplyDeps` (fronteiras injetáveis: `authorize`, `enforceGuards`, `authedClient`, `generate`).
- `index.ts:94-100` — códigos estáveis (`ai_budget_exceeded`, `rate_limited`) e limites `MENSAGENS_LIMITE = 10`, `ARTIGOS_LIMITE = 3`, `ARTIGO_TRECHO_CHARS = 300`.
- `index.ts:102` — `SYSTEM_PROMPT` (até 3 respostas curtas, pt-BR).
- `index.ts:114-117` — `parseInput`: `contact_id` só passa se for UUID válido.
- `index.ts:127-144` — `parseSuggestions`: aceita de 1 a 3 sugestões (`index.ts:132`), `text` não vazio.
- `index.ts:148-151` — `textoRecebido`: só `sender === "contact"` conta como mensagem recebida.
- `index.ts:167-181` — entrada do handler: CORS, `requireAuth` (`index.ts:174-177`) e `enforceAiGuards` com `functionName: "automation-suggest-reply"` (`index.ts:179-181`).
- `index.ts:186-195` — corpo JSON inválido → 400 (`index.ts:191`); `contact_id` ausente/fora do formato → 400 (`index.ts:194`).
- `index.ts:197-216` — lê `messages` pelo client autenticado do CHAMADOR (RLS decide), `limit(MENSAGENS_LIMITE)` (`index.ts:210`); erro de leitura é fail-closed: `{ suggestions: [] }` 200 (`index.ts:212-216`).
- `index.ts:218-225` — sem mensagem recebida visível → `{ suggestions: [] }` 200 (`index.ts:222-225`).
- `index.ts:230-245` — RPC `search_knowledge_base` com `search_query: ultimaRecebida` e `max_results: ARTIGOS_LIMITE` (`index.ts:230-233`); erro da busca só registra e segue sem artigos (`index.ts:234-235`).
- `index.ts:247-265` — histórico em ordem cronológica (`index.ts:248-254`) e bloco de artigos no prompt do usuário (`index.ts:256-265`).
- `index.ts:272-284` — roteador real de IA (`generateWithRouting`, `purpose: "copilot"`, `index.ts:284`).
- `index.ts:287-306` — erros de IA com código estável: orçamento → 429 `ai_budget_exceeded` (`index.ts:288-294`), 429 do provedor → `rate_limited` (`index.ts:295-301`), resto → 502 `ai_provider_error` (`index.ts:302-306`).
- `index.ts:313-324` — saída fora do contrato → 502 `ai_contract_rejected`, nada é apresentado (`index.ts:316-323`).
- `index.ts:326-335` — o título da fonte é carimbado no SERVIDOR a partir dos artigos oferecidos; `article_id` desconhecido vira `source: null` (`index.ts:328-334`).
- `index.ts:337-347` — 200 com até 3 sugestões (`index.ts:338`) e `Deno.serve` (`index.ts:346-347`).

`supabase/functions/automation-suggest-reply/index.test.ts` — arquivo NOVO de teste, 355 linhas; bancada em
`index.test.ts:36-131` (`clientFalso` em `index.test.ts:55`, `fakeProvider` em `index.test.ts:81`, `pedido` em
`index.test.ts:105`, deps/constantes em `index.test.ts:119-131`) chama o `handleAutomationSuggestReply` real e
substitui só as fronteiras de banco/IA.

## Ponto 2 — a contagem de teste registrada é a real

A frase sobre "1 arquivo de teste e 10 casos" saiu do relato. O que o diff mostra: `index.test.ts` é arquivo NOVO de
teste com **13 `Deno.test`**, nas linhas 135, 148, 168, 183, 203, 227, 241, 262, 280, 297, 312, 331 e 343
(`grep -c 'Deno.test(' = 13`). As duas contagens não se contradizem mais.

## Ponto 3 — o que é execução relatada (não é mudança do diff)

O diff não registra log nenhum. Por isso ficam marcados como **execução relatada, não como mudança**:
- a prova vermelho/verde da guarda de docs (a mutação temporária foi desfeita; `git status ESTADO.md` vazio);
- a primeira tentativa do typecheck da rodada anterior (processo `tsc` morto, exit 137, classificada como ambiente
  pelo `jev-juiz`), que nesta rodada **não se repetiu**: o typecheck passou de primeira.

## Ponto 4 — por que o ESTADO.md está no escopo (mantido)

`ESTADO.md` não está no bloco "ARQUIVOS QUE PODE TOCAR" do pedido original, mas o pedido manda mover a linha da edge
para a posição alfabética da tabela; sem essa linha a guarda
`scripts/ci/docs-estado-registry-convention.unit.mjs` acusa `ESTADO.md não tem linha para a edge automation-suggest-reply`
(prova abaixo). Logo, o arquivo é indispensável para cumprir a recusa e não é achado fora de escopo.

## Execução medida nesta rodada (comandos e resultado real)

Caminho: `~/hermes-workspaces/Zapp_Web_V2/refazer-automation-suggest-reply-final-26101607237573`.

1. `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts`
   → `ok | 13 passed | 0 failed (54ms)`.
2. `zapp-verify . --rapido` → `OK dependencias 1s / OK db_guard 0s / OK tipos 229s / OK lint 5s / OK migrations 0s`
   → `VERIFY: VERDE SEM BANCO (235s)`; banco não verificado porque este cartão não tem migration nem SQL.
3. Guarda de docs — **VERMELHO com a linha removida** (mutação temporária, desfeita em seguida):
   `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
   `✖ ESTADO.md lista exatamente as edges que existem no repositório` /
   `AssertionError: ESTADO.md não tem linha para a edge automation-suggest-reply`.
4. Guarda de docs — **VERDE nos testes que cobrem a minha linha** (estado restaurado, sem mutação):
   `✔ ESTADO.md lista exatamente as edges que existem no repositório` e
   `✔ ESTADO.md mantém totais e lista de órfãs sincronizados com a tabela publicada`.

## Arquivos do diff (`git diff --name-only <base>...HEAD`, colado)

```
.tmp/relato.md
ESTADO.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts
```

`git diff --stat` da entrega: 4 arquivos, cerca de 820 inserções e 3 remoções; o diff inteiro tem cerca de 40 mil
caracteres, bem abaixo do limite de 90 mil da regra. Medição: `git diff --stat <base>...HEAD` e
`git diff <base>...HEAD | wc -c`.
O diff desta rodada sozinho (`git diff HEAD~1 --name-only`) é só `.tmp/relato.md`.

## Achado fora do escopo (não corrigido — comentário no cartão)

A guarda de docs está vermelha na ponta do dia por **duas edges alheias a este cartão**, e as duas já falhavam na base
`d723a90107` (nenhum dos arquivos está no meu diff):
- `create-user`: publicado como grupo A, mas a guarda não acha chamador — o front passou a chamar
  `invokeEdge('create-user', body)` em `src/components/admin/useAdminData.ts:334` (e `:341`) e a guarda procura
  `invoke(\s*['"\`]create-user`. Igual na base.
- `ai-kb-ingest`: âncora `src/hooks/integrations/useKnowledgeBase.ts:99` deixou de conter o nome da edge (o comentário
  que a cita está logo abaixo, na linha 101). Igual na base.
Nenhum dos dois é meu, e eu não altero guarda para fazer passar: registrei como comentário no cartão.

## Avisos do fechar que não procedem (um por linha)

1. "há código alterado sem nenhum teste novo/alterado neste commit: index.ts" — o aviso olha o commit de cima da
   branch (`docs(edge): relato do refazer com ancora arquivo:linha em cada mudanca`), que muda **só** `.tmp/relato.md`,
   exatamente o que a recusa pediu ("SÓ O RELATO: não mexer em index.ts, index.test.ts nem ESTADO.md"). O código e o
   teste novo estão no commit anterior da MESMA branch, `05a97303a2` (`fix(edge): registra automation-suggest-reply no
   estado`), que traz `automation-suggest-reply/index.ts` **e** `index.test.ts` juntos, como o `git diff --name-only
   <base>...HEAD` acima mostra; `deno test` nesse arquivo dá `ok | 13 passed | 0 failed`. Somar teste aqui seria tocar
   no arquivo que a recusa proibiu.
2. "o diff não inclui .tmp/relato.md, então não há como ver as âncoras" (juiz adversarial, Pontos 1–3) — o juiz monta o
   diff IGNORANDO o caminho `.tmp/`, e esta rodada é um refazer de relato: a recusa mandou mudar **só** o relato. Por
   construção, nenhum commit deste cartão satisfaz esse juiz. As âncoras `arquivo:linha` dos Pontos 1–3 estão escritas
   no próprio relato e apontam para arquivos que ESTÃO no diff (`ESTADO.md:7/40/45/65`, `supabase/functions/
   automation-suggest-reply/index.ts`, `.../index.test.ts`), conferidas nesta rodada como descrito na seção de
   medição.

## O que NÃO fiz

- Não alterei `supabase/functions/automation-suggest-reply/index.ts`, `index.test.ts` nem `ESTADO.md` nesta rodada.
- Não toquei em `scripts/ci/docs-estado-registry-convention.unit.mjs`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`,
  migrations, dependências, CI, outros módulos, nem em arquivo de outro cartão.
- Não fiz push, PR, deploy nem acessei produção.
