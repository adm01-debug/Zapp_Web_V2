# Auditoria adversarial — Onda 3 (30/09/2026)

Auditoria independente das três correções cross-módulo da onda (issues #1265, #1266, #1267) e dos
fixes de front da onda 2 (#1290/#1294/#1297), feita por **1 líder + 5 especialistas independentes**
(banco vivo, mutação das migrations, brownfield/over-closing, forense de CI + produção, red team de
números), mais um **PoC em PostgreSQL descartável**.

**Documento central:** [`VEREDICTO-CONSOLIDADO.md`](VEREDICTO-CONSOLIDADO.md) — veredicto por frente,
achados com severidade, falsos positivos derrubados e o que **não** foi verificado.

## Relatórios por frente

| Pasta | Frente | O que trouxe |
|---|---|---|
| [`a1-db/`](a1-db/RELATORIO.md) | Banco vivo (SELECT-only) | inventário pós-merge das policies/RPCs e caça a furo novo |
| [`a2-mut/`](a2-mut/RELATORIO.md) | Mutação das migrations | prova de que os harnesses têm dentes (nos dois sentidos) |
| [`a3-brown/`](a3-brown/RELATORIO.md) | Brownfield / over-closing | o fix fechou demais? (não) e quem mais consome |
| [`a4-ci/`](a4-ci/RELATORIO.md) | Forense de CI + produção | cada vermelho classificado (meu / ambiente / drift) + paridade do bundle |
| [`a5-red/`](a5-red/RELATORIO.md) | Red team de números | derrubou 3 números meus e achou a classe viva no Talk X |
| [`poc/`](poc/RELATORIO.md) | PoC descartável | exploit dos 2 achados do team chat, com controle negativo |

## Validação do que está mergeado

[`validacao-harnesses-origin-main.txt`](validacao-harnesses-origin-main.txt) — os três harnesses de
contrato rodados contra o `origin/main` do momento (`multiplix-rls` PASS, `team-reaction-membership`
14 passes, `team-chat-rpc-ambiguity` 17 passes, todos `EXIT=0`): o conjunto de migrations do repo
reproduz o estado seguro.

> Esta auditoria é **somente-leitura**: não autoriza executar correção alguma. Cada achado vira etapa
> própria, planejada antes de ser aplicada.
