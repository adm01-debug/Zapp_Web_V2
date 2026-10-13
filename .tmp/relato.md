Especialista: edgar

## O que mudou e por quê (recusa do revisor, [refazer])
Corrige o fail-open apontado: em `collectReferencedPaths` o teto `MAX_REFERENCE_ROWS` (e `MAX_SCAN_PER_BUCKET`) cortava a leitura de referências em silêncio, e um objeto cuja linha estava além do teto podia ser apagado como órfão.

- `supabase/functions/cleanup-storage-orphans/index.ts`
  - laço de referências: separado o fim normal (`rows.length < pageSize` = última página) da borda de teto. Ao atingir `maxRows` com página cheia, sonda UMA linha além do lido (`range(offset+rows.length, offset+rows.length)`); se houver linha (ou erro de sonda), devolve `{ paths, failed: true }` — o bucket é pulado e o erro `reference-read-failed` é reportado (fail-closed). Se a sonda vier vazia, a leitura está completa e segue normal.
  - `CleanupInjected.maxReferenceRows`: seam de teste para injetar o teto e provar a borda no handler real (não usada em produção, onde vale o default).
  - `MAX_SCAN_PER_BUCKET`: mantido como `truncated` (aviso + só apaga o que foi listado e comparado) — é seguro como o revisor concordou; não vale para referências.
- `supabase/config.toml`: comentário alinhado ao código/relato — `x-cron-secret` conferido contra o env `CRON_SECRET` (antes dizia "dedicado no Vault").

## Pontos do revisor
- Ponto 1: feito. `collectReferencedPaths` separa os dois casos e devolve `failed: true` quando há linha além do teto; teste unitário prova (`maxRows: 2`, 5 linhas → `failed === true`). Teto de scan de bucket mantido como aviso, como o revisor autorizou (só apaga o que foi listado/comparado).
- Ponto 2: feito. Teste Deno com `maxRows` pequeno prova `failed === true`; e o teste do handler (com `maxReferenceRows: 1` injetado) prova que NADA é removido (`ctx.removes.length === 0`) e `whatsapp-media:reference-read-failed` aparece em `errors`. Borda extra: total EXATAMENTE igual ao teto, sem linha além, NÃO vira `failed`.
- Ponto 3: feito. Comentário do `config.toml` agora diz env `CRON_SECRET`.
- Ponto 4: `wc -l` do arquivo de teste = 464 (a contagem anterior citada, 407, estava errada — o revisor já notou que era 409). `zapp-verify . --rapido` ficou VERDE nesta rodada (tipos OK, 216s) — não houve OOM desta vez; a ressalva anterior não se aplica.
- Comando de CI de cada teste: `index.test.ts` linha 16.

## Prova
- vermelho antes: `deno test ... supabase/functions/cleanup-storage-orphans/index.test.ts` (com o laço antigo) → `FAILED | 15 passed | 2 failed (135ms)`; erro: `teto de referências não marcou failed: ["c/r0.jpg","c/r1.jpg"]` e o handler removeu com referência truncada.
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/cleanup-storage-orphans/index.test.ts` → `ok | 17 passed | 0 failed (101ms)`.
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (228s)`.
- comando exato de cada teste na linha `16` do `index.test.ts`.

## O que NÃO fiz e por quê
- Não mexi em `listBucketObjects`/`MAX_SCAN_PER_BUCKET` (aviso, não fail-closed): só limita o que já foi lido e comparado, o revisor considerou aceitável.
- Sem migration, sem deploy, sem produção.
