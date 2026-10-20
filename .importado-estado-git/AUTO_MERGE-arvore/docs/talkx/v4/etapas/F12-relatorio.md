# Fase 12 — Relatório (X161–X169)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 14. 9 etapas.
>
> **Entrega da fase:** Relatório da campanha concluída com as 8 abas, funil, mapa de calor, links, receita e ROI, exportação e compartilhamento.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de dados, links, relatório, importação e ajuda** (etapas X161, X162, X163, X164, X165, X166, X167, X168, X169)

28 etapas, na ordem de execução. Base: `main` @ `3d09433` (2026-10-01).

- **CRM 360 = banco `pgxfvjmuubtbowutlide`, sempre somente leitura**, pela edge `crm-integration`. Bitrix24 só leitura, pela edge
  `bitrix-api`. Nenhuma etapa escreve no CRM nem no Bitrix; `sync_contacts` (`bitrix-api/index.ts:137-175`) não é chamada nem alterada.
- **Migration:** versão reservada por `supabase_migrations.reserve_migration_version` (> `20260930530000`); arquivo → PR → merge →
  apply + ledger no mesmo `db_query` → `schema-catalog.json`, `types.ts`, `known-violations.json`.
- **Edge só vale depois de `deploy-functions.yml` disparado e aprovado.** Etapa com "Deploy de edge: sim" só fecha com o deploy confirmado.
- **Um único job no pg_cron para os dados desta trilha** (`talkx-data-jobs`, a cada 5 min, criado em X036). Os demais jobs são linhas em
  `talkx_data_jobs`, disparadas por `talkx_run_data_jobs()`. Motivo: o pg_cron já falha com `job startup timeout`; não somar jobs.
- **E2E não grava em produção:** os testes Playwright desta trilha interceptam as RPCs; a lógica real é provada por teste SQL
  (Postgres descartável) e teste Deno.
- **Chaves `dados:*` entregues** (para os outros blocos citarem): `vinculo_crm`, `vendedor`, `regiao`, `uf`, `cidade`, `empresa`, `ramo`,
  `pessoa_juridica`, `estagio_funil`, `status_cliente`, `score`, `genero`, `aniversario`, `ultima_interacao`, `compras`, `ultima_compra`,
  `ticket_medio`, `total_pedidos`, `valor_total`, `rfm_segmento`, `rfm_recencia`, `rfm_frequencia`, `rfm_monetario`, `origem_lead`,
  `cobertura`.

---

## Etapas

### X161 · Reescrever `talkx_campaign_report`: KPIs, comparativo, séries, funil e período

- **Fase:** 12 · **Tela:** 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X021, X028, X030, X041, X057, X066
- **Fecha:** CAP-080 (relatório por campanha)
- **Dependências, em detalhe:** X021, X041 ; CAP-014 (`talkx_recipients.segment_id`), CAP-016, CAP-018, CAP-026 (opt-out com `campaign_id`), CAP-077 — trilha do motor
- **Hoje:** `talkx_campaign_report(p_campaign)` devolve só KPIs de envio, `by_status`, `hourly_series` e `by_variant` (`supabase/migrations/20260916190000_fix_talkx_benchmarks_and_campaign_report.sql:41-115`). A série conta enviados com `status='sent'` (`:75`), o que tira da conta quem já foi entregue. Sem período, respostas, cliques, conversões, opt-outs ou comparativo. Sem consumidor em `src` (só `types.ts`). A campanha não guarda a versão do template usada.
- **Fazer:** Migration troca a função por `talkx_campaign_report(p_campaign, p_from, p_to, p_granularity, p_segment)`, removendo a assinatura antiga na mesma migration (evita sobrecarga ambígua no PostgREST; nada em `src` a usa). INVOKER. Devolve: `kpis` (enviados, entregues, respostas, cliques únicos, conversões, opt-outs e taxas; duração = `completed_at − started_at`, parada em estado terminal); `previous` e `deltas` (mesmos KPIs da campanha concluída imediatamente anterior visível ao chamador; nulo se não houver com 1 envio ou mais); `series` por dia ou hora no fuso `schedule_timezone` com 4 séries (enviados por `sent_at`, entregues por `delivered_at`, respostas por `replied_at`, conversões por `occurred_at`); `sparklines` diárias dos 6 KPIs; `funnel` de 5 degraus (enviados, entregues, responderam, clicaram, converteram) com contagem e % sobre enviados, degrau nulo quando a campanha não tem link ou não tem fonte de conversão. `p_segment` filtra por `segment_id` (esta migration só entra depois de CAP-014). Mesma migration: `talkx_campaigns.template_version_number` + trigger que grava a versão vigente do template na entrada em `sending`.
- **Aceite:** `scripts/db-audit/talkx-campaign-report.test.sh` com campanha de 10 destinatários (8 enviados, 7 entregues, 3 respostas, 2 cliques, 1 conversão de R$ 100, 1 opt-out): cada KPI e degrau igual ao esperado; soma da série = KPI; envio às 23h30 de São Paulo cai no dia certo; `previous` nulo sem campanha anterior e preenchido com ela; agente chamando campanha alheia → P0002. `types.ts` e catálogo regenerados.
- **V3:** V37 (inclui a correção de V16 nesta RPC)
- **Negócio:** O relatório passa a ter números de respostas, cliques, vendas e descadastros da campanha, comparados com a campanha anterior.

### X162 · Criar os detalhamentos do relatório (calor, segmento, link, insights) e listas paginadas

- **Fase:** 12 · **Tela:** 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X028, X030, X037, X038, X040, X057, X065, X074, X075, X161
- **Fecha:** CAP-080 (relatório por campanha), CAP-088 (RPC paginada de exportação)
- **Dependências, em detalhe:** X161 ; `dados:uf`, `dados:vendedor`, `dados:rfm_segmento`, `dados:status_cliente` ; CAP-014, CAP-018, CAP-026, CAP-070 (trilha do motor) ; CAP-081, CAP-083, CAP-085 (trilha de supressão e analytics — usar as funções de mapa de calor, média e regras se já existirem)
- **Hoje:** Mapa de calor e insights são calculados no navegador, sobre até 5.000 linhas e para todas as campanhas (`src/components/talkx/TalkXAnalytics.tsx:51-58,96,109`; `src/hooks/integrations/useTalkXInsights.ts:30-35,90-134`); a regra de cliques filtra o status inexistente `'finished'` (`useTalkXInsights.ts:85`). Listas de destinatários leem no máximo 2.000 linhas (`useTalkXMonitor.ts:46`; `supabase/functions/talkx-report/index.ts:95-100`).
- **Fazer:** Migration com duas RPCs INVOKER. `talkx_campaign_report_breakdowns(p_campaign, p_from, p_to)`: `heatmap` 7×24 (Seg→Dom, fuso da campanha) para respostas, envios e cliques; `by_segment` (enviados, respostas, conversões, taxa); `by_link` (rótulo, destino, cliques, cliques únicos, taxa sobre enviados); `by_variant` (reaproveita CAP-070); `audience` (destinatários por UF, vendedor, segmento RFM e status do cliente, lidos da projeção); `insights` por regra, cada um com valores, base usada e ação: acima/abaixo da média (`talkx_benchmarks()`, mínimo 3 campanhas concluídas), melhor horário de resposta (mínimo 30 respostas), segmento em destaque (2 ou mais segmentos com 50 envios ou mais), clicaram e não converteram (1 link ou mais e 10 cliques ou mais). Regra sem base mínima não é devolvida. `talkx_campaign_report_rows(p_campaign, p_kind, p_search, p_status, p_segment, p_limit, p_offset, p_for_export)`: páginas de `messages|replies|conversions|audience|optouts|links` com total; com `p_for_export=true` exige admin/supervisor e `profiles.can_download`, até 1.000 linhas por página, e grava `report_exported` na primeira página.
- **Aceite:** Teste SQL no fixture de X161: soma do heatmap = respostas; `by_link` com 2 links; regra "vs. média" ausente com 2 campanhas e presente com 3; `rows` devolve total correto e ordem estável entre páginas; `p_for_export` por agente, ou por supervisor sem `can_download`, → 42501 e nenhum evento.
- **V3:** V37, V38, V83 (regra morta `finished`)
- **Negócio:** O relatório ganha os recortes por horário, segmento e link e as listas completas, calculados no servidor mesmo com milhares de destinatários.

### X163 · Criar `TalkXCampaignReport`: rota, cabeçalho, período, abas e 6 KPIs

- **Fase:** 12 · **Tela:** 14, 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X030, X055, X161
- **Fecha:** T14-001, T14-002, T14-003, T14-004, T14-006, T14-007, T14-011, T14-020, T14-022, T14-023, T14-024, T14-025, T14-026, T14-027, T14-028, T14-029, T14-030, T14-031
- **Dependências, em detalhe:** X161 ; kit de KPI, estados e cabeçalho (trilha do kit) ; CAP-026
- **Hoje:** Não existe componente de relatório. "Ver relatório"/"Relatório" na lista (`src/components/talkx/TalkXOverview.tsx:264,380`) abre o Monitor ao vivo (`src/components/talkx/TalkXView.tsx:156-160,224-235`), cujo cronômetro continua contando depois de concluída (`TalkXLiveMonitor.tsx:77-88,117`). O endereço do módulo só guarda `wizard`/`step` (`src/components/talkx/talkxWizardRoute.ts`).
- **Fazer:** Criar em `src/components/talkx/report/`: `TalkXCampaignReport.tsx`, `TalkXReportHeader.tsx`, `TalkXReportKpis.tsx` e `useTalkXReport.ts` (chama `talkx_campaign_report`; cache de 5 min; sem polling nem realtime). `TalkXView.onView`: `completed|cancelled` → relatório; endereço `?view=talkx&report=<id>&tab=<aba>` (parser ao lado de `talkxWizardRoute.ts`). Cabeçalho dentro do shell (A1): breadcrumb "Campanhas › <nome> › Relatório", tile do WhatsApp, "Relatório • <nome>", pill Concluída ou Cancelada, subtítulo do mock, seletor de período (padrão: início ao fim da campanha mais a janela de resposta; limitado a esse intervalo). Barra de 8 abas — cada aba aparece quando a sua etapa entra, sem aba vazia. 6 KPIs com `KpiCard`, barras e "vs. campanha anterior": Cliques some se a campanha não tem link; Conversões some sem fonte de conversão; Opt-outs só com CAP-026; comparativo some sem campanha anterior. Campanha cancelada mostra "não enviados". Estados do kit para carregando, erro, não encontrada e sem permissão. Ajustar `scripts/db-audit/talkx-navigation-contract.test.mjs`.
- **Aceite:** Testes do hook e do roteamento (`completed` → relatório; `sending` → acompanhamento); E2E com RPC interceptada: "Ver relatório" mostra o título "Relatório •" e os KPIs com fonte; campanha sem links não mostra o KPI Cliques. Print 1672×941 do cabeçalho e dos KPIs ao lado de `docs/talkx/references/14_Relatorio_Campanha_Concluida.png`.
- **V3:** V31, V37
- **Negócio:** "Ver relatório" abre o relatório de verdade, com período e os seis números principais da campanha.

### X164 · Desenhar desempenho (4 séries), funil de 5 degraus e mapa de calor da campanha

- **Fase:** 12 · **Tela:** 14 · **Camada:** front · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X057, X161, X162, X163
- **Fecha:** T14-032, T14-033, T14-034, T14-035, T14-036, T14-037, T14-038, T14-039, T14-040, T14-041, T14-042, T14-043, T14-044, T14-045, T14-046, T14-047, T14-048, T14-061, T14-062, T14-063, T14-064
- **Dependências, em detalhe:** X161, X162, X163 ; CAP-014 (seletor de segmento do funil)
- **Hoje:** Para campanha concluída há só "Ritmo de Entrega (últimos 60 min · estimado)", 2 séries por minuto (`src/components/talkx/TalkXLiveMonitor.tsx:152-161`). Funil e mapa de calor existem apenas somando todas as campanhas, com larguras fixas `[100,80,55,35]` e contagem de envios, ordem Dom→Sáb e hora do navegador (`TalkXAnalytics.tsx:55,260-281,327-355`).
- **Fazer:** Em `src/components/talkx/report/`: `TalkXReportPerformance.tsx` (Recharts: Enviados e Entregues em área, Respostas e Conversões em linha; seletor Diário/Por hora; eixo conforme a granularidade; tooltip com data por extenso e as 4 séries; legenda; série sem fonte não é desenhada). `TalkXReportFunnel.tsx` (SVG com trapézios proporcionais; 5 degraus com número, % e rótulo; degrau sem fonte omitido; seletor "Todos os segmentos" que refaz a RPC com `p_segment`, oculto quando a campanha tem 1 segmento). `TalkXReportHeatmap.tsx` (grade 7×24 Seg→Dom no fuso da campanha; seletor Respostas/Envios/Cliques; legenda em degraus "Menor volume → Maior volume"). Os três com tabela `sr-only` e navegação por teclado; cores por token de tema.
- **Aceite:** Testes de unidade: funil com 4 degraus quando não há link; largura do degrau = % sobre enviados; heatmap começa na segunda e usa o fuso da campanha; troca Diário/Por hora muda `p_granularity`. Print 1672×941 da linha de gráficos ao lado do mock 14.
- **V3:** V38
- **Negócio:** Dá para ver a campanha no tempo, onde as pessoas pararam no caminho até a venda e em que dia e hora mais responderam.

### X165 · Montar "Resumo da campanha" e "Insights" com ações

- **Fase:** 12 · **Tela:** 14 · **Camada:** front · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X041, X057, X066, X075, X076, X161, X162, X163
- **Fecha:** T14-049, T14-050, T14-051, T14-052, T14-053, T14-054, T14-055, T14-056, T14-057, T14-058, T14-059, T14-060, T14-076, T14-077, T14-078, T14-079, T14-080, T14-081
- **Dependências, em detalhe:** X041, X161, X162, X163 ; CAP-001/CAP-002 (rascunho e destinatários), CAP-012 (vários segmentos), CAP-077, CAP-086 (trilha do motor) ; CAP-083, CAP-085 (trilha de supressão e analytics)
- **Hoje:** Campanha concluída mostra só "Saúde da Campanha" (status, conexão, início) (`TalkXLiveMonitor.tsx:165-169`). O assistente recusa campanha não editável (`TalkXView.tsx:95-103`). "Melhor horário" é o pico de envios de todas as campanhas com o texto "para maior taxa de abertura", sem dado de leitura (`TalkXAnalytics.tsx:310-320`). Investimento, receita e ROI não aparecem em tela nenhuma.
- **Fazer:** `TalkXReportSummary.tsx`: Objetivo (rótulo do enum + `description`), Audiência (segmento ou "Seleção manual" + total), Segmentos (quantidade e nomes), Template utilizado (nome + `v<template_version_number>`) com "Visualizar" (modal do kit com `PhoneFrame` mostrando texto e mídia enviados), Duração (início–fim e nº de dias), Responsável (avatar + nome), Investimento (editável por admin/supervisor via `talkx_set_campaign_investment`), Receita gerada e ROI (`talkx_campaign_revenue`; ROI oculto sem investimento). "Ver campanha" abre `TalkXCampaignDetailsSheet.tsx` (configuração somente leitura: mensagem, audiência, agenda, limites). `TalkXReportInsights.tsx`: cartões vindos de `insights` (acima da média, melhor horário de resposta, segmento em destaque, oportunidade), cada um com botão que executa algo: abrir a comparação, iniciar campanha com a janela sugerida, abrir a aba Segmentos, criar rascunho com quem clicou e não converteu (seleção manual). "Ver mais insights" abre painel com todas as regras e o motivo das que estão ocultas (base mínima). Título "Insights"; selo "IA · Beta" e texto redigido por modelo só com `talkx_settings.ai_insights` ligado (CAP-086).
- **Aceite:** Testes de componente: ROI ausente sem investimento e "2.694%" com 8.940/320; salvar investimento chama a RPC e existe 1 evento `investment_updated` com ator; cartão sem base mínima não renderiza; nenhum texto menciona "abertura"; botão "Oportunidade" cria rascunho com N destinatários = clicaram sem conversão. Print ao lado do mock 14.
- **V3:** V39, V83 (parte da tela 14)
- **Negócio:** O relatório mostra o resumo da campanha com investimento, receita e ROI, e recomendações que já levam à próxima ação.

### X166 · Entregar as abas Segmentos, Links, Audiência e Conversões e seus cartões-resumo

- **Fase:** 12 · **Tela:** 14 · **Camada:** front · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X037, X038, X040, X056, X057, X162, X163
- **Fecha:** T14-013, T14-014, T14-015, T14-016, T14-065, T14-066, T14-067, T14-068, T14-069, T14-070, T14-071, T14-072, T14-073, T14-074, T14-075
- **Dependências, em detalhe:** X056, X162, X163 ; CAP-012, CAP-014 ; `dados:uf`, `dados:vendedor`, `dados:rfm_segmento`, `dados:status_cliente`
- **Hoje:** Nenhuma tela lê `talkx_links`, `talkx_link_clicks` ou `talkx_conversions` (`grep -rn "talkx_links\|talkx_conversions" src` só `types.ts`). Por segmento existe só um KPI entre campanhas (`TalkXAnalytics.tsx:69-88,216-222`).
- **Fazer:** Em `src/components/talkx/report/`: `TalkXReportSegments.tsx` (aba com todos os segmentos + cartão "Segmentos com Melhor Desempenho" com os 3 primeiros: #, Segmento, Enviados, Respostas, Conversões, Taxa Conv. em selo). `TalkXReportLinks.tsx` (aba com todos os links + cartão "Principais Links Clicados" com 5: #, Link, Cliques, Taxa de Clique com barra; "Ver todos →" troca para a aba). `TalkXReportAudience.tsx` (destinatários por UF, vendedor, segmento RFM e status do cliente, com `TalkXAttributeCoverage` quando o atributo não tem dado, + lista paginada). `TalkXReportConversions.tsx` (total, receita e lista paginada: contato, valor, origem link/negócio/site, data). Sem fonte: cartão oculto na Visão geral e estado "sem dados ainda" na aba.
- **Aceite:** Testes de componente com retorno fixo da RPC: 3 segmentos ordenados por taxa; 5 links com barra proporcional; campanha sem link → cartão ausente e aba com estado vazio; aba Audiência mostra o aviso de cobertura quando `dados:uf` = 0. Print da linha de cartões ao lado do mock 14.
- **V3:** V37, V39
- **Negócio:** Dá para comparar segmentos, ver quais links foram clicados, quem recebeu e quais vendas vieram da campanha.

### X167 · Entregar as abas Mensagens, Respostas e Logs com paginação no servidor

- **Fase:** 12 · **Tela:** 14 · **Camada:** front · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X025, X027, X028, X033, X055, X162, X163
- **Fecha:** T14-012, T14-017, T14-018
- **Dependências, em detalhe:** X162, X163 ; CAP-010, CAP-018, CAP-020, CAP-055, CAP-100 (trilha do motor) ; tabela e paginação do kit (trilha do kit)
- **Hoje:** Mensagens de campanha concluída aparecem em "Destinatários" do Monitor, limitadas a 200 (`TalkXLiveMonitor.tsx:173-200`). Respostas não aparecem em tela nenhuma (`grep -rn "replied_at" src/components/talkx` vazio). Eventos ficam em "Linha do Tempo" (`TalkXLiveMonitor.tsx:203-221`).
- **Fazer:** `src/components/talkx/report/TalkXReportRowsTable.tsx` (tabela e paginação do kit; busca e filtro no servidor via `talkx_campaign_report_rows`), usada por: aba Mensagens (contato, mensagem enviada do snapshot, status, enviado em, entregue em, erro; filtro por status e segmento); aba Respostas (contato, trecho da resposta, respondeu em, tempo até responder, "Abrir conversa" levando ao atendimento do contato); aba Logs (eventos da campanha com ator e motivo + log por destinatário de CAP-100; filtro por tipo). 25 linhas por página; nenhuma lista inteira carregada no navegador.
- **Aceite:** Teste de componente: troca de página chama a RPC com `p_offset` certo; busca com atraso de digitação; "Abrir conversa" navega para o contato. E2E com RPC interceptada: aba Mensagens lista 3 destinatários e pagina.
- **V3:** V37
- **Negócio:** Cada mensagem enviada, cada resposta e o histórico do que aconteceu ficam consultáveis, mesmo em campanhas grandes.

### X168 · Exportar o relatório em PDF (sem `window.print`) e CSV, com permissão e trilha

- **Fase:** 12 · **Tela:** 14 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X162, X163, X164, X165
- **Fecha:** T14-008, CAP-088
- **Hoje:** Não há exportação no Talk X (`grep -rniE "csv|Blob|jspdf" src/components/talkx` vazio). `jspdf` e `jspdf-autotable` estão instalados e só são usados fora do módulo (`package.json:75-76`). Impressão é bloqueada no app inteiro (`src/hooks/ui/useScreenProtection.ts:147`).
- **Fazer:** `src/lib/talkxCsv.ts` (serializador: UTF-8 com BOM, separador `;`, escape de aspas e quebras, célula iniciada por `=`, `+`, `-`, `@`, tab ou CR gravada como texto). `src/lib/talkxReportPdf.ts` (jsPDF + autotable por import dinâmico: cabeçalho, KPIs, resumo, funil, segmentos, links e insights em tabelas; gráficos convertidos de SVG para imagem; nenhuma chamada a `window.print`). Botão "Exportar relatório" abre menu: PDF do relatório, CSV de destinatários, de respostas, de conversões e de links. Visível só para admin/supervisor com `can_download` (`src/hooks/system/useDownloadPermission.ts`); as linhas vêm de `talkx_campaign_report_rows` com `p_for_export=true` — permissão e evento ficam no banco. Exportação longa mostra progresso e pode ser cancelada.
- **Aceite:** `src/lib/__tests__/talkxCsv.test.ts` (aspas, `;`, quebra de linha, acento, `=CMD()` vira texto); teste do botão: ausente sem `can_download`; teste do PDF: arquivo com 2 páginas ou mais e `window.print` não chamado (spy). Após exportar: `SELECT count(*) FROM talkx_campaign_events WHERE event_type='report_exported' AND campaign_id=<id>` = 1.
- **V3:** V40
- **Negócio:** Quem tem permissão baixa o relatório em PDF e as listas em planilha, e fica registrado quem exportou.

### X169 · Compartilhar o relatório por link interno e por e-mail; menu de mais ações

- **Fase:** 12 · **Tela:** 14 · **Camada:** edge + front · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X021, X026, X161, X163, X165
- **Fecha:** T14-009, T14-010, CAP-089, CAP-090
- **Dependências, em detalhe:** X021 (tipo de evento), X161, X163, X165 ; CAP-109 (duplicar campanha, trilha do motor)
- **Hoje:** Não existe "Compartilhar". O e-mail "Enviar Relatório" só aparece na tela de campanha em andamento (`src/components/talkx/TalkXCampaignRunning.tsx:704-715`). A edge só aceita o dono da campanha (`supabase/functions/talkx-report/index.ts:60-71`), envia só contadores e lê no máximo 2.000 destinatários (`:95-100`).
- **Fazer:** Botão "Compartilhar": (a) "Copiar link" do endereço do relatório — quem abre sem permissão de leitura da campanha vê o estado "sem permissão" do kit; (b) "Enviar por e-mail": modal do kit com destinatários escolhidos entre usuários internos. Edge `talkx-report`: aceitar dono ou admin/supervisor; campanhas `completed|cancelled`; `to` validado contra `profiles` (sem endereço externo); conteúdo montado a partir de `talkx_campaign_report` (KPIs, funil, receita/ROI, link do relatório); limite de 5 envios por usuário por hora; evento `report_shared` com ator e quantidade de destinatários; sem `RESEND_API_KEY` → 503, mostrado como "E-mail não configurado". Menu "⋯": Ver campanha, Duplicar campanha (CAP-109), Enviar por e-mail, Editar investimento.
- **Aceite:** `supabase/functions/talkx-report/index.test.ts`: admin que não é dono → 200; agente não dono → 403; e-mail fora de `profiles` → 422; corpo contém a taxa de entrega e o ROI da RPC. Teste de componente do menu e do "Copiar link". Após o deploy: envio real para o próprio usuário e 1 evento `report_shared`.
- **V3:** V40
- **Negócio:** O relatório pode ser passado adiante por link (só abre para quem tem acesso) ou enviado por e-mail a colegas.
