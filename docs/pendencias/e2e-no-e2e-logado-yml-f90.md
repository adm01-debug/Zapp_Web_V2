# F90 — E2E no e2e-logado.yml

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

E2E no e2e-logado.yml.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Seleção, prévia, confirmação bloqueada
- **Existe hoje** (evidência da auditoria): e2e/multiplix.spec.ts hermético (mocks devolvem sucesso no confirm); e2e-logado na main cancela 96,8% (PENDENCIAS_DO_DONO…:31)
- **Falta**: Teste com fluxo real; CI que conclua
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Teste verde esconde o MX01

## Dependências

Nenhuma registrada.

## Critério de aceite

- Seleção, prévia, confirmação bloqueada
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).