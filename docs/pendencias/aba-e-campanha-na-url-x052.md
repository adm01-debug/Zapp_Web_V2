# X052 — Aba e campanha na URL

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)

## Descrição e origem

Aba e campanha na URL.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: talkxRoute com campaign=<id>
- **Existe hoje** (evidência da auditoria): talkxTabRoute.ts (aba/sub) e talkxWizardRoute.ts; monitor/agendada/andamento só em useState (TalkXView.tsx:50-52)
- **Falta**: Rota por campanha
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Link de campanha não abre; recarregar volta à lista

## Dependências

Nenhuma registrada.

## Critério de aceite

- talkxRoute com campaign=<id>
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).