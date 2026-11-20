# X159 — "Checklist para retomar"

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)

## Descrição e origem

"Checklist para retomar".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 5 itens persistidos
- **Existe hoje** (evidência da auditoria): RPC X026 no banco, sem tela
- **Falta**: UI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Retomada sem roteiro

## Dependências

X156

## Critério de aceite

- 5 itens persistidos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).