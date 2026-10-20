# Fase 13 — Importação e vínculo com o CRM (X170–X175)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 15. 6 etapas.
>
> **Entrega da fase:** Importar planilha de contatos com regras de correspondência, fila de pendentes e resolução de conflitos.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de dados, links, relatório, importação e ajuda** (etapas X170, X171, X172, X173, X174, X175)

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

### X170 · Criar tabelas e RPCs de ingestão da importação de contatos

- **Fase:** 13 · **Tela:** 15 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014, X021, X036
- **Fecha:** CAP-091 (banco)
- **Dependências, em detalhe:** X036 (`talkx_data_jobs`), X021 (tipos de evento) ; CAP-096
- **Hoje:** Não existem `talkx_imports` nem `talkx_import_rows` (`grep -c "talkx_import" supabase/schema-catalog.json` = 0). A única entrada de contato vindo do CRM é 1 por vez (`src/components/contacts/ContactCRMDialog.tsx:28-56`).
- **Fazer:** Migration. `talkx_imports`: origem `file|crm360`, nome/tamanho/hash do arquivo, mapeamento, opções de correspondência e de duplicados, carteira padrão, base de consentimento, campanha de destino, status `draft|uploaded|matching|review|applying|completed|failed|cancelled`, contadores (importados, vinculados, pendentes, conflitos, duplicados, inválidos, suprimidos), cursor, criado por. `talkx_import_rows`: nº da linha, dados originais, nome, telefone normalizado, e-mail, empresa, documento, status `new|invalid|duplicate_file|duplicate_local|pending|conflict|linked|created|ignored|suppressed`, contato local, sugestão, confiança 0–100, regra que casou, origem, resolvido por/em. RLS: leitura só admin/supervisor; escrita só por RPC. RPCs DEFINER com papel: `talkx_import_create`, `talkx_import_append_rows` (até 500 linhas por chamada, 50.000 por importação, 2.000 caracteres por célula; normaliza telefone para `^[0-9]{10,15}$` com DDI 55 padrão; marca inválidos e repetidos dentro do arquivo; grava como texto célula iniciada por `= + - @`), `talkx_import_set_options`, `talkx_import_summary()` (contadores da última importação, da anterior, variação e série das 8 últimas). Função de expurgo dos dados originais e do documento 30 dias após concluir (linha em `talkx_data_jobs`).
- **Aceite:** `scripts/db-audit/talkx-import-schema.test.sh`: agente → 42501; 501 linhas → erro; `(11) 98765-4321` vira `5511987654321`; `=1+1` gravado como texto; mesma linha duas vezes → 1 `new` + 1 `duplicate_file`; `talkx_import_summary` com 2 importações devolve a variação esperada. `supabase-usage-guard.mjs` com `novas: 0`.
- **V3:** V86
- **Negócio:** O sistema passa a guardar cada importação com seu resultado, linha por linha, para acompanhar e auditar depois.

### X171 · Criar a tela de importação: entrada, envio seguro do arquivo, mapeamento, prévia e regras

- **Fase:** 13 · **Tela:** 15, 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X168, X170
- **Fecha:** T15-001, T15-002, T15-003, T15-004, T15-005, T15-006, T15-007, T15-008, T15-018, T15-019, T15-020, T15-021, T15-022, T15-023, T15-024, T15-025, T15-026, T15-027, T15-028, T15-033, T15-039 ; T01-063 (inventário A — destino da ação rápida)
- **Dependências, em detalhe:** X168 (`talkxCsv.ts`), X170 ; kit (trilha do kit)
- **Hoje:** Não há tela de importação nem entrada para ela (`ls src/components/talkx` sem `TalkXImport*`; "Ações rápidas" tem 3 itens, `src/components/talkx/TalkXOverview.tsx:298-304`). Não há leitor de CSV/XLSX nem área de soltar arquivo (`package.json` sem `papaparse`/`xlsx`; `grep -rniE "dropzone|type=\"file\"" src/components/talkx` vazio).
- **Fazer:** Em `src/components/talkx/import/`: `TalkXImport.tsx`, `TalkXFileDropzone.tsx`, `TalkXImportMappingDialog.tsx`, `talkxImportParser.worker.ts`; `src/hooks/integrations/useTalkXImport.ts`. Entrada: ação rápida "Importar contatos" na Visão geral e endereço `?view=talkx&screen=import`; a Supressão (T06-054, trilha de supressão e analytics) reutiliza `TalkXFileDropzone` e o leitor. Cabeçalho no shell (A1): breadcrumb "Campanhas › Importar contatos", título e subtítulo do mock, seletor "Campanha atual" (rascunhos e agendadas; grava `target_campaign_id` — ao concluir, os contatos viram um segmento utilizável nela), cartão "Hoje" com a data real. Abas "Importar CSV · CRM 360 · Resolver Conflitos": a barra do topo e a do cartão são o mesmo estado. Arquivo `.csv`/`.xlsx` até 10 MB, com checagem de extensão e assinatura (zip para xlsx; sem byte nulo para csv), leitura em Web Worker (`parseCsv` acrescentado a `talkxCsv.ts`: BOM, `;` ou `,`, aspas, quebras; XLSX por `read-excel-file`, 1ª planilha, teto de tamanho descompactado) e envio em blocos de 500. Chip do arquivo: nome, nº de contatos do arquivo inteiro, tamanho, "Arquivo carregado", remover. "Configurações Avançadas": mapeamento de colunas sugerido pelo cabeçalho, prévia de 20 linhas com contagens (válidas, telefone inválido, repetidas), tipo de contato, tags, carteira, base de consentimento, limiar de confiança. Cartões "Regras de Correspondência" e "Detecção de Duplicados" com as 8 opções do mock, gravadas em `talkx_imports.options` ("Documento" desabilitada com motivo se nenhuma coluna foi mapeada). Só admin/supervisor.
- **Aceite:** Testes do leitor (BOM, aspas com quebra, `;`, xlsx de exemplo, 10 MB + 1 byte recusado, binário renomeado recusado); teste de componente: soltar e selecionar por teclado, mapeamento sugerido, opções persistidas; E2E com RPC interceptada: enviar `e2e/fixtures/talkx-import.csv` (12 linhas) → prévia mostra 12 e 1 inválida. Print 1672×941 da metade esquerda ao lado de `docs/talkx/references/15_Importacao_Vinculacao_CRM360.png`.
- **V3:** V86
- **Negócio:** Aparece "Importar contatos": dá para soltar uma planilha, conferir as colunas e ver a prévia antes de qualquer contato ser criado.

### X172 · Detectar duplicados e aplicar a importação com carteira, consentimento e supressão

- **Fase:** 13 · **Tela:** 15 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X017, X032, X036, X170
- **Fecha:** T15-034, T15-035, T15-036, CAP-091
- **Dependências, em detalhe:** X036, X170 ; CAP-027/CAP-028 (supressão), CAP-104 (consentimento) — trilha do motor
- **Hoje:** Duplicado só é checado 1 a 1, por telefone, no navegador (`ContactCRMDialog.tsx:31-38`). `contacts.phone` é único. `contacts.consent_status` é `unknown` em toda a base e `assigned_to` define a carteira; nenhuma rotina em lote aplica carteira, consentimento ou supressão.
- **Fazer:** Migration com RPCs (DEFINER; admin/supervisor ou `service_role`). `talkx_import_match_local(p_import, p_limit)`: conforme as opções, procura contato local por telefone e por e-mail, agrupa repetidos por e-mail e por telefone, marca `duplicate_local` com `contact_id`; com "Verificar duplicados" desligado, só o telefone (restrição única) impede a criação. Conflito = a linha casa com 2 ou mais contatos locais, ou o contato local já está vinculado a outro contato do CRM, ou nome/e-mail/empresa do arquivo divergem do contato local. `talkx_import_apply_batch(p_import, p_limit)`: cria contatos novos em lotes de 200 com chave idempotente por linha — `assigned_to` = carteira escolhida (padrão: quem importou); `consent_status='granted'` só quando a coluna de consentimento mapeada diz sim, senão `unknown`; `lead_origin='importacao'`; tag `importacao:<id curto>`; telefone em `talkx_blacklist` ativa → linha `suppressed`, fora do segmento de destino; nunca sobrescreve campo preenchido de contato existente. Ações por linha e em massa (até 200): `talkx_import_rows_link` (grava `crm_contact_links` com `link_source='import'`; `23505` vira conflito), `talkx_import_rows_create`, `talkx_import_rows_ignore`, idempotentes e com ator. Ao concluir: segmento em `talkx_segments` com a regra "tag contém `importacao:<id curto>`" e evento `import_completed`.
- **Aceite:** `scripts/db-audit/talkx-import-match.test.sh` com 50 linhas e resultado esperado calculado à parte (novos, duplicados por telefone, por e-mail, conflitos, suprimidos); reaplicar o lote não cria contato repetido; contato existente mantém nome e e-mail; contatos criados obedecem ao critério de contato visível; linha suprimida fica fora do segmento.
- **V3:** V87
- **Negócio:** A importação não duplica contato, respeita a lista de supressão, coloca cada contato na carteira certa e só marca consentimento quando a planilha traz essa informação.

### X173 · Sugerir vínculo no CRM 360 pelas regras ligadas e executar a importação em lotes

- **Fase:** 13 · **Tela:** 15 · **Camada:** edge + banco + cron · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X036, X170, X172
- **Fecha:** T15-029, T15-030, T15-031, T15-032, CAP-091, CAP-092
- **Hoje:** O CRM só é consultado por telefone e para contato que já existe no ZAPP (`supabase/functions/_shared/crm-integration-contract.ts:1-6`; `crm-integration/index.ts:271-299`), com 12 s de timeout e 60 chamadas por minuto por usuário (`index.ts:11,135`). Não há busca por e-mail, documento ou nome + empresa, nem nota de confiança.
- **Fazer:** RPC `talkx_import_set_suggestions` (só `service_role`). Ação `importSuggestBatch` em `crm-integration` (admin/supervisor ou cron dedicado): até 50 linhas de uma importação em `matching`; conforme as regras ligadas consulta o CRM, somente leitura: e-mail em `contact_emails`, telefone com DDD em `contact_phones`, documento em `contacts.cpf`/`companies.cnpj`, nome + empresa por `search_contacts_advanced` com similaridade calculada na edge. Confiança: documento 98, e-mail 95, telefone 92, nome + empresa 60–89 conforme a similaridade; dois sinais concordando chegam a 99; candidatos divergentes → `conflict`. No limiar ou acima (padrão 90) vincula sozinho; 60–89 fica `pending` com sugestão; sem candidato → "Nenhuma sugestão". Origem gravada = `source` do contato no CRM quando existir, senão "CRM 360"; linha sem correspondência = "Planilha". Orçamento de 20 s por chamada; `talkx_run_data_jobs()` reinvoca importações em `matching`/`applying` e a tela também puxa enquanto aberta; estados avançam `uploaded → matching → review → applying → completed`; cancelamento respeitado entre lotes. CRM indisponível: a importação fica em `matching` com `error_code`; nada se perde.
- **Aceite:** Teste Deno com CRM simulado, 6 linhas (e-mail exato, telefone exato, documento, nome parecido, dois candidatos, nenhuma) → confiança e estado esperados; regra desligada não é consultada (asserção sobre as chamadas); timeout → importação continua `matching`. Em produção com arquivo interno de 20 linhas: `SELECT status, count(*) FROM talkx_import_rows WHERE import_id=<id> GROUP BY 1` soma 20.
- **V3:** V87, V88
- **Negócio:** Para cada contato da planilha o sistema procura o cliente correspondente no CRM, diz o quanto confia e só vincula sozinho quando a confiança é alta.

### X174 · Executar a importação com progresso, KPIs e fila de pendentes de vínculo

- **Fase:** 13 · **Tela:** 15 · **Camada:** front · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X170, X171, X172, X173
- **Fecha:** T15-009, T15-010, T15-011, T15-012, T15-013, T15-014, T15-015, T15-016, T15-017, T15-037, T15-038, T15-040, T15-041, T15-042, T15-043, T15-044, T15-045, T15-046, T15-047, T15-048, T15-049, T15-050, T15-051, T15-052, T15-053, T15-054, T15-055, T15-056, T15-057
- **Dependências, em detalhe:** X170, X171, X172, X173 ; tabela, KPI, filtro, paginação e modais do kit (trilha do kit)
- **Hoje:** `KpiCard`, `TalkXPagination` e `FilterBarV2` existem no kit (`src/components/talkx/talkxShared.tsx:501,386,864`), mas nenhuma tela lista linhas de importação (`grep -rn "talkx_import" src` vazio). A tela criada em X171 termina no envio do arquivo.
- **Fazer:** Botão "Iniciar Importação e Vinculação" (habilitado com arquivo carregado e mapeamento válido; modal de confirmação do kit com linhas, regras, carteira e consentimento) → barra de progresso por fase (procurando duplicados, consultando CRM, criando contatos), cancelar e relatório final por categoria. 4 KPIs de `talkx_import_summary`: Contatos Importados, Vinculados, Pendentes de Vínculo, Conflitos Detectados, com variação contra a importação anterior e barras das últimas importações — ambas ocultas na primeira importação. Cartão "Contatos pendentes de vínculo": tabela (seleção, Contato com avatar/iniciais e e-mail, Empresa, Telefone formatado, Origem com o valor real — CRM 360, origem registrada no CRM ou Planilha —, Sugestão de vínculo, Confiança em selo verde a partir de 80 e âmbar abaixo, Vincular/Criar/Ignorar); linha sem sugestão com "Nenhuma sugestão · Criar novo contato"; busca por contato, empresa ou telefone; "Filtros" (origem, faixa de confiança, com/sem sugestão, só possíveis duplicados); seleção em massa com barra de ações; "Ver todos"; rodapé "Mostrando X a Y de N", paginação numerada e seletor 10/25/50 por página, tudo no servidor. Recusa do vínculo por identidade divergente move a linha para conflito, com aviso. "Ignorar" tem desfazer por 5 s.
- **Aceite:** Testes de componente: Vincular chama `talkx_import_rows_link` e a linha sai da fila; seleção de 3 + Ignorar chama a RPC com 3 ids; paginação e filtros mudam os parâmetros da consulta; KPI sem importação anterior não mostra variação. E2E com RPC interceptada: iniciar → progresso → KPIs somam 12. Print 1672×941 ao lado do mock 15.
- **V3:** V88
- **Negócio:** Dá para iniciar a importação, acompanhar o andamento e resolver, um a um ou em bloco, os contatos que o sistema não vinculou sozinho.

### X175 · Entregar as abas "CRM 360" (trazer contatos em lote) e "Resolver Conflitos"

- **Fase:** 13 · **Tela:** 15, 08 · **Camada:** edge + front · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X036, X055, X170, X172, X173, X174
- **Fecha:** T15-058, T15-059, CAP-091, CAP-092
- **Dependências, em detalhe:** X036, X170, X172, X173, X174 ; estado "CRM indisponível" do kit (trilha do kit)
- **Hoje:** Trazer contato do CRM só 1 por vez (`ContactCRMDialog.tsx:40-50`). A busca avançada do CRM existe fora do módulo (`src/hooks/crm/useAdvancedContactSearch.ts:46`). Duplicado local só se resolve em `ContactMergeDialog` (RPC `merge_contacts_atomic`). O cartão "CRM 360°" do assistente está desabilitado (`src/components/talkx/TalkXCampaignWizard.tsx:255`).
- **Fazer:** Aba "CRM 360": busca no CRM por `search_contacts_advanced` (vendedor, ramo, UF, segmento RFM, cliente ativo), seleção da página ou do resultado inteiro (até 5.000), contagem prévia "já estão no ZAPP / novos / sem WhatsApp" e "Trazer selecionados", que cria uma importação `source='crm360'` pela ação nova `importFromCrm` de `crm-integration` (somente leitura no CRM; linhas já com sugestão de confiança 100) e segue o mesmo motor (duplicados locais, carteira, consentimento, supressão). Aba "Resolver Conflitos": linhas `conflict` das importações e divergências de `talkx_crm_link_issues` (X036) com comparação lado a lado (arquivo × contato local × CRM) e ações: manter o local, usar o dado do arquivo nos campos vazios, vincular ao candidato escolhido, unir contatos locais (`merge_contacts_atomic`), ignorar — cada uma com ator e data. Estado "CRM indisponível" do kit quando `health` falha ou a flag `crm.integration` está desligada. Com vínculos existentes e `health` ok, habilitar o cartão "CRM 360°" do assistente apontando para esta aba.
- **Aceite:** Teste Deno de `importFromCrm` (100 contatos simulados → 100 linhas; contato sem telefone → `invalid`); teste de componente das 5 resoluções (RPC certa por ação); vincular 1 contato interno real e conferir `SELECT link_source FROM crm_contact_links WHERE zapp_contact_id=<id>` = `import`; CRM fora do ar → estado do kit.
- **V3:** V88, V89
- **Negócio:** Dá para buscar clientes no CRM e trazê-los em bloco para o WhatsApp, e resolver num só lugar os casos em que os cadastros não batem.
