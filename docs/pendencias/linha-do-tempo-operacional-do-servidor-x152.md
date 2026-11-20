# X152 — Linha do tempo operacional do servidor

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)

## Descrição e origem

Linha do tempo operacional do servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Tipos, ícones, "Ver todos"
- **Existe hoje** (evidência da auditoria): useTalkXEvents.ts:46 (limit 50)
- **Falta**: RPC
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X141

## Critério de aceite

- Tipos, ícones, "Ver todos"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).