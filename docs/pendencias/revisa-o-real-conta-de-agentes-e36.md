# E36 — Revisão real / conta de agentes

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Revisão real / conta de agentes.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Segunda identidade + prevent_self_review
- **Existe hoje** (evidência da auditoria): CODEOWNERS só @adm01-debug (.github/CODEOWNERS); baseline required_approving_review_count: 0
- **Falta**: Conta/GitHub App dos agentes
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nenhum gate humano real em produção

## Dependências

decisão de negócio

## Critério de aceite

- Segunda identidade + prevent_self_review
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).