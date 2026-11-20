# E83 — Alerta da suíte logada

- **Estado**: DIVERGENTE
- **Prioridade**: P0
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Alerta da suíte logada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: Issue [e2e-logado] em falha, fecha ao recuperar
- **Existe hoje** (evidência da auditoria): e2e-logado.yml:220-221 passo com if: failure(); run cancelado por timeout não é failure → nenhuma issue aberta (lista de issues abertas não tem [e2e-logado])
- **Falta**: Tratar cancelled()/timeout como falha no alerta
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Suíte morta há 9 dias sem nenhum aviso

## Dependências

E09

## Critério de aceite

- Issue [e2e-logado] em falha, fecha ao recuperar
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).