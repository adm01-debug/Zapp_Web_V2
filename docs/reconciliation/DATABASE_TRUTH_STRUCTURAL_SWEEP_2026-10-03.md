# Database Truth — varredura estrutural de 2026-10-03

Baseline de código: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`, repositório `adm01-debug/Zapp_Web_V2`. Consolidação documental de evidências já coletadas, sem nova consulta ao banco, apply, repair de ledger, deploy ou teste de produção.

## Resultado e limite da conclusão

O baseline contém **801 arquivos SQL em `supabase/migrations/**`: 779 ativas e 22 arquivadas**. O run de CI capturado em 03/10/2026, às 21:42 UTC, registrou **779 migrations no repositório contra 781 no ledger**, com duas versões extras e divergência de artefatos derivados. A conclusão é uma divergência comprovada naquele run, não uma medição nova nem uma declaração de que o ambiente permaneceu igual depois dele. [Inventário de banco](evidence/database_surface_inventory.json) e [auditoria dos runs](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

Existência de SQL no Git, correção incorporada em PR, presença em catálogo exportado e validação do comportamento vivo são evidências diferentes. Nenhuma delas foi convertida automaticamente em conclusão global de conformidade do banco. [Taxonomia de estados](STATUS_TAXONOMY.md) e [revisão independente](reports/adversarial/INDEPENDENT_REVIEW_2026-10-03.md).

## 1. Inventário por superfície

| Superfície | Quantidade | Interpretação |
|---|---:|---|
| SQL em todo o repositório | 871 | Inclui migrations, testes e outras superfícies SQL |
| SQL sob `supabase/migrations/**` | 801 | Inventário completo por caminho desse diretório |
| Migrations ativas, diretamente no diretório de execução | 779 | Arquivos que participam do inventário ativo do repositório |
| SQL arquivadas em `_foreign/` e seus subdiretórios | 15 | Evidência de escopos externos/históricos; não aplicar automaticamente ao banco atual |
| SQL arquivadas em `_superseded/` | 7 | Histórico substituído ou explicitamente cancelado; preservar |
| **Arquivadas, total** | **22** | **15 + 7; fora das 779 ativas** |
| Entradas `supabase/functions/*/index.ts` | 73 | Superfície de Edge Functions no Git; não atestado de deploy |
| Migrations registradas na revisão semântica dirigida Team Chat | 33 | Subconjunto examinado pelo módulo, além do inventário estrutural global |

Fontes: [inventário integral](evidence/inventory-summary.json) e [inventário detalhado de banco](evidence/database_surface_inventory.json). A antiga conta de 794 arquivos fora de `_superseded/` incluía 15 SQL em `_foreign/`; ela não deve ser apresentada como quantidade de migrations ativas. O inventário classifica caminhos; não prova aplicação ou autorização de cada objeto em um ambiente.

A extração global de definições registra a sucessão de nove RPCs selecionadas em 779 arquivos ativos. Graphify também extraiu dependências de código com suporte SQL. Essas ferramentas ajudam a localizar a última definição e seus consumidores, mas não constituem revisão semântica de todas as funções, policies ou migrations. [Histórico de definições](evidence/function-definition-history.json), [manifesto Graphify](evidence/graphify_evidence_manifest.json) e [relatório Team Chat](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

## 2. Como interpretar as fontes de verdade

| Evidência | O que permite afirmar | Limite que permanece |
|---|---|---|
| Migration versionada e sucessão das definições | Intenção de schema e histórico de alteração no baseline | Aplicação, ordem efetiva e efeitos sobre dados reais |
| Types, catálogo, manifesto e baseline de grants versionados | Contrato exportado no instante de sua geração | Frescor frente ao ambiente; não substituem a leitura do corpo e dos grants efetivos |
| Código consumidor e chamadas RPC por string | Contratos esperados por frontend, Edge, scripts e testes | Uso por clientes externos e comportamento de uma sessão real |
| Log de CI com run e data identificados | Resultado e causa daquele teste naquele instante | Estado posterior do ambiente e fluxos não exercitados |
| Evidência funcional autenticada | Cenário, identidade e invariantes efetivamente exercitados | Outros papéis, caminhos e instantes não cobertos |

A aplicação desses limites está documentada nos [achados Team Chat](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md), na [auditoria de CI](reports/git/PR_ISSUE_AUDIT_2026-10-03.md) e na [reconciliação histórica de banco](reports/modules/HISTORICAL_DATABASE.md). A última linha descreve a prova ainda necessária para diversos critérios; esta atualização documental não a produziu.

## 3. Drift demonstrado pelo CI capturado

O [run 37155983222](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37155983222) registra as seguintes versões presentes no ledger e ausentes do diretório ativo do repositório:

| Versão | Nome registrado |
|---|---|
| `20261003182707` | `fixture_e2e_aba_arquivos_midia` |
| `20261003192707` | `fixture_e2e_aba_arquivos_segunda_midia` |

Nesse mesmo run, o guard identificou divergência em types, catálogo, manifesto e baseline de grants. A contagem de Edge Functions ficou em **73 declaradas / 73 diretórios**. A igualdade de diretórios não atesta hashes de deploy ou comportamento de todas as funções. Sincronizar os quatro artefatos derivados da PR #1863, isoladamente, não reconcilia as duas entradas extras do ledger. [Análise e causas do CI](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

O **DB offline** falhou por outro motivo: bootstrap do PostgreSQL descartável, socket ausente e exit 2 após tentativas, no [run 37155670839](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37155670839). Esse resultado não demonstra reprovação de RLS ou de um contrato SQL que não chegou a ser executado. Ocorrências textuais de `ERROR` em controles negativos tampouco devem ser tratadas isoladamente como defeito do produto. [Separação das causas de falha](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

A issue #1862 corresponde ao drift observado. A #1454 relata uma falha anterior de geração da sincronização; a evidência mais recente já mostra geração da PR #1863. Portanto, o impedimento atual dessa PR e as entradas extras do ledger precisam de pendências próprias. Nenhuma issue foi encerrada nesta auditoria. [Issues reconciliadas](reports/git/PR_ISSUE_AUDIT_2026-10-03.md) e [snapshot das abertas](evidence/open-issues.json).

## 4. Correções existentes e contratos que continuam incompletos

As correspondências históricas confirmadas são **#1265 → PR #1309**, **#1266 → PR #1313** e **#1267 → PR #1314**. As correções foram incorporadas em 30/09/2026 e estão no baseline; as issues continuam abertas no snapshot. Não há motivo para reimplementar essas correções apenas porque a issue permanece aberta. A aplicação e o comportamento autenticado atual continuam sendo critérios separados. [Correções históricas](evidence/historical_issue_corrections.json) e [adjudicação de issues](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

A revisão dirigida encontrou pendências distintas das correções já incorporadas:

| Contrato | Evidência estática atual | Tratamento necessário |
|---|---|---|
| Storage e mídia Team Chat | Convenções de path, identidade do proprietário, CHECKs da mensagem e renderer não estão alinhados | Rever o fluxo de envio, leitura e exclusão como uma unidade |
| Conversa direta | Redefinição posterior removeu a escrita do par canônico e o tratamento de conflito | Restaurar a invariância concorrente por alteração nova e validar duas transações |
| Saída e remoção de membro | RPCs usam `role`, enquanto o schema expõe `member_role` | Corrigir o contrato e as invariantes de owner antes de migrar consumidores |
| Grants de conversa | REVOKEs de colunas coexistem com grant de UPDATE na tabela | Avaliar privilégio efetivo; a presença do REVOKE sozinho não comprova restrição |
| Departamento e WhatsApp | Configuração segura prevista está ausente do inventário consultado; hook usa contrato de credenciais restrito e tabela inexistente | Corrigir os contratos antes de habilitar a interface atualmente inacessível |
| Recibos e reações | A correção de membership existe, mas não fecha todas as inconsistências de `conversation_id` em escrita direta | Validar derivação de identidade e operações INSERT/UPDATE por cenário |

As referências por arquivo/linha e os critérios de aceite estão em **TC-001 a TC-005 e TC-009** do [relatório Team Chat](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md). Os achados de RPCs latentes e de gestão de departamento não demonstram exposição ativa pela interface. A existência de uma URL legada de mídia também não prova, por si, acesso público ao objeto.

## 5. Preservação do histórico e premissas superadas

As **22 SQL arquivadas** devem permanecer como evidência histórica ou de escopo externo, com `DELETE-X`. Não são um lote de migrations pendentes de aplicar. Entre elas estão as quatro migrations correspondentes aos passos 3–6 do plano embutido de 27/08, que o próprio documento cancela expressamente: saved filters, entity versions, integração Gmail antiga e políticas RLS antigas. Não se deve registrá-las como aplicadas apenas porque objetos semelhantes existem hoje. [Inventário dos arquivos arquivados](evidence/database_surface_inventory.json) e [reconciliação dos 200 passos históricos](reports/modules/HISTORICAL_DATABASE.md).

Os dois planos embutidos de agosto preservam seus 200 identificadores e seus limites de revisão. Instruções antigas sobre origem, banco externo, self-hosted, contagem de tabelas ou preenchimento do ledger não recuperam autoridade operacional apenas por constarem desses planos. Onde há somente relato histórico, o estado permanece `NEEDS_REVALIDATION`; cancelamentos expressos e sucessões demonstradas são registrados separadamente. [Avaliação por passo](evidence/assessment-historical_database.json.gz) e [relatório histórico](reports/modules/HISTORICAL_DATABASE.md).

Também é necessário verificar a última definição antes de ressuscitar uma proteção antiga: a reconciliação encontrou funções e triggers removidos por migrations posteriores, além de um trigger de mascaramento sem efeito de proteção de SELECT. A mera existência de seu arquivo inicial não prova que a proteção esteja vigente. [Sucessões e limitações históricas](reports/modules/HISTORICAL_DATABASE.md).

## 6. Guardas existentes e condições para trabalho futuro

A evidência local já preservada contém cinco guardas estáticas de CI aprovadas e 150 testes de contratos CI/deploy aprovados. Esses resultados verificam aspectos como pinagem, escopo de secrets, inventário de testes e comportamento de ferramentas; não eliminam o drift registrado nem substituem contratos de banco executados. [Guardas estáticas](evidence/ci-static-guards.json) e [contratos locais](evidence/ci-contract-tests.json).

Uma intervenção futura deve primeiro identificar a relação exata entre arquivo, ledger, definição efetiva e artefatos derivados, preservando o run e o SHA utilizados. A correção deve seguir as guardas vigentes e manter alterações de schema já aplicadas imutáveis, com eventual evolução em migration nova. Atestação pós-apply e cenários autenticados permanecem critérios de aceite quando o requisito depende deles. Este documento não autoriza DDL, repair de ledger, mudança de banco de referência, deploy ou remoção de arquivos. O procedimento de revisão está no [plano de limpeza segura](SAFE_CLEANUP_PLAN.md).
