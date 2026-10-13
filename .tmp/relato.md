Especialista: senior
Área usada: area-testes-do-produto

## O que mudou e por quê
- O trabalho aprovado do cartão já está absorvido na ponta atual: `9f9a80879` é ancestor de `dia/2026-10-13`.
- Mantive a ponta atual sem alterar código, preservando o comportamento aprovado: `ChatPanel.tsx` já está sem a prop morta do Ligar e `ChatPanel.ligar.test.tsx` já testa o botão real.
- O coordenador registrou em 13/10 05:28 que o critério válido para este fechamento é teste focal + `zapp-verify . --rapido`; fechei exatamente esse escopo.

## Pontos do refazer
- Ponto 1: rebase do trabalho aprovado na ponta atual — resolvido por absorção; a ponta atual já contém o commit de comportamento aprovado (`9f9a80879` ancestor de `dia/2026-10-13`).
- Ponto 2: não acrescentar comportamento novo — resolvido; não há diff de código contra `dia/2026-10-13`.
- Ponto 3: verificação do escopo definido pelo coordenador — resolvido; o teste focal passou e `zapp-verify . --rapido` passou.

## Arquivos que conflitaram e resolução
- `src/components/inbox/ChatPanel.tsx`: preservada a versão da ponta atual; ela já não repassa a prop morta do Ligar para o cabeçalho.
- `src/components/inbox/__tests__/ChatPanel.ligar.test.tsx`: preservada a versão da ponta atual; ela já contém o teste do botão real de Ligar.
- Não ficou conflito manual pendente no workspace; a resolução correta foi manter o código da ponta atual.

## Prova executada agora
- `git merge-base --is-ancestor 9f9a80879 dia/2026-10-13` → `9f9a80879 is ancestor of dia/2026-10-13`.
- `git diff --stat dia/2026-10-13...HEAD -- ':(exclude).tmp/relato.md'` → saída vazia.
- `npx vitest run src/components/inbox/__tests__/ChatPanel.ligar.test.tsx` → `Test Files  1 passed (1); Tests  3 passed (3)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (60s)` com `db_guard`, `tipos`, `lint` e `migrations` OK.

## Arquivos do diff
Saída de `git diff --name-only dia/2026-10-13...HEAD` após o commit de relato:

.tmp/relato.md

## Nota de escopo
- Não alterei arquivos fora da lista permitida do cartão.
