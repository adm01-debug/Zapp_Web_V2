Especialista: worker (hooks) (area-front-hooks)

## Ponto 1 — a origem da correção e o que o diff traz
O commit 8f034bb6b ("fix(arquivos): aborta miniaturas PDF em timeout e libera fila", autor Hermes Senior, 11/10/2026 21:22) foi trazido para esta base com `git cherry-pick -x 8f034bb6b`: entrou SEM conflito como 67ee12ad1. O diff de CÓDIGO desta entrega contra `dia/2026-10-11` é exatamente o mesmo do commit citado, nos mesmos dois arquivos:
- src/lib/pdfThumbnail.ts
- src/lib/__tests__/pdfThumbnail.test.ts
Nenhum outro arquivo de código mudou. Não reimplementei nada: a correção é a do senior, verbatim, e a única edição nova deste cartão é este relato.

## Ponto 2 — a linha do jev-juiz e a diferença de contagem
O diff de código tem 2 arquivos; se a linha do jev-juiz fala em 3, é porque ela conta também o próprio relato (.tmp/relato.md), que está versionado na base e entra na conta de caminhos alterados quando eu o reescrevo. A diferença é essa e só essa: o que o cartão chama de "diff" (código de src/lib) tem 2 arquivos; a contagem de caminhos do juiz soma o relato. Não há terceiro arquivo de código escondido — `git diff --stat dia/2026-10-11...HEAD` lista só os dois de src/lib.

## Ponto 3 — o que a correção passou a fazer (e por que os testes cobrem)
Na src/lib/pdfThumbnail.ts: o fetch recebe o sinal do controlador da execução; a vaga da fila é passada direto ao render (sem intermediário que a prendia); e depois do render há uma checagem explícita de aborto antes de devolver/cachear. Na src/lib/__tests__/pdfThumbnail.test.ts os testes que provam isso:
- "o prazo de 15 s aborta o fetch pendurado: null, sinal do fetch abortado, sem getDocument e com a vaga de volta" (fetch pendurado);
- "o prazo de 15 s aborta o DOWNLOAD em voo: null, getDocument nunca chamado e a vaga volta";
- "abortar enquanto ESPERA a vaga tira a chamada da fila e não ocupa vaga" (a vaga passada direto na fila);
- "nunca deixa mais de 2 renderizações em andamento e respeita a ordem de chegada" (quarta chamada entrando na fila após a vaga ser liberada).
Mesmo conjunto de quatro comportamentos que o cartão aponta como pendente de relato.

## Ponto 4 — controle interno: origem e não regressão
O controlador INTERNO por execução já existia na base `dia/2026-10-11` (não foi introduzido por este commit nem por este cartão). O commit apenas o alimenta no fetch e checa o aborto após o render, mantendo o controle interno e o externo (o sinal que o chamador passa) separados. Nada de outro arquivo foi enfraquecido; o teste existente de AbortSignal completo segue passando.

## Prova (ver bloco FATOS MEDIDOS do fechar)
- Alvo: `npx vitest run src/lib/__tests__/pdfThumbnail.test.ts` — todos os testes do arquivo passam, incluindo os quatro acima.
- Verificação: `zapp-verify . --rapido` — VERDE (tipos/lint/migrations/db_guard OK; banco_local fora do rápido). Nenhum erro no meu diff.

## O que NÃO fiz e por quê
- Não alterei src/lib/pdfThumbnail.ts nem o teste: o cartão pede só o relato; a correção já veio pelo cherry-pick do commit do senior.
- Não "refiz" nada nem toquei em CI/documentação: fora do escopo desta entrega.

CONCLUÍ.
