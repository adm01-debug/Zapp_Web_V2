# E13 — Settings guard

- **Estado**: DIVERGENTE
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Settings guard.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: Guard que detecta regressão e abre issue
- **Existe hoje** (evidência da auditoria): settings-guard.yml + scripts/ci/github-settings-guard.mjs:118-128: checarRepo compara campos de merge que o GITHUB_TOKEN recebe null → "7 divergências" falsas; API: 34/34 runs failure, 0 sucesso; issue #1854 com 27 comentários
- **Falta**: Tratar null como "NÃO VERIFICÁVEL" (como já faz para 403) ou usar token/App com administration:read
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Alarme falso a cada 6 h: ninguém mais olha; uma regressão real de proteção da main passaria despercebida

## Dependências

E36 (identidade com escopo adm.)

## Critério de aceite

- Guard que detecta regressão e abre issue
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).