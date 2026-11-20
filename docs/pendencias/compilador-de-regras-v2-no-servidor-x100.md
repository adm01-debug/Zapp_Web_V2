# X100 — Compilador de regras v2 no servidor

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)

## Descrição e origem

Compilador de regras v2 no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: talkx_segment_fields + talkx_compile_segment_rules
- **Existe hoje** (evidência da auditoria): Ambos = 0; compilador legado
- **Falta**: Migration
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Filtros comerciais do mock não existem

## Dependências

X037–X040

## Critério de aceite

- talkx_segment_fields + talkx_compile_segment_rules
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).