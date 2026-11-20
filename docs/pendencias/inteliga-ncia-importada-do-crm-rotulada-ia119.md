# IA-119 — Inteligência importada do CRM rotulada

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Inteligência importada do CRM rotulada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Origem/validade do briefing/DISC
- **Existe hoje** (evidência da auditoria): Tooltip do ChatHeader sem rótulo de origem
- **Falta**: Rótulo "importado do CRM" + validade
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dado do CRM parece inferência do ZAPP

## Dependências

Nenhuma registrada.

## Critério de aceite

- Origem/validade do briefing/DISC
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).