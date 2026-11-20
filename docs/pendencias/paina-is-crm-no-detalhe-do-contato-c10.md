# C-10 — Painéis CRM no detalhe do contato

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Painéis CRM no detalhe do contato.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CT-002 (área 04)
- **Existe hoje** (evidência da auditoria): ExternalContact360Panel.tsx, ContactIntelligencePanel.tsx sem importador; services/crm/singu-adapter.ts só em teste
- **Falta**: decidir/ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dados do CRM Singu não aparecem onde planejado

## Dependências

flag crm.integration

## Critério de aceite

- CT-002 (área 04)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).