# TL-001 — E2E "wizard advances to step 2" vermelho

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.21 3ª leva — cartões sem X/F correspondente

## Descrição e origem

E2E "wizard advances to step 2" vermelho.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.21 3ª leva — cartões sem X/F correspondente).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Verde na main
- **Existe hoje** (evidência da auditoria): e2e/talkx.spec.ts alterado em 09/10; e2e-logado na main não conclui
- **Falta**: Run verde
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

CI

## Critério de aceite

- Verde na main
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).