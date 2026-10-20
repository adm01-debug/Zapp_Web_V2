# PLANO_100 — Zapp_Web_V3 rumo ao 10/10

Derivado de `AUDITORIA.md` (achados com evidência real). **Nada aqui foi aplicado** — a auditoria foi
somente leitura por decisão da missão. Cada item vira **um PR dedicado** (é a regra da casa: nunca
misturar correções), com o ritual obrigatório do repositório resumido no fim deste arquivo.

Ordem = risco. Fase 0 sai hoje; fases 1–3 por valor decrescente.

---

## FASE 0 — ✅ CONCLUÍDA em 2026-09-27 (PR #1592, `main = 5acf04f49`)

### 0.1 · ✅ FECHADO — `prospeccao.*` estava aberto para o mundo (A-F8-001, P0)

**Feito:** migration `supabase/migrations/20260927123617_rls_prospeccao_hardening.sql`, aplicada em
produção e mergeada. **Prova:** as mesmas chamadas anônimas passaram de **HTTP 200 → HTTP 401**
(`permission denied for schema prospeccao`) nas quatro tabelas; usuário logado não-admin vê `0` linhas
em `contatos` e em `cookies_config` (transação revertida); `service_role` intacto.

**O que o levantamento mudou no plano original** (mantido abaixo como registro):
- O grant do `anon` era **total** — incluía `TRUNCATE`, `DELETE` e `UPDATE`. Não era só vazamento de
  leitura: qualquer visitante podia **esvaziar** as listas.
- `RLS não filtra TRUNCATE` → `authenticated` também perdeu `TRUNCATE/REFERENCES/TRIGGER`.
- `anon` perdeu também o `USAGE` no schema (sem ele o PostgREST nem resolve o nome).
- `cookies_config` ficou **sem policy nenhuma**: só `service_role` (mesmo padrão de
  `zapp.whatsapp_official_credentials`) — credencial de terceiro não desce para o navegador.
- A view `public.cookies_config` tem `security_invoker=true`, então respeita o RLS da base (conferido).

**O que o plano original dizia:** nova migration `supabase/migrations/<YYYYMMDDHHMMSS>_rls_prospeccao.sql`.
**O que:**
```sql
ALTER TABLE prospeccao.cookies_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao.contatos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao.empresas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao.execucoes     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON prospeccao.cookies_config, prospeccao.contatos, prospeccao.empresas,
              prospeccao.execucoes FROM anon;

-- leitura para quem opera a prospecção; escrita idem (ajustar ao papel real: admin/supervisor)
CREATE POLICY prospeccao_sel ON prospeccao.contatos FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
-- repetir o padrão para as outras três (SELECT/INSERT/UPDATE/DELETE conforme o uso real)
```
**Cuidado (é destrutivo em produção):**
- Antes de revogar, **descobrir quem lê hoje**: a prospecção roda por *cron/n8n com service_role*
  (service_role ignora RLS) ou por usuário autenticado? Se for cron com service_role, o revoke do
  `anon` não quebra nada e o risco é baixo. **Confirmar isso antes do `APPLY`.**
- Aplicar via gateway MCP com `dry_run` primeiro; depois rodar os 3 linters de migration.
- Regenerar o snapshot canônico **pelo workflow autoritativo** (`zapp-schema-drift-gate.yml -f regen=true`),
  nunca à mão.
- `zapp.cookies_config` (RLS off, `authenticated` com escrita) entra no **mesmo PR** por ser o mesmo bug.

### 0.2 · Rotacionar o que vazou (ação humana, não é código)

Os valores de `cookie`/`token` de `prospeccao.cookies_config` estavam legíveis por anon. **Ligar RLS não
desfaz o vazamento.** Passos:

1. Lusha → encerrar a sessão atual (invalida os cookies).
2. LinkedIn (conta de prospecção) → *Sair de todas as sessões*.
3. Colher os novos cookies e gravar em `prospeccao.cookies_config` (o fluxo que já existe).
4. Registrar a data da rotação.

> Enquanto isso não acontecer, este item é o único da auditoria com risco **ativo**.

---

## FASE 1 — Correções P1

### 1.0 · ✅ **DECIDIDO** — Alinhar o contrato de escrita da view `zapp.contacts` (A-F1-007 corrigido + A-F1-010 + A-F1-011)

**Origem:** ao executar o P0, a análise exaustiva do A-F1-007 mostrou que a causa é **modelagem**,
não trigger — e revelou dois defeitos que a auditoria não tinha visto.

**Defeito 1 — `phone_numbers` é impossível de salvar (novo, P1).** A UI coleta vários telefones
(`ContactFormV3.tsx:166`, `EditContactDialog.tsx:129`), o Payload envia `phone_numbers`, e a coluna
**não existe** na view (`information_schema.columns` da view: só `phone` e `contact_type`). O
PostgREST rejeita a chave desconhecida → **criar/editar contato com mais de um telefone falha**.
Pior: `zapp.contact_phones` **já existe**, é bem desenhada (`phone_e164`, `country_code`, `area_code`,
`has_ninth_digit`, `is_primary`, `is_whatsapp`, `verified_at`, com policies de `authenticated` e
`service_role`) e tem **0 linhas e 0 referências** em qualquer função do banco. **A feature está
construída nas três camadas e desconectada em todas as emendas.**

**Defeito 2 — `contact_type` mente (A-F1-007 corrigido).** É alias de `lead_status` (já exposto como
`status`) com vocabulário incompatível com o Kanban (`chk_lead_status_vocab`). Lido como taxonomia
por `evolutionAdapter`, `lib/schemas/supabase.ts` e pelas regras de SLA (`SLARulesManager`), que hoje
comparam contra valores de funil.

**Correção decidida (um PR — é a mesma raiz: o contrato da view):**
1. `zapp.contacts` passa a expor `phone_numbers` agregado de `zapp.contact_phones` e `contact_type`
   como campo real (nova coluna `contact_type` em `zapp.contact_phones`? **não** — decisão: tabela
   própria `zapp.contact_profile(contact_id, contact_type)`, mantendo `contact_phones` para telefones).
2. O funil **não se perde**: continua em `status` (e o Kanban já cai em `'cliente'` quando
   `contact_type` é nulo — `ContactKanbanView.tsx:65` —, então a view pode devolver NULL honesto).
3. Os dois handlers `INSTEAD OF` (`fn_contacts_view_insert_handler`,
   `fn_contacts_view_update_handler`) passam a gravar `contact_phones` e `contact_profile` além de
   `evo.evolution_contacts`. **Nada é revogado de `service_role`** e o caminho do webhook não muda.
4. Teste de regressão: falha se a view voltar a não expor as duas colunas, se os handlers pararem de
   gravá-las, ou se alguém re-apelidar `contact_type` para `lead_status`.
5. **Risco declarado:** a view tem alto alcance (inbox, adapters, ratchet da camada de dados) →
   rodar a **suíte inteira** + o gate de drift + prova bidirecional (antes/depois em transação
   revertida), como foi feito no #1590. **Não aplicar sem isso.**


### 1.1 · Push na `main` não dispara nada (A-F7-001)
**Sintoma medido:** último evento `push` do repositório = 2026-09-26T21:22Z; o merge `5b4c6fc0`
(27/09 11:43Z) gerou **zero** runs; o deploy teve de ser disparado à mão (`36316978987`).
**Passos:** (1) abrir *Settings → Actions → General* e conferir restrições/permissões de workflow;
(2) comparar com o push de 26/09 que funcionou (o que mudou entre os dois? novo workflow inválido no
merge pode derrubar a fila inteira se houver YAML inválido); (3) rodar `gh workflow list --all` e
validar o YAML de todos os 54 workflows com `actionlint`.
**Verificação:** fazer um commit trivial em `main` (ex.: atualizar `ESTADO.md`) e confirmar que ao
menos `Quality Gate` + `🚀 Build & Deploy` foram criados. Se não, escalar para o suporte do GitHub.

### 1.2 · Mover card no Kanban não persiste (A-F1-007)
Handler de UPDATE da view `contacts` grava **16 das 50** colunas e ignora `contact_type` — a UI mostra
sucesso e o dado não muda. Corrigir o handler (ou mover a escrita para RPC tipada, padrão que já usamos
no encerramento), com **teste de regressão** (E46 exige) que falhe se a coluna ficar de fora.

### 1.3 · Campanha clássica sem motor de disparo (A-F1-001)
"Campanhas" tem 4 policies corretas e tabela `campaign_contacts` — mas **0 referências** em 127 Edge
Functions e nenhum cron. Ou se constrói o motor (Edge Function + fila + DLQ, espelhando o envio clássico
que já tem hash determinístico e dedupe), ou se **remove a feature da UI** e a promessa junto.
Decisão de produto: recomendo remover a UI primeiro (barato) e construir depois, se for prioridade real.

### 1.4 · Idempotência no envio em massa (A-F1-002)
POST ao Evolution sem chave de idempotência → mensagem duplicada para cliente final. Enviar
`idempotency-key` derivada de (conversa + hash do conteúdo + janela) e persistir o retorno.

---

## FASE 2 — P2

| # | Item | Correção |
|---|---|---|
| 2.1 | A-F8-002 · `config.toml` mente (`verify_jwt` ignorado pelo runtime self-hosted; 48 declarações, 27 `false`) | Comentário de aviso + **teste de CI** que falha se algum `supabase/functions/*/index.ts` não chamar guard (`requireUser`/`requireServiceRoleOrCron`/HMAC) |
| 2.2 | A-F7-002 · deploy self-hosted só por dispatch | Documentar em `docs/` que `deploy-vps-selfhosted.yml` é manual, ou religar o gatilho de push |
| 2.3 | A-F7-003 · CI cronicamente vermelha (`ratchet-tighten`, `edge-drift-check`, `Contract Guards`, `E2E Inbox`, `Cleanup E2E data`, `Branch Protection Sentinel`) | Um PR por falha; **prioridade** porque vermelho permanente esconde falha real |
| 2.4 | A-F1-003 · 304 funções `SECURITY DEFINER` executáveis por `authenticated` | Auditar por amostragem; revogar `EXECUTE` das que não têm guarda interna (mesmo método cirúrgico do #1584) |
| 2.5 | A-F1-004 · `contact_custom_fields` e `conversation_memory` sem policy de escrita | Criar policies (features hoje inertes com 42501) |

---

## FASE 3 — Higiene (P3)

- **3.1** Remover/allowlistar o arquivo morto `src/features/queues/components/QueueRoutingRules.tsx` (o próprio gate do repo aponta).
- **3.2** Decidir as env órfãs (`VITE_TYPING_AUTO_CLEAR_MS`, `VITE_TYPING_STOP_DEBOUNCE_MS`, `VITE_SUPABASE_PROJECT_ID`): usar ou apagar.
- **3.3** Revisar os 15 índices com `idx_scan=0` (medir antes; dropped index é irreversível sem retrabalho).
- **3.4** Rotacionar as publishable/anon keys que ficaram no histórico do git (barato, corta o achado A-F8-003).
- **3.5** Subir `fast-uri`/`hono`/`joi` (cadeias dev) no próximo `bun update`.
- **3.6** A-F1-005: migrar os 112 call-sites crus para o wrapper que lê a mensagem real do erro.
- **3.7** A-F3-001: `sicoob-bridge` responder 401 (não 500) sem autenticação.

---

## Ritual obrigatório de cada PR (aprendido na marra nesta base)

1. Workspace isolado (`hermes-tarefa-iniciar`), branch `hermes/<slug>`; nunca commitar em `main`.
2. Migration (se houver) com `dry_run` via gateway MCP **antes** do apply; 3 linters de migration.
3. **Regenerar snapshot/catálogo pelo workflow autoritativo** (`-f regen=true`) — nunca à mão.
4. Gates locais: `tsc -p tsconfig.app.json` (o `scripts/typecheck.sh` exige `SUPABASE_PROJECT_ID`),
   eslint, `deno test` das migrations, ratchet da camada de dados, E42 (evitar `evo.` + `GRANT` no
   mesmo arquivo), E46 (teste de regressão real no diff).
5. **Rodar a SUÍTE INTEIRA** (`vitest run`), não só o arquivo mexido — foi assim que o `quality-gate`
   pegou 2 falhas reais que os gates locais não viram.
6. Commit em pt-BR (subject minúsculo ≤100, sem camelCase/Maiúsculas), PR com título descritivo.
7. `bun install` regenera `bun.lock` → **não commitar** o lock.
8. Depois do merge: **conferir que o push disparou CI/deploy** (hoje não dispara — item 1.1) e provar
   em produção pelo `version.json`.

## Definição de pronto ("10/10")

- Fase 0 concluída e **provada** (anon recebendo 401 nas 4 tabelas de `prospeccao`).
- Credenciais de prospecção rotacionadas, com data registrada.
- Push na `main` volta a disparar CI + deploy automaticamente, provado por um commit trivial.
- CI da `main` verde (sem vermelho crônico).
- P1 todos fechados; P2 com dono e prazo; P3 no backlog com issue.
- Seção 4 da auditoria (NÃO VERIFICADO) reduzida a itens que dependem de terceiros.
