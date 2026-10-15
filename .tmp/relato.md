Especialista: semisenior

## O que mudou e por quê (recusa do revisor, rodada 1 do PE-101/etapa 086)

A entrega anterior cortava a leitura de referências no teto `maxRows` em silêncio
(fail-open: objeto referenciado além do teto podia ser apagado como órfão). Esta
rodada separa os dois fins de laço e fecha no teto (fail-closed).

- `supabase/functions/cleanup-storage-orphans/index.ts`
  - `collectReferencedPaths`: `rows.length < pageSize` = última página (leitura
    completa). Com página cheia E `scanned >= maxRows`, sonda UMA linha além do
    lido (`range(offset + rows.length, offset + rows.length)`, mesmos filtros da
    consulta); havendo linha além ou erro na sonda, devolve `{ paths, failed: true }`
    e o handler pula o bucket (`<bucket>:reference-read-failed`, nada removido).
    Sonda vazia = leitura completa, segue normal.
  - `CleanupInjected.maxReferenceRows`: seam para injetar o teto no handler real
    (default de produção inalterado). Docblock atualizado com a regra da sonda.
- `supabase/functions/cleanup-storage-orphans/index.test.ts`: 3 testes novos
  (17 `Deno.test` no total; `wc -l` = 464).
- `supabase/config.toml`: comentário alinhado — `x-cron-secret` conferido contra o
  env `CRON_SECRET` (antes dizia "dedicado no Vault").

## Prova (comandos rodados nesta rodada, mesmo workspace)

- vermelho antes (index.ts da entrega recusada `96019d6530` + testes novos):
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/cleanup-storage-orphans/index.test.ts`
  → `FAILED | 15 passed | 2 failed`, erro:
  `removeu com referência truncada (fail-open): [{"bucket":"whatsapp-media","paths":["contato-1/image/orfa.jpg","contato-1/image/fixa.jpg"]}]`
  (o 3º teste novo — total exatamente igual ao teto — passa antes e depois por
  desenho: é guarda contra overcorrection, não prova do defeito).
- verde depois (correção restaurada + 3 linhas de docblock):
  mesmo comando → `ok | 17 passed | 0 failed`.
- Critério 3 (`zapp-verify . --rapido` verde): executado pelo `hermes-tarefa-fechar`
  nesta rodada; o resultado está na saída do fechar abaixo. Sem OOM nesta árvore.

## Pontos do revisor

- Ponto 1: feito. `index.ts` (`collectReferencedPaths`): casos separados; teto com
  página cheia → sonda → `{ paths, failed: true }` quando há linha além.
  `MAX_SCAN_PER_BUCKET` mantido como aviso (`truncated`), como autorizado.
- Ponto 2: feito. `index.test.ts`: `maxRows: 2` com 5 linhas → `failed === true`;
  handler com `maxReferenceRows: 1` → `ctx.removes` vazio e
  `whatsapp-media:reference-read-failed` em `errors`; borda total == teto sem linha
  além → NÃO vira `failed`. Todos chamam o código real.
- Ponto 3: feito. `config.toml` agora diz env `CRON_SECRET`.
- Ponto 4: feito. Teste com `wc -l` = 464 (medido agora, não à mão); verificação
  registrada pelo fechar, sem ressalva herdada.

## Arquivos do diff (base `96019d6530..HEAD`, colado do comando)

- `.tmp/relato.md`
- `supabase/config.toml`
- `supabase/functions/cleanup-storage-orphans/index.test.ts`
- `supabase/functions/cleanup-storage-orphans/index.ts`

## O que NÃO fiz e por quê

- Não mexi em `listBucketObjects`/`MAX_SCAN_PER_BUCKET` (só limita o já lido e
  comparado — seguro como aviso, autorizado pelo revisor).
- Não trouxe commit de outro cartão: os 5 commits após `96019d6530` nesta branch são
  todos deste refazer (correção + relato + docblock). Sem migration, sem deploy,
  sem produção. Nenhum chamador fora do módulo (`rg` por `collectReferencedPaths` /
  `maxReferenceRows` só acha o módulo e seu teste).
