# IA-189 — Ensaio de carga e orçamento

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Ensaio de carga e orçamento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Volumes acima dos limites
- **Existe hoje** (evidência da auditoria): scripts/qa/prova-orcamento-rate-limit.sh (prova pontual)
- **Falta**: Ensaio completo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Metas M8/M9 sem medida

## Dependências

Nenhuma registrada.

## Critério de aceite

- Volumes acima dos limites
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).