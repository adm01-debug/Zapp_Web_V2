# Y11 — E2E telefonia

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade

## Descrição e origem

E2E telefonia.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Rodar no CI
- **Existe hoje** (evidência da auditoria): projeto chromium-telefonia (playwright.config.ts:107-110) não aparece em nenhum workflow (grep)
- **Falta**: Incluir no ci.yml
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

idem

## Dependências

dono do workflow

## Critério de aceite

- Rodar no CI
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).