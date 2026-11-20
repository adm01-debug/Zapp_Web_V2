# IA-053 — Contabilizar streaming e cancelamentos

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Contabilizar streaming e cancelamentos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Uso registrado em stream parcial/cancelado
- **Existe hoje** (evidência da auditoria): medirStream (ai-usage.ts:963), contrato tests/contracts/ia053-streaming-registrado.test.ts
- **Falta**: Reconciliar cancelamento real com cobrança
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Custo de stream interrompido subestimado

## Dependências

Nenhuma registrada.

## Critério de aceite

- Uso registrado em stream parcial/cancelado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).