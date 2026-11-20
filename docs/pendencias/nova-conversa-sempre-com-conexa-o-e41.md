# E41 — Nova conversa sempre com conexão

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Nova conversa sempre com conexão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Padrão/departamento; proibir null
- **Existe hoje** (evidência da auditoria): Escolhe o 1º connected retornado (src/hooks/chat/useNewConversation.ts:36-41) e grava selectedConnection `||` null (:98, :112)
- **Falta**: Usar a padrão; proibir null
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Conversa pode nascer sem conexão ou na conexão errada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Padrão/departamento; proibir null
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).