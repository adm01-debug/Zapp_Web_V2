# DASH-085 — Controle de entrega/acesso

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Controle de entrega/acesso.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Estados de envio, revalidar permissão
- **Existe hoje** (evidência da auditoria): Edge distingue sent/partial/failed (send-scheduled-report/index.ts:186-266), mas inalcançável
- **Falta**: Ligar ao fluxo real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, functions, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

DASH-083

## Critério de aceite

- Estados de envio, revalidar permissão
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).