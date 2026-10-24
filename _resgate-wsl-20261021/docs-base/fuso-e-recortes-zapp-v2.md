# Fuso e recortes de data no Zapp_Web_V2

Regra do produto, aplicada em 02/10/2026 (telemetria `7d` e os recortes de período do
Dashboard/Inbox/Relatórios).

## A divisão que vale para todo arquivo de data

- **Exibição e agrupamento → fuso do navegador.** O que o usuário vê em hora local continua em
  `date-fns` local ou nos helpers `localDayKey`/`format` de `src/lib/localDay.ts`.
- **Recorte que não pode depender de quem está olhando → fuso FIXO `America/Sao_Paulo`.**
  Filtro de período, janela de consulta, `from`/`to` gravado na URL, qualquer número que tenha de
  bater com o que o servidor conta. É o mesmo fuso de `in_last_days`/`not_in_last_days` e de
  `conversation_closure_day` no banco.
- Sintoma que a regra evita (medido): às 22h30 em São Paulo (UTC-3) um recorte de "7 dias"
  calculado como `Date.now() - 7*86_400_000` alcançava o **8º dia** de calendário; e o mesmo
  "hoje" recortava janelas diferentes para pessoas em fusos diferentes (Lisboa e São Paulo viam
  números distintos para o mesmo período).

## Como escrever (helper único)

- `src/lib/localDay.ts` exporta `APP_TIMEZONE` e os atalhos `appDayStart(daysAgo?, now?)`,
  `appDayEnd`, `appDayKey(value)`, `appDayStartOfKey`/`appDayEndOfKey`, `appShiftDayKey(key, delta)`,
  `appWeekStart`/`appWeekEnd` (domingo primeiro, como o `ptBR` do date-fns),
  `appMonthStart`/`appMonthEnd`, `appDayStartOfLocalDate`/`appDayEndOfLocalDate` (dia escolhido no
  seletor = relógio do usuário, recorte no fuso do app) e `appDayKeyLabel(key)`.
- Não repita a string do fuso nas telas nem use `startOfDay`/`endOfDay`/`subDays` do date-fns para
  recorte. Chave de dia (`yyyy-MM-dd`) sai de `Intl.DateTimeFormat('en-CA', { timeZone })` (en-CA
  devolve `yyyy-MM-dd`) e a aritmética de dias é feita em UTC sobre a chave, nunca com horas.
- Ao ancorar um recorte, confira as pontas que passam a mentir: rótulo de período (um `isSameDay`
  no fuso do processo diz que início e fim estão em dias diferentes) e serialização `from`/`to`
  na URL (tem de gravar o dia no fuso do app).

## Onde o recorte REALMENTE mora

Não confie no arquivo que o plano nomeia: no Dashboard, o recorte padrão/por período vem de
`src/hooks/dashboard/useDashboardUrlFilters.ts` (`rangeForPeriod`) e de
`src/hooks/analytics/useDashboardData.ts`, não do `getDefaultFilters` exportado do
`src/components/dashboard/DashboardFilters.tsx` (esse não tem consumidor de produção). Procure
quem **executa a consulta** antes de dizer que corrigiu.

## Teste que prova

- Use **instante absoluto** (`new Date('2026-09-30T22:30:00-03:00')`) e **expectativa em UTC**
  (`2026-09-30T03:00:00.000Z`): assim o teste vale em qualquer fuso de processo, inclusive no UTC
  do CI — é isso que prova que o recorte não depende de quem olha.
- Rode em `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Europe/Lisbon` (o mesmo arquivo tem de dar verde
  nos três).
- Red-first por mutação: deixe a API nova com o comportamento antigo por dentro
  (`appDayKey` devolvendo o dia local do processo, `appDayStartOfKey` devolvendo `new Date(key + 'T00:00:00')`)
  e rode com `TZ=UTC` — os testes têm de falhar com a diferença exata
  (`expected '2026-10-01T00:00:00.000Z' to be '2026-09-30T03:00:00.000Z'`). Restaure em seguida.
