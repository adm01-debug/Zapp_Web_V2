# E47 — Web Vitals reais

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.8 Resíduos/débitos do Dashboard e auditoria A11Y

## Descrição e origem

Web Vitals reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.8 Resíduos/débitos do Dashboard e auditoria A11Y).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Speed Insights
- **Existe hoje** (evidência da auditoria): src/lib/web-vitals iniciado em src/main.tsx:7; sem Speed Insights
- **Falta**: Habilitar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Vercel

## Critério de aceite

- Speed Insights
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).