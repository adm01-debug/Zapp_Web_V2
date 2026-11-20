# X019 — Envio pela conexão escolhida com ritmo

- **Estado**: PARCIAL
- **Prioridade**: P0
- **Anexo**: 01 · **Seção**: 3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)

## Descrição e origem

Envio pela conexão escolhida com ritmo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Edge aplica teto por conexão
- **Existe hoje** (evidência da auditoria): supabase/functions/talkx-send/x019-connection-budget.test.ts; mesma fonte compartilhada de X018
- **Falta**: Idem X018
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Idem

## Dependências

X018

## Critério de aceite

- Edge aplica teto por conexão
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).