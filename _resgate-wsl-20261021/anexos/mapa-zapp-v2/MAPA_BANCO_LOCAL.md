# Banco local do Zapp V2 — medição (Fase 0, itens 1 e 2)

Feito em 04/10/2026 pela sessão do Claude no WSL, com autorização do Joaquim. Só medição: nada mudou no repositório nem na produção.
Commit `7a158527` (origin/main). Produção = retrato versionado em `supabase/schema-manifest.json`, confirmado pelo DB Live Guard às 12:15 UTC.

## Item 1 — o comando `supabase stack`
Existe a partir da CLI 2.118, como recurso experimental. A instalada era a 2.115.0. Instalei a 2.119.0 ao lado, em `~/.local/opt/supabase-2.119/`, sem trocar a atual. Só aparece com `SUPABASE_EXPERIMENTAL_STACK=1`. Ainda não foi testado com a configuração do Zapp.

## Item 2 — reconstrução local e comparação com a produção
Método: contêiner `zapp-local-medicao` (imagem `supabase/postgres:17.6.1.159`, porta 5511), montado com o script do repositório `scripts/db-audit/replay-local.sh` alterado só para não apagar o banco no fim. Estrutura extraída com `catalog.sql` e `manifest.sql` do repositório.

| Medida | Valor |
|---|---|
| Tempo para reconstruir do zero | 39 s |
| Memória do contêiner em repouso (só Postgres) | 105 MB |
| Migrations aplicadas | 764 de 785 |
| Falhas | 21: as 19 já conhecidas + 2 novas |
| Tabelas, views, funções (contagem) | 166, 12 e 317 no local; iguais às da produção |
| Diferenças reais de estrutura | 119 |

### As 2 falhas novas
`20261003182707_fixture_e2e_aba_arquivos_midia` e `20261003192707_fixture_e2e_aba_arquivos_segunda_midia`: inserem mensagens para um contato que só existe na produção (erro de chave estrangeira). São as migrations que entraram pelo PR #1882. O script de reconstrução as acusa como "inesperadas"; ele não roda no CI.

### De 13.930 diferenças brutas para 119 reais
- ~13.400 eram efeito do método, não do banco: o script cria tudo como `supabase_admin` e a produção tem `postgres` como dono; e o texto das políticas muda conforme o `search_path` de quem consulta. Comparando sem o dono e com o `search_path` do `postgres`, sobram 119.

### As 119 diferenças reais
| Grupo | Quantas | Leitura |
|---|---|---|
| Funções | 52 | 31 só mudam em espaços e quebras de linha; 17 têm corpo diferente; 4 têm `search_path` diferente |
| Permissões de `anon` a mais no local | 45 (15 funções, 30 em 5 tabelas/sequências) | em parte efeito do dono `supabase_admin` (os privilégios padrão revogados valem para `postgres`); a confirmar refazendo como `postgres` |
| Permissões de tipo só na produção | 10 | concessões ao próprio `postgres`; efeito do dono |
| Índices | 5 | 2 só na produção, 2 só no local, 1 diferente |
| Políticas | 3 | 1 só na produção, 1 só no local, 1 diferente |
| Coluna, valor padrão, gatilho, restrição | 4 | ver lista abaixo |

Funções com `search_path` diferente: `current_profile_id`, `get_gmail_tokens`, `store_gmail_tokens`, `handle_conversation_closure_gamification`.
Entre as funções com permissão de `anon` só no local está `record_incoming_call_event` (o achado M-DB-02); na produção ela aparece no retrato sem essa linha a mais, a conferir junto com o item do dono.

| Tipo | Onde | Objeto |
|---|---|---|
| columns | diferente | `team_conversations.metadata` |
| indexes | só produção | `reminders.idx_reminders_due_pending` |
| indexes | só produção | `whatsapp_connections.idx_wc_is_default` |
| indexes | só local | `team_conversations.idx_team_conv_direct_member_b` |
| indexes | só local | `team_message_receipts.idx_team_msg_receipts_profile_id` |
| indexes | diferente | `agent_achievements.ux_agent_achievements_one_time` |
| defaults | só local | `talkx_template_versions.category` |
| policies | só produção | `team_message_receipts."Conversation members can read receipts"` |
| policies | só local | `team_messages."Senders can edit own messages"` |
| policies | diferente | `team_message_receipts."Members can insert own receipts"` |
| triggers | diferente | `messages.trg_gamification_on_message_sent` |
| constraints | só local | `relation:talkx_template_versions.version_positive` |

Lista completa (incluindo as 52 funções): `dados/banco_local_x_producao_diff.json`. Erros da reconstrução: `dados/banco_local_replay_erros.tsv`.

## O que isso diz para a Fase 0
1. Reconstruir o banco localmente é rápido (39 s) e leve (105 MB só o Postgres).
2. O resultado **não é idêntico** à produção: 17 funções com corpo diferente, 4 com configuração diferente e alguns índices e políticas. Um teste que passe no banco local pode se comportar diferente na produção nesses pontos.
3. As 21 migrations que falham precisam de tratamento antes de `supabase start`/`stack` conseguir subir o banco sozinho, porque a ferramenta para na primeira falha.
4. Falta medir: o conjunto completo do Supabase (auth, storage, realtime, funções) por cópia de trabalho, e 3 a 4 deles em paralelo.

O contêiner `zapp-local-medicao` ficou de pé para investigação. Apagar: `docker rm -f zapp-local-medicao`.

## Investigação das 119 diferenças (04/10, ~12:20)

**Conclusão: em todos os casos a produção está certa e a reconstrução local fica para trás.** A produção guarda o SQL que de fato foi executado; os arquivos do repositório divergem dele em dois grupos já catalogados: migrations que falham ao reaplicar (`replay-known-failures.json`) e migrations cujo SQL executado difere do arquivo (`migration-evidence.json`).

| Grupo | Achado |
|---|---|
| 52 funções | 31 só diferem em formatação; 21 têm diferença real. Em 15 destas o texto da produção não bate com nenhum arquivo do repositório (ex.: `log_audit_event` converte o id para uuid só na produção; `dashboard_leaderboard` aceita o período `all` só na produção). |
| Políticas do Team Chat | No local sobra uma política de UPDATE do remetente em `team_messages` e a de INSERT de recibos fica `TO public`; a produção tem a versão corrigida (`TO authenticated`) e a leitura de recibos por membro. A produção é a mais restrita. |
| Índices, coluna, default, constraint, trigger | Todos explicados por migration que falha no replay ou por ordem de aplicação. |
| 55 permissões (45 de `anon` a mais no local, 10 de tipo só na produção) | Efeito do método, não do banco: o script cria os objetos como `supabase_admin`, cujo privilégio padrão concede a `anon`; na produção o dono é `postgres`, cujo padrão não concede. Conferido em `pg_default_acl` dos dois lados. |

**Correção preparada, não aplicada em lugar nenhum além do banco local de teste.** Arquivo de reconciliação gerado a partir da produção (52 funções com o texto exato de lá + 12 ajustes condicionais), guardado pelo Joaquim em `~/reconcile_zapp_20261003272707.sql`. Testes no contêiner `zapp-local-medicao`: aplicado sobre a reconstrução, as diferenças fora de permissões caíram de 64 para 0; aplicado de novo sobre o banco já igual à produção, nenhuma seção do manifesto mudou.

**Estado:** não está no repositório. Regra do Joaquim em 04/10: trabalho local, push só quando ele pedir. Versão `20261003272707` reservada no banco pela função `reserve_migration_version` (uma linha na tabela de reservas; sem migration correspondente).

**M-DB-02 continua aberto e não foi tocado:** na produção, a variante de 7 argumentos de `record_incoming_call_event` tem EXECUTE para PUBLIC e `authenticated`.

**Para o banco local valer como portão na Fase 0:** (1) a reconciliação entrar no repositório quando o Joaquim pedir; (2) rodar as migrations como `postgres`, como faz o `supabase start`, e não como `supabase_admin`, para as permissões saírem iguais; (3) as 2 fixtures do PR #1882 entrarem na lista de falhas esperadas do replay ou ganharem um contato de exemplo.

## `supabase stack` com o Zapp — medido em 04/10 (~12:45)

CLI 2.119.0 (`~/.local/opt/supabase-2.119`), `SUPABASE_EXPERIMENTAL_STACK=1`, runtime Docker, numa cópia de trabalho descartável da `main` (`7a158527`). Tudo local.

| Medida | Conjunto completo (`zapp-fase0-a`) | Conjunto enxuto (`zapp-fase0-b`, sem painel, e-mail e análise) |
|---|---|---|
| Tempo para subir | 27 s (primeira vez) | 6 s |
| Memória total | ~1.540 MB (11 contêineres) | ~590 MB (6 contêineres) |
| Maiores consumidores | análise 477, painel 208, arquivos 200, tempo real 180, banco 132 | arquivos 201, tempo real 192, banco 102 |
| Portas | automáticas na faixa 20000–32767, sem colisão entre os dois | idem |

- A configuração do Zapp (`supabase/config.toml`) foi aceita sem alteração. O `project_id` de produção no arquivo não causou colisão: o nome dos contêineres vem da pasta e do nome do conjunto (`supabase-<pasta>-<conjunto>-<serviço>`).
- Os dois conjuntos rodaram ao mesmo tempo. Com 3 a 4 conjuntos enxutos em paralelo a conta é de ~1,8 a 2,4 GB, numa máquina com 31 GB (estimativa por multiplicação; só 2 foram medidos juntos).
- O Postgres local é 17.11; o de produção é 17.6.

### Estrutura do Zapp dentro do conjunto (dono `postgres`, como na produção)
1. As 785 migrations aplicadas uma a uma como `postgres`, continuando depois de cada erro: **759 ok, 26 falhas, 33 s**. São as 21 da reconstrução anterior mais 5 que só falham aqui: duas porque o esquema `supabase_migrations` não existe quando as migrations não são aplicadas pela própria ferramenta; três por permissão sobre o agendador (`cron.job`, `alter_job`) e sobre `app.settings.trusted_domains`, que o `postgres` local não tem. Lista em `dados/banco_local_stack_erros_como_postgres.tsv`.
2. Arquivo de reconciliação aplicado por cima: sem erro.
3. Comparação com o manifesto da produção, **sem nenhum ajuste de dono ou de `search_path`**: sobraram só 7 diferenças, todas EXECUTE de `anon` em 7 funções (`add_wa_tag_if_not_exists`, `get_team_conversation_previews`, `get_team_unread_counts`, `remove_wa_label_from_all_contacts`, `remove_wa_tag_by_prefix`, `rename_wa_label_on_all_contacts`, `set_team_member_role`), porque as migrations que revogam falham no replay.
4. Com 7 `REVOKE` acrescentados à reconciliação (sem efeito na produção, onde `anon` já não tem): **todas as seções do manifesto idênticas às da produção.**

Isso confirma que as 55 diferenças de permissão da primeira medição eram efeito do dono `supabase_admin`. A reconciliação com os 7 `REVOKE` está em `~/reconcile_zapp_20261003272707.v2.sql`.

### O que isso resolve e o que não resolve
- **Resolve:** um banco por cópia de trabalho é viável e leve; a estrutura local pode ficar idêntica à da produção.
- **Não resolve ainda:** (a) a ferramenta, sozinha, para na primeira migration que falha — hoje só o laço "aplica e continua" chega ao fim; (b) o banco nasce vazio (sem `seed.sql`); (c) cofre de chaves, crons e serviços externos (Evolution, CRM, catálogo) não foram exercitados; (d) estrutura idêntica não prova comportamento idêntico (dados, versão 17.11 × 17.6).

## Ferramentas locais da Fase 0 — criadas e testadas em 04/10 (~12:30)

Tudo fora do repositório. Scripts em `~/.local/bin`, dados em `~/.local/share/zapp-local/`.

| Ferramenta | O que faz | Medido |
|---|---|---|
| `zapp-db-local up <cópia> <nome>` | sobe um conjunto enxuto do Supabase para a cópia de trabalho, aplica as migrations no modo "aplica e continua" como `postgres`, aplica a reconciliação, carrega os dados de exemplo e compara com o retrato da produção. Também `check`, `psql`, `env`, `down`, `list`. | 72 s; ~590 MB; 762 migrations ok, 21 falhas esperadas de 785; "ESTRUTURA: IDÊNTICA ao retrato da produção" |
| `zapp-db-guard check <cópia>` / `run -- <comando>` | trava contra a produção: recusa se `.env*` da cópia, `supabase link`, variáveis de ambiente ou argumentos tiverem o identificador da produção | 5 casos testados: 2 passam, 3 bloqueiam (código 97) |
| `zapp-verify [fast\|full] <cópia> [nome]` | portão local: trava, tipos, lint, migrations, estrutura do banco local; no modo completo, testes unitários e build. Registros em `~/.local/state/zapp-verify/`. | rápido 67–72 s; completo 128 s (6.210 testes passando, 38 pendentes) |
| `~/.local/share/zapp-local/seed.sql` | dados de exemplo sintéticos: 3 usuários locais (admin, supervisor, agente E2E; senha `zapp-local-123`), fila, 2 conexões falsas, 9 contatos, 36 mensagens, as 3 fixtures que os testes E2E procuram e os 5 segredos de cofre que na produção foram criados à mão (valores falsos) | login dos 3 usuários funciona; agente vê 5 contatos e 20 mensagens, admin e supervisor veem 9 e 36, anônimo é recusado |
| `~/.local/share/zapp-local/reconcile.sql` | cópia do arquivo de reconciliação (v2, com os 7 `REVOKE`) | — |
| `~/.local/share/zapp-local/falhas-esperadas.txt` | as 21 migrations que falham no banco local; qualquer falha fora da lista deixa o `up` vermelho | — |

### Como cada pendência foi resolvida
1. **A ferramenta parava na primeira migration que falha.** O `zapp-db-local` usa uma pasta-sombra só com o `config.toml`, para o Supabase não aplicar as migrations sozinho, e aplica ele mesmo no modo "continua". Cria o esquema `supabase_migrations` antes. Migration que falha por permissão do `postgres` local é repetida como `supabase_admin` (1 caso). Sobram 21 falhas, todas na lista esperada.
2. **Banco vazio.** `seed.sql` (acima). Com os dados carregados, as 2 fixtures do PR #1882 passam na segunda tentativa.
3. **Cofre, crons e serviços de fora.**
   - Cofre: produção tem 13 segredos; as migrations criam 8; o seed completa os 5 que faltam com valores falsos.
   - Crons: produção tem 13 jobs; o local tem 11. Faltam `vacuum-contacts-daily` e `vacuum-messages-post-expurgo`, criados na produção fora de migration (já conhecido em `docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md`). Os horários locais não são os escalonados, porque a migration `20261002541230_pg_cron_escalonar_jobs` falha no local.
   - **Achado: um banco local com as migrations chama a PRODUÇÃO.** As migrations gravam a URL de produção em 4 crons (`avatars-refresh`, `connection-health-check`, `gmail-incremental-sync`, `searchbox-budget-alert`), em 3 funções e em 2 segredos (`multiplix_send_url`, `talkx_send_url`). Com `pg_cron` e `pg_net` ativos, o banco local faz POST nas edge functions reais. O `zapp-db-local` trava isso antes das migrations: o host de produção aponta para `127.0.0.1` no `/etc/hosts` dos contêineres do banco, de funções e de tempo real; `cron.launch_active_jobs = off`; todos os jobs inativos. Testado: `net.http_get` para a URL de produção a partir do banco local devolve "Couldn't connect to server". Nos contêineres de arquivos, login e REST a trava de `/etc/hosts` não entrou (imagens sem permissão de escrita); eles só falam com o banco.
   - Serviços de fora (Evolution, CRM, catálogo): não há substituto local; com a trava, as chamadas simplesmente falham. Simuladores ficam para quando houver teste que precise deles.
4. **Comportamento, não só estrutura.** Rodados no banco local os 5 checks que o repositório roda contra a produção (`check-mcp-exec-acl`, `check-webhook-failures-acl`, `check-talkx-view-invoker`, `check-talkx-transition-contract`, `check-e2e-fixtures`): os 5 passam. Login e regras de acesso por papel conferidos pela API local. **M-DB-02 reproduz no local:** POST anônimo em `rpc/record_incoming_call_event` devolve HTTP 200. A diferença de versão (Postgres 17.11 local, 17.6 produção) continua; a ferramenta não deixa escolher a versão menor.
5. **`db_guard` e `verify.sh`.** `zapp-db-guard` e `zapp-verify` (acima).

### O que continua aberto
- **O app não consegue usar o banco local.** `src/config/supabase.ts` e `src/integrations/supabase/client.ts` têm a URL e a chave anônima de produção fixas e, por decisão registrada no código, não leem `VITE_SUPABASE_URL`. Servidor de desenvolvimento e testes E2E continuam apontando para a produção até isso mudar. Os testes unitários não são afetados: `src/test/setup.ts` já bloqueia chamadas a hosts do Supabase.
- **Chamadas à produção feitas pelos meus bancos de teste de hoje, antes da trava.** O contêiner `zapp-local-medicao` ficou ~40 min de pé e o conjunto `zapp-fase0-a` ~10 min, ambos com as migrations aplicadas e o agendador ligado. Pelos horários dos crons, estimo de 15 a 20 chamadas às edge functions `connection-health-check`, `gmail-cron-sync` e possivelmente `batch-fetch-avatars`, com segredo local, que a produção deve ter recusado. Não medi do lado da produção. O script `scripts/db-audit/replay-local.sh` do repositório tem a mesma exposição enquanto o contêiner dele vive.
- A reconciliação e as 21 migrations continuam como estão no repositório (push só quando o Joaquim pedir).
