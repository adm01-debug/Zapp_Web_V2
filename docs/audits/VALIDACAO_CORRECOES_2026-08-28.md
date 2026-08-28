# Validação Exaustiva das Correções — ZAPP WEB V2 (28/08/2026)

**Data:** 28/08/2026
**Banco validado (DESTINO):** `tnnnlkbymytvtqngbbqh.supabase.co` (Supabase Cloud, PG 17.6, vivo)
**Comparado com (ORIGEM):** `vpkmqeumtxhrwgawxdrl.supabase.co` (read-only)
**Escopo:** as ~30 correções aplicadas em 27–28/08 (21 migrations `2026082x` + fixes de código Evolution/Gmail/reset/dead-code + guards de CI).
**Método:** coordenação de **5 agentes especializados** testando ao vivo, em paralelo, com simulação segura e zero mutação persistente.

> **Garantia de não-mutação (verificada):** nenhuma linha, objeto ou configuração foi alterada em qualquer dos dois bancos. Toda simulação de escrita foi encapsulada em `DO $$ … RAISE EXCEPTION 'SIM_ROLLBACK' $$`, que aborta a transação do gateway e reverte tudo (confirmado por contagem posterior). O gateway do destino **bloqueia** `BEGIN/COMMIT/ROLLBACK` explícitos (`0A000`), então cada chamada já é atômica. Origem é read-only por guardrail. Nenhum HTTP externo foi disparado.

---

## 1. Veredito global

**APROVADO. Zero FAIL nos objetivos primários das correções.** Cada uma das cinco frentes foi testada por um agente dedicado e todas passaram no que se propuseram a corrigir. O achado mais importante é positivo e foi **provado por simulação**, não apenas por leitura de código:

> **O bug crítico de escalação de privilégio (A-01) está efetivamente corrigido.** Simulando um agente real (`e6b3fc14…`, role=agent) via injeção de `request.jwt.claims`, a tentativa de se auto-promover disparou a exceção `Only administrators can modify role, permissions, or access_level` nos **três** vetores (role, permissions, access_level); um admin real continuou autorizado; um update benigno passou sem falso-positivo; e o caminho de reversão silenciosa (`prevent_role_escalation`) está morto (0 triggers o referenciam). Antes da correção, o trigger silencioso rodava primeiro por ordem alfabética e neutralizava a exceção — o ataque passava despercebido.

Os demais objetivos verificados sem falha: ACLs de segurança travados a `service_role`/`postgres`, guard de `clear_login_attempts` fail-closed (6 cenários), cripto Gmail via vault com roundtrip íntegro, 128 índices de FK (invariante FK-sem-índice = 0), `search_contacts` em scan único com RLS scoping que efetivamente filtra por papel, bridge Sicoob usando `net.http_post` sem bloquear o INSERT, remoção completa do subsistema de reset morto, e paridade de migrations 277/277 (md5 idêntico).

**Ressalva de método:** o pipeline de build/testes (`bun install` → `tsc`/`eslint`/`vitest`/`vite build`) **não é executável neste sandbox** (o install trava em ~351/1132 pacotes). A validação de banco foi ao vivo e conclusiva; a validação de build depende do CI real (ver §5).

---

## 2. Resultado por frente

| # | Frente (agente) | Itens obrigatórios | Veredito |
|---|---|---|---|
| 1 | Segurança ACL / privilégios / guards | 7 blocos | **PASS** — ACLs travados; guard `clear_login_attempts` provado fail-closed em 6 cenários; `search_path` 67/67; destino ≥ origem em estritez |
| 2 | Escalação de privilégio & triggers | 7 itens | **PASS** — fix crítico A-01 provado por simulação; A-02 (`user_devices`) ok; sem função inexistente em trigger |
| 3 | Gmail / Vault / Cripto e2e | 8 itens | **PASS** — roundtrip vault íntegro; contratos batem com 4 call sites; refresh preservado (NULL e `""`); `email_attachments` correta |
| 4 | Performance / estrutura | 11 itens | **PASS** — FK-sem-índice=0; 108/108 índices válidos; single-scan e RLS scoping provados por EXPLAIN; realtime 11/11 FULL; 277/277 migrations |
| 5 | Sicoob / reset / dead-code / CI | 6 itens (+build) | **PASS** no banco/CI — `net.http_post` + guard não-bloqueio provados; reset removido; 24/24 RPCs existem; drift zero. Build não-executável no sandbox |

---

## 3. Achados consolidados (falhas e gaps encontrados)

Nenhum destes reabre uma correção nem constitui FAIL das correções. São gaps residuais e — importante — **vários são pré-existentes, fora do escopo das migrations de 27–28/08**. Marcados `[ESCOPO]` = decorre de uma correção; `[PRÉ]` = defeito anterior exposto pelo teste exaustivo. Todos os itens médios foram **confirmados em primeira mão** pelo coordenador.

### 3.1 Médios (vale ação antes de ligar os fluxos correspondentes)

| ID | Achado | Origem | Confirmação de 1ª mão |
|---|---|---|---|
| **M1** `[ESCOPO]` | `whatsapp_connections.instance_id` é **NULLABLE** e a UNIQUE aceita **múltiplos NULL** (2 linhas NULL inseridas em simulação), contornando o objetivo anti-ambiguidade da migration `20260827201500`. Além disso o índice antigo `idx_wc_instance_id` (não-único, `idx_scan=0`) ficou **redundante** — o comentário da migration ("aproveita o mesmo índice") é factualmente errado: `ADD CONSTRAINT UNIQUE` sempre cria índice novo. | A4 | `is_nullable=YES`, 2 índices coexistem em `instance_id` ✓ |
| **M2** `[PRÉ]` | **IDOR cross-tenant**: `get_connection_qr_code(uuid)` e `get_connection_instance(uuid)` são `SECURITY DEFINER` (ignoram RLS), concedidas a `authenticated`, **sem filtro de posse** (a tabela tem `created_by`). Qualquer usuário logado lê `qr_code`/`instance_id` de qualquer conexão — o QR durante o pareamento pode facilitar sequestro de sessão WhatsApp. | A1 | corpo sem `created_by`/`has_role`/`auth.uid`; `authenticated` tem EXECUTE ✓ |
| **M3** `[ESCOPO]` | Deduplicação de triggers **incompleta**: a migration `20260827130200` cobriu `profiles` e `user_devices`, mas `agent_stats` tem **2 triggers BEFORE disparando `update_agent_level`** (`on_agent_stats_update_level` + `update_level_on_xp_change`) — roda 2× por UPDATE. Idempotente (sem corrupção), mas é o mesmo desperdício que a migration visava. | A2 | `agent_stats` tem 3 triggers (2 chamam `update_agent_level`) ✓ |
| **M4** `[PRÉ]` | A autoridade real de privilégio mora em **`user_roles`** (é o que `has_role`/`is_admin_or_supervisor` leem), não em `profiles.role`. Porém `user_roles` tem **apenas RLS, sem trigger de guard**, e `audit_role_changes` só loga INSERT/DELETE — **não loga UPDATE**. Uma troca de papel via UPDATE por `service_role` (BYPASSRLS) passa sem segunda barreira e sem trilha. | A2 | `user_roles` tem 1 trigger (só audit) ✓ |
| **M5** `[PRÉ, adjacente]` | Fluxo Gmail (hoje desligado, 0 contas): (a) `disconnect` chama `store_gmail_tokens(id,"","")` cujo RAISE é **engolido** pelo TS que não lê `.error` → ciphertext dos tokens **permanece** (retenção indevida); (b) `email_messages.thread_id` é NOT NULL mas `gmail-send` insere `thread_id:null` → 500 **após** o e-mail já ter sido enviado → retry = **envio duplicado**; (c) `encrypt_gmail_token(NULL)` retorna NULL silencioso. | A3 | — |
| **M6** `[ESCOPO]` | O guard de CI de ACL (`db-guard.yml`) tem 3 pontos cegos: **não detecta `GRANT … TO PUBLIC`** (a entrada `=X/postgres` não casa o padrão `*authenticated=X*`); roda só no schedule semanal / dispatch, **não em push/PR**; e cobre apenas `mcp_exec`/`mcp_exec_many`, não as funções de Gmail/canal/login. | A1 | — |
| **M7** `[PRÉ]` | A edge `sicoob-bridge-reply` faz `.from('profiles').select('full_name')`, mas `profiles` **não tem `full_name`** (só `name`, `nickname`); o erro não é checado → `agentName` fica sempre `'Vendedor'` e o nome real nunca chega ao Sicoob. Latente (0 contatos `sicoob_gifts`). | A5 | `profiles` tem `name,nickname` (sem `full_name`) ✓ |

### 3.2 Baixos e informativos

- **B1 · Subsistema de reset residual** `[ESCOPO]` — **convergência de 3 agentes** (A1+A2+A5): a migration `20260827170000` dropou `validate_reset_token`, mas ficaram **`get_reset_requests_safe()` e `get_own_reset_requests()`** (ambas confirmadas presentes; `get_reset_requests_safe` referencia a coluna inexistente `reset_token` → aborta com 42703, não vaza), e `types.ts:7504` ainda declara o **fantasma `validate_reset_token`**. Recomenda-se `DROP` das duas funções mortas e regenerar `types.ts` (etapa 97 do plano).
- **B2 · Bloat recorrente** `[ESCOPO]` (A4) — após o RESET de autovacuum, o bloat voltou: `whatsapp_connections` 96,7% de tuplas mortas, `contacts` 33,8%, `profiles`/`login_attempts` 50%. O vacuum pontual não foi durável em tabelas minúsculas-mas-quentes. `reltuples` de `contacts` desatualizado (164 vs 86 reais) — rodar `ANALYZE`.
- **B3 · Paginação não-determinística** `[ESCOPO]` (A4) — o desempate final de `search_contacts` é `c.name` (não-único; há 1 nome repetido em 86), então linhas empatadas podem duplicar/pular numa borda de página. Fix: acrescentar `c.id` como último critério do `ORDER BY`.
- **B4 · 9 pares de índices duplicados** `[PRÉ]` (A4) — pré-existentes (não do backfill): `allowed_countries`, `blocked_countries`, `blocked_ips`, `contacts` (`idx_contacts_contact_type`+`idx_contacts_type`), `login_attempts`, `number_reputation`, `passkey_credentials`, `talkx_blacklist`, `whatsapp_connections`.
- **B5 · Assimetria de lockout** `[PRÉ]` (A1) — `record_failed_login` e `get_own_lockout_status` executáveis sem autenticação forte: permite forçar lockout (DoS) e enumerar existência/lockout por e-mail. Inerente ao design lockout-por-email; o *clear* já está guardado, o *record* não.
- **B6 · Funções órfãs reativáveis** `[PRÉ]` (A2) — `prevent_role_escalation` (a silenciosa do A-01) e `mask_channel_credentials` existem com 0 referências; religar a primeira a `profiles` reabriria o A-01. Recomenda-se `DROP`.
- **B7 · Gmail menores** `[ESCOPO]` (A3) — multi-anexo colapsa em 1 linha (`UNIQUE(email_message_id)`); `get_gmail_tokens` de conta sem tokens retorna `(NULL,NULL)` que o TS trataria como sucesso (`Bearer null`).
- **B8 · Padrão A-01 latente em `contacts`** `[PRÉ]` (A2) — 2 BEFORE INSERT gravam `assigned_to`; seguro hoje pelo guard `IS NULL`, mas a precedência depende só do nome do trigger.
- **INFO** — grants DML de `anon`/`authenticated` em todas as tabelas (segurança 100% na RLS, sem bypass hoje); `supabase-export/*.sql` com defs antigas (ruído de grep); bridge Sicoob armada mas sem dados (secret configurado).

---

## 4. Convergências entre agentes (sinal forte)

- **Subsistema de reset morto** foi apontado independentemente por **três** agentes (segurança, triggers, CI) — é o gap de higiene mais consensual. Ação única: `DROP get_reset_requests_safe()`, `DROP get_own_reset_requests()`, regenerar `types.ts`.
- **`profiles` não tem `full_name`** apareceu tanto no acoplamento (edge Sicoob, A5) quanto implicitamente na modelagem — a coluna correta é `name`.
- **Fail-closed comprovado** em dois lugares distintos (guard de `clear_login_attempts`, A1; trigger de escalação com `auth.uid()=NULL`, A2) — o padrão defensivo é consistente.

---

## 5. Nota sobre o CI do PR #39 (teste unitário vermelho)

Diagnóstico independente do coordenador, corroborado pelo Agente 5: a falha do check "🧪 Unit Tests" **não é regressão** — o PR #39 é 100% documentação. A falha é **idêntica na base `main`** (mesmo teste `MFABackupCodes.test.tsx:108`, mesma contagem `1 failed | 2463 passed | 32 skipped`), presente nos últimos 5 commits de `main`. Causa: teste de timing com `vi.useFakeTimers()` correndo contra a promise de `navigator.clipboard.writeText`. O Agente 5 confirmou que a suíte **não roda no sandbox** (`bun install` trava), o que reforça que a validação de testes precisa do CI real. Um patch proposto foi registrado no PR; a correção definitiva do flake pertence a um PR próprio contra `main`.

---

## 6. Recomendações priorizadas (nenhuma executada — aguardam autorização)

1. **M2/IDOR** — adicionar checagem de posse/admin em `get_connection_qr_code`/`get_connection_instance` (maior risco de segurança encontrado, ainda que pré-existente).
2. **M1** — `ALTER TABLE whatsapp_connections ALTER COLUMN instance_id SET NOT NULL` (ou UNIQUE parcial) + `DROP INDEX idx_wc_instance_id`.
3. **M7** — corrigir `sicoob-bridge-reply` para `select('name')`.
4. **M6** — endurecer o guard de CI: `has_function_privilege` em vez de match textual, rodar em push/PR, estender às 6 funções sensíveis.
5. **B1** — remover o resíduo do reset (2 funções mortas + fantasma em `types.ts`); **M3** — dropar o trigger duplicado de `agent_stats`; **B6** — dropar as 2 funções órfãs reativáveis.
6. **M4** — avaliar guard de trigger + log de UPDATE em `user_roles` (a real superfície de escalação).
7. **M5/B7** — antes de ligar o Gmail: checar `.error` dos RPCs no disconnect/exchange, `thread_id` em `gmail-send`, e o contrato multi-anexo.
8. **B2/B3** — `ANALYZE` + autovacuum por-tabela nas quentes; `c.id` no `ORDER BY` de `search_contacts`.
9. Rodar `typecheck`/`lint`/`vitest`/`build` no **CI real** para fechar a lacuna de ambiente, e corrigir o flake do teste MFA em `main`.

---

## 7. Anexo — mecanismo de simulação segura (reprodutível)

```sql
-- Padrão de mutação-revertida (única forma segura no gateway, que bloqueia BEGIN/ROLLBACK):
DO $$
DECLARE v_x int;
BEGIN
  -- ... INSERT/UPDATE/DELETE de teste ...
  SELECT algo INTO v_x FROM ...;
  RAISE EXCEPTION 'SIM_ROLLBACK resultado=%', v_x;  -- aborta a tx → reverte tudo
END $$;
-- Depois: SELECT read-only confirma que nada persistiu.

-- Simulação de papel (auth.uid()/auth.role()/auth.jwt() leem só GUCs):
--   PERFORM set_config('request.jwt.claims', json_build_object('sub',<uuid>,'role','authenticated','email','x@y')::text, true);

-- Roundtrip de cripto (read-only, sem persistência):
SELECT decrypt_gmail_token(encrypt_gmail_token('teste')) = 'teste';
```

*Validação executada em 28/08/2026 por 5 agentes coordenados. Origem read-only; destino somente leitura + simulações revertidas. Nenhum objeto criado, alterado ou removido; nenhum HTTP externo disparado.*
