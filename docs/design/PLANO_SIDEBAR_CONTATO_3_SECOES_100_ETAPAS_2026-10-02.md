# Sidebar "Detalhes do Contato" — redesign em 3 seções (100 etapas)

**Data:** 02/10/2026.

**Status:** plano para aprovação. Nenhuma etapa foi executada. Este commit contém somente o documento. As decisões de negócio da seção 6 (D1–D7) têm recomendação, mas são do Joaquim.

**Base consultada (nada foi alterado):**
- `adm01-debug/Zapp_Web_V2` em `bed1793` (`main`), clone desta sessão.
- `adm01-debug/Singu_V2` em `main` (clone desta sessão) + banco Supabase do Singu ao vivo.
- Banco do Zapp (`tnnnlkbymytvtqngbbqh`) ao vivo: contagens e `feature_flags`.

**Pedido literal do Joaquim:** o sidebar "Detalhes do Contato" passa a ter **só 3 seções** — (1) Dados Profissionais: WhatsApp + e-mail corporativo + empresa + departamento + cargo; (2) Dados Pessoais: Instagram + LinkedIn + Facebook + X + data de nascimento; (3) Perfil Singu: DISC, VAK, Big Five, MBTI, Eneagrama, temperamento, metaprogramas, medos/motivação, estilo de decisão, autoridade de orçamento, influenciadores, estratégia de rapport, scripts de objeção. As seções Informações, Status WhatsApp, Tags, Resumo Comercial, Última atividade e Mais detalhes deixam de existir. Referência visual: mock enviado em 02/10 (cards azul / roxo / verde, grade 2×3 de perfis com barra de confiança, linhas com chevron).

---

## 1. Diagnóstico (medido, não suposto)

### 1.1 O que o sidebar é hoje

| Peça | Arquivo | Linhas | O que faz |
|---|---|---|---|
| Container | `src/components/inbox/ContactDetails.tsx` | 147 | Painel `w-[323px]`, header "Detalhes do Contato", `Accordion type="multiple"`, atalhos `Esc` (fecha) e `Ctrl+T` (toast "Seção de Tags"), `EditContactDialog`. |
| Seções | `src/components/inbox/contact-details/ContactAccordionSections.tsx` | 206 | 6 itens raiz: Informações (+ "Ver mais" → Perfil WhatsApp + SLA & IA), Status WhatsApp, Tags, Resumo Comercial, `AIInsightsWidget` (solto), Última atividade, Mais detalhes (10 blocos: CRM 360°, Inteligência Comercial, Atribuição, Memória Viva, Scoring & LGPD, Compras & Propostas, Linha do Tempo, Estatísticas, Base de Conhecimento, `AnalysisBadges`). |
| Config | `src/components/inbox/contact-details/contactDetailSections.ts` | 58 | 19 entradas em `CONTACT_DETAIL_SECTIONS`, `DEFAULT_OPEN_SECTIONS`, estado do accordion em `localStorage` (`contact-details-accordion-state`), já filtra valores desconhecidos. |
| Header | `src/components/inbox/contact-details/ContactHeaderSection.tsx` | 232 | Avatar 72 px + anel de engajamento, nome (apelido local), empresa, "nome de tratamento" do CRM, cargo, data do último contato, chips (tipo / VIP / prioridade), `ContactActionButtons`. **Não muda neste plano.** |
| Informações | `src/components/inbox/contact-details/ContactInfoSection.tsx` | 156 | Telefone (copiar), e-mail / empresa / cargo com **edição inline gravando em `contacts` do Zapp**, "Cliente desde". |
| Responsivo | `src/components/inbox/ContactDetailsResponsive.tsx` | 32 | Desktop: painel lateral. Mobile: `Sheet` inferior. **Mantido.** |

Consumidor único do painel: `src/components/inbox/RealtimeInboxView.tsx:28` (lazy). `Crm360Tab.tsx` (aba do painel central) só compartilha `buildEditContactShape` — não é afetado.

### 1.2 De onde o dado Singu já chega ao Zapp (caminho existente)

- O banco do Singu **é** o banco "CRM 360°" que o Zapp já lê: projeto `pgxfvjmuubtbowutlide` (confirmado: mesmas contagens — 4.748 contatos ativos, 1.023 redes sociais, mesma definição de RPC).
- Caminho: front → `supabase.functions.invoke('crm-integration')` (`src/lib/crmIntegration.ts`) → Edge `supabase/functions/crm-integration/index.ts` ação `contactLookup` (`lookup` ∈ `{'360','intelligence'}`) → acha o telefone do contato do Zapp → `externalClient.rpc(...)` no Singu com `p_phone` → resposta limitada a 512 KB.
- Allowlist de RPCs: `supabase/functions/_shared/crm-integration-contract.ts` (`CRM_RPC_ALLOWLIST`, `allowedParams`, `EXPECTED_EXTERNAL_PROJECT_REF`).
- Hooks: `useExternalContact360` (cache 10 min) e `useContactIntelligence` (15 min), ambos atrás de `useCRMIntegrationEnabled()` = `VITE_CRM_INTEGRATION_ENABLED` (build, `true` no CI) **e** flag `crm.integration` na tabela `feature_flags`.

### 1.3 Achados que mudam o plano (com evidência)

| # | Achado | Evidência | Consequência |
|---|---|---|---|
| A1 | **A integração CRM está desligada em produção.** | `feature_flags.crm.integration = false` desde 2026-09-09 (banco do Zapp). | Hoje nenhum dado do Singu aparece no sidebar. A seção Perfil Singu e os campos Singu das outras duas só aparecem depois de religar (D1). |
| A2 | **A RPC `get_contact_360_by_phone` devolve um payload mínimo**, não o que o front espera. Ela retorna só `contact{id,name,company_id}`, `company{id,name,cnpj}` e `recent_interactions`. O tipo `Contact360Data` (`src/types/contact360.ts`) promete `contact_social`, `data_nascimento`, `behavior`, `contact_phones`, `contact_emails`… que **nunca chegam**. | `pg_get_functiondef('get_contact_360_by_phone')` no banco do Singu (1.487 caracteres). | Não dá para montar as 3 seções com a RPC atual. Precisa de **uma RPC nova** no banco do Singu (D2), e o tipo do front precisa refletir o payload real. |
| A3 | **Os dados do Perfil Singu estão vazios.** Tabelas `contact_behavior`, `contact_personality`, `contact_metaprograms`, `contact_rapport_strategy`, `contact_objection_scripts`, `contact_decision_making`, `contact_influence`, `contact_business_context`: **0 linhas**. `contacts.behavior` (jsonb): 4.648 contatos com o template vazio, 40 só com `preferredChannel`, **7 com DISC** (`C`, confiança 95). `vak_profile` e `metaprogram_profile`: 0. | Contagens ao vivo, 02/10. | A seção Perfil Singu nasce com estado vazio para 99,8% dos contatos. O plano exige estado vazio honesto por campo (D3) e um mapa fonte→campo que funcione quando o Singu começar a preencher. |
| A4 | **Preenchimento real das outras duas seções** (4.748 contatos): WhatsApp 2.108 contatos (`contact_phones.is_whatsapp`), e-mail corporativo 2.124 (`contact_emails.email_type='corporativo'`), empresa via `contacts.company_id → companies`, departamento 340, cargo 427; LinkedIn 567, Instagram 275, Facebook 139, **X: 0** (o enum `plataforma` tem `x`, nenhum registro), data de nascimento **9**. | Contagens ao vivo. | Linhas vazias serão a regra. Cada linha precisa de "—" + ação, nunca valor inventado. |
| A5 | **O dado local do Zapp é quase vazio.** 3.122 contatos; e-mail preenchido em 3, empresa em 1, cargo em 0. | Banco do Zapp. | A edição inline da seção Informações praticamente não é usada. Singu vira a fonte; o local é só fallback (D4). |
| A6 | `crm_contact_links` tem 0 linhas — o vínculo Zapp↔Singu é só por telefone, feito a cada consulta. | Banco do Zapp; `index.ts:271-277`. | Contato do Zapp sem telefone cadastrado no Singu → "não encontrado". O estado "Contato não vinculado ao Singu" precisa existir na UI. |
| A7 | **13 componentes ficam órfãos** ao remover as seções antigas (consumidor único é o accordion): `ContactInfoSection`, `WhatsAppStatusSection`, `EvolutionContactProfileSection`, `SLAAndAITagsSection`, `ComercialSummaryWidget`, `AIInsightsWidget`, `LastActivityWidget`, `AssignmentSection`, `ConversationMemoryPanel`, `LeadRiskScorePanel`, `ConversationTimeline`, `ContactStatsSection`, `KnowledgeBaseSearchPanel`. Ficam vivos por outro consumidor: `AnalysisBadges` (ChatHeader), `ContactPurchasesPanel` (OrdersTab), `ExternalContact360Panel`/`ContactIntelligencePanel` (até decidir). | `grep` por consumidor, 02/10. | Remoção em PR própria (D6), com os testes correspondentes (`WhatsAppStatusSection.test.tsx`, `ContactInfoSection.test.tsx`). |
| A8 | Atalho `Ctrl+T` abre toast "Seção de Tags" e o menu "Mais" tem "Recolher seções". | `ContactDetails.tsx:56-58`, `ContactActionButtons.tsx:194-196`. | Atalho sai com a seção Tags; "Recolher seções" continua válido (3 seções colapsáveis). |
| A9 | Não existe E2E do painel do inbox (só `contacts-detail.spec.ts`, que é o módulo Contatos). O contato seedado do E2E (`[E2E]`, telefone `11988776655`) não existe no Singu. | `e2e/`. | Etapas 85–90 criam a spec e um contato de fixture no Singu (ou mock da edge) — decisão na Fase 8. |
| A10 | Regra do repo: bancos externos são **somente leitura a partir deste repo** (`CLAUDE.md` §1). | `CLAUDE.md`. | A RPC nova nasce como migration no repo **Singu_V2**, não aqui. PR aberta aguardando o Joaquim (DDL em produção). |

---

## 2. Resultado pretendido

Ao abrir uma conversa, o painel direito mostra o header atual (avatar, nome, empresa, chips, 5 tiles de ação) e, abaixo, **exatamente três cards colapsáveis**, nesta ordem:

1. **Dados Profissionais** (tom azul) — WhatsApp, E-mail corporativo, Empresa, Departamento, Cargo. Cada linha: ícone, rótulo, valor, ação **copiar**. WhatsApp e e-mail também abrem (`wa.me`, `mailto`).
2. **Dados Pessoais** (tom roxo) — Instagram, LinkedIn, Facebook, X, Data de nascimento (+ idade calculada). Redes: ação **abrir em nova aba** (`rel="noopener noreferrer"`). Nascimento: `dd/MM/yyyy` + "N anos".
3. **Perfil Singu** (tom verde) — grade 2×3 (DISC, VAK, Big Five, MBTI, Eneagrama, Temperamento): ícone, nome, valor principal, barra de confiança/intensidade. Abaixo, 7 linhas (Metaprogramas, Medos / Motivação, Estilo de decisão, Autoridade de orçamento, Influenciadores, Estratégia de rapport, Scripts de objeção): rótulo, prévia de 1 linha, chevron → `Sheet` lateral com o detalhe completo.

Fonte dos dados: **Singu** (uma RPC nova, uma chamada por contato, cache 10 min). Fallback para o dado local do Zapp apenas em Dados Profissionais quando o Singu não encontra o contato. Nenhum valor é inventado: campo sem dado mostra "—"; seção inteira sem dado mostra estado vazio com a causa real ("Contato não vinculado ao Singu", "Sem avaliação no Singu", "Integração desligada").

Tudo o mais some do painel. O painel central (abas Notas, Tarefas, Arquivos, CRM 360°, Pedidos) continua sendo o lugar das ferramentas que saíram.

---

## 3. Contrato de dados

### 3.1 RPC nova no banco do Singu: `get_contact_sidebar_by_phone(p_phone text) RETURNS jsonb`

Read-only, `STABLE`, `SECURITY DEFINER` com `SET search_path = public`, `REVOKE ALL FROM anon, authenticated`, `GRANT EXECUTE TO service_role` (a edge usa a service key). Normalização do telefone igual à de `get_contact_intelligence_by_phone` (`numero_normalizado` / `numero_e164` / `numero`), que é mais estrita que o `LIKE '%…%'` da 360 (A2). Contato apagado (`deleted_at`) e duplicado (`is_duplicate`) não respondem. Arrays limitados (10 redes, 5 influenciadores, 10 scripts). Sem CPF, sem endereço, sem notas internas, sem `assigned_by_id` — o painel não usa e não deve transportar.

```jsonc
{
  "found": true,
  "contact_id": "uuid",
  "professional": {
    "whatsapp": { "numero_e164": "+5511…", "numero": "…", "phone_type": "celular_corporativo" } | null,   // contact_phones: is_whatsapp, is_primary primeiro
    "email_corporativo": { "email": "…", "is_verified": false } | null,                                   // contact_emails: email_type='corporativo', is_primary primeiro
    "empresa": { "id": "uuid", "nome": "…", "logo_url": "…" } | null,                                      // companies via contacts.company_id (nome_fantasia ?? nome_crm)
    "departamento": "…" | null,                                                                             // contacts.departamento
    "cargo": "…" | null                                                                                     // contacts.cargo (fallback role_title)
  },
  "personal": {
    "social": [ { "plataforma": "instagram|linkedin|facebook|x", "handle": "…", "url": "…" } ],            // contact_social_media is_active, só as 4 plataformas
    "data_nascimento": "1985-03-14" | null                                                                  // COALESCE(contacts.data_nascimento, contacts.birthday)
  },
  "singu_profile": {
    "disc":        { "primary": "D", "blend": "DI", "confidence": 80, "notes": "…" } | null,                // contact_behavior.disc_* ; fallback contacts.behavior->>'discProfile'/'discConfidence'/'discBlend'
    "vak":         { "primary": "visual", "visual": 70, "auditory": 20, "kinesthetic": 10 } | null,        // contact_behavior.vak_* ; fallback contacts.behavior->'vakProfile'
    "big_five":    { "openness": 0-100, "conscientiousness": …, "extraversion": …, "agreeableness": …, "neuroticism": …, "confidence": … } | null, // contact_personality
    "mbti":        { "type": "ENTJ", "e_i": …, "s_n": …, "t_f": …, "j_p": … } | null,                       // contact_personality.mbti_*
    "enneagram":   { "type": 3, "wing": 2, "scores": {…} } | null,                                          // contact_personality.enneagram_*
    "temperament": { "primary": "sanguineo", "secondary": "colerico", "notes": "…" } | null,               // contact_personality.temperament_* ; fallback contacts.behavior->'temperamentProfile'->>'primary'
    "metaprograms": { "toward": …, "away_from": …, "internal": …, "external": …, "options": …, "procedures": …, "proactive": …, "reactive": …, "global": …, "detail": …, "notes": "…" } | null, // contact_metaprograms
    "fears_motivation": { "main_fear": "…", "motivation_primary": "…", "current_pressure": "…", "professional_goals": "…" } | null, // contact_behavior
    "decision": { "speed": "…", "criteria": ["…"], "needs_approval": false, "approver_name": "…" } | null, // contact_decision_making ; fallback contact_behavior.decision_*
    "budget": { "authority": "aprovador_final|…", "decision_role": "…", "decision_power": 1-10 } | null,   // contact_decision_making.budget_authority + contact_influence ; fallback contact_behavior
    "influencers": [ { "contact_id": "uuid", "name": "…", "cargo": "…" } ],                                // contact_influence.influencer_ids → contacts (máx. 5)
    "rapport": { "pacing_speed": "…", "voice_tone_preferred": "…", "mirroring_technique": "…", "preferred_triggers": [], "emotional_anchors": [], "resistance_triggers": [], "notes": "…", "channel_scores": { "visual": …, "auditory": …, "kinesthetic": …, "digital": … } } | null, // contact_rapport_strategy
    "objection_scripts": [ { "objection_type": "…", "script_content": "…", "neurological_bias": "…", "effectiveness_score": … } ], // contact_objection_scripts (máx. 10)
    "assessed_at": "2026-…" | null                                                                          // max(updated_at) entre as tabelas acima; null = nunca avaliado
  }
}
```

`found: false` → `{ "found": false }` (sem eco do telefone — a 360 ecoa `phone`, desnecessário).

### 3.2 Edge `crm-integration`

- `contactLookup` aceita `lookup: 'sidebar'` (além de `'360'` e `'intelligence'`); mapeia para `get_contact_sidebar_by_phone`.
- `crm-integration-contract.ts`: RPC entra em `CRM_RPC_ALLOWLIST` e em `allowedParams` (`p_phone`); `extractContact360Id` ganha irmão `extractSidebarContactId` (lê `contact_id`) para a verificação de identidade contra `crm_contact_links` continuar valendo.
- Limite de 512 KB mantido; o payload esperado fica abaixo de 20 KB mesmo com todos os arrays cheios (etapa 23 mede).

### 3.3 Front

- Tipo `ContactSidebarData` em `src/types/contactSidebar.ts` espelhando 3.1, com `zod` só nos campos de texto livre que entram em `href` (url das redes, `wa.me`, `mailto`) — nunca renderizar URL que não passe em `https?://`.
- Hook `useContactSidebar(contactId)` em `src/hooks/crm/useContactSidebar.ts`: `queryKey ['contact-sidebar', contactId]`, `staleTime` 10 min, `gcTime` 30 min, `retry: 1`, `enabled: crmEnabled && !!contactId`. Expõe `status: 'disabled' | 'loading' | 'not_found' | 'error' | 'ok'` para a UI não ter que inferir.
- Dicionários de rótulo em `src/lib/singuLabels.ts` (DISC, VAK, MBTI, Eneagrama, temperamento, metaprogramas, autoridade), copiados do Singu (`src/types/index.ts` `DISC_LABELS`, `src/types/enneagram.ts`, `src/types/temperament.ts`) — valores canônicos do banco → texto pt-BR. Valor fora do dicionário mostra o valor cru, nunca quebra.

### 3.4 Métricas das barras (grade 2×3)

| Card | Valor principal | Barra (0–100) |
|---|---|---|
| DISC | `primary` + nome (D Dominante, I Influente, S Estável, C Conforme); `blend` quando houver | `confidence` |
| VAK | `primary` (Visual / Auditivo / Cinestésico) | score do canal primário |
| Big Five | traço de maior score ("Alta Abertura") | `confidence` |
| MBTI | `type` | menor distância ao centro entre os 4 eixos (intensidade da preferência) |
| Eneagrama | "Tipo N – Nome" (+ asa) | score do tipo em `scores`, senão sem barra |
| Temperamento | `primary` (+ `secondary`) | sem barra quando a fonte não tem score (não inventar) |

Barra ausente = componente `Progress` não renderiza; não desenhar barra em 0 "para preencher".

---

## 4. Componentes novos (árvore)

```
src/components/inbox/contact-details/
├── ContactDetails.tsx                     (editado: troca ContactAccordionSections → ContactSidebarSections; remove Ctrl+T)
├── sidebar/
│   ├── ContactSidebarSections.tsx         (3 Section em Accordion; recebe contact + enrichedData + sidebar query)
│   ├── SidebarSection.tsx                 (card colapsável: tile colorido 28px, título, subtítulo, chevron; tone blue|purple|green; mesmo radius/borda do SectionCard)
│   ├── SidebarRow.tsx                     (ícone 16px, rótulo 120px, valor truncado, ação à direita: copy | external | none)
│   ├── SidebarEmpty.tsx                   (estado vazio por seção: ícone + frase + CTA opcional)
│   ├── ProfessionalSection.tsx            (5 linhas; fallback local do Zapp)
│   ├── PersonalSection.tsx                (4 redes + nascimento/idade)
│   ├── SinguProfileSection.tsx            (grade 2×3 + 7 linhas)
│   ├── SinguProfileTile.tsx               (mini card: ícone, nome, valor, Progress)
│   ├── SinguProfileDetailSheet.tsx        (Sheet lateral com o detalhe de uma linha)
│   └── sidebarSections.ts                 (config das 3 seções, DEFAULT_OPEN, migração do localStorage)
src/hooks/crm/useContactSidebar.ts
src/types/contactSidebar.ts
src/lib/singuLabels.ts
```

`data-testid`: `contact-panel` (mantido), `sidebar-section-professional|personal|singu`, `sidebar-row-<campo>` (`whatsapp`, `email`, `company`, `department`, `job_title`, `instagram`, `linkedin`, `facebook`, `x`, `birthday`), `singu-tile-<disc|vak|big_five|mbti|enneagram|temperament>`, `singu-row-<metaprograms|fears|decision|budget|influencers|rapport|objections>`, `singu-detail-sheet`, `sidebar-empty-<causa>`.

Ícones (lucide, já no projeto): Briefcase, MessageCircle, Mail, Building2, Users, BadgeCheck; User, Instagram, Linkedin, Facebook, Twitter, Cake; Brain, Eye, BarChart3, UserRound, Hexagon, Flame, Target, Heart, GitBranch, DollarSign, Users, Link2, MessageSquareQuote. Sem SVG novo, sem emoji.

Tokens: só classes existentes (`bg-kpi-blue`, `bg-kpi-purple`, `bg-kpi-green` e `-fg`, `border-border`, `bg-card`, `text-muted-foreground`, `text-3xs`). Zero cor literal, zero token novo — mesma regra do `PLANO_PAINEL_DIREITO_TABBED.md` §0.

---

## 5. Sequência de entrega (uma PR por fase, cada uma reversível por `revert`)

| PR | Repo | Conteúdo | Merge |
|---|---|---|---|
| **A** | Singu_V2 | Migration com `get_contact_sidebar_by_phone` + grants + teste SQL | **Aberta, aguardando Joaquim** (DDL em produção; regra 8 do fluxo Git). Aplicada com o MCP oficial do projeto `pgxfvjmuubtbowutlide` só depois do OK. |
| **B** | Zapp_Web_V2 | Edge: `lookup:'sidebar'`, allowlist, `extractSidebarContactId`, testes Deno | Autonomia (edge function). Deploy via `deploy-functions.yml`. Só depois de A aplicada (a edge valida a RPC na allowlist, não no banco — mas a chamada falharia com 404 em produção). |
| **C** | Zapp_Web_V2 | `types/contactSidebar.ts`, `useContactSidebar`, `singuLabels`, testes unitários | Autonomia (front). Sem UI ainda — invisível em produção. |
| **D** | Zapp_Web_V2 | UI das 3 seções, remoção das seções antigas do accordion, header intacto, `Ctrl+T` fora, migração do `localStorage` | Autonomia (front). **Merge = produção (Vercel).** Visível mesmo com a flag desligada (seções 1–2 com fallback local; Perfil Singu com estado "Integração desligada"). |
| **E** | Zapp_Web_V2 | E2E do painel + evidência visual + a11y | Autonomia. |
| **F** | Zapp_Web_V2 | Remoção dos 13 órfãos + testes deles + docs | Autonomia, **depois** de D estar em produção por ≥ 1 dia útil sem rollback. |
| **Rollout** | banco do Zapp | `UPDATE feature_flags SET enabled = true WHERE key = 'crm.integration'` | **Joaquim decide (D1)**. Sem deploy; efeito em ≤ 5 min (cache da flag). Reversível com o mesmo UPDATE. |

---

## 6. Decisões de negócio (recomendação em negrito)

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Religar a integração CRM (`crm.integration`) em produção. Está desligada desde 09/09; sem ela o Perfil Singu e os dados Singu não aparecem. | (a) ligar junto com a PR D; (b) ligar depois de validar em homologação; (c) manter desligada. | **(b)**: ligar na Fase 9, depois de A+B+C+D no ar e da verificação com 5 contatos reais. Custo: zero. Risco: a edge já existe e já é chamada por outras telas quando a flag liga (CRM 360° Explorer, TalkX badge) — a etapa 93 mede o impacto. |
| D2 | Como obter os dados do Singu. | (a) RPC nova `get_contact_sidebar_by_phone`; (b) estender `get_contact_360_by_phone`; (c) várias consultas `select` por tabela via edge. | **(a)**: aditiva, não mexe no que o CRM 360° Explorer já usa, 1 chamada por contato, allowlist explícita. (b) muda contrato usado por `extractContact360Id`; (c) são 10 round-trips. |
| D3 | Perfil Singu nasce vazio para 99,8% dos contatos (A3). | (a) lançar com estado vazio honesto; (b) segurar a seção até o Singu ter avaliações; (c) lançar só a grade 2×3. | **(a)**: a seção é o incentivo para preencher no Singu; o estado vazio diz "Sem avaliação no Singu" e, quando houver URL do contato no Singu, um link "Abrir no Singu" (etapa 53 confirma a URL do Singu em produção). |
| D4 | Edição inline de e-mail/empresa/cargo (hoje na seção Informações, grava no Zapp). | (a) remover; editar só pelo diálogo "Editar contato"; (b) manter inline nas linhas da seção Profissional. | **(a)**: o mock é só leitura (copiar); o dado local está vazio (A5); Singu é a fonte. Quando o Singu não encontra o contato, a linha vazia vira link "Adicionar" que abre o diálogo existente. |
| D5 | X (Twitter): enum existe, 0 registros. | (a) linha sempre visível com "—"; (b) só quando houver. | **(a)**: o pedido lista X; consistência das 5 linhas. |
| D6 | Apagar os 13 componentes órfãos (A7). | (a) PR F separada; (b) na mesma PR D; (c) manter no repo. | **(a)**: D fica revertível sem ressuscitar 2.000 linhas; F é mecânica. |
| D7 | Contato não vinculado ao Singu (A6). | (a) estado "Não vinculado" + CTA "Buscar no CRM" (abre `ContactCRMDialog` existente); (b) só "—". | **(a)**: o diálogo já existe (`src/components/contacts/ContactCRMDialog.tsx`). |

---

## 7. Não fazer (fora do escopo, mesmo que apareça no caminho)

- Não mexer no header (`ContactHeaderSection`, `ContactActionButtons`, avatar, anel, chips) nem no painel central.
- Não editar dados do Singu a partir do Zapp (RPC é somente leitura; `mutate` da edge não entra).
- Não criar sync Zapp→Singu nem preencher `crm_contact_links`.
- Não mudar `get_contact_360_by_phone` nem `get_contact_intelligence_by_phone`.
- Não trazer CPF, endereço, notas pessoais, `family_info`, `hobbies`, scoring, RFM — não estão no pedido.
- Não unificar `data_nascimento`/`birthday` no Singu (vai para "Próximos passos" do relatório final).
- Não tocar em `src/components/ui/*` compartilhados.

---

## 8. As 100 etapas

Formato: **NN. Ação — Aceite (como se prova).** Fases 0 e 1 geram evidência; as demais geram código. Toda etapa de código termina com `npm run typecheck` e `npx vitest run <pasta>` verdes antes do commit.

### Fase 0 — Diagnóstico ao vivo e congelamento (sem código de produto)

01. Capturar o estado atual do painel em produção (3 contatos: um com empresa no Singu, um sem telefone no Singu, um sem conversa recente) — Aceite: 3 PNGs em `docs/design/evidence/sidebar-3-secoes/antes-*.png`.
02. Medir o payload atual da `contactLookup` (`'360'` e `'intelligence'`) para 5 telefones reais via edge (ambiente de QA, usuário `qa.visual`) — Aceite: tabela tamanho×latência no relatório da fase; confirma A2 (campos ausentes).
03. Confirmar as contagens de A3/A4 com a query do diagnóstico salva em `scripts/db-audit/singu-sidebar-coverage.sql` (read-only, roda no banco do Singu) — Aceite: números batem com a seção 1.3 ± 1%.
04. Confirmar em produção o valor de `VITE_CRM_INTEGRATION_ENABLED` no build da Vercel (`vercel env ls`) — Aceite: `true` em Production; se não, D1 ganha um pré-requisito e a etapa 92 inclui a variável.
05. Listar os `localStorage` que o painel usa (`contact-details-accordion-state`) e os consumidores de cada seção removida (A7) — Aceite: inventário em `docs/design/evidence/sidebar-3-secoes/orfaos.md` com `grep -rn` por item.
06. Verificar que a URL pública do Singu está definida (para "Abrir no Singu", D3) — Aceite: URL registrada no relatório ou "não existe" (então o CTA não entra).
07. Registrar as decisões D1–D7 tomadas pelo Joaquim no topo deste documento (data + escolha) — Aceite: seção 6 sem pendência.

### Fase 1 — RPC no banco do Singu (PR A, repo Singu_V2)

08. Criar branch `claude/feat-rpc-contact-sidebar-<AAMMDD-HHMM>` no Singu_V2 a partir de `main` — Aceite: branch no GitHub com 0 commits à frente.
09. Escrever `supabase/migrations/<ts>_get_contact_sidebar_by_phone.sql` com a função da seção 3.1 — Aceite: arquivo versionado; `SECURITY DEFINER`, `STABLE`, `SET search_path = public`.
10. Normalização do telefone: reaproveitar o bloco de `get_contact_intelligence_by_phone` (strip não-dígitos, remove DDI 55, busca por `numero_normalizado`/`numero_e164`/`numero`) — Aceite: teste SQL com `+55 (11) 9 8877-6655`, `11988776655`, `5511988776655` retornando o mesmo `contact_id`.
11. Excluir `deleted_at IS NOT NULL` e `is_duplicate = true`; quando houver duplicata, seguir `duplicate_of` — Aceite: teste SQL com contato marcado duplicado devolve o canônico.
12. Bloco `professional`: WhatsApp = `contact_phones WHERE is_whatsapp ORDER BY is_primary DESC, confiabilidade DESC NULLS LAST LIMIT 1`; e-mail = `contact_emails WHERE email_type='corporativo' ORDER BY is_primary DESC, is_verified DESC LIMIT 1`; empresa via `company_id`; `departamento`; `COALESCE(cargo, role_title)` — Aceite: 3 contatos reais com resultado conferido à mão no Singu.
13. Bloco `personal`: `contact_social_media WHERE is_active AND plataforma IN ('instagram','linkedin','facebook','x')`, 1 por plataforma (mais recente), `data_nascimento = COALESCE(data_nascimento, birthday)` — Aceite: contato com LinkedIn+Instagram devolve 2 itens; contato sem rede devolve `[]`.
14. Bloco `singu_profile.disc/vak/temperament` com fallback para `contacts.behavior` (jsonb) quando `contact_behavior`/`contact_personality` não têm linha — Aceite: um dos 7 contatos com `discProfile='C'` no jsonb devolve `disc.primary='C', confidence=95`.
15. Blocos `big_five`, `mbti`, `enneagram` de `contact_personality` — Aceite: inserir 1 linha de teste em transação com `ROLLBACK` e conferir o JSON.
16. Blocos `metaprograms`, `fears_motivation`, `decision`, `budget`, `influencers` (resolve nomes em `contacts`, máx. 5), `rapport`, `objection_scripts` (máx. 10, por `effectiveness_score DESC`) — Aceite: mesma técnica de transação com rollback para cada tabela.
17. `assessed_at = max(updated_at)` das 8 tabelas do perfil; `null` quando nenhuma tem linha — Aceite: contato sem avaliação devolve `null`; contato de teste devolve a data inserida.
18. `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role` — Aceite: `SELECT has_function_privilege('anon', 'get_contact_sidebar_by_phone(text)', 'EXECUTE')` = false.
19. Medir custo: `EXPLAIN ANALYZE` da função com 3 telefones — Aceite: < 50 ms cada no banco de produção (tabelas pequenas; sem índice novo). Se > 50 ms, listar o índice faltante no relatório, sem criá-lo nesta PR.
20. Medir tamanho: `length(get_contact_sidebar_by_phone(...)::text)` para o contato mais completo — Aceite: < 20 KB (limite da edge é 512 KB).
21. Teste de regressão SQL em `supabase/tests/` do Singu_V2 (pgTAP se existir; senão script `.sql` com `DO $$ … ASSERT …$$`) cobrindo 10–17 — Aceite: roda verde contra um banco local/branch.
22. Documentar a função em `docs/` do Singu_V2 (uma página: contrato 3.1 + consumidores: Zapp sidebar) — Aceite: arquivo criado.
23. Abrir a PR A como **draft**, título `feat(db): RPC get_contact_sidebar_by_phone para o sidebar do Zapp`, corpo com contrato, grants, medições (19–20) e a instrução "aplicar só após merge, com o MCP oficial do projeto" — Aceite: link da PR no relatório; **não mergear**.

### Fase 2 — Edge `crm-integration` (PR B)

24. Branch `claude/feat-crm-sidebar-lookup-<AAMMDD-HHMM>` no Zapp_Web_V2 a partir de `main` — Aceite: branch criada.
25. `crm-integration-contract.ts`: adicionar `get_contact_sidebar_by_phone` em `CRM_RPC_ALLOWLIST` e `allowedParams` (`p_phone`) — Aceite: teste existente `crm-integration-contract.test.ts` passa + caso novo para a RPC.
26. `extractSidebarContactId(value)` no contrato (lê `contact_id` quando `found`) — Aceite: 4 casos (found, not found, payload malformado, `contact_id` não-UUID → null).
27. `index.ts` `contactLookup`: aceitar `lookup:'sidebar'`; mapear para a RPC; aplicar a verificação de identidade com `crm_contact_links` usando a função de 26 — Aceite: `index.test.ts` ganha 3 casos (sidebar ok, mismatch 409, lookup inválido 400).
28. Manter o limite de 512 KB e o `withTimeout` — Aceite: teste de payload > 512 KB continua falhando com `CRM_RESPONSE_TOO_LARGE`.
29. Log estruturado `{event:'crm_sidebar_lookup', found, ms}` sem telefone nem nome — Aceite: grep no código do handler não encontra `phone` dentro do `console.error`/`log` novo.
30. `deno test` da pasta `supabase/functions/crm-integration` e `_shared` verde — Aceite: saída do comando no corpo da PR.
31. PR B draft, título `feat(crm-integration): lookup 'sidebar' → get_contact_sidebar_by_phone` — Aceite: CI verde. Merge só depois da PR A aplicada em produção (etapa 23 → OK do Joaquim).
32. Deploy da edge (`deploy-functions.yml`) e smoke: chamar `contactLookup` com `lookup:'sidebar'` para 1 contato real via sessão autenticada de QA — Aceite: resposta `found:true` com os 3 blocos; registrar o JSON (sem dados pessoais) na evidência.

### Fase 3 — Tipos, hook e dicionários (PR C)

33. Branch `claude/feat-sidebar-data-layer-<AAMMDD-HHMM>` — Aceite: branch criada.
34. `src/types/contactSidebar.ts` espelhando 3.1, com `null` explícito em cada bloco — Aceite: `tsc` verde; nenhum `any`.
35. Guard de URL `isSafeHttpUrl()` em `src/lib/urlSafety.ts` (aceita só `http(s)://`, rejeita `javascript:`, `data:`) — Aceite: 6 testes unitários.
36. `src/lib/singuLabels.ts`: dicionários DISC (D/I/S/C → nome + descrição), VAK (visual/auditory/kinesthetic → pt-BR), MBTI (16 tipos → apelido pt-BR), Eneagrama (1–9 → nome), Temperamento (sanguineo/colerico/melancolico/fleumatico), Metaprogramas (10 eixos → rótulo + leitura "Foco em resultados" quando `toward > away_from` etc.), Autoridade (`budget_authority` → "Aprovador final" / "Precisa de aprovação" / …) — Aceite: valores copiados dos tipos do Singu_V2 (`src/types/index.ts`, `enneagram.ts`, `temperament.ts`); teste garante que valor desconhecido devolve o cru.
37. `summarizeMetaprograms()` em `singuLabels.ts`: dos 10 scores, produz até 2 leituras de 1 linha (ex.: "Foco em resultados, pró-ativo") — Aceite: 5 casos de teste incluindo empate (não emite leitura).
38. `src/hooks/crm/useContactSidebar.ts` conforme 3.3 (`status` derivado) — Aceite: testes com `QueryClientProvider` cobrindo `disabled`, `loading`, `not_found`, `error`, `ok`.
39. `ExternalCRMService.getContactSidebar(contactId)` chamando `callCRMIntegration('contactLookup', { contactId, lookup: 'sidebar' })` — Aceite: teste com mock de `callCRMIntegration`.
40. Fallback local: `buildProfessionalFallback(contact, enrichedData)` → `{ whatsapp: contact.phone, email: contact.email, empresa: enrichedData.company, cargo: enrichedData.job_title, departamento: null }` — Aceite: teste com `enrichedData` parcial (mesma técnica de `editContactShape.test.ts`).
41. `formatBirthday(iso)` → `{ label: 'dd/MM/yyyy', age: number | null }` com `date-fns` (`ptBR`), idade nula para data inválida/futura — Aceite: testes para 14/03/1985 (idade 41 em 02/10/2026), ano bissexto, data futura.
42. PR C draft, título `feat(sidebar): camada de dados do Perfil Singu (tipos, hook, rótulos)` — Aceite: CI verde; merge por autonomia (sem UI).

### Fase 4 — Estrutura das 3 seções (PR D, parte 1)

43. Branch `claude/feat-sidebar-3-secoes-ui-<AAMMDD-HHMM>` — Aceite: branch criada.
44. `sidebar/sidebarSections.ts`: `SIDEBAR_SECTIONS = [professional, personal, singu]`, `DEFAULT_OPEN_SECTIONS = ['professional','personal','singu']`, `getStoredAccordionState()` lendo a chave antiga, descartando valores fora das 3 e gravando na chave nova `contact-sidebar-accordion-state@v2` — Aceite: testes: storage antigo com `['info','tags']` → default; `['personal']` → `['personal']`; storage indisponível → default.
45. `SidebarSection.tsx`: card colapsável (`AccordionItem`), tile 28 px com tom (`bg-kpi-blue|purple|green` + `-fg`), título 14 px semibold, subtítulo 12 px muted, chevron Radix; `aria-controls`/`aria-expanded` vêm do Radix — Aceite: teste de render + snapshot de classes; sem cor literal (`grep -E '#[0-9a-f]{3,6}|rgb\('` vazio na pasta).
46. `SidebarRow.tsx`: grid `[16px_120px_1fr_auto]`, valor `truncate` com `title` completo, ação `copy` (botão 24 px, `aria-label="Copiar <rótulo>"`, `toast.success('<rótulo> copiado!')`), ação `external` (`<a target="_blank" rel="noopener noreferrer">`, `aria-label="Abrir <rótulo>"`), valor vazio → "—" em `text-muted-foreground` e sem botão — Aceite: 6 testes (copy chama `navigator.clipboard.writeText`; external só renderiza com URL segura).
47. `SidebarEmpty.tsx`: ícone 40 px em círculo `bg-muted/20`, frase, CTA opcional (`Button variant="outline" size="sm"`) — Aceite: teste de render com e sem CTA.
48. `ContactSidebarSections.tsx`: monta as 3 seções dentro do `Accordion` existente; recebe `contact`, `enrichedData`, resultado de `useContactSidebar` — Aceite: render com `status:'ok'` mostra 3 `data-testid="sidebar-section-*"`; com `status:'disabled'` mostra 3 também (1–2 com fallback, 3 com vazio "Integração desligada").
49. `ContactDetails.tsx`: trocar `ContactAccordionSections` por `ContactSidebarSections`; usar `sidebarSections.ts`; **remover** o handler `Ctrl+T`; manter `Esc`, `EditContactDialog`, `onCollapseAll` — Aceite: diff do arquivo ≤ 30 linhas; teste existente de `Esc` (se houver em `ChatPanel`/`ContactDetails`) verde.
50. Garantir que `ContactHeaderSection`, `ContactActionButtons`, `ContactDetailsResponsive` e `RealtimeInboxView` não mudam — Aceite: `git diff --stat` não lista esses arquivos.
51. Animação de entrada: reaproveitar `sectionVariants` (stagger 0,08 s) só nas 3 seções — Aceite: `prefers-reduced-motion` desliga (já tratado globalmente? etapa confirma com `grep reduce` em `index.css`; se não, usar `useReducedMotion` do framer).

### Fase 5 — Dados Profissionais (PR D, parte 2)

52. `ProfessionalSection.tsx`: 5 `SidebarRow` na ordem WhatsApp, E-mail corporativo, Empresa, Departamento, Cargo — Aceite: teste de ordem por `getAllByTestId(/sidebar-row-/)`.
53. WhatsApp: valor formatado `(11) 98877-6655` a partir de `numero_e164` (helper existente de formatação de telefone no projeto — localizar em `src/lib/formatters.ts`; se não houver, criar `formatPhoneBR`), ações copiar + abrir `https://wa.me/<E164 sem +>` — Aceite: teste com `+5511988776655`.
54. E-mail: ações copiar + `mailto:`; `is_verified` mostra `BadgeCheck` 12 px com tooltip "Verificado no Singu" — Aceite: teste com/sem verificado.
55. Empresa: `CompanyLogo` existente (`src/components/contacts/CompanyLogo.tsx`) 16 px + nome; ação copiar — Aceite: teste com `logo_url` nulo cai no fallback de iniciais.
56. Departamento e Cargo: texto simples, ação copiar — Aceite: teste.
57. Fonte do dado: `sidebar.professional` quando `status:'ok'`; senão `buildProfessionalFallback` (etapa 40). Linha com dado local mostra tooltip "Dado local do Zapp" no rótulo — Aceite: teste `status:'not_found'` com `contact.email` preenchido mostra o e-mail e o tooltip.
58. Linha vazia **e** `status !== 'ok'` → valor vira link "Adicionar" que dispara `onQuickAction('edit')` (abre o `EditContactDialog` existente) — Aceite: teste clica e verifica callback.
59. `status:'not_found'` → `SidebarEmpty` **abaixo** das linhas com "Contato não vinculado ao Singu" + CTA "Buscar no CRM" (abre `ContactCRMDialog` existente; só quando `crmEnabled`) — Aceite: teste de render.
60. Subtítulo da seção: "Informações da sua vida profissional" (mock) — Aceite: texto exato no teste.

### Fase 6 — Dados Pessoais (PR D, parte 3)

61. `PersonalSection.tsx`: 5 linhas na ordem Instagram, LinkedIn, Facebook, X, Data de nascimento — Aceite: teste de ordem.
62. Redes: valor = `@handle` (Instagram/X) ou `/caminho` (LinkedIn/Facebook) derivado de `url` quando `handle` for nulo; ação `external` com `url` validada por `isSafeHttpUrl` — Aceite: 4 testes (um por rede) + 1 com URL `javascript:` não renderiza link.
63. Sem rede → "—" sem ação (D5) — Aceite: teste.
64. Data de nascimento: `dd/MM/yyyy` + "N anos" à direita (`text-muted-foreground`), via `formatBirthday` — Aceite: teste com 14/03/1985.
65. Aniversário no mês corrente → ícone `Cake` em `text-warning` com tooltip "Aniversário este mês" — Aceite: teste com data mockada (`vi.setSystemTime`).
66. `status !== 'ok'` → 5 linhas com "—" + `SidebarEmpty` ("Contato não vinculado ao Singu" ou "Integração desligada" conforme `status`) — Aceite: teste para os dois status.
67. Subtítulo: "Conecte-se nas redes e saiba mais sobre a pessoa" — Aceite: texto exato.

### Fase 7 — Perfil Singu (PR D, parte 4)

68. `SinguProfileTile.tsx`: 2 colunas, `min-h-[64px]`, ícone 20 px, nome 12 px, valor 11 px muted, `Progress` 4 px (`h-1`) só quando houver métrica (3.4) — Aceite: teste com e sem barra; `aria-label` da barra = "<nome>: N%".
69. `SinguProfileSection.tsx`: grade 2×3 na ordem DISC, VAK, Big Five, MBTI, Eneagrama, Temperamento; tile sem dado mostra "Não avaliado" e ícone em `text-muted-foreground/40` — Aceite: teste com perfil nulo renderiza 6 tiles "Não avaliado".
70. DISC: `primary` + nome (`DISC_LABELS`), `blend` entre parênteses, barra = `confidence` — Aceite: teste com `{primary:'D', blend:'DI', confidence:80}` → "D · Dominante (DI)", barra 80.
71. VAK: nome pt-BR do canal primário, barra = score do primário — Aceite: teste.
72. Big Five: traço de maior score → "Alta <traço>" (≥ 70), "Média <traço>" (40–69), "Baixa <traço>" (< 40); barra = `confidence` — Aceite: 3 testes de faixa.
73. MBTI: `type` + apelido pt-BR; barra = intensidade (3.4) — Aceite: teste com eixos `[80,50,90,55]` → intensidade 40.
74. Eneagrama: "Tipo N – Nome" + "asa W" quando houver; barra = `scores[type]` se existir — Aceite: 2 testes.
75. Temperamento: `primary` (+ `secondary` em muted); sem barra — Aceite: teste garante ausência de `Progress`.
76. 7 linhas (`singu-row-*`) com rótulo, prévia de 1 linha e chevron; prévia: Metaprogramas = `summarizeMetaprograms`; Medos/Motivação = `main_fear` (truncado 40) ou `motivation_primary`; Estilo de decisão = `speed` + 1º critério; Autoridade = rótulo de `budget.authority`; Influenciadores = nomes separados por vírgula (máx. 2 + "+N"); Rapport = `notes` truncado ou `preferred_triggers[0]`; Scripts = tipos de objeção únicos (máx. 3) — Aceite: 7 testes de prévia + 7 com dado nulo → "—" e chevron desabilitado.
77. `SinguProfileDetailSheet.tsx`: `Sheet` lateral (`side="right"`, `w-[400px]`, mobile `w-full`), título = rótulo da linha, conteúdo por tipo: Metaprogramas = 5 pares de eixos com 2 barras opostas + `notes`; Medos/Motivação = 4 campos; Decisão = velocidade, critérios em chips, aprovação + aprovador; Autoridade = autoridade, papel, poder (barra 1–10); Influenciadores = lista com nome + cargo; Rapport = 4 scores de canal em barras + listas de gatilhos/âncoras/resistências + notas; Scripts = cards por objeção com viés neurológico e `effectiveness_score` — Aceite: 7 testes de render, 1 por tipo; `Esc` fecha sem fechar o painel (reaproveitar a regra de `defaultPrevented` já comentada em `ContactDetails.tsx:40-50`).
78. Rodapé da seção: "Avaliado em dd/MM/yyyy" (de `assessed_at`) ou "Sem avaliação no Singu" — Aceite: teste para os dois casos.
79. Estados da seção inteira: `disabled` → `SidebarEmpty` "Integração com o Singu desligada" (sem CTA); `not_found` → "Contato não vinculado ao Singu" + CTA "Buscar no CRM"; `error` → "Não foi possível carregar o perfil" + CTA "Tentar de novo" (`refetch`); `loading` → 6 `Skeleton` + 7 linhas skeleton; `ok` sem nenhum bloco → "Sem avaliação no Singu" + CTA "Abrir no Singu" se a URL existir (etapa 06) — Aceite: 5 testes, um por estado.
80. Subtítulo: "Análise comportamental e estilo de comunicação" — Aceite: texto exato.

### Fase 8 — Fechamento da PR D, E2E e evidência (PR D + PR E)

81. Remover de `ContactAccordionSections.tsx`/`contactDetailSections.ts` todo uso; apagar os dois arquivos — Aceite: `grep -rn "ContactAccordionSections\|contactDetailSections"` em `src` vazio; `tsc` verde.
82. `npm run lint` com ratchet (`scripts/ci/lint-ratchet.mjs`) — Aceite: `novas: 0`.
83. `npx vitest run src/components/inbox` inteira — Aceite: verde; os testes dos componentes órfãos continuam existindo nesta PR (saem na F).
84. Bundle: `VITE_CRM_INTEGRATION_ENABLED=true bun run build` + `node scripts/ci/bundle-budget.mjs` — Aceite: dentro do orçamento; registrar os números no corpo da PR (espera-se queda, por remover 13 componentes do grafo lazy).
85. Capturas "depois" dos mesmos 3 contatos da etapa 01 (QA, Playwright headless, tema escuro) — Aceite: PNGs em `docs/design/evidence/sidebar-3-secoes/depois-*.png`, lado a lado com os "antes" no corpo da PR.
86. Medição Playwright: largura do painel 323 px, altura de cada linha ≥ 28 px, alvo dos botões de ação ≥ 24 px, contraste do texto muted ≥ 4,5:1 (`axe` já é dependência) — Aceite: números no corpo da PR.
87. Mobile (viewport 390×844): painel abre como `Sheet` inferior, 3 seções visíveis, `SinguProfileDetailSheet` ocupa a largura toda — Aceite: 1 PNG.
88. PR D draft, título `feat(sidebar): painel do contato com 3 seções (Profissional, Pessoal, Perfil Singu)`, corpo com decisões D1–D7, evidências 85–87, lista das seções removidas — Aceite: CI verde; merge por autonomia (front) **após** C em `main`.
89. Verificar deploy Vercel do merge de D (`github_list_workflow_runs` + URL de produção) e abrir o painel em produção com usuário de QA — Aceite: 3 seções visíveis; sem erro no console; registrar no relatório.
90. PR E: `e2e/inbox-contact-sidebar.spec.ts` — abre conversa, confere 3 seções, copia WhatsApp (clipboard mockado), abre e fecha o `Sheet` de Metaprogramas com `Esc` sem fechar o painel, confere estado vazio do Perfil Singu para o contato `[E2E]` (não existe no Singu → "Contato não vinculado"); roda no `e2e-logado.yml` — Aceite: verde no CI em Chromium; `fixme` documentado para Firefox/WebKit só se reproduzir o problema de portal já conhecido (`conversation.spec.ts:58-62`).

### Fase 9 — Rollout controlado (D1) e verificação em produção

91. Confirmar PR A aplicada no banco do Singu pelo Joaquim (ou aplicar com o MCP oficial após o OK) — Aceite: `SELECT proname FROM pg_proc WHERE proname='get_contact_sidebar_by_phone'` retorna 1 linha em `pgxfvjmuubtbowutlide`.
92. Merge da PR B e deploy da edge — Aceite: smoke da etapa 32 em produção.
93. Antes de ligar a flag: medir o que mais acorda com `crm.integration = true` (CRM 360° Explorer, badge TalkX, `useExternalContact360` no header) — Aceite: lista em `docs/design/evidence/sidebar-3-secoes/flag-impacto.md`; nenhum item com erro conhecido aberto.
94. Ligar a flag em horário de baixo uso (`UPDATE feature_flags SET enabled = true WHERE key = 'crm.integration'`) — Aceite: `SELECT enabled` = true; hora registrada.
95. Verificação com 5 contatos reais (com e sem Singu, um dos 7 com DISC) — Aceite: tabela contato×seção×resultado no relatório; o contato com DISC mostra "C · Conforme" com barra 95.
96. Observar por 60 min: logs da edge (`crm_sidebar_lookup`), erros no Sentry do Zapp, latência p95 da RPC — Aceite: p95 < 800 ms ponta a ponta; 0 erros 5xx. Falhou → desligar a flag (mesmo UPDATE) e abrir incidente no relatório.
97. Atualizar `docs/CRM360_TECHNICAL_DOCS.md` (RPC nova, hook novo, seção "Painel lateral") e `docs/design/INBOX_360_STATUS.md` — Aceite: diff só em docs; vai na PR F.

### Fase 10 — Limpeza (PR F) e encerramento

98. PR F: apagar os 13 órfãos (A7) + `WhatsAppStatusSection.test.tsx`, `ContactInfoSection.test.tsx`, `StoryViewer` se ficar sem consumidor; manter `AnalysisBadges`, `ContactPurchasesPanel`, `Contact360Helpers`/`ExternalContact360Panel`/`ContactIntelligencePanel` só se ainda tiverem consumidor (re-grep) — Aceite: `tsc` + `vitest` + lint ratchet verdes; `git diff --stat` só com remoções e docs.
99. Atualizar `docs/design/PAINEL_STATUS.md` com a nota "02/10/2026 — painel passa a 3 seções (este plano)" e marcar `PLANO_PAINEL_DIREITO_TABBED.md` como histórico também para o accordion — Aceite: diff em docs.
100. Relatório final neste arquivo (seção 9): link das 6 PRs + estado, SHAs, números das etapas 19/20/84/86/96, 3 "Próximos passos" reais — Aceite: Joaquim lê e sabe exatamente o que está em produção.

---

## 9. Relatório de execução

_(preenchido ao final; vazio enquanto o plano não for executado)_

---

## 10. Próximos passos (fora deste plano, já vistos no caminho)

1. **Unificar `data_nascimento` e `birthday` no Singu** — hoje são dois campos para o mesmo dado; 9 preenchidos no total · banco do Singu, `contacts`.
2. **Importar aniversário e cargo do Bitrix** — o Perfil Pessoal nasce vazio para 99,8% dos contatos; o Bitrix tem o dado · sync Bitrix → Singu.
3. **Corrigir o tipo `Contact360Data` do Zapp** — promete campos que a RPC nunca devolve (A2); o CRM 360° Explorer e o header dependem disso · `src/types/contact360.ts`, `ExternalContact360Panel`.
