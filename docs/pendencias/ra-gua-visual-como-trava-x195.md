# X195 — Régua visual como trava

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.17 Talk X — Fase 16 · Qualidade e release (X192–X200: 0 concluídos)

## Descrição e origem

Régua visual como trava.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.17 Talk X — Fase 16 · Qualidade e release (X192–X200: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Regressão visual obrigatória + 2 semanas verdes
- **Existe hoje** (evidência da auditoria): Informativa e só tela 01
- **Falta**: Fixtures + janela
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X003

## Critério de aceite

- Regressão visual obrigatória + 2 semanas verdes
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).