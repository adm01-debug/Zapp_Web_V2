Especialista: edgar

Refazer do G4 (`ai-transcribe-audio`: ledger, timeouts e tamanho antes de baixar) sobre a base DK-01 (`dia/2026-10-14`, com `USER_PER_MINUTE`/`SERVICE_PER_MINUTE` preservados). Só strings que o diff G4 cria/toca; resto byte-idêntico ao G4.

Ponto 1 — 504 do STT em pt-BR (`index.ts`, ramo `timedOut`): corpo `O provedor de transcrição demorou demais para responder`. Teste: `G4: fetch pendurado ao STT estoura o timeout e devolve 504 em pt-BR` — vermelho com o texto EN (2 failed), verde com pt-BR.
Ponto 2 — 500 sem detalhe interno (`index.ts`, `catch`): texto fixo `Erro interno ao transcrever o áudio`; o detalhe (`error.message`) fica só no log do servidor. Teste: `G4: 500 de exceção devolve texto fixo em pt-BR, sem vazar o detalhe interno` — vermelho com EN, verde com pt-BR; cobre o ajuste pedido no teste do 500.
Ponto 3 — recusa por `metadata.size` (`index.ts`, `downloadAudio` + `decideAudioSizeRefusal` exportada): `Arquivo de áudio grande demais (máximo 25 MB)` com 413 antes de baixar; `info` com falha segue para o download (a checagem pós-download continua valendo). Testes: `decideAudioSizeRefusal — decisão de tamanho por metadado` (nulo/no-limite/acima) + `erro de download com status 504 chega ao cliente como 504` (propagação do status, que antes era sempre 400).
Ponto 4 — 504 do download em pt-BR (`index.ts`): `Tempo esgotado ao baixar o áudio` via `AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)` + `abortable`. Teste do ponto 3 (segunda parte).

Divergência da recusa (ponto 2/4, documentada no código): a recusa sugeria `errorResponse(..., 500/504)`, mas o helper troca o corpo por `Internal server error` em 5xx (`validation.ts`, convenção já usada pelo ai-proxy com `AiRoutingError` e registrada em `tests/contracts/ai-routing.contract.test.ts`). Com `errorResponse` o pt-BR nunca chegaria ao cliente — por isso os 5xx com corpo próprio saem por `jsonResponse({ error }, status, req)`. Status e corpo conferidos nos testes acima.

Arquivos (`git diff --name-only dia/2026-10-14`):
supabase/functions/ai-transcribe-audio/index.test.ts
supabase/functions/ai-transcribe-audio/index.ts

Verificações (comandos reais, agora):
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-transcribe-audio/index.test.ts` → ok | 18 passed | 0 failed
- prova vermelha (strings EN restauradas temporariamente, `--filter "pt-BR"`) → FAILED | 1 passed | 2 failed; restaurado → verde
- `deno test ... supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts` → ok | 4 passed | 0 failed
- `bun run test:contracts -- tests/contracts/ai-endpoints-auth.contract.test.ts` → 16 passed
- Diff vs `dia/2026-10-14`: só os 2 arquivos acima (448 insertions, 13 deletions — as linhas removidas são exatamente as substituídas pelo G4); `USER_PER_MINUTE`/`SERVICE_PER_MINUTE` e o caminho de serviço intactos.
