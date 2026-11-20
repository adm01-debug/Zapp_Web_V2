# SB-98 — Limpeza de órfãos

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)

## Descrição e origem

Limpeza de órfãos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Apagar órfãos
- **Existe hoje** (evidência da auditoria): 13 apagados; ExternalContact360Panel.tsx, ContactIntelligencePanel.tsx e Contact360Helpers.tsx seguem com 0 consumidores
- **Falta**: Decidir/apagar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Código morto

## Dependências

Nenhuma registrada.

## Critério de aceite

- Apagar órfãos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).