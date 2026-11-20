# C100-94 — Seção "Contatos" no CLAUDE.md

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.1 Plano Contatos 100 etapas (29/09)

## Descrição e origem

Seção "Contatos" no CLAUDE.md.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.1 Plano Contatos 100 etapas (29/09)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 6 linhas: tipos canônicos, decisão Sicoob, exclusão via RPC, include_legacy, fonte de ícone/cor
- **Existe hoje** (evidência da auditoria): CLAUDE.md:577-582 só tem critério de visibilidade/include_legacy
- **Falta**: 4 linhas (6 tipos, Sicoob, delete_contact, contactTypeConfig.tsx)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Próximos agentes podem reintroduzir tipo extinto ou exclusão direta

## Dependências

Aprovação do Joaquim (hook de arquivo protegido)

## Critério de aceite

- 6 linhas: tipos canônicos, decisão Sicoob, exclusão via RPC, include_legacy, fonte de ícone/cor
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).