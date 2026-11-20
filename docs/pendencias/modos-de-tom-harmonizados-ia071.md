# IA-071 — Modos de tom harmonizados

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Modos de tom harmonizados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Taxonomia única de tom/concisão
- **Existe hoje** (evidência da auditoria): Chips SL-063 em AISuggestions.tsx:12-24; ToneSelector/AIRewriteButton com modos próprios
- **Falta**: Taxonomia compartilhada
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

"Mais formal" significa coisas diferentes por botão

## Dependências

Nenhuma registrada.

## Critério de aceite

- Taxonomia única de tom/concisão
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).