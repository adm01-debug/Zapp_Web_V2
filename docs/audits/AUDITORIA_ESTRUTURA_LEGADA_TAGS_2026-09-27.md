# Auditoria exaustiva — estrutura legada de etiquetas (`tags` + `contact_tags`)

> Complemento do `PLANO_REMOCAO_ETIQUETAS_100_ETAPAS_2026-09-27.md` (mesma PR). Aqui está a
> anatomia completa da estrutura legada, a prova de que está morta e o veredito de exclusão total.
> Toda afirmação sobre o banco foi lida ao vivo em 27/09/2026 no projeto `tnnnlkbymytvtqngbbqh`.

---

## 1. O que é a estrutura legada

Modelo **relacional** de etiquetas em 2 tabelas, criado em **20/12/2025** pela era Lovable
(migration `20251220182214`), com a tela Etiquetas (`view=tags`) como UI de gestão:

```
tags          (id uuid PK, name UNIQUE, color, description, created_by → profiles, timestamps)
contact_tags  (id uuid PK, contact_id → contacts CASCADE, tag_id → tags CASCADE, UNIQUE(contact_id, tag_id))
```

### Linha do tempo (reconstruída de migrations + dados)

| Data | Evento |
|---|---|
| **15/12/2025** | `contacts` nasce **já com `tags TEXT[]`** (migration `20251215024517`) — o array é o modelo ORIGINAL |
| **20/12/2025** | 5 dias depois, o modelo relacional é criado por cima (`20251220182214`), sem nunca ser ligado ao array |
| **17/03/2026** | nasce `ai_conversation_tags` (`20260317214556`) — 3º modelo, da IA, independente |
| **15/09/2026 19:59** | webhook `labels.edit` da Evolution grava as 3 únicas linhas da história: `wa:1:Não lidas`, `wa:2:Favoritos`, `wa:3:Grupos` |
| **desde então** | **zero escritas** (ver §3) |

O sistema tem portanto **3 modelos de etiqueta**; só o relacional é legado e removível:

| Modelo | Estado | Veredito |
|---|---|---|
| `contacts.tags text[]` | vigente (Contatos, Talk X, importação, `search_contacts` RPC) | fica |
| `tags` + `contact_tags` | legado, nunca integrado | **remover** |
| `ai_conversation_tags` | vivo (edge `ai-auto-tag`, classificação IA) | fica, fora do escopo |

---

## 2. Anatomia completa no banco (lida ao vivo)

- **Dados**: `tags` = 3 linhas (todas `wa:*`, cor idêntica `#FF9485`, `created_by` NULL);
  `contact_tags` = **0 linhas — nunca teve** (n_tup_ins = 0 desde que há estatística).
- **RLS** (6 policies): SELECT de `tags` é `USING (true)` para authenticated; INSERT de `tags`
  aceita `created_by IS NULL` (qualquer autenticado insere linha "sem dono" — fraqueza que morre
  junto com a tabela); `contact_tags` restringe por `assigned_to`/admin.
- **FKs**: apenas as 2 internas + `tags.created_by → profiles`. **Nenhuma outra tabela do banco
  referencia `tags` ou `contact_tags`.**
- **Índices**: 7 (PKs, UNIQUEs, `idx_tags_created_by`, `idx_contact_tags_tag_id`, `idx_contact_tags_contact_id`).
- **Sem** trigger próprio, **sem** função `public.*` que as cite, **fora** da publicação realtime.

## 3. Atividade real — a prova de que está morta

`pg_stat_user_tables` (acumulado, sem reset registrado):

| Tabela | ins | upd | del | leituras (seq + idx) |
|---|---|---|---|---|
| `tags` | 0 | 0 | 0 | 1 + 628 |
| `contact_tags` | 0 | 0 | 0 | 1.210 + 915 |

Ou seja: **nenhuma escrita** no período coberto pelas estatísticas, e **milhares de leituras em
vão** — é o front (filtro do Inbox, busca global, CRM 360) consultando tabelas vazias a cada
carregamento. A estrutura legada hoje só gera custo: queries inúteis por sessão de usuário.

## 4. Produtores e consumidores — censo completo

### Único produtor: webhook Evolution (2 handlers)
- `supabase/functions/evolution-webhook/index.ts:270-271` despacha `labels.edit` e `labels.association`.
- `_shared/evolution-webhook-handlers.ts:194-228` → escreve em `tags` (upsert/delete por `wa:<id>:%`) e `contact_tags` (associação).
- Eventos `LABELS_EDIT`/`LABELS_ASSOCIATION` são assinados na configuração do webhook
  (`evolution-api/index.ts:491`, `evolution-sync-actions.ts:306`, `webhook-diagnostic`).
- Prova de funcionamento: as 3 tags de 15/09. Prova de raridade: nada mais desde então.
- `_shared/evolution-sync-actions.ts:224,244` limpa `contact_tags` de contatos mock (delete, no-op com tabela vazia).

### Consumidores no front (7 pontos que leem as tabelas)
| Ponto | O que quebra ao remover |
|---|---|
| `src/hooks/crm/useTags.ts` — `useTags()` | é o núcleo legado (remover) |
| `src/hooks/crm/useTags.ts` — `useContactTags()` | **já é código morto** (zero consumidores) |
| `src/components/tags/TagsView.tsx` | a tela (remover) |
| `src/components/inbox/InboxFilters.tsx:75` + `src/hooks/inbox/useInboxFilters.ts:50-66,159-162` | filtro por etiqueta — **já não funciona** (cruza com tabela vazia); migrar para o array |
| `src/components/inbox/useGlobalSearchData.ts:61` | seção etiquetas da busca global — migrar para o array |
| `src/components/reports/useReportsData.ts:16` | relatórios importam `useTags` — trocar fonte |
| `src/hooks/crm/useContactCrm360.ts:184` | tags do CRM 360 — trocar para `contacts.tags` |

### Falsos positivos (parecem consumidores e NÃO são — não tocar)
- `crm-integration-contract.ts:16` (`'tags'`, `'contact_tags_ext'`): tabelas do **banco externo CRM**
  (`pgxfvjmuubtbowutlide`), não as nossas.
- `crm360TabsData.ts` aba `tags` (colunas `nome/cor/categoria`, em português): idem, banco externo.
- `ai_conversation_tags` (`ai-auto-tag`, `AutoTicketClassifier`, `AIAutoTagsConfig`, `contact.service`): outro modelo.
- `talkx_templates.tags`, `email_threads.tags`, `sales_deals.tags`, `knowledge_base_articles.tags`: arrays próprios de cada módulo.
- `supabase-export/BLOCO_*.sql`: snapshot legado desarmado (CLAUDE.md).

### Artefatos gerados que mudam sozinhos após o DDL (não editar à mão)
`src/integrations/supabase/types.ts`, `supabase/schema-catalog.json`, `supabase/schema-manifest.json`,
`scripts/db-audit/grants-baseline.json` — todos via `types-sync` pós-migration.

---

## 5. Viabilidade de exclusão TOTAL — veredito

**VIÁVEL, risco controlado.** Nenhum dado de negócio se perde (0 associações; as 3 tags são espelho
recriável dos labels do WhatsApp). Nenhuma FK externa, função, trigger ou realtime depende das
tabelas. O bloqueio é 100% de **ordem de execução**, não de dependência:

1. **Condição 1 — o webhook primeiro.** Os 2 handlers de labels precisam parar de escrever nas
   tabelas ANTES do `DROP` (redirecionar para `contacts.tags` com prefixo `wa:`, ou descontinuar o
   espelhamento — decisão de negócio: "quero ver os labels do WhatsApp dentro do Zapp?"). Se o
   `DROP` vier antes do deploy da edge, `labels.edit` passa a estourar erro no webhook — que hoje
   processa TODOS os eventos da instância no mesmo endpoint. Erro num handler é contido por
   try/catch? **Verificado: os handlers são `await` diretos no dispatch (index.ts:270-271); erro ali
   responde 500 para a Evolution e pode causar retry/reentrega dos eventos.** Risco real.
2. **Condição 2 — o filtro do Inbox junto.** Remover `useTags` sem migrar `InboxFilters`/
   `useInboxFilters`/`useGlobalSearchData`/`useReportsData`/`useContactCrm360` quebra o build. É
   1 PR de front com os 5 pontos migrados para o array (+ índice GIN em `contacts.tags`, que não existe).
3. **Condição 3 — fluxo de DDL do CLAUDE.md.** Arquivo → PR → merge → apply via `db_query` +
   ledger na mesma transação → `types-sync`. O `db-live-guard` acusa qualquer atalho.

**Ganho da exclusão total**: ~700 linhas de código morto (TagsView 308 + useTags 226 + teste 94 +
registros de rota/menu/prefetch/palette), 2 tabelas, 6 policies, 7 índices, 1 item de menu que
engana o usuário, e o fim de ~2.700 leituras acumuladas em tabelas vazias a cada ciclo de uso.
**Único valor que se perde**: o espelhamento (raríssimo — 1 evento em 9 meses) de labels do
WhatsApp para dentro do banco; a aba Etiquetas de Conexões continua mostrando os labels ao vivo
direto da Evolution, sem banco no meio.

Execução: as 7 fases e 100 etapas do plano já mergeado nesta mesma PR. Estimativa: Fases 1–2 em
1 sessão, Fase 3 em 1 sessão (+ aprovação do deploy de edge), Fases 4–7 em 1–2 sessões.
