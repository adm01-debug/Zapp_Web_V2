# Área 04 — Contatos / CRM 360 / SalesView / Journey + E-mail (Gmail)

Varredura somente leitura sobre `main` @ `99aa53f` (11/10/2026). Toda afirmação de "existe/não existe" foi conferida no código com grep/leitura; quando o artefato depende de banco vivo, outro repositório (Singu_V2) ou deploy, está marcado **não verificável (NV)**. Nenhum arquivo do repositório foi alterado.

---

## 1. Fontes lidas

| Caminho | Tipo | Nº etapas/itens | Data | Vigente/substituído |
|---|---|---|---|---|
| docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md | plano | 100 (+ D1–D6) | 29/09 (atualizado 02/10) | vigente (99/100 declarado) |
| docs/audits/FECHAMENTO_PLANO_CONTATOS_2026-10-01.md | status/fechamento | B1–B7 | 01/10 | parcialmente superado pelo de 02/10 |
| docs/audits/FECHAMENTO_PLANO_CONTATOS_2026-10-02.md | status/fechamento | — | 02/10 | vigente (com tabela interna desatualizada) |
| docs/audits/AUDITORIA_MODULO_CONTATOS_2026-09-29.md | auditoria (origem do plano 100) | — | 29/09 | absorvida no plano 100 |
| docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md | plano | 50 | 27/09 | substituído (encerrado; 24 pendências absorvidas no plano 100) |
| docs/design/PLANO_REDESIGN_CONTATOS_NAVY_100_ETAPAS.md | plano | 100 | 07–08/09 | concluído (status) |
| docs/design/REDESIGN_CONTATOS_STATUS.md | status | CP0–CP12 | 08/09 + bloco 29/09 | histórico |
| docs/plans/PROMPT_IMPLEMENTACAO_REDESIGN_CONTATOS_ZAPP_WEB_V2.md | spec/prompt | 74 seções / 13 fases | commit 08/10 (conteúdo de set.) | substituído (executado via Navy + plano 100; ainda cita Lead/Sicoob Gifts) |
| docs/plans/PLANO_CONTATOS_POR_JORNADA_2026-10-08.md | plano | 130 (CT-001–CT-130) | 08/10 | **vigente** |
| docs/audits/CONTATOS_IMPACTO_VISIBILIDADE_2026-10-08.md | estudo (CT-022) | 1 | 08/10 | vigente |
| docs/design/PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md | plano | 100 (+ D1–D7) | 02/10 | vigente (status desatualizado) |
| docs/design/evidence/sidebar-3-secoes/orfaos.md | evidência | — | 02–04/10 | — |
| docs/design/PLANO_SALESVIEW_JOURNEY_50_ETAPAS_2026-10-02.md | plano + placar | 50 (S01–S50) | 02/10 (reconc. 06/10) | vigente |
| docs/design/salesview-journey/ (VERIFICACAO_S38_S41_S42_S43 + 18 PNG) | evidência | — | 02–06/10 | — |
| docs/reconciliation/reports/modules/SALESVIEW_JOURNEY.md | reconciliação | 50 + SV-001..004 | 03/10 (baseline 2e7cf81) | ponto de partida |
| docs/plans/PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS_2026-10-07.md | plano + cartões | 100 (S001–S100) + K01–K11 + J01–J20 | 07/10 | **vigente** |
| docs/design/MODULO_CONTATOS_CRM360_SALESVIEW.md | spec/inventário | 12 riscos | 09/10 | vigente |
| docs/CRM360_TECHNICAL_DOCS.md | spec técnica | — | ago/set | defasado |
| docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md | prompt | 6 tarefas | ago | histórico |
| docs/crm-external-grants.md | runbook/segurança | GATE C / F97 (5 passos) | 01/10 | vigente |
| docs/runbooks/CRM_INTEGRATION_ROLLOUT.md | runbook | 4 fases | set | vigente |
| docs/reconciliation/RECONCILIACAO_OTH-015_CONTATOS_LEGADOS_2026-10-05.md | reconciliação | 1 | 05/10 | fechado |
| docs/reconciliation/reports/modules/OTHER_MODULES.md (Contatos/Email) | reconciliação | OTH-003/005/006/013/014/015 | 03/10 | ponto de partida |
| docs/design/PLANO_EMAIL_NAVY_100_ETAPAS_2026-10-02.md | plano | 100 EN / 80 AC | 02/10 | vigente (cores substituídas por #1793) |
| docs/design/EMAIL_NAVY_IMPLEMENTATION_EVIDENCE_2026-10-02.md | status/evidência | 80 AC | 02–03/10 | vigente |
| docs/design/EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md | evidência | EN-088 | 05/10 | vigente |
| docs/design/PLANO_EMAIL_SIDEBAR_CONTATO_50_ETAPAS_2026-10-03.md | plano + matriz OTH-013 | 50 (ES-01–ES-50) | 03/10 | vigente (checklist desatualizado) |
| docs/plans/PLANO_EMAIL_ALERTAS_NAO_LIDO_12_ETAPAS_2026-10-07.md | plano | 12 (U01–U12) | 07/10 | vigente |
| docs/plans/PLANO_EMAIL_LINK_CONTATO_14_ETAPAS_2026-10-07.md | plano | 14 (E01–E14 / L06–L09) | 07/10 | vigente |
| docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md (itens 071–076, 081–083) | plano | 9 itens da área | 01/09 | sem decisão de prioridade |
| docs/audits/AUDITORIA_A11Y_MOBILE_CONTATOS_CRM_2026-10-07.md (Y14) | auditoria | 11 achados | 07/10 | vigente |
| docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md (Y24) | auditoria | 9 achados | 07/10 | vigente |
| docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv (linhas CRM360/Contatos/E-mail) | inventário | ~45 linhas | 07/10 | ponto de partida |
| docs/plans/SEGUNDA_LEVA_CARTOES_2026-10-08.tsv / PENDENCIAS_DO_DONO_2026-10-08.md | cartões/handoff | ~12 da área | 08/10 | vigente |
| .github/workflows/crm-sync-worker.yml, .env.production, supabase/deployment-manifest.json | config | — | — | — |
| Código: src/components/{contacts,crm360,email,gmail,inbox/contact-details,inbox/tabs}, src/hooks/{crm,contacts,gmail,chat/journey,integrations}, src/lib/journey, src/services/crm, supabase/functions/{crm-integration,gmail-*}, migrations de contatos | código | — | HEAD 99aa53f | — |

---

## 2. Placar por plano

Critério: "concluído" = artefato encontrado no código/repo (não basta checkbox); NV = depende de banco vivo, deploy, outro repo ou validação visual que não dá para provar daqui. Planos de checklist sem caixas por etapa (Email NAVY) usam os 80 critérios de aceite como proxy.

| Plano | Total | Concluído (verif.) | Parcial | Não iniciado | Bloqueado | Não verificável |
|---|---|---|---|---|---|---|
| Contatos 100 etapas (29/09) | 100 | 97 | 1 (94) | 0 | 1 (11) | 0 — +1 DIVERGENTE (95) |
| Melhorias Contatos 50 (27/09, encerrado) | 50 | 50 (26 + 24 absorvidas no plano 100) | 0 | 0 | 0 | 0 |
| Redesign Contatos Navy 100 | 100 | 100 (87 + 5 equivalentes + 5 decisões + 3 correções) | 0 | 0 | 0 | 0 — 1 divergência ("Sincronizar") |
| Contatos por jornada CT-001–CT-130 (08/10) | 130 | 3 (CT-002, CT-005, CT-022) | 21 | 105 | 1 (CT-114) | 0 |
| Sidebar do contato 3 seções (02/10) | 100 | 60 | 2 | 9 | 4 | 25 (fase 1 é no repo Singu_V2) |
| SalesView + Journey 50 (02/10) | 50 | 42 (inclui S38 obsoleto) | 7 | 0 | 0 | 1 (S50) |
| Journey histórico completo S001–S100 (07/10) | 100 | 28 (só camada lib/teste) | 8 | 64 | 0 | 0 |
| Journey fase K (K01–K11) | 11 | 0 | 0 | 11 | 0 | 0 |
| Email NAVY (80 AC como proxy de EN-001..100) | 80 | 78 | 0 (+2 EN residuais parciais: EN-025, EN-088) | 0 | 2 (AC-002, AC-010) | 0 (+1 advisors ADV-1) |
| Email sidebar contato/empresa ES-01–ES-50 (03/10) | 50 | 42 | 4 | 2 | 2 | 0 |
| Email alertas não lido U01–U12 (07/10) | 12 | 2 | 0 | 7 | 0 | 3 |
| Email link do contato E01–E14 (07/10) | 14 | 5 | 2 | 2 | 0 | 5 |
| Rollout integração CRM (runbook, 4 fases) | 4 | 1 | 1 | 0 | 2 | 0 |
| GATE C / F97 (grants anon no CRM externo, 5 passos) | 5 | 0 | 1 | 0 | 4 | 0 |
| Prompt Lovable CRM 360 (6 tarefas) | 6 | 4 (3 feitas + 1 obsoleta) | 0 | 2 | 0 | 0 |
| Paridade V1/V3 — itens da área (071,073,074,081,082,083) | 6 | 1 (071 obsoleta) | 2 | 3 | 0 | 0 |
| Auditoria a11y Y14 (11 achados) | 11 | 0 | 1 | 3 | 0 | 7 |
| Auditoria RLS Y24 (9 achados) | 9 | 0 | 0 | 9 | 0 | 0 |
| Auditoria W4 performance (W4-1, W4-4, W4-6) | 3 | 0 | 1 | 2 | 0 | 0 |

---

## 3. Pendências detalhadas

### 3.1 Plano Contatos 100 etapas (29/09)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| C100-11 | Desligar Sicoob Bridge (D2) | BLOQUEADO | D2 = desligar; trigger dropado e edges removidas | Trigger dropado (`20260929380000`); fontes só arquivados em `docs/edge-functions-recovered/sicoob-bridge*`; edges **seguem publicadas** e toleradas em `supabase/deployment-manifest.json:15` (`orphan_allowlist`) | Apagar `sicoob-bridge` e `sicoob-bridge-reply` do projeto remoto e tirar da allowlist | Duas funções esquecidas no ar (a `-reply` faz chamada externa à Sicoob) — superfície de ataque sem uso | P2 | Admin do Supabase (Joaquim) |
| C100-94 | Seção "Contatos" no CLAUDE.md | PARCIAL | 6 linhas: tipos canônicos, decisão Sicoob, exclusão via RPC, `include_legacy`, fonte de ícone/cor | `CLAUDE.md:577-582` só tem critério de visibilidade/`include_legacy` | 4 linhas (6 tipos, Sicoob, `delete_contact`, `contactTypeConfig.tsx`) | Próximos agentes podem reintroduzir tipo extinto ou exclusão direta | P3 | Aprovação do Joaquim (hook de arquivo protegido) |
| C100-95 | Runbook exclusão/legados | DIVERGENTE | DoD: "2 receitas SQL **testadas**" | `docs/runbooks/contatos-exclusao-e-legados.md` existe e está `[x]`; fechamento 01/10 lista **B4 — receitas não testadas por execução** (FECHAMENTO_01/10:234) e nunca foi baixado | Executar as 2 receitas em banco local e registrar | Restaurar contato excluído hoje é SQL manual não testado | P3 | Banco local |

### 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

Contexto medido: só existem o contrato Singu (`src/types/contactSingu.ts`, `src/services/crm/singu-adapter.ts` — **sem nenhum consumidor**), a chave `contacts.v2` (`src/hooks/contacts/useContactsV2Flags.ts`, lida em `ContactsView.tsx:28-43` com o comentário "as telas v2 ainda não existem") e o estudo CT-022. Nenhuma migration de contatos após 01/10; última migration do repo é `20261009180000`.

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| CT-001 | Medição inicial cliques/segundos | NAO_INICIADO | Linha de base "3 cliques/5 s" | nada encontrado | Medir antes de mudar | Sem baseline, não há como provar ganho | P2 | — |
| CT-003 | 150+ contatos de teste no banco local | NAO_INICIADO | Seed local realista | sem seed em `supabase/` | Criar seed | Testes visuais/filtros sem dados reais | P2 | zapp-db-local |
| CT-004 | Fixtures Singu canônicas | PARCIAL | Fixtures completo/incompleto/longo | amostra em `src/services/crm/singu-adapter.mock.ts:8-40` ("fixtures canônicas chegam no CT-004") | Fixtures definitivas | — | P3 | CT-002 |
| CT-006–CT-010 | Card/lista/tabela v2 (9 campos Singu), fonte/contraste, toolbar 1 linha no celular, estados "Singu indisponível" | NAO_INICIADO | Nova experiência mobile-first | Card v1 (`ContactCard.tsx`) sem cargo/depto/RFM/último pedido/tempo sem comprar | Implementar telas v2 atrás de `contacts.v2.*` | Vendedor não vê situação comercial do cliente na lista | P1 | CT-002/005 |
| CT-011 | Busca na 1ª letra com destaque | PARCIAL | Nome do contato ou empresa, destaque | `search_contacts` (7 colunas OR) + `HighlightText.tsx` | Medir resposta "na hora"; busca só nome+empresa | — | P3 | — |
| CT-012–CT-017 | Filtros do Singu (banco por telefones, Edge, combinação, folha inferior, cargo/depto, opções vindas do Singu) | NAO_INICIADO | Filtrar lista local por vendedor/ramo/RFM/UF via Singu | Só filtros locais empresa/cargo/tag/período (`ContactAdvancedFilters.tsx:90-157`) | RPC local por telefones + ação na `crm-integration` + UI | Vendedor não consegue segmentar carteira pelos dados do CRM | P1 | Singu (CT-111) para cargo/depto |
| CT-018 | Filtros salvos (renomear/atualizar/padrão) | PARCIAL | Gestão completa de presets | `FilterPresets.tsx:46-54` só localStorage, salvar/aplicar/excluir | Renomear, atualizar, padrão, persistência no servidor | Preset some ao trocar de máquina | P3 | — |
| CT-019 | Ordenação por último pedido/tempo sem comprar/RFM | PARCIAL | Rótulos completos + critérios comerciais | `ContactToolbar.tsx:18-23` (5 sorts de nome/data) | Sorts comerciais | — | P2 | CT-023 |
| CT-020 | Abas por tipo legíveis no celular | PARCIAL | Indicar rolagem, sem corte | 7 abas com overflow (`ContactTypeTabs.tsx`) | Affordance de rolagem | — | P3 | — |
| CT-021 | RLS: vendedor vê só os próprios contatos | NAO_INICIADO | Regra Q21/Q26 decidida pelo dono | `can_edit_contact` ainda inclui membro de fila (`20260929810000`); CT-022 mediu que 2 vendedores veem 3.098 de 3.106 contatos | Migration local + RLS por papel + decisão sobre 318 sem dono e 0 departamentos | **Hoje qualquer vendedor da fila enxerga a carteira inteira** | P1 | Decisão do dono (carteiras, departamentos); só local até autorização |
| CT-023/CT-024 | Lote Singu com campos novos | PARCIAL | Cargo, depto, apelido, último pedido, ativo | `contactLookupBatch` devolve 8 campos (`useExternalContact360Batch.ts`) | Campos novos no lote | — | P2 | Singu (CT-111) |
| CT-025 | Contagem exata + anúncio por leitor de tela | PARCIAL | Contagem e aria-live | "Exibindo X de Y" existe; nenhum `aria-live` em `src/components/contacts/*` exceto formulário | aria-live no resumo | Acessibilidade | P3 | — |
| CT-026–CT-030 | Teclado, a11y J1, orçamento de desempenho, roteiro visual, E2E J1 | NAO_INICIADO | Provas da jornada 1 | nada específico | — | Sem prova da meta "3 cliques/5 s" | P2 | CT-006+ |
| CT-031–CT-033, CT-035 | Ficha do contato em seções (profissional, comercial) + hook único | NAO_INICIADO | Ficha mobile-first no módulo Contatos | `ContactDetailPanel.tsx` v1; peças reaproveitáveis existem no sidebar do inbox (`src/components/inbox/contact-details/sidebar/`) | Ficha nova no módulo | Vendedor sai do módulo para ver dados do CRM | P2 | CT-002 |
| CT-034 | Perfil Singu na ficha | PARCIAL | DISC/VAK/Big Five… | Existe só no sidebar do inbox (`SinguProfileSection.tsx`) | Levar para a ficha | — | P3 | flag `crm.integration` |
| CT-036 | Ficha completa Singu (360) | PARCIAL | Consulta completa sem sair | Aba CRM 360° no inbox; `ExternalContact360Panel.tsx` órfão | Ficha 360 no módulo | — | P3 | flag |
| CT-037/CT-038 | Resumo de interações + briefing | NAO_INICIADO | Últimas conversas/ligações/e-mails; briefing | `ContactIntelligencePanel.tsx` órfão (0 consumidores) | Ligar | — | P3 | — |
| CT-039 | Aniversário e redes | PARCIAL | Aviso no mês | `PersonalSection.tsx` (inbox); nada em `ContactDetailPanel.tsx` | Ficha do módulo | — | P3 | — |
| CT-040 | Contato sem vínculo Singu | PARCIAL | Explicar e oferecer vínculo | Estado "não vinculado" + "Buscar no CRM" no sidebar do inbox | Ficha do módulo | — | P3 | — |
| CT-041–CT-050 | Ficha da empresa (contrato, Edge, tela, outros contatos, compras, filtro, estados, a11y, E2E) | NAO_INICIADO | Ficha só-consulta da empresa | Contexto empresarial existe só no painel do E-mail (`EmailContactPanel.tsx`) | Edge + tela | Vendedor não entende a conta (empresa) a partir do contato | P2 | Singu |
| CT-051 | KPIs do topo filtram ao clicar | NAO_INICIADO | Clique filtra a lista | `ContactStatsCards.tsx:27-78` sem `onClick` | — | — | P3 | — |
| CT-052 | Avatar foto/iniciais estáveis | PARCIAL | Cor estável | Avatar + iniciais existem | Cor estável por pessoa | — | P3 | — |
| CT-053–CT-056, CT-058, CT-059 | Telefone formatado único, tempo sem comprar, RFM explicado, selo ativo/inativo, endereço→mapa, avisos de qualidade | NAO_INICIADO | Leitura comercial rápida | nada (grep `diasSemComprar` só no mock) | — | Sem priorização de inativos | P2 | CT-023 |
| CT-057 | Mapa/analytics sob controle | PARCIAL | Custo controlado | Vistas Mapa/Analytics existem atrás de "Mais visualizações" (`ContactViewSwitcher.tsx:28-30,78-85`) | Orçamento/controle de custo Mapbox | — | P3 | — |
| CT-060 | Revisão visual J2 | NAO_INICIADO | — | — | — | — | P3 | CT-050 |
| CT-061 | Conversar com um toque | PARCIAL | Card, lista e ficha | "Conversar" em card/lista/tabela (`ContactContentArea`) | Medir 1 toque na ficha nova | — | P3 | — |
| CT-062–CT-065 | Ligar/e-mail sem revelar dado; trocar links externos; remover botões copiar | NAO_INICIADO | Agir sem ver/copiar número/e-mail | Botões copiar ativos (`SidebarRow.tsx:28-53,80`); link de e-mail leva `emailTo` na URL (`ContactActionButtons.tsx:157`) | Ações internas sem exposição | **Vazamento de base de clientes por cópia** | P1 | CT-091+ |
| CT-066–CT-070 | Menu de ações, estados de foco, atalhos de agir, contatos recentes, E2E J3 | NAO_INICIADO | — | Menu ⋮ existe (v1) | — | — | P3 | — |
| CT-071–CT-080 | Edição básica com aprovação no Singu (contrato, form, Edge envio/consulta, hook, aviso "sujeito a aprovação", fechar escrita direta, ataque, auditoria, revisão) | NAO_INICIADO | Vendedor sugere, Singu aprova | Edição v1 grava direto em `contacts` | Fluxo completo | Dados oficiais podem ser alterados sem aprovação | P2 | Singu (CT-112) |
| CT-081 | Tags + filtro e/ou/sem | PARCIAL | Filtro múltiplo | Tags e filtro de 1 tag (`ContactAdvancedFilters.tsx:121`) | e/ou/"sem a tag" | — | P3 | — |
| CT-082 | Trocar responsável 1 a 1 com histórico | PARCIAL | Com histórico | Atribuição em massa sem histórico (`BulkActionsBar.tsx:123`) | Histórico + 1 a 1 | Sem rastreio de troca de carteira | P2 | — |
| CT-083 | Detectar duplicados | PARCIAL | Aviso de mesma pessoa | Só checagem no formulário (`ContactForm.tsx`) | Detecção na base | — | P3 | — |
| CT-084/CT-085 | Comparar/mesclar 2–3 com prévia | PARCIAL | Limite 3 | Comparar e mesclar campo a campo existem (`ContactMergeDialog.tsx:74-85`), sem limite | Limite 3 | Mesclar é irreversível (DELETE físico) | P3 | — |
| CT-086/CT-087 | Lixeira 30 dias + telas de lixeira/higiene de legados | PARCIAL | Admin restaura/apaga de vez | Soft delete existe; restauração só por SQL (runbook); grep `restore_contact` = 0 | RPC + tela | Contato apagado por engano exige TI | P2 | Banco local |
| CT-088/CT-089 | Retirar edição em massa; seleção limitada a 3 | NAO_INICIADO | Decisão do dono | Edição em massa (tags/atribuir/tipo) ainda existe em `BulkActionsBar.tsx` | Remover | Contraria decisão "nada de edição em massa" | P2 | — |
| CT-090 | E2E J4 | NAO_INICIADO | — | — | — | — | P3 | — |
| CT-091–CT-110 | Proteção de dados (política no servidor, bloqueio copiar/imprimir, marca d'água, máscara de telefone/e-mail, registro de revelação, limite 100 fichas/h, alerta ao gestor, painel de acessos, regra única de copiar, anexos, logs sem PII, guarda de CI, teste de vazamento, revisão de segurança, docs) — 20 itens | NAO_INICIADO | Proteção server-side | nada (grep `watermark` só acha `ChatWatermark.tsx`, decorativo; nenhuma tabela de acesso/revelação) | Tudo | **Base de clientes exportável por cópia/print sem rastro** | P1 | Banco local + decisão |
| CT-111/CT-112 | Documentos "Pedido ao Singu" (dados/filtros; área provisória) | NAO_INICIADO | Pedido formal ao Singu | só citado no próprio plano | Escrever | Singu não sabe o que entregar → todo o bloco fica com nulos | P1 | — |
| CT-113 | Testes de contrato Singu | NAO_INICIADO | — | — | — | — | P3 | CT-111 |
| CT-114 | Validação com dados reais do Singu | BLOQUEADO | Claude confere mock × real | — | — | — | P2 | Singu entregar dados |
| CT-115–CT-120 | Liberação por partes, telemetria, medição final, a11y geral, docs, limpeza de mocks | NAO_INICIADO | — | Chave `contacts.v2` pronta (CT-005) | — | — | P3 | CT-006+ |
| CT-121–CT-130 | Visibilidade por tipo/atendimento (estudo de dono da conversa, "Quem pode ver", RLS, conversas por atendimento, campo no cadastro, abas, ficha, matriz de testes, auditoria, doc) | NAO_INICIADO | Fornecedor/transportadora nascem fechados | nada | Tudo | Comprador vê conversas de colegas com fornecedores | P2 | CT-021 + decisão |

### 3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)

Implementado no Zapp por #1636/#1642/#1654: `src/components/inbox/contact-details/sidebar/*` (9 componentes), `src/hooks/crm/useContactSidebar.ts`, `src/types/contactSidebar.ts`, `src/lib/singuLabels.ts`, `src/lib/urlSafety.ts`, lookup `'sidebar'` em `supabase/functions/crm-integration/index.ts:131-216`, allowlist em `_shared/crm-integration-contract.ts:5,72,165`, 13 órfãos apagados, `e2e/inbox-contact-sidebar.spec.ts` (mockado).

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| SB-01 / SB-85 / SB-87 | Capturas antes/depois e mobile | NAO_INICIADO | PNGs em `docs/design/evidence/sidebar-3-secoes/` | só `orfaos.md` | PNGs | Sem prova visual | P3 | — |
| SB-03 | Script de cobertura Singu | NAO_INICIADO | `scripts/db-audit/singu-sidebar-coverage.sql` | arquivo ausente | — | — | P3 | — |
| SB-07 | Registrar decisões D1–D7 | NAO_INICIADO | Decisões datadas | §6 do plano só com recomendação | Registro | — | P3 | Joaquim |
| SB-08–SB-23 | RPC `get_contact_sidebar_by_phone` no Singu | NV | Migration no repo Singu_V2 | Não está neste repo; PR audit diz "contrato externo não comprovado" | Confirmar | Sem a RPC, as 3 seções mostram "—" | P1 | Repo/banco Singu |
| SB-91 / SB-94–SB-96 | Ligar `crm.integration` e verificar com contatos reais | BLOQUEADO | Rollout D1 | Flag `false` desde `20260909120000:8`; `.env.production:15` `VITE_CRM_INTEGRATION_ENABLED=false` | Decisão + RPC aplicada | **Perfil Singu e dados do CRM não aparecem para ninguém em produção** | P1 | Joaquim (D1) + SB-91 |
| SB-92 | Deploy/smoke da edge | PARCIAL | Smoke autenticado | Código mergeado | Smoke em produção | — | P2 | — |
| SB-93 | Impacto de ligar a flag | NAO_INICIADO | `flag-impacto.md` | ausente | — | Ligar a flag sem mapa de efeitos | P2 | — |
| SB-97 / SB-99 | Atualizar CRM360_TECHNICAL_DOCS / PAINEL_STATUS | NAO_INICIADO | Docs | `docs/CRM360_TECHNICAL_DOCS.md:58-63,82` ainda descreve accordion antigo; PAINEL_STATUS sem nota | Docs | — | P3 | — |
| SB-98 | Limpeza de órfãos | PARCIAL | Apagar órfãos | 13 apagados; `ExternalContact360Panel.tsx`, `ContactIntelligencePanel.tsx` e `Contact360Helpers.tsx` seguem com 0 consumidores | Decidir/apagar | Código morto | P3 | — |
| SB-100 | Relatório final §9 | NAO_INICIADO | Relatório | §9 "vazio" | — | — | P3 | — |

NV adicionais: SB-02, 04, 06, 32, 82–84, 86, 89 (medições/deploy).

### 3.4 SalesView + Journey 50 (02/10)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| S14/SV-001 | Rótulo "Compras concluídas" | PARCIAL | Tile diz o universo | `CommercialSummaryStrip.tsx:32` ainda "Compras (n)"; nota de escopo em `:37` | Trocar rótulo | Vendedor pode achar que compra pendente sumiu | P3 | — |
| S15 | Teste negativo de erro de insert | PARCIAL | Erro de "+ Novo" | Só casos positivos em `SalesViewTab.test.tsx:82-141` | Caso de erro | — | P3 | — |
| S18 | Teste com compra `pending` fora da contagem | PARCIAL | Contrato completo | idem | — | — | P3 | — |
| S41 | 0 erros de console no fluxo | PARCIAL | Item 7 | 401 de outro fluxo registrado | Remedir | — | P3 | — |
| S42 | Matriz de prints | PARCIAL | Antes/depois claro+escuro | `00-antes-*` adicionados (lote 06/10) e cheio≠vazio agora; sem par escuro da SalesView | Par escuro | — | P3 | — |
| S43 | Contraste por elemento no alto-contraste | PARCIAL | Medição por elemento | só imagem `contraste-alto-por-elemento-2026-10-04.png`, sem medição escrita | Medição | Acessibilidade | P3 | — |
| S46 | Lição no CLAUDE.md | PARCIAL | Lição correta | CLAUDE.md "Lição de UI (2026-10-02)" diz "sem série histórica — não reintroduzir %", mas #1640 já usa % real | Atualizar texto | Agentes podem remover % legítimo | P3 | Joaquim (arquivo protegido) |

Risco transversal não remedido: banner de conexão do WhatsApp (`z-index 90`) sobre a barra de abas — sem medição atual (NV).

### 3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11

Camada de biblioteca feita (cartões J01–J05 e parte de J06, lote 09/10): `src/lib/journey/{model,periodRange,stats,rawRows}.ts`, `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` + `motion/*`, `src/hooks/chat/journey/{useJourneyCalls,useJourneyEmails}.ts`. **Nada disso está ligado à aba:** `JourneyTab.tsx` (193 linhas) segue com `PERIOD_OPTIONS` fixo (`:44`), `TYPE_OPTIONS` sem e-mail/telefone (`:51`), `ContactStatsStrip` + `KpiStrip` antigos (`:100,121`) e rótulo com `capitalize` (`:138`).

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| S004–S008 | Provas (limite 500/200, seed local, autor de e-mail, event_types, registro) | NAO_INICIADO | Diagnóstico | §8 "A preencher" | — | — | P3 | — |
| S019/S026 | Fontes ligação e e-mail | PARCIAL | Consultas `calls`, `email_threads/messages` | Hooks existem sem consumidor | Ligar ao timeline | **Journey não mostra ligações nem e-mails** | P1 | J07/J08 |
| S020–S025, S027–S030 | Mapeadores de ligação/e-mail + testes | NAO_INICIADO | Direção, duração, motivo, gravação, assunto | nada | Mapeador (J07) | idem | P1 | J06 |
| S031–S042 | Notas/tarefas/transferências com autor e "De→Para" | NAO_INICIADO | Ler `author_id`, `from/to_agent_id`… | `useConversationHistoryTimeline.ts:311-330` seleciona só id/conteúdo/data | Colunas de autor e destino | Transferência sem quem→quem | P2 | J07 |
| S045–S047, S049–S050 | Período com calendário (seletor da IA) | PARCIAL/NAO | `PeriodFilterSelector` | `resolveRange/previousRange/toIsoRange` prontos em `periodRange.ts:160-220`; aba usa Select 7/30/90/Tudo | Ligar seletor e consulta por intervalo | — | P2 | J08/J10 |
| S052–S060 | Filtro de usuário múltiplo + E-mail/Telefone no tipo | NAO_INICIADO | "Ver só o que Maria falou" | `TYPE_FILTER_OPTIONS` pronto em `model.ts:229`; aba não usa | UI + hook | Gestor não filtra por atendente | P2 | J10 |
| S061–S065, S068, S069, S071, S072 | Visual da timeline (cor por categoria, foto de quem agiu, selos, detalhes, arquivo com nome) | NAO_INICIADO | Cartão rico | `CATEGORY_META` pronto; aba com `KIND_META` antigo | J11 | Timeline pobre ("Arquivo enviado" sem nome) | P2 | J11 |
| S066/S067/S070 | Defeitos "De" maiúsculo e JSON cru de localização | PARCIAL | Corrigir | Corrigidos só na lib (`formatDayLabel` `model.ts:269`, `safeEventText` `:313`); a aba ainda exibe "2 De Outubro De 2026" (`JourneyTab.tsx:69-75,138`) e `truncate(content)` cru (`useConversationHistoryTimeline.ts:168`) | Ligar | **Defeito visível ao usuário hoje** | P1 | J12 |
| S084 | `JourneyStatsHero` | PARCIAL | Uma área de estatísticas com tendência | Componente + 23 testes, não montado | Montar na aba | — | P2 | J12 |
| S085–S094 | Clique abre o episódio (chat, e-mail, ligação, nota, tarefa, arquivo, proposta, evento) | NAO_INICIADO | `openEpisode` | nada | J13–J17 | Timeline não navegável | P2 | J12 |
| S095 | Teste "nada sai do sistema" na aba | NAO_INICIADO | Substitui exportar (D11) | nada | Teste | Regra permanente sem guarda | P3 | — |
| S096 | Paginação por rolagem sem teto | PARCIAL | Sem teto 500/200 | "Carregar mais" (+200) em `JourneyTab.tsx:81,183` | Rolagem | — | P3 | — |
| S097–S100 | Teclado/leitor, E2E `e2e/journey.spec.ts`, bundle, docs | NAO_INICIADO | — | spec ausente | — | — | P3 | — |
| K01–K11 | Fase K de design (marcos, silêncio, saúde do relacionamento, filtros fixos, balões, folha no celular…) | NAO_INICIADO | Aprovado pelo dono | nada | Tudo | — | P3 | J12 |

### 3.6 CRM externo (Singu) — integração, sincronização e segurança

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| CRM-R2 | Worker de sincronização (outbox → CRM) | PARCIAL | Fase 2 do runbook: lote manual, depois `CRM_SYNC_WORKER_ENABLED=true` | Outbox `20260908180000`; `crm-sync-worker.yml:14-15` com cron comentado, só `workflow_dispatch` | Lote 1 manual + ligar variável | **Atendimentos encerrados não chegam ao CRM** (relationship_score/RFM não evoluem) | P1 | Joaquim + secrets EXTERNAL_* |
| CRM-R3 | Ativar front (`VITE_CRM_INTEGRATION_ENABLED`) | BLOQUEADO | Fase 3 | `.env.production:15` = `false`; flag `crm.integration` = false (`20260909120000:8`) | Smoke + decisão | Botão CRM 360°, badges do ChatHeader, CRMAutoSync, sidebar Singu, contexto de empresa no E-mail ficam apagados | P1 | Joaquim |
| CRM-R4 / GATE C (F97 2–5) | Revogar `anon` das 5 RPCs antigas no banco do CRM, rotacionar anon key, remover `VITE_CLIENTES_*` | BLOQUEADO | Fechar exposição | `docs/crm-external-grants.md` "GATE C — pendente"; nenhuma prova de revogação | Ação admin no `pgxfvjmuubtbowutlide` | **Qualquer portador da anon key pública lê ~57k empresas/48k clientes** | P0 | Admin do CRM externo |
| GATE C-1 | Guard F22 (HMAC de escopo) | PARCIAL | Migrar chamadas para service key + guard | `crm-integration` já usa service key; guard F22 inexistente (`crm-external-grants.md` §F97 passo 1) | HMAC | — | P2 | — |
| LOV-T3 | Busca CRM no GlobalSearch/CommandPalette | NAO_INICIADO | Resultados CRM com badge | grep "crm" em `GlobalSearch.tsx`/`CommandPalette.tsx` = 0 | — | — | P3 | flag |
| LOV-T6 | Indicador CRM na lista de conversas | NAO_INICIADO | Ícone/empresa na ConversationList | `CRMConversationBadge` não existe; batch só em Contatos/TalkX | — | — | P3 | flag |
| DIF-2 | "Ver no CRM" no Resumo Comercial | NAO_INICIADO | Link | grep "Ver no CRM" = 0 | — | — | P3 | URL do Singu |
| PAR-074 | CRM plugável (`crm_sync_config`) | NAO_INICIADO | Provedor por config | grep = 0 | — | — | P3 | — |
| PAR-073 | Segmentos dinâmicos de contatos | PARCIAL | Segmentos com regra | Segmentos do Talk X existem | Segmento "sem resposta há 30 dias" | — | P3 | — |
| 3.5b | Enriquecimento empresa/cargo/e-mail a partir do CRM | PARCIAL | Leitura somente via vínculo | Sidebar/E-mail leem; `contacts` local quase vazio (e-mail em 3, empresa em 1) | Ligar enriquecimento | — | P2 | flag |

### 3.7 E-mail NAVY (100 EN / 80 AC)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| AC-002 / AC-010 | Certificação visual contra referência | BLOQUEADO | Pixel a pixel | PNG `referencias/01_EMAIL_DIRECAO_VISUAL.png` ausente | Artefato | — | P3 | Dono fornecer PNG |
| EN-025 / OTH-005 | Lista só por página no servidor | PARCIAL | Filtro no servidor + cursor | `email-chat` paginado; rota legada `gmail` (`ViewRouter.tsx:89`) usa `full: true` e baixa a caixa inteira (`GmailInboxView.tsx:24`, `emailPagination.ts`) | Migrar/remover tela legada | Lentidão/custo com caixas grandes | P2 | — |
| EN-088 / OTH-014 | Medição de memória/GPU em browser real | PARCIAL | Heap e render | Medido só em jsdom (`EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md:115-126`) | Playwright | — | P3 | — |
| ADV-1 | Advisors de segurança/performance do backend de e-mail | NV | Reexecutar | timeout do conector | — | — | P2 | Acesso |

### 3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)

Implementado (#1812, #1846, #1855, lote 1 `4dcc5984`): contexto empresarial com 6 campos em `EmailContactPanel.tsx`, escolha entre empresas (`:250`), vínculo manual (`:267`), permissão nomeada (`20261003160000`), RPC guardada (`20261003151520`).

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| ES-03 | Dicionário empresarial do Singu vivo | BLOQUEADO | Leitura autorizada | contrato só local | Leitura autorizada | Campo "Sobre" pode ter significado errado | P2 | Admin do Singu |
| ES-04 | Matriz de permissões com atendente real | PARCIAL | Atendente real | 403/404 com atendente sintético (`crm-integration/index.test.ts`) | Teste real | — | P2 | Deploy + flag |
| ES-27 | Transportadora isolada | PARCIAL | Teste dedicado | só tipo/código | Teste | — | P3 | — |
| ES-30 | "Abrir no CRM" | PARCIAL | Ação onde houver permissão | "Vincular empresa" existe; "Abrir no CRM" ausente | Link | — | P3 | URL do Singu |
| ES-40 | Medir custo das consultas do painel | NAO_INICIADO | Orçamento de chamadas | nada | Medição | — | P3 | — |
| ES-45 | Homologação visual com dados reais | PARCIAL | Playwright na rota real | `e2e/email-navy-visual.spec.ts` com fixture | Dados reais | — | P3 | — |
| ES-49 | Publicação + smoke autenticado | BLOQUEADO | Edge/migrations em produção | "versão publicada sem registro posterior" (matriz OTH-013) | Smoke | — | P2 | Deploy autorizado + flag |
| ES-50 | Fechamento do checklist | NAO_INICIADO | Marcar com evidência | 0 de 50 caixas marcadas | Atualizar | — | P3 | — |

### 3.9 E-mail — alertas de não lido (U01–U12)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| U03 | Chip "E-mail (n)" na barra de abas do chat | NAO_INICIADO | Só quando > 0 | `ConversationTabs.tsx` sem e-mail; `useContactUnreadEmails.ts:75` sem consumidor | Ligar | **Atendente não percebe que o cliente mandou e-mail enquanto conversa no WhatsApp** | P1 | — |
| U04 | Selo no ícone de e-mail do painel | NAO_INICIADO | Mesmo número | `ContactActionButtons.tsx:153-157` sem selo | Ligar | idem | P1 | U02 |
| U05/U06 | Testes a11y/tempo real; documentação | NAO_INICIADO | — | — | — | — | P3 | U03/U04 |
| U08/U09/U12 | Verificações finais e fechamento | NAO_INICIADO | — | — | — | — | P3 | U03/U04 |

(U01 selo na sidebar = feito: `Sidebar.tsx:22,68,149`; U02 hook = feito. U07/U10/U11 = NV.)

### 3.10 E-mail — link do e-mail no painel do contato (E01–E14)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| E06 (L06) | Testes adversariais do saneamento | PARCIAL | `javascript:`, 5k chars, Unicode, `<script>` | Testes básicos (UUID/254) em `useNavigationHistory.navigateToViewParams.test.ts:65` | Arquivo adversarial | — | P3 | — |
| E07 (L07) | A11y do ícone | PARCIAL | `aria-disabled`, tooltip falado, ordem de tab | Só "desabilitado sem e-mail" (`ContactActionButtons.test.tsx:55-60`) | — | — | P3 | — |
| E08 (L08) | E2E do link | NAO_INICIADO | 4 cenários | nenhum spec | — | — | P3 | — |
| E09 (L09) | Documentação do contrato de parâmetros | NAO_INICIADO | doc em `docs/design/` | ausente | — | — | P3 | — |

(E01–E05 feitos: `navigateToView(view, params)`, `useEmailThreadForContact.ts:16`, `EmailChatInbox.tsx:26-40,97,131,162-174`, `ContactActionButtons.tsx:157`. E10–E14 = NV.)

### 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| A11Y-CRM-01 | Nome acessível nos botões só de ícone | PARCIAL | aria-label | Cards/lista/tabela corrigidos (`ContactCard.tsx:70`, `ContactListItem.tsx:155`, `ContactsTable.tsx:225`); **fechar** do painel (`ContactDetailPanel.tsx:222-228`) e **adicionar nota** (`ContactNotes.tsx:154-160`) sem nome | 2 aria-labels | Leitor de tela não fecha a ficha | P1 | — |
| A11Y-CRM-02 | Abas da conversa sem nome < 1536 px | NAO_INICIADO | `aria-label={tab.label}` | `ConversationTabs.tsx:60-64` sem aria-label; rótulo `hidden 2xl:inline` (`:86`) | 1 linha | 8 abas anunciadas sem nome | P1 | — |
| A11Y-CRM-03 | Selects sem nome nos filtros e no CRM 360° | NAO_INICIADO | aria-label | `ContactAdvancedFilters.tsx:90,106,122,138,157`; `DataExplorerTable.tsx:84` | — | — | P1 | — |
| A11Y-CRM-04 | Botões de ícone do CRM 360° | NAO_INICIADO | aria-label | `DataExplorerTable.tsx:93,157,158` | — | — | P1 | — |
| A11Y-CRM-05..11 | Contraste, aria-controls, alvos de toque, aninhamento, títulos, ordenação por teclado | NV | — | não reconferido individualmente | — | — | P2–P3 | — |
| SEC-01 | Mensagem de entrada forjável (INSERT/UPDATE de `messages` sem fixar origem) | NAO_INICIADO | Policy/trigger | nenhuma migration após 07/10 toca policies de `messages` | Migration | Atendente pode forjar mensagem "do cliente" | P1 | Banco local → lote |
| SEC-02/SEC-03 | Oráculo de UUID em `require_contact_edit_permission` e `can_delete_contacts` | NAO_INICIADO | Erro único / sem linha | últimas definições `20260930090000` e `20260930370000` (antes da auditoria) | Migration | Enumeração de contatos de terceiros | P1 | idem |
| SEC-04..06 | Reações sem amarrar `user_id`; 17 tabelas com privilégio `anon` (inclui TRUNCATE); `conversation_tasks` INSERT sem visibilidade | NAO_INICIADO | Endurecimento | sem migration posterior | Migration | — | P2 | idem |
| SEC-07..09 | Policies sem `TO authenticated`, cláusula morta, `performed_by` nulo | NAO_INICIADO | — | — | — | — | P3 | idem |
| W4-1 | Inlinar predicado de visibilidade no `search_contacts` | PARCIAL | -53% a -66% | ainda chama `can_edit_contact` por linha (`20260930450000:54`) | Migration | Busca mais lenta com base grande | P2 | — |
| W4-4 | Contagem exata `COUNT(*) OVER` em 100k | NAO_INICIADO | Contagem aproximada/cache | `20260930450000:35` | Decisão | Busca degrada no crescimento | P3 | — |
| W4-6 | Cronometrar limiares 10k–100k | NAO_INICIADO | Benchmarks | nada | — | — | P3 | — |
| PAR-081/082/083 | Outlook/Graph; tracking pixel; Resend+IMAP, templates e assinaturas de e-mail | NAO_INICIADO (083 PARCIAL: `send-email` genérico) | Paridade V1/V3 | grep `email_templates`/`email_signatures`/`outlook`/`email-track` = 0 | — | Sem assinatura/modelo de e-mail; só Gmail | P3 | Decisão (Azure AD, domínio Resend) |

---

## 4. Divergências doc × código

1. **Sidebar 3 seções — "Nenhuma etapa foi executada"** (`PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md:5`) × código entregue: `src/components/inbox/contact-details/sidebar/` (9 arquivos), `useContactSidebar.ts`, lookup `'sidebar'` em `crm-integration/index.ts:131`; 13 órfãos apagados. §9 "Relatório de execução" vazio.
2. **Email sidebar — "ES-01 a ES-50 planejadas; nenhuma executada"** e 0/50 caixas (`PLANO_EMAIL_SIDEBAR_CONTATO_50_ETAPAS_2026-10-03.md:9`) × ~42 etapas no código (`EmailContactPanel.tsx:71-72,250,267,280`; migrations `20261003151520`, `20261003160000`).
3. **Email NAVY plano — "100 etapas PLANEJADAS, NÃO EXECUTADAS"** (`PLANO_EMAIL_NAVY_100_ETAPAS_2026-10-02.md:11`) × evidência de 78/80 AC e PR #1762 (o próprio plano tem nota de atualização, mas o corpo continua afirmando o contrário).
4. **Journey histórico — "§8 Estado de execução: A preencher"** × J01–J05/J06 mergeados em `ecfdb26` (`src/lib/journey/*`, `JourneyStatsHero.tsx`, `useJourneyCalls/Emails.ts`). Inverso também: o plano sugere avanço, mas **a aba visível não mudou** (`JourneyTab.tsx` igual ao de 02/10).
5. **Email alertas/link — "Estado: A preencher" / "C03 em execução"** × C03, U01, U02 entregues (`ContactActionButtons.tsx:157`, `Sidebar.tsx:68`, `useContactUnreadEmails.ts`).
6. **CRM360_TECHNICAL_DOCS.md:58-63,82** descreve `ExternalContact360Panel`/`ContactIntelligencePanel` como seções do accordion e `CRMSyncButton`/`CRMConversationBadge` em uso × os dois painéis têm 0 consumidores, `CRMSyncButton` é export sem uso (`CRMAutoSync.tsx:95`) e `CRMConversationBadge` não existe. Caminhos `hooks/useExternalContact360.ts` defasados (código em `src/hooks/crm/`).
7. **FECHAMENTO_PLANO_CONTATOS_2026-10-02.md:54-65** ("O que continua aberto: 2–5, 11, 13, 14, 16–18, 28, 39, 58, 65, 94, 98") × conclusão do mesmo doc (`:114`) e do plano: 99/100 com só a 94 aberta. Tabela interna desatualizada.
8. **Plano Contatos etapa 95 `[x]` "2 receitas SQL testadas"** × FECHAMENTO_01/10 B4 "receitas não testadas por execução" nunca baixado.
9. **REDESIGN_CONTATOS_STATUS.md (Contrato Seção 4: "Sincronizar ✓", "CRM 360° ✓")** × não há botão "Sincronizar" em `src/components/contacts/*` (cabeçalho removido em #1262); "CRM 360°" só aparece com flag ligada (`ContactToolbar.tsx:173-176`), desligada em produção.
10. **INVENTARIO_MELHORIAS R3-04 "NAO_IMPLEMENTADA" (data de nascimento/fundação 1 dia antes)** × corrigido com `calendarDayKey/parseDayKey` em `Contact360Helpers.tsx:19,56-57,133,191` (e o componente está órfão).
11. **OTH-003 (HTTP 207 do gmail-sync vira sucesso)** e **OTH-006 (sem `pageToken`)** listados como abertos na reconciliação de 03/10 × corrigidos: `useGmail.ts:290-316` (toast parcial/erro com retry) e `_shared/gmail-helpers.ts:221-249` (loop de `pageToken`).
12. **SV-002 (tempo médio sem recorte) / S24/S27** abertos na reconciliação × corrigidos: `JourneyTab.tsx:99` "Independe do período abaixo", `ContactStatsStrip.tsx:58` "200 primeiras msgs".
13. **CLAUDE.md "Lição de UI 2026-10-02: Estatísticas não têm série histórica — não reintroduzir %"** × `#1640` produz % real por janelas (reconciliação SV, `SALESVIEW_JOURNEY.md:39`).
14. **PROMPT_IMPLEMENTACAO_REDESIGN_CONTATOS** (commitado em 08/10) pede abas Lead/Sicoob Gifts/Outros e subtítulo "Base de clientes e leads" × D2/D4 e plano 100 extinguiram esses tipos (`whatsappFileTypes.ts:191-198` = 6 tipos). Documento histórico sem marcação de "substituído".
15. **Conflito entre planos**: link de e-mail (C03) leva o e-mail do contato na URL (`ContactActionButtons.tsx:157`, `emailTo`) e o sidebar tem botões "copiar" (`SidebarRow.tsx:28-80`) × CT-063/CT-065 (agir "sem ver nem copiar o endereço") e regra "nada sai do sistema".

---

## 5. Achados fora dos planos

1. **Busca de contatos falhando vira "lista vazia"**: `useContactsSearch.ts:215` expõe `error`, mas `ContactsView.tsx:54-77` não o lê e `ContactContentArea` não tem estado de erro (risco também registrado em `MODULO_CONTATOS_CRM360_SALESVIEW.md` §5) — usuário vê "nenhum contato" quando a RPC cai. P2.
2. **KPIs de Contatos baixam a tabela inteira para o navegador**: `useContactsKpi.ts:82-95` pagina `contacts` em blocos de 1.000 até o fim para agregar no cliente — custo cresce linear com a base e atrasa os cards. P2.
3. **Duas telas de e-mail em produção**: `?view=email-chat` (nova) e `?view=gmail` (`ViewRouter.tsx:89` → `GmailInboxView.tsx:24`, carga integral em memória). P2.
4. **Código-base Singu/Journey pronto e sem consumidor**: `singu-adapter.ts` (+mock), `useJourneyCalls`, `useJourneyEmails`, `JourneyStatsHero`, `src/lib/journey/*`, `useContactUnreadEmails` — 0 importadores de produção. Dívida até as ondas 2/3 rodarem. P3.
5. **Componentes CRM órfãos**: `ExternalContact360Panel.tsx`, `ContactIntelligencePanel.tsx`, `Contact360Helpers.tsx` (só usado pelo órfão) e export `CRMSyncButton` (`CRMAutoSync.tsx:95`). P3.
6. **Integração CRM inteira apagada em produção** (`.env.production:15` + flag `crm.integration=false`): o que foi entregue (sidebar 3 seções, contexto empresarial do E-mail, CRM 360° em Contatos, badges no ChatHeader `ChatHeader.tsx:49`, CRMAutoSync no ChatPanel) não aparece para o usuário. P1.
7. **Edição em massa de contatos ainda ativa** (`BulkActionsBar.tsx:123` atribuir; tags; tipo) apesar da decisão CT-088 ("nada de edição em massa"). P2.
8. **Contatos `[E2E]` acumulando em produção** (FECHAMENTO_02/10 achado 5) e specs com `test.skip` por falta de dado (`contacts-selection.spec.ts:23,37`, `contacts-views.spec.ts:62`) — E2E de Contatos ainda depende do banco de produção, contra a regra do CLAUDE.md §0.5. P2.
9. **`Contact360Data` promete campos que a RPC 360 nunca devolve** (Próximos passos do plano sidebar, item 3; `src/types/contact360.ts`) — não corrigido. P3.
10. **Mesclar contatos faz DELETE físico** dos secundários (`merge_contacts_atomic`), sem lixeira, enquanto excluir é soft-delete — assimetria de recuperação. P2.
11. **INSERT permissivo em `sales_deals`/`deal_activities`** e ausência de UPDATE/DELETE em `deal_activities` (`MODULO_CONTATOS_CRM360_SALESVIEW.md` §6 riscos 2–3) — qualquer autenticado cria deal/atividade em deal alheio. P2.
12. **"Propostas" classificadas por nome de estágio contendo "propost"** (`aggregateCrm360`) — renomear estágio muda o painel comercial. P3.
13. **Edges `sicoob-bridge*` publicadas e órfãs** (ver C100-11) — `sicoob-bridge` responde 500 por secret ausente. P2.
14. **Videochamada** no painel do contato só atrás de flag `video_call` desligada (stub). P3.
15. **Banner global de conexão WhatsApp sobre a barra de abas** (`z-index 90`, cobria 83% em 02/10) sem remedição. P3.

---

## 6. Top 10 da área

1. **GATE C aberto (P0):** 5 RPCs do CRM externo com `EXECUTE` para `anon` — a anon key pública lê ~57k empresas/48k clientes; revogar no `pgxfvjmuubtbowutlide` depende do admin.
2. **Integração Singu/CRM apagada em produção** (`VITE_CRM_INTEGRATION_ENABLED=false`, flag `crm.integration=false`): sidebar Perfil Singu, contexto de empresa no E-mail e CRM 360° não aparecem; RPC `get_contact_sidebar_by_phone` no Singu não comprovada.
3. **Sincronização Zapp→CRM parada**: `crm-sync-worker` só manual, `CRM_SYNC_WORKER_ENABLED` nunca ligado — atendimentos encerrados não chegam ao CRM.
4. **Visibilidade de contatos (CT-021) não implementada**: todo vendedor da fila vê ~3.098 de 3.106 contatos; regra "só os seus" decidida e não aplicada.
5. **Proteção de dados CT-091–CT-110 inexistente**: sem máscara, sem registro de revelação, sem limite por hora; botões copiar e e-mail na URL ainda presentes.
6. **Segurança RLS Y24 (3 P1) sem correção**: mensagem de entrada forjável e dois oráculos de UUID.
7. **Journey não mostra e-mail nem ligações** e mantém defeitos visíveis ("De" maiúsculo, localização em JSON); a camada pronta (J01–J06) não foi ligada à aba.
8. **Alerta de e-mail não lido no chat (U03/U04) ausente**: atendente não vê que o cliente escreveu por e-mail.
9. **Módulo Contatos v2 (CT-006+) não começou**: cards sem situação comercial (RFM, último pedido, tempo sem comprar) e filtros do Singu inexistentes.
10. **A11y P1 do grupo (Y14)**: abas da conversa, selects de filtro e botões do CRM 360° sem nome acessível.
