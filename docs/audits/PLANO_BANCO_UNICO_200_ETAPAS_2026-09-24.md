# Plano de Banco Único — ZAPP Web V2 → Singu (Gestão de Clientes)
**200 etapas · 24/09/2026 · base: main `64ab7e15` do Zapp_Web_V2 + estado real dos dois bancos**

---

## 1. O que existe hoje (medido, não estimado)

| | ZAPP Web V2 (self-hosted, VPS) | Singu / Gestão de Clientes (Supabase Cloud) |
|---|---|---|
| Tabelas | 144 (todas com RLS) | 392 (1 sem RLS) |
| Funções SQL | 135 | 1.283 (85 SECURITY DEFINER) |
| Triggers | 90 | 430 |
| Edge functions | 67 | 46 (22 sem verificação de JWT) |
| Tamanho | 139 MB | 2,2 GB |
| Usuários auth | 5 (3 admin, 2 agent) | 13 logins (12 vendedores + adm) |
| Dado principal | 3.039 contatos WhatsApp · 45.947 mensagens · 221 grupos · 1.601 threads de e-mail | 57.675 empresas · 48.623 clientes · 4.495 contatos · 10.461 interações · 48.615 scores RFM · 754 fornecedores · 114 transportadoras |

**Cruzamento real:** de 400 contatos recentes do WhatsApp, 75 (19%) já existem como contato no CRM e 16 (4%) batem com telefone de empresa. ~77% do WhatsApp é gente que o CRM não conhece.

**Colisão de nomes (24 tabelas existem nos dois bancos com estruturas diferentes):** automations, campaigns, contact_notes, **contacts**, conversation_analyses, csat_surveys, feature_flags, ip_whitelist, knowledge_base_articles, login_attempts, message_templates, notifications, nps_surveys, password_reset_requests, permissions, products, **profiles**, query_telemetry, reminders, role_permissions, scheduled_reports, sla_rules, tags, **user_roles**. Por isso o ZAPP vai para um schema próprio (`zapp`) dentro do Singu — não dá para despejar as 144 tabelas em `public`.

## 2. Como o acesso funciona hoje no Singu (o problema real)

- `customers`, `suppliers`, `carriers`, `contact_phones`, `company_phones` e mais **74 tabelas**: qualquer pessoa logada vê **tudo** — e pode **apagar**. É o oposto do que você pediu.
- `companies` e `contacts`: regra `auth.uid() = user_id` (modelo de SaaS "dono da linha"). **53.842 das 57.675 empresas têm `user_id` vazio** → invisíveis para todo mundo pelo app; só o service_role enxerga. Contatos: 100% pertencem a 2 usuários.
- `user_roles` tem **0 linhas** → `has_role()` é sempre falso → ninguém é admin pelo banco.
- A carteira existe (`customers.vendedor_id`, chave inteira do Bitrix) mas **nenhuma policy usa isso**. Não há ponte entre o ID do Bitrix (inteiro) e o login (uuid) — só o e-mail em `salespeople`.
- Carteira: 6 vendedoras com 5.4k–5.8k clientes cada; **~13.500 clientes sem vendedor** (nome preenchido, id vazio: "Murilo Free" 7.978, "Gabriel TI" 4.083, "Caio TI" 409…); 4 logins de vendedor sem correspondência no Bitrix (comercial02, 08, 09, cad01); Vanessa aparece com dois IDs (16 e 20).
- Fornecedores homologados: **0 de 754**. Transportadoras homologadas: **0 de 114**. O campo `homologado` não serve como gate de "liberado" hoje.
- Políticas duplicadas: `contacts` tem 10 policies para a mesma regra (3 gerações sobrepostas).

## 3. Riscos críticos encontrados (corrigir antes de qualquer migração)

1. **`exec_sql(query text)` é SECURITY DEFINER e executável pelo `anon`** — qualquer pessoa com a chave pública do projeto roda SQL arbitrário como dono do banco. Gravidade máxima. **[FEITO 24/09 — PR #44 mergeada]**
2. `execute_readonly_query` executável por qualquer logado. **[FEITO 24/09 — PR #44 mergeada]**
3. `decrypt_connection_config` / `encrypt_connection_config` executáveis pelo `anon`. **[FEITO 24/09 — PR #44 mergeada]**
4. 78 funções SECURITY DEFINER chamáveis pelo `anon`, 82 por logados — a maioria são trigger functions que nunca deveriam ser expostas. **[FEITO 24/09 — PR #45 aberta aguardando aprovação; anon 75→9, authenticated 80→10, restantes são fluxos públicos legítimos por token]**
5. `abm_account_plans` sem RLS. **[FEITO 24/09 — PR #44 mergeada]**
6. 22 edge functions sem verify_jwt (bitrix24-proxy, evolution-proxy, bling-proxy, lusha-proxy, cloudflare-proxy…).
7. `users` (espelho Bitrix, com `bitrix_data` jsonb) legível por qualquer logado.
8. Leaked-password protection desligada no Auth.
9. `pg_net` no schema public; `vw_singu_data_health` SECURITY DEFINER. **[vw_singu_data_health FEITO 24/09 — PR #44 mergeada; pg_net ainda pendente, etapa 21]**

## 4. Modelo-alvo (decisão de arquitetura)

**Identidade:** `auth.users` do Singu é o único login. ZAPP autentica lá.
**Papel global** (`app_role`): `admin · supervisor · vendedor · sdr · atendente · colaborador`.
**Departamento** (N:N, `user_departments`): Comercial, Compras, Logística, Financeiro, Administrativo/DP, Arte/Design, Produção, TI, Diretoria.
**Ponte Bitrix:** `profiles.bitrix_user_id` → `current_bitrix_user_id()` usada pelas policies.
**Liberação comercial:** coluna nova `liberado_comercial` em `suppliers` e `carriers` (homologação continua sendo processo de Compras/Logística; liberação é o que o vendedor vê).
**Uma função de autorização** `can_access(entidade, company_id, modo)` + tabela de configuração `department_entity_access` editável pelo admin — regra muda sem deploy.
**Acesso vem de três fontes, somadas:** (1) carteira — vendedor/sdr; (2) departamento — a matriz abaixo; (3) **contexto** — quem está com um item de trabalho ligado ao cliente enxerga o cliente enquanto o item durar: conversa transferida para a fila do departamento, pedido/entrega/ocorrência aberta, cobrança em aberto, ou liberação pontual concedida por supervisor (`company_access_grants`, com prazo e motivo, auditada). Contexto dá visão **restrita** (nome, telefone, empresa, o item em si, a conversa) — nunca carteira, RFM, propostas, ticket médio ou dados pessoais sensíveis. É assim que Logística fala com um cliente sobre uma entrega sem ver a carteira comercial.
**ZAPP** vive no schema `zapp` do Singu; contatos WhatsApp viram `public.contacts` (1 pessoa = 1 contato, N telefones); atendimento vira `zapp.conversations` (tabela que hoje não existe — o estado da conversa mora dentro de `contacts`).

### Matriz de acesso (seed inicial)

| Departamento | Empresas | Contatos | Clientes (carteira) | Fornecedores | Transportadoras | Colaboradores |
|---|---|---|---|---|---|---|
| Comercial (vendedor/sdr) | só da carteira RW | da carteira + os que ele mesmo abriu no WhatsApp RW | própria RW | liberados R | liberadas R | — |
| Comercial (supervisor) | todas do departamento RW | todas RW | todas RW + transferir | liberados R | liberadas R | — |
| Compras | as `is_supplier` RW | dos fornecedores RW | — | todos RW + liberar | — | — |
| Logística | as `is_carrier` RW | das transportadoras RW | — | — | todas RW + liberar | — |
| Financeiro | `is_customer` R | — (sem PII) | todas R | — | — | — |
| DP/Administrativo | Promo Brindes | colaboradores RW | — | — | — | RW |
| Arte/Produção | de pedidos abertos R | de pedidos abertos R | — | — | — | — |
| TI/Diretoria | tudo | tudo | tudo | tudo | tudo | tudo |

## 5. Decisões que só você pode tomar (marcadas `[decisão]` nas etapas)

1. ~~Gate de fornecedor/transportadora~~ **DECIDIDO 24/09: coluna nova `liberado_comercial` em `suppliers`/`carriers`, controlada por Compras/Logística.** Etapas 49–50 liberadas.
2. ~~Destino dos ~13.500 clientes sem vendedor~~ **DECIDIDO 24/09: pool livre, visível a todos do Comercial.** Etapa 77 liberada.
3. Conflito: cliente do WhatsApp cuja empresa está na carteira de outro vendedor — bloqueia e transfere, ou atende e notifica.
4. Pipeline: usar `deals`/`pipeline_stages` do Singu (3 negócios) e descartar `sales_deals` do ZAPP (0 linhas).
5. ~~Custo Supabase Cloud~~ **DECIDIDO 24/09: aprovado sem teto definido.** Dimensiono buckets/realtime/compute (Fase 4, etapas 93/102/103) pelo necessário e reporto o custo real assim que estiver rodando, em vez de orçar antes.
6. Staging: branch do Supabase para testar tudo antes de produção (custo por hora).
7. WhatsApp→Bitrix: hoje há dois caminhos (`evolution-bitrix-connector` no Singu e fluxo do ZAPP) — fica um.
8. Fonte de "pedidos abertos" para Arte/Produção (Bitrix? projeto de pedidos?) — define o escopo desses departamentos.

9. Colisão de enum `channel_type` (existe nos dois bancos, etapa 101): renomear o do ZAPP (`zapp.channel_type`) ou unificar valores — decide o formato da migration da etapa 101.
10. MFA: Supabase Auth nativo não cobre passkey/WebAuthn da mesma forma que `passkey_credentials` do ZAPP. Aceitar downgrade para TOTP/OTP nativo, ou manter passkey via extensão própria (etapa 47).

**Decisões 1, 2 e 5 resolvidas em 24/09 → Fase 3 destravada.** Falta decisão 4 (trava etapa 155) e decisões 7/8 (travam 179/191) para liberar o resto. Decisão 6 (staging) ainda não tomada — Fase 4 (DDL do schema `zapp`) e Fase 5 (migração de dados) dependem dela para a etapa 8.

## 8. Validação do plano — gaps encontrados (24/09, antes de executar)

Simulação de cenários contra as 200 etapas. Achados reais, já incorporados acima/abaixo — nada de genérico:

1. **Revoke sem inventário de chamador (etapas 9–11).** Revogar `exec_sql`/`execute_readonly_query` antes de saber quem os chama hoje (N8N, Workers, edge functions) pode quebrar algo em produção sem aviso. **Fix:** nova etapa **8b** — `query_logs`/`audit_log` (302k linhas) filtrado por essas duas funções, 30 dias, lista de chamadores reais, antes da 9.
2. **Etapa 12 (classificar 78 SECDEF) é decisão manual sobre 78 funções sem plano de verificação pós-revoke.** Revogar uma função pública legítima por engano derruba um formulário público (deal room, buyer flow) sem alarme. **Fix:** nova etapa **12a** — checklist dos fluxos públicos conhecidos (`submit_public_form`, `get_deal_room_by_token`, `buyer_*`) testados manualmente logo após a revogação em massa.
3. **Etapa 71 ("resto entra em can_access") não enumera as 74 tabelas abertas — só as ~20 nomeadas em 58–70 têm RLS explícita no plano.** Risco real de esquecer tabela na correção. **Fix:** etapa 71 vira lista nominal rastreável (planilha/tabela no cérebro), não "o resto"; etapa 84 (suíte de teste RLS) precisa cobrir as 392 tabelas, não só as da matriz da seção 4.
4. **Sem regra de conflito no dedupe de contato (etapa 121).** Quando um contato do WhatsApp bate com um contato existente do CRM, qual campo vence (nome, notas, campos customizados)? Não definido. **Fix:** nova etapa **121a** — regra: CRM vence em dado cadastral (nome, CNPJ/CPF, empresa); WhatsApp vence em dado de atendimento (nickname, last_seen, consent); notas de ambos concatenam.
5. **Sem plano de rollback para a fusão de dados em si (Fase 5), só para o cutover do app (etapa 196–197).** Depois que dados do ZAPP entram em tabelas compartilhadas de produção (`contacts`, `profiles`) que outros usuários do Singu já usam, reverter não é trocar env var. **Fix:** nova etapa **138a** — toda linha inserida/alterada pela migração de dados carrega `migration_batch_id`; rollback = `DELETE/UPDATE WHERE migration_batch_id = X` documentado e testado no dry-run (etapa 136).
6. **Nenhuma reverificação de segurança depois do cutover real (etapa 195), só depois do DDL em staging (etapa 118).** **Fix:** nova etapa **197a** — advisors de segurança + suíte RLS (etapa 84) rodam de novo em produção após a etapa 195, antes de encerrar a janela.
7. **Conflito de nome `evolution-proxy` (etapa 173) sem decisão registrada.** Adicionado como decisão 9 acima — mesma raiz do conflito de enum.
8. **Decisão 5 (custo) só travava Fases 3 e 5, mas Fase 4 já gera o custo** (buckets de mídia + realtime publication, etapas 93/102/103) antes da decisão estar tomada. Corrigido na frase de dependências acima.

Nenhum desses gaps muda a arquitetura-alvo (seção 4) nem o número de fases — são reforços pontuais nas etapas existentes, para não haver retrabalho no meio da execução.

## 9. Execução — Fase 1 (24/09)

- **PR #44 (mergeada):** `exec_sql`, `execute_readonly_query`, `decrypt_connection_config`/`encrypt_connection_config` revogados de anon/authenticated; `abm_account_plans` com RLS ligada; `vw_singu_data_health` com `security_invoker=on`; `search_path` fixado em 3 funções utilitárias.
- **PR #45 (aberta, aguardando aprovação):** etapas 12/13 — 31 trigger functions + 34 funções internas/IDOR-risco com EXECUTE revogado de anon/authenticated/public. Migration `t202` revogou de anon/authenticated mas não de `public`; gap fechado pela migration `t203` no mesmo PR (toda function ganha EXECUTE a PUBLIC por padrão na criação — revogar só de anon/authenticated não fecha o acesso se public ainda tem grant). Advisors: anon 75→9, authenticated 80→10 (restantes são fluxos públicos legítimos por token + `has_role`, usada em RLS).
- **PR #7 (dependabot, Singu_V2):** conflito de merge — não resolvido, aguardando decisão sua (mesclar manualmente ou fechar).
- Etapas 12a (checklist dos fluxos públicos pós-revoke) e 8b (inventário de chamadores via query_logs) ainda não feitas.
- Etapas 17–26 (leaked-password, edge functions sem verify_jwt, rotação de chaves, pg_net, policies duplicadas, roles={public}→{authenticated}, view users_public) não iniciadas.

---

## 6. As 200 etapas

Legenda: **[SEC]** segurança · **[DB]** banco · **[APP]** front Zapp_Web_V2 · **[DATA]** migração de dados · **[INFRA]** VPS/Edge/cron · **[aprovação]** PR fica aberta esperando você (regra 8) · **[decisão]** depende do item 5.

### Fase 0 — Congelamento e baseline (1–8)
1. Backup lógico completo do Singu (pg_dump) + confirmar PITR ativo antes de qualquer DDL. [DB][aprovação]
2. Backup do ZAPP self-hosted (pg_dump + objetos dos 7 buckets). [INFRA]
3. Congelar migrations que criam tabela no Zapp_Web_V2 durante o projeto; só fixes. [APP]
4. Script Node no container `claude-code` que exporta tabelas/colunas/policies/funções dos dois bancos e versiona em `claude-cerebro` — baseline para comparar cada fase. [INFRA]
5. Rebuild do grafo (`graphify update`) — report está em `af1d5b65`, main já é `64ab7e15`. [APP]
6. Mapa tabela → arquivos consumidores no ZAPP (89 usos de `contacts`, 72 `profiles`, 70 `messages`…) gerado pelo grafo. [APP]
7. Inventário de todo `functions.invoke`, URL do self-hosted hardcoded no front, N8N e Evolution. [INFRA]
8. Criar branch do Supabase no Singu como staging de DDL/RLS. [DB][decisão 6]

### Fase 1 — Contenção de segurança no Singu (9–26)
9. `REVOKE EXECUTE` de `exec_sql` para anon/authenticated/public. Hoje. [SEC] **[FEITO]**
10. Idem `execute_readonly_query`. [SEC] **[FEITO]**
11. Idem `decrypt_connection_config` e `encrypt_connection_config`. [SEC] **[FEITO]**
12. Classificar as 78 SECDEF expostas ao anon: (a) públicas legítimas — `submit_public_form`, `increment_form_view`, `track_magnet_download`, `buyer_*`, `get_deal_room_by_token`; (b) trigger functions; (c) internas. Revogar b e c. [SEC] **[FEITO — PR #45]**
13. Revogar EXECUTE em bloco de toda função que retorna `trigger` (nunca deve ser chamável por API). [SEC] **[FEITO — PR #45]**
14. `ALTER TABLE abm_account_plans ENABLE ROW LEVEL SECURITY` (já tem 3 policies escritas). [SEC] **[FEITO]**
15. `vw_singu_data_health` → `security_invoker = on` ou revogar de authenticated. [SEC] **[FEITO]**
16. `SET search_path` em `normalizar_cnpj`, `title_case_pt`, `title_case_pt_aux`. [SEC] **[FEITO]**
17. Ligar leaked-password protection no Auth do Singu. [SEC]
18. Auditar as 22 edge functions com `verify_jwt=false`: as que não têm secret próprio ganham JWT ou header `x-internal-secret`. [SEC][INFRA]
19. Rotacionar toda chave (service_role, anon) que estava em N8N/Workers apontando para `exec_sql`. [SEC][aprovação]
20. Varrer `audit_log` (302k) e `error_logs` (1.983) por chamadas rpc anônimas suspeitas — evidência de exploração. [SEC]
21. Mover `pg_net` para schema `extensions`. [DB]
22. Consolidar policies duplicadas (contacts: 10 → 4; companies: 7 → 4; interactions: 10 → 4; deals: 8 → 4). [DB]
23. Trocar `roles={public}` por `{authenticated}` em toda policy. [DB]
24. `users` (Bitrix): view `users_public(id, name, email, departamento, is_vendedor, is_active)` para authenticated; tabela só service_role. [SEC]
25. Manter `feature_flags.crm.integration=false` até o cutover (etapa 148 remove o gate). [APP]
26. Tudo desta fase como migration versionada (verificar qual repo GitHub versiona o Singu; se nenhum, criar `singu-db`). [DB] **[FEITO — repo é `Singu_V2`, migrations em `supabase/migrations/`]**

### Fase 2 — Identidade única e papéis (27–48)
27. ADR: `auth.users` do Singu = identidade única; ZAPP passa a logar no Singu. [DB]
28. `profiles.bitrix_user_id integer` (FK `users.id`); popular pelos 12 `salespeople.auth_user_id` + e-mail. [DB]
29. Resolver os 4 sem match (comercial02/08/09, cad01) e a Vanessa duplicada (ids 16 e 20) e Henrique (17 × comercial02). [DATA][decisão]
30. Criar login para os 10 colaboradores ativos do Bitrix sem auth (23 ativos − 13 logins), um por departamento. [DB]
31. Enum `app_role` unificado: `admin, supervisor, vendedor, sdr, atendente, colaborador`; mapa ZAPP (admin, supervisor, agent, special_agent) e Singu (admin, manager, salesperson, moderator, user). [DB]
32. Popular `user_roles` no Singu (hoje 0 linhas). [DATA]
33. `zapp.agent_settings(user_id, max_chats, access_level, signature, can_download, department_id)` recebe os campos de atendimento dos 5 `profiles` do ZAPP. [DB]
34. `departments` canônica no Singu (estrutura do ZAPP, seed a partir de `users.departamento`: Comercial 7, Compras 3, Arte/Design 3, Administrativo 3, Financeiro 2, TI 2, Produção 1, Diretoria 1, Logística 1). [DB]
35. `user_departments(user_id, department_id, is_lead)`. [DB]
36. Trigger em `auth.users`: novo login → profile + role `colaborador` + sem departamento (acesso zero até admin liberar). [DB]
37. `current_bitrix_user_id()` STABLE SECURITY DEFINER com search_path fixo — base das policies de carteira. [DB]
38. `current_departments()` retorna set de `department_id`. [DB]
39. Uma só `is_admin()` / `is_supervisor(department_id)` (ZAPP tem `is_admin_or_supervisor`, Singu tem `has_role`). [DB]
40. Índices: `profiles(bitrix_user_id)`, `user_roles(user_id, role)`, `user_departments(user_id)`. [DB]
41. Policies de `user_roles`/`profiles`/`user_departments`: leitura própria + admin; escrita admin. [DB]
42. Matriz de permissões única a partir de `permissions`/`role_permissions` (ZAPP 42 linhas, Singu 63). [DATA]
43. `user_has_permission()` reimplementada sobre a matriz única (ZAPP chama 3×). [DB]
44. `get_visible_agent_ids()` reimplementada: supervisor vê agentes dos seus departamentos; admin vê todos. [DB]
45. Tela Admin > Usuários do ZAPP edita role, departamentos e vínculo Bitrix. [APP]
46. Marcar: login no self-hosted desligado no cutover (etapa 195). [INFRA]
47. MFA/passkeys do ZAPP (`passkey_credentials`, `mfa_sessions`, `user_devices`) → MFA nativo do Supabase Auth no Singu. [APP][DB]
48. Invalidar todas as sessões na troca de projeto (`session_invalidated_at`). [APP]

### Fase 3 — Autorização por carteira e departamento (49–92)
49. `suppliers.liberado_comercial boolean default false`. [DB] **[decisão 1 resolvida]**
50. `carriers.liberado_comercial boolean default false`. [DB] **[decisão 1 resolvida]**
51. `department_entity_access(department_id, entity, mode none|read|write, scope all|own|carteira|liberados|contexto)` — configuração, não código. [DB]
51a. `company_access_grants(company_id, user_id, granted_by, reason, expires_at)` — liberação pontual por supervisor; `can_access` considera grant vigente + fila da conversa + pedido/entrega/cobrança aberta como "contexto". [DB]
52. Seed da matriz da seção 4. [DATA]
53. `can_access(entity text, company_id uuid, mode text) returns boolean` STABLE SECURITY DEFINER — única função que toda policy chama. [DB]
54. Índices `customers(vendedor_id) where deleted_at is null`, `customers(sdr_id)`, `customers(company_id)`. [DB]
55. `contacts(company_id) where deleted_at is null`. [DB]
56. Índices parciais `companies(id) where is_supplier`, `where is_carrier`, `where is_customer`. [DB]
57. `suppliers(company_id, liberado_comercial)`, `carriers(company_id, liberado_comercial)`. [DB]
58. RLS `customers`: carteira (`vendedor_id`/`sdr_id` = `current_bitrix_user_id()`) OR supervisor Comercial OR admin OR Financeiro leitura. Sai o "qualquer logado". [DB]
59. RLS `companies`: `can_access('companies', id, …)` substitui `auth.uid() = user_id` (que esconde 53.842 empresas). [DB]
60. RLS `contacts`: empresa visível OR (`company_id` nulo AND `owner_id` = eu) OR escopo do departamento. [DB]
61. RLS `contact_phones/emails/addresses/social_media`: herdam de `contacts` via EXISTS. [DB]
62. RLS `company_phones/emails/addresses/social_media/cnaes`: herdam de `companies`. [DB]
63. RLS `suppliers`: Compras RW total; demais só `liberado_comercial` leitura. [DB]
64. RLS `carriers`: Logística RW total; demais só liberadas leitura. [DB]
65. RLS `interactions`: segue contato/empresa, não `user_id`. [DB]
66. RLS `customer_ownership_history`, `customer_events`, `customer_sdr_history`: seguem `customers`. [DB]
67. RLS `deals`, `proposals`, `sales_*`, `pipeline_stage_transitions`: vendedor dono OR supervisor Comercial. [DB]
68. RLS `company_rfm_scores`, `rfm_analysis`, `rfm_history`: seguem `companies`. [DB]
69. RLS `salespeople`, `sales_team_members`: leitura Comercial; escrita admin. [DB]
70. RLS `workspace_accounts`: DP RW; demais leitura de nome/e-mail via view. [DB]
71. Classificar as 74 tabelas com SELECT aberto: catálogo interno (cnaes, cidades, estados, tags, configs) fica aberto; o resto entra em `can_access`. [DB]
72. Remover DELETE de vendedor em `customers/companies/contacts`; exclusão vira soft-delete por RPC auditada. [DB]
73. View `contacts_safe` sem cpf, data_nascimento, family_info, personal_notes para departamentos não-comerciais; grant por coluna. [DB]
74. Garantir que mudança de `customers.vendedor_id` grava trilha em `audit_log` (transferência de carteira). [DB]
75. `transfer_portfolio` só supervisor/admin (hoje qualquer logado executa). [SEC]
76. `redistribute_portfolio*`, `rebalance_portfolio`, `redistribute_admin_portfolio`: idem. [SEC]
77. Destino dos ~13.500 clientes sem `vendedor_id` (Murilo Free 7.978, Gabriel TI 4.083, sem nome 745, Caio TI 409, A definir 138, Leandro 135…). [DATA] **[decisão 2 resolvida: pool livre]**
78. Reatribuir carteira de inativos (`[LEGADO] SDR 1` 3, Andressa 4). [DATA]
79. Regra: contato aberto pelo WhatsApp sem empresa pertence ao atendente até ser vinculado; ao vincular, herda a carteira. [DB]
80. Regra de conflito WhatsApp × carteira de outro vendedor. [DB][decisão 3]
81. `search_contacts`, `search_contacts_advanced`, `search_contacts_fuzzy`, `get_contact_360_by_phone`: SECURITY INVOKER (respeitam RLS) ou filtro interno com `can_access`. [DB]
82. `find_contacts_by_role`, `get_contacts_by_role`, `search_contacts_unaccent`: idem. [DB]
83. Views `vw_*` que expõem empresas: `security_invoker = on`. [DB]
84. Suíte de teste de RLS: para cada perfil (set role + jwt claims) conta linhas visíveis por tabela — matriz esperada × obtida, roda no CI. [DB]
85. Teste com Letícia (carteira 5.770): vê 5.770 clientes, suas empresas e contatos, fornecedores liberados, zero transportadora não liberada. [DB]
86. Teste com Compras (Thaina), Logística (Thiago), DP, Financeiro. [DB]
87. `EXPLAIN ANALYZE` na listagem de `companies` (57k) e `customers` (48k) por vendedora — meta < 100 ms. [DB]
88. Se estourar a meta: materializar `user_company_access(user_id, company_id)` com refresh por trigger em customers/suppliers/carriers/user_departments. [DB]
89. Policies de storage no Singu: documento de empresa só para quem vê a empresa. [DB]
90. `companies.user_id` / `contacts.user_id` deixam de ser critério de acesso (viram `created_by`). [DB]
91. Matriz final documentada no cérebro e no repo. [INFRA]
92. Advisors de segurança do Singu = 0 erros antes de seguir. [SEC]

### Fase 4 — Schema `zapp` no Singu (93–118)
93. `CREATE SCHEMA zapp` + expor no PostgREST (`db-schemas`). [DB][aprovação]
94. Classificar as 144 tabelas: (A) fundem com Singu — contacts, profiles, user_roles, permissions, role_permissions, departments, tags, contact_tags, contact_notes, products, feature_flags; (B) vão como estão para `zapp` — messages, conversation_*, whatsapp_*, talkx_*, queues*, team_*, email_*, stickers, audio_memes, calls, campaigns, chatbot_*, followup_*, sla_*; (C) morrem — crm_contact_links, crm_sync_outbox, sicoob_contact_mapping, contact_purchases, sales_deals, sales_pipeline_stages, external-db*. [DB]
95. Criar `zapp.conversations(id, contact_id→public.contacts, whatsapp_connection_id, channel_type, kind person|group, assigned_to, queue_id, status, status_changed_at, ai_priority, ai_sentiment, last_message_at)` — separa pessoa de atendimento. [DB]
96. `zapp.messages.conversation_id` (+ `contact_id` mantido durante a transição). [DB]
97. DDL das tabelas B a partir de `pg_dump --schema-only` do self-hosted, com FKs reapontadas para `public.contacts`/`auth.users`. [DB]
98. Portar as 135 funções do ZAPP para `zapp.`; ajustar as que leem `contacts.assigned_to` → `conversations`. [DB]
99. Portar os 90 triggers. [DB]
100. Portar índices + novos: `conversations(assigned_to, status)`, `messages(conversation_id, created_at desc)`. [DB]
101. Enums do ZAPP em `zapp` (colisão: `channel_type` existe nos dois). [DB]
102. Realtime: publication para `zapp.messages`, `zapp.conversations`, `zapp.notifications`. [DB]
103. Buckets no Singu: whatsapp-media, audio-messages, stickers, audio-memes, custom-emojis, avatars, team-chat-files — com policies. [DB]
104. `public.contacts` recebe só campos de pessoa que o ZAPP tem e o CRM não (nickname, lead_origin, consent_status); campos de atendimento não entram. [DB]
105. `contact_phones.numero_e164` + `is_whatsapp` = chave de dedupe com o jid do WhatsApp. [DB]
106. `contact_identity_map` (LID↔JID) → `zapp.contact_identity_map` ligada a `contact_phones`. [DB]
107. `tags`: fundir com as 10 do Singu usando `scope crm|atendimento`. [DB]
108. `contact_notes`: usar a do Singu (já comentada "ZAPP WEB"). [DB]
109. `feature_flags`: usar a do Singu (vazia); migrar as 2 flags. [DB]
110. `profiles` do ZAPP → `zapp.agent_settings` (etapa 33). [DB]
111. `departments.whatsapp_mode/api_key/instance_id` → `zapp.department_channels`. [DB]
112. `queues`, `queue_members` em `zapp`; `profile_id` → `auth.uid`. [DB]
113. RLS em `zapp.*`: conversa visível ao `assigned_to`, membros da fila, supervisor do departamento, admin — mesma lógica da `contacts_select_policy` atual. [DB]
114. RLS `zapp.messages` herda de `conversations`. [DB]
115. `generate_typescript_types` incluindo schema `zapp`. [APP]
116. DDL inteiro aplicado na branch de staging (etapa 8) e validado. [DB]
117. DDL em produção — PR aberta esperando você. [DB][aprovação]
118. Advisors security + performance após o DDL. [SEC]

### Fase 5 — Migração de dados (119–142)
119. Script de migração idempotente em Node (container `claude-code`, sem python), log por tabela, checksum de contagem. [DATA]
120. Migrar os 5 usuários do ZAPP → uuid do Singu por e-mail (mapa `zapp.user_migration_map`). [DATA]
121. Contatos (3.039): dedupe por E.164 contra `contact_phones` e `contacts.whatsapp`; ~19% viram merge, o resto insere com `source='whatsapp'` e `owner_id` = atendente. [DATA]
122. `zapp.contact_migration_map(old_id, new_contact_id, match_type)`. [DATA]
123. Gerar `zapp.conversations` a partir dos campos de atendimento de cada contato antigo. [DATA]
124. Mensagens (45.947) com remap `contact_id → conversation_id`; `external_id` único. [DATA]
125. `conversation_events` (3.232), `conversation_sla` (1.394), reações, whisper, tasks, snoozes, closures. [DATA]
126. Grupos (221) → `conversations.kind='group'` + mensagens de grupo. [DATA]
127. Mídia: copiar objetos dos buckets self-hosted → Singu (S3 API), reescrever `media_url`. [DATA]
128. Stickers (783), audio_memes (542), custom_emojis, favoritos. [DATA]
129. E-mail: threads (1.601), messages (1.936), attachments (1.547), labels (24); `gmail_accounts` re-autoriza OAuth. [DATA]
130. Talk X: campanhas, templates, variantes, segmentos, blacklist, recipients. [DATA]
131. Filas, membros, `agent_stats`, `warroom_alerts` (355), `audit_logs` (1.087). [DATA]
132. Configs: business_hours, away_messages, auto_close, sla_rules/configurations, global_settings, geo_blocking, `ai_providers` (4 — chaves viram secrets). [DATA]
133. `whatsapp_connections` (1) apontando para a Evolution certa (ver `zapp-infra`). [DATA]
134. Relatório origem × destino por tabela. [DATA]
135. 20 conversas amostrais abertas no app novo: texto, mídia, áudio, reação renderizam. [DATA]
136. Dry-run completo em staging; medir tempo (meta: janela < 2 h). [DATA]
137. Modo manutenção no ZAPP na janela. [INFRA]
138. Delta: mensagens/contatos com `created_at` > marca do dry-run. [DATA]
139. `ANALYZE` + reindex no Singu após a carga. [DB]
140. Conferir defaults/sequences/uuid. [DB]
141. Dump final do self-hosted guardado 90 dias. [INFRA]
142. De-para e decisões registrados no cérebro. [INFRA]

### Fase 6 — Zapp_Web_V2 para banco único (143–172)
143. Branch `claude/feat-banco-unico-<AAMMDD-HHMM>`; uma PR por módulo. [APP]
144. `src/integrations/supabase/client.ts`: URL/anon do Singu. [APP]
145. Helper `zapp()` = `supabase.schema('zapp')`; codemod no container troca `.from('messages')` etc. (70 usos de messages, 89 de contacts, 72 de profiles). [APP]
146. Inbox: `contacts.assigned_to/queue_id/conversation_status` → `zapp.conversations` (RealtimeInboxView, useRealtimeMessages, ConversationTabs, useConversationHistoryTimeline). Maior refactor. [APP]
147. `useAuth`/`useUserRole` → profiles Singu + `user_roles` unificado + `agent_settings`. [APP]
148. Remover `crm-integration`, `externalClient.ts`, `useExternalDB`, `useCRMIntegrationEnabled`, `crmIntegration.ts`, `external-crm.service.ts`, `useSyncToCRM`, outbox, `VITE_CRM_INTEGRATION_ENABLED`. [APP]
149. CRM 360° Explorer reescrito sobre `public.*` direto (34 abas); guarda por departamento, não admin-only; some o card "Não Configurado". [APP]
150. Crm360Tab do Inbox lê `customers/deals/interactions/company_rfm_scores` reais (hoje lê `sales_deals`/`contact_purchases` vazias). [APP]
151. Ficha do contato no Inbox: empresa, vendedor da carteira, segmento RFM, últimas compras, ticket médio. [APP]
152. Busca global: `search_contacts_advanced` com RLS (empresa + contato + telefone). [APP]
153. Módulo Contatos = cadastro CRM (companies + contacts) filtrado por carteira; criar contato exige empresa ou fica como "aberto pelo WhatsApp". [APP]
154. Módulo Carteira sobre `customers`/`customer_ownership_history` + RPC `transfer_portfolio`. [APP]
155. Pipeline sobre `deals`/`pipeline_stages` do Singu. [APP][decisão 4]
156. Talk X: segmentos consultam RFM/customers reais. [APP]
157. Catálogo: `products` do Singu (10) × ZAPP — catálogo PromoGifts continua vindo do projeto Gestão de Produtos via proxy. [APP]
158. Dashboard: atendimento sobre `zapp.*`, comercial sobre `public.*`. [APP]
159. Admin: telas de roles, departamentos, matriz `department_entity_access`, liberação de fornecedor/transportadora. [APP]
160. Telas simples de Fornecedores e Transportadoras: lista + toggle `liberado_comercial` (Compras/Logística). [APP]
161. Tela DP: colaboradores (`workspace_accounts` + contatos da Promo Brindes). [APP]
162. Remover código morto de gate e do external-db. [APP]
163. Testes existentes ajustados (`Crm360Tab.test`, `useContactCrm360.test`, `AiTab.test`). [APP]
164. Types regenerados; `tsc --noEmit` e lint verdes. [APP]
165. Preview Lovable da branch apontando para a branch de staging do Singu. [APP]
166. Smoke E2E: login, inbox recebe e envia, transfere conversa, abre ficha, busca empresa, vendedor não vê carteira alheia. [APP]
167. Teste negativo de permissão por perfil no app (etapa 84 na UI). [APP]
168. Performance: lista de conversas < 300 ms; realtime estável com N agentes. [APP]
169. Merge por ordem: client → auth → inbox → contatos/CRM → admin. [APP]
170. Env de produção do Lovable (URL/anon) — merge = produção. [APP][aprovação]
171. 24 h de monitoramento de erros. [APP]
172. Aposentar `inbox.status-fsm` se `conversations` a tornar obsoleta. [APP]

### Fase 7 — Edge functions, cron, webhooks, integrações (173–186)
173. Deploy das 67 edge functions do ZAPP no Singu; resolver conflito de nome (`evolution-proxy` já existe no Singu). [INFRA]
174. Secrets migrados e rotacionados (Evolution, Gmail OAuth, AI providers, CRON_SECRET). [INFRA][aprovação]
175. Webhook da Evolution (instância do ZAPP) apontado para a URL nova — momento do cutover. [INFRA]
176. `evolution-webhook`: grava em `zapp.messages` + upsert de contato via `contact_phones` (E.164). [INFRA]
177. Os 8 cron jobs do ZAPP recriados no `pg_cron` do Singu (SLA, auto-close, scheduled_messages, followups, reports, cache cleanup…). [INFRA]
178. Workflows N8N que apontam para o self-hosted → Singu (inventário da etapa 7). [INFRA]
179. Um só caminho WhatsApp → Bitrix. [INFRA][decisão 7]
180. Sync Bitrix (`bitrix-extract-companies`, `sync_log` 1.545): `vendedor_id` continua vindo do Bitrix e reflete na carteira em minutos. [INFRA]
181. Desligar `external-db-proxy`/`external-db-bridge`. [INFRA]
182. Portar `edge_rate_limits` e `webhook_rate_limits`. [INFRA]
183. Conexões realtime simultâneas (agentes × abas) dentro da cota do plano. [INFRA] **[decisão 5 resolvida: sem teto, dimensionar pelo necessário]**
184. `health-monitor` do Singu passa a cobrir `zapp` (falhas de webhook, fila de envio). [INFRA]
185. PITR ativo no Singu. [INFRA] **[decisão 5 resolvida: sem teto, dimensionar pelo necessário]**
186. `query_telemetry` unificada. [INFRA]

### Fase 8 — Departamentos e operação (187–194)
187. DP: colaboradores = contatos da empresa Promo Brindes (matriz SP + Goiás) + `workspace_accounts`; policy RW só DP/admin. [DB]
188. Compras: fluxo de homologação (`supplier_homologations`, 0 linhas) + toggle de liberação; Comercial é notificado quando fornecedor é liberado. [APP][DB]
189. Logística: idem para transportadoras (`carrier_homologations`); Rodonaves/Total Express já integradas. [APP][DB]
190. Financeiro: leitura de `customers` (ticket médio, total comprado) sem PII de contato. [DB]
191. Arte/Produção: escopo por pedido aberto — depende da fonte de pedidos. [DB][decisão 8]
192. Supervisor Comercial: vê e transfere carteira de todos os vendedores do departamento. [APP]
193. Doc "quem vê o quê" para a equipe. [INFRA]
194. Relatório mensal automático de acessos fora de carteira (a partir de `audit_log`). [INFRA]

### Fase 9 — Cutover e descomissionamento (195–200)
195. Janela: manutenção ON → delta → webhook → env prod → smoke → manutenção OFF. Checklist assinado. [INFRA][aprovação]
196. Rollback: env antigo + webhook antigo em standby por 7 dias. [INFRA]
197. 7 dias de self-hosted somente leitura; depois parar a stack Supabase do ZAPP no Swarm. [INFRA][aprovação]
198. Remover MCP `SUPABASE - ZAPP WEB V2`, secrets antigos, rotas Traefik/DNS do self-hosted. [INFRA]
199. PR de limpeza no repo: crm360 legado, external-db, migrations antigas arquivadas. [APP]
200. ADR "banco único" + `repos-mapping.md` atualizado: Zapp_Web_V2 = front do Singu. [INFRA]

---

## 7. Ordem e dependências

- Fase 1 é independente e **urgente** (etapas 9–11 hoje).
- Fase 2 destrava 3; 3 destrava 4; 4 destrava 5 e 6 em paralelo; 7 acompanha 6; 8 depois de 6; 9 fecha.
- Decisões 1, 2 e 5 travam a Fase 3 e a Fase 5 — **resolvidas em 24/09**. Decisão 4 trava a etapa 155. Decisões 7 e 8 travam 179 e 191.
- Tudo que é DDL em produção, secret, stack do Swarm ou custo fica em PR aberta esperando você (regra 8).
