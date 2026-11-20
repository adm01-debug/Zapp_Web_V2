# E33 — Rate limit do webhook por instância

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Rate limit do webhook por instância.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Chave por instância
- **Existe hoje** (evidência da auditoria): checkRateLimit(\evowh:${ip}\, 200, 60_000) (evolution-webhook/index.ts:107)
- **Falta**: Chave por instância
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Com 2+ números no mesmo IP da GO, uma rajada de um derruba o outro

## Dependências

Nenhuma registrada.

## Critério de aceite

- Chave por instância
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).