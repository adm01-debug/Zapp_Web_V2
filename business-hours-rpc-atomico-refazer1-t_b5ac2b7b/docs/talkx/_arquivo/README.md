# Arquivo — documentos substituídos do Talk X

Documentos de **histórico** do módulo: planos de execução, auditoria e handoff de sessão que já foram
substituídos pelo plano vigente. Ficam aqui porque a história continua valendo como registro — o que não
valia era lê-los lado a lado com o plano em vigor, na raiz de `docs/talkx/`, como se fossem estado
atual. Nada foi reescrito: só mudou de lugar.

| Documento | O que é | Substituído por |
|---|---|---|
| [PLANO_IMPLEMENTACAO_TALKX_100.md](./PLANO_IMPLEMENTACAO_TALKX_100.md) | Plano original de implementação, E01–E100 (08/09) | `PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`, depois `PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` |
| [PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md](./PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md) | Plano de recuperação, 001–100 (12/09), com o critério de aceite (DoD, gates, contrato de evidência) | critério de aceite absorvido pelo plano vigente |
| [PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md](./PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md) | Plano V3, V01–V100 | `PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` (V01–V100 aparecem citadas lá só para rastreio) |
| [AUDITORIA_PLANO_TALKX_2026-09-29.md](./AUDITORIA_PLANO_TALKX_2026-09-29.md) | Auditoria exaustiva E01–E100 contra código, banco e CI: bugs P0/P1, drifts e afirmações falsas dos documentos do módulo | é a evidência que originou o plano V3 e a etapa X197 |
| [HANDOFF_SESSAO_03.md](./HANDOFF_SESSAO_03.md) | Handoff da sessão 03 (09/09) para a sessão seguinte | plano vigente e `docs/reconciliation/` |

## Como usar

- Para **executar** algo no módulo, use `../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` (plano vigente) e
  `../v4/STATUS.md` (placar). Nada desta pasta é plano vigente.
- Para **investigar um defeito antigo**, os documentos aqui são a fonte: cada um diz a data e a base de
  que fala. Eles não foram reconciliados com o código atual.
- Citações dentro dos próprios documentos arquivados (e nas entradas datadas do
  [`../CHANGELOG_TALKX.md`](../CHANGELOG_TALKX.md)) mantêm o nome do arquivo como ele era: o nome não
  mudou, só o endereço. Onde o texto aponta para o vizinho deste arquivo, o caminho relativo continua
  válido.

O verificador do CI ([`scripts/ci/check-talkx-docs.unit.mjs`](../../../scripts/ci/check-talkx-docs.unit.mjs))
recusa documento não classificado na raiz de `docs/talkx/` e citação de arquivo de código que não existe.
