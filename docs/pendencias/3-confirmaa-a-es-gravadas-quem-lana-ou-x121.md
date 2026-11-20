# X121 — 3 confirmações gravadas + quem lançou

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)

## Descrição e origem

3 confirmações gravadas + quem lançou.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: launch_confirmations + RPC
- **Existe hoje** (evidência da auditoria): launched_by gravado no start (20261003172707…:124); só consentimento persiste
- **Falta**: Migration
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem trilha de quem confirmou o quê

## Dependências

X120

## Critério de aceite

- launch_confirmations + RPC
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).