# E16 — Proxy evolution-api resolve o token pela instância

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P0
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Proxy evolution-api resolve o token pela instância.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: get_instance_token por instanceName
- **Existe hoje** (evidência da auditoria): Toda rota de instância usa o EVOLUTION_INSTANCE_TOKEN global (supabase/functions/_shared/evolution-api-proxy.ts:135-139)
- **Falta**: Resolver no Vault + cache
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Envio, grupos, perfil e etiquetas de uma 2ª conexão saem pela PRINCIPAL (a GO escolhe a instância pelo token)

## Dependências

Nenhuma registrada.

## Critério de aceite

- get_instance_token por instanceName
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).