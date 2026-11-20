# 048 — Itens da auditoria de 60 sem etapa no plano vivo

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Itens da auditoria de 60 sem etapa no plano vivo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Contexto de empresa na chamada; retorno vinculado a tarefa; histórico igual no contato e na Telefonia; exportação; credencial SIP por usuário; diagnóstico correlacionado
- **Existe hoje** (evidência da auditoria): Histórico por contato usa leitura própria (src/hooks/chat/journey/useJourneyCalls.ts:115, useCalls.ts:75-89); ramal único (D1); exportação conflita com "nenhuma informação sai do sistema"
- **Falta**: Decidir/planejar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dados de ligação inconsistentes entre telas; um ramal compartilhado por todos

## Dependências

D1, regra de não-exportação

## Critério de aceite

- Contexto de empresa na chamada; retorno vinculado a tarefa; histórico igual no contato e na Telefonia; exportação; credencial SIP por usuário; diagnóstico correlacionado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).