# ZAPP-WEB × CRM 360° — Documentação Técnica

## Arquitetura

```
zapp-web (Lovable)                    bancodadosclientes (CRM)
tnnnlkbymytvtqngbbqh                 pgxfvjmuubtbowutlide
├── contacts (local)                  ├── contacts (4.753)
├── messages                          ├── companies (57.727)
├── conversations                     ├── customers (52.235)
│                                     ├── interactions (10.453+)
│   ←── LEITURA (360°) ──────────    ├── company_rfm_scores
│   ──── ESCRITA (sync) ─────────→   ├── contact_phones
│                                     ├── contact_emails
│                                     ├── company_social_media (99k)
│                                     └── ... (111 tabelas total)
```

## RPCs Criadas no Supabase CRM

| RPC | Input | Output | Uso |
|-----|-------|--------|-----|
| `get_contact_360_by_phone(TEXT)` | Telefone | JSONB 360° completo | Painel lateral ContactDetails |
| `search_contacts_advanced(...)` | 10 params (search, filtros, paginação) | JSONB paginado + filter options | Busca avançada CRM 360° |
| `get_companies_by_phones_batch(TEXT[])` | Array de telefones | Map phone→company | ConversationList (1 RPC para N conversas) |
| `sync_interaction_from_zapp(...)` | 11 params (phone, channel, resumo...) | JSONB {synced, score, rfm} | Auto-sync ao resolver conversa |
| `get_contact_intelligence_by_phone(TEXT)` | Telefone | JSONB 7 seções inteligência | Painel Inteligência Comercial |
| `recalculate_rfm_for_company(UUID)` | company_id | JSONB scores R/F/M + segment | Chamado automaticamente pelo sync |

## Trigger Criado

| Trigger | Tabela | Evento | Ação |
|---------|--------|--------|------|
| `trg_auto_relationship_stage` | contacts | BEFORE UPDATE OF relationship_score | Auto-define relationship_stage baseado no score |

Mapeamento score→stage:
- 80+ = advocate
- 60-79 = customer
- 40-59 = opportunity
- 20-39 = qualified
- 1-19 = lead
- 0 = unknown

## Hooks React

| Hook | Arquivo | Cache | Uso |
|------|---------|-------|-----|
| `useExternalContact360` | hooks/useExternalContact360.ts | 10min | Painel 360° por telefone |
| `useAdvancedContactSearch` | hooks/useAdvancedContactSearch.ts | 2min | Busca avançada com filtros |
| `useExternalContact360Batch` | hooks/useExternalContact360Batch.ts | 10min | Batch lookup para ConversationList |
| `useSyncToCRM` | hooks/useSyncToCRM.ts | mutation | Sync conversa → CRM |
| `useContactIntelligence` | hooks/useContactIntelligence.ts | 15min | Inteligência comercial unificada |

## Componentes React

| Componente | Arquivo | Tipo | Descrição |
|------------|---------|------|-----------|
| `ExternalContact360Panel` | contact-details/ | Accordion section | Painel 360°: empresa, cliente, RFM, DISC, social |
| `ContactIntelligencePanel` | contact-details/ | Accordion section | Briefing, triggers, rapport, horários, churn, DISC tips |
| `AdvancedCRMSearch` | contacts/ | Dialog full-height | Busca com 6 filtros + paginação + importação |
| `CRMAutoSync` | inbox/ | Invisível | Auto-sync no resolve + detecção sentimento |
| `CRMSyncButton` | inbox/ | Button | Sync manual no header ContactDetails |
| `CRMConversationBadge` | inbox/ | Badge inline | Nome empresa na ConversationList (batch) |

## Variáveis de Ambiente

```env
VITE_EXTERNAL_SUPABASE_URL=https://pgxfvjmuubtbowutlide.supabase.co
VITE_EXTERNAL_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Cadeia de Dados (Flow Completo)

```
1. Atendente abre conversa no zapp-web
2. ChatHeader carrega useExternalContact360 + useContactIntelligence
   → Tooltip com briefing aparece ao hover no nome
   → Badges CRM aparecem (empresa, vendedor, RFM, status)
3. ContactDetails carrega ExternalContact360Panel + ContactIntelligencePanel
   → Painel 360° com dados da empresa, cliente, scores
   → Painel Inteligência com briefing, gatilhos, rapport, DISC, churn
4. Atendente resolve a conversa
5. CRMAutoSync dispara automaticamente:
   a. Detecta sentimento das mensagens (positive/neutral/negative)
   b. Gera resumo (duração, msgs, última mensagem)
   c. Chama sync_interaction_from_zapp no CRM
   d. sync_interaction_from_zapp:
      i. Encontra contato por telefone
      ii. Grava interação na tabela interactions
      iii. Recalcula relationship_score
      iv. Trigger auto_update_relationship_stage atualiza stage
      v. Recalcula RFM scores da empresa
   e. React Query invalida cache → painel 360° atualiza
6. Próximo atendimento: dados atualizados, score evoluído, RFM recalculado
```

## Métricas de Performance

| Operação | RPCs | Tempo estimado |
|----------|------|---------------|
| Abrir ContactDetails | 2 RPCs (360° + intelligence) | ~400ms |
| ConversationList (50 itens) | 1 RPC batch | ~200ms |
| Busca avançada | 1 RPC | ~300ms |
| Sync ao resolver | 1 RPC (chain interna) | ~150ms |
| GlobalSearch CRM | 1 RPC (max 8 results) | ~250ms |
