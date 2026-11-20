# X056 — Cidade/UF/origem preenchidas em contacts

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)

## Descrição e origem

Cidade/UF/origem preenchidas em contacts.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Backfill + cobertura por atributo
- **Existe hoje** (evidência da auditoria): 0 ocorrências de talkx_backfill_contact_fields
- **Falta**: Backfill a partir da projeção
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Filtro de localização quase sem dado

## Dependências

X037–X040

## Critério de aceite

- Backfill + cobertura por atributo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).