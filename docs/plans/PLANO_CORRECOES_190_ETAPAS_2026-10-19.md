# PLANO DE CORREÇÕES E MELHORIAS — ZAPP WEB V2
## 190 Etapas para Execução por Agente IA (Sonnet)
### Versão 1.0.0 — 2026-10-19

---

## INSTRUÇÕES AO AGENTE EXECUTOR

### Regras Absolutas (NÃO NEGOCIÁVEIS)

1. **Banco de Produção**: `tnnnlkbymytvtqngbbqh` — somente leitura SELECT. Nunca DDL direto.
2. **DDL em Produção**: SOMENTE via `.github/workflows/db-migrate.yml` (`workflow_dispatch`, `apply=false` → aprovação do Joaquim → `apply=true`).
3. **MCP para SQL**: `SUPABASE - ZAPP WEB V2 - MCP` (db_query). NÃO usar `uqysyzndkfiwfztbqvsl` nem `vpkmqeumtxhrwgawxdrl`.
4. **Escrita no GitHub**: SEMPRE via `GITHUB - MCP - FOREVER` (MCP padrão retorna 403).
5. **Branch**: criar nova branch `claude/<tipo>-<slug>-<AAMMDD-HHMM>` a partir de `main`. NUNCA commitar em branch de outro agente.
6. **Push/Merge**: NUNCA fazer push ou merge por conta própria sem aprovação do Joaquim.
7. **Edge functions deploy**: SOMENTE via `.github/workflows/deploy-functions.yml`.
8. **supabase_apply_migration está bugado**: usar `db_query` + `INSERT INTO supabase_migrations.schema_migrations` manual.
9. **E2E**: rodam contra banco LOCAL da cópia de trabalho, não produção.
10. **PARAR e reportar** quando encontrar bloqueador que exija decisão de negócio ou custo.

### Bancos Proibidos (NÃO ESCREVER)
- `uqysyzndkfiwfztbqvsl` — MCP Zapp Web Lovable antigo
- `vpkmqeumtxhrwgawxdrl` — MCP Lovable Cloud (read-only, nome parecido com o oficial)
- `pgxfvjmuuxtbowutlide` — Gestão de Clientes/CRM externo
- `doufsxqlfjyuvxuezpln` — Catálogo de Produtos externo

### Convenção de Branch
- `claude/fix-<slug>-<AAMMDD-HHMM>` — correção
- `claude/feat-<slug>-<AAMMDD-HHMM>` — nova funcionalidade
- `claude/chore-<slug>-<AAMMDD-HHMM>` — manutenção
- `claude/ci-<slug>-<AAMMDD-HHMM>` — workflows

### Etapas com PARAR AQUI
Etapas marcadas com **PARAR AQUI** requerem aprovação explícita do Joaquim antes de executar. São 6 no total (3% do plano). Todas as demais podem ser executadas autonomamente.

---

## FASE A — SEGURANÇA CRÍTICA (Etapas 1–30)
*Prioridade MÁXIMA. Vulnerabilidades com impacto em produção imediato.*

### A1. Fechar PRs Z-series em aberto
**Contexto**: PRs #2091–#2095 contêm correções de segurança (Z011-B/C, Z015p, Z017-Z024, Z029, Z054-Z055) pendentes de merge.  
**Ação**: Para cada PR de #2091 a #2095, verificar CI verde → merge squash → confirmar deploy.  
**Validação**: `github_is_pr_merged` retorna `true` para todos os 5 PRs.

### A2. Auditar timing-safe comparison em todas as edge functions
**Contexto**: PR #2091 corrigiu apenas `searchbox-budget-alert` e `whatsapp-webhook`. Outras functions podem ter o mesmo problema.  
**Ação**: `grep -r "===\|!==" supabase/functions/ --include="*.ts" -l` — filtrar functions que comparam tokens/assinaturas. Substituir por `crypto.timingSafeEqual`.  
**Validação**: Cada function que compara token usa `timingSafeEqual` ou equivalente.

### A3. Corrigir `external-db-bridge` — vazamento de código interno em 502
**Contexto**: PR #2095 menciona code-leak em responses de erro. Function expõe informação interna em 5xx.  
**Ação**: Ler `supabase/functions/external-db-bridge/index.ts`. Substituir todos os blocos `catch` que retornam `error.message` raw por `internalErrorResponse` que retorna apenas código genérico.  
**Validação**: Request que causa erro interno retorna `{error: {code: 'INTERNAL_ERROR'}}` sem stack trace.

### A4. Revisar CORS em functions com dados sensíveis
**Contexto**: `Access-Control-Allow-Origin: *` em functions com dados de usuário expõe dados a qualquer origem.  
**Ação**: `grep -r "Allow-Origin: \*" supabase/functions/ --include="*.ts" -l`. Para cada function com dados de usuário, restringir ao domínio de produção.  
**Validação**: Functions com dados de usuário NÃO retornam `Allow-Origin: *`.

### A5. Mergear PRs do lote F1a (batches 4–9)
**Contexto**: PRs #2081-#2086 corrigem falhas de UX/lógica críticas (Leaderboard, NPSDashboard, useUserSettings, whatsapp_connections, QueueCard, WhatsAppTemplatesManager).  
**Ação**: Para PRs #2081 a #2086, verificar CI verde → merge squash em ordem numérica.  
**Validação**: `github_is_pr_merged` retorna `true` para todos os 6 PRs.

### A6. Auditar RLS — tabelas com write grant para role `anon`
**Contexto**: PR #2094 é FASE 2 do REVOKE anon write. Verificar quais tabelas ainda têm `INSERT/UPDATE/DELETE` para `anon`.  
**Ação**: `SELECT schemaname, tablename, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')` via MCP.  
**Validação**: Lista documentada em `docs/security/rls-anon-write-audit.md`. Cada linha ou é intencional (com justificativa) ou tem migration REVOKE pendente.

### A7. Inventariar segredos hardcoded em edge functions
**Contexto**: Functions Grupo E (sem caller) podem conter credenciais antigas hardcoded.  
**Ação**: `grep -rn "password\|api_key\|Bearer\|token\s*=\s*['\"]" supabase/functions/ --include="*.ts"` no repo local. Qualquer literal → mover para Vault.  
**Validação**: Zero credenciais literais em arquivos `.ts` de functions.

### A8. Auditar `health` e `status` (Grupo E) — exposição de informação
**Contexto**: Functions Grupo E sem caller podem expor versão do banco, lista de tabelas ou IPs internos.  
**Ação**: Ler código de ambas. Se retornam informação de infraestrutura sem auth, adicionar Bearer token obrigatório.  
**Validação**: GET sem token → 401. GET com token válido → `{status: 'ok'}` apenas.

### A9. Auditar `gmail-send` e `gmail-sync` (Grupo E) — credenciais OAuth
**Contexto**: Functions de e-mail Grupo E — tokens OAuth podem estar expirados ou com escopos excessivos.  
**Ação**: Verificar que tokens Gmail são lidos de `vault.decrypted_secrets`, não de env hardcoded. Confirmar escopos mínimos necessários.  
**Validação**: Tokens Gmail via Vault; escopos documentados em `docs/security/api-keys-rotation.md`.

### A10. Implementar Content Security Policy no front-end
**Contexto**: App sem CSP — com Mapbox, ElevenLabs e conteúdo WhatsApp, XSS é risco real.  
**Ação**: Adicionar `Content-Security-Policy` header no `vercel.json` ou equivalente: `default-src 'self'`, fontes externas permitidas, nonce para scripts inline.  
**Validação**: Browser DevTools não mostra violações CSP no fluxo normal de uso.

### A11. Verificar `voice-copilot-action` (Grupo E) — injeção de prompt IA
**Contexto**: Function com execução de ações via LLM sem caller conhecido. Endpoint pode estar exposto.  
**Ação**: Ler código. Verificar: (1) requer JWT válido? (2) prompts de usuário são separados de instruções do sistema? (3) há rate limit?  
**Validação**: Endpoint requer JWT. Input de usuário é marcado explicitamente como `user_input`, não injetado em instruções de sistema.

### A12. Habilitar Dependabot para atualizações de segurança
**Contexto**: Sem `.github/dependabot.yml`, CVEs em dependências não são notificados automaticamente.  
**Ação**: Criar `.github/dependabot.yml` com updates para `npm` (semanal) e `github-actions` (mensal).  
**Validação**: Arquivo criado; Dependabot ativo no repositório.

### A13. Auditar `metrics` (Grupo E) — exposição de métricas internas
**Contexto**: Function de métricas Prometheus-style sem autenticação expõe informações de infraestrutura.  
**Ação**: Ler código. Se retorna dados de sistema sem auth, adicionar Bearer token de service_role.  
**Validação**: Request sem token → 401.

### A14. Verificar `send-rate-limit-alert` (Grupo E) — SSRF potencial
**Contexto**: Function que envia alertas com URL configurável por request = SSRF.  
**Ação**: Ler código. Verificar se URL de destino é hardcoded/Vault ou provida pelo request. Se for do request, adicionar allowlist de domínios.  
**Validação**: URL de destino NÃO é controlada por dados de request não sanitizados.

### A15. Criar tabela de audit log para ações administrativas
**Contexto**: Ações admin sem audit trail violam boas práticas e dificulta investigação de incidentes.  
**Ação**: Verificar se `public.audit_logs` existe (`SELECT * FROM public.audit_logs LIMIT 1` via MCP). Se não, criar migration: `CREATE TABLE public.audit_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users, action text, target_table text, target_id text, payload jsonb, created_at timestamptz DEFAULT now())` + RLS com SELECT apenas service_role.  
**Validação**: Tabela existe; INSERT de teste retorna ID.

### A16. Verificar `talkx-scheduler` e `talkx-storage-purge` (Grupo E) — autorização
**Contexto**: Functions de scheduler e purge com autorização insuficiente podem criar jobs arbitrários ou deletar dados.  
**Ação**: Ler código. Verificar se exigem `service_role` key ou são acessíveis por qualquer JWT válido.  
**Validação**: Ambas exigem `service_role` key ou são invocadas apenas por pg_cron.

### A17. Arquivar ou conectar `recover-corrupted-audios` e `recover-message-media` (Grupo E)
**Contexto**: Functions de recuperação criadas para incidente específico e possivelmente abandonadas.  
**Ação**: Verificar data de last commit via `github_list_commits` filtrado para esses arquivos. Se sem commit há > 6 meses e nenhum pg_cron as invoca, mover para `supabase/functions/_archive/`.  
**Validação**: Grupo E de `ESTADO.md` não lista essas functions (arquivadas ou conectadas a caller).

### A18. Corrigir `auto-close-conversations` (Grupo E) — race condition
**Contexto**: Function que fecha conversas automaticamente deve usar `FOR UPDATE SKIP LOCKED` para evitar duplo fechamento.  
**Ação**: Ler código. Verificar se usa `SKIP LOCKED` ou idempotência (ex: `WHERE status != 'closed'`). Confirmar que está em `pg_cron`.  
**Validação**: Function usa `SKIP LOCKED` ou equivalente; listada em `cron.job`.

### A19. Adicionar LIMIT em `cleanup-rate-limit-logs` (Grupo E)
**Contexto**: DELETE sem LIMIT pode travar o banco por longos períodos em tabelas grandes.  
**Ação**: Ler código. Se DELETE não tem `LIMIT 10000`, adicionar.  
**Validação**: Query de DELETE tem `LIMIT` explícito (máximo 10000 por execução).

### A20. Verificar HMAC em `whatsapp-webhook` após Z011
**Contexto**: PR #2091 corrigiu timing comparison mas o flow completo de HMAC verification pode ter gaps.  
**Ação**: Testar localmente: request com `X-Hub-Signature-256` ausente → deve retornar 401. Request com HMAC inválido → 401.  
**Validação**: Ambos os casos retornam 401 (não 200 ou 500).

### A21. Auditar CORS de `multiplixvoices` (Grupo E)
**Contexto**: Function de voz sem caller com CORS permissivo.  
**Ação**: Ler código; verificar `Access-Control-Allow-Origin`. Se `*`, restringir ao domínio da aplicação.  
**Validação**: CORS restrito ao domínio de produção.

### A22. Verificar `talkx-report` — isolamento entre workspaces
**Contexto**: Reports que retornam dados de múltiplos workspaces sem filtro expõem dados de tenants diferentes.  
**Ação**: Ler código. Verificar que toda query tem `WHERE workspace_id = auth.jwt() ->> 'workspace_id'` ou equivalente.  
**Validação**: Chamada com token de workspace A não retorna dados de workspace B.

### A23. Adicionar `npm audit` no CI
**Contexto**: Sem auditoria de dependências no CI, CVEs de npm passam para produção.  
**Ação**: Ler `.github/workflows/ci.yml`. Se não há `npm audit --audit-level high`, adicionar step após `npm ci`.  
**Validação**: `ci.yml` contém `npm audit --audit-level high`; CI verde.

### A24. Auditar vazamento de PII em logs de edge functions
**Contexto**: Functions de WhatsApp podem logar conteúdo de mensagens com dados pessoais.  
**Ação**: `grep -rn "console\.log\|console\.error" supabase/functions/ --include="*.ts"` — verificar se logam `message`, `email`, `phone`.  
**Validação**: Nenhum `console.log/error` exibe conteúdo de mensagem ou PII diretamente.

### A25. Garantir que `register-migration.mjs` existe e funciona
**Contexto**: CLAUDE.md menciona `scripts/db-audit/register-migration.mjs` mas existência não foi confirmada.  
**Ação**: Verificar se arquivo existe via `github_get_content`. Se não, criar script que: (1) valida versão > MAX(version), (2) gera bloco SQL de INSERT, (3) aceita `--apply` para aplicar via MCP.  
**Validação**: `node scripts/db-audit/register-migration.mjs --help` retorna instruções de uso.

### A26. Adicionar rate limiting em endpoints públicos
**Contexto**: Webhooks e endpoints sem auth podem ser usados para enumeração ou DDoS.  
**Ação**: Verificar tabela de rate limits: `SELECT * FROM public.rate_limits LIMIT 5` via MCP. Se não existe, criar implementação básica por IP com threshold de 100 req/min.  
**Validação**: 101 requests do mesmo IP em 1 minuto retorna 429.

### A27. Revisar permissões de buckets Storage
**Contexto**: Buckets públicos expõem URIs previsíveis de mídias de usuários.  
**Ação**: Via `SUPABASE - ZAPP WEB V2 - MCP` storage_list_buckets (ou query `SELECT * FROM storage.buckets`). Para buckets `public: true` com dados de usuário, converter para signed URLs.  
**Validação**: Buckets com dados de usuário têm `public: false`; URLs geradas via `storage.createSignedUrl` com expiração.

### A28. Verificar rotação de token ElevenLabs
**Contexto**: Token de IA com longa validade no Vault é risco se o Vault for comprometido.  
**Ação**: `SELECT name, created_at FROM vault.secrets WHERE name ILIKE '%elevenlabs%'` via MCP. Documentar data de criação e política de rotação.  
**Validação**: Política de rotação documentada em `docs/security/api-keys-rotation.md`.

### A29. Verificar `elevenlabs-agent-token` (Grupo E) — escopo do token
**Contexto**: Token de agente ElevenLabs com escopo excessivo pode ser usado para criar vozes não autorizadas.  
**Ação**: Ler código da function. Verificar escopo do token (leitura vs criação). Restringir ao mínimo necessário.  
**Validação**: Token tem escopo documentado em `docs/security/api-keys-rotation.md`.

### A30. Criar `docs/security/DEPLOY_SECURITY_CHECKLIST.md`
**Contexto**: Sem checklist de deploy, itens de segurança são esquecidos.  
**Ação**: Criar arquivo com checklist: ✓ npm audit verde, ✓ CORS revisado, ✓ secrets em Vault, ✓ RLS em novas tabelas, ✓ db-migrate dry-run aprovado, ✓ nenhuma function Grupo E nova sem justificativa.  
**Validação**: Arquivo criado e linked em `CLAUDE.md`.

---

## FASE B — BANCO DE DADOS (Etapas 31–60)
*Schema, migrations, drift, performance e integridade.*

### B31. Catalogar as 64 diferenças entre replay local e schema-manifest.json
**Contexto**: CLAUDE.md seção 0 item 7 documenta 64 diferenças conhecidas ao reaplicar migrations do zero.  
**Ação**: Rodar `scripts/db-audit/replay-local.sh` em ambiente local; comparar saída com `supabase/schema-manifest.json`; criar `docs/db/schema-drift-64-items.md` com lista completa.  
**Validação**: Arquivo criado com exatamente as diferenças catalogadas por categoria.

### B32. Categorizar as 21 falhas de replay de migrations
**Contexto**: `scripts/db-audit/replay-known-failures.json` lista 21 falhas esperadas. Algumas são corrigíveis.  
**Ação**: Ler `replay-known-failures.json`; categorizar por tipo: DDL conflitante, dependência de extensão, order-dependent, obsoleta.  
**Validação**: Cada falha tem categoria documentada; falhas do tipo DDL conflitante têm migration fix proposta.

### B33. Avaliar e planejar pg_partman para `evolution_messages_wpp2`
**PARAR AQUI — Requer aprovação do Joaquim antes de executar.**  
**Contexto**: Tabela com 1.83M rows e 1.14 GB — maior gargalo do banco. Particionamento por mês reduziria queries de leitura recente mas é operação destrutiva.  
**Ação**: Criar ADR (`docs/adr/ADR-001-evolution-messages-partman.md`) com análise de impacto, downtime estimado e plano de rollback. Aguardar aprovação explícita do Joaquim antes de criar a migration.  
**Validação**: ADR criado; PARAR e reportar ao Joaquim.

### B34. Otimizar `rpc_refresh_daily_metrics` — baseline 2.2s → alvo < 500ms
**Contexto**: RPC com média de 2.2s impacta dashboards em tempo real.  
**Ação**: `EXPLAIN (ANALYZE, BUFFERS) SELECT rpc_refresh_daily_metrics()` via MCP. Identificar seq scans. Criar índice parcial onde custo > 100ms.  
**Validação**: EXPLAIN ANALYZE mostra execução < 500ms após índices.

### B35. Criar índice composto em `evolution_messages_wpp2(conversation_id, created_at DESC)`
**Contexto**: Queries de timeline de conversa fazem seq scan em 1.83M rows.  
**Ação**: `CREATE INDEX idx_evomsg_conv_created ON evolution_messages_wpp2(conversation_id, created_at DESC)` via migration (sem CONCURRENTLY — falha via gateway conforme CLAUDE.md).  
**Validação**: `EXPLAIN ANALYZE SELECT * FROM evolution_messages_wpp2 WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50` usa Index Scan.

### B36. Documentar todos os 31 jobs de pg_cron
**Contexto**: 31 jobs sem documentação centralizada — difícil auditar o que está rodando.  
**Ação**: `SELECT jobid, jobname, schedule, command, active, database FROM cron.job ORDER BY jobid` via MCP. Criar `docs/db/pg-cron-jobs.md` com cada job, schedule e responsável.  
**Validação**: Arquivo com exatamente 31 entradas (ou o número atual); cada entry tem schedule humano legível (ex: "todo dia às 3h UTC").

### B37. Identificar os 4 jobs pg_cron que chamam banco de produção
**Contexto**: CLAUDE.md alerta que 4 jobs têm URL de produção hardcoded — em banco local esses jobs fariam POST em produção real.  
**Ação**: `SELECT jobname, command FROM cron.job WHERE command LIKE '%tnnnlkbymytvtqngbbqh%'` via MCP.  
**Validação**: Jobs identificados documentados em `docs/db/pg-cron-jobs.md` com flag "requer override local".

### B38. Verificar se `supabase/schema-manifest.json` está atualizado
**Contexto**: Manifesto é comparado contra replay local. Se desatualizado, drift check gera falsos positivos.  
**Ação**: Comparar timestamp do manifesto com data do último commit em produção. Se desatualizado, regenerar via script de snapshot.  
**Validação**: `git log -1 --format="%ai" supabase/schema-manifest.json` data corresponde ao estado atual do banco.

### B39. Listar tabelas sem RLS habilitado no schema public
**Contexto**: 181 RLS policies para 513 tabelas — proporcionalmente baixo. Tabelas sem RLS com dados de usuário são risco.  
**Ação**: `SELECT t.tablename FROM pg_tables t WHERE t.schemaname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename)` via MCP.  
**Validação**: Lista criada em `docs/db/rls-coverage.md`; cada tabela sem RLS classificada como: "intencional" ou "pendente de RLS".

### B40. Criar RLS básico para tabelas com dados de usuário sem proteção
**Contexto**: Resultado de B39 revelará tabelas com dados de usuário sem proteção.  
**Ação**: Para cada tabela com `user_id` ou `workspace_id` sem RLS, criar migration: `ALTER TABLE t ENABLE ROW LEVEL SECURITY; CREATE POLICY "user_data" ON t USING (user_id = auth.uid())`.  
**Validação**: `pg_policies` retorna ao menos 1 policy para cada tabela com dados de usuário.

### B41. Quantificar drift entre ledger e arquivos de migration
**Contexto**: CLAUDE.md documenta drift silencioso histórico. Medir estado atual.  
**Ação**: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version` via MCP. Comparar com `ls supabase/migrations/ | sort`. Listar orphans (banco sim, git não) e missing (git sim, banco não).  
**Validação**: Relatório em `docs/db/migration-ledger-drift.md` com contagem atual.

### B42. Criar migrations espelho para DDL orphan no ledger
**Contexto**: DDL aplicado via MCP sem arquivo no git cria divergência permanente.  
**Ação**: Para cada versão orphan (no ledger, sem arquivo no git), criar arquivo `.sql` em `supabase/migrations/` com o DDL via introspection (`pg_catalog`).  
**Validação**: Count de arquivos em `supabase/migrations/` == count de versões no ledger.

### B43. Verificar sequências próximas do limite de int4
**Contexto**: Sequências int4 estouram em ~2.1 bilhões — erro silencioso em tabelas de alto crescimento.  
**Ação**: `SELECT sequencename, last_value, max_value FROM pg_sequences WHERE last_value > 1000000000` via MCP.  
**Validação**: Nenhuma sequência acima de 1.5 bilhões; as que chegarem têm migration de upgrade para `bigserial`.

### B44. Auditar functions SQL com `SECURITY DEFINER` desnecessário
**Contexto**: Functions com `SECURITY DEFINER` rodam como o owner (geralmente `postgres`) — vetor de privilege escalation.  
**Ação**: `SELECT proname FROM pg_proc JOIN pg_namespace ON pronamespace = oid WHERE nspname = 'public' AND prosecdef = true` via MCP. Para cada function, verificar se é intencional.  
**Validação**: Lista documentada em `docs/db/security-definer-functions.md`; nenhum caso não intencional.

### B45. Verificar `SET search_path` em functions SQL públicas
**Contexto**: Function sem `SET search_path = ''` pode ser hijacked via schema poisoning.  
**Ação**: `SELECT proname FROM pg_proc JOIN pg_namespace ON pronamespace = oid WHERE nspname = 'public' AND prosrc NOT ILIKE '%SET search_path%'` via MCP.  
**Validação**: Zero functions públicas sem `SET search_path` explícito.

### B46. Criar índice em `conversations(workspace_id, status, updated_at DESC)`
**Contexto**: Query de listagem de conversas abertas por workspace é a mais frequente do sistema.  
**Ação**: `EXPLAIN ANALYZE SELECT * FROM conversations WHERE workspace_id = $1 AND status = 'open' ORDER BY updated_at DESC LIMIT 20` via MCP. Se seq scan, criar índice.  
**Validação**: EXPLAIN mostra Index Scan para query acima.

### B47. Criar índice em `contacts(workspace_id, phone)` para lookup rápido
**Contexto**: Identificação de contato por telefone é operação core em sistema WhatsApp.  
**Ação**: `SELECT indexname FROM pg_indexes WHERE tablename = 'contacts' AND indexdef LIKE '%phone%'` via MCP. Se não existe, criar `CREATE INDEX idx_contacts_workspace_phone ON contacts(workspace_id, phone)`.  
**Validação**: EXPLAIN ANALYZE de lookup por phone usa Index Scan.

### B48. Identificar e documentar foreign keys sem índice
**Contexto**: FK sem índice em tabelas filhas causa seq scan em operações de DELETE pai.  
**Ação**: Query padrão de FK sem índice via `pg_constraint + pg_index` no MCP.  
**Validação**: Relatório em `docs/db/fk-missing-indexes.md`; migrations para os 10 casos mais críticos.

### B49. Auditar triggers do schema public
**Contexto**: Triggers em cascata podem causar lentidão silenciosa. Com 513 tabelas, risco alto.  
**Ação**: `SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table` via MCP.  
**Validação**: `docs/db/triggers-catalog.md` criado com todos os triggers listados.

### B50. Definir política de retenção de dados de mensagens
**PARAR AQUI — Requer aprovação do Joaquim antes de implementar.**  
**Contexto**: `evolution_messages_wpp2` cresce sem política de retenção definida — implicações de LGPD e custo.  
**Ação**: Criar `docs/db/data-retention-policy.md` com proposta: mensagens > 24 meses movidas para cold storage ou deletadas. Aguardar aprovação do Joaquim antes de criar migration.  
**Validação**: Documento criado; PARAR e reportar ao Joaquim.

### B51. Criar script de health check do banco
**Contexto**: Sem monitoramento automatizado de tabelas críticas, problemas são detectados tarde.  
**Ação**: Criar `scripts/db-audit/health-check.sql` com queries de COUNT para: conversations (abertas < 24h), evolution_messages_wpp2 (criadas < 1h), contacts (ativos).  
**Validação**: Script executável; retorna valores coerentes com sistema em uso normal.

### B52. Documentar extensions instaladas
**Contexto**: Extensions como `pg_net`, `pg_cron`, `vector` têm implicações de segurança e performance.  
**Ação**: `SELECT name, installed_version, comment FROM pg_available_extensions WHERE installed_version IS NOT NULL ORDER BY name` via MCP.  
**Validação**: `docs/db/extensions-catalog.md` criado com todas as extensions e justificativa de uso.

### B53. Monitorar `pg_net` requests com erro
**Contexto**: `pg_net` não relança exceções — requests HTTP falhos ficam em `net._http_response` com `error_msg` silenciosamente.  
**Ação**: `SELECT count(*) FROM net._http_response WHERE error_msg IS NOT NULL AND created > NOW() - INTERVAL '24h'` via MCP. Se > 0, listar os erros.  
**Validação**: Zero erros não monitorados em `pg_net` nas últimas 24h, ou alerta configurado.

### B54. Verificar `known-violations.json` — remover violations resolvidas
**Contexto**: Com os PRs #2081-#2095 mergeados, algumas violations nesse arquivo já foram corrigidas.  
**Ação**: Para cada entry em `known-violations.json`, verificar se o padrão violador ainda existe no código via grep. Remover entries obsoletas.  
**Validação**: Cada entry restante tem ocorrência real no código.

### B55. Validar `supabase-usage-guard` após PRs de fix
**Contexto**: PRs podem ter alterado funções/tabelas referenciadas no guard.  
**Ação**: `node scripts/db-audit/supabase-usage-guard.mjs` no repo local.  
**Validação**: Exit 0, `novas: 0`.

### B56. Criar alerta de crescimento de `evolution_messages_wpp2`
**Contexto**: Tabela de 1.14 GB sem alerta quando atingir threshold crítico.  
**Ação**: Adicionar step em `db-live-guard.yml` que falha (warn) quando `pg_total_relation_size('evolution_messages_wpp2') > 2GB`.  
**Validação**: Step adicionado; simular com threshold de 100MB para confirmar que alerta funciona.

### B57. Criar baseline de row counts para tabelas críticas
**Contexto**: Sem baseline, deleção acidental em massa não é detectada automaticamente.  
**Ação**: Criar `docs/db/table-row-baseline.json` com count atual das 20 maiores tabelas. Adicionar check semanal que alerta se count caiu > 20%.  
**Validação**: Arquivo criado; workflow semanal configurado.

### B58. Verificar paridade de arquivos vs registros no ledger
**Contexto**: Inconsistência entre count de arquivos em `supabase/migrations/` e registros em `schema_migrations` é sinal de drift.  
**Ação**: `SELECT count(*) FROM supabase_migrations.schema_migrations` via MCP. Comparar com `ls supabase/migrations/ | wc -l`.  
**Validação**: Counts iguais, ou diferença justificada em `docs/db/migration-ledger-drift.md`.

### B59. Auditar índices duplicados ou redundantes
**Contexto**: Índices duplicados aumentam custo de write sem benefício.  
**Ação**: `SELECT indrelid::regclass AS table, array_agg(indexrelid::regclass) AS indexes FROM pg_index GROUP BY indrelid, indkey HAVING count(*) > 1` via MCP.  
**Validação**: Zero índices duplicados; ou os encontrados têm justificativa documentada.

### B60. Documentar política de migration para DDL fora do fluxo
**Contexto**: CLAUDE.md já documenta a política mas não há enforcement automatizado para o caso geral.  
**Ação**: Verificar se `ddl-out-of-band-detector.yml` existe no repositório. Se não, criar workflow semanal que compara `supabase/schema-manifest.json` com banco real e abre issue se divergência detectada.  
**Validação**: Workflow existe (ou criado); disparo manual funciona.

---

## FASE C — EDGE FUNCTIONS (Etapas 61–85)
*Audit, cobertura, monitoramento e deploy seguro.*

### C61. Confirmar callers de todas as 54 functions Grupo A
**Contexto**: Grupo A tem 54 functions com callers declarados — verificar se referências no front não foram quebradas por refactoring.  
**Ação**: Para cada function do Grupo A, confirmar que existe `fetch('/functions/v1/<nome>')` ou importação equivalente no front via grep.  
**Validação**: Zero functions do Grupo A sem caller confirmado no código.

### C62. Resolver todas as 17 functions Grupo E (orphans)
**Contexto**: 17 functions sem caller: auto-close-conversations, cleanup-rate-limit-logs, elevenlabs-agent-token, external-db-bridge, gmail-send, gmail-sync, health, metrics, multiplixvoices, recover-corrupted-audios, recover-message-media, send-rate-limit-alert, status, talkx-report, talkx-scheduler, talkx-storage-purge, voice-copilot-action.  
**Ação**: Para cada function: (a) verificar se é pg_cron → mover para Grupo C; (b) verificar last commit — se > 6 meses sem use → arquivar; (c) se recente → investigar desconexão acidental.  
**Validação**: `ESTADO.md` atualizado; Grupo E vazio ou com justificativa explícita para cada entry.

### C63. Criar shared module `_shared/error-response.ts`
**Contexto**: Functions retornam erros em formatos diferentes. Padronização facilita debugging.  
**Ação**: Criar `supabase/functions/_shared/error-response.ts` com `internalErrorResponse(code, detail?)` e `validationError(field, message)`. Substituir error handling nas 10 functions de maior volume.  
**Validação**: Chamadas com input inválido retornam `{error: {code, message}}` consistente.

### C64. Criar shared module `_shared/logger.ts`
**Contexto**: `console.log` em produção polui logs e pode vazar PII.  
**Ação**: Criar `supabase/functions/_shared/logger.ts` com `log(level, message, ctx)` que emite JSON estruturado. Substituir `console.log/error` nas 10 functions críticas.  
**Validação**: Logs em produção são JSON com `{level, message, timestamp}`, sem PII.

### C65. Verificar timeouts em functions com múltiplas queries
**Contexto**: Functions sem timeout explícito podem travar por > 150s (limite do Supabase).  
**Ação**: Para functions com > 3 queries em sequência, adicionar `AbortController` com timeout de 30s.  
**Validação**: Function com banco lento retorna 504 em < 35s (não trava indefinidamente).

### C66. Criar shared module `_shared/retry.ts`
**Contexto**: Retry logic duplicada em múltiplas functions de WhatsApp.  
**Ação**: Criar `supabase/functions/_shared/retry.ts` com `withRetry(fn, {maxAttempts: 3, backoffMs: 1000})`. Substituir implementações inline.  
**Validação**: Zero implementações de retry duplicadas nas functions.

### C67. Documentar variáveis de ambiente de cada function
**Contexto**: Sem documentação de env vars, deploy em ambiente novo falha silenciosamente.  
**Ação**: Criar `docs/functions/ENV_VARS_CATALOG.md` listando variáveis obrigatórias e opcionais por function.  
**Validação**: Cada function tem ao menos 1 entrada no catálogo.

### C68. Verificar coverage de `deploy-functions.yml`
**Contexto**: Workflow de 33KB pode não incluir todas as 81 functions.  
**Ação**: Ler workflow. Comparar lista de functions deployadas com `ls supabase/functions/` (excluindo `_shared`, `_archive`). Adicionar as faltantes.  
**Validação**: Count de functions no workflow == count de diretórios em `supabase/functions/` (excluindo _shared/_archive).

### C69. Conectar `health` a caller de monitoramento externo
**Contexto**: Function `health` existe mas sem caller (Grupo E). Conectá-la a uptime monitor resolve o Grupo E para essa function.  
**Ação**: Verificar que `health/index.ts` retorna `{status: 'ok', timestamp, version}`. Documentar URL de monitoramento em `docs/functions/SLA_CATALOG.md`.  
**Validação**: GET para URL da function com Bearer válido retorna `{status: 'ok'}`.

### C70. Implementar circuit breaker para Evolution API
**Contexto**: Dependência da Evolution API sem circuit breaker causa cascade failure quando a API cai.  
**Ação**: Nas 5 functions principais de WhatsApp, adicionar `try/catch` com fallback `{status: 'queued'}` e log de error quando Evolution API retorna timeout/5xx.  
**Validação**: Simulação de timeout da Evolution API → function retorna 200 com `{status: 'queued'}`, não 500.

### C71. Auditar functions com acesso a banco externo
**Contexto**: Functions além de `external-db-bridge` podem acessar bancos externos sem documentação.  
**Ação**: `grep -r "postgres://\|DATABASE_URL" supabase/functions/ --include="*.ts" -l`.  
**Validação**: Zero functions acessam banco externo sem documentação em `ESTADO.md`.

### C72. Criar testes unitários para as 5 functions mais críticas
**Contexto**: Zero testes para edge functions — cada deploy é deploy às cegas.  
**Ação**: Identificar 5 functions de maior volume (via frequência de chamada em front). Criar `index.test.ts` com Deno test runner para happy path e cenário de error.  
**Validação**: `deno test supabase/functions/*/index.test.ts` passa com exit 0.

### C73. Criar step de metrics de functions no CI
**Contexto**: Sem visibilidade de latência/erros por function no CI, problemas chegam ao usuário primeiro.  
**Ação**: Adicionar step em `db-live-guard.yml` que agrega métricas de functions das últimas 24h e posta no job summary.  
**Validação**: Job summary mostra tabela de latência e error rate por function.

### C74. Verificar `crm-sync-worker.yml` — function correspondente
**Contexto**: Workflow CI de 5.1KB para CRM sync — verificar se há function correspondente e se está em ESTADO.md.  
**Ação**: Ler `crm-sync-worker.yml`. Identificar qual function/script orquestra e como se encaixa no fluxo.  
**Validação**: Fluxo CRM sync documentado em `ESTADO.md`.

### C75. Padronizar validação de input com Zod nas functions críticas
**Contexto**: Functions sem validação tipada de input aceitam payloads malformados silenciosamente.  
**Ação**: Nas 5 functions de maior volume, adicionar `import { z } from 'npm:zod'` e schema de validação. Request inválido → 400.  
**Validação**: Request com campo obrigatório ausente → 400 com `{error: {code: 'VALIDATION_ERROR', field, message}}`.

### C76. Criar `docs/functions/SLA_CATALOG.md`
**Contexto**: Sem SLA documentado, não há base para alertas de latência.  
**Ação**: Criar arquivo com tempo médio esperado e P95 para as 20 functions mais críticas.  
**Validação**: Arquivo criado e linked no `ESTADO.md`.

### C77. Verificar localhost em headers CORS de functions
**Contexto**: CORS hardcoded para `localhost:3000` ou `localhost:5173` em produção é bug silencioso.  
**Ação**: `grep -r "localhost:3000\|localhost:5173" supabase/functions/ --include="*.ts"`.  
**Validação**: Zero ocorrências de localhost hardcoded em CORS headers.

### C78. Implementar cache de resposta para `talkx-report`
**Contexto**: Reports são queries pesadas que se repetem para mesmos parâmetros.  
**Ação**: Adicionar `Cache-Control: max-age=300, private` no header de resposta quando `workspace_id + date` são os mesmos.  
**Validação**: Segunda chamada com mesmos parâmetros retorna em < 100ms.

### C79. Criar monitoramento de erros de pg_net não tratados
**Contexto**: `pg_net` falha silenciosamente — requests com erro ficam em `net._http_response` sem alertar.  
**Ação**: Criar pg_cron job que verifica `SELECT count(*) FROM net._http_response WHERE error_msg IS NOT NULL AND created > NOW() - INTERVAL '1h'` e loga se > 5.  
**Validação**: Job criado; documentado em `docs/db/pg-cron-jobs.md`.

### C80. Criar ambiente de staging para edge functions
**PARAR AQUI — Requer aprovação do Joaquim antes de executar.**  
**Contexto**: Sem staging, todos os deploys vão direto para produção. Criar projeto Supabase de staging tem custo mensal.  
**Ação**: Criar documento `docs/architecture/STAGING_PROPOSAL.md` com custo estimado e benefícios. Aguardar aprovação.  
**Validação**: Documento criado; PARAR e reportar ao Joaquim.

### C81. Documentar DAG de dependências entre functions
**Contexto**: Function do Grupo B chama outra function. Mapear todas as dependências previne bugs de deploy.  
**Ação**: Criar `docs/functions/FUNCTIONS_DAG.md` com grafo de dependências entre functions.  
**Validação**: Arquivo criado; cada function do Grupo B tem caller documentado.

### C82. Verificar SPF/DKIM para `gmail-send`
**Contexto**: Envio de e-mail sem SPF/DKIM adequado resulta em spam.  
**Ação**: Verificar headers de autenticação em e-mail de teste enviado pela function (DMARC, SPF, DKIM).  
**Validação**: E-mail recebido tem cabeçalho `Authentication-Results: pass`.

### C83. Criar `ESTADO.md` atualizado após resolução do Grupo E
**Contexto**: Após C62, o ESTADO.md de 81 functions estará desatualizado.  
**Ação**: Atualizar `ESTADO.md` com: total atualizado de functions, mudanças no Grupo E, novas functions em `_archive/`.  
**Validação**: ESTADO.md tem data de atualização = data atual.

### C84. Verificar rate limiting em `whatsapp-webhook` para mesmo sender
**Contexto**: Webhook pode ser chamado em loop por sender malicioso.  
**Ação**: Verificar se há `INSERT INTO rate_limits (ip, endpoint)` no início do handler do webhook. Se não, implementar.  
**Validação**: 100 requests do mesmo IP em 10s retornam 429 após o limite.

### C85. Criar pipeline de validação de functions antes do deploy
**Contexto**: `deploy-functions.yml` deploya sem rodar testes. Adicionar step de testes antes do deploy.  
**Ação**: Adicionar step `deno test supabase/functions/*/index.test.ts` antes do step de deploy em `deploy-functions.yml`.  
**Validação**: Falha de teste cancela o deploy da function afetada.

---

## FASE D — TYPESCRIPT STRICT MODE (Etapas 86–105)
*Habilitação gradual por diretório — zero regressões.*

### D86. Medir impacto de `strict: true` — baseline de erros
**Contexto**: Habilitar strict quebrará arquivos. Medir o impacto antes.  
**Ação**: `npx tsc --noEmit --strict 2>&1 | grep -c 'error TS'` no repo local. Criar `docs/typescript/strict-mode-baseline.md` com count por categoria.  
**Validação**: Arquivo criado com número total de erros e top-5 categorias.

### D87. Habilitar `strict: true` em `src/utils/`
**Ação**: Criar `src/utils/tsconfig.json` estendendo o raiz com `"strict": true`. Corrigir todos os erros.  
**Validação**: `npx tsc -p src/utils/tsconfig.json --noEmit` exit 0.

### D88. Habilitar `strict: true` em `src/lib/`
**Ação**: Criar `src/lib/tsconfig.json` com strict. Corrigir erros.  
**Validação**: `npx tsc -p src/lib/tsconfig.json --noEmit` exit 0.

### D89. Habilitar `strict: true` em `src/types/`
**Ação**: Criar `src/types/tsconfig.json` com strict. Corrigir erros de tipagem.  
**Validação**: `npx tsc -p src/types/tsconfig.json --noEmit` exit 0.

### D90. Habilitar `strict: true` em `src/adapters/`
**Ação**: Criar `src/adapters/tsconfig.json` com strict. Corrigir erros de transformação de tipos.  
**Validação**: `npx tsc -p src/adapters/tsconfig.json --noEmit` exit 0.

### D91. Habilitar `strict: true` em `src/services/`
**Ação**: Criar `src/services/tsconfig.json` com strict. Corrigir erros especialmente `any` em respostas de Supabase.  
**Validação**: `npx tsc -p src/services/tsconfig.json --noEmit` exit 0.

### D92. Eliminar `as any` em `src/services/`
**Ação**: `grep -rn 'as any' src/services/` — substituir cada ocorrência por tipo correto derivado de `types.ts`.  
**Validação**: Zero `as any` em `src/services/`.

### D93. Habilitar `strict: true` em `src/hooks/`
**Ação**: Criar `src/hooks/tsconfig.json` com strict. Corrigir erros em `useCallback`, `useMemo`.  
**Validação**: `npx tsc -p src/hooks/tsconfig.json --noEmit` exit 0.

### D94. Eliminar `as any` em `src/hooks/`
**Ação**: Substituir `as any` por tipos gerados de `src/integrations/supabase/types.ts`.  
**Validação**: Zero `as any` em `src/hooks/`.

### D95. Habilitar `strict: true` em `src/contexts/`
**Ação**: Criar `src/contexts/tsconfig.json` com strict.  
**Validação**: `npx tsc -p src/contexts/tsconfig.json --noEmit` exit 0.

### D96. Habilitar `strict: true` em `src/config/`
**Contexto**: Crítico: `src/config/supabase.ts` deve manter a lógica de banco local vs produção.  
**Ação**: Criar `src/config/tsconfig.json` com strict. Verificar invariantes do config.  
**Validação**: `npx tsc -p src/config/tsconfig.json --noEmit` exit 0. `src/config/supabase.ts` ainda rejeita banco de produção em dev.

### D97. Habilitar `strict: true` em `src/features/`
**Ação**: Criar `src/features/tsconfig.json` com strict. Corrigir em sub-diretórios em lotes de 20 arquivos.  
**Validação**: `npx tsc -p src/features/tsconfig.json --noEmit` exit 0.

### D98. Habilitar `strict: true` em `src/components/`
**Contexto**: 297+ componentes — maior volume. Focar em `ReactNode`, `event handlers` sem tipagem.  
**Ação**: Criar `src/components/tsconfig.json` com strict. Corrigir em lotes de 30 componentes.  
**Validação**: `npx tsc -p src/components/tsconfig.json --noEmit` exit 0.

### D99. Habilitar `strict: true` em `src/pages/`
**Ação**: Criar `src/pages/tsconfig.json` com strict.  
**Validação**: `npx tsc -p src/pages/tsconfig.json --noEmit` exit 0.

### D100. Habilitar `strict: true` global em `tsconfig.json`
**Ação**: Adicionar `"strict": true` em `tsconfig.json` raiz. Corrigir erros residuais.  
**Validação**: `npx tsc --noEmit` exit 0 com strict global.

### D101. Habilitar `noUncheckedIndexedAccess`
**Ação**: Adicionar `"noUncheckedIndexedAccess": true` em `tsconfig.json`. Corrigir erros de array access (`arr[0]` → `arr[0]!` ou `arr.at(0)`).
**Validação**: `npx tsc --noEmit` exit 0.

### D102. Habilitar `exactOptionalPropertyTypes`
**Ação**: Adicionar flag e corrigir erros de optional properties.  
**Validação**: `npx tsc --noEmit` exit 0.

### D103. Configurar ESLint rule `no-explicit-any: error`
**Ação**: Adicionar `"@typescript-eslint/no-explicit-any": "error"` no `eslint.config.js`. Corrigir todos os `as any` restantes.  
**Validação**: `npm run lint` exit 0.

### D104. Criar script de TypeScript health score
**Ação**: Criar `scripts/ts-health.mjs` que conta: erros strict, `as any`, `@ts-ignore`, `@ts-expect-error`. Postar no CI job summary.  
**Validação**: Script executável; CI mostra health score.

### D105. Atualizar `.tsc-baseline.json` para estado final
**Contexto**: Com strict habilitado, o baseline de erros TS é zero.  
**Ação**: Atualizar `.tsc-baseline.json` com zero erros.  
**Validação**: `node scripts/check-tsc-baseline.mjs` exit 0.

---

## FASE E — TESTES (Etapas 106–125)
*Cobertura unitária, integração e E2E.*

### E106. Medir coverage atual — baseline
**Ação**: `npx vitest run --coverage 2>&1 | tail -20`. Criar `docs/tests/coverage-baseline.md`.  
**Validação**: Arquivo com percentuais de coverage por diretório.

### E107. Adaptar E2E specs com URL de produção hardcoded
**Contexto**: `e2e/catalog.spec.ts`, `e2e/fixtures/talkx-demo.ts`, `e2e/fixtures/mapa-mocks.ts` usam URL do banco oficial.  
**Ação**: Substituir por `process.env.E2E_SUPABASE_URL_OVERRIDE || PROD_URL`.  
**Validação**: Specs passam com `E2E_SUPABASE_URL_OVERRIDE=http://127.0.0.1:54321`.

### E108. Criar testes unitários para `src/utils/` — cobertura 95%
**Ação**: Para cada arquivo em `src/utils/`, criar `*.test.ts` com todos os caminhos cobertos.  
**Validação**: Coverage de `src/utils/` ≥ 95%.

### E109. Criar testes para os 10 hooks mais críticos
**Ação**: Identificar 10 hooks mais referenciados. Criar `*.test.ts` com mock de Supabase para happy path e error path.  
**Validação**: Cada hook tem ao menos 2 testes (happy + error).

### E110. Criar testes para `src/services/`
**Ação**: Para cada service file, criar `*.test.ts` mockando Supabase/Evolution API.  
**Validação**: Coverage de `src/services/` ≥ 80%.

### E111. Mergear PRs do lote F1a (batches 10–12)
**Contexto**: PRs #2087, #2088, #2089 — mocks de Supabase, safe-area mobile, upload de áudio.  
**Ação**: Verificar CI de cada PR → merge squash.  
**Validação**: `github_is_pr_merged` retorna `true` para #2087, #2088, #2089.

### E112. Criar testes de integração para os 5 fluxos críticos
**Fluxos**: (1) receber mensagem, (2) enviar resposta, (3) transferir atendimento, (4) fechar conversa, (5) gerar relatório.  
**Ação**: Criar `*.integration.test.ts` para cada fluxo com banco local.  
**Validação**: `npx vitest run src/**/*.integration.test.ts` passa.

### E113. Habilitar coverage LCOV no vitest
**Ação**: Adicionar `coverage: { reporter: ['lcov', 'text', 'html'] }` em `vitest.config.ts`.  
**Validação**: `npx vitest run --coverage` gera `coverage/lcov.info`.

### E114. Adicionar gate de coverage mínimo no CI
**Ação**: Step no CI que falha se coverage global < 60%.  
**Validação**: CI falha se coverage cai abaixo do threshold.

### E115. Criar testes E2E para fluxo de login
**Ação**: Criar `e2e/auth.spec.ts` com happy path de login contra banco local.  
**Validação**: `npx playwright test e2e/auth.spec.ts` passa.

### E116. Criar testes E2E para criação de conversa
**Ação**: Criar `e2e/conversation-create.spec.ts`: abrir modal → preencher → salvar → verificar na lista.  
**Validação**: Spec passa com banco local.

### E117. Criar mock de Supabase Realtime para testes
**Contexto**: 24 tabelas com Realtime — hooks de subscription são difíceis de testar sem mock.  
**Ação**: Criar `src/test/mocks/supabase-realtime.ts` com mock de `supabase.channel()`.  
**Validação**: Testes de hooks Realtime passam sem conexão real ao banco.

### E118. Mergear PRs do lote F1a (batches 13–15)
**Contexto**: PRs #2090 (fila offline) e restantes do lote.  
**Ação**: Verificar CI → merge squash.  
**Validação**: `github_is_pr_merged` retorna `true` para todos os PRs do lote F1a restantes.

### E119. Criar fixture de dados de teste consistente
**Ação**: Criar `e2e/fixtures/test-data.ts` com workspace, usuário, conversa e mensagens de teste padrão.  
**Validação**: Zero `undefined` errors em specs que usam a fixture.

### E120. Configurar Playwright workers paralelos
**Ação**: `workers: 4` em `playwright.config.ts` com specs independentes via fixture por worker.  
**Validação**: Suite E2E completa em < 5 minutos.

### E121. Criar snapshot tests para 5 componentes críticos de UI
**Ação**: Criar snapshots para MessageBubble, ConversationList e outros 3 componentes core.  
**Validação**: `npx vitest run src/components/**/*.snapshot.test.tsx` exit 0.

### E122. Criar testes de regressão de performance de queries
**Ação**: Criar `scripts/db-audit/perf-regression.mjs` medindo tempo de 5 queries críticas vs baseline.  
**Validação**: Script executável; inclui `rpc_refresh_daily_metrics`, conversations query, contacts lookup.

### E123. Configurar relatório de test results como GitHub Check
**Ação**: Adicionar `--reporter=junit` no vitest e upload do XML via `dorny/test-reporter`.  
**Validação**: PRs mostram anotações de falha de teste nos arquivos modificados.

### E124. Criar testes de contrato para 5 edge functions críticas
**Ação**: Criar schema de validação de request/response para as 5 functions mais chamadas em `docs/functions/contracts/`.  
**Validação**: Contrato de cada function documentado e validado em CI.

### E125. Implementar mutation testing para `src/utils/`
**Ação**: Instalar `@stryker-mutator/core`. Alvo: mutation score ≥ 70% em `src/utils/`.  
**Validação**: `npx stryker run` para `src/utils/` mostra score ≥ 70%.

---

## FASE F — CI/CD (Etapas 126–145)
*Workflows, gates e automação.*

### F126. Documentar todos os 14 workflows
**Ação**: Ler cada workflow; criar `docs/ci/PIPELINE_MAP.md` com: nome, trigger, jobs, propósito.  
**Validação**: Arquivo criado com entry para todos os 14 workflows.

### F127. Adicionar `permissions: contents: read` onde faltante
**Ação**: Para cada workflow sem `permissions:` no topo, adicionar escopo mínimo.  
**Validação**: `actionlint .github/workflows/*.yml` sem warnings de permission.

### F128. Adicionar `concurrency: cancel-in-progress` em workflows de PR
**Ação**: Para workflows de PR sem `concurrency:`, adicionar com `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.  
**Validação**: Push duplo em PR cancela o run anterior.

### F129. Fixar versões de Actions para SHA-256
**Ação**: Para cada `uses: actions/checkout@v4` ou tag mutable, substituir por SHA do commit correspondente.  
**Validação**: `grep 'uses:.*@v[0-9]' .github/workflows/*.yml` retorna zero.

### F130. Refatorar `db-guard.yml` — extrair SQL inline para scripts
**Contexto**: 118KB indica múltiplas queries SQL inline. Melhor manutenção como scripts externos.  
**Ação**: Identificar blocos SQL com > 20 linhas; extrair para `scripts/db-audit/`.  
**Validação**: `db-guard.yml` < 50KB após extração.

### F131. Adicionar `timeout-minutes` em todos os jobs
**Ação**: Para cada job sem `timeout-minutes:`, adicionar valor: gates ≤ 10min, E2E ≤ 30min.  
**Validação**: `grep 'timeout-minutes' .github/workflows/*.yml` retorna ao menos 1 por workflow com jobs.

### F132. Criar workflow `dependency-review.yml`
**Ação**: Criar workflow com `actions/dependency-review-action` com `fail-on-severity: high`.  
**Validação**: PR com dependência com CVE high é bloqueado.

### F133. Criar workflow de drift check periódico
**Ação**: Adicionar cron semanal em `db-live-guard.yml` comparando `schema-manifest.json` com banco real.  
**Validação**: Cron configurado; simulação de drift gera issue.

### F134. Verificar `types-sync.yml` — cobertura de schemas
**Ação**: Ler `types-sync.yml`. Verificar se regenera `auth`, `storage`, `realtime` além de `public`.  
**Validação**: Tipos gerados incluem schemas completos.

### F135. Criar workflow semanal de auditoria de segurança
**Ação**: Criar `security-audit-weekly.yml` com `npm audit --json` e abertura de issue se CVE high.  
**Validação**: Disparo manual funciona; issue aberta se CVEs encontradas.

### F136. Corrigir `e2e-logado.yml` — banco local
**Ação**: Ler workflow. Se usa banco de produção, adaptar para `E2E_SUPABASE_URL_OVERRIDE`.  
**Validação**: E2E autenticado roda sem expor credenciais de produção.

### F137. Adicionar actionlint no CI
**Ação**: Verificar se `ci.yml` inclui actionlint. Se não, adicionar step.  
**Validação**: actionlint passa para todos os workflows atuais.

### F138. Adicionar `defaults: run: shell: bash` em todos os workflows
**Ação**: Para cada workflow sem `defaults:`, adicionar.  
**Validação**: Todos os 14 workflows têm `defaults: run: shell: bash`.

### F139. Criar gate de bundle size no CI
**Ação**: Adicionar step que falha se bundle principal > 500KB gzipped.  
**Validação**: CI falha quando bundle ultrapassa threshold.

### F140. Verificar `notifica-falha-main.yml` — conteúdo da notificação
**Ação**: Ler workflow. Garantir que notificação inclui: nome do job, link do run, link do commit.  
**Validação**: Falha simulada em `main` gera notificação completa.

### F141. Verificar `branch-hygiene-audit.yml` — frequência e ação
**Ação**: Ler workflow. Verificar schedule e o que faz com branches velhas.  
**Validação**: Workflow roda semanalmente; branches > 30 dias sem merge são listadas.

### F142. Adicionar `persist-credentials: false` em todos os checkout steps
**Ação**: Para cada `uses: actions/checkout@*` sem `persist-credentials: false`, adicionar o parâmetro.  
**Validação**: `grep 'persist-credentials: false' .github/workflows/*.yml` encontra ao menos 1 por workflow com checkout.

### F143. Criar workflow de secret scanning
**Ação**: Adicionar step com `gitleaks` ou `trufflehog` em `ci.yml`.  
**Validação**: PR com segredo hardcoded é bloqueado.

### F144. Auditar `targeted-ledger-evidence.yml`
**Ação**: Ler workflow completo. Entender propósito; verificar se ainda é necessário.  
**Validação**: Workflow documentado em `docs/ci/PIPELINE_MAP.md` com propósito.

### F145. Criar `scripts/pre-merge-checklist.mjs`
**Ação**: Script que verifica: CI verde, sem conflitos, usage-guard exit 0, lint 0 erros. Roda localmente antes de solicitar merge.  
**Validação**: Script executável com checklist de status por item.

---

## FASE G — PERFORMANCE (Etapas 146–160)
*Frontend, real-time e banco.*

### G146. Medir e documentar Web Vitals baseline
**Ação**: Lighthouse CI contra staging/produção. Documentar LCP, FID, CLS, TTFB em `docs/performance/web-vitals-baseline.md`.  
**Validação**: Arquivo criado com valores baseline.

### G147. Lazy loading para `mapbox-gl` e `ElevenLabs`
**Ação**: Verificar se imports são top-level. Converter para `React.lazy()` + `Suspense`.  
**Validação**: Bundle inicial reduz > 100KB. Network tab mostra chunk carregado sob demanda.

### G148. Implementar virtual scrolling em listas longas
**Ação**: Verificar se `@tanstack/react-virtual` está em uso em `ConversationList` e `MessageList`. Se não, implementar.  
**Validação**: Lista com 1000 items renderiza em < 100ms (Chrome DevTools Performance).

### G149. Adicionar `React.memo` nos componentes de message bubble
**Ação**: Adicionar `React.memo` em `MessageBubble`. Verificar com React DevTools Profiler.  
**Validação**: Nova mensagem causa re-render apenas no bubble novo, não na lista inteira.

### G150. Configurar `staleTime` em React Query para queries pesadas
**Ação**: Nas 5 queries mais pesadas, configurar `staleTime: 5 * 60 * 1000`.  
**Validação**: Navegação entre páginas sem nova requisição de rede para dados com staleTime não expirado.

### G151. Consolidar canais Realtime — reduzir de 24 para mínimo
**Ação**: `supabase.getChannels()` em DevTools. Se channels criados por componente (não por módulo), consolidar subscriptions.  
**Validação**: Número de WebSocket channels ≤ número de workspaces ativos.

### G152. Adicionar debounce em search inputs
**Ação**: Verificar se search inputs usam `useDebounce(value, 300)`. Se não, adicionar.  
**Validação**: Network tab mostra apenas 1 request após parar de digitar.

### G153. Otimizar imagens — WebP + lazy loading
**Ação**: Adicionar `vite-plugin-imagemin` se não existe. Verificar se imagens em `public/` são servidas como WebP.  
**Validação**: Lighthouse Image Optimization ≥ 80%.

### G154. Implementar preload de rotas críticas
**Ação**: Adicionar `<link rel="modulepreload">` para as 3 rotas mais acessadas.  
**Validação**: Navegação para rotas preloaded sem spinner.

### G155. Adicionar cache de 5 minutos para `rpc_refresh_daily_metrics`
**Ação**: Criar tabela `public.metrics_cache(workspace_id, date, data JSONB, cached_at)`. Atualizar RPC para usar cache quando `cached_at > NOW() - INTERVAL '5 minutes'`.  
**Validação**: Segunda chamada do RPC retorna em < 50ms.

### G156. Implementar service worker para assets estáticos
**Ação**: Verificar se `vite-plugin-pwa` está instalado. Se não, adicionar para cache de assets (sem dados dinâmicos).  
**Validação**: Segunda visita carrega em < 1s com SW cache.

### G157. Remover dependências não utilizadas
**Ação**: `npx depcheck`. Listar não utilizadas. Confirmar antes de remover.  
**Validação**: Zero dependências não utilizadas em `package.json`.

### G158. Corrigir queries N+1 em hooks de listagem
**Ação**: `grep -r '.from\|supabase.' src/hooks/ -l` — identificar hooks com queries dentro de loops.  
**Validação**: Zero loops com chamadas de Supabase dentro (`for/map + await query`).

### G159. Planejar CDN para mídias de WhatsApp
**PARAR AQUI — Requer aprovação do Joaquim.**  
**Ação**: Criar `docs/architecture/CDN_PROPOSAL.md` com custo estimado. Aguardar aprovação.  
**Validação**: Documento criado; PARAR.

### G160. Reduzir TTI — auditoria de providers no critical path
**Ação**: Lighthouse TTI. Se > 3.5s, identificar providers que podem ser lazy ou removidos do critical path.  
**Validação**: Lighthouse TTI < 3.5s em conexão 3G Fast.

---

## FASE H — QUALIDADE E MANUTENIBILIDADE (Etapas 161–175)

### H161. Adicionar ErrorBoundary em todas as páginas
**Ação**: Criar `src/components/ErrorBoundary.tsx` se não existe. Aplicar em cada `<Route>` em `App.tsx`.  
**Validação**: Erro em um componente não derruba toda a aplicação.

### H162. Implementar correlation ID em logs
**Ação**: Criar `src/lib/logger.ts` com `trace_id` (UUID por sessão). Propagar nos headers de request para edge functions.  
**Validação**: Logs de front e edge function para mesma ação compartilham `trace_id`.

### H163. Mergear PRs de segurança Z-series restantes
**Contexto**: Verificar se sobrou algum PR da Fase A pendente.  
**Ação**: Listar PRs abertos com labels de segurança. Mergear os verdes.  
**Validação**: Zero PRs com label de segurança aguardando merge há > 24h após CI verde.

### H164. Padronizar respostas de erro no front-end
**Ação**: Criar `src/lib/error-formatter.ts` com `formatSupabaseError(error)`. Substituir exibições diretas de `error.message`.  
**Validação**: Erros de rede mostram mensagem amigável, não stack trace.

### H165. Configurar retry automático em React Query
**Ação**: `QueryClient` com `defaultOptions: { queries: { retry: 2, retryDelay: exponentialBackoff } }`.  
**Validação**: Query com falha de rede é retentada com back-off exponencial.

### H166. Criar `src/constants/` para valores mágicos
**Ação**: Criar `src/constants/index.ts` com status de conversa, tipos de mensagem, limites de paginação.  
**Validação**: `grep -r '"open"\|"closed"\|"pending"' src/hooks/` retorna zero (substituídos por constantes).

### H167. Documentar árvore de contextos React
**Ação**: Criar `docs/architecture/CONTEXT_TREE.md` com diagrama de providers e o que cada contexto expõe.  
**Validação**: Arquivo criado; cada contexto tem JSDoc com propósito e interface.

### H168. Extrair sub-hooks de hooks com > 300 linhas
**Ação**: `find src/hooks -name '*.ts' | xargs wc -l | sort -n | tail -10`. Refatorar os maiores.  
**Validação**: Zero hooks com > 300 linhas.

### H169. Verificar e completar cobertura de i18n
**Ação**: `grep -r '"Confirmar"\|"Cancelar"\|"Salvar"' src/components/ --include="*.tsx"`. Substituir por `t()`.  
**Validação**: Zero strings hardcoded em PT-BR em `src/components/`.

### H170. Criar `CONTRIBUTING_AI.md` — quickstart para agentes
**Ação**: Criar com as 10 regras mais críticas em formato checklist — referência rápida sem ler 71KB de CLAUDE.md.  
**Validação**: Arquivo criado; cobre: banco correto, branch, push, DDL, edge functions.

### H171. Implementar feature flags para VoIP e ElevenLabs
**Ação**: Criar `src/config/feature-flags.ts`. Envolver `sip.js` e ElevenLabs em flags `FEATURE_VOIP` e `FEATURE_AI_VOICE`.  
**Validação**: Desabilitar flag remove o componente do bundle (tree-shaking verificado com `npx vite-bundle-visualizer`).

### H172. Limpar imports não utilizados
**Ação**: `npx eslint src/ --rule '{"no-unused-vars": "error"}' --fix`.  
**Validação**: `npm run lint` exit 0 sem warnings de imports.

### H173. Padronizar nomenclatura de hooks (prefixo `use`)
**Ação**: `find src/hooks -name '*.ts' ! -name 'use*'` — identificar arquivos sem prefixo. Renomear.  
**Validação**: Todos os arquivos em `src/hooks/` começam com `use`.

### H174. Planejar error tracking em produção (Sentry)
**PARAR AQUI — Requer aprovação do Joaquim.**  
**Ação**: Criar `docs/architecture/ERROR_TRACKING_PROPOSAL.md` com custo e política de dados (LGPD). Aguardar aprovação.  
**Validação**: Documento criado; PARAR.

### H175. Atualizar `ESTADO.md` com estado pós-plano
**Ação**: Após Fases A-G, atualizar `ESTADO.md`: Grupo E resolvido, tests status, strict mode status.  
**Validação**: `ESTADO.md` com data de atualização atual e reflete mudanças do plano.

---

## FASE I — DOCUMENTAÇÃO E GOVERNANÇA (Etapas 176–190)

### I176. Criar `docs/adr/ADR-001-evolution-messages-partman.md`
**Ação**: Documentar: problema (1.83M rows), alternativas (partman, archive, delete), decisão, consequências.  
**Validação**: Arquivo criado com seções: Status, Contexto, Decisão, Consequências.

### I177. Criar `docs/adr/ADR-002-typescript-strict-mode.md`
**Ação**: Documentar: por que habilitar, estratégia gradual por diretório, trade-offs.  
**Validação**: Arquivo criado.

### I178. Criar ADR para política de retenção de dados (LGPD)
**PARAR AQUI — Requer aprovação do Joaquim antes de publicar.**  
**Ação**: Criar `docs/adr/ADR-003-data-retention-lgpd.md` com implicações LGPD. Aguardar revisão legal.  
**Validação**: Documento criado; PARAR e reportar ao Joaquim.

### I179. Criar `docs/architecture/SYSTEM_OVERVIEW.md`
**Ação**: Documento de arquitetura: stack, componentes, fluxo de dados, integrações externas (Evolution API, ElevenLabs, Mapbox, Bitrix24).  
**Validação**: Documento em < 500 linhas descrevendo o sistema.

### I180. Criar `docs/architecture/DATABASE_ARCHITECTURE.md`
**Ação**: Documento: schemas e propósito, tabelas críticas, RLS por módulo, pg_cron jobs, extensions.  
**Validação**: Cada tabela crítica tem descrição.

### I181. Atualizar `CLAUDE.md` — referenciar novos scripts do plano
**Ação**: Adicionar referências a: `pre-merge-checklist.mjs`, `health-check.sql`, `ts-health.mjs`, `ENV_VARS_CATALOG.md`.  
**Validação**: CLAUDE.md referencia todos os scripts críticos criados.

### I182. Criar `ROADMAP.md` com próximos 90 dias
**Ação**: Criar com: melhorias de UX pendentes, integrações novas planejadas, débitos técnicos não cobertos neste plano.  
**Validação**: Arquivo com ao menos 10 itens e estimativas.

### I183. Criar `docs/security/THREAT_MODEL.md`
**Ação**: Documento com: ativos a proteger, ameaças (XSS, IDOR, SSRF, injection, exfiltração), controles existentes, gaps.  
**Validação**: Cobre ao menos os 5 tipos de ameaça listados.

### I184. Documentar todas as integrações externas com fallback
**Ação**: Criar `docs/integrations/EXTERNAL_INTEGRATIONS.md`: Evolution API, ElevenLabs, Mapbox, Bitrix24 — URL, auth, SLA, fallback.  
**Validação**: Cada integração tem comportamento de fallback documentado.

### I185. Criar runbook para incidentes de produção
**Ação**: Criar `docs/runbooks/PRODUCTION_INCIDENT.md` com passos para: banco lento, edge function 100% erro, Evolution API offline, deploy quebrado.  
**Validação**: 4 cenários com passos de resolução.

### I186. Criar `CONTRIBUTING_AI.md` — quickstart definitivo para agentes
**Ação**: 10 regras críticas em checklist + comandos de verificação iniciais + links para CLAUDE.md relevantes.  
**Validação**: Novo agente com apenas este arquivo consegue: identificar banco correto, criar branch, abrir PR.

### I187. Atualizar `FEATURE_REGISTRY.md`
**Ação**: Comparar com `src/pages/`. Adicionar features implementadas não documentadas.  
**Validação**: Ao menos 1 entry por página em `src/pages/`.

### I188. Criar `scripts/quality-scoreboard.mjs`
**Ação**: Script que compila: coverage %, TypeScript errors, lint errors, PR backlog, migration drift. Publicar como CI artifact após merge em `main`.  
**Validação**: Script executável; CI publica artifact com scoreboard.

### I189. Criar `docs/governance/DEPRECATION_POLICY.md`
**Ação**: Definir: como marcar código deprecated, período de grace, processo de remoção.  
**Validação**: Primeiro caso de uso aplicado a uma function arquivada do Grupo E.

### I190. Revisão final — relatório de execução do plano
**Ação**: Para cada etapa A1–I189, verificar critério de validação. Criar `docs/plans/PLANO_190_EXECUCAO.md` com status: ✅ concluída, 🔴 bloqueada, ⏸ aguardando PO.  
**Validação**: Relatório gerado; ao menos 150 etapas (79%) com status ✅. Etapas PARAR AQUI documentadas como aguardando PO.

---

## RESUMO POR FASE

| Fase | Etapas | Foco | Bloqueadores PO |
|------|--------|------|-----------------|
| A — Segurança | 1–30 | Vulnerabilidades críticas, Z-series, orphans | — |
| B — Banco | 31–60 | Schema, migrations, drift, performance | B33 (pg_partman), B50 (retenção) |
| C — Edge Functions | 61–85 | Audit, testes, monitoramento | C80 (staging) |
| D — TypeScript | 86–105 | Strict mode gradual por diretório | — |
| E — Testes | 106–125 | Coverage, E2E, integração | — |
| F — CI/CD | 126–145 | Workflows, gates, automação | — |
| G — Performance | 146–160 | Frontend, banco, Realtime | G159 (CDN) |
| H — Qualidade | 161–175 | Error handling, i18n, logging | H174 (Sentry) |
| I — Documentação | 176–190 | ADRs, runbooks, governança | I178 (LGPD) |

**Etapas que requerem aprovação do Joaquim antes de executar:** B33, B50, C80, G159, H174, I178 (6 de 190 = 3%).  
**Etapas executáveis autonomamente pelo agente:** 184 de 190 (97%).

---

## CONTEXTO DE ANÁLISE

Este plano foi gerado após análise exaustiva do repositório `adm01-debug/Zapp_Web_V2` em 2026-10-19, cobrindo:

- **CLAUDE.md** (71KB): regras de trabalho, bancos proibidos, fluxo de migration, fluxo local
- **ESTADO.md**: 81 edge functions em grupos A-E; 17 orphans no Grupo E
- **HANDOFF_MISSION_10-10.md**: histórico de melhorias, score 10/10, oportunidades pós-10/10
- **package.json**: React 19.3.0, Vite 8.3.4, TypeScript 5.9.3, supabase-js, TanStack Query, sip.js, ElevenLabs
- **.github/workflows/**: 14 workflows (branch-hygiene-audit, ci, codeql, crm-sync-worker, db-guard [118KB], db-live-guard, db-migrate, deploy-functions, e2e-logado, e2e-talkx, notifica-falha-main, talkx-status-regen, targeted-ledger-evidence, types-sync)
- **src/**: 23 diretórios (components, hooks, services, features, pages, contexts, providers, routes, etc.)
- **PRs abertos**: #2081–#2095 (Z-series + lote F1a)
- **Banco de produção**: `tnnnlkbymytvtqngbbqh` (PostgreSQL 17.6, 513 tabelas, 181 RLS policies, 31 pg_cron jobs)

---

*Gerado por Claude Code — 2026-10-19*  
*Sessão: https://claude.ai/code/session_016ZyHwcHV9GCCRq4wGTHyeZ*
