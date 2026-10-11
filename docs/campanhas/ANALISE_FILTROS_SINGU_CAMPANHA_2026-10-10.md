# Análise exaustiva — filtros do Singu no módulo Campanha (10/10/2026)

> Pedido do Joaquim: "no módulo campanha, temos também todos os filtros que chegam através das
> tabelas que existem no Singu, tanto de contato quanto de empresas?" Leitura só do código,
> `dia/2026-10-10`, sem chamar nenhum banco.

## 1. Existem DOIS sistemas de "Campanha" no menu — são bem diferentes

| Item do menu | id | Onde fica | O que é |
|---|---|---|---|
| **"Campanhas"** | `talkx` | Automação & IA | O sistema de verdade: segmentos com regras, estimativa de público, disparo em massa (Talk X) |
| **"Campanhas Clássicas"** | `campaigns` | Automação & IA | Sistema antigo/simples: só 1 campo (`target_type`: Todos / Personalizado / Fila / Tag), sem nenhum filtro de contato ou empresa |

`src/components/campaigns/CampaignCreateDialog.tsx` (122 linhas) não tem NENHUM filtro de
contato/empresa — então a resposta pra ele é direta: zero filtros do Singu, zero filtros de
qualquer tipo além de fila/tag. O resto desta análise é sobre o **Talk X** ("Campanhas"), que é
quem importa.

## 2. O achado mais importante: o Talk X **não tem NENHUMA ligação com o Singu**

Diferente do Multiplix (que pelo menos tem uma ponte via Edge Function para 5 RPCs do Singu), o
Talk X **nunca chama o Singu**. A busca por `EXTERNAL_SUPABASE` (a env var que toda ponte com o
Singu usa) em `src/hooks/integrations/useTalkXSegments.ts` dá **zero resultados**. A função que
resolve o público (`talkx_resolve_audience`, em
`supabase/migrations/20261002391230_talkx_audience_rpc.sql:292`) lê só
**`FROM public.contacts c`** — a tabela de contatos do PRÓPRIO Zapp, local. Não existe `JOIN` com
nenhuma tabela de empresa, nem chamada a RPC externa.

## 3. Os 17 campos que existem hoje (todos locais, nenhum do Singu)

Catálogo oficial em `RULE_FIELDS` (`useTalkXSegments.ts:53-79`) — confirmado como lista OFICIAL e
fechada pelo cartão **N-111** ("Talk X: banco: lista oficial de campos e operadores de segmento",
`t_10095f18`, feito em 09/10):

| Categoria | Campos |
|---|---|
| Básico | tags, empresa (texto livre), cidade, UF, grupo, e-mail, canal de origem, origem do lead, data de cadastro |
| Comercial | responsável, tipo do contato, lead score |
| Comportamento | status da conversa, risco de churn, prioridade (IA), sentimento (IA), última interação |
| LGPD | consentimento |

**Nenhum desses é dado do Singu.** `empresa`/`cidade`/`UF` são colunas de **texto livre** na
própria tabela `contacts` do Zapp (`c.company`, linha 416 da migration), preenchidas manualmente
ou pelo perfil do WhatsApp — **não vêm de `public.companies`/`company_addresses` do Singu**.
Confirmado: não existe nenhum trigger, Edge Function ou sync que escreva `contacts.company` a
partir do Singu (busca no repo inteiro por esse padrão = zero resultados). `lead_score`,
`risk_score`, `ai_priority`, `ai_sentiment` são gerados pelo próprio Zapp, não pelo Singu.

## 4. Comparando com o que o Singu realmente tem (mesmo levantamento de hoje, Multiplix)

| Campo do Singu (real, confirmado hoje) | Existe no Talk X? | Observação |
|---|---|---|
| `companies.ramo_atividade` | **Não** | Multiplix já usa este campo; Talk X nem bate no Singu |
| `companies.is_customer/is_supplier/is_carrier` (tipo de público) | **Não** | Talk X não distingue cliente/fornecedor/transportadora |
| `company_addresses.estado` (UF real da empresa) | **Não** (só o UF de texto livre do contato) | |
| `customers.vendedor_id` (carteira do vendedor) | Parcial — via `assigned_to` (responsável no Zapp), que é outro conceito | |
| `interactions.data_interacao` (última interação REAL, 10.461 linhas populadas) | Parcial — `updated_at` do Zapp é outra coisa | |
| Cargo, departamento (existem na sidebar do Singu, conforme achado de 08/10 no plano de Contatos) | **Não** | Mesma lacuna documentada no módulo Contatos (`search_contacts_advanced` do Singu também não filtra por eles) |
| Grupo econômico, status detalhado, tipo cooperativa, nicho cliente, capital social, sexo, idade/nascimento | **Não** | Mesmos campos que o pedido ao Singu de hoje (Multiplix) já lista como inexistentes nas RPCs expostas |
| Segmento, porte, CNPJ | **Não** | Achado e OMITIDO explicitamente em 08/10 (cartão SL-151, `t_5c3b951f`): "campos sem fonte... depende de dados e fonte no banco" — já era um gap conhecido, não é novidade |

## 5. Cartões/planos já existentes (não duplicar)

- `t_10095f18` / `t_d782df19` (N-111 + refazer) — fechou a lista OFICIAL atual de 17 campos. Ou
  seja, a lista de hoje foi uma decisão deliberada, não um esquecimento — mas foi feita sem nenhum
  campo do Singu no escopo.
- `t_5c3b951f` (SL-151, CRM360) — já documentou que segmento/porte/CNPJ não têm fonte confiável.
- `t_76f85efb` (TL-141, "Os 7 filtros de audiência com o catálogo de filtros dos segmentos") — um
  subconjunto de 7 filtros rápidos no assistente de campanha, reaproveita o mesmo catálogo
  `RULE_FIELDS` — não traz nada do Singu.
- Nenhum cartão encontrado propondo ligar o Talk X ao Singu. É pedido novo.

## 6. Recomendação

1. **O pedido ao Singu que já foi escrito hoje para o Multiplix
   (`docs/multiplix/PEDIDO_AO_SINGU_FILTROS_PUBLICO_2026-10-10.md`) deveria valer para os DOIS
   módulos**, não só o Multiplix: os campos pedidos (tipo de público, ramo, grupo econômico,
   status, capital social, cargo, departamento, sexo, nascimento) servem igualmente para segmentar
   campanhas do Talk X. Vale atualizar esse documento para citar os dois consumidores.
2. **Separado disso, e mais simples**: mesmo sem mexer no Singu, o Talk X poderia aproveitar dados
   que o Zapp JÁ TEM localmente e hoje não usa como filtro de segmento: `ramo_atividade`/`UF`
   REAIS de `companies`/`company_addresses` (as mesmas tabelas que o Multiplix já lê, via a mesma
   ponte), em vez do texto livre de `contacts.company`. Isso não depende de pedir nada ao Singu —
   só de estender `talkx_audience_query`/`talkx_resolve_audience` para fazer o mesmo tipo de ponte
   que `multiplix-audience` já faz. É um cartão de tamanho médio, só no Zapp.
3. A decisão de ESCOPO (vale a pena religar Talk X ao Singu agora, ou esperar a resposta da equipe
   do Singu sobre os campos novos antes de fazer duas vezes) é do Joaquim.

## Referências

- `src/hooks/integrations/useTalkXSegments.ts` (catálogo de campos + RPC de resolução)
- `supabase/migrations/20261002391230_talkx_audience_rpc.sql` (fonte real: `public.contacts`)
- `src/components/campaigns/CampaignCreateDialog.tsx` (sistema clássico, sem filtros)
- `docs/multiplix/PEDIDO_AO_SINGU_FILTROS_PUBLICO_2026-10-10.md` e `docs/multiplix/PONTE_SINGU.md`
