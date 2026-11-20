# SEC-02 — Oráculo de UUID em require_contact_edit_permission e can_delete_contacts

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Oráculo de UUID em require_contact_edit_permission e can_delete_contacts.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Erro único / sem linha
- **Existe hoje** (evidência da auditoria): últimas definições 20260930090000 e 20260930370000 (antes da auditoria)
- **Falta**: Migration
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Enumeração de contatos de terceiros

## Dependências

idem

## Critério de aceite

- Erro único / sem linha
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).