# Zapp Web V2 — banco canônico: nomes que eu errei por adivinhar

**Projeto Supabase:** `tnnnlkbymytvtqngbbqh` (nunca outro).  
**Leitura:** `python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "<SQL>"` (devolve JSON; corta ~4 KB — paginar).  
O gateway se chama "RO" mas **aceita DDL/DML com service_role**: use só para LEITURA; DDL/DML
versionado só por `hermes-db-migrar` (e fica registrado em `ops.hermes_change_log`).

## Nomes corretos (confirmar com `information_schema` antes de adivinhar)

- **Não existe tabela `conversations`** (dá 42P01).
- **Compras do SalesView = `contact_purchases`**: `id`, `title`, `amount`, `currency`, `status`,
  `contact_id`, `created_by`, `created_at`, `purchase_type`. É onde se confere que o "+ Novo" gravou
  `created_by` com o uuid do usuário logado (conta QA: `886376a1-8613-4a63-bab3-8d8edbe546c7`).
- **`profiles` não tem `full_name`**: usar `id`, `name`, `email`, `role`, `user_id`, `is_active`,
  `department_id`, `access_level`, `permissions`.
- **`login_attempts`**: `email`, `attempt_count`, `locked_until`, `last_attempt_at`, `ip_address`,
  `user_agent`, `created_at`. É a fonte para responder "a conta está travada?" **e** para descobrir
  QUAL e-mail o app realmente enviou no login (ver a armadilha do formulário que repovoa o e-mail).
- **`edge_rate_limits`**: `key` (ex.: `auth-login:<ip>`, `auth-login-email:<email>`), `hits`,
  `window_start` — descarta (ou confirma) throttle antes de culpar a conta.
- Outras: `blocked_ips`, `blocked_countries`, `geo_blocking_settings`, `rate_limit_configs`,
  `rate_limit_logs`, `webhook_rate_limits`, `multiplix_blocks`.

## Antes de afirmar "não existe"

`information_schema` para tabela/coluna (não adivinhar nome de coluna), e lembrar que `grep`
`--include=*.ts` **não casa `.txt`** — foi assim que eu declarei errado que as edges `sicoob-bridge`
não tinham fonte: estavam arquivadas em `docs/edge-functions-recovered/<slug>/index.ts.txt`.
