# Estado real do projeto — inventário gerado

Pasta de **dados gerados por script**, não de relatórios escritos à mão. É a fonte de consulta dos
agentes para "o que existe hoje" no banco e no código. Se um número aqui divergir do que você mediu,
regere o arquivo (comandos abaixo) em vez de corrigir à mão.

| Arquivo | Como gerar | O que tem |
|---|---|---|
| `banco.json` | `SUPABASE_ACCESS_TOKEN=... node scripts/inventario/gerar-banco.mjs` (Management API: `/database/query/read-only` + `/functions`, só leitura) **ou**, sem token, rodar `scripts/inventario/banco.sql` no MCP oficial (`db_query`), salvar a resposta e `node scripts/inventario/gerar-banco.mjs --entrada <arquivo>` | banco oficial, só leitura: cada tabela (RLS, policies, triggers, linhas, tamanho, se é citada em função/view e quantos `.from()` e `/rest/v1/<tabela>` tem em `src/` e `supabase/functions/`), tabelas órfãs, cada cron job (agenda, funções chamadas, falhas e taxa em 24 h/7 d, duração máxima), horas em que o cron ficou parado, tamanho do histórico do cron, conexões WhatsApp e mensagens em 7 dias, edge functions publicadas × pastas do repo (só com token; sem token fica `publicadas: null`), e a lista `alertas` |
| `edges.json` | `node scripts/inventario/gerar-repo.mjs` | as edge functions: linhas, segredos lidos (`Deno.env.get`) e quem invoca cada uma (src, migrations, outras edges, e2e, CI) |
| `tabelas-uso.json` (não versionado) | `node scripts/inventario/gerar-repo.mjs < lista-de-tabelas.txt` | quantos `.from('tabela')` cada tabela tem — hoje também sai em `banco.json` → `tabelas[].uso_no_codigo` |

## Como ler `banco.json`

- **`alertas`** é o que um agente precisa saber antes de mexer: `tabela_sem_rls`, `cron_falhando`
  (taxa ≥ 5 % em 7 dias), `cron_parado` (hora com mais da metade das execuções falhando),
  `historico_cron_sem_limpeza` (> 50 mil linhas com mais de 7 dias), `whatsapp_desconectado`,
  `whatsapp_saude_degradada`,
  `edge_sem_deploy` e `edge_publicada_sem_codigo`.
  Os limiares estão em `LIMIARES` no script.
- **`tabelas_orfas`**: 0 linhas + não citada em função/view do banco + nenhum `.from()` nem `/rest/v1/` no código
  (`.from(variavel)` não é resolvido).
  Candidata a limpeza, não prova de que pode apagar (pode ser usada por RPC com outro nome ou por
  sistema externo).
- **`linhas`** é `count(*)` exato quando a tabela tem menos de 200 mil linhas (`linhas_exatas: true`);
  acima disso, a estimativa do planner. Não confie em `pg_stat_user_tables.n_live_tup`: zera quando o
  banco reinicia.
- Contagens rodam com o papel da conexão. Nos dois caminhos o RLS não filtra: `service_role` (MCP) e
  `supabase_read_only_user` (endpoint read-only da Management API) têm `rolbypassrls = true` no banco oficial
  (conferido em 2026-11-02 via `pg_roles`); com outro papel, tabelas com RLS e `cron.job` podem vir incompletas.
- A resposta só é gravada se as tabelas baterem (≥ 90 %, nos dois sentidos) com `supabase/schema-manifest.json`:
  barra resposta colada de outro banco (ex.: MCP errado).
- Nada de segredo sai do banco: de `cron.job` só o nome das funções chamadas (nunca o comando, que pode
  ter URL/cabeçalho); de `whatsapp_connections`, nem telefone, QR ou token. O teste
  `scripts/ci/inventario-banco.unit.mjs` barra escrita e esses campos no SQL, e o script se recusa a gravar
  saída com cara de credencial (Bearer, JWT, `sb_secret_`). Mesmo padrão do Promo_Gifts_V4.

`banco-2026-11-02.json` (foto manual da primeira versão) foi para
`docs/_arquivo/inventario/banco-2026-11-02.json`.
