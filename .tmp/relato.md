Especialista: senior (area-front-hooks)

## Contexto do refazer
- Motivo da recusa: o `TalkXScheduleTimeline` comparava `editedStart !== savedStart`; isso marcava "alteração não salva" quando o mesmo instante vinha gravado como `+00:00` pelo PostgREST e a edição gerava `.000Z`.
- Situação encontrada na base `dia/2026-10-11`: o código e o teste que corrigem este ponto já estavam presentes em `src/components/talkx/TalkXScheduleTimeline.tsx` e `src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx`. Não criei alteração artificial de código.

## Pontos da recusa
- Ponto 1: comparar instantes, não texto ISO.
  - Arquivo conferido: `src/components/talkx/TalkXScheduleTimeline.tsx` usa `Date.parse(editedStart) !== Date.parse(savedStart)` e mantém o rótulo "alteração não salva" só quando o instante realmente difere ou quando não existe início gravado.
  - Teste que prova: `src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx`, caso `A11: gravado no formato do PostgREST (+00:00) com edição no mesmo instante não diz "alteração não salva"`.
  - Vermelho antes: reverti temporariamente só a comparação para `editedStart !== savedStart` e rodei `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx -t 'PostgREST' --reporter=default`; falhou com `expected ... not to contain 'alteração não salva'` e `RED_EXIT=1`.
  - Verde depois: restaurei o arquivo e rodei `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx --reporter=default`; resultado: `Test Files  2 passed (2)` e `Tests  15 passed (15)`.

## Arquivos do diff
Saída de `git diff --name-only dia/2026-10-11...HEAD` antes do commit final de relato:

(nenhum arquivo de código; base do dia já contém a correção exata e a prova de regressão)

Commit final contém somente este relato em `.tmp/relato.md`, para o `hermes-tarefa-fechar` aceitar árvore limpa.

## Verificações executadas
- `bun install` — dependências instaladas no workspace.
- `git show --stat --oneline 6bc8ac97f` — o trabalho anterior citado mexia só em `TalkXCampaignScheduled.tsx` e `TalkXCampaignScheduled.calendario.test.tsx`; a correção recusada está hoje na base via `TalkXScheduleTimeline.tsx`/teste.
- `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx -t 'PostgREST' --reporter=default` com a comparação textual temporariamente restaurada — falhou no caso da recusa.
- `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx --reporter=default` — `Test Files  2 passed (2)`; `Tests  15 passed (15)`.
- `git status --short` antes de escrever/commitar o relato — sem alteração de código pendente.
- `git diff --stat dia/2026-10-11...HEAD -- src/components/talkx/TalkXScheduleTimeline.tsx src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx src/components/talkx/TalkXCampaignScheduled.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` — sem diff de código.

## O que não fiz e por quê
- Não fiz cherry-pick de `6bc8ac97f` porque ele é anterior à correção da comparação por instante e sua aplicação sobre a base atual removeria cobertura/código já correto.
- Não criei commit vazio nem comentário cosmético no código: o escopo do refazer já está resolvido na base e manter o código intacto evita introduzir mudança fora do título.
