# DASH-043 — Deltas imutáveis

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Deltas imutáveis.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Copiar acumuladores antes do setState
- **Existe hoje** (evidência da auditoria): pending copiado (useRealtimeDashboard.ts:322-326); minuteCountRef lido dentro do updater e zerado fora (:344-361)
- **Falta**: Copiar também o contador por minuto
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mensagens/minuto pode zerar

## Dependências

Nenhuma registrada.

## Critério de aceite

- Copiar acumuladores antes do setState
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).