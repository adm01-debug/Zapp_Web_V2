# E35 — Conexão padrão única e atômica

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Conexão padrão única e atômica.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: RPC atômica
- **Existe hoje** (evidência da auditoria): O front chama rpc('set_default_whatsapp_connection') (src/hooks/inbox/useConnectionsManager.ts:306), mas a migration 20261006234158_… não está no repo (nem em outro branch); a exceção é temporária em scripts/db-audit/known-violations.json:2,7; a RPC está ausente de types.ts e de schema-catalog
- **Falta**: Versionar e aplicar a migration
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O botão "Definir como padrão" dá erro se a RPC não existir no banco

## Dependências

migration (lote)

## Critério de aceite

- RPC atômica
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).