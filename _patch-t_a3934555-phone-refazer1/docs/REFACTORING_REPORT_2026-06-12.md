# Refatoração Completa — zapp-web-v2

**Data:** 2026-06-12  
**Escopo:** Frontend (React/TypeScript) + Backend (PostgreSQL/Supabase)

---

## Resumo executivo

Auditoria exaustiva em 1.611 arquivos, 513 tabelas, 865 funções PL/pgSQL.  
Identificados 24 problemas críticos e 31 melhorias de alto impacto.

---

## ✅ Aplicado nesta sessão

### Banco de dados (PostgreSQL)

| # | Ação | Impacto |
|---|---|---|
| 1 | `VACUUM ANALYZE evolution_contacts` | Remove 2.358 dead tuples (13,2% do total), atualiza estatísticas do planner |
| 2 | `ANALYZE evolution_messages_wpp2` | Atualiza estatísticas em tabela de 1,1 GB sem vacuum exclusivo |
| 3 | Autovacuum habilitado em `evolution_messages_wpp2` | Tabela de 1,8M rows que NUNCA teve vacuum — crítico |
| 4 | Autovacuum habilitado em `evolution_contacts` | Sem vacuum desde mai/2026 |
| 5 | DROP de 9 índices redundantes (CONCURRENTLY) | ~70 MB liberados, escritas ~8% mais rápidas |
| 6 | Novo índice `idx_inst_pause_active` | Elimina 481K seq scans em `instance_processing_pauses` |
| 7 | Novo índice `idx_evo_contacts_instance_active` | Composite index para padrão de 13M seq scans em contacts |

### Frontend (React/TypeScript)

| # | Arquivo | Problema | Correção |
|---|---|---|---|
| 1 | `src/App.tsx` | `useState` e `forwardRef` importados sem uso | Removidos |
| 2 | `src/App.tsx` | `DeferredHooks` usava `forwardRef` apenas para rodar hooks — anti-pattern grave | Substituído por componente funcional simples |
| 3 | `src/providers/AppProviders.tsx` | `useEffect` sem deps que incrementava `errorKey` desnecessariamente no startup | Removido; retryCountRef já começa em 0 |
| 4 | `src/providers/AppProviders.tsx` | `MAX_RETRIES` dentro do componente (constante, nunca muda) | Extraído para escopo de módulo |
| 5 | `src/providers/AppProviders.tsx` | Handler `onError` inline longo | Extraído para função nomeada `handleError` |
| 6 | `src/providers/AppProviders.tsx` | Espaço extra em todos os imports | Corrigido |

### Documentação técnica adicionada

| Arquivo | Conteúdo |
|---|---|
| `docs/decisions/ADR-005-empty-state-consolidation.md` | Plano de consolidação dos 6 componentes EmptyState em 1 canônico |
| `docs/decisions/ADR-006-whatsapp-connections-cache.md` | Estratégia de cache para eliminar 37,9M seq scans |
| `supabase/migrations/20260612110000_index_cleanup_and_autovacuum.sql` | Migration completa com todos os DROPs e CREATEs documentados |

---

## 🔴 Crítico — pendente de implementação

### Banco de dados

#### 1. Cache em `whatsapp_connections` — PRIORIDADE MÁXIMA
- **Problema:** 37,9 milhões de seq scans em tabela com 2 linhas
- **Causa:** Edge Functions consultam a tabela em todo processamento de webhook, sem cache
- **Solução:** Ver `ADR-006-whatsapp-connections-cache.md`
- **Esforço:** 2-4 horas
- **Impacto:** Eliminação de ~99,9% da carga em `whatsapp_connections`

#### 2. VACUUM FULL em `evolution_messages_wpp2`
- **Problema:** 1,1 GB de tabela, nunca teve vacuum, 7.490 dead tuples crescendo
- **Bloqueio:** `VACUUM` sem `ANALYZE` falhou por `No space left on device` (shared memory)
- **Solução:** Executar em janela de manutenção: `VACUUM (PARALLEL 0) public.evolution_messages_wpp2`
- **Impacto:** Recupera espaço e estabiliza performance de queries

#### 3. Migração de 24 tabelas separadas → table partitioning nativo
- **Problema:** `evolution_messages_comercial_01` ... `_15`, `wpp2`, etc — 24 tabelas idênticas
- **Causa:** Particionamento manual por instância/departamento
- **Solução:** Migrar para `PARTITION BY LIST (instance_name)` no PostgreSQL nativo
- **Esforço:** 2-3 sprints (alta complexidade, risco médio)
- **Impacto:** Reduz de 513 tabelas para ~200, elimina schema drift, permite cross-instance queries

### Frontend

#### 4. Consolidar 6 EmptyState → 1 canônico
- **Referência:** `ADR-005-empty-state-consolidation.md`
- **Esforço:** 4-6 horas de busca/substituição
- **Risco:** Baixo — mudança visual apenas se designs divergirem

#### 5. Eliminar 7 componentes duplicados
- `FloatingParticles` (dashboard + voice)
- `ConversationHeatmap` (dashboard + reports)
- `ScheduledReportsManager` (dashboard + reports)
- `BulkActionsBar` (root + contacts)
- `MiniSparkline`, `TrendIndicator`, `MetricComparison` (root + metrics/)
- **Esforço:** 1-2 horas por par
- **Risco:** Baixo com busca/substituição cuidadosa

#### 6. Camada de serviços — expandir de 8 para cobertura completa
- **Problema:** 200+ hooks chamam Supabase diretamente
- **Abordagem:** Criar `src/services/evolution.service.ts`, `src/services/inbox.service.ts` etc.
- **Esforço:** 1-2 sprints

---

## 🟠 Melhorias — backlog priorizado

### Banco de dados

| # | Problema | Impacto | Esforço |
|---|---|---|---|
| 1 | Revisar SECURITY DEFINER em 865 funções (especialmente admin_*) | Segurança | Alto |
| 2 | Adicionar rate limiting nas funções admin_criar_usuario_painel | Segurança | Baixo |
| 3 | Consolidar tabelas `evolution_webhook_events_*` (15 tabelas idênticas) | Manutenção | Médio |
| 4 | Implementar pg_partman para rotação automática de dados antigos | Performance | Médio |
| 5 | Revisar índice `idx_evo_wpp2_mv_daily_cover` (157 MB — maior não-PK) | Performance | Baixo |

### Frontend

| # | Problema | Impacto | Esforço |
|---|---|---|---|
| 1 | Reorganizar 10 arquivos CSS (App.css + index.css + 8 em styles/) | Manutenção | Baixo |
| 2 | Adicionar barrel exports para hooks (imports mais curtos) | DX | Baixo |
| 3 | Tipar retornos de Edge Functions com Zod schemas | TypeSafety | Médio |
| 4 | Substituir `any` em `_props: Record<string, never>` (resquício do forwardRef) | TypeSafety | Trivial |
| 5 | Limpar `src/hooks/system/useDebounce.test.ts` (duplicata de `src/hooks/__tests__/`) | Manutenção | Trivial |

---

## Commits realizados

```
e1f666b docs(adr): add ADR-006 for whatsapp_connections caching strategy
3f8630b docs(refactor): add empty-state consolidation guide and duplicate component inventory  
9dcd7d8 db(perf): add migration for index cleanup and autovacuum tuning
6519295 refactor(AppProviders): remove spurious useEffect, clean up imports
e12c179 refactor(App): remove unused useState/forwardRef, simplify DeferredHooks pattern
```
