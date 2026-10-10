# Auditoria bidirecional — local, GitHub e Supabase canônico

> Snapshot histórico da coleta da manhã. Houve novos merges e deployment completo depois dele. Consulte a [triagem complementar de conteúdo local](./TRIAGEM_CONTEUDO_LOCAL_DESTINO_GITHUB_BANCO_2026-09-22.md) para a reclassificação dos merges temporários e das Edge Functions. Os números abaixo permanecem como registro do instante original.

Data: 22/09/2026. Fuso de apresentação: America/Sao_Paulo (UTC−03).
Repositório: `adm01-debug/Zapp_Web_V2`.
Banco canônico: `tnnnlkbymytvtqngbbqh`.
Commit de referência: `36a5b4fabae5f9e5d6c64828e23946fff13c53ad`.

## 1. Veredito executivo

**Não há comprovação de sincronização integral de todas as informações entre todos os ambientes.**

Há uma distinção importante entre o diretório efetivamente aberto no IDE, a branch `main` do GitHub, o banco e o frontend publicado:

| Dimensão | Resultado | Evidência / ressalva |
| --- | --- | --- |
| Diretório original do IDE → GitHub | HISTÓRICO PRESENTE; CHECKOUT ATRASADO | HEAD `7d3682c8` é ancestral de main; 0 commits exclusivos nessa branch, 69 atrás |
| GitHub main → arquivos originais do IDE | DIVERGENTE | 55 caminhos diferentes; 3 migrations ainda não estão nesse checkout |
| Worktree isolado desta auditoria → main | IGUAL NO CÓDIGO-BASE | Base `36a5b4fa`; os documentos desta auditoria são novos e não publicados |
| GitHub main ↔ ledger canônico | IGUAL NO CONJUNTO DE VERSÕES | 446 versões únicas; sem versão exclusiva de um dos lados na execução viva |
| GitHub main ↔ estrutura auditada de `public` | VERIFICADO NO INSTANTE DA COLETA | Catálogo e manifesto frescos comparados; ACLs e tipos também passam na CI |
| GitHub main ↔ SQL histórico integral | PROVA INCOMPLETA | 431 entradas satisfazem o verificador, incluindo exceções; 15 não têm prova histórica do conteúdo |
| GitHub main ↔ frontend Vercel | BUILD ID COINCIDENTE | `version.json` responde com `36a5b4fa...`; deployment Production bem-sucedido |
| GitHub main ↔ Edge Functions implantadas | NÃO COMPROVADO ATUALMENTE | Último artefato localizado é de 16/09, escopo `talkx-link`; 26 funções têm fontes/manifestos diferentes desde ele |
| Todos os históricos locais → GitHub | INCOMPLETO / REQUER TRIAGEM | 4 merges de branch temporária não alcançáveis pelas heads remotas; objetos Git não alcançáveis preservados |
| Dados operacionais do banco ↔ Git | NÃO É UMA PARIDADE A SER BUSCADA | Contatos, mensagens, auth, arquivos e secrets não devem ser espelhados indiscriminadamente no Git |
| Banco remoto ↔ réplica local de dados | NÃO VALIDADO | Não foi identificada/configurada uma réplica local canônica com escopo de dados autorizado |

Portanto, **“schema atual passou na CI” não significa “todos os arquivos locais, todo o histórico e todas as funções em execução são idênticos”**.

## 2. Escopo, isolamento e cadeia de evidência

### 2.1. O que foi feito

- Inspeção do working tree original, refs locais/remotas, ancestralidade, equivalência de patches, arquivos ignorados e integridade de objetos Git.
- Comparação de migrations e snapshots entre o checkout original e a main auditada.
- Consulta autenticada ao GitHub para workflows, artefatos, PRs, deployments e proteção de branch.
- Download de artefatos estruturais recém-gerados pelo DB Live Guard e comparação independente dos JSONs com a main.
- Consulta HTTP somente leitura ao `version.json` público.
- Comparação do manifesto atual de Edge Functions com a última evidência de deployment localizada.
- Execução de 121 testes locais dos verificadores de paridade, migrations e deployment.
- Registro dos limites de prova, sem fabricar equivalência de SQL histórico.

### 2.2. Separação do trabalho do outro agente

- Diretório original preservado: `/home/joaquim_ataides/projetos/Zapp_Web_V2/Zapp_Web_V2`.
- Branch original preservada: `fix/inbox-resgate-logica-pr384`.
- Auditoria em branch própria: `audit/codex-sync-20260922`.
- Worktree independente: `/tmp/zapp-codex-sync-audit-20260922`.
- A branch de auditoria não tem upstream configurado.
- A base isolada foi atualizada para `36a5b4fa`; não houve checkout, stash, reset ou atualização dos arquivos do diretório original.
- Fetches compartilham objetos/refs Git entre worktrees, mas não substituem os arquivos nem a branch do outro agente.
- **Nenhum push, merge, deployment, alteração de secrets ou mutação de banco foi executado nesta auditoria.**

### 2.3. Recorte temporal

O GitHub avançou durante a coleta: de `c35b3c25` para `36a5b4fa`. Os resultados de schema, build e código neste relatório estão ancorados no segundo commit, não em uma main móvel sem identificação.

- Inventário de refs/arquivos: `2026-09-22T11:46:42.170Z` (08:46:42 BRT).
- DB Live Guard final: início em `2026-09-22T11:45:24Z`.
- Manifesto fresco: `2026-09-22T11:45:48Z` (08:45:48 BRT).
- Nova PR #474 apareceu em consulta posterior; isso não altera a base auditada.
- Qualquer merge posterior exige nova comparação de delta.

Os artefatos estruturais da CI têm retenção configurada de **3 dias**. Os hashes abaixo identificam o conteúdo coletado; não substituem armazenamento durável ou assinatura de proveniência.

## 3. Local ↔ GitHub

### 3.1. Diretório original

| Item | Valor observado |
| --- | --- |
| HEAD físico | `7d3682c8aedfa5f031192b3ef7ac3c4b1c611f6d` |
| Branch | `fix/inbox-resgate-logica-pr384` |
| Upstream dessa branch | Ausente no remoto |
| Working tree | Limpo |
| Arquivos não rastreados e não ignorados | 0 |
| Stashes | 0 |
| Arquivos rastreados no checkout original | 2.361 |
| Arquivos rastreados na main auditada, antes deste relatório | 2.371 |
| HEAD físico versus main | 0 à frente / 69 atrás |
| Branch local `main` | `dd210916...`, 0 à frente / 70 atrás |
| Caminhos diferentes entre HEAD físico e main | 55 |
| Migrations no checkout físico | 443 |
| Migrations na main | 446 |

**Causa imediata da divergência local:** o IDE permanece em uma branch antiga, embora seu trabalho já esteja contido na história da main. Não foi encontrada uma alteração não commitada esperando publicação nesse checkout.

As três migrations presentes na main e no ledger, mas ausentes do checkout físico:

1. `20260920120000_talkx_e90_fk_indexes.sql`
2. `20260920120100_autovacuum_hot_tables.sql`
3. `20260920120200_drop_idx_email_threads_gmail_account_redundante.sql`

O manifesto do checkout antigo também difere em índices: três entradas adicionadas e uma removida na main. Atualizar apenas o frontend local, sem esses arquivos/snapshots, mantém uma visão desatualizada do banco.

**Não reaplicar essas migrations para “sincronizar o IDE”: elas já constam do ledger canônico.** A correção do checkout é uma operação de Git, não de SQL.

### 3.2. Histórico e branches

No inventário congelado:

- 28 branches locais, incluindo a branch desta auditoria.
- 70 heads remotas.
- 52 heads remotas não têm uma branch local de mesmo nome. Isso é normal e não significa perda de arquivos.
- 18 branches locais têm patches sem equivalência de patch-id com a main.
- Isso **não prova** que 18 funcionalidades estejam faltando: squash, reimplementações e substituições exigem análise semântica.
- Os commits dessas branches estão alcançáveis por heads remotas, exceto os quatro merges abaixo.
- Nenhuma tag local ou remota; nenhum submódulo identificado. `.gitattributes` não declara filtro Git LFS.

Branch `tmp/integracao-e50`: quatro merges locais não alcançáveis por nenhuma das heads remotas examinadas:

```text
e772c599e4fb9d83546cf22be116a1721660c2d1
f25cbd07b1eda6e7eb4e5f7446a2e72e1b0ab637
477a1d9ec55ff54fd2ac409359be2be3fa226d53
e92754dc4ab624876bf7e570c548eec2adeea291
```

A API de commits do GitHub respondeu HTTP 422 para os quatro hashes completos. Eles não foram recuperáveis pela consulta realizada. Isso não autoriza afirmar ausência de qualquer cópia interna no GitHub, nem que suas funcionalidades estejam ausentes da main.

`git fsck --full --no-reflogs --unreachable` terminou com exit 0, sem corrupção indicada. A contagem final observada foi de 58 commits, 300 trees e 220 blobs não alcançáveis desconsiderando reflogs. São objetos preservados localmente, não conteúdo novo automaticamente aprovado para publicação. Nenhum garbage collection, prune ou exclusão foi feito.

**Ação segura:** antes de limpar branches/objetos, fazer backup local protegido e classificar diferenças de árvores/merges; publicar apenas o que tiver utilidade e não contiver material sensível.

### 3.3. Arquivos ignorados e artefatos locais

Foram observados, entre outros:

- `.claude/settings.local.json`
- `node_modules/`, `dist/`, `coverage/`
- `playwright-report/`, `test-results/`
- `supabase/.temp/`
- `graphify-out/` e variações em subdiretórios
- `.husky/_/`
- `tsconfig.*.tsbuildinfo`
- `deno.lock`

Esses caminhos não devem ser enviados em bloco ao GitHub. Configurações locais e diretórios temporários podem conter credenciais ou estado específico de máquina. Outputs reproduzíveis normalmente devem permanecer ignorados.

`deno.lock` merece uma decisão explícita de reprodutibilidade: está ignorado por regra do projeto. Sua ausência do Git não é um arquivo “esquecido” demonstrado, mas impede atribuir a esse lockfile local uma garantia de build reproduzível na CI.

Nenhum `Zone.Identifier` rastreado foi encontrado.

O build local em `dist/version.json` informou `local-1790073241297`, não um Git SHA. Não há prova de que esse bundle local corresponda à main auditada ou à produção. O diretório `dist/` não foi reconstruído ou apagado.

### 3.4. PRs abertas na consulta final

- [#474 — favoritos no Supabase](https://github.com/adm01-debug/Zapp_Web_V2/pull/474): aberta, não incluída no commit auditado.
- [#470 — favorito/kit](https://github.com/adm01-debug/Zapp_Web_V2/pull/470): aberta.
- [#466 — tipografia](https://github.com/adm01-debug/Zapp_Web_V2/pull/466): draft.
- [#460 — atualização supabase-js](https://github.com/adm01-debug/Zapp_Web_V2/pull/460): aberta.

Código em uma PR está no GitHub, mas não necessariamente na main, no frontend de produção ou no banco. Nenhuma dessas PRs foi mergeada por esta auditoria.

## 4. GitHub ↔ banco canônico

### 4.1. Identidade e fonte da validação

A prova remota utilizada foi a execução viva, recém-concluída, da própria CI:

[DB Live Guard #35723234925](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35723234925), commit `36a5b4fa`, resultado **success**.

O workflow exige a credencial de destino, valida o endpoint contra a identidade versionada, aplica TLS `verify-full` com CA fixada e somente então executa os guardas. A execução anterior [#35722607510](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35722607510), em `c35b3c25`, também passou.

**Não foi uma conexão SQL direta desta sessão ao banco.** As credenciais locais necessárias não estavam presentes nas variáveis esperadas. Um MCP disponível retornou PostgreSQL 17.6, mas isso não identifica sozinho o projeto; sua configuração não comprovou o destino canônico. Não foi utilizado para consultar dados de negócio.

### 4.2. O que o guard realmente verificou

- Identidade do endpoint e configuração TLS.
- Arquivos de migrations versus `supabase_migrations.schema_migrations`.
- ACL/contrato de `mcp_exec` e `mcp_exec_many`.
- ACL de `webhook_failures`.
- Catálogo gerado do banco versus arquivo versionado.
- Manifesto estrutural gerado do banco versus arquivo versionado.
- Frescor de `src/integrations/supabase/types.ts`, desconsiderando comentários de geração.
- Conjunto de versões e conteúdo do baseline de grants.
- A perna de Edge Functions desse guard é apenas local; ver seção 6.

Dois JSONs do banco foram baixados e comparados novamente nesta auditoria. Ordenação de chaves e metadado `generated_at` foram desconsiderados, não estruturas ou definições. Não foi detectada diferença nos objetos cobertos.

| Objeto / dimensão | Quantidade |
| --- | ---: |
| Tabelas | 144 |
| Views | 8 |
| Assinaturas de colunas | 1.570 |
| Nomes distintos de funções não trigger no catálogo | 92 |
| Assinaturas de funções no catálogo | 93 |
| Entradas de funções no manifesto, incluindo seu escopo ampliado | 131 |
| Índices | 505 |
| Defaults | 781 |
| Policies RLS | 400 |
| Flags de RLS por tabela | 144 |
| Triggers | 89 |
| Constraints | 483 |
| Tipos no manifesto | 5 |
| Entradas de grants de rotinas | 347 |
| Entradas de grants de relações | 4.625 |
| Entradas de grants de colunas | 6 |
| Entradas de grants de schema | 7 |
| Entradas de default grants | 102 |
| Entradas de grants de tipos | 10 |

92, 93 e 131 não são uma inconsistência: medem nomes, assinaturas e conjuntos de funções com escopos diferentes.

Hashes dos artefatos baixados:

```text
fresh-catalog.json
SHA-256 3fa54177adf0089e91bc96694553852294381384ed2a386f52c15325d47332f1

fresh-manifest.json
SHA-256 9d210c118a6133740ac088daa94b27818be8ed4520be91b2d5ba456cf68e5184

Conjunto de 446 versões — MD5 de comparação:
00026469842e2f57d09eb6be62406b22

Grants normalizados — MD5 de comparação:
86017833ff4a0b94543094691762328d
```

Os MD5 são fingerprints usados pelos scripts para comparação; não devem ser promovidos a prova criptográfica de autoria ou execução histórica.

### 4.3. Ledger: 446 versões não significam 446 provas de conteúdo

Saída do guard:

```text
ATENCAO: 4 migration(s) legada(s) sem hash/SQL verificavel no ledger;
versao e nome disponivel foram validados.
OK: 446 versoes unicas; nomes coerentes;
431 conteudo(s)/hash(es) historico(s) verificado(s);
11 arquivo(s) legado(s) fixado(s) sem prova de conteudo historico.
```

A reconciliação correta dos números é **431 + 11 + 4 = 446**.

- As 431 entradas aprovadas incluem exceções verificadas pelos critérios do manifesto. Não significa que todas sejam SQL bruto idêntico.
- O arquivo `migration-evidence.json` contém 50 exceções: 38 `ledger-divergence/pinned-replay`, 11 `ledger-only/name-and-file-pinned` e 1 `ledger-only/comment-only`.
- Os 38 replays e o caso comment-only pertencem ao conjunto aceito pelo verificador; não devem ser somados como novas migrations.
- **Há 15 migrations sem prova histórica de conteúdo**, e não apenas as “seis” mencionadas em uma comunicação anterior.

As 11 exceções com nome e arquivo fixados:

| Versão | Nome no ledger |
| --- | --- |
| 20260827120000 | fk_indexes_backfill |
| 20260827130000 | fix_gmail_crypto_search_path_and_missing_key |
| 20260827140000 | fix_sicoob_bridge_url_official_db |
| 20260827150000 | sicoob_bridge_use_pg_net |
| 20260827160000 | scope_search_contacts_to_rls_m01 |
| 20260828000000 | 20260828000000_guard_secdef_batch |
| 20260901200001 | e23_default_queue_rls_policies |
| 20260902000200 | fix_cron_avatars_refresh_key |
| 20260902000700 | fix_search_contacts_order_tiebreaker |
| 20260902120000 | team_chat_v3_parity_reactions_status_departments |
| 20260906000001 | e31_contacts_is_lid_legacy |

As quatro que aparecem como avisos adicionais:

1. `20260901000002_messages_unique_dedup_index.sql`
2. `20260902023200_consolidate_rls_select_messages_contacts.sql`
3. `20260902023300_add_check_constraints_high_write_tables.sql`
4. `20260907200000_add_get_conversation_tab_counts_rpc.sql`

Essa lacuna **não prova schema incorreto nem justifica reaplicar SQL**. O estado estrutural atual coberto foi comparado com sucesso. Para melhorar a rastreabilidade, formalizar os quatro avisos, preservar os fatos conhecidos e registrar qualquer verificação atual com data atual — nunca inventar um hash antigo ou reescrever o ledger para aparentar uma prova inexistente.

### 4.4. O que continua fora dessa prova

Os extratores estruturais têm foco em `public`. Não foi certificada paridade integral para:

- Linhas de contatos, empresas, mensagens, campanhas e demais dados operacionais.
- `auth.users`, sessões, identidades ou dados de autenticação.
- Storage: conteúdo de objetos, checksums de mídia, policies/configuração de buckets fora do recorte auditado.
- Valores e efetividade de secrets.
- Jobs do `pg_cron`, configuração operacional de extensões e rotas externas.
- Publicações do Realtime e configuração fora dos objetos extraídos.
- Opções de tabela como parâmetros de autovacuum.
- Restauração real de backups/PITR em ambiente isolado.
- Todos os estados de negócio sob autenticação/RLS por persona.

Por exemplo: a migration de autovacuum está registrada, mas o manifesto não extrai os `reloptions` das tabelas. Portanto, o guard atual não prova que esses parâmetros continuam configurados em runtime.

**Não copiar dados de clientes para o GitHub para resolver essas lacunas.** Elas pedem inventário agregado/estrutural adicional e testes em ambiente apropriado, com dados anonimizados e privilégios mínimos.

## 5. GitHub ↔ frontend Vercel

- Deployment Production identificado: `6589858128`.
- Status: `success`, registrado em `2026-09-22T11:45:43Z`.
- [version.json de produção](https://zapp-web-v2.vercel.app/version.json): HTTP 200.
- Conteúdo relevante: `buildId = 36a5b4fabae5f9e5d6c64828e23946fff13c53ad`.

Isso comprova o identificador do build servido no endpoint consultado e sua correspondência com o commit. **Não equivale a um E2E autenticado completo**, nem verifica todos os chunks de uma aba antiga, service workers, sessões ou configurações runtime.

O bundle local com buildId `local-...` não foi certificado como igual a esse frontend.

## 6. Edge Functions: maior lacuna de deployment

### 6.1. Evidência atual versus evidência antiga

Manifesto atual da main:

- 67 funções.
- 91 arquivos de fonte contabilizados.
- SHA-256 do manifesto de fontes: `2b6713dff63a61dad733cb1aff6b13738b6a558c80b3524f2e04e53e886b283f`.
- Gerador executado com `--check`: aprovado.

Último deployment encontrado no workflow:

- [Deploy Edge Functions #35119028563](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35119028563).
- Início: `2026-09-16T15:59:54Z`.
- Commit: `59a0864cf756cf6aa6f36378f252230ac4ccd0cf`.
- Resultado: success.
- Projeto declarado: `tnnnlkbymytvtqngbbqh`.
- **Escopo efetivamente implantado: `talkx-link`, não todas as funções.**

O artefato contém 67 funções reconciliadas. Isso é um inventário; não significa 67 deployments feitos naquele run.

### 6.2. Funções com diferença de fonte/manifesto

Comparação por entrada de função entre o manifesto atual e o arquivado: **26 diferenças**. Dependências compartilhadas podem afetar mais funções do que a quantidade de arquivos diretamente editados.

```text
ai-auto-tag
ai-churn-analysis
ai-classify-tickets
approve-password-reset
auth-login
batch-fetch-avatars
bitrix-api
cleanup-rate-limit-logs
connection-health-check
create-user
evolution-sync
evolution-webhook
fetch-link-preview
get-sip-password
message-delivery
migrate-media-storage
recover-corrupted-audios
send-rate-limit-alert
send-scheduled-report
sentiment-alert
sicoob-bridge
sicoob-bridge-reply
talkx-link
talkx-send
webauthn
webhook-diagnostic
```

**Conclusão limitada e correta:** falta evidência atual suficiente para atestar a implantação dessas fontes na produção. Isso não prova que estejam antigas: outro agente pode ter usado deploy manual fora do workflow.

A tentativa de inventário via CLI, com project-ref canônico explícito, não obteve inventário remoto autenticado nesta sessão. Não foi contornado o controle de acesso nem usado MCP de outro projeto.

### 6.3. Limites dos smokes existentes

O artefato antigo registra 67/67 smokes aprovados. Os testes cobrem disponibilidade/CORS e cenários negativos de autenticação/kill switch/gateway, conforme a função.

- Um OPTIONS/HTTP 200 com CORS correto não demonstra uma consulta autenticada de negócio funcionando.
- Para origem proibida, a prova é a ausência de permissão CORS para aquela origem; não necessariamente um HTTP 403.
- Um HTTP 401 prova rejeição anônima naquele ponto, não funcionamento das integrações downstream.
- Não foram enviados disparos, campanhas, webhooks reais ou mensagens a clientes para “testar”.

**Para fechar a lacuna:** inventário canônico atual + proveniência por função/bundle + digest do pacote comparável + smoke positivo autenticado e não destrutivo, além dos negativos. Hash de fonte e hash de bundle são domínios diferentes e não podem ser comparados como se fossem iguais.

## 7. Falhas e riscos encontrados no mecanismo de auditoria

### A-01 — Checkout antigo produz uma visão local incompleta

Prioridade alta de coordenação. O IDE está 69 commits atrás e tem 443 migrations. Ações locais feitas a partir dele podem recriar correções já existentes ou gerar conflitos.

Correção recomendada: combinar com o outro agente a base de trabalho; usar worktrees próprios ancorados na main e atualizar o IDE somente em um checkpoint acordado.

### A-02 — Não há atestado atual para o conjunto de Edge Functions

Prioridade alta de verificação. Há 26 diferenças de fonte/manifesto desde a última evidência localizada e aquela execução foi parcial.

Correção recomendada: coletar inventário e hashes atuais antes de decidir sobre novo deploy. Não publicar todas as funções indiscriminadamente.

### A-03 — “Paridade tripla verificada” pode ser impressa com duas verificações puladas

Reprodução local em `scripts/db-audit/check-triple-parity.mjs`:

```text
[migrations] pulado: DESTINO_URL ausente
[edges] manifesto=67 diretorios=67
[grants] pulado: DESTINO_URL ausente
OK: paridade tripla verificada.
exit 0
```

Referências na base auditada:

- Linhas 83–86: migrations são puladas sem credencial.
- Linhas 104–116: edges comparam nomes no manifesto e diretórios **locais**.
- Linhas 120–123: grants são pulados sem credencial.
- Linha 153: mensagem global positiva mesmo com skips.

Prioridade média. **Isso não invalida a execução viva usada neste relatório**, pois o workflow exige credenciais antes do guard. Contudo, invalida interpretar a saída local como atestado completo.

Correção recomendada: resultado por dimensão `PASS/SKIPPED/FAIL/UNVERIFIED`, sumário agregado honesto, modo obrigatório `--require-live` e verificação separada de deployment remoto. Não misturar ausência de divergência local com prova remota.

### A-04 — Cobertura histórica insuficiente e contagem antiga incorreta

Prioridade média de governança. São 15 entradas sem prova histórica do conteúdo, incluindo quatro apenas em warnings.

Correção recomendada: atualizar a documentação, formalizar as quatro exceções sem fabricar provas e preservar o inventário de limitações.

### A-05 — Histórico local não é inteiramente recuperável via heads remotas

Prioridade média de preservação. Quatro merges temporários locais e objetos não alcançáveis precisam de triagem antes de limpeza.

Correção recomendada: backup protegido e comparação semântica, sem merge em massa.

### A-06 — Guard estrutural não cobre toda a configuração do banco

Prioridade média. `public` sincronizado não atesta Storage, Cron, Realtime, autovacuum, segredos e dados.

Correção recomendada: ampliar manifestos de configuração sem expor valores sensíveis, definir explicitamente o que fica fora e testar recuperação de backup em ambiente isolado.

### A-07 — Build local sem proveniência de commit

Prioridade média de diagnóstico. O identificador `local-...` impede vincular o bundle local ao código auditado.

Correção recomendada: build isolado com SHA declarado e validação desse identificador, sem apagar artefatos do outro agente.

### A-08 — Proteção de branch e promoção não são a mesma barreira

Configuração observada:

- 6 checks obrigatórios, modo strict.
- 1 aprovação requerida.
- Checks: Lint/TypeCheck, Unit Tests, Build, Security Audit, Contrato DB offline e CodeQL.
- `enforce_admins = false`.
- Nenhum ruleset retornado na consulta efetuada.
- DB Live Guard é pós-merge; não é um gate de PR.
- Deployment Production já estava success enquanto a CI completa desse commit ainda estava em andamento; depois ela terminou com sucesso.

Não foi identificado quem usou ou deixou de usar algum bypass. **O fato comprovado é que a ordem observada não espera o término da CI inteira para disponibilizar o build.**

Correção recomendada: revisar bypasses administrativos e definir promoção de produção condicionada aos gates aprovados. Não disponibilizar credenciais do banco de produção em PRs não confiáveis para tentar antecipar o DB Live Guard.

### A-09 — Evidência operacional com retenção curta

Prioridade média de auditabilidade. Artefatos do DB guard expiram em três dias.

Correção recomendada: preservar relatório/hash/proveniência sanitizados e retenção apropriada; manter dumps, dados e credenciais fora de documentação pública. Hash sem o artefato original ajuda identificar conteúdo, mas não recuperá-lo.

## 8. Testes e simulações realizados

| Verificação | Resultado | Interpretação |
| --- | --- | --- |
| Integridade Git (`fsck`) | exit 0 | Sem corrupção indicada; objetos não alcançáveis não são falha de integridade |
| Migrations locais da main | 446 versões válidas | Checagem local; consulta remota não disponível nessa invocação |
| Gerador do manifesto de Edge | PASS | 67 funções / 91 arquivos locais consistentes |
| Supabase usage guard | PASS | Nenhuma violação detectada pelo guard; não é prova de integração completa |
| Paridade tripla sem credencial | exit 0 com 2 skips | Reproduz o falso sumário de cobertura completa |
| Testes de migrations/catalog/manifest/paridade/edges | **121/121 PASS** | 0 falhas, 0 skips, 0 cancelados |
| CI/CD main #35723234776 | success | Lint/TypeCheck, unitários, segurança e build passaram; geração opcional de relatório de auditoria foi skipped |
| DB offline #35723234825 | success | Contratos offline passaram |
| CodeQL #35723234845 | success | Análise terminou com sucesso |
| DB Live Guard #35723234925 | success | Prova viva delimitada pela seção 4 |
| Build ID público | MATCH | Frontend servido identifica `36a5b4fa` |
| Gitleaks nos dois documentos novos | PASS | Nenhum segredo detectado; não equivale a varredura de todo o histórico |
| Link relativo do relatório | PASS | Inventário referenciado existe; links HTTP não foram todos revalidados por este verificador |
| Preservação do diretório original | PASS | Branch/HEAD originais mantidos e working tree limpo na conferência final |

A suíte local de 121 testes foi executada novamente ao consolidar este relatório: 121 pass, 0 fail, 0 skipped, duração aproximada de 3,6 segundos.

Conferência final às 08:58 BRT: a main remota ainda apontava para `36a5b4fa`. Os dois documentos desta auditoria estavam apenas no worktree isolado, não rastreados, sem commit ou push. O verificador textual não encontrou whitespace final nem links locais quebrados.

Não foram declarados como executados nesta rodada: suite completa da aplicação local, E2E autenticado de todas as telas, teste de carga de produção, envio de mensagens, replay integral das 446 migrations em banco novo ou restauração de backup.

Comando reproduzível da suíte dirigida:

```bash
node --test \
  scripts/db-audit/check-migration-drift.test.mjs \
  scripts/db-audit/check-catalog-fresh.test.mjs \
  scripts/db-audit/check-manifest-fresh.test.mjs \
  scripts/db-audit/check-triple-parity.test.mjs \
  scripts/edge-deploy/manifest.unit.mjs \
  scripts/edge-deploy/smoke-functions.unit.mjs
```

Simulações cobertas pela rodada e/ou testes específicos: arquivos versus ledger divergentes; exceções históricas; comparação de manifesto fresco; ausência de credencial; manifesto de funções desatualizado; respostas negativas de gateway/CORS; não envio de POST a webhook público. A aprovação dessas simulações é uma prova dos verificadores, não de todas as funções de negócio.

## 9. Sequência segura para fechar as lacunas

1. Congelar SHA de referência e combinar ownership de branch/worktree com o outro agente.
2. Preservar os quatro merges temporários e objetos relevantes antes de limpeza.
3. Atualizar o checkout de trabalho escolhido por fast-forward, depois de confirmar working tree e concordância do agente proprietário. Não fazer reset destrutivo.
4. Reclassificar as 18 branches por equivalência semântica: incorporada, substituída, pendente ou descartável.
5. Corrigir a semântica de skips do guard de paridade e testar o modo obrigatório vivo.
6. Registrar corretamente 431 entradas com critério satisfeito e 15 sem prova histórica; formalizar os quatro warnings.
7. Obter inventário atual de Edge Functions pelo projeto canônico e mapear cada função ao artefato/commit efetivamente implantado.
8. Se houver drift comprovado de deployment, preparar diff de impacto, rollback e deploy controlado somente do escopo aprovado.
9. Executar negativos e positivos autenticados não destrutivos por função; evitar mensagens/campanhas reais.
10. Ampliar cobertura de configuração do banco (Cron, Realtime, Storage, reloptions) com evidência sanitizada.
11. Validar backups/restauração em ambiente isolado e com governança de dados.
12. Condicionar promoção de produção aos gates definidos e revisar bypasses.
13. Registrar e revalidar o build local por SHA.
14. Preservar os artefatos de auditoria sanitizados em armazenamento durável/PR documental aprovado.
15. Reexecutar o delta após qualquer novo merge. Só declarar cada dimensão como sincronizada quando houver evidência própria.

Nenhuma dessas recomendações foi aplicada silenciosamente nesta auditoria.

## 10. Fontes e artefatos

- [Commit auditado](https://github.com/adm01-debug/Zapp_Web_V2/commit/36a5b4fabae5f9e5d6c64828e23946fff13c53ad)
- [DB Live Guard final](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35723234925)
- [CI/CD final](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35723234776)
- [DB offline](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35723234825)
- [CodeQL](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35723234845)
- [Último deployment de Edge localizado](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35119028563)
- [Inventário sanitizado da coleta](./evidence/2026-09-22-sync-local-inventory.json)

Evidência bruta local, fora do repo: `/tmp/zapp-codex-sync-audit-20260922-evidence/`. Contém inventário, artefatos estruturais, artefatos do deployment e log da suíte dirigida. Caminhos em `/tmp` são temporários; este relatório não afirma que já foram publicados ou arquivados permanentemente.

## Anexo A — Branches locais no instante do inventário

“Patches ≠ main” é comparação de patch-id, não veredito funcional. “Só local” refere-se à alcançabilidade por heads remotas, não busca exaustiva em todo armazenamento interno do GitHub.

A branch de auditoria aparece em `c35b3c25` na captura inicial; depois foi avançada, somente no worktree isolado, para `36a5b4fa`.

| Branch | SHA | À frente / atrás de main | Patches ≠ main | Commits só locais |
| --- | --- | ---: | ---: | ---: |
| `audit/codex-sync-20260922` | `c35b3c25` | 0 / 2 | 0 | 0 |
| `audit/types-sync-312` | `e3a9df07` | 1 / 317 | 1 | 0 |
| `chore/e50-f1-ci-gates` | `ce269044` | 0 / 67 | 0 | 0 |
| `chore/e50-f2-db-indices-autovacuum` | `3b91b053` | 0 / 69 | 0 | 0 |
| `chore/e50-f4-edges-pinning` | `f8c2a1e1` | 0 / 68 | 0 | 0 |
| `chore/e50-f5-quality` | `9e2f8927` | 0 / 69 | 0 | 0 |
| `chore/label-facade-features-demo` | `b90fad77` | 1 / 506 | 1 | 0 |
| `codex/types-sync-final` | `9d5c5f0e` | 3 / 308 | 3 | 0 |
| `docs/e50-dossie-execucao` | `ab83f7be` | 0 / 66 | 0 | 0 |
| `docs/plano-melhorias-50-etapas-2026-09-20` | `e6f85ea0` | 0 / 69 | 0 | 0 |
| `feat/crm-integration-db-foundation` | `22d88667` | 3 / 336 | 3 | 0 |
| `feat/crm-integration-gateway` | `7921208f` | 8 / 336 | 8 | 0 |
| `fix/async-chat-send-contract` | `9e9989cb` | 1 / 329 | 1 | 0 |
| `fix/inbox-data-integrity-codex` | `951a2788` | 1 / 329 | 1 | 0 |
| `fix/inbox-file-upload-integrity` | `d49b6b36` | 15 / 329 | 15 | 0 |
| `fix/inbox-resgate-logica-pr384` | `7d3682c8` | 0 / 69 | 0 | 0 |
| `fix/inbox-tabs-a11y-responsive` | `705885e3` | 1 / 329 | 1 | 0 |
| `fix/talkx-scheduler-window-correctness` | `c0c67f9e` | 1 / 157 | 1 | 0 |
| `fix/talkx-template-history-contract` | `a63d8245` | 8 / 312 | 8 | 0 |
| `fix/types-sync-adapter-contract` | `315bd351` | 2 / 304 | 2 | 0 |
| `main` | `dd210916` | 0 / 70 | 0 | 0 |
| `redesign/inbox-center-tabs-codex` | `5cac917b` | 10 / 329 | 10 | 0 |
| `redesign/inbox-fidelidade-carvao-codex` | `a4ec1cda` | 15 / 329 | 15 | 0 |
| `redesign/inbox-files-history-codex` | `85f35654` | 10 / 329 | 10 | 0 |
| `redesign/inbox-right-panel-codex` | `442a1a91` | 2 / 329 | 2 | 0 |
| `redesign/inbox-tasks-notes-codex` | `c1af0136` | 10 / 329 | 10 | 0 |
| `test/chat-central-contracts` | `9e0b9ec0` | 10 / 329 | 10 | 0 |
| `tmp/integracao-e50` | `e772c599` | 4 / 59 | 0 | 4 |

## Anexo B — 55 caminhos diferentes: checkout físico → main auditada

A = adicionado na main; M = modificado em relação ao checkout original. São diferenças de árvore, não 55 bugs.

| Estado | Caminho |
| --- | --- |
| M | `.github/workflows/codeql.yml` |
| M | `.github/workflows/crm-sync-worker.yml` |
| M | `.github/workflows/db-live-guard.yml` |
| M | `CLAUDE.md` |
| M | `bun.lock` |
| A | `docs/audits/DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md` |
| M | `docs/audits/PLANO_CORRECOES_50_ETAPAS_2026-09-16.md` |
| A | `docs/audits/PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` |
| A | `docs/catalogo/QA_E40_F3.md` |
| M | `package.json` |
| M | `performance-budget.json` |
| M | `scripts/ci/eslint-baseline.json` |
| A | `scripts/db-audit/check-triple-parity.mjs` |
| A | `scripts/db-audit/check-triple-parity.test.mjs` |
| M | `scripts/db-audit/grants-baseline.json` |
| M | `scripts/db-audit/grants-baseline.sql` |
| M | `scripts/db-audit/register-migration.mjs` |
| M | `scripts/db-audit/register-migration.test.mjs` |
| A | `src/components/catalog/CatalogProductCard.tsx` |
| M | `src/components/catalog/ExternalProductCard.tsx` |
| M | `src/components/catalog/ExternalProductManagement.tsx` |
| M | `src/components/catalog/ProductDetailDialog.tsx` |
| M | `src/components/inbox/MessagePreview.tsx` |
| M | `src/components/inbox/chat/MarkdownPreview.tsx` |
| M | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| M | `src/components/security/SecurityOverview.tsx` |
| M | `src/components/talkx/TalkXAnalytics.tsx` |
| M | `src/components/talkx/TalkXOverview.tsx` |
| A | `src/hooks/integrations/useCatalogFavorites.ts` |
| M | `src/hooks/integrations/useExternalEvolution.ts` |
| M | `src/hooks/integrations/useWhatsAppStatus.ts` |
| M | `supabase/deployment-manifest.json` |
| M | `supabase/functions/ai-auto-tag/index.ts` |
| M | `supabase/functions/ai-churn-analysis/index.ts` |
| M | `supabase/functions/ai-classify-tickets/index.ts` |
| M | `supabase/functions/approve-password-reset/index.ts` |
| M | `supabase/functions/auth-login/index.ts` |
| M | `supabase/functions/batch-fetch-avatars/index.ts` |
| M | `supabase/functions/bitrix-api/index.ts` |
| M | `supabase/functions/cleanup-rate-limit-logs/index.ts` |
| M | `supabase/functions/create-user/index.ts` |
| M | `supabase/functions/fetch-link-preview/index.ts` |
| M | `supabase/functions/get-sip-password/index.ts` |
| M | `supabase/functions/migrate-media-storage/index.ts` |
| M | `supabase/functions/send-rate-limit-alert/index.ts` |
| M | `supabase/functions/send-scheduled-report/index.ts` |
| M | `supabase/functions/sentiment-alert/index.ts` |
| M | `supabase/functions/sicoob-bridge-reply/index.ts` |
| M | `supabase/functions/sicoob-bridge/index.ts` |
| M | `supabase/functions/webauthn/index.ts` |
| M | `supabase/functions/webhook-diagnostic/diagnostic.test.ts` |
| A | `supabase/migrations/20260920120000_talkx_e90_fk_indexes.sql` |
| A | `supabase/migrations/20260920120100_autovacuum_hot_tables.sql` |
| A | `supabase/migrations/20260920120200_drop_idx_email_threads_gmail_account_redundante.sql` |
| M | `supabase/schema-manifest.json` |
