# BKP-1 — PITR, backup semanal, drill, widget

- **Estado**: NÃO VERIFICÁVEL
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

PITR, backup semanal, drill, widget.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO VERIFICÁVEL.
- **Planejado**: ver checklist
- **Existe hoje** (evidência da auditoria): nada
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

ver M-E21

## Dependências

dono

## Critério de aceite

- ver checklist
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).