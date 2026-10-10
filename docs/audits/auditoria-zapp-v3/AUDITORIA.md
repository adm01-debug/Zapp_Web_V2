# AUDITORIA — Zapp (repo `Zapp_Web_V3`)

> **Data:** 2026-09-27 · **Auditor:** Hermes (agente, sessão `20260926_071808_f7b867`)
> **Modo:** somente leitura. Nenhuma correção aplicada aqui.
> **Escopo:** código (`adm01-debug/Zapp_Web_V3` @ `461ebeca6`), banco de produção,
> CI (`.github/workflows`), integrações externas e infra de deploy.
> **Regra de ouro:** todo achado carrega evidência coletada **nesta sessão** —
> `arquivo:linha`, query+resultado ou comando+saída. Achado sem observação real
> não entra. PII mascarada.

---

## 0. CONTEXTO

```
Sistema: Zapp — plataforma de atendimento WhatsApp multiatendente (inbox compartilhado
         com filas, CRM 360, SLA, CSAT, campanhas/disparos em massa, chatbot L1 e
         features de IA: classificação, resumo, sugestão de resposta, transcrição).
Stack:   React 18.3 + Vite + TypeScript 5.9 + TanStack Query 5 + Tailwind 3.4 +
         Supabase self-hosted (Postgres + RLS + 127 Edge Functions Deno) +
         Evolution API (WhatsApp) + n8n + Bitrix24 + Cloudflare R2 + Resend +
         ElevenLabs + Google APIs + Meta/WhatsApp Cloud.
Repo:    adm01-debug/Zapp_Web_V3 — cópia de referência em ~/projetos/Zapp_Web_V3 @ main 461ebeca6
Acessos: código ✓ · banco de produção ✓ (gateway MCP, SELECT) · logs de CI ✓
         (logs de aplicação: parcial) · deploy/infra ✓ (leitura)
Restrições: shell no WSL (bash); banco só via gateway MCP (leitura); migrations
         aplicadas por workflow autoritativo — não editar artefatos à mão.
Orçamento: sem teto rígido; prioridade nos fluxos críticos e no banco.
Sintomas conhecidos: (a) painel de conversa não abria ao clicar no contato;
         (b) encerramento não espelhava o status da conversa;
         (c) `group_category` sempre nulo na UI.
Fluxos críticos (deduzidos na FASE 1): F1 receber/responder mensagem no inbox ·
         F2 encerrar conversa (ledger + status + evento + CSAT) ·
         F3 contatos/CRM 360 · F4 campanhas/disparo em massa ·
         F5 login/permissões + SLA/relatórios
```

### Corrigido ANTES/DURANTE esta janela (não contam como achados abertos)

| Tema | Estado |
|---|---|
| Painel de conversa não abria (`useFallbackContact` com estratégia sintética desligada) | corrigido, PR #1586, deployado |
| Encerramento gravava `'resolved'` (viola CHECK) e não espelhava status | corrigido, PR #1582 + #1587 |
| 3 RPCs `SECURITY DEFINER` apagavam PII de contato sem guarda | corrigido, PR #1584 (REVOKE provado em produção) |
| `legacy-e2e` na suíte de boot do Playwright | corrigido, PR #1583 |

---

## 1. Estado geral

Sistema grande e maduro, com higiene de engenharia acima da média: 165 migrations
versionadas, 54 workflows de CI (≈20 agendados), 558 arquivos de teste com 9.478
casos passando, gates próprios de acoplamento/RLS/pin de action, camada de dados
única (`dbFrom`/`dbRpc`) com catálogo tipado de RPCs, DLQ de mensagens, circuit
breaker para o Evolution e observabilidade de cliente (Sentry + feature flag).
A produção está no ar e é verificável por `version.json` (build rastreado por SHA).

Saúde geral: **estrutura forte, com dívidas de acoplamento e de observabilidade**.

Os 5 maiores riscos levantados:

1. **Campanha clássica não envia nada** — o botão "Iniciar" só muda o status; nenhum
   edge/cron processa `zapp.campaigns` (evidência em A-F1-001). É falha silenciosa
   do ponto de vista do operador.
2. **Envio em massa sem chave de idempotência** no POST para o Evolution — risco de
   mensagem duplicada para cliente real em retry/crash (A-F1-002).
3. **Funções `SECURITY DEFINER` em quantidade** (304 executáveis por `authenticated`)
   sem checagem explícita de autorização na maioria — superfície ampla a auditar (A-F1-003).
4. **Escritas do app negadas por falta de policy** em tabelas de features
   (`contact_custom_fields`, `conversation_memory`) → funcionalidade inerte (A-F1-004).
5. **Diagnóstico de erro de Edge Function perdido**: 112 call-sites crus em 77
   arquivos de produção não usam o wrapper `invokeEdge` que existe exatamente para
   ler a mensagem real do erro (A-F1-005).

---

## 2. Mapa de conexões (FASE 0)

```
                         ┌────────────────────────────────────────────────┐
                         │  NAVEGADOR — SPA React 18.3 + Vite             │
                         │  src/ · 2.386 arquivos .ts/.tsx · 47 páginas   │
                         │  rotas: src/components/routing/AppRoutes.tsx   │
                         │  133 hooks em src/features/*/hooks             │
                         └───────────────┬────────────────────────────────┘
                                         │
                         ┌───────────────▼────────────────────────────────┐
                         │  CAMADA DE DADOS ÚNICA (o único caminho)       │
                         │  src/integrations/datasource/db.ts             │
                         │   dbFrom(entidade) → ENTITY_MAP → {client,table}│
                         │   dbRpc(RPC.x, params) → rpcCatalog.ts (120)   │
                         │  registry.ts: TODAS as entidades → client      │
                         │   'lovable' (client principal, pós-consolidação)│
                         └───────┬──────────────────────────┬─────────────┘
                                 │                          │
        ┌────────────────────────▼───────┐    ┌─────────────▼───────────────┐
        │  CLIENTE SUPABASE PRINCIPAL    │    │  CLIENTE SUPABASE EXTERNO   │
        │  VITE_SUPABASE_URL             │    │  VITE_EXTERNAL_SUPABASE_URL │
        │  supabase.atomicabr.com.br     │    │  (proxy do banco Evolution) │
        │  schemas: zapp, evo, public    │    │  externalClient.ts          │
        └───────────┬────────────────────┘    └─────────────────────────────┘
                    │
        ┌───────────▼──────────────────────────────────────────────────────┐
        │  127 EDGE FUNCTIONS (Deno, supabase/functions/)                  │
        │  chamadas: 112 call-sites crus (supabase.functions.invoke) em 77  │
        │  arquivos de produção + 5 arquivos usando o wrapper invokeEdge.ts │
        └───────────┬──────────────────────────────────────────────────────┘
                    │
        ┌───────────▼──────────────────────────────────────────────────────┐
        │  POSTGRES (self-hosted, Supabase) — 165 migrations versionadas    │
        │   zapp.*  (regras de negócio: profiles, contacts view,            │
        │            conversation_closures, conversation_events, campaigns, │
        │            talkx_*, queues, audit_log, _backups)                  │
        │   evo.*   (espelho do WhatsApp: evolution_conversations/-contacts)│
        │   prospeccao.* (prospecção B2B)                                   │
        └───────────┬──────────────────────────────────────────────────────┘
                    │
   ┌────────────────▼───────────────────────────────────────────────────────┐
   │  SERVIÇOS EXTERNOS                                                     │
   │  Evolution API  evolution.atomicabr.com.br  (WhatsApp: enviar/receber) │
   │  Meta / WhatsApp Cloud   graph.facebook.com                            │
   │  ElevenLabs    api.elevenlabs.io      (voz/áudio)                      │
   │  Resend        api.resend.com         (e-mail transacional)            │
   │  Google        oauth2.googleapis.com / www.googleapis.com (Gmail/Drive) │
   │  Bitrix24      supabase/functions/bitrix-api                          │
   │  n8n           webhooks de automação                                   │
   │  Cloudflare R2 storage de mídia/backup · Sentry observabilidade        │
   │  ai.gateway.lovable.dev (gateway de IA) — CONFIRMAR se ainda é usado   │
   └────────────────┬───────────────────────────────────────────────────────┘
                    │
   ┌────────────────▼───────────────────────────────────────────────────────┐
   │  ENTREGA / CI                                                          │
   │  54 workflows (.github/workflows) — ≈20 com `schedule:`                │
   │  deploy: VPS Hostinger via docker-compose + nginx                     │
   │  produção: https://zapp.atomicabr.com.br (+ www.zappweb.app.br)        │
   │  rastreio de build: /version.json → gitSha/releaseId/builtAt          │
   └────────────────────────────────────────────────────────────────────────┘
```

**Portas de entrada do sistema (verificadas):** SPA (rotas protegidas por
`ProtectedRoute`), 127 Edge Functions invocáveis (JWT/permissão por função — ver
FASE 3), webhooks recebidos (Evolution/Meta/n8n — ver FASE 6), ≈20 workflows
agendados no CI, ciclos de vida de conversa disparados pelo banco (triggers).

---

## 3. Achados

### FASE 0/1 — fluxos e contratos

#### A-F1-001 · [P1] · produto/backend — Campanha clássica não tem motor de disparo: o botão "Iniciar" não envia nada
**Evidência:**
- `src/hooks/useCampaigns.ts:1-13` (nota de quem auditou antes, verbatim):
  *"Edge `campanha-send`: NÃO EXISTE em supabase/functions (só talkx-send/talkx-scheduler)"*;
  *"Edge `talkx-send` … é HARDCODED para as tabelas talkx_campaigns / talkx_recipients /
  talkx_blacklist — não lê zapp.campaigns nem zapp.campaign_contacts"*;
  *"Nenhum edge/cron do repo processa zapp.campaigns ou zapp.campaign_contacts …
  O botão 'Iniciar' do CampaignsView apenas faz update({ status: 'sending' }) —
  nenhuma mensagem é enviada."*
- **Verificação independente nesta sessão:** `grep -rE "campaign_contacts" supabase/functions` → **0 ocorrências**;
  `grep -rlE "\bcampaigns\b" supabase/functions` → apenas `voice-agent` (lista de seções de voz),
  `zapp-auto-export` (lista de exportação), `talkx-*` (tabelas `talkx_*`, outro domínio).
- **Cron no banco:** `SELECT jobid, schedule, command FROM cron.job WHERE command ILIKE '%campaign%' OR command ILIKE '%talkx%'` → **0 linhas**.
**Impacto:** o operador monta a campanha, clica "Iniciar", a UI reporta sucesso e
**nenhuma mensagem sai**. Sem erro, sem log, sem alerta. Atinge 100% dos usuários
que usam campanha clássica (distinto do Talk X, que tem motor).
**Causa raiz:** funcionalidade entregue de ponta a ponta **sem o worker de envio** —
o front foi construído sobre um edge/cron que nunca existiu. O único motor de envio
em massa (`talkx-send`) é acoplado às tabelas `talkx_*` e não serve à campanha clássica.

#### A-F1-002 · [P1] · integrações — Envio em massa sem chave de idempotência: risco de mensagem duplicada para cliente real
**Evidência:** `supabase/functions/talkx-send/index.ts:344-350` — POST para o Evolution:
```ts
const evoResp = await evolutionClient.post(
  `message/sendText/${connObj.instance_id}`,
  { number: cleanPhone, text: personalizedMsg, delay: 0 },
);
```
e só **depois** do POST o estado do destinatário é gravado (`:358`):
```ts
await supabase.from("talkx_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", recipId);
```
Busca por idempotência no arquivo: `grep -nE "idempot|dedup|onConflict|already_sent"` →
**nenhuma ocorrência**.
**Impacto:** se o processo morrer (timeout, deploy, OOM) entre o POST e o `update`,
ou se um lote for reprocessado, o destinatário continua elegível e a mensagem **é
enviada de novo** ao cliente final. Duplicidade de mensagem em massa é dano de
imagem e risco de bloqueio do número pelo WhatsApp.
**Causa raiz:** o envio externo (não idempotente por natureza) é executado antes da
gravação do estado local; não há chave de deduplicação por destinatário/campanha.
*Não verificado:* se o re-claim de linhas presas em `processing` ocorre (ver §4).

#### A-F1-003 · [P2] · banco/segurança — 304 funções `SECURITY DEFINER` executáveis por `authenticated` sem checagem explícita
**Evidência:** varredura no banco de produção listando `pg_proc` com
`prosecdef = true` e `has_function_privilege('authenticated', oid, 'EXECUTE')`
**sem** referência a `auth.uid()`/`is_admin`/`has_permission` no corpo → **304 funções**.
**Impacto:** superfície de autorização ampla e não uniforme; cada função roda com os
privilégios do dono. A maior parte são helpers inofensivos, mas a auditoria caso a
caso é o único jeito de saber — e pelo menos 3 já se provaram destrutivas de PII
(corrigidas no PR #1584).
**Causa raiz:** padrão histórico de concentrar escrita em `SECURITY DEFINER` sem
convenção obrigatória de guarda interna (o RLS não protege o corpo da função).

#### A-F1-004 · [P2] · banco/frontend — Tabelas de features sem policy de escrita: funcionalidade inerte (erro 42501)
**Evidência:** `contact_custom_fields` e `conversation_memory` não possuem policy de
INSERT/UPDATE/DELETE — as escritas do app nessas tabelas são negadas por RLS
(42501), então as features que dependem delas não persistem nada.
**Impacto:** features de campos personalizados e memória de conversa não funcionam;
o usuário pode ver erro genérico ou nada acontecer.
**Causa raiz:** tabelas criadas (migration) sem o par policy-de-escrita correspondente
ao uso que o app faz delas.

#### A-F1-005 · [P3] · frontend/observabilidade — 112 chamadas cruas de Edge Function em 77 arquivos de produção ignoram o wrapper que lê a mensagem real do erro
**Evidência:** `grep -c "\.functions\.invoke\("` em `src/` (produção, excluindo testes)
= **112 ocorrências em 77 arquivos**; arquivos de produção usando `invokeEdge(` = **5**.
Exemplos inspectados: `src/components/ai/AutoTicketClassifier.tsx:151-154`
(`if (error) throw error;`), `src/components/connections/useConnectionCardActions.ts:33-36`
(mesmo padrão) — ambos descartam `error.context`, onde o supabase-js v2 coloca a
resposta HTTP real. O próprio wrapper documenta o problema que ele veio resolver
(`src/lib/invokeEdge.ts:7-11`: *"nenhum dos 153 call-sites de functions.invoke lia
details[]"*).
**Impacto:** quando uma Edge Function falha, o operador recebe mensagem genérica e a
causa real (validação, permissão, schema) se perde — encarece o suporte.
**Causa raiz:** wrapper criado depois, sem migração dos call-sites antigos nem gate
que impeça novos usos crus.

#### A-F1-006 · [P3] · manutenção — Comentário de auditoria anterior desatualizado no código (policies que já existem)
**Evidência:** `src/hooks/useCampaigns.ts:10-13` afirma: *"RLS zapp.campaigns
(canonical 20260804000000): SÓ `campaigns_select` (SELECT) e `campaigns_admin_write`
(INSERT admin). POLICIES UPDATE/DELETE FALTAM → Iniciar/Pausar/Excluir …
falham com 403 para qualquer role."*
Consulta real em produção (`pg_policies` em `zapp.campaigns`) → **as 4 policies
existem**: `campaigns_select`, `campaigns_admin_write` (INSERT), `campaigns_update` e
`campaigns_delete`, com a mesma guarda de dono/admin. `has_table_privilege` de
`authenticated` = SELECT/INSERT/UPDATE/DELETE todos `true`.
**Impacto:** mantenedor é induzido a "corrigir" algo que já está corrigido —
retrabalho e risco de migration conflitante.
**Causa raiz:** nota escrita em 2026-08-04 e nunca revisada após a migration que
adicionou as policies; nenhum gate amarra comentário de auditoria ao estado do banco.

*Observação de método:* este é o tipo de achado que a auditoria anterior teria
reportado errado se repetida sem verificação — a verificação no banco **refutou**
a metade do texto sobre 403 e **confirmou** a metade sobre o motor de envio.

#### A-F1-007 · [P1] · banco/frontend — Mover card no Kanban de contatos não persiste: o handler ignora `contact_type` e a UI diz que deu certo
**Evidência:**
- `src/components/contacts/ContactKanbanView.tsx:81-99`:
```ts
const newType = destination.droppableId;
// Optimistic update
setLocalContacts((prev) => prev.map((c) => (c.id === draggableId ? { ...c, contact_type: newType } : c)));
const { error } = await dbFrom('contacts').update({ contact_type: newType }).eq('id', draggableId);
if (error) { /* Revert */ toast.error('Erro ao mover contato'); } else { /* sucesso */ }
```
- O `dbFrom('contacts')` roteia para o client principal (`registry.ts:75` → `contacts: { client: 'lovable', table: 'contacts' }`), ou seja, a **view `zapp.contacts`**.
- A view tem **50 colunas** (`information_schema.columns`, consultado em produção).
- Os 10 handlers `INSTEAD OF` da view enumeram `NEW.<col>` explicitamente — **não** há pass-through genérico (`jsonb_populate_record`/`(NEW).*`): confirmado lendo `pg_get_functiondef`. O handler de UPDATE usa **16 colunas**; `contact_type` **não está entre elas**.
**Impacto:** o operador arrasta o contato para outra coluna do Kanban, vê o card mover e
**nenhum toast de erro** — o `update` na view "succede" (o trigger retorna `NEW`) sem gravar
o tipo. Ao recarregar, o contato volta para a coluna original. A feature inteira do Kanban
por tipo de contato é decorativa. Atinge 100% dos usuários do Kanban; para quem depende de
classificar cliente/fornecedor/transportadora, o dado fica errado sem aviso.
**Causa raiz:** o conjunto de colunas graváveis foi definido nos handlers da view, mas a UI
foi construída assumindo que qualquer coluna lida da view é gravável. Nenhum dos dois lados
falha alto: o trigger descarta em silêncio e a UI não tem como saber.

> ### ⚠️ CORREÇÃO DE RUMO — 2026-09-27 (verificado depois do PR #1592)
> O parágrafo acima está **incompleto, e a correção que ele sugere seria um erro**. Lendo
> `pg_get_viewdef('zapp.contacts')`:
> ```sql
> COALESCE(ec.lead_status, 'open')::varchar)::text AS contact_type,   -- ⚠️ ALIAS de lead_status
> COALESCE(ec.lead_status, 'open')::varchar)::text AS status,
> ```
> `contact_type` **não é coluna**: é um segundo nome para `lead_status` (o funil já é exposto
> como `status`). E os vocabulários são **incompatíveis**: o Kanban usa
> `lead/cliente/fornecedor/parceiro/colaborador/prestador_servico`, enquanto
> `chk_lead_status_vocab` só aceita `novo/qualificado/negociando/ganho/perdido/inativo`.
> **Adicionar `contact_type` ao handler gravaria "cliente" num campo de etapa de funil e violaria
> o CHECK.** A falha é de **modelagem**: o Kanban não tem onde guardar o dado.
> Agravante de escopo: `contact_type` é lido como **taxonomia de contato** em vários pontos
> (`evolutionAdapter.ts:165` grava `'whatsapp'`; `SLARulesManager` usa `contact_type` como
> dimensão de regra de SLA; `lib/schemas/supabase.ts:21` tipa como `z.string()`), então essas
> regras de SLA hoje comparam contra valores de funil. **Decisão:** `contact_type` passa a ser
> campo real (ver Fase 1 do `PLANO_100.md`), sem perder o funil — ele continua exposto em `status`.

#### A-F1-008 · [P2] · banco — 22 das 50 colunas da view `contacts` não têm caminho de escrita em nenhum handler
**Evidência:** comparação (script próprio, executado nesta sessão) entre
`information_schema.columns` de `zapp.contacts` (50 colunas) e o corpo dos 10
`pg_get_functiondef` dos handlers `zapp.fn_contacts*` → **22 colunas não citadas**:
> `first_message_at, unread_count, is_blocked, is_favorite, cpf, address, city, state, country, surname, contact_type, ai_priority, ai_sentiment, channel_type, channel_connection_id, group_category, risk_score, lead_origin, consent_status, channel, last_seen_at, workspace_id`

No caminho de INSERT, `cpf` também aparece no payload do formulário de CRM 360
(`src/components/crm360/ContactFormDialog.tsx:95`) — mas esse formulário escreve no
cliente **externo** (ver A-F1-009), então **não** foi contabilizado como perda provada.
**Impacto:** qualquer tela que tente gravar esses campos pela view terá sucesso aparente e
nenhuma persistência. `group_category` (já conhecido por nunca preencher na UI), `is_favorite`,
`lead_origin` e `consent_status` são candidatos diretos a "feature silenciosamente inerte".
**Causa raiz:** contrato de escrita da view incompleto em relação ao contrato de leitura —
assimetria não coberta por teste nem por gate.
*Não verificado:* quais dessas 22 já têm tela de escrita ativa hoje (só o caso `contact_type`
foi provado em A-F1-007).

#### A-F1-009 · [P2] · frontend/arquitetura — Formulário de contato do CRM 360 grava no cliente "externo" (banco legado), não em `zapp.contacts`
**Evidência:**
- `src/components/crm360/ContactFormDialog.tsx:14` `import { useExternalMutation } from '@/hooks/useExternalApiManagement';`
- `:50` `const mutation = useExternalMutation();` · `:107-121` grava com `table: 'contacts'`
  (tanto em edição quanto em criação) e o próprio diálogo se descreve como
  *"Altere os dados do contato no CRM externo"* (`:139`).
- `src/hooks/useExternalApiManagement.ts:1467-1497` — o hook resolve o alvo por
  `getDynamicClient()` em runtime e escreve com `.from(params.table).update(...)`.
**Impacto:** os dados do formulário não vão para a view `zapp.contacts` — vão para o client
dinâmico. Como o banco "externo"/FATOR X foi oficialmente descontinuado no repo (PR #732
"remoção completa do banco FATOR X"), há risco de o formulário estar escrevendo em destino
morto (ou em um projeto Cloud que o próprio `client.ts` diz **ignorar**).
**Causa raiz:** coexistência de dois caminhos de escrita para a mesma entidade conceitual
(`contacts`), escolhidos em pontos diferentes da UI (`dbFrom` no Kanban, `useExternalMutation`
no formulário), sem fonte única.
*Não verificado:* a origem/valor real da credencial do `getDynamicClient()` em produção — a
URL não está inlinada no chunk de entrada do bundle; requer ler a configuração de runtime
(tabela/armazenamento) ou os secrets do deploy (ver §4).

---

## 4. NÃO VERIFICADO

| Item | Motivo |
|---|---|
| Re-claim de `talkx_recipients` presos em `processing` | exige leitura da query de claim do `talkx-scheduler` (agendado para a consolidação) |
| Se `ai.gateway.lovable.dev` ainda é usado em produção ou é legado morto | exige conferir secrets do deploy (FASE 6/7) |
| Comportamento de cada um dos 112 call-sites crus de `functions.invoke` | amostra de 2 inspecionada; os demais não foram lidos um a um |
| Cobertura de logs de aplicação em produção | acesso a logs do VPS não disponível nesta sessão |
| `policies` de escrita das demais features inertes | só duas tabelas confirmadas (`contact_custom_fields`, `conversation_memory`) |
| CVEs de dependências | saída do audit do gerenciador ainda não coletada (FASE 8) |
| Origem/valor da credencial do `getDynamicClient()` (client "externo") | URL não inlinada no chunk de entrada do bundle; requer config de runtime ou secrets do deploy (A-F1-009) |
| Quais das 22 colunas órfãs da view `contacts` têm tela de escrita ativa hoje | só `contact_type` foi provado (A-F1-007); o levantamento completo das telas é a FASE 4/5 |

---

## 5. Reprodutibilidade (comandos e queries desta varredura)

```bash
# FASE 0 — reconhecimento
find . -maxdepth 2 -type d -not -path "*/node_modules*" -not -path "./.git*"      # árvore
python3 -c "import json;d=json.load(open('package.json'));print(d.get('name'),list(d.get('scripts',{})))"
ls -1 supabase/functions | wc -l                    # 127
ls -1 supabase/migrations/*.sql | wc -l             # 165
ls -1 .github/workflows/*.yml | wc -l               # 54
grep -l 'schedule:' .github/workflows/*.yml         # ≈20 agendados
grep -rhoE "import\.meta\.env\.[A-Z0-9_]+" src      # env referenciadas
grep -rhoE "https://[a-z0-9.-]+\.(com|br|app|io|dev|net)" src supabase/functions

# FASE 1 — fluxos (chamadas cruas x wrapper)
grep -rhE "\.functions\.invoke\(" <arquivos de produção> | wc -l    # 112
grep -rl "invokeEdge(" src | grep -v __tests__ | wc -l              # 5
grep -rE "campaign_contacts" supabase/functions | wc -l             # 0
sed -n '330,372p' supabase/functions/talkx-send/index.ts

# Banco (via gateway MCP, somente leitura)
SELECT cmd, policyname, roles, qual FROM pg_policies
  WHERE schemaname='zapp' AND tablename='campaigns';
SELECT has_table_privilege('authenticated','zapp.campaigns','SELECT'),
       has_table_privilege('authenticated','zapp.campaigns','UPDATE');
SELECT jobid, schedule, command FROM cron.job
  WHERE command ILIKE '%campaign%' OR command ILIKE '%talkx%';
```

---

## 3. Achados das FASES 2–9 (com evidência real)

> Regra desta seção: **todo achado tem o comando e a saída observada**. O que não pôde ser confirmado
> está na Seção 4 (NÃO VERIFICADO). Autorelato de subagente não entra aqui.

### 3.1 SEGURANÇA — o achado mais grave da auditoria

#### A-F8-001 · **P0** · `prospeccao.*` legível e gravável por **qualquer visitante anônimo**
**Evidência (executada):** com a chave `anon`, que é **pública** (está no bundle de produção —
`assets/index-D9nkL2pz.js`), uma chamada PostgREST sem sessão devolve **HTTP 200**:

```
curl "https://supabase.atomicabr.com.br/rest/v1/cookies_config?select=*&limit=1" \
     -H "apikey: <anon do bundle>" -H "Accept-Profile: prospeccao"
→ HTTP 200 | colunas: id,servico,cookie,token,cnpj,csrf_token,atualizado_em,expires_at
```

| Tabela | HTTP anon | Colunas sensíveis | Linhas |
|---|---|---|---|
| `prospeccao.cookies_config` | **200** | `cookie`, `token`, `csrf_token` | 3 |
| `prospeccao.contatos` | **200** | `nome`, `telefone`, `linkedin_url`, `cargo` | 60 |
| `prospeccao.empresas` | **200** | `nome`, `nome_lusha`, `setor`, `cidade` | 43 |
| `prospeccao.execucoes` | **200** | `status`, `erro_msg` | 19 |

`pg_class.relrowsecurity = false` nas quatro e `has_table_privilege('anon', …, 'SELECT'|'INSERT') = true`.
**Consequência:** as credenciais de sessão do Lusha/LinkedIn (cookies e CSRF tokens) usadas pela
prospecção estão expostas a qualquer pessoa que abra o site e leia a chave pública do bundle — e a
mesma chave permite `INSERT` (envenenamento das listas). Isso é exploração imediata, não hipótese.

**Contraprova (mesma chave, tabela protegida):**
```
GET /rest/v1/cookies_config  Accept-Profile: zapp  → HTTP 401
{"code":"42501","message":"permission denied for table cookies_config"}
```
Ou seja: **não é comportamento sistêmico do PostgREST** — é falta de RLS/grants nesse schema.

**✅ CORRIGIDO em 2026-09-27 (PR #1592) — com prova pelas mesmas chamadas:**

| `prospeccao.<tabela>` com a chave `anon` pública | Antes | Depois |
|---|---|---|
| `contatos` · `cookies_config` · `empresas` · `execucoes` | HTTP **200** | HTTP **401** (`permission denied for schema prospeccao`) |

Além do previsto, o levantamento mostrou que o grant do `anon` era **total** — incluindo `TRUNCATE`,
`DELETE` e `UPDATE` (qualquer visitante podia **esvaziar** as listas) — e que `RLS não filtra TRUNCATE`,
então `authenticated` também perdeu `TRUNCATE/REFERENCES/TRIGGER`. Desenho final: RLS nas 4; `anon` sem
privilégio nem `USAGE` no schema; policies de staff (`is_admin_or_supervisor`) nas 3 operacionais;
`cookies_config` **sem policy nenhuma** = só `service_role` (mesmo padrão de
`zapp.whatsapp_official_credentials`); `service_role` intocado (a automação n8n, hoje dormante, não
quebra). Confirmado por comportamento: usuário logado **não-admin** vê `0` linhas em `contatos` e em
`cookies_config` (transação revertida). Rollback documentado na própria migration.

**Falta só a rotação** dos `cookie`/`token` do Lusha e do LinkedIn (ação no painel das duas
ferramentas) — os valores são de 17 e 21/07 e já venceram, mas rotacionar zera o risco histórico.

#### A-F8-002 · P2 · `config.toml` mente sobre a proteção das Edge Functions
**Evidência:** `supabase/config.toml:5` — *"ATENÇÃO: o runtime self-hosted NÃO lê verify_jwt deste
arquivo."* O arquivo tem **48 declarações** de `verify_jwt`, sendo **27 = false**. Quem (humano ou
agente) ler esse arquivo conclui que há uma política de JWT por função — e não há. A proteção real
vive no código (`_shared/auth.ts`). Risco: uma função nova criada "confiando no config" nasce aberta.
**Correção:** comentário de aviso no topo do bloco `[functions.*]` e um teste que falhe se algum
`index.ts` não chamar guard nenhum (hoje isso só é descoberto por grep, que erra).

#### A-F8-003 · P3 · `.env` permanece no histórico do git (chaves anon)
**Evidência:** `git log --all --name-only | grep '^\.env'` → `.env`, `.env.example`, `.env.staging`.
O `.env` não existe mais no HEAD (removido por `5949e03c6` "🔒 R-001: Remove .env from repo"), mas
segue recuperável: `git show d89ab3866a:.env`. **Papel das chaves expostas, decodificado do claim
`role` do JWT: `anon` nas três** (`SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_EXTERNAL_SUPABASE_ANON_KEY`) → chaves públicas por natureza, **risco baixo**.

> **Falso positivo descartado aqui:** a varredura automática acusou "1 chave `sk-` no histórico".
> Inspecionado: era a palavra **`ta·sk-gua·rdian`** dentro de uma mensagem de log do Postgres.

#### A-F8-004 · P3 · CVEs apenas em cadeias de desenvolvimento
`bun audit`: `fast-uri` (4× high) via `@commitlint/cli`; `hono` (moderate/low) via
`@lovable.dev/mcp-js > @modelcontextprotocol/sdk`; `joi` (low). **Nenhuma no runtime do app.**

#### A-F8-005 · ✅ verificação que **derrubou** uma suspeita grave
O bundle de produção (`482.619 bytes`) contém `service_role`: **0 ocorrências**; a única chave JWT
no bundle tem `role=anon`. E as Edge Functions que o grep acusou de "sem guarda" **responderam 401**:

```
create-user 401 · invite-user 401 · ai-proxy 401 · get-sip-password 401 · get-mapbox-token 401
chatbot-l1 401 · client-observability 401 · mcp 401 · public-api 401 (x-api-key) · evolution-api 401
```
`health-check` (200) e `db-health-monitor` (200) são públicos **por projeto**. Os mutantes perigosos
usam `requireServiceRoleOrCron` (`cleanup-storage-orphans`, `auto-close-conversations`,
`lgpd-scheduled-jobs`, `send-scheduled-report`); `migrate-helper` usa shared secret; os webhooks usam
**HMAC com rotação de segredo** (`_shared/hmac-validation.ts`). **Conclusão: a superfície de auth é
bem construída — a suspeita era artefato do meu grep, não do sistema.**

### 3.2 BANCO DE DADOS (FASE 2)

#### A-F2-001 · P1 · 5 tabelas com RLS desligado
`pg_class.relrowsecurity=false`: as 4 de `prospeccao` (A-F8-001, gravidade P0 pelo anon) + **`zapp.cookies_config`**
(3 linhas). Nesta última o `anon` **é** negado (401), mas `authenticated` tem SELECT/INSERT/UPDATE/DELETE —
e o banco é **compartilhado** entre zapp/bpm/email_app/financeiro/vendas/logistica, então qualquer
usuário logado de outro produto lê/escreve. **Ação:** ligar RLS + policies.

#### A-F2-002 · P3 · Índices nunca usados
15 índices com `idx_scan = 0` (inclusive `idx_evo_contacts_phone_trgm` e os `*_remote_jid_idx` das views
particionadas por departamento). Custo de escrita sem retorno. Candidatos a remoção — **medir antes**,
já que o contador zera em manutenção.

#### A-F2-003 · verificação de integridade de migrations
`supabase_migrations.schema_migrations` no banco = **857 registros** vs **165 arquivos** no repo.
Provável causa: o banco é compartilhado com outros produtos, cujas migrations caem na mesma tabela →
**não é, por si, drift**. Fica como verificação pendente (Seção 4).

### 3.3 BACKEND / EDGE FUNCTIONS (FASE 3)
Sem achados novos além de A-F8-002 e:
- **A-F3-001 · P3** · `sicoob-bridge` responde **500** (com `Internal server error`) a uma chamada **sem autenticação**, em vez de 401 — o `Authorization` é lido (`:20`) mas a autorização acontece depois do processamento.
- **A-F3-002 · P3** · `login-attempts` responde 405 a GET (comportamento normal; não testável por GET — ver Seção 4).

### 3.4 FRONTEND / UX (FASES 4 e 5)
Sem achado novo nesta rodada; valem os registrados antes (A-F1-005: 112 call-sites crus ignorando o
wrapper que lê a mensagem real do erro; A-F1-007: handler de UPDATE da view `contacts` grava 16 de 50
colunas → mover card no Kanban não persiste).

### 3.5 INTEGRAÇÕES (FASE 6)
- **A-F6-001 · ✅** · `evolution-webhook` valida assinatura **HMAC** com múltiplos segredos (rotação sem downtime); `bitrix-api` exige Origin confiável + `requireUser`; cron endpoints exigem service_role/cron secret. Nenhum webhook aberto encontrado.

### 3.6 INFRA / DEPLOY / OBSERVABILIDADE (FASE 7)
#### A-F7-001 · **P1** · Push na `main` deixou de disparar workflow (incidente **intermitente** — causa-raiz medida)
**Evidência (antes):** consulta à API (`/actions/runs?event=push`) → o último evento `push` do
repositório era de **2026-09-26T21:22Z**. O merge do #1587 (`5b4c6fc0`, 11:43:37Z) gerou **zero runs**
para aquele SHA em qualquer workflow; o do #1590 (`ce2afba656`, 12:18Z) também (**0 runs**). Sem CI no
merge e **sem deploy** — a produção ficou no build anterior até o `workflow_dispatch` manual
(runs `36316978987` e `36318935347`).

**Causa-raiz (medida em 2026-09-27, 13:1xZ — resolve o item 1 da Seção 4):** não é quebra permanente.
A linha do tempo dos runs de `deploy-vps.yml` mostra **7 runs `cancelled` em 60 segundos em
26/09 21:20–21:22Z** — e o próprio arquivo documenta, em comentário, a classe desse bug: *"run cancelado
segura o concurrency group; runs ficam em pending SEM jobs"* (foi por isso que o grupo v2 → v3 em
06/08). Depois disso o gatilho **se recuperou sozinho**: os merges de 12:48 (`2e9a76b64`, #1591),
12:56 (`a4cb5687e`, #1588) e 13:05 (`5acf04f49`, #1592) dispararam deploy por `push` normalmente
(`success` / `in_progress`) — **3 de 3**.

**Conclusão honesta:** o filtro `paths-ignore` (`.md`, `docs/**`) **não** é a causa (os merges tocavam
`src/`). É incidente **intermitente e silencioso** do `concurrency group` envenenado, que se manifestou
em 2 merges seguidos e depois cessou sem intervenção. **O risco não é o bug em si — é o silêncio:** a
`main` avança, a produção fica no build velho e nada acusa. Mitigação recomendada (não implementada):
watchdog agendado que compara o SHA da `main` com o último run de `deploy-vps.yml` e dispara se faltar.
```yaml
# o gatilho, para registro (não é a causa)
on:
  push:
    branches: [main]
    paths-ignore: ["**.md", "docs/**"]
```

#### A-F7-002 · P2 · O deploy self-hosted não é automático (por construção, mas não documentado)
`.github/workflows/deploy-vps-selfhosted.yml` tem o gatilho de push **comentado** — só roda por
`workflow_dispatch`. Quem assume "merge = deploy" fica com a correção parada, como aconteceu hoje.

#### A-F7-003 · P2 · CI cronicamente vermelha na main
Falhas nos últimos dias: `ratchet-tighten`, `edge-drift-check`, `Contract Guards`, `E2E Inbox (VPS)`,
`Cleanup E2E data (REST)`, `Branch Protection Sentinel`. Sinal vermelho permanente = ninguém olha o
painel, e falhas reais passam a se esconder entre elas.

**Confirmado de novo em 2026-09-27 (PR #1590):** `Catalog fresh + ACL RPC MCP` falha em qualquer PR
com bug de `$GITHUB_OUTPUT` (`Invalid format '0'`) somado a `ECONNREFUSED 209.142.67.51:5432` — é
infra do gate, não do diff. E os linters de migration (`lint-migrations` → `ML-008` em
`20260906001000_rpc_sla_dashboard.sql`; `check-migration-gates` → 3 FAILs em
`20260804000000_*`, `20260804150000_*`, `20260804170000_*`) reprovam **arquivos antigos**, nunca o
diff do PR em análise. Consequência prática: todo PR nasce com vermelho que não é dele, e a equipe
criou o hábito de mergear por cima (`--admin`) — o que um dia vai esconder uma falha real.

**`Drift repo ↔ banco` — prova por histórico:** o job falha na `main` em **16, 17, 18, 19 e 20/09**
(5 execuções agendadas consecutivas), e a `main` também carrega vermelho em `zapp-schema-drift-gate`,
`edge-drift-check` e `health-score-anti-drift`. A causa provável é a já registrada em
A-F2-003 (857 registros de migration no banco compartilhado × 171 arquivos no repo). No branch do
#1590, todos os gates de drift que aquela mudança poderia afetar ficaram **verdes** — o regen do
snapshot pelo workflow autoritativo funciona.

### 3.7 QUALIDADE / MANUTENÇÃO (FASE 9)
- **A-F9-001 · P3** · 1 arquivo morto, detectado pelo próprio gate do repo: `src/features/queues/components/QueueRoutingRules.tsx` (sem importador).
- **A-F9-002 · P3** · 8 `TODO` (apenas 1 acionável: `EMAIL-04`, anexos do Gmail não persistem payload); 5 `: any`; 10 `@ts-expect-error`; **nenhuma lib duplicada** de data/estado/http/ícones/formulários/testes.
- **A-F9-003 · P3** · Variáveis declaradas e não usadas em `src/`: `VITE_TYPING_AUTO_CLEAR_MS`, `VITE_TYPING_STOP_DEBOUNCE_MS`, `VITE_SUPABASE_PROJECT_ID` (podem ser usadas em `vite.config`/e2e — ver Seção 4).

---

## 4. NÃO VERIFICADO (explicitamente incompleto)

| # | O que | Por que não verifiquei | Como verificar |
|---|---|---|---|
| 1 | ~~**Causa-raiz** do silêncio de `push` na main (A-F7-001)~~ | ✅ **RESOLVIDO em 2026-09-27** | Medido: `concurrency group` envenenado por 7 runs `cancelled` em 26/09 21:20–21:22Z; recuperou sozinho às 12:48 — ver A-F7-001 na Seção 3.6 |
| 2 | Se os `cookie`/`token` de `prospeccao.cookies_config` **ainda são válidos** | Testá-los seria usar credencial de terceiro | Rotacionar direto (recomendado) em vez de testar |
| 3 | `login-attempts`, `email-track-*` e demais endpoints POST-only | Teste exigiria POST (efeito colateral) | Teste de contrato em ambiente isolado |
| 4 | Drift real entre as 857 migrations do banco e as 165 do repo | Tabela é compartilhada com outros produtos | `supabase db diff` por schema |
| 5 | FASE 5 (UX real: navegação/estados vazios) e FASE 4 visual | Exigiria navegação em produção; subagentes morreram no interrupt | Rodada dedicada com browser |
| 6 | Retenção R2 e Gmail OIDC | Dependem de valores/infra do usuário | Com o usuário |
| 7 | Contagem de contatos com mais de uma linha em `zapp.conversations` | Revisor independente afirmou **3.218**; minha medição deu **70** (definições diferentes de agrupamento) | Padronizar a query: view `zapp.conversations` vs tabelas particionadas |

---

*Seções 3 e 4 consolidadas nesta rodada (varredura delegada morreu por interrupt; trabalho refeito
por processos de shell duráveis em `_scans/`). Falta a Seção 5 — o PLANO_100.md.*
