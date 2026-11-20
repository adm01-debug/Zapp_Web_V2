# A11Y-14 — Gráficos sem alternativa textual

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.8 Resíduos/débitos do Dashboard e auditoria A11Y

## Descrição e origem

Gráficos sem alternativa textual.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.8 Resíduos/débitos do Dashboard e auditoria A11Y).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): overview/VolumeChart.tsx sem aria/sr-only
- **Falta**: Texto alternativo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).