# SL-159 — Notificar falha da main por WhatsApp

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Notificar falha da main por WhatsApp.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: N8N + Evolution
- **Existe hoje** (evidência da auditoria): nada
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

dono

## Critério de aceite

- N8N + Evolution
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).