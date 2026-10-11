Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca SÓ `supabase/functions/automation-suggest-reply/` (edge nova + teste Deno). Nenhum arquivo de outro assunto.
- Não usa `service_role`: a leitura de `messages`/`contacts` sai pelo client do PRÓPRIO chamador
  (`createAuthedClient`), então a RLS é a fonte de verdade da visibilidade. Não toca `rateLimit`, `verifyHmac`,
  `requireRole` nem `DELETE`; nenhuma proteção foi afrouxada — o caso NEGADO (contato sem mensagem visível) tem
  teste próprio e devolve vazio sem chamar a IA.
- Nenhuma referência ao banco/endpoint de produção. Nada muda para quem já chama: a edge é NOVA.

## O que mudou e por quê
Retomada da entrega `feat(edge): automation-suggest-reply` (original `c8ce7e274`; aqui já re-aplicada como `0acdc0ce6`).
O diff entrega exatamente o pedido do cartão:
- `supabase/functions/automation-suggest-reply/index.ts` — edge nova: recebe SÓ `contact_id` e resolve o contexto no
  servidor (últimas 10 mensagens pelo client do chamador; a última mensagem RECEBIDA vira a consulta da RPC
  `search_knowledge_base`, 3 artigos por relevância). Devolve até 3 sugestões curtas em pt-BR; o TÍTULO da fonte é
  carimbado no servidor a partir dos artigos realmente oferecidos (article_id fora da lista → `source: null`, nunca
  um título inventado pelo modelo). Erros de cota/orçamento devolvem 429 com código estável.
- `supabase/functions/automation-suggest-reply/index.test.ts` — 13 testes Deno cobrindo: RLS/visibilidade, mensagem
  recebida × mensagem do atendente, título carimbado no servidor, article_id alucinado, 429 por guarda de IA,
  orçamento estourado, 429 do provedor, forma errada do modelo (502), contrato de ≤3 sugestões, `contact_id`
  ausente/fora de UUID (400) e falha de leitura → vazio (200).

## Prova
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint com `novas=0`, migrations OK)
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/automation-suggest-reply/index.test.ts`
  → `ok | 13 passed | 0 failed (21ms)`
- `zapp-verify full .` — db_guard/tipos/lint (`novas=0`)/migrations OK; a execução foi encerrada durante a suíte de
  testes sem emitir o resumo (processo sem saída), então NÃO a uso como prova. O defeito do motivo não roda no full
  (o espelho do CI é que o roda); a reprodução dele está abaixo.

## O motivo registrado (quebra do ESPELHO DO CI) — o que verifiquei e reproduzi
O motivo era o nó `ESTADO.md lista exatamente as edges que existem no repositório` reprovando no empilhamento.
Montei o cenário isolado — `dia/2026-10-11` + o artefato do cartão de docs (ESTADO.md + FEATURE_REGISTRY.md +
TESTING_CONVENTION.md + a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs`) + ESTA edge — e rodei a guarda:
- ANTES (só com a edge, sem tocar no doc): `# tests 11` / `# pass 8` / `# fail 3` — vermelhos os itens
  `ESTADO.md lista exatamente as edges...`, `ESTADO.md cita só âncoras reais...` e `total de edges do cabeçalho...`.
- Depois de inserir a linha da edge no ESTADO.md (`| \`automation-suggest-reply\` | E | — sem chamador no repositório — |`,
  cabeçalho 80→81, totais `E 16→17` / `total 80→81`, `Órfãs (16)→(17)` + a linha na lista): `# pass 10` / `# fail 1` —
  sobrando SÓ o item de ÂNCORAS do próprio doc (item de outro cartão, não desta edge).

## O que NÃO fiz e por quê
- NÃO toquei `ESTADO.md` / `FEATURE_REGISTRY.md` / `TESTING_CONVENTION.md` / `scripts/ci/**`: não estão nos
  "ARQUIVOS QUE PODE TOCAR" deste cartão e são o artefato do cartão de docs (SL-122). Além disso, o integrador
  empilha com `git merge --squash`: os dois cartões ADICIONAM `ESTADO.md` na mesma base, o que gera conflito add/add
  — provei com `git merge-tree 32c68d56a 2e674b5da be4261df2` → `added in both` + marcadores de conflito. Um conflito
  aqui faz este cartão ser PULADO na integração. A registração da edge no doc pertence ao dono do doc: o refazer
  `t_c6a1be9f` já tem "corrigir o ESTADO.md" no escopo e, por ser baseado na dia que já contém o ESTADO.md, consegue
  MODIFICAR o arquivo sem o add/add.
- O item de âncoras do ESTADO.md (posição 46 da pilha) é do cartão de docs e está em correção por `t_21beeef9`.
