# 016 — Cobertura com ratchet por pasta/arquivo

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos

## Descrição e origem

Cobertura com ratchet por pasta/arquivo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Baseline + aperto semanal
- **Existe hoje** (evidência da auditoria): vitest.config.ts:13-42 pisos fixos em src/lib/src/services; perFile explicitamente não ligado (comentário linha 42)
- **Falta**: Ratchet por escopo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Código sem teste entra sem barreira

## Dependências

Nenhuma registrada.

## Critério de aceite

- Baseline + aperto semanal
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).