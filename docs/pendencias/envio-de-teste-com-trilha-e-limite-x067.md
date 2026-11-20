# X067 — Envio de teste com trilha e limite

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)

## Descrição e origem

Envio de teste com trilha e limite.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: talkx_test_sends + 5/10 min
- **Existe hoje** (evidência da auditoria): Teste existe (TalkXTemplateEditor.tsx:157); tabela/limite = 0
- **Falta**: Migration + edge
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Testes sem limite nem registro

## Dependências

X019

## Critério de aceite

- talkx_test_sends + 5/10 min
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).