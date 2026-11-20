# E23 — QR, connect, status, logout e restart com o token certo

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P0
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

QR, connect, status, logout e restart com o token certo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Token por instância
- **Existe hoje** (evidência da auditoria): resolveSessionApiKey(route, Deno.env.get('EVOLUTION_INSTANCE_TOKEN'), …) (supabase/functions/evolution-api/index.ts:495, 717, 781; :520, :938 também)
- **Falta**: Token do Vault
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

QR e status da 2ª conexão refletem a PRINCIPAL

## Dependências

E16

## Critério de aceite

- Token por instância
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).