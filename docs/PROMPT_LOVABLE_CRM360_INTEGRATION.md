# PROMPT PARA LOVABLE — Integração completa CRM 360° no zapp-web

## CONTEXTO GERAL

Este projeto é um sistema de **WhatsApp Multiatendimento** (zapp-web) conectado a dois bancos Supabase:

1. **Supabase principal** (`tnnnlkbymytvtqngbbqh`) — banco do próprio zapp-web com contacts, messages, conversations, queues, etc.
2. **Supabase externo CRM** (`pgxfvjmuubtbowutlide`) — banco com 111 tabelas contendo 57.727 empresas, 4.753 contatos enriquecidos, 10.453 interações, scores RFM, perfis DISC, etc.

Já foram criados e commitados no GitHub:
- `src/integrations/supabase/externalClient.ts` — client Supabase para o banco CRM externo
- `src/types/contact360.ts` — 12 interfaces TypeScript para a resposta 360°
- `src/types/contactSearch.ts` — 4 interfaces para a busca avançada
- `src/hooks/useExternalContact360.ts` — hook que chama RPC `get_contact_360_by_phone`
- `src/hooks/useAdvancedContactSearch.ts` — hook com busca, filtros, paginação
- `src/components/inbox/contact-details/ExternalContact360Panel.tsx` — painel 360° no ContactDetails
- `src/components/contacts/AdvancedCRMSearch.tsx` — busca avançada com filtros

Os **environment secrets** necessários já estão no `.env`:
```
VITE_EXTERNAL_SUPABASE_URL="https://pgxfvjmuubtbowutlide.supabase.co"
VITE_EXTERNAL_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBneGZ2am11dWJ0Ym93dXRsaWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjcwMTIsImV4cCI6MjA4NTcwMzAxMn0.sW9N_LChqwVNUvMmQWXx87Vhs3eoTI2OKg2TT_Cg4V0"
```

**IMPORTANTE:** Esses secrets também precisam ser adicionados no painel do Lovable em Settings → Environment Variables.

---

## O QUE JÁ EXISTE E FUNCIONA

### 1. ExternalContact360Panel (inbox/contact-details/)
- Já é renderizado dentro de `ContactDetails.tsx` como uma seção accordion "CRM 360°"
- Recebe o `phone` do contato e chama `useExternalContact360`
- Exibe: Company Card, Customer Profile, RFM Badge, Behavioral Profile, Interactions Timeline, Social Links, Address, Extra Phones/Emails
- **Status: código commitado, mas pode precisar de ajustes visuais para integrar 100% com o design system do app**

### 2. AdvancedCRMSearch (contacts/)
- Já é renderizado dentro de `ContactsView.tsx` via botão "CRM 360°" que abre um Dialog
- Busca full-text + 6 filtros (vendedor, ramo, estado, RFM, status, já comprou) + 5 ordenações + paginação
- Cards de resultado mostram: nome, cargo, empresa+logo, estado, vendedor, pedidos, valor, RFM, telefone, email, WhatsApp badge
- **Status: código commitado, pode precisar de polimento visual**

---

## TAREFAS PARA O LOVABLE EXECUTAR

### TAREFA 1 — Revisar e polir o ExternalContact360Panel

O componente `src/components/inbox/contact-details/ExternalContact360Panel.tsx` já existe. Preciso que você:

1. **Verifique se renderiza corretamente** dentro do accordion em `ContactDetails.tsx`. A seção "CRM 360°" deve aparecer entre "SLA & Inteligência" e "Tags".

2. **Ajuste o visual** para ficar consistente com o design system do app (mesmo estilo dos outros accordion items — `ContactInfoSection`, `ContactStatsSection`, etc.). Use as mesmas cores, espaçamentos, fontes e componentes shadcn/ui.

3. **Garanta que o `isExternalConfigured`** controla a visibilidade — se as env vars não estiverem configuradas, a seção NÃO deve aparecer.

4. **Trate estados de loading/error** — skeleton enquanto carrega, mensagem amigável se não encontrar o contato no CRM, e nenhum erro visível se o banco externo estiver offline.

5. **Conecte a ação de clique** — ao clicar em redes sociais, links devem abrir em nova aba. Ao clicar em telefones, deve haver opção de copiar.

### TAREFA 2 — Revisar e polir o AdvancedCRMSearch

O componente `src/components/contacts/AdvancedCRMSearch.tsx` já existe. Preciso que você:

1. **Verifique se o Dialog abre corretamente** ao clicar no botão "CRM 360°" no header da página de Contatos.

2. **Ajuste o layout do Dialog** — deve ocupar 80% da viewport height, com a busca no topo, filtros em Sheet lateral direita, resultados scrolláveis no centro, e paginação no rodapé.

3. **Ao clicar em um resultado**, deve navegar para o chat do contato no inbox (já tem a lógica `openContactChat` no ContactsView).

4. **Se o contato NÃO existir no banco local do zapp-web**, ofereça a opção de "Importar contato" — criando um novo registro em `contacts` com os dados vindos do CRM (name, phone, email, company, job_title, contact_type).

5. **Adicione feedback visual** — badge de "WhatsApp" nos resultados que têm `is_whatsapp: true`, indicador colorido de RFM segment, e ícone de status (ativo/inativo).

### TAREFA 3 — Adicionar busca CRM no GlobalSearch/CommandPalette

O app já tem `src/components/inbox/GlobalSearch.tsx` e `src/components/CommandPalette.tsx`. Preciso que:

1. **Integre a busca CRM** como uma aba ou seção dentro do GlobalSearch existente. Quando o usuário pesquisa um nome/empresa, além de buscar nos contatos locais, também busque no CRM externo via `useAdvancedContactSearch`.

2. **Mostre resultados do CRM** com um badge "CRM" para diferenciar dos contatos locais. Se o resultado CRM já existir localmente (mesmo telefone), mostre apenas o local.

3. **Use debounce de 400ms** na busca CRM (já implementado no hook).

### TAREFA 4 — Enriquecer o ChatHeader com dados do CRM

O componente `src/components/inbox/chat/ChatHeader.tsx` mostra o nome do contato durante a conversa. Preciso que:

1. **Ao lado do nome**, mostre badges contextuais vindos do CRM:
   - Nome da empresa (se existir)
   - Vendedor responsável
   - Segmento RFM (com cor: Champions=verde, At Risk=vermelho, Hibernating=cinza, etc.)
   - Se é cliente ativo ou inativo

2. **Use o hook `useExternalContact360`** passando o `contact.phone` da conversa atual. Os dados já vêm cacheados por 10min via React Query.

3. **Mostre um tooltip** ao passar o mouse nos badges com informações extras (total pedidos, ticket médio, valor total compras).

### TAREFA 5 — Dados do CRM no ContactHeaderSection

O componente `src/components/inbox/contact-details/ContactHeaderSection.tsx` já mostra avatar, nome, badges de sentiment/priority/channel. Preciso que:

1. **Adicione o logo da empresa** do CRM (campo `company.logo_url` da resposta 360°) ao lado do avatar, quando disponível.

2. **Mostre o `nome_tratamento`** ou `apelido` do CRM como subtítulo abaixo do nome, caso exista.

3. **Adicione badge de "Cliente VIP"** se o `relationship_score` do CRM for >= 70.

4. **Mostre o vendedor responsável** como tag pequena abaixo dos badges existentes.

### TAREFA 6 — Indicador de CRM na ConversationList

O componente `src/components/inbox/ConversationList.tsx` mostra a lista de conversas na lateral. Preciso que:

1. **Adicione um pequeno ícone/dot** nas conversas cujo contato foi encontrado no CRM externo, indicando que há dados enriquecidos disponíveis.

2. **Mostre o nome da empresa** como subtexto na conversation list item, quando disponível via CRM.

3. **A busca deve ser eficiente** — NÃO faça uma chamada RPC por conversa. Em vez disso, faça um batch lookup ou cache local dos telefones que já foram buscados.

---

## REFERÊNCIA TÉCNICA DOS ARQUIVOS EXISTENTES

### Client externo (src/integrations/supabase/externalClient.ts)
```typescript
import { createClient } from '@supabase/supabase-js';
const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL || '';
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || '';
export const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const isExternalConfigured = Boolean(EXTERNAL_SUPABASE_URL && EXTERNAL_SUPABASE_ANON_KEY);
```

### Hook 360° (src/hooks/useExternalContact360.ts)
```typescript
// Recebe um phone string, limpa caracteres não-numéricos, e chama:
// externalSupabase.rpc('get_contact_360_by_phone', { p_phone: cleanedPhone })
// Retorna Contact360Data (ver src/types/contact360.ts)
// Cache: staleTime 10min, gcTime 30min
export function useExternalContact360(phone: string | undefined)
```

### Hook Busca Avançada (src/hooks/useAdvancedContactSearch.ts)
```typescript
// Chama: externalSupabase.rpc('search_contacts_advanced', { p_search, p_vendedor, p_ramo, p_rfm_segment, p_estado, p_cliente_ativado, p_ja_comprou, p_sort_by, p_page, p_page_size })
// Retorna: { results, total, totalPages, currentPage, filters, isLoading, isFetching, hasActiveFilters, activeFilterCount, params, setSearch, setFilter, setSortBy, setPage, clearFilters, isConfigured }
export function useAdvancedContactSearch()
```

### Tipos principais (src/types/contact360.ts)
```typescript
interface Contact360Data {
  found: boolean;
  searched_phone: string;
  contact: Contact360Contact | null;      // nome, cargo, DISC, behavior, score, etc.
  contact_phones: Contact360Phone[];       // telefones com is_whatsapp
  contact_emails: Contact360Email[];       // emails com tipo
  contact_social: Contact360Social[];      // instagram, linkedin, etc.
  contact_interactions: Contact360Interaction[];  // últimas 10 interações
  stakeholder: Contact360Stakeholder | null;      // buying_role, power_level
  company: Contact360Company | null;       // nome, cnpj, logo, ramo, website
  customer: Contact360Customer | null;     // vendedor, pedidos, compras, ticket_medio
  rfm: Contact360RFM | null;              // R/F/M scores, segment_code
  company_phones: Contact360Phone[];
  company_emails: Contact360Email[];
  company_address: Contact360Address | null;  // endereço com lat/lng
  company_social: Contact360Social[];
}
```

### Tipos busca (src/types/contactSearch.ts)
```typescript
interface SearchContactResult {
  contact_id: string;
  full_name: string | null;
  cargo: string | null;
  company_name: string | null;
  company_logo: string | null;
  company_estado: string | null;
  vendedor_nome: string | null;
  cliente_ativado: boolean | null;
  total_pedidos: number | null;
  valor_total_compras: number | null;
  ticket_medio: number | null;
  rfm_segment: string | null;
  phone_primary: string | null;
  email_primary: string | null;
  is_whatsapp: boolean;
  // ... mais campos
}
```

---

## REGRAS IMPORTANTES

1. **NÃO modifique os hooks nem os types** — eles já estão funcionando e testados. Apenas consuma-os nos componentes.

2. **NÃO modifique o externalClient.ts** — ele já está configurado corretamente.

3. **Use `isExternalConfigured`** de `@/integrations/supabase/externalClient` para condicionalmente mostrar/esconder elementos do CRM. Se as env vars não existirem, o app deve funcionar normalmente sem features de CRM.

4. **Respeite o cache** do React Query — o hook `useExternalContact360` já tem staleTime de 10min. Não force refetch desnecessário.

5. **Mantenha performance** — a ConversationList pode ter dezenas de conversas. NÃO faça uma chamada RPC por conversa. Use cache compartilhado via React Query (mesmo queryKey = mesmo cache).

6. **Siga o design system existente** — use os componentes shadcn/ui já importados (Badge, Card, Avatar, Skeleton, Tooltip, etc.), as cores CSS variables do tema, e o padrão visual dos outros componentes.

7. **Trate o caso "contato não encontrado"** — muitos contatos do zapp-web não existirão no CRM externo. Isso é normal. O painel deve simplesmente não aparecer ou mostrar uma mensagem discreta.

8. **Todos os textos em Português (pt-BR)** — labels, tooltips, mensagens de erro, placeholders.

---

## ORDEM DE EXECUÇÃO SUGERIDA

1. Primeiro: TAREFA 1 (polir ExternalContact360Panel) — é o mais visível e impactante
2. Segundo: TAREFA 5 (ContactHeaderSection) — enriquece o header do chat
3. Terceiro: TAREFA 4 (ChatHeader) — badges contextuais durante conversa
4. Quarto: TAREFA 2 (AdvancedCRMSearch) — polir busca e importação
5. Quinto: TAREFA 3 (GlobalSearch) — integrar busca CRM
6. Último: TAREFA 6 (ConversationList) — indicadores visuais (mais complexo por performance)

Comece pela TAREFA 1 e vá avançando em sequência. A cada tarefa concluída, confirme o que foi feito antes de avançar.
