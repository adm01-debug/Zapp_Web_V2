# IA-093 — Registro de compromissos

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Registro de compromissos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Quem prometeu, prazo, situação
- **Existe hoje** (evidência da auditoria): promises_made/pending_items jsonb soltos
- **Falta**: Estrutura com dono e vencimento
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Promessas ao cliente se perdem

## Dependências

Nenhuma registrada.

## Critério de aceite

- Quem prometeu, prazo, situação
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).