# IA-188 — Conjunto de avaliação PT-BR (200 casos)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Conjunto de avaliação PT-BR (200 casos).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: ≥ 200 casos revisados por pessoa
- **Existe hoje** (evidência da auditoria): Golden set inicial anotado por agente (tests/contracts/ai-quality-golden-set.contract.test.ts, 7 casos de teste)
- **Falta**: 200 casos humanos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Meta M4 (≥95% factual) impossível de medir

## Dependências

Revisão humana

## Critério de aceite

- ≥ 200 casos revisados por pessoa
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).