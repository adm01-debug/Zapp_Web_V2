# A11Y-CRM-01 — Nome acessível nos botões só de ícone

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Nome acessível nos botões só de ícone.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: aria-label
- **Existe hoje** (evidência da auditoria): Cards/lista/tabela corrigidos (ContactCard.tsx:70, ContactListItem.tsx:155, ContactsTable.tsx:225); fechar do painel (ContactDetailPanel.tsx:222-228) e adicionar nota (ContactNotes.tsx:154-160) sem nome
- **Falta**: 2 aria-labels
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Leitor de tela não fecha a ficha

## Dependências

Nenhuma registrada.

## Critério de aceite

- aria-label
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).