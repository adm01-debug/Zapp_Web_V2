Especialista: edgar
## O que mudou e por quê
- supabase/functions/ai-transcribe-audio/index.ts: respostas de erro do cliente em pt-BR (504 do download, 504 do STT, 413 por metadata.size via decideAudioSizeRefusal exportada, 500 fixo sem error.message); 5xx com corpo próprio saem por jsonResponse porque errorResponse mascara corpo em 5xx; status de erro do download agora propaga em vez de sempre 400; USER_PER_MINUTE/SERVICE_PER_MINUTE e caminho de serviço preservados (DK-01).
- supabase/functions/ai-transcribe-audio/index.test.ts: testes do 504 pt-BR (download e STT), do 500 sem vazamento de detalhe interno, da propagação do status do download e da decisão pura de tamanho.
- supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts: função ai-transcribe-audio fora de PENDENTES_DECLARADAS (linha no ledger por chamada, herança do trabalho anterior).
## Prova
- vermelho antes (código da base sem a correção, com o teste novo): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-transcribe-audio/index.test.ts` → `TS2353 [ERROR]: Object literal may only specify known properties, and 'sttTimeoutMs' does not exist in type 'Partial<TranscribeAudioDeps>'` + `Found 2 errors` (o código antigo não tem os pontos de extensão que o teste exige).
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-transcribe-audio/index.test.ts` → `ok | 18 passed | 0 failed`
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts` → `ok | 4 passed | 0 failed`
- verde depois: `bun run test:contracts tests/contracts/ai-endpoints-auth.contract.test.ts` → `Test Files 1 passed (1)` / `Tests 16 passed (16)`
- verde depois: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (banco_local sem nome de conjunto; o cartão não tem migration).
## Pontos do revisor
- Ponto 1 (mensagens em pt-BR, item 4 do cartão): resolvido — 504 do download `Tempo esgotado ao baixar o áudio` (supabase/functions/ai-transcribe-audio/index.ts, retorno do downloadAudio + propagação do status no handler), 504 do STT `O provedor de transcrição demorou demais para responder` (via jsonResponse), 413 por metadata.size `Arquivo de áudio grande demais (máximo 25 MB)` (decideAudioSizeRefusal), 500 fixo `Erro interno ao transcrever o áudio` sem error.message e sem vazamento (detalhe só no log); teste do 500 checa que o corpo não vaza o detalhe interno. Testes que provam: `G4: fetch pendurado ao STT estoura o timeout e devolve 504 em pt-BR`, `G4: 500 de exceção devolve texto fixo em pt-BR, sem vazar o detalhe interno`, `Refazer t_eeac9ac7: erro de download com status 504 chega ao cliente como 504 em pt-BR`, `Refazer t_eeac9ac7: decideAudioSizeRefusal — decisão de tamanho por metadado` (todos em supabase/functions/ai-transcribe-audio/index.test.ts).
## Arquivos
- supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts
- supabase/functions/ai-transcribe-audio/index.test.ts
- supabase/functions/ai-transcribe-audio/index.ts
## O que NÃO fiz e por quê
- Não traduzi os dois erros pós-download em inglês pré-existentes (`Audio storage download failed`, `Audio file too large (max 25MB)` 400): são linhas de contexto da base, fora do diff que a recusa mandou trocar (só respostas que o diff cria ou toca); traduzi-los seria comportamento a mais fora do título.
- Não cobri o ramo de tamanho por metadata.size via downloadAudio injetado: a recusa permite declarar quando não der sem mexer em outros arquivos; cobri com a decisão pura exportada decideAudioSizeRefusal chamada pelo caminho real.
- Base: trabalho anterior do mesmo cartão (commit 5dd127bb09, que inclui o porte G4 003ed16ca) trazido por checkout só dos 3 arquivos permitidos para a ponta dia/2026-10-15; DK-01 preservado.
- Nota sobre o juiz barato: o ponto "código sem teste novo" não procede — o commit 6bdc9796ab contém supabase/functions/ai-transcribe-audio/index.test.ts com os testes pt-BR novos listados acima.
