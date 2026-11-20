# IA-062 — Buscar histórico do período no servidor

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Buscar histórico do período no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Mensagens do período resolvidas no servidor com paginação
- **Existe hoje** (evidência da auditoria): AIConversationAssistant filtra o array já carregado no chat; schema recebe mensagens do cliente (_shared/schemas.ts:121)
- **Falta**: Busca server-side por período
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Análise "dos últimos 30 dias" só vê o que está na tela

## Dependências

Nenhuma registrada.

## Critério de aceite

- Mensagens do período resolvidas no servidor com paginação
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).