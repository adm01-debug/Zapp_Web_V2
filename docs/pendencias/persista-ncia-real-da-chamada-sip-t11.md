# T11 — Persistência real da chamada SIP

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Persistência real da chamada SIP.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: 1 chamada real gera linha com provider_call_id e end_reason no mesmo id
- **Existe hoje** (evidência da auditoria): Código: src/lib/calls/persistence.ts (upsert_my_call), testes; 0 linhas de chamada desde 30/09 (plano :65)
- **Falta**: Uma ligação real e o recibo citado
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem prova de que o histórico grava certo

## Dependências

OP-01 + agente ao telefone

## Critério de aceite

- 1 chamada real gera linha com provider_call_id e end_reason no mesmo id
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).