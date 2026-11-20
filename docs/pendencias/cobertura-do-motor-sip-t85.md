# T85 — Cobertura do motor SIP

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Cobertura do motor SIP.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 486/480/603, reconexão, DTMF; calls-access.test.ts sem todo; lib/calls 100 % branches
- **Existe hoje** (evidência da auditoria): Muitos testes (CallEngine, useSipClient, useSipConnection); calls-access.test.ts:259 e :263 ainda it.todo (escopo all e espera/transferência)
- **Falta**: Remover os 2 todo e medir cobertura
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Menos rede contra regressão

## Dependências

SL-111

## Critério de aceite

- 486/480/603, reconexão, DTMF; calls-access.test.ts sem todo; lib/calls 100 % branches
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).