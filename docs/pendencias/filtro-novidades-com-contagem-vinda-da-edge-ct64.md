# CT-64 — Filtro "Novidades" com contagem vinda da edge

- **Estado**: CONCLUÍDO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Filtro "Novidades" com contagem vinda da edge.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Ação new_or_recent/new_30d
- **Existe hoje** (evidência da auditoria): KPI mostra 366; a edge não tem a ação (só 6 ações no ActionSchema)
- **Falta**: Ação + contagem na edge
- **Entregue** (PR desta rodada, 25/11/2026): a contagem do card passa a ser recalculada na própria edge (`aplicarContagemCanonicaDeNovidades`, `supabase/functions/promogifts-catalog/index.ts`) com o MESMO predicado da grade, e o filtro da grade deixou de usar a janela de 30 dias sobre `created_at`. Clique no card (`new_30d`) → `isNew` (`ExternalProductManagement.tsx:593`) → `params.is_new` (l.480) → `eq("is_new", true).gt("novelty_expires_at", now)`.
- **Verificação byte-a-byte**: conferida em 25/11/2026 — predicado da grade (`index.ts`, `list_products`), helper da contagem, os dois caminhos de stats (`bootstrap` e `catalog_stats`) e os 3 arquivos de teste do `promogifts-catalog` (`deno check` limpo; 46 testes verdes, incluindo os 3 novos do helper).
- **Resíduo conhecido**: o RPC `zapp_catalog_stats` (definido no Promo Gifts V4, `supabase/migrations/20260912205759_catalog_e24_zapp_catalog_stats.sql`) conta `new_30d` pela UNIÃO `created_at > now()-30d OR (is_new AND (is_new_expires_at IS NULL OR > now()))` → 236 hoje. Esse número nunca chega ao card: a edge o substitui pela contagem canônica (222) antes de responder e antes de cachear. Enquanto o V4 não aposentar a união no RPC, a edge precisa manter essa substituição.

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nenhuma — card e grade passam a usar a mesma regra (era exatamente o "número do filtro sem conferência").

## Regra canônica da novidade (fonte da verdade: Promo Gifts V4)

`is_active = true AND is_new = true AND novelty_expires_at > now()`. A janela de 30 dias sobre `created_at` foi aposentada pelo FIX P0 da auditoria Novidades do V4 (`src/hooks/products/novelty-core.ts`, `applyNoveltyPredicate`): como o banco só marca `is_new` quando o trigger detecta a novidade (lag médio ~21 dias), a janela escondia parte das novidades reais. `novelty_expires_at` é a coluna CANÔNICA; `is_new_expires_at` é cópia de compatibilidade mantida em sync pelo trigger `trg_sync_novelty_expires_at` (`supabase/migrations/20260614121711_fix_sync_is_new_expires_at_trigger_canonical_novelty.sql` do V4).

Medido no banco de produtos (`doufsxqlfjyuvxuezpln`, 25/11/2026, via PostgREST `count=exact`):

| predicado | produtos |
| --- | --- |
| `is_new = true` | 232 |
| `is_new = true AND novelty_expires_at > now()` | 222 |
| `is_new = true AND is_new_expires_at > now()` | 222 |
| `is_new = true AND created_at > now() - 30d` (regra antiga da edge) | 115 |

A janela de 30 dias escondia **107 das 222** novidades reais.

## Dependências

deploy de edge

## Critério de aceite

- Ação new_or_recent/new_30d
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).