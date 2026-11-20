# IA-069 — Histórico sem nova geração

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Histórico sem nova geração.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Abrir/filtrar/comparar análises antigas sem pagar
- **Existe hoje** (evidência da auditoria): src/components/inbox/ai-tools/HistoryTab.tsx
- **Falta**: Acesso independente do botão gerar; comparar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Paga-se de novo para ver o que já existe

## Dependências

Nenhuma registrada.

## Critério de aceite

- Abrir/filtrar/comparar análises antigas sem pagar
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).