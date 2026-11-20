# T1 — Painel "Inteligência Comercial" (briefing, DISC, gatilhos, rapport, horários, churn)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.3 Prompt Lovable — Painel de Inteligência Comercial

## Descrição e origem

Painel "Inteligência Comercial" (briefing, DISC, gatilhos, rapport, horários, churn).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.3 Prompt Lovable — Painel de Inteligência Comercial).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Accordion no ContactDetails, polido
- **Existe hoje** (evidência da auditoria): src/components/inbox/contact-details/ContactIntelligencePanel.tsx existe mas não é importado em lugar nenhum
- **Falta**: Montar no painel do contato
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Vendedor não vê DISC/rapport/melhores horários já pagos no CRM

## Dependências

Flag crm.integration

## Critério de aceite

- Accordion no ContactDetails, polido
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).