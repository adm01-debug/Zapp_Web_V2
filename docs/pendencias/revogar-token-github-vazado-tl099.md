# TL-099 — Revogar token GitHub vazado

- **Estado**: BLOQUEADO
- **Prioridade**: P0
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Revogar token GitHub vazado.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Revogar PAT e gerar fine-grained
- **Existe hoje** (evidência da auditoria): cartão NV no TSV; sem evidência de revogação
- **Falta**: Revogar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Token com acesso ao GitHub possivelmente válido

## Dependências

Joaquim

## Critério de aceite

- Revogar PAT e gerar fine-grained
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).