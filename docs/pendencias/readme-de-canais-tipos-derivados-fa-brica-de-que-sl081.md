# SL-081 — README de canais, tipos derivados, fábrica de queryKeys

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

README de canais, tipos derivados, fábrica de queryKeys.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: README.md, queryKeys.ts
- **Existe hoje** (evidência da auditoria): Ausentes; teamChatTypes.ts manual
- **Falta**: Escrever
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Manutenção difícil

## Dependências

Nenhuma registrada.

## Critério de aceite

- README.md, queryKeys.ts
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).