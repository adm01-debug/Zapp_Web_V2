# E33 — Fechar alerta CodeQL #13

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Fechar alerta CodeQL #13.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: validation.ts sem stack ao cliente; alerta fixed
- **Existe hoje** (evidência da auditoria): Code Scanning (API): #13 aberto (_shared/validation.ts:146) e #31 novo na mesma classe (validation.ts:211, 05/10)
- **Falta**: Corrigir as duas linhas e confirmar fixed
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Edge pode devolver detalhe interno de erro a quem chama

## Dependências

Nenhuma registrada.

## Critério de aceite

- validation.ts sem stack ao cliente; alerta fixed
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).