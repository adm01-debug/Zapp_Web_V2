# C100-95 — Runbook exclusão/legados

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.1 Plano Contatos 100 etapas (29/09)

## Descrição e origem

Runbook exclusão/legados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.1 Plano Contatos 100 etapas (29/09)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: DoD: "2 receitas SQL testadas"
- **Existe hoje** (evidência da auditoria): docs/runbooks/contatos-exclusao-e-legados.md existe e está [x]; fechamento 01/10 lista B4 — receitas não testadas por execução (FECHAMENTO_01/10:234) e nunca foi baixado
- **Falta**: Executar as 2 receitas em banco local e registrar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Restaurar contato excluído hoje é SQL manual não testado

## Dependências

Banco local

## Critério de aceite

- DoD: "2 receitas SQL testadas"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).