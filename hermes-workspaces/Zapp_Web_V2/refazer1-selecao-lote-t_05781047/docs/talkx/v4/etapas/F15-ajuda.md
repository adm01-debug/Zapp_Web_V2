# Fase 15 — Ajuda (X189–X191)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 16. 3 etapas.
>
> **Entrega da fase:** Central de ajuda com artigos, guias e checklist ligado à campanha em edição.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de dados, links, relatório, importação e ajuda** (etapas X189, X190, X191)

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

### X189 · Transformar a Ajuda em central com artigos em markdown, índice, busca e leitor

- **Fase:** 15 · **Tela:** 16 · **Camada:** front + docs + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055
- **Fecha:** T16-001, T16-002, T16-003, T16-006, T16-007, T16-008, T16-010, T16-019, T16-020, T16-026
- **Dependências, em detalhe:** busca do módulo com ⌘K e roteamento de telas do módulo (trilha do kit, A1) ; kit de estados
- **Hoje:** `src/components/talkx/TalkXHelp.tsx:45-126` é um `Dialog` com 5 seções de texto fixo, aberto pelo "?" (`TalkXView.tsx:251-256,261`). Sem busca, endereço próprio ou artigos; `docs/talkx/help/` não existe; não há renderizador de markdown no `package.json`. ⌘K pertence à paleta global (`src/components/keyboard/GlobalKeyboardProvider.tsx:82`). O E2E exige `role=dialog` e fechar com Esc (`e2e/talkx.spec.ts:66-80`).
- **Fazer:** Estrutura `docs/talkx/help/<topico>/<artigo>.md` e `docs/talkx/help/guias/<guia>.md`, com frontmatter (título, tópico, tipo `artigo|guia`, nível, ordem, palavras-chave). `src/components/talkx/help/`: `talkxHelpIndex.ts` (carrega por `import.meta.glob` sob demanda, valida frontmatter, calcula minutos de leitura pela contagem de palavras), `TalkXHelpCenter.tsx` (tela, não modal), `TalkXHelpArticle.tsx` (leitor com `react-markdown`, sem HTML cru; voltar, anterior/próximo), `useTalkXHelpSearch.ts` (busca no cliente por título, palavras-chave e corpo, sem acento, com destaque, setas e Enter, estado "nada encontrado"). Tela: tile de foguete, "Ajuda do Talk X", subtítulo do mock; campo "O que você precisa de ajuda hoje?" com a dica do atalho; chips de exemplo que preenchem a busca; grade de tópicos com a contagem real de artigos; "Ver todos os artigos"; lista "Guias recomendados" (número, título, subtítulo, minutos, selo de nível, seta) e "Ver todos os guias". ⌘K: registro de atalho por tela no `GlobalKeyboardProvider` — com a Ajuda aberta, ⌘K foca a busca da Ajuda; fora dela nada muda. Endereço `?view=talkx&screen=help&topic=<t>&article=<a>`; o "?" do cabeçalho abre a tela. Conteúdo inicial: as 5 seções atuais viram 5 arquivos. Reescrever o caso de `e2e/talkx.spec.ts:66-80`.
- **Aceite:** Testes de unidade: índice (frontmatter inválido falha o teste), busca ("supressao" acha "Supressão"), contagem por tópico = nº de arquivos. E2E: clicar em Ajuda → título "Ajuda do Talk X" → buscar → abrir artigo → voltar; ⌘K na Ajuda foca o campo e não abre a paleta; ⌘K fora da Ajuda abre a paleta. Print 1672×941 ao lado de `docs/talkx/references/16_Ajuda_TalkX.png`.
- **V3:** V91
- **Negócio:** A Ajuda vira uma página com busca e artigos, que podem ser corrigidos e ampliados sem mexer em tela.

### X190 · Escrever os 8 tópicos e os 5 guias da Ajuda

- **Fase:** 15 · **Tela:** 16 · **Camada:** docs + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X118, X163, X164, X165, X166, X167, X168, X169, X171, X172, X173, X174, X175, X189
- **Fecha:** T16-011, T16-012, T16-013, T16-014, T16-015, T16-016, T16-017, T16-018, T16-021, T16-022, T16-023, T16-024, T16-025
- **Dependências, em detalhe:** X189 ; telas descritas já na `main`: importação e CRM (X171…X175), relatório (X163…X169), links (X118), supressão e analytics (trilha de supressão e analytics), agendamento e envio (demais trilhas)
- **Hoje:** O conteúdo de ajuda são 5 parágrafos fixos (`src/components/talkx/TalkXHelp.tsx:61-123`). Nada sobre supressão/LGPD, boas práticas, métricas, agendamento ou erros (`grep -n -i "supress\|LGPD" src/components/talkx/TalkXHelp.tsx` vazio).
- **Fazer:** Em `docs/talkx/help/`, um artigo-base por tópico do mock (300–500 palavras, passos numerados, nomes de botão iguais aos da tela): Primeira campanha; Segmentação com CRM 360°; Templates com variáveis; Lista de supressão e LGPD; Boas práticas de envio; Como interpretar analytics; Agendamento e simulação humana; Solução de erros comuns (inclui conexão caída, `outcome_unknown`, variável sem valor, link não cadastrado). 5 guias passo a passo com os títulos do mock e nível no frontmatter: Como criar sua primeira campanha (Iniciante); Segmentando com o CRM 360° na prática (Intermediário); Criando templates com variáveis (Iniciante); Configurando lista de supressão (LGPD) (Intermediário); Analisando resultados da campanha (Avançado). A contagem "N artigos" de cada cartão e os minutos de cada guia são calculados dos arquivos — os números do mock (8, 12, 10… artigos; 5–8 min) não são copiados. Cada texto descreve só o que está na `main`. Script `scripts/talkx-help-lint.mjs`: frontmatter válido, 8 tópicos com 1 artigo ou mais, 5 guias, links internos existentes, nenhum rótulo de botão fora da lista extraída de `src/components/talkx`.
- **Aceite:** `node scripts/talkx-help-lint.mjs` com saída 0 no CI; teste do índice: 8 tópicos e 5 guias; cada guia seguido do começo ao fim em produção por uma pessoa que não conhece o código, com o resultado registrado em `docs/talkx/PARIDADE.md` (tela 16).
- **V3:** V91, V96 (parte de ajuda)
- **Negócio:** Os oito assuntos e os cinco passo a passo da Ajuda passam a ter texto de verdade, escrito sobre o sistema como ele é.

### X191 · Ligar checklist, guia rápido, suporte, especialista e vídeos da Ajuda

- **Fase:** 15 · **Tela:** 16, 08 · **Camada:** banco + front + docs · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X016, X017, X020, X021, X060, X189, X190
- **Fecha:** T16-004, T16-005, T16-009, T16-027, T16-028, T16-029, T16-030, T16-031, T16-032, T16-033, T16-034, T16-038, T16-039
- **Dependências, em detalhe:** X021, X189, X190 ; CAP-003 (audiência no servidor), CAP-028/CAP-030 (supressão), CAP-039/CAP-043 (janela e fuso), CAP-074 (variável sem valor), CAP-110 (configurações vivas) — trilha do motor ; validação de pré-lançamento da tela 09 (trilha do wizard): se já existir uma RPC, usar a mesma
- **Hoje:** Não há checklist, guia rápido, canal de suporte nem vídeos (`grep -rniE "checklist|suporte|especialista|video" src/components/talkx/TalkXHelp.tsx` vazio). `talkx_settings` não tem chave de contato (7 chaves; `supabase/migrations/20260930410000*`). Não há registro de leitura de artigo.
- **Fazer:** Migration: seeds `support_contact` e `specialist_contact` em `talkx_settings` (jsonb: canal `whatsapp|chat_interno|email`, destino, horário), vazios por padrão e validados; tabela `talkx_help_views` (artigo, usuário, data; insert próprio; leitura agregada por RPC `talkx_help_top_topics(p_days)`); RPC `talkx_campaign_preflight(p_campaign)` (INVOKER) com 5 itens: segmento com contatos elegíveis, variáveis do template resolvidas, mídia acessível e rótulos de link cadastrados, supressão conferida, agenda com data futura/janela/fuso. Front: "Checklist antes de enviar" — com campanha em edição (aberta a partir do assistente, ou o rascunho mais recente do usuário) cada item mostra o estado real da RPC e leva ao passo a corrigir; sem campanha, os itens aparecem como orientação, sem o visto verde, cada um com link para o artigo. "Abrir guia rápido" abre `docs/talkx/help/guia-rapido.md` (1 página, escrito aqui) no leitor. "Falar com suporte" e "Falar com especialista" abrem o canal configurado (WhatsApp em nova aba, chat interno ou e-mail); sem configuração, botão desabilitado com o motivo e atalho para Configurações (admin). No cartão de contato, o horário de atendimento configurado ocupa o lugar do "tempo médio de resposta". "Vídeos e tutoriais": a seção lê `docs/talkx/help/videos.json` e só renderiza itens cujo arquivo existe em `public/talkx/help/videos/`; duração e capa saem do próprio arquivo; com 0 vídeos a seção não aparece. "Tópicos mais buscados": com 30 leituras ou mais em 90 dias, ordena por `talkx_help_top_topics`; antes disso o título é "Tópicos" e a ordem é fixa.
- **Aceite:** Teste SQL: `talkx_campaign_preflight` em rascunho sem destinatários devolve o item de segmento como pendente e, com o fixture completo, os 5 como ok; agente não lê `talkx_help_views` de outro usuário. Testes de componente: sem campanha não há visto verde; contato não configurado → botão desabilitado com motivo; `videos.json` vazio → seção ausente; menos de 30 leituras → título "Tópicos". Print 1672×941 da coluna direita ao lado do mock 16.
- **V3:** V91
- **Negócio:** A Ajuda mostra o que falta conferir na campanha que está sendo montada e tem botões de contato que levam a alguém de verdade.
