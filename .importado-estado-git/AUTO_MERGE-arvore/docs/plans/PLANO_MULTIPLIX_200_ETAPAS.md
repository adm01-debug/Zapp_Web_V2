# PLANO DE IMPLEMENTAÇÃO — MULTIPLIX (ZAPP Web V2) · v1.1 REVISADO
## 200 etapas · checklist de conclusão · DarkBlue operacional

**Repo:** `adm01-debug/Zapp_Web_V2` · **Destino:** `docs/multiplix/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md`
**Data:** 26/09/2026 · **Substitui:** v1.0 do mesmo dia

---

## O que a revisão mudou — e por quê

A v1.0 foi escrita olhando a árvore do repo. A v1.1 foi escrita depois de **medir os dois bancos e ler os arquivos-chave**. Cinco achados mudaram o plano:

| # | Achado (medido nesta sessão) | Efeito no plano |
|---|---|---|
| 1 | **O banco do ZAPP não tem o público do Multiplix.** `contacts` no ZAPP: 3.099 contatos, **100% `contact_type=cliente`**, **0 com empresa**, **0 com UF**, 3 com tags. Fornecedor, transportadora, ramo e estado não existem ali. | A camada de público passa a ler o **Singu** (Gestão de Clientes), alinhado à decisão de banco único já tomada. Nasce a **Fase 1 — Ponte Singu**. |
| 2 | **O Singu tem exatamente o modelo que a especificação pediu.** `companies` 57.675 ativas com `is_customer / is_supplier / is_carrier` independentes (388 empresas com mais de um papel), `ramo_atividade` em 50.698 (566 valores distintos), UF em `company_addresses.estado` (55.750 endereços primários); `suppliers` 754; `carriers` 114; `contacts` 4.748 com `company_id` em 2.945 e WhatsApp em 2.108; `contact_phones` 3.141 com `numero_e164` + `is_whatsapp` + `is_primary`. | E003/E004/E005 da v1.0 estão **respondidas**. Papel multi-valor, ramo canônico e UF já existem — sem inferir nada pelo nome. |
| 3 | **Cobertura de contatos é baixa nos papéis que importam:** 754 fornecedores → **145 contatos**; 114 transportadoras → **76 contatos**. `company_phones` tem 50.634 telefones de empresa. | Vira **decisão de negócio (E006)**: enviar também ao telefone da empresa quando não há pessoa cadastrada, ou não. Sem isso, "fornecedores de embalagens" pode devolver meia dúzia de nomes. |
| 4 | **Consentimento não existe como dado em lugar nenhum.** ZAPP: `consent_status` = `unknown` em 100%, `talkx_blacklist` vazia. Singu: `contact_preferences` = 0 linhas. E o canal é **Evolution GO (não oficial)** — não existe "modelo aprovado" nem "janela de 24h" da Business Platform. | O status **"Exigem modelo aprovado"** do protótipo **não corresponde ao canal real** e sai da primeira versão. Entra uma política própria (E004/E005): supressão via `talkx_blacklist` compartilhada, ritmo de envio e risco de bloqueio. |
| 5 | **A ponte ZAPP→Singu atual é insegura e está documentada como pendência (GATE C):** 5 RPCs do Singu com `GRANT EXECUTE TO anon`, chamadas pela anon key. | A Fase 1 implementa a **Opção A do GATE C** (edge function com chave de serviço do Singu) e o rollout fecha o gate. Não construir o Multiplix em cima da anon key. |

Outras correções de revisão:
- **Reuso do que já existe** e a v1.0 propunha refazer: ack de entrega/leitura já chega em `talkx_recipients` via `evolution-webhook` (E87); resposta correlacionada (E88); agendamento por `pg_cron` 1 min (`talkx-scheduler`); supressão em `talkx_blacklist`; gravador de áudio do Chat com `lamejs`; `crm_contact_links` para vincular contato Singu ↔ conversa ZAPP; `sync_interaction_from_zapp` para registrar interação no Singu; `search_vector` já indexa empresas/contatos.
- **Permissão por carteira e departamento** (vendedor vê só sua carteira; Compras vê fornecedores; Logística vê transportadoras) não estava no plano. Agora é regra de servidor na RPC (E015) com teste obrigatório (E024).
- **Fase 1 da v1.0 tinha 24 etapas de DDL** (um enum por etapa). Consolidada em 14. As 10 etapas liberadas foram para a Ponte Singu e para o rollout com fechamento do GATE C.
- **Padrão real de migration no repo** (PRs #804 e #805 abertas hoje): DDL aplicada via `db_query` + registro manual no ledger `supabase_migrations.schema_migrations` + arquivo em `supabase/migrations/` versionado em PR **aberta**. O plano segue esse padrão, não o `db_apply_migration`.
- PRs abertas verificadas (#791, #802, #804, #805, #807): nenhuma toca `talkx-*`, `_shared`, `src/components/talkx/` ou `evolution-webhook`. Sem colisão hoje.

---

## Como usar

- Cada etapa: **ID** · ação · **Feito quando** (critério verificável). Marque `[x]` só com evidência.
- Uma fase = uma ou mais branches `claude/<tipo>-multiplix-<slug>-<AAMMDD-HHMM>`. Nunca uma branch para tudo.
- **🔒 PARA** = decisão do Joaquim (DDL em produção, custo, arquitetura, dado de terceiro). PR fica aberta.
- **⚠️ BLOQUEANTE** = trava a fase seguinte.
- **Portão** no fim de cada fase. Nenhuma fase começa sem o portão anterior verde.

---

## Fidelidade de design — regras não negociáveis

| Item do protótipo | Origem obrigatória no projeto |
|---|---|
| `--bg`, `--surface`, `--line`, `--blue`, `--green`, `--amber`, `--red` | `src/styles/tokens.css` + `docs/design/ZAPP_DARKBLUE_PREMIUM_TOKENS.css` |
| Outfit (títulos) / Plus Jakarta Sans (corpo) | tokens de tipografia existentes — sem `@import` novo |
| Glows e sombras | `docs/design-system/glows.md` |
| Botão, input, select, checkbox, modal, toast, tooltip | `src/components/ui/` (shadcn já adotado) |
| Grid 3 colunas 1.02 / 1.58 / 0.98 | CSS do módulo, em `rem` |
| Entrada do módulo | `lazyViews.ts` (mesmo mecanismo do `TalkXView`) |

**Proibido:** hex literal no módulo, fonte nova, lib de UI nova, cartão estatístico no topo da criação, gráfico decorativo, rótulo de status que o canal real não sustenta.
**Obrigatório:** `01 PÚBLICO`, `02 COMPOSIÇÃO`, `03 PRÉVIA & REVISÃO` são áreas simultâneas, não wizard.

**Ajuste de UI decorrente da revisão:** o painel "Pronto para sair?" passa a mostrar `Aptos` / `Sem destino WhatsApp` / `Suprimidos (opt-out)` / `Fora do escopo da sua permissão`. "Exigem modelo aprovado" só volta se um dia houver conexão oficial (o enum já prevê).

---

## FASE 0 — Descoberta residual e decisões (E001–E010)

- [ ] **E001** · Grafo atualizado (`graphify update . --force`) e `GRAPH_REPORT.md` com commit = `git rev-parse HEAD`. **Feito quando:** report anexado ao `ESTADO_INICIAL.md`.
- [ ] **E002** · Registrar as PRs abertas verificadas hoje (#791, #802, #804, #805, #807) e re-checar `github_list_pull_requests` antes de cada branch nova. **Feito quando:** tabela no `ESTADO_INICIAL.md`; qualquer PR nova tocando `talkx-*`/`_shared`/`evolution-webhook` pausa a fase.
- [ ] **E003** · 🔒 PARA — **Caminho de acesso ao Singu.** Opção A (edge function do ZAPP com chave de serviço do Singu, RPCs com guard) vs. esperar o banco único. Recomendação: Opção A agora, porque destrava o Multiplix e fecha o GATE C. **Feito quando:** decisão registrada em `docs/adr/ADR-007-multiplix-ponte-singu.md`.
- [ ] **E004** · 🔒 PARA — **Política do canal não oficial (Evolution GO).** Sem template/janela 24h. Definir: intervalo mínimo entre envios por conexão, teto por hora, aquecimento, quando uma conexão é considerada "em risco". **Feito quando:** números definidos e gravados em `whatsapp_connections` ou `talkx_settings`.
- [ ] **E005** · 🔒 PARA — **O que é "apto" sem dado de consentimento.** Hoje 100% `unknown`. Proposta: B2B operacional (fornecedor/transportadora) = apto salvo supressão em `talkx_blacklist`; cliente = apto só com interação prévia registrada (`last_interaction_at` no Singu ou conversa no ZAPP). **Feito quando:** regra aprovada e escrita na ADR-007.
- [ ] **E006** · 🔒 PARA — **Cobertura de contatos.** 754 fornecedores × 145 contatos; 114 transportadoras × 76 contatos. Permitir destino = telefone da empresa (`company_phones`) quando não há pessoa? **Feito quando:** decisão registrada; se sim, E014 inclui a regra.
- [ ] **E007** · Modelo de permissão real — ler `user_roles`, `role_permissions` (Singu) e perfis/departamentos (ZAPP); mapear "vendedor → carteira (`companies.user_id`)", "Compras → `is_supplier`", "Logística → `is_carrier`". **Feito quando:** matriz perfil × papel × campo de escopo em `docs/multiplix/PERMISSOES.md`.
- [ ] **E008** · ⚠️ BLOQUEANTE — Capacidades reais do envio: ler `supabase/functions/talkx-send/index.ts`, `evolution-api/`, `_shared/evolution-helpers.ts`. Tipos suportados (texto, imagem, documento, áudio, **PTT**), limites, ack, `external_id`. **Feito quando:** tabela de capacidades em `docs/multiplix/CANAL.md`.
- [ ] **E009** · Contrato do TTS: `elevenlabs-tts/index.ts` (auth, rate limit por usuário, formato, erro) e `elevenlabs-webhook`. **Feito quando:** contrato documentado em `CANAL.md`, incluindo se o MP3 serve como PTT ou precisa de transcodificação para OGG/Opus.
- [ ] **E010** · Publicar `docs/multiplix/ESTADO_INICIAL.md` (achados desta revisão + E001–E009), `DESIGN_TOKENS_MAP.md` (de-para protótipo→token) e a receita de módulo (`lazyViews.ts` + nav + permissão). **Feito quando:** PR de documentação mergeada.

> **Portão F0:** E003, E004, E005, E006 decididos; E008 documentado.

---

## FASE 1 — Ponte Singu: camada de público (E011–E026)
**Objetivo:** o Multiplix lê fornecedores, transportadoras, clientes, ramo e UF do Singu, com escopo aplicado no servidor. **Toda DDL aqui é 🔒 PARA (banco Singu em produção).**

- [ ] **E011** · RPC `multiplix_search_audience(filtros, escopo, página)` no Singu — `SECURITY DEFINER` com guard (rejeita chamada sem identidade válida); filtros: papel (`is_supplier`/`is_carrier`/`is_customer`, multi), `ramo_atividade`, UF via `company_addresses.is_primary`, texto via `search_vector`. **Feito quando:** cada filtro isolado e combinado devolve contagem igual à query direta.
- [ ] **E012** · RPC `multiplix_count_audience(filtros, escopo)` — total autoritativo separado da página. **Feito quando:** total não depende do que o navegador carregou.
- [ ] **E013** · RPC `multiplix_resolve_recipients(contact_ids[], company_ids[], escopo)` — devolve contato, empresa, papéis, destino WhatsApp, `last_interaction_at`. **Feito quando:** 1 chamada resolve 1.000 IDs em < 1 s.
- [ ] **E014** · Regra de destino: `contact_phones` com `is_whatsapp AND is_primary` → `numero_e164`; senão `contacts.whatsapp`; senão (se E006 = sim) `company_phones` WhatsApp; senão classe `destino_invalido`. **Feito quando:** teste cobre os 4 ramos.
- [ ] **E015** · Escopo por carteira/departamento **dentro da RPC** (nunca no front): vendedor = `companies.user_id = auth`; Compras = `is_supplier`; Logística = `is_carrier`; admin = tudo. **Feito quando:** E024 verde.
- [ ] **E016** · Excluir `deleted_at IS NOT NULL` e `is_duplicate` em todas as RPCs. **Feito quando:** contagem bate com `companies_ativas` (57.675 hoje).
- [ ] **E017** · RPC `multiplix_list_ramos()` — valores distintos de `ramo_atividade` (566 hoje) + contagem + item "Não informado" explícito (~6.977 empresas). **Feito quando:** lista ordenada por frequência.
- [ ] **E018** · RPC `multiplix_list_ufs()` — UFs distintas de `company_addresses` primários. **Feito quando:** UF sem empresa não aparece.
- [ ] **E019** · 🔒 PARA (secrets) — Chave de serviço do Singu como secret das edge functions do ZAPP (`SINGU_SERVICE_KEY`) — Opção A do GATE C. **Feito quando:** secret criada via `deploy-functions.yml` e nunca exposta ao front.
- [ ] **E020** · Edge `multiplix-audience` no ZAPP: autentica o usuário ZAPP, deriva escopo (E007), chama as RPCs com a chave de serviço. **Feito quando:** request com escopo forjado no body é ignorado; escopo vem do JWT.
- [ ] **E021** · Cache curto (5 min) de ramos e UFs no edge. **Feito quando:** segundo request não bate no Singu.
- [ ] **E022** · Identidade cruzada: usar `crm_contact_links` (ZAPP) para ligar contato Singu ↔ conversa ZAPP; **nunca** inserir ID do Singu em FK local. **Feito quando:** abrir conversa a partir de um destinatário funciona sem criar contato duplicado.
- [ ] **E023** · Frase legível da consulta ("Fornecedor OU transportadora · SP · ramo Embalagens · excluir lista X") + motivo de inclusão por linha (manual / público / filtro). **Feito quando:** ambos vêm na resposta da API.
- [ ] **E024** · ⚠️ BLOQUEANTE — Teste de escopo com 3 perfis reais (vendedor, Compras, Logística): cada um só vê e só **conta** o que a matriz E007 permite. **Feito quando:** teste automatizado em `scripts/db-audit/` verde.
- [ ] **E025** · Performance: busca combinada em 57k empresas < 500 ms; índices em `companies(is_supplier)`, `(is_carrier)`, `(ramo_atividade)`, `company_addresses(company_id, is_primary)` se `EXPLAIN` pedir. **Feito quando:** `EXPLAIN ANALYZE` anexado.
- [ ] **E026** · Documentar em `docs/multiplix/PONTE_SINGU.md` e atualizar `docs/crm-external-grants.md` com as novas RPCs e o plano de fechar o GATE C (E197). **Feito quando:** mergeado.

> **Portão F1:** E020 no ar, E024 verde, E025 medido.

---

## FASE 2 — Modelo de dados do Multiplix no ZAPP (E027–E040)
**Todas 🔒 PARA — DDL em produção.** Padrão: DDL via `db_query` → INSERT no ledger `supabase_migrations.schema_migrations` → arquivo em `supabase/migrations/` → PR **aberta** → `db-guard.yml` e `types-sync.yml` verdes.

- [ ] **E027** · Enums: `multiplix_dispatch_status` (rascunho, preparando, pronto_revisao, agendado, em_fila, enviando, pausado, concluido, concluido_com_falhas, cancelado); `multiplix_block_type` (texto, voz_ia, audio_gravado, arquivo); `multiplix_eligibility` (apto, exige_modelo, sem_interacao_previa, destino_invalido, suprimido, midia_pendente, conexao_indisponivel, fora_do_escopo); `multiplix_item_status` (pendente, reservado, enviando, enviado, falha_transitoria, falha_permanente, cancelado, ambiguo). **Feito quando:** enums criados e em `src/types/`.
- [ ] **E028** · `multiplix_dispatches` — owner, departamento, título, origem, status, `dispatch_version`, `audience_version`, agendamento, `whatsapp_connection_id` FK `whatsapp_connections`. **Feito quando:** NOT NULL em owner/status/versões.
- [ ] **E029** · `multiplix_blocks` — dispatch_id, ordem, tipo, conteúdo jsonb versionado, regra de personalização, asset_id, hash. **Feito quando:** unique `(dispatch_id, ordem)`.
- [ ] **E030** · `multiplix_recipients` — `singu_contact_id`, `singu_company_id` (sem FK cruzada), nome/empresa snapshot, `destino_e164`, `audience_version`, elegibilidade, motivo, snapshot de variáveis. **Feito quando:** unique `(dispatch_id, destino_e164)`.
- [ ] **E031** · `multiplix_delivery_items` — recipient × block, status, tentativas, `next_attempt_at`, `lease_until`, `external_id` (mesma semântica de `talkx_recipients.external_id`), `idempotency_key`, erro. **Feito quando:** unique em `idempotency_key` = hash `(dispatch_id, dispatch_version, recipient_id, block_id)`.
- [ ] **E032** · `multiplix_events` — append-only (trigger bloqueia UPDATE/DELETE), `correlation_id`. **Feito quando:** UPDATE falha por trigger.
- [ ] **E033** · `multiplix_audiences` (tipo `regra` | `lista_estatica`, definição = filtros da RPC, dono, departamento, `last_used_at`) + `multiplix_audience_members`. **Feito quando:** o tipo distingue regra dinâmica de lista aprovada.
- [ ] **E034** · `multiplix_voice_assets` (hash de roteiro+voz+modelo+parâmetros, caminho, duração, consumo) + `multiplix_voice_grants` (voz, titular, perfis, estado, origem). **Feito quando:** unique no hash; grant com data de revogação.
- [ ] **E035** · Índices: fila `(status, next_attempt_at) WHERE status IN ('pendente','falha_transitoria')`; `(owner_id, created_at DESC)`; `(dispatch_id, status)` em recipients e items. **Feito quando:** `EXPLAIN` do claim usa o índice parcial.
- [ ] **E036** · RLS + `FORCE ROW LEVEL SECURITY`: dispatch visível ao dono e ao departamento; blocks/recipients/items/events via `EXISTS` no dispatch; audiences próprias + compartilhadas; voice_assets só com grant. **Feito quando:** políticas nas 8 tabelas.
- [ ] **E037** · GRANTs: `anon` zero; `authenticated` mínimo; `service_role` para worker. **Feito quando:** `scripts/db-audit/grants-baseline` regenerado sem `multiplix_*` em `anon`.
- [ ] **E038** · Aplicar e versionar no padrão do repo (ledger + `supabase/migrations/` + PR aberta); `check-migration-drift.mjs` verde. **Feito quando:** CI da PR verde, PR aguardando aprovação.
- [ ] **E039** · ⚠️ BLOQUEANTE — Teste negativo de RLS em `scripts/db-audit/`: usuário de outro departamento não lê nem conta. **Feito quando:** somado a `docs/audits/rls-matrix-*.md`.
- [ ] **E040** · Tipos TS via `types-sync` + `docs/multiplix/SCHEMA.md`. **Feito quando:** `src/integrations/supabase/types.ts` contém `multiplix_*`.

> **Portão F2:** PR aprovada pelo Joaquim e mergeada; E039 verde.

---

## FASE 3 — Serviços compartilhados (E041–E052)
**Objetivo:** extrair de TalkX o que é regra de comunicação. Não forkar `talkx-send`.

- [ ] **E041** · `supabase/functions/_shared/messaging/` com index e tipos. **Feito quando:** importável por `talkx-send`.
- [ ] **E042** · Normalização E.164 BR — reaproveitar o que já existe em `_shared/evolution-helpers.ts`; só extrair, não reescrever. **Feito quando:** testes cobrem 9º dígito/DDD/inválido.
- [ ] **E043** · Renderização de variáveis (`{{nome}}`, `{{empresa}}`, `{{nome_completo}}`, `{{saudacao}}`) extraída de `useCampaignEditor.ts`/`talkx-send`; placeholder desconhecido = erro. **Feito quando:** nunca devolve string vazia silenciosa.
- [ ] **E044** · Elegibilidade — lê `talkx_blacklist` (supressão compartilhada), aplica E005 (B2B vs cliente), destino válido, escopo. Devolve classe + motivo. **Feito quando:** cobre as 8 classes do enum.
- [ ] **E045** · Preparação de mídia — tipo real, tamanho, acessibilidade, TTL de URL assinada. **Feito quando:** arquivo expirado bloqueia o item.
- [ ] **E046** · Adaptador de canal — interface `capabilities()` + `send()`; implementação Evolution GO. **Feito quando:** `talkx-send` e o worker usam a mesma implementação.
- [ ] **E047** · Backoff e classificação transitório × permanente. **Feito quando:** opt-out e número inválido nunca reententam.
- [ ] **E048** · `correlation_id` do request ao webhook; logger sem roteiro/conteúdo. **Feito quando:** revisão de log confirma ausência de conteúdo.
- [ ] **E049** · Refatorar `talkx-send` para consumir `_shared/messaging` — diff mínimo. **Feito quando:** compila e passa nos testes existentes.
- [ ] **E050** · ⚠️ BLOQUEANTE — Regressão de Campanhas: `e2e/talkx.spec.ts` + unit de `scripts/ci/` + `tests/contracts`. **Feito quando:** suíte verde sem snapshot alterado.
- [ ] **E051** · `whatsapp_connections` declara capacidades (PTT, documento, limite/hora da E004). **Feito quando:** revisão bloqueia bloco incompatível.
- [ ] **E052** · `docs/multiplix/ARQUITETURA.md` no padrão de `docs/talkx/ARQUITETURA.md` (mermaid + métrica→fonte). **Feito quando:** mergeado.

> **Portão F3:** E050 verde.

---

## FASE 4 — API de domínio (E053–E072)
**Objetivo:** resolver, prever, estimar, preparar, revisar, confirmar, executar, consultar — operações separadas. Preparar não autoriza enviar.

- [ ] **E053** · Edge `multiplix-dispatch` — esqueleto, CORS, JWT obrigatório, escopo do JWT. **Feito quando:** deploy via `deploy-functions.yml` e ping OK.
- [ ] **E054** · Rascunho CRUD (criar, ler, título, conexão, descartar). **Feito quando:** sobrevive a refresh e troca de dispositivo.
- [ ] **E055** · Blocos CRUD + reordenação atômica. **Feito quando:** sem buraco/duplicata em `(dispatch_id, ordem)`.
- [ ] **E056** · Editar bloco = nova versão; invalida preparação de voz. **Feito quando:** asset marcado inválido ao mudar roteiro.
- [ ] **E057** · Seleção server-side: `(manual ∪ públicos) ∩ filtros − exclusões`, via E011/E013. **Feito quando:** exclusão manual vence inclusão por público.
- [ ] **E058** · ⚠️ BLOQUEANTE — "Selecionar todos os resultados" materializa o conjunto completo via E012/E013, sem teto silencioso. **Feito quando:** público de 5.001+ retorna íntegro.
- [ ] **E059** · Deduplicação por `destino_e164`, sem mesclar pessoas; conflito vira aviso. **Feito quando:** 2 contatos com o mesmo número = 1 envio + 1 aviso.
- [ ] **E060** · "Contato principal por empresa" explícito (`contact_phones.is_primary`, `contacts.role`); sem dado → sinaliza. **Feito quando:** modo ligado = 1 por empresa quando há dado.
- [ ] **E061** · `preview` — texto final e ativo exato por destinatário. **Feito quando:** igual ao que o worker envia.
- [ ] **E062** · Validação: placeholder desconhecido; variável em áudio único. **Feito quando:** erros nomeados.
- [ ] **E063** · Campo ausente: substituição aprovada ou exclusão; nunca inventar. **Feito quando:** escolha visível na revisão.
- [ ] **E064** · `eligibility` em lote → total, aptos, sem destino, suprimidos, fora do escopo. **Feito quando:** soma bate com o banco.
- [ ] **E065** · Contrato de revalidação pré-transmissão (supressão, conexão, escopo). **Feito quando:** opt-out após confirmação não recebe.
- [ ] **E066** · `estimate` — aptos × blocos, versões de roteiro, consumo de voz. **Feito quando:** três números de dado real.
- [ ] **E067** · `confirm` — congela público e blocos, grava versões, muda para `em_fila`/`agendado`. **Feito quando:** qualquer alteração exige nova revisão.
- [ ] **E068** · Idempotência de `confirm` por `(dispatch_id, dispatch_version)`. **Feito quando:** 2 POSTs = 1 execução.
- [ ] **E069** · `control` — pausar, retomar, cancelar pendentes. **Feito quando:** itens enviados intocados.
- [ ] **E070** · `status` — agregado, por destinatário, por bloco; enviado ≠ entregue ≠ lido ≠ respondido. **Feito quando:** 4 estados separados na resposta.
- [ ] **E071** · Rate limit por usuário e por conexão (E004). **Feito quando:** 429 com retry-after.
- [ ] **E072** · Testes de contrato em `tests/contracts/multiplix-*.contract.test.ts` (padrão do repo, PR #802). **Feito quando:** no CI.

> **Portão F4:** E058, E065, E067 verdes.

---

## FASE 5 — Fila persistente e worker (E073–E088)
**Objetivo:** o navegador não é o motor de envio.

- [ ] **E073** · Geração transacional dos `delivery_items` na confirmação. **Feito quando:** falha no meio não deixa fila parcial.
- [ ] **E074** · Edge `multiplix-dispatch-worker`. **Feito quando:** processa lote e devolve métricas.
- [ ] **E075** · ⚠️ BLOQUEANTE — Claim `FOR UPDATE SKIP LOCKED` + lote. **Feito quando:** 2 workers simultâneos não pegam o mesmo item.
- [ ] **E076** · Lease/heartbeat — item reservado expira e volta. **Feito quando:** worker morto libera em N min.
- [ ] **E077** · Ordem por destinatário — bloco 2 só após bloco 1. **Feito quando:** teste com 3 blocos mantém ordem.
- [ ] **E078** · Paralelismo por conexão + **ritmo** (intervalo mínimo, teto/hora de E004). **Feito quando:** limites respeitados sob carga.
- [ ] **E079** · Backoff progressivo com teto. **Feito quando:** transitório reententa e para.
- [ ] **E080** · Transitório × permanente com erro real do provedor. **Feito quando:** classificação verificada.
- [ ] **E081** · ⚠️ BLOQUEANTE — Timeout → `ambiguo`, sem reenvio cego. **Feito quando:** simulação não duplica.
- [ ] **E082** · Reconciliação por `external_id` — mesmo mecanismo do E87 do TalkX. **Feito quando:** `ambiguo` resolvido pelo evento.
- [ ] **E083** · Pausa — bloqueia novos; em voo terminam. **Feito quando:** contador para em 1 ciclo.
- [ ] **E084** · Cancelamento — encerra pendentes; nunca "desenviar". **Feito quando:** UI e log explícitos.
- [ ] **E085** · `concluido_com_falhas` quando há item falho. **Feito quando:** parcial não conta como sucesso.
- [ ] **E086** · Agendamento reaproveitando o padrão `pg_cron` 1 min do `talkx-scheduler` (`America/Sao_Paulo`). **Feito quando:** dispara sozinho no horário.
- [ ] **E087** · 🔒 PARA — Política de recálculo do público agendado. **Feito quando:** na ADR e implementada.
- [ ] **E088** · ⚠️ BLOQUEANTE — Dead letter consultável + cron do worker. **Feito quando:** fila drena sem navegador aberto.

> **Portão F5:** E075, E081, E088 verdes.

---

## FASE 6 — Canal e eventos (E089–E098)

- [ ] **E089** · Texto real via adaptador (E046). **Feito quando:** chega a destinatário permitido.
- [ ] **E090** · Imagem e documento com E045. **Feito quando:** PDF chega íntegro.
- [ ] **E091** · ⚠️ BLOQUEANTE — PTT nativo no Evolution GO: codec/contêiner aceito (OGG/Opus?); senão, áudio comum e a UI diz isso. **Feito quando:** resultado real em `CANAL.md`.
- [ ] **E092** · Seleção de conexão (`whatsapp_connections` + `whatsapp_connection_queues`); padrão = do departamento. **Feito quando:** conexão indisponível muda elegibilidade.
- [ ] **E093** · Estender `evolution-webhook`: ack `DELIVERY_ACK/READ` → `multiplix_delivery_items` (reusar o mapeamento E87). **Feito quando:** enviado/entregue/lido separados no monitor.
- [ ] **E094** · Resposta: vínculo por identificador quando houver (padrão E88); só temporal = **inferida**. **Feito quando:** flag persistida.
- [ ] **E095** · Mapa de erros provedor → classe → texto para operador. **Feito quando:** "número não existe no WhatsApp", não código cru.
- [ ] **E096** · Opt-out inbound → `talkx_blacklist` (compartilhada com Campanhas). **Feito quando:** contato sai dos aptos na próxima resolução.
- [ ] **E097** · Registrar envio como interação no Singu via `sync_interaction_from_zapp` (atualiza `last_interaction_at`). **Feito quando:** timeline do contato no Singu mostra o Multiplix.
- [ ] **E098** · Teste de contrato do adaptador (mock: sucesso, transitório, permanente, timeout) em `tests/contracts`. **Feito quando:** no `ci.yml`.

> **Portão F6:** E091, E093 verdes.

---

## FASE 7 — Voz e áudio (E099–E114)

- [ ] **E099** · Catálogo de vozes ligado a `voice_grants`; administração fora da bancada. **Feito quando:** operador só vê vozes com grant.
- [ ] **E100** · Edge `multiplix-voices` lendo grants. **Feito quando:** sem grant = lista vazia.
- [ ] **E101** · Revogação impede geração e recuperação. **Feito quando:** teste explícito.
- [ ] **E102** · Chave de cache = hash(roteiro final, voice_id, modelo, parâmetros). **Feito quando:** roteiros idênticos compartilham asset.
- [ ] **E103** · Edge `multiplix-prepare-voice` em fila — 1 chamada por roteiro distinto, reaproveitando `elevenlabs-tts`. **Feito quando:** 50 contatos com roteiro comum = 1 chamada.
- [ ] **E104** · Bucket privado por departamento + signed URL com TTL do envio. **Feito quando:** URL sem assinatura = 403.
- [ ] **E105** · Estimativa de consumo (caracteres × versões × modelo). **Feito quando:** ±5% do realizado.
- [ ] **E106** · 🔒 PARA — Teto de consumo por envio e por departamento. **Feito quando:** ultrapassar exige confirmação.
- [ ] **E107** · Modo "mesmo áudio": variável no roteiro bloqueia. **Feito quando:** nunca usa o nome do primeiro contato.
- [ ] **E108** · Modo "personalizar": N versões visíveis = `DISTINCT` dos roteiros finais. **Feito quando:** contador bate.
- [ ] **E109** · Prévia toca o asset real, duração real. **Feito quando:** não é estimativa por palavras.
- [ ] **E110** · Invalidação ao mudar roteiro/voz/parâmetro. **Feito quando:** volta a "não preparado" na UI e no banco.
- [ ] **E111** · Gravação: **reutilizar o gravador de áudio do Chat** (já usa `public/vendor/lamejs`), não criar outro. **Feito quando:** mesmo componente, com pausar/retomar/refazer.
- [ ] **E112** · Upload da gravação para o bucket privado, vinculado ao bloco. **Feito quando:** sobrevive a refresh.
- [ ] **E113** · Normalização de codec conforme E091. **Feito quando:** Chrome e Safari chegam audíveis.
- [ ] **E114** · Falha de TTS → `midia_pendente`; envio não sai pela metade. **Feito quando:** erro não vira texto solto.

> **Portão F7:** E103, E105, E107 verdes.

---

## FASE 8 — Front: fundação (E115–E124)

- [ ] **E115** · Entrada via `lazyViews.ts` + rota `/multiplix` em chunk próprio. **Feito quando:** carrega isolado.
- [ ] **E116** · Item "Multiplix · NOVO" sob COMUNICAÇÃO, visível por permissão (E007). **Feito quando:** sem permissão não vê nem acessa por URL.
- [ ] **E117** · `MultiplixView` — 3 regiões simultâneas + rodapé. **Feito quando:** bate com o protótipo em 1920×1080.
- [ ] **E118** · ⚠️ BLOQUEANTE — Zero hex no módulo. **Feito quando:** grep por `#` em `src/components/multiplix/` vazio.
- [ ] **E119** · Tipografia pelos tokens. **Feito quando:** auditoria de `docs/tipografia/` sem fonte nova.
- [ ] **E120** · Só componentes de `src/components/ui/`. **Feito quando:** nenhum base novo.
- [ ] **E121** · React Query (ADR-001) + estado local de composição em `src/hooks/multiplix/`. **Feito quando:** sem cache duplicado.
- [ ] **E122** · Autosave no servidor; áudio gravado sinalizado como não persistido até upload. **Feito quando:** trocar de máquina recupera.
- [ ] **E123** · Estados vazio/erro/carregando (ADR-005) + textos em `src/i18n/`. **Feito quando:** sem string literal no JSX.
- [ ] **E124** · `bundle-budget` verde + telemetria (abrir, confirmar, erro). **Feito quando:** CI verde sem subir baseline.

> **Portão F8:** E118 e CI verdes.

---

## FASE 9 — Painel 01 · Público (E125–E138)

- [ ] **E125** · Layout do painel fiel ao protótipo, com tokens. **Feito quando:** revisão visual lado a lado.
- [ ] **E126** · Busca com debounce, sem acento, via E011. **Feito quando:** "jose" acha "José".
- [ ] **E127** · Filtro de papel — Clientes / Fornecedores / Transportadoras, **multi-seleção** (papéis não são exclusivos: 388 empresas têm mais de um). **Feito quando:** empresa com 2 papéis aparece nos 2.
- [ ] **E128** · Filtro de ramo — combobox com busca sobre os 566 valores + "Não informado". **Feito quando:** nada inferido pelo nome.
- [ ] **E129** · Filtro de UF vindo de E018. **Feito quando:** lista dinâmica.
- [ ] **E130** · Lista virtualizada. **Feito quando:** 5.000 linhas a 60 fps.
- [ ] **E131** · ⚠️ BLOQUEANTE — Seleção persistente ao trocar filtro. **Feito quando:** 3 trocas, contagem intacta.
- [ ] **E132** · "Selecionar todos os N resultados" com N do servidor (E058). **Feito quando:** não é a página atual.
- [ ] **E133** · Exclusões explícitas prevalecem. **Feito quando:** reaplicar público não traz de volta.
- [ ] **E134** · "N fora do filtro atual · seleção preservada". **Feito quando:** bate com a diferença real.
- [ ] **E135** · Salvar público — regra dinâmica vs lista estática, com aviso. **Feito quando:** tipo gravado.
- [ ] **E136** · Aplicar público — tamanho da regra ≠ aptos do envio. **Feito quando:** nunca o mesmo número.
- [ ] **E137** · Inspecionar contato — origem, destino, elegibilidade, motivo, empresa e papéis. **Feito quando:** popover mostra os 6.
- [ ] **E138** · Entrada por contexto (CRM 360 / Contatos) preservando escopo. **Feito quando:** funciona dos 2 módulos.

> **Portão F9:** E127, E131, E132 verdes.

---

## FASE 10 — Painel 02 · Composição (E139–E150)

- [ ] **E139** · Título sugerido (público + assunto), editável, opcional. **Feito quando:** dá para enviar sem nomear.
- [ ] **E140** · Bloco de texto com autosize e contador. **Feito quando:** sobrevive a reordenação.
- [ ] **E141** · Variáveis por botão + validação ao digitar. **Feito quando:** `{{telefone}}` acusa na hora.
- [ ] **E142** · Contador contra o limite real do adaptador (E051). **Feito quando:** acima bloqueia revisão.
- [ ] **E143** · Bloco Voz IA — voz autorizada + alternador único/personalizado. **Feito quando:** `{{nome}}` só entra por ação do usuário.
- [ ] **E144** · Player toca asset real (E109). **Feito quando:** duração do arquivo.
- [ ] **E145** · Bloco gravação (E111) — estado, tempo, refazer. **Feito quando:** falha de mic preserva o resto.
- [ ] **E146** · Bloco arquivo — upload real, validação. **Feito quando:** aparece na prévia e no envio.
- [ ] **E147** · Reordenação por teclado e arrastar. **Feito quando:** só teclado funciona.
- [ ] **E148** · Duplicar/remover com confirmação só com conteúdo; bloqueado durante gravação. **Feito quando:** aviso correto.
- [ ] **E149** · "N contatos × M blocos = N×M mensagens" sempre visível. **Feito quando:** nunca contatos = mensagens.
- [ ] **E150** · Autosave com indicador. **Feito quando:** fechar/reabrir preserva tudo.

> **Portão F10:** E141, E144, E149 verdes.

---

## FASE 11 — Painel 03 · Prévia, aptidão e confirmação (E151–E160)

- [ ] **E151** · Seletor de destinatário não altera composição. **Feito quando:** 10 trocas sem "alterado".
- [ ] **E152** · Bolhas = exatamente o que sai (texto, áudio real, arquivo). **Feito quando:** conferido contra o worker.
- [ ] **E153** · Motivo por status na prévia (texto de E044). **Feito quando:** não é genérico.
- [ ] **E154** · Painel de aptidão com os rótulos reais: Aptos / Sem destino WhatsApp / Suprimidos / Fora do escopo. **Feito quando:** soma bate com o banco.
- [ ] **E155** · Modal "quem entra" — motivo + ação por contato; exportar excluídos. **Feito quando:** lista copiável.
- [ ] **E156** · Modal de revisão — aptos, blocos, mensagens, versões de voz, consumo, fora. **Feito quando:** nenhum número ilustrativo.
- [ ] **E157** · ⚠️ BLOQUEANTE — Confirmação congela (E067) com aceite explícito. **Feito quando:** alterar depois derruba.
- [ ] **E158** · Anti duplo clique + idempotência. **Feito quando:** 5 cliques = 1 execução.
- [ ] **E159** · Agendamento real em `America/Sao_Paulo`. **Feito quando:** dispara sozinho.
- [ ] **E160** · 🔒 PARA — Envio de teste real (conta como mensagem; quem pode). **Feito quando:** política implementada e rotulada.

> **Portão F11:** E157, E158 verdes.

---

## FASE 12 — Monitor, histórico e retornos (E161–E170)

- [ ] **E161** · Monitor com progresso real (realtime/polling). **Feito quando:** reabrir mostra o correto.
- [ ] **E162** · Pausar/retomar/cancelar (E069). **Feito quando:** cancelar ≠ desfazer.
- [ ] **E163** · Detalhe por destinatário — estado, tentativas, erro, `external_id`. **Feito quando:** qualquer falha explicável.
- [ ] **E164** · Detalhe por bloco — parcial tem rótulo próprio. **Feito quando:** caso parcial visível.
- [ ] **E165** · Histórico com filtros e paginação. **Feito quando:** sem carregar tudo.
- [ ] **E166** · Repetir com inteligência — não respondidos / falhas corrigíveis / novos, sempre com nova revisão. **Feito quando:** nunca reenvia cego.
- [ ] **E167** · Exportação CSV/JSON respeitando escopo. **Feito quando:** outro departamento exporta zero.
- [ ] **E168** · Sala de retornos = visão filtrada do Chat via `crm_contact_links`; sem inbox novo. **Feito quando:** linha abre a conversa original.
- [ ] **E169** · Atribuição vinculada vs **inferida**, distintas na UI. **Feito quando:** visual diferente.
- [ ] **E170** · Criar tarefa a partir da resposta sem vazar conversa de outro fornecedor. **Feito quando:** teste confirma.

> **Portão F12:** E161, E168, E169 verdes.

---

## FASE 13 — Acessibilidade, responsivo e performance (E171–E178)

- [ ] **E171** · Fluxo inteiro por teclado. **Feito quando:** percorrido sem mouse.
- [ ] **E172** · Foco visível, trap e retorno nos modais. **Feito quando:** Escape devolve o foco.
- [ ] **E173** · Nomes acessíveis + `aria-live` em contadores/progresso/erros. **Feito quando:** leitor de tela anuncia.
- [ ] **E174** · Contraste AA nos estados semânticos. **Feito quando:** nenhum par < 4.5:1.
- [ ] **E175** · 1920×1080, 1440×900, 1024×1000, 390×844 sem rolagem horizontal. **Feito quando:** Playwright valida.
- [ ] **E176** · `prefers-reduced-motion`. **Feito quando:** onda de áudio parada.
- [ ] **E177** · Render isolado por linha na lista. **Feito quando:** profiler confirma.
- [ ] **E178** · `bundle-budget` e `performance-budget.json` verdes. **Feito quando:** CI.

> **Portão F13:** E171, E174, E175 verdes.

---

## FASE 14 — Testes, QA e observabilidade (E179–E188)

- [ ] **E179** · Unit elegibilidade + variáveis (8 classes, 4 placeholders). **Feito quando:** no `ci.yml`.
- [ ] **E180** · Unit idempotência + backoff. **Feito quando:** verdes.
- [ ] **E181** · Integração da fila contra banco de teste. **Feito quando:** confirma, drena, pausa, cancela, reconcilia.
- [ ] **E182** · `e2e/multiplix.spec.ts` no `e2e-logado.yml`. **Feito quando:** seleção, prévia, confirmação bloqueada, monitor.
- [ ] **E183** · Teste de escopo ponta a ponta (Singu + ZAPP): lista, contagem, histórico, mídia, export. **Feito quando:** os 5 cobertos.
- [ ] **E184** · Logs com `correlation_id` do clique ao webhook, sem conteúdo. **Feito quando:** 1 envio real rastreado.
- [ ] **E185** · Métricas: tempo de fila, falhas por tipo, latência de voz, consumo estimado × real, não conciliados, **conexão em risco (E004)**. **Feito quando:** cada alerta com ação e dono (`docs/runbooks/slo.md`).
- [ ] **E186** · `docs/runbooks/multiplix-incidentes.md` (fila travada, worker morto, TTS fora, conexão caída, consumo estourado, Singu indisponível). **Feito quando:** referenciado em `INCIDENT-RUNBOOK.md`.
- [ ] **E187** · `check-migration-drift` e `catalog` atualizados para as tabelas `multiplix_*`. **Feito quando:** `db-guard` verde.
- [ ] **E188** · Teste de degradação: Singu fora do ar → Multiplix mostra erro claro e não bloqueia o Chat. **Feito quando:** simulado e verificado.

> **Portão F14:** E182, E183, E184 verdes.

---

## FASE 15 — Rollout e fechamento (E189–E200)

- [ ] **E189** · Feature flag por departamento, desligável sem deploy. **Feito quando:** desligar esconde rota e nav.
- [ ] **E190** · Piloto Compras — fornecedores reais (145 contatos hoje), teto de destinatários e de voz. **Feito quando:** 5 envios reais revisados com o operador.
- [ ] **E191** · Piloto Logística — transportadoras (76 contatos). **Feito quando:** 3 envios reais revisados.
- [ ] **E192** · Ajustes do piloto (só o que os operadores apontaram). **Feito quando:** PRs mergeadas.
- [ ] **E193** · 🔒 PARA — Go-live para os demais departamentos. **Feito quando:** aprovado.
- [ ] **E194** · Monitorar 72 h com E185. **Feito quando:** métricas estáveis por 3 dias.
- [ ] **E195** · 🔒 PARA — Fechar o **GATE C**: revogar `GRANT EXECUTE ... TO anon` das 5 RPCs antigas do Singu após migrar as chamadas para a Opção A. **Feito quando:** `has_function_privilege('anon', …) = false` nas 5 e nada quebrou no Chat/CRM 360.
- [ ] **E196** · Atualizar `docs/crm-external-grants.md` com o estado final. **Feito quando:** mergeado.
- [ ] **E197** · Remover a feature flag do código (ou manter como kill switch — decidir). **Feito quando:** decisão aplicada.
- [ ] **E198** · `docs/multiplix/CHANGELOG_MULTIPLIX.md`, `COMPONENTES.md`, atualização de `docs/README.md`, `CHANGELOG.md` e `docs/COMPLETE_SYSTEM_FEATURES.md`. **Feito quando:** mergeado.
- [ ] **E199** · Handoff em `docs/handoffs/HANDOFF_MULTIPLIX_<data>.md` — o que ficou fora, dívidas, próximas evoluções (linguagem natural, pressão de contato, tarefas automáticas). **Feito quando:** mergeado.
- [ ] **E200** · Retro: comparar este plano com o executado; registrar desvios em `docs/audits/`. **Feito quando:** 200/200 marcados com evidência.

---

## Riscos (revisados)

| Risco | Impacto | Mitigação |
|---|---|---|
| Construir sobre a anon key do Singu (GATE C) | Base de 57k empresas exposta | E003 + E019 + E195 |
| Público pequeno por falta de contatos (145 fornecedores com pessoa) | Módulo "funciona" mas devolve pouco | E006 decide telefone da empresa |
| Tratar canal não oficial como Business Platform | Rótulos falsos, risco de ban | E004 + E078 ritmo + E185 alerta |
| Enviar sem consentimento registrado | Bloqueio e risco legal | E005 política + `talkx_blacklist` + E096 |
| Forkar `talkx-send` | Duas regras de envio divergentes | Fase 3 + E050 |
| Áudio único com nome do primeiro contato | Erro visível a dezenas | E062 + E107 |
| Reenvio cego após timeout | Cotação duplicada | E031 + E068 + E081 + E082 |
| Custo de voz descontrolado | Fatura ElevenLabs | E102 + E105 + E106 |
| "N contatos" = "N mensagens" | Volume 3× | E066 + E149 |
| Fila no navegador | Envio perdido | Fase 5 + E088 |
| Singu fora do ar derruba o ZAPP | Chat inoperante | E188 |

---

## Fluxo Git por fase

| Fase | Branch | Merge |
|---|---|---|
| F0 | `claude/chore-multiplix-descoberta-*` | Autônomo (docs) |
| F1 | `claude/infra-multiplix-ponte-singu-*` | **PR aberta** — DDL Singu + secrets |
| F2 | `claude/infra-multiplix-schema-*` | **PR aberta** — DDL ZAPP |
| F3 | `claude/chore-multiplix-shared-messaging-*` | Autônomo com E050 verde |
| F4 | `claude/feat-multiplix-api-*` | Autônomo |
| F5 | `claude/feat-multiplix-fila-*` | **PR aberta** se tocar cron/secrets |
| F6 | `claude/feat-multiplix-canal-*` | Autônomo (webhook = regressão obrigatória) |
| F7 | `claude/feat-multiplix-voz-*` | **PR aberta** — custo |
| F8–F13 | `claude/feat-multiplix-ui-<área>-*` | Autônomo com CI verde |
| F14 | `claude/chore-multiplix-testes-*` | Autônomo |
| F15 | `claude/infra-multiplix-rollout-*` | **PR aberta** |

Escrita no GitHub pelo `GITHUB - MCP - FOREVER`. Merge em `main` = deploy = produção.

---

## Progresso

```
Fase  0  [ ] 0/10     Fase  8  [ ] 0/10
Fase  1  [ ] 0/16     Fase  9  [ ] 0/14
Fase  2  [ ] 0/14     Fase 10  [ ] 0/12
Fase  3  [ ] 0/12     Fase 11  [ ] 0/10
Fase  4  [ ] 0/20     Fase 12  [ ] 0/10
Fase  5  [ ] 0/16     Fase 13  [ ] 0/8
Fase  6  [ ] 0/10     Fase 14  [ ] 0/10
Fase  7  [ ] 0/16     Fase 15  [ ] 0/12
                      TOTAL    [ ] 0/200
```

---

## Evidências desta revisão (26/09/2026)

- ZAPP `contacts`: 3.099 · `contact_type=cliente` 3.099 · `company` preenchida 0 · `state` 0 · `consent_status=unknown` 3.099 · `talkx_blacklist` 0.
- Singu `companies` ativas 57.675 · `is_supplier` 754 · `is_carrier` 114 · `is_customer` 55.813 · multi-papel 388 · `ramo_atividade` 50.698 (566 distintos) · `company_addresses` primários com UF 55.750.
- Singu `contacts` 4.748 · com `company_id` 2.945 · com WhatsApp 2.108 · `contact_phones` 3.141 (todos com `numero_e164`) · contatos de fornecedores 145 · de transportadoras 76 · `contact_preferences` 0 · `smart_segments` 4.
- `docs/talkx/ARQUITETURA.md`: ack via `evolution-webhook` (E87), resposta (E88), `pg_cron` `talkx-scheduler-1min`, `talkx_blacklist`.
- `docs/crm-external-grants.md`: 5 RPCs do Singu com `GRANT TO anon`, GATE C pendente.
- PRs abertas: #791, #802, #804, #805, #807 — sem colisão com o escopo.

---

## Adendo 26/09/2026 — após leitura de `talkx-send` e medições complementares

Não altera a numeração das etapas; ajusta o **como** de algumas. Detalhes em `docs/multiplix/CANAL.md` e `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md`.

1. **Fase 5 é parametrização, não construção.** `talkx-send` já implementa claim com lease (90 s), snapshot antes do POST, `outcome_unknown` em timeout (20 s), backoff 30 s/2 min/10 min com dead letter, supressão revalidada antes do POST, pausa por conexão perdida e janela de horário. E073–E088 passam a ser "extrair para `_shared/messaging/` (Fase 3) e apontar para `multiplix_*`", com as mesmas RPCs ou equivalentes de assinatura idêntica.
2. **E004 já tem modelo.** `talkx_settings` (`daily_limit_per_connection=500`, `default_speed_profile`, `reply_window_hours=72`, `optout_autoreply`) e os parâmetros de `talkx_campaigns` (5–15 s entre envios, 1,5–4 s de digitação) são a política única. O Multiplix acrescenta teto por envio (200), presença `recording` antes de PTT e "conexão em risco" (ADR-007 D2). Sem tabela nova.
3. **E091 fica mais estreito.** PTT via `sendWhatsAppAudio` → GO `type:'ptt'` está em produção com OGG (201 áudios enviados por agente, 41 entregues/lidos). Falta só testar o arquivo do ElevenLabs; hipótese: pedir `opus_48000_64` direto ao ElevenLabs. Roteiro em `CANAL.md` §5.
4. **E014 muda de ordem.** `contacts.last_interaction_at` do Singu está zerado; a regra de "cliente apto" usa mensagem recebida no ZAPP via `crm_contact_links` (ADR-007 D3). `/user/check` do GO valida destino e alimenta `company_phones.is_whatsapp` (ADR-007 D4).
5. **E020 / E007 — auth do operador.** `talkx-send` aceita só `admin`/`supervisor`. O Multiplix precisa de perfil de operador por departamento; a matriz de E007 tem de contemplar isso antes da Fase 4.
6. **E048 — vazamento existente.** `elevenlabs-tts` grava os 50 primeiros caracteres do roteiro no log. Corrigir ao reaproveitar em E103.
7. **Cobertura real (D4 da ADR-007):** fornecedores com pessoa + WhatsApp = 84/754; com telefone de empresa = 285. Sem telefone de empresa, Compras alcança 11%.
