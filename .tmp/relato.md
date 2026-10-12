Especialista: worker (hooks) (area-front-hooks)

## Ponto 1 — a origem da correção e o que o diff traz
O commit 8f034bb6b ("fix(arquivos): aborta miniaturas PDF em timeout e libera fila", autor Hermes Senior, 11/10/2026 21:22) foi trazido para esta base com `git cherry-pick -x 8f034bb6b`: entrou SEM conflito como 67ee12ad1. O diff de CÓDIGO desta entrega contra `dia/2026-10-11` é o mesmo do commit citado, nos mesmos dois arquivos:
- src/lib/pdfThumbnail.ts
- src/lib/__tests__/pdfThumbnail.test.ts
Nenhum outro arquivo de código mudou. Não reimplementei nada: a correção é a do senior, verbatim; a única edição nova deste cartão é este relato.

## Ponto 2 — a linha do jev-juiz e a diferença de contagem
O diff de código tem 2 arquivos; se a linha do jev-juiz fala em 3, é porque ela conta também o próprio relato (.tmp/relato.md), que está versionado na base e entra na conta de caminhos alterados quando eu o reescrevo. A diferença é essa e só essa: o que o cartão chama de "diff" (código de src/lib) tem 2 arquivos; a contagem de caminhos do juiz soma o relato. Não há terceiro arquivo de código escondido — `git diff --stat dia/2026-10-11...HEAD` lista só os dois de src/lib.

## Ponto 3 — o que o commit faz e o contrato que os testes travam
Na src/lib/pdfThumbnail.ts o commit endurece o cancelamento a partir do `AbortController` INTERNO por execução que o pai já mantinha: o sinal interno vai ao `fetch` e a TODAS as checagens de aborto; a vaga da fila é repassada DIRETO a quem espera (`liberarVaga` chama `proximo.assumir()` sem a conta cair a zero); entra um ouvinte de abort que dispara o descarte e é removido no fim; e há uma checagem explícita de aborto DEPOIS do render, antes de devolver/cachear. Tudo isso fecha o vazamento em que, estourado o prazo e devolvida a vaga, download/parse/render seguiam em segundo plano. Os testes que travam esse contrato em src/lib/__tests__/pdfThumbnail.test.ts:
- "o prazo de 15 s aborta o fetch pendurado: null, sinal do fetch abortado, sem getDocument e com a vaga de volta";
- "o prazo de 15 s aborta o DOWNLOAD em voo: null, getDocument nunca chamado e a vaga volta";
- "abortar enquanto ESPERA a vaga tira a chamada da fila e não ocupa vaga";
- "nunca deixa mais de 2 renderizações em andamento e respeita a ordem de chegada" (a quarta chamada ocupa a vaga devolvida).
Os quatro descrevem exatamente o comportamento que o cartão pede que fique coberto.

## Ponto 4 — por que os testes valem mesmo passando na base (retenção do portão)
Medi: o código de `pdfThumbnail.ts` na `dia/2026-10-11` é IDÊNTICO ao pai do commit (683a53fa0) — a `dia` ainda não tem esta mudança. Rodei a versão NOVA do arquivo de teste contra o código da `dia` (troquei o fonte pela versão da base, rodei, restaurei) e os 26 testes passam: `Test Files 1 passed (1); Tests 26 passed (26)`. Ou seja, o commit 8f034bb6b é um ENDURECIMENTO de um cancelamento que o pai já resolvia de forma observável: por isso o portão o classifica como "teste passa na base". O valor do teste aqui não é provar um vermelho novo, é TRAVAR o contrato — prazo de 15 s aborta de verdade o download em voo, aborto na espera não ocupa vaga, a fila não passa de 2 — para que nenhuma refatoração futura reintroduza o vazamento (download/render seguindo depois da vaga voltar). É o caso que o próprio portão descreve: "teste de comportamento que JÁ existe". Não reescrevi nem afrouxei nenhum teste; o diff de teste é o do commit do senior, verbatim.

## Prova (ver bloco FATOS MEDIDOS do fechar)
- Alvo: `npx vitest run src/lib/__tests__/pdfThumbnail.test.ts` — todos os testes do arquivo passam, incluindo os quatro acima.
- Verificação: `zapp-verify . --rapido` — VERDE (tipos/lint/migrations/db_guard OK; banco_local fora do rápido). Nenhum erro no meu diff.

## O que NÃO fiz e por quê
- Não alterei src/lib/pdfThumbnail.ts nem o teste: o cartão pede só o relato; a correção veio pelo cherry-pick do commit do senior.
- Não "refiz" nada nem toquei em CI/documentação: fora do escopo desta entrega.
- Não criei teste novo para forçar um vermelho: o cartão pede o commit do senior integrado, com o teste dele.

CONCLUÍ.
