Especialista: hugo — area-front-hooks

## O que mudou e por quê
- src/hooks/tasks/workItemFormat.ts (novo): regra ÚNICA de datas (etapa 058 / D21), pura e no fuso local. `formatWorkItemDate` devolve "Ontem, 17:00" / "Hoje, 14:00" / "Amanhã, 10:00" / "13 out., 15:00"; `format: 'day'` devolve só o dia ("Hoje", "Ontem", "09 out."), o caso das concluídas; `formatWorkItemFieldDate`/`formatWorkItemField` dão "Hoje, 11/10" + hora separada para painel/modal. Nenhum formato traz o dia da semana (o "Seg, 09/09, 14:20" da imagem 04 não é reproduzível). Dias comparados por `localDayKey`/`parseDayKey` de `src/lib/localDay` (import, não editei lá): a virada do dia manda, não a distância em horas. Valor ausente/inválido -> `null`.
- src/hooks/tasks/workItemPresets.ts (novo): presets de prazo (`duePresetDate`/`duePresetISO`: hoje, amanhã, próxima semana, às 23:59 locais) e de lembrete (`remindPresetDate`/`remindPresetISO`: em 1 h, amanhã 9h, próxima segunda 9h) — etapa 161. A aritmética de prazo é de CALENDÁRIO (`setDate` sobre a meia-noite local), então um preset criado às 23:30 cai no dia seguinte e não no mesmo dia; `remindPresetDate('tomorrow9')` REAPROVEITA `tomorrowAtNine` importado de `useMyWorkItems`. `checkRemindCoherence` (etapa 162) devolve `{ state, message }` com `ok` / `in_past` / `after_due` / `no_due`: lembrete tem de estar no futuro e ANTES do prazo (igual ao prazo conta como `after_due`); sem lembrete devolve `ok` com mensagem vazia.
- src/hooks/tasks/__tests__/workItemFormat.test.ts e workItemPresets.test.ts (novos): os testes unitários do cartão.

Etapa 058/161/162 conferidas antes contra o código ATUAL: não existiam (o QuickAdd faz os presets inline, em `src/components/tasks/shared/QuickAdd.tsx`, arquivo fora do escopo deste cartão) — por isso as funções nasceram como módulos novos, sem uso na tela (critério 3: as superfícies adotam nos cartões seguintes).

## Prova
- vermelho antes: `npx vitest run src/hooks/tasks/__tests__/workItemFormat.test.ts src/hooks/tasks/__tests__/workItemPresets.test.ts` -> `Error: Failed to resolve import "@/hooks/tasks/workItemPresets" ... Test Files 2 failed (2); Tests no tests` (os módulos ainda não existiam).
- verde depois: mesmo comando -> `Test Files 2 passed (2); Tests 28 passed (28)`.

## Casos de teste (nome de cada um)
workItemFormat.test.ts (11 casos): rotula Hoje/Ontem/Amanhã pelo dia LOCAL; fora de Hoje/Ontem/Amanhã usa "dd mês." em pt-BR; com hora compõe "Ontem, 17:00"/"Hoje, 14:00"/"Amanhã, 10:00"/"13 out., 15:00"; concluída mostra SÓ o dia; nunca inclui o dia da semana; fuso local (23:30 não vira o dia seguinte, com Date e com ISO); virada do dia (00:05 é "Amanhã", 23:55 é "Ontem"); campos do painel/modal "Hoje, 11/10" + hora à parte; hora separada null; valor ausente/inválido -> null; aceita ISO com offset.
workItemPresets.test.ts (17 casos): presets de prazo (hoje 23:59; amanhã às 23:30 -> dia seguinte; próxima semana +7 dias; ISO = Date); presets de lembrete (em 1 h = +3.600.000 ms; amanhã 9h reaproveita `tomorrowAtNine`; próxima segunda 9h a partir de domingo; próxima segunda na PRÓPRIA segunda não devolve o mesmo dia; ISO = Date); coerência (sem lembrete; futuro antes do prazo confirma; no passado, inclusive igual ao agora; depois do prazo; igual ao prazo não é "antes"; sem prazo; in_past tem prioridade sobre after_due; aceita ISO com offset).

## Borda do enunciado (virada do dia, fim de semana, UTC-3, horário de verão)
- Virada do dia: coberta nos dois arquivos (23:30/23:55/00:05 e o preset criado às 23:30).
- Fim de semana: `nextMondayAtNine` a partir de domingo (11/10 -> 12/10) e na própria segunda (12/10 -> 19/10).
- UTC-3: as datas dos testes são construídas no relógio LOCAL (`new Date(2026, 9, 11, 14, 0)`), então os rótulos valem com qualquer fuso do processo; o caso "23:30 não vira o dia seguinte" também cobre o ISO que o banco devolve.
- Horário de verão: o diff de dias é por dia de CALENDÁRIO (via `localDayKey`/`parseDayKey`), não por 24 h — é o caminho que sobrevive ao dia de 23/25 h; a aritmética dos presets usa `setDate`, não `+86_400_000`.

## O que NÃO fiz e por quê
- Não toquei nas telas nem no QuickAdd: fora dos arquivos que o cartão permite (as superfícies adotam nos cartões seguintes).
- Sem migration, Edge Function, dependência nova ou exportação de dado.
