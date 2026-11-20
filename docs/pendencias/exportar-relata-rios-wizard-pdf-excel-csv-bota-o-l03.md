# L-03 — Exportar relatórios (wizard, PDF, Excel, CSV, botão rápido)

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.5 Relatórios e exportação

## Descrição e origem

Exportar relatórios (wizard, PDF, Excel, CSV, botão rápido).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.5 Relatórios e exportação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: CSF 11.2–11.6 ✅, IMPROVEMENT P1.2 ✅
- **Existe hoje** (evidência da auditoria): AdvancedExportDialog, ExportButton, utils/exportReport removidos; getExportData desestruturado e nunca usado (src/components/reports/AdvancedReportsView.tsx:42); jspdf segue no package.json (:82-83)
- **Falta**: decidir política (há bloqueios LGPD em outras telas) e religar ou retirar do doc
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Gestor não consegue tirar relatório para fora do sistema

## Dependências

decisão LGPD

## Critério de aceite

- CSF 11.2–11.6 ✅, IMPROVEMENT P1.2 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).