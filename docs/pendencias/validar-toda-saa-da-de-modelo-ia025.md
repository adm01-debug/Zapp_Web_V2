# IA-025 — Validar toda saída de modelo

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Validar toda saída de modelo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Schema por capacidade, inclusive classificadores/voz
- **Existe hoje** (evidência da auditoria): parseModelOutput nas funções de texto; classify-sticker/emoji degradam para outros sem estado de falha (classify-sticker/index.ts:143,154,183,211)
- **Falta**: Cobrir classificadores e voz
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Classificação falha vira "Outros" como se fosse resultado

## Dependências

Nenhuma registrada.

## Critério de aceite

- Schema por capacidade, inclusive classificadores/voz
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).