# ZAPP Web V2 — Project Reconciliation

**Início:** 2026-10-03  
**Modo:** reconciliação/auditoria. Estes documentos não autorizam alteração funcional.

## Objetivo
Determinar o estado real antes de executar os muitos planos históricos. Planos antigos são evidência, não fila executável. A futura fonte operacional será o MASTER_LEDGER reconciliado contra documentação, Git, código, testes, banco/guards e runtime quando necessário.

## Regra de exclusão
Nada é apagado durante a reconciliação. "Parece sem uso" não significa "pode excluir". Exclusão futura exige prova estrutural, busca de consumidores, análise de runtime/configuração, testes e commit reversível.

## Conteúdo
- RECONCILIATION_CHECKPOINT_2026-10-03.md — estado consolidado.
- METHODOLOGY.md — método.
- STATUS_TAXONOMY.md — estados oficiais.
- MODULE_LINEAGES.md — linhagens já identificadas.
- RESIDUE_REGISTRY.md — resíduos/candidatos.
- OPEN_RISKS.md — riscos.
- SESSION_HANDOFF.md — ponto exato de retomada.
