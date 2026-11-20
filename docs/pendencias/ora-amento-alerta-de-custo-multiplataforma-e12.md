# E-12 — Orçamento/alerta de custo multiplataforma

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)

## Descrição e origem

Orçamento/alerta de custo multiplataforma.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: etapa 087
- **Existe hoje** (evidência da auditoria): Orçamento de IA existe (ai_budget_, searchbox-budget-alert com cron)
- **Falta**: Vercel/Supabase/ElevenLabs/Mapbox
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Conta-surpresa

## Dependências

Nenhuma registrada.

## Critério de aceite

- etapa 087
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).