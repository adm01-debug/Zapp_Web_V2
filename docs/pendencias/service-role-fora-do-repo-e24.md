# E24 — Service role fora do repo

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Service role fora do repo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: SUPABASE_SERVICE_ROLE_KEY em environment e2e-producao
- **Existe hoje** (evidência da auditoria): e2e-logado.yml:178,202 lê secrets.SUPABASE_SERVICE_ROLE_KEY (nível repo)
- **Falta**: Mover para environment
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Chave mestra de produção acessível a qualquer job do repo público

## Dependências

ação adm. do dono

## Critério de aceite

- SUPABASE_SERVICE_ROLE_KEY em environment e2e-producao
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).