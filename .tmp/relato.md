Especialista: Edgar (area-edge-api)

## O que mudou e por quê
`ESTADO.md`: 3 âncoras do arquivo da própria entrega realinhadas ao deslocamento de linhas que ela causou. A entrega
(#219) somou 241 linhas em `supabase/functions/_shared/evolution-webhook-messages.ts` e deixou a tabela do ESTADO.md
velha: `ai-transcribe-audio` 734→983, `classify-sticker` 711→960, `fetch-link-preview` 270→275.

## Verificação (comando rodado -> linha de resultado)
- `zapp-verify . --rapido` -> `OK db_guard 0s | OK tipos 233s | OK lint 0s | OK migrations 1s` e `VERIFY: VERDE SEM BANCO (234s)`
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 $(git ls-files 'supabase/functions/**/*.test.ts')` -> `ok | 1908 passed (16 steps) | 0 failed | 3 ignored`
- `./node_modules/.bin/vitest run --config vitest.contracts.config.ts --reporter=dot` -> 0 linha `FAIL`
- regra das âncoras da guarda (`node .tmp/ancoras.mjs`, mesma semântica do teste 2) -> `26 desatualizadas antes`, `23 depois`, `0 no arquivo da entrega`
- `grep -n '/functions/v1/fetch-link-preview\|/functions/v1/classify-sticker\|/functions/v1/ai-transcribe-audio' supabase/functions/_shared/evolution-webhook-messages.ts` -> `275:`, `960:`, `983:`

## Ponto 1 (cherry-pick de f50ef67ad, sem recomeçar)
Não procede como cherry-pick: a entrega já está na base deste workspace. Medido por conteúdo — o teste
`supabase/functions/_shared/away-message-webhook.test.ts` da base é idêntico ao da branch da entrega (`git diff f50ef67ad -- <arquivo>` vazio) e o `git cherry-pick -n 4b6abcb255` não alterou nenhuma linha do código. Portanto nada a trazer.

## Ponto 2 (reproduzir na ponta de dia/2026-10-14 e corrigir a causa)
Feito. Reproduzi na ponta (workspace em `dia/2026-10-15` = `dia/2026-10-14` = `e7d156b8a7`) e a guarda acusa
`not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`. A causa da parte desta entrega é o
deslocamento de linhas do arquivo dela; as 3 âncoras foram realinhadas em `ESTADO.md` (3 -> 0), sem afrouxar asserção.

## Ponto 3 (provar com o comando verde e zapp-verify)
Feito nesta árvore: ver a seção Verificação (`VERIFY: VERDE SEM BANCO (234s)`, Deno `1908 passed | 0 failed`,
contratos sem `FAIL`). Commit da correção: `ac6f3f546c`. O item do espelho já é vermelho na BASE (baseline do próprio
integrador, `~/arquitetura-v2/integrador/.ci-base-e7d156b8a7….txt`, 5 itens); os itens reais desta árvore são
exatamente esses 5 (delta 0), e a primeira divergência de âncora hoje é `ai-kb-ingest`, de outro cartão.

## Achados fora do escopo (não corrigidos)
- As outras 23 âncoras desatualizadas do `ESTADO.md` pertencem aos cartões que deslocaram o código delas; refazeres
  irmãos já pendentes: `ai-kb-ingest` (9e031551e5), `create-user` (27f5efc38e), `talkx-link` (867a7e8c27),
  `useStickerPicker` (c895194ade), `elevenlabs-scribe-token` (9d22e117ec), `batch-fetch-avatars` (d3049c4e9f).
  `ESTADO.md` é ponto de colisão entre esses cartões (20+ pendentes mexem nele).
- 6 itens do `node --test` desta sessão são artefato do sandbox: `scripts/ci/lint-ratchet.unit.mjs` faz `git init` e a
  guarda da sessão bloqueia (`HERMES-GUARD (git): git init é proibido nesta sessão`). Não aparecem no baseline nem no CI.
