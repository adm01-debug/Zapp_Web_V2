# IA-111 — Inatividade real

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Inatividade real.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Última interação real, não updated_at
- **Existe hoje** (evidência da auditoria): Servidor usa mensagens; cálculo local inicial ainda usa contacts.updated_at e 500 contatos (ChurnPredictionDashboard.tsx:60-68)
- **Falta**: Mesma fonte no cliente
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Editar cadastro "zera" o risco

## Dependências

Nenhuma registrada.

## Critério de aceite

- Última interação real, não updated_at
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).