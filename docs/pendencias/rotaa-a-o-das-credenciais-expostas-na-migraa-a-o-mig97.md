# MIG-97 — Rotação das credenciais expostas na migração

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.9 Migração fresh install (docs/migration) e handoffs antigos

## Descrição e origem

Rotação das credenciais expostas na migração.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.9 Migração fresh install (docs/migration) e handoffs antigos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Rotacionar service_role, senha do DB, GLOBAL_API_KEY etc.
- **Existe hoje** (evidência da auditoria): não verificável no repo
- **Falta**: Rotação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Risco de credencial antiga válida

## Dependências

Joaquim (só ele rotaciona segredos)

## Critério de aceite

- Rotacionar service_role, senha do DB, GLOBAL_API_KEY etc.
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).