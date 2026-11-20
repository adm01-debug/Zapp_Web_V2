# E25 — RPC de limpeza E2E

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

RPC de limpeza E2E.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: e2e_cleanup_conversation_closures() no lugar do curl com service role
- **Existe hoje** (evidência da auditoria): e2e-logado.yml:184,208 curl -X DELETE com service role; RPC não existe em migrations
- **Falta**: DDL + troca
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mesmo risco de E24

## Dependências

decisão/DDL

## Critério de aceite

- e2e_cleanup_conversation_closures() no lugar do curl com service role
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).