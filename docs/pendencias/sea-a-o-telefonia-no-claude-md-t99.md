# T99 — Seção "Telefonia" no CLAUDE.md

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Seção "Telefonia" no CLAUDE.md.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Provedor SIP, secret, RPCs, notes×agent_notes, merge≠deploy
- **Existe hoje** (evidência da auditoria): CLAUDE.md sem seção Telefonia
- **Falta**: Escrever
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agentes repetem erros de contrato

## Dependências

SL-244

## Critério de aceite

- Provedor SIP, secret, RPCs, notes×agent_notes, merge≠deploy
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).