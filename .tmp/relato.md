Especialista: edgar

## O que mudou e por quê (recusa do revisor, [refazer])
Corrige o fail-open apontado: em `collectReferencedPaths` o teto `MAX_REFERENCE_ROWS` cortava a leitura de referências em silêncio, e um objeto cuja linha estava além do teto podia ser apagado como órfão.

- `supabase/functions/cleanup-storage-orphans/index.ts`
  - laço de referências: separado o fim normal (`rows.length < pageSize` = última página) da borda de teto. Ao atingir `maxRows` com página cheia, sonda UMA linha além do lido (`range(offset+rows.length, offset+rows.length)`); se houver linha (ou erro de sonda), devolve `{ paths, failed: true }` — o bucket é pulado e o erro `reference-read-failed` é reportado (fail-closed). Se a sonda vier vazia, a leitura está completa e segue normal.
  - `CleanupInjected.maxReferenceRows`: seam de teste para injetar o teto e provar a borda no handler real (default de produção inalterado).
  - `MAX_SCAN_PER_BUCKET`: mantido como `truncated` (aviso + só apaga o que foi listado e comparado) — seguro, como o revisor autorizou; não vale para referências.
- `supabase/config.toml`: comentário alinhado ao código/relato — `x-cron-secret` conferido contra o env `CRON_SECRET` (antes dizia "dedicado no Vault").
- `ESTADO.md` e `docs/migration/MATRIZ_EDGE_TABELA.md`: INDISPENSÁVEIS, não são escopo extra — são o registro/índice derivado das Edge Functions (contagem 81→82 e a linha do novo `cleanup-storage-orphans`), atualizados no commit de implementação `1636c5da07` desta mesma entrega. Sem eles a guarda de documentação reprova. Não os toquei nesta correção.

## Números reais do diff (base `453e6b69f9..HEAD`)
- 6 arquivos: `index.ts`, `index.test.ts`, `config.toml`, `ESTADO.md`, `MATRIZ_EDGE_TABELA.md`, `.tmp/relato.md`.
- 1 arquivo de teste: `cleanup-storage-orphans/index.test.ts`, com 17 casos `Deno.test` no total; 3 são novos nesta correção (o resto veio da implementação).

## Critério de pronto
1. Nenhum objeto órfão acumulado: demonstrado pelo teste de drenagem "cron: órfão antigo é apagado; referenciado e jovem ficam" (o órfão elegível sai) e pelo teste de teto (o lote corta e o resto fica para a próxima passada); a função remove os órfãos elegíveis por invocação do cron.
2. Nada referenciado é apagado: testes de referência (referenciado fica, fail-closed em URL ilegível/erro de leitura, e agora teto de referências → bucket preservado).
3. `zapp-verify . --rapido` VERDE nesta rodada.

## Pontos do revisor
- Ponto 1: feito. `collectReferencedPaths` separa os casos e devolve `failed: true` quando há linha além do teto; teste unitário (`maxRows: 2`, 5 linhas → `failed === true`). Teto de scan de bucket mantido como aviso, como autorizado.
- Ponto 2: feito. Teste Deno com `maxRows` pequeno → `failed === true`; teste do handler (`maxReferenceRows: 1` injetado) → `ctx.removes.length === 0` e `whatsapp-media:reference-read-failed` em `errors`. Borda extra: total EXATAMENTE igual ao teto, sem linha além, NÃO vira `failed`.
- Ponto 3: feito. Comentário do `config.toml` agora diz env `CRON_SECRET`.
- Ponto 4: `wc -l` do teste = 464 (a contagem 407 do relato anterior estava errada; o revisor já apontou 409). `zapp-verify . --rapido` ficou VERDE nesta rodada (tipos OK) — não houve OOM; a ressalva anterior não se aplica.

## Prova
- vermelho antes: `deno test ... cleanup-storage-orphans/index.test.ts` (com o laço antigo) → `FAILED | 15 passed | 2 failed (135ms)`; erro: `teto de referências não marcou failed: ["c/r0.jpg","c/r1.jpg"]` e o handler removeu com referência truncada.
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/cleanup-storage-orphans/index.test.ts` → `ok | 17 passed | 0 failed (101ms)`.
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (228s)`.

## O que NÃO fiz e por quê
- Não mexi em `listBucketObjects`/`MAX_SCAN_PER_BUCKET` (aviso, não fail-closed): só limita o que já foi lido e comparado.
- Sem migration, sem deploy, sem produção.
