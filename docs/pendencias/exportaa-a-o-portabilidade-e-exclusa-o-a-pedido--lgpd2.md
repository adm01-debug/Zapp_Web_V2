# LGPD-2 — Exportação/portabilidade e exclusão a pedido do titular

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

Exportação/portabilidade e exclusão a pedido do titular.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Função de exportação + SLA 15 dias
- **Existe hoje** (evidência da auditoria): nada no src/edges (grep vazio)
- **Falta**: Implementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não há como atender pedido do titular no prazo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Função de exportação + SLA 15 dias
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).