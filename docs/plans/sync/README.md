# Registro permanente da sincronização local × GitHub (17/10/2026)

Este diretório é o **registro permanente** das medições de sincronização feitas em
17/10/2026 (lote SYNC/AG/SYNC20 do quadro `zapp-web-v2`). Ele existe para que as medições
sobrevivam ao fim dos workspaces e das branches de origem: cada documento aqui foi medido
uma vez, com comando real, e a proveniência está declarada no cabeçalho de cada arquivo.

## Regras deste diretório

- **Sem CSV bruto e sem dado pessoal.** As planilhas geradas pelas fases ficaram nos `.tmp/`
  dos workspaces de origem (fora do repositório). Aqui entram só os resumos legíveis.
  Os documentos de origem que citam `dados/*.csv` (ex.: `F05-F08-...`) apontam para arquivos
  que **não** foram trazidos por essa regra.
- **Nada foi aplicado por conta destes documentos**, exceto o que está declarado em
  `F08-docs-reconciliacao-por-area-2026-10-17.md` (que registra o que foi efetivamente
  reconciliado em `ESTADO.md`).
- Nenhum `push`, merge em `origin`, deploy ou migration em produção foi feito por este lote.

## Índice

| Documento | Fases | Origem (proveniência) |
|---|---|---|
| `AG1-git-refs-F01-F04-2026-10-17.md` | F01–F04 (+preparo F18) | cartão `[SYNC-AG1]` — inventário git somente-leitura; workspace `sync-ag1-git-2610170855737f` |
| `F05-F08-front-docs-raiz-mapa-2026-10-17.md` | F05 + F08 | cartão `[SYNC-AG2]` — branch `v2/sync-ag2-front-26101708550eb1` |
| `F06-F07-F15-edge-ci-mapa-2026-10-17.md` | F06 + F07 + F15 | cartão `[SYNC-AG3]` — branch `v2/sync-ag3-edge-26101708555409` |
| `SYNC-AG4-F14-PLANO-APLICACAO-2026-10-17.md` | F10–F14 | cartão `SYNC-AG4` — branch `v2/sync-ag4-banco-2610170855a3ad` |
| `SYNC-AG4b-FOTO-CANONICA-2026-10-17.md` | F10–F13 | cartão `SYNC-AG4b` — branch `v2/sync-ag4b-banco-canonico-ro-2610170938704d` |
| `sync-ag5-qualidade-2026-10-17.md` | F16 + F19 + F20 + F21 | cartão `[SYNC-AG5]` — branch `v2/sync-ag5-qualidade-2610170855c187` |
| `F08-docs-reconciliacao-por-area-2026-10-17.md` | F08 + F23 | cartão `[SYNC20-15]` (este) — medição própria nesta árvore |

## Fato medido em comum (base de todas as fases)

Contexto em comum (base de todas as fases): `origin/main = a9b4d6c6fb` é **posterior** a todos os commits da branch do
dia (`dia/2026-10-17 = d723a90107`, último commit do dia 15/10 17:32 contra 16/10 15:59 em
origin/main). Nos 952 arquivos diferentes entre `dia` e `origin/main`, o lado de `origin/main`
é o mais novo em **952/952**, o lado do dia em 0, conflito real em 0.
