Especialista: senior (area-front-hooks)

## Resultado
Concluído. O ponto recusado está coberto na base atual: `TalkXScheduleTimeline` compara o início salvo e o início editado pelo instante (`Date.parse`) e não pelo texto ISO, então `2026-11-27T12:00:00+00:00` e `2026-11-27T12:00:00.000Z` não geram falso "alteração não salva".

## Pontos da recusa
- Ponto 1: comparar instantes, não texto ISO.
  - Código validado: `src/components/talkx/TalkXScheduleTimeline.tsx` usa `Date.parse(editedStart) !== Date.parse(savedStart)` no cálculo de `editedNotSaved`.
  - Teste validado: `src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx`, caso `A11: gravado no formato do PostgREST (+00:00) com edição no mesmo instante não diz "alteração não salva"`.
  - Vermelho antes: alterei temporariamente apenas essa linha para a comparação textual antiga (`editedStart !== savedStart`) e rodei `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx -t 'PostgREST' --reporter=default`. Resultado: 1 teste falhou com `expected ... not to contain 'alteração não salva'`.
  - Verde depois: restaurei a comparação por instante e rodei `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx --reporter=default`. Resultado: `Test Files  2 passed (2)`; `Tests  15 passed (15)`; 0 failed.

## Arquivos do diff
Saída de `git diff --name-only dia/2026-10-11...HEAD` neste fechamento:

.tmp/relato.md

O diff final é só o relato porque a base `dia/2026-10-11` já contém o código correto e o teste de regressão do ponto recusado. O escopo de código foi conferido nos quatro arquivos do TL-150 e não há alteração pendente em produção de código.

## Verificações executadas
- `bun install` — dependências instaladas no workspace.
- `git show --stat --oneline 6bc8ac97f` — trabalho anterior citado pelo cartão: 2 arquivos (`TalkXCampaignScheduled.tsx` e `TalkXCampaignScheduled.calendario.test.tsx`).
- `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx -t 'PostgREST' --reporter=default` com a comparação textual antiga aplicada temporariamente — 1 failed, provando o defeito original.
- `bunx vitest run src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx --reporter=default` — `Test Files  2 passed (2)`; `Tests  15 passed (15)`; 0 failed.
- `git status --short` antes do relato — sem alteração de código pendente.
- `git diff --stat dia/2026-10-11...HEAD -- src/components/talkx/TalkXScheduleTimeline.tsx src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx src/components/talkx/TalkXCampaignScheduled.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` — saída vazia, confirmando ausência de diff de código alheio.
