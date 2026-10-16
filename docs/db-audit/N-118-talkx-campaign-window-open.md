# N-118 — talkx_campaign_window_open (janela Talk X) — contrato BOOLEAN

Cartão: [refazer 2] talkx-campaign-window-cast-jsonb (t_8f7e8008).
Migration isolada: `supabase/migrations/*talkx_campaign_window_open_isolada.sql`.
Espelho do CI: `scripts/db-audit/talkx-campaign-window-open.test.sh`.

## Contrato (BOOLEAN)

`talkx_campaign_window_open(p_campaign_id uuid, p_at timestamptz) RETURNS boolean`

- `TRUE` = janela aberta (pode enviar).
- `FALSE` = janela fechada (fail-closed: fuso invalido, fora da janela, DND ativo,
  fora do business_hours, DND invalido).
- **Erro** = config fora do contrato: campanha inexistente (`P0002`,
  `talkx_campaign_not_found`); `business_hours` presente e fora do contrato
  (`22023`, `invalid_business_hours`). O motor trata erro como fechado (skip)
  e registra a mensagem — nunca vaza `22P02`/`42846` de cast direto.
- O motor (`talkx-scheduler`) consome `windowOpen !== true` como fora-da-janela,
  por isso FALSE e erro fecham do mesmo jeito.

## Troca de contrato (TABLE -> BOOLEAN)

A versao anterior da funcao (`20261011000003`) tem a **mesma assinatura de
entrada** (`uuid, timestamptz`) e retorno `TABLE(allowed, reason, next_window)`.
Por isso a migration faz `DROP FUNCTION IF EXISTS …(uuid, timestamptz)` antes do
`CREATE OR REPLACE`: com outro tipo de retorno, o `CREATE OR REPLACE` falha com
`42P13` (`cannot change return type of existing function`) — e é o erro que o
teste reproduz sem o `DROP`. O teste versionado prova os
dois lados: aplica sobre o contrato `TABLE` anterior e, sem o `DROP`, falha com
`42P13`.

## O que a funcão lê (e so isso)

Direto em `public.talkx_campaigns` (sem `_legacy`): `schedule_timezone`,
`send_window_start`, `send_window_end`, `business_hours_only`, `send_weekdays`,
`respect_dnd`. Colunas irrelevantes (`status` etc.) são ignoradas: só as janelas
decidem. Origens lidas aqui (faltavam no DDL avulso): `talkx_settings.dnd_hours`
e `talkx_settings.business_hours`.

## Regras

1. Fuso: hora/dia saem do `schedule_timezone` (default `America/Sao_Paulo`
   quando ausente); fuso invalido fecha.
2. `send_weekdays`: NULL = todos os dias; fora da lista fecha.
3. `send_window`: so vale com inicio E fim; `start = end` = open 24h (TRUE);
   vale `[start, end)` (inicio inclusivo, fim exclusivo), com virada de
   meia-noite.
4. `business_hours_only = true`: lê `talkx_settings.business_hours`; ausente =
   default 08:00–18:00, seg–sex, `America/Sao_Paulo`; presente e fora do
   contrato (formato, `days` vazio/ausente/fora de 0–6/texto) = erro 22023.
5. `respect_dnd` (default true): lê `talkx_settings.dnd_hours` (`start`/`end`
   `HH:MM`, `sundays`, `holidays[]`); DND ausente = sem bloqueio; DND ativo
   (inclui virada de meia-noite, domingo e feriado) fecha.
6. Ramos TRUE: `start = end` (open 24h) e campanha sem restrição (só
   existir/active) — ambos TRUE.

## Cast jsonb (o defeito original)

O DDL avulso fazia cast direto do valor bruto (`(…->'days')::integer[]`),
que quebra com `42846` (jsonb→integer[] não existe) ou `22P02` (texto
inválido). Aqui cada elemento passa por conversão NULL-explícita
(`trim` → `''` vira NULL tratado; cast sob `EXCEPTION` que re-ergue `22023`):
`days` inválido = erro `22023`, nunca `22P02`/`42846`.

## Autorização

Um `GRANT EXECUTE` só, para `service_role` (o scheduler chama com a chave de
serviço). `anon` e `authenticated` não têm `EXECUTE` (chamar = `42501`).
Por isso a função não lê `auth.uid()`: o isolamento é o grant.

## Rollback

`DROP FUNCTION IF EXISTS public.talkx_campaign_window_open(uuid, timestamptz);`
(linha `-- Rollback:` da migration) — desfaz **só** a função BOOLEAN criada aqui.

As colunas `send_weekdays`/`respect_dnd` **não** são dropadas: num alvo que já
recebeu a migration `20261011000003` elas são dela, e dropá-las apagaria dado
daquela migration. Esta migration só as cria por contingência
(`ADD COLUMN IF NOT EXISTS`) para a função ter o que ler; num alvo em que só ela
as criou, o rollback total (com `DROP COLUMN`, que apaga os dados) fica listado no
cabeçalho da migration.

Para voltar ao contrato `TABLE` anterior: o `DROP` do rollback remove o obstáculo
`42P13` e reexecutar a `20261011000003` recria a função `TABLE(allowed, reason,
next_window)` sem tocar nas colunas.
