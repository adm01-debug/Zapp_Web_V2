# Auditoria exaustiva do plano de excelência em 100 etapas

> **Data:** 2026-08-30 (America/Sao_Paulo)
> **Auditor independente:** Codex
> **Repositório:** `adm01-debug/Zapp_Web_V2`
> **Branch auditada:** `chore/excellence-wave-01`
> **HEAD auditado:** `6cab178accce1c10ae64bc0a2348fc869749f3c0`
> **Base / merge-base:** `origin/main` em `19b0f6448910bcb29ccd9ddd964f99a303a823b0`
> **Handoff canônico:** `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md`
> **Diário do Cline:** `docs/handoffs/cline_execution_log_2026_08_30.md`

## 1. Resultado executivo

**Veredito: NO-GO.** Não foram implementadas todas as melhorias. O Cline produziu, até o commit auditado, somente documentação de custódia/baseline: as etapas 001–004 possuem evidência suficiente; 005 continua bloqueada por Vercel/Evolution; 006 continua sem rotação/revogação comprovada; 007–100 não foram executadas pelo Cline.

A existência anterior de componentes, migrations, testes ou documentos não satisfaz automaticamente uma etapa. A auditoria separa:

- **CONFIRMADA:** critério de aceite reproduzido com evidência primária;
- **PARCIAL:** existe implementação útil, mas falta parte do contrato, teste, operação ou segurança;
- **FALHA:** existe implementação ou alegação, porém o critério falha objetivamente;
- **AUSENTE:** não foi encontrada implementação equivalente;
- **BLOQUEADA:** exige acesso, decisão ou ação externa não autorizada.

Placar independente do estado técnico atual:

| Estado | Quantidade |
|---|---:|
| CONFIRMADA | 4 |
| PARCIAL | 49 |
| FALHA | 24 |
| AUSENTE | 17 |
| BLOQUEADA | 6 |
| **Total** | **100** |

Este placar não é o progresso do Cline. No diário de execução, o progresso comprovado continua 001–004 `VERIFIED`, 005 `BLOCKED`, 006 `IN_PROGRESS` e 007–100 `NOT_STARTED`.

## 2. Escopo e método

Foram verificados diretamente:

- Git local, base remota, commits exclusivos, worktree, integridade e diff;
- os dois documentos de handoff e o prompt-mestre de auditoria;
- configuração de CI, proteção da `main`, CODEOWNERS, scripts e quality gates;
- `package.json`, lockfile, TypeScript, ESLint, Vitest, build Vite e artefatos `dist`;
- 1.199 arquivos TypeScript/TSX em `src`, 61 entradas de Edge Functions e 312 SQLs em toda a árvore de migrations;
- configuração JWT, autenticação, HMAC, CORS, rate limiting, SSRF e uso de service role nas funções de maior risco;
- documentação que declara “100% implementado”, inventários funcionais e relatórios anteriores de gaps;
- evidência read-only do GitHub. Nenhuma escrita remota, migration, deploy, rotação ou chamada mutável foi executada.

Limitações:

- o MCP Supabase disponível ao Codex respondeu `401`; o relato do Cline sobre PG 17.6 e ledger remoto é plausível, mas não foi reproduzido independentemente;
- Vercel não foi consultada com credencial autenticada; a credencial publicada na conversa não deve ser reutilizada;
- não havia acesso autenticado à VPS Hostinger/Evolution GO;
- não há Playwright/Lighthouse configurados para reproduzir fluxos reais ou Web Vitals de campo.

## 3. Reconciliação Git e alegações do Cline

| Alegação | Evidência independente | Veredito |
|---|---|---|
| Branch criada sobre `origin/main` | merge-base e `origin/main` = `19b0f644` | Confirmada |
| Branch possui apenas trabalho documental | diff contra `origin/main`: dois arquivos em `docs/handoffs/` | Confirmada |
| Instalação congelada não altera lockfile | `bun install --frozen-lockfile` retornou zero; worktree limpo | Confirmada |
| Diário contém 100 etapas canônicas | IDs/títulos reconciliados pelo Codex no commit `352021fc` | Confirmada após correção |
| Supabase oficial é PG 17.6 | consta no log do Cline; MCP do Codex retornou 401 | Não verificável de forma independente |
| Migrations conferem | o próprio log informa 16 versões remotas sem arquivo local; localmente há uma versão duplicada | Falsa como paridade; há drift bloqueante |
| Mutação de banco seria “Classe B+” | o handoff classifica produção/segredos/banco remoto como Classe D | Incorreta; corrigir para Classe D |
| Etapa 006 está praticamente concluída | ausência do segredo no Git foi provada, mas não houve rotação/revogação nem aceitação formal do risco | Parcial |
| Nenhuma ação externa foi executada | commits e diff são apenas locais/documentais | Confirmada para o escopo observável |

O branch está quatro commits à frente de `origin/main`, sem push e sem runs remotas para ele. `git diff --check` passou; `git fsck` mostrou apenas objetos dangling não referenciados, sem corrupção do histórico alcançável.

## 4. Baseline reproduzido

| Gate | Resultado | Interpretação |
|---|---|---|
| `bun install --frozen-lockfile` | PASS | instalação reproduzível na máquina atual |
| `node --test scripts/ci/*.unit.mjs` | 23/23 PASS | scripts de CI têm testes unitários |
| `node scripts/ci/lint-ratchet.mjs` | PASS, baseline/current 1.123 | impede novas ocorrências, mas preserva dívida muito alta |
| `bun run lint` | FAIL: 891 erros + 232 warnings | qualidade global não está verde |
| `bun run typecheck` | PASS | só passa porque `strict=false` e `noImplicitAny=false` |
| strict dry-run | FAIL: 146 erros TS | nullability e contratos ainda frágeis |
| `bun run test` | PASS: 2.493; 32 skipped; 152 arquivos | suíte relevante, porém emite warnings `act`, Router e mocks incompletos |
| `bun run test:contracts` | PASS: 160; 3 arquivos | boa base, cobertura de fronteiras ainda incompleta |
| `bun run test:coverage` | FAIL | falta `@vitest/coverage-v8` |
| `bun run build` | PASS | build não equivale a budget/performance aprovados |
| `bun audit --audit-level=high` | FAIL: 1 crítica + 43 altas | release bloqueada |
| guard de uso Supabase | PASS: zero violações novas | proteção estática útil |
| guard local de migrations | FAIL | prefixo `20260829100000` duplicado |

Medição do build auditado:

- JS+CSS: 7.864,63 KiB raw; 2.207,93 KiB gzip; 1.866,56 KiB Brotli;
- CSS inicial ligado no HTML: 205,59 KiB raw; todo o CSS: 243,19 KiB raw; budget inicial: 80 KiB;
- source maps: 23,02 MiB sem consumidor Sentry real;
- maior chunk: Mapbox 1.635,70 KiB contra budget de 200 KiB;
- chunks PDF e charts entram como `modulepreload` no HTML inicial, apesar da intenção de carregamento sob demanda;
- chunks relevantes: ElevenLabs/LiveKit 596,53 KiB, PDF 455,50 KiB, charts 442,03 KiB, UI 329,99 KiB, VoIP 237,06 KiB.

## 5. Achados bloqueantes por severidade

### 5.1 P0 — bloquear release e qualquer nova exposição

1. **Credenciais publicadas em conversa e ainda sem rotação comprovada.** O URL autenticado do MCP e uma credencial Vercel devem ser considerados expostos. O Git não contém os valores, mas o risco não termina com a ausência no repositório.
2. **Webhook Evolution aceita POST sem autenticação, assinatura, timestamp ou proteção de replay** e grava com service role. Um payload compatível pode acionar processamento privilegiado.
3. **Webhook WhatsApp usa fallback de token previsível e não valida `X-Hub-Signature-256`.** O fallback deve ser removido e a assinatura Meta deve ser obrigatória.
4. **Webhook Gmail não prova identidade Google/Pub/Sub.** Não valida OIDC, audience, subscription nem token de verificação antes de usar service role.
5. **API Evolution concentra dezenas de ações administrativas sob autenticação genérica.** Reiniciar/deletar instância, alterar webhook, proxy, bots e integrações não têm autorização por ação/role visível no handler.
6. **Drift de migrations bloqueante.** Há dois arquivos locais com o prefixo `20260829100000`; o Cline também relata 16 versões remotas sem arquivo local. Nenhum DDL/DML deve ocorrer até reconciliar o ledger.
7. **Supply chain fora do gate.** O audit acusa Vitest crítico, `xlsx` com prototype pollution/ReDoS e outras 43 altas; a CI usa `continue-on-error` no audit.

### 5.2 P1 — corrigir antes de chamar o produto de completo

1. **ElevenLabs webhook sem assinatura** e persistindo o body recebido em `audit_logs.details`, com risco de spoofing e retenção excessiva.
2. **Rate limiting não é distribuído.** O `Map` em memória reinicia em cold start e não coordena isolates.
3. **SSRF parcialmente mitigado, ainda explorável.** `fetch-link-preview` segue redirects sem revalidar o destino e não resolve/bloqueia DNS, IPv6, rebinding ou endereços especiais completos; `ai-transcribe-audio` faz fetch direto de URL informada pelo usuário.
4. **Funções privilegiadas sem autorização de negócio suficiente.** `webhook-diagnostic` possui `auto-fix`, `connection-health-check` altera estado e `batch-fetch-avatars` escreve em massa usando service role; o gateway JWT, quando presente, não substitui RBAC por ação.
5. **IDOR de conexão documentado e ainda presente nas migrations locais.** `get_connection_qr_code` e `get_connection_instance` são `SECURITY DEFINER` sem filtro de posse/role.
6. **Sentry é uma fachada.** O painel usa dados mockados e estado local; não há SDK, transporte, release, scrub de PII ou upload de source maps.
7. **CSP/headers do frontend ausentes.** `vercel.json` contém somente rewrite SPA. As Edge Functions têm headers compartilhados, mas há exceção com CORS `*`.
8. **API pública usa um token global em texto legível**, comparado diretamente e exibido/copiado no frontend administrativo. O rate limit é por isolate e `connectionId` não possui escopo por tenant/token.
9. **Fachadas de negócio podem induzir operação incorreta.** Links de pagamento não integram provedor/checkout; Meta CAPI não envia para Meta; Google Calendar não executa OAuth; n8n apenas simula; métricas de satisfação são aleatórias.
10. **LGPD está incompleta.** Portabilidade é bloqueada e “exclusão” apenas registra um evento de auditoria, sem workflow, status, SLA, legal hold, execução ou prova de anonimização/exclusão.

### 5.3 P2/P3 — dívida de engenharia e produto

- 1.123 ocorrências ESLint, 146 erros strict, 572 ocorrências textuais de `any`, 59 supressões TS, 17 disables ESLint e 5 marcadores TODO/FIXME/HACK no escopo `src/supabase/tests`;
- coverage indisponível; nenhum E2E; nenhum gate Lighthouse; axe existe apenas em desenvolvimento;
- Web Vitals manual mede FID obsoleto e INP de forma incorreta, mantém buffer em memória e não envia RUM;
- PWA está desativada no Vite, `public/sw.js` não existe e documentos ainda declaram PWA completa;
- ADRs têm IDs duplicados; documentação descreve React 18/Vite 5, 19 Edge Functions e “100% completo”, enquanto o código usa React 19/Vite 8 e tem 61 funções;
- `COMPLETE_SYSTEM_FEATURES.md` contém 68 caminhos hoje inexistentes; 27 parecem arquivos movidos e 41 não têm arquivo com o mesmo basename;
- ownership está concentrado em uma única conta; a proteção da `main` exige só lint/typecheck, unit e build, com zero aprovações obrigatórias e sem contratos/DB/security/budget;
- backup, runbooks e LGPD têm documentação, mas restore/game day/alerta não foram exercitados;
- observabilidade, DORA, SLO, custo e release canary não possuem evidência operacional.

## 6. Matriz de autenticidade funcional

Esta matriz passa a ser obrigatória. “Existe componente/tabela” não significa “funciona ponta a ponta”.

| Área | Estado real | Evidência e lacuna para concluir |
|---|---|---|
| Auth/RBAC/MFA/WebAuthn | PARCIAL | há código, migrations e testes; falta E2E por papel/tenant e continuam gaps SQL/Edge de autorização |
| Inbox/mensagens/realtime | PARCIAL | fluxo amplo e testes unitários; falta E2E com Evolution, concorrência, retry e isolamento de sessão |
| IA/transcrição | PARCIAL | Edge Functions e schemas existem; rate limit é local, SSRF permanece e não há budget/custo/telemetria real |
| Sentry | FALHA/FACHADA | UI mockada, sem SDK/backend; source maps de 23 MiB continuam gerados |
| n8n | FALHA/FACHADA | conexão/workflows ficam em `useState`; teste espera 1,5 s e sempre retorna sucesso |
| Google Calendar | AUSENTE | botão apenas informa que OAuth precisa ser configurado; configurações não persistem nem sincronizam |
| Bitrix24 | PARCIAL | Edge chama a integração real, mas campos URL/domínio da UI não são salvos/usados; autorização é genérica |
| Satisfação CSAT/NPS | FALHA PARCIAL | existe NPS baseado em tabela, mas `SatisfactionMetrics` exibe números fixos e série aleatória |
| Links de pagamento | FALHA/FACHADA | cria URL local `/pay/<id>` sem rota de checkout, provedor, webhook, idempotência ou conciliação |
| Meta CAPI | FALHA PARCIAL | grava eventos em tabela, mas nenhum código envia ao Graph/Meta ou atualiza `sent_to_meta` |
| LGPD | FALHA PARCIAL | exportação bloqueada; pedido de eliminação vira só audit log sem workflow de atendimento |
| Exportação automática | FALHA/BLOQUEADA | módulo navegável mostra “Funcionalidade Desabilitada”; backend de relatório agendado existe separadamente |
| PWA/Web Push | FALHA | plugin importado mas desabilitado; service worker documentado não existe; hooks aguardam `serviceWorker.ready` |
| Automações genéricas | PARCIAL | CRUD/configuração existem; nenhum executor de `automations.trigger_type/actions` foi localizado |
| Campanhas clássicas | PARCIAL | CRUD/contatos/status existem; não foi localizado worker que envie a campanha clássica; TalkX é outro subsistema |
| TalkX | PARCIAL AVANÇADA | scheduler/sender existem; falta autenticação por role, prova E2E, idempotência e operação na VPS |
| Chatbot/flows genéricos | PARCIAL | CRUD visual existe; `chatbot-l1` cobre configuração específica, não prova execução de todos os triggers do builder |
| WhatsApp Flows | PARCIAL | editor persiste rascunho local; não publica na Meta/Evolution nem envia/recebe submissões |
| API pública | PARCIAL INSEGURA | ação `send` existe; token global plaintext, escopo amplo, rate limit local e dashboard sem logs garantidos |
| Diagnósticos/monitoramento | PARCIAL INSEGURA | telas e checks existem; ações mutáveis usam service role e podem ser acionadas sem RBAC granular |
| VoIP | PARCIAL | SIP.js e histórico existem; configuração fica em localStorage, defaults são hardcoded e falta E2E/provisionamento seguro |
| Relatórios agendados | PARCIAL | tabela/hook/Edge existem; scheduler, autorização, entrega e dados reais não foram provados |
| Acessibilidade | PARCIAL | componentes e axe em DEV existem; nenhuma prova WCAG 2.2 AA, screen reader ou teclado ponta a ponta |
| Performance | PARCIAL/FALHA | lazy routes e virtualização existem; budgets falham e dependências pesadas são preloaded |
| Documentação funcional | FALHA | declarações de 100% e vários caminhos/contagens estão desatualizados ou incorretos |

## 7. Validação das 100 etapas

| ID | Estado | Evidência atual e correção necessária |
|---:|---|---|
| 001 | CONFIRMADA | regras e limites foram lidos; manter registro sem segredos |
| 002 | CONFIRMADA | branch/base/merge-base corretos e sem descarte |
| 003 | CONFIRMADA | Node 24/Bun 1.4 reproduzidos; divergência `.nvmrc` fica para 014 |
| 004 | CONFIRMADA | 100 IDs/títulos reconciliados; diário corrigido pelo Codex |
| 005 | BLOQUEADA | GitHub confirmado; Supabase só alegado pelo Cline; Vercel/Evolution sem identidade autenticada completa |
| 006 | PARCIAL | segredo ausente no Git, mas MCP e Vercel precisam de rotação/revogação formal |
| 007 | PARCIAL | GitHub secret scanning/push protection existem; falta inventário por nome/owner/ambiente e scanner local/histórico |
| 008 | PARCIAL | baseline técnico foi reproduzido nesta auditoria; faltam duração estruturada, artefato do Cline, browser e DB remoto |
| 009 | PARCIAL | bytes raw/gzip/brotli e preloads medidos; faltam Lighthouse, waterfall, três execuções e cache frio/quente |
| 010 | FALHA | prefixo local duplicado e relato de 16 remote-only; classificar hashes/ledger antes de qualquer SQL |
| 011 | PARCIAL | audit reproduzido; falta backlog estruturado com pacote raiz, explorabilidade, owner, decisão e prazo |
| 012 | FALHA | permanecem 44 vulnerabilidades altas/críticas |
| 013 | PARCIAL | `xlsx` está separado do entry, mas continua vulnerável e sem prova de limites/fixtures hostis/isolamento |
| 014 | FALHA | `.nvmrc=20`, CI=24; faltam `packageManager` e `engines` |
| 015 | FALHA | coverage não inicia por dependência ausente |
| 016 | FALHA | audit continua `continue-on-error`; não há ratchet de vulnerabilidade |
| 017 | PARCIAL | proteção GitHub existe, mas a CI ainda usa grep e não scanner fail-closed testado |
| 018 | FALHA | budget JSON não é executado e os limites atuais são excedidos |
| 019 | PARCIAL | actions estão pinadas, com timeouts/concurrency; falta comparação p50 e cadeia completa de gates |
| 020 | PARCIAL | `main` é protegida, porém só 3 checks, zero review obrigatório e CODEOWNERS não exigido |
| 021 | PARCIAL | unit/contract configs separados; falta taxonomia completa, DB/E2E e prova de globs |
| 022 | FALHA | suíte ainda emite warnings `act(...)` e não os transforma em falha controlada |
| 023 | PARCIAL | há muitos mocks, mas persistem retornos incompletos e dependência de comportamento implícito |
| 024 | AUSENTE | coverage por risco não pode ser produzido enquanto 015 falha |
| 025 | AUSENTE | não há coverage ratchet |
| 026 | PARCIAL | existem testes de auth/MFA, sem matriz E2E de sessão, RBAC, cache e troca de usuário |
| 027 | PARCIAL | 160 contratos passam; são 3 arquivos, 39 schemas centrais e apenas 30/61 handlers usam `parseBody` |
| 028 | PARCIAL | guards offline existem; falta banco efêmero que aplique todas as migrations e teste RLS/grants |
| 029 | AUSENTE | Playwright/Cypress não configurado |
| 030 | PARCIAL | axe roda só em DEV e não cobre fluxos de CI |
| 031 | PARCIAL | esta auditoria mediu 146 erros strict; falta mapa versionado por domínio/owner |
| 032 | AUSENTE | não há ilhas strict nem ratchet TypeScript |
| 033 | PARCIAL | workflow `types-sync` e guardas existem; drift de migrations invalida confiança total |
| 034 | FALHA | 572 ocorrências textuais de `any`; fronteiras críticas ainda usam `any` |
| 035 | FALHA | strict evidencia nullability e contratos inconsistentes |
| 036 | PARCIAL | lint ratchet e baseline existem; classificação/limpeza por categoria não foi concluída |
| 037 | FALHA | dívida continua exatamente no baseline de 1.123 ocorrências |
| 038 | AUSENTE | `graphify-out` não existe; ciclos/god modules não foram medidos |
| 039 | PARCIAL | rotas lazy e pastas por domínio existem; faltam regras de dependência e APIs públicas verificadas |
| 040 | FALHA | ADRs possuem IDs duplicados e documentos se contradizem |
| 041 | PARCIAL | mapa de peso foi medido, sem top 20 por rota/owner nem visualizador reproduzível |
| 042 | PARCIAL | rotas são lazy, mas PDF/charts são preloaded e entry/budgets não convergiram |
| 043 | FALHA | CSS inicial ligado no HTML 205,59 KiB raw (243,19 KiB total) contra 80 KiB |
| 044 | PARCIAL | chunks manuais existem; preloads contradizem on-demand e Mapbox continua com 1,6 MiB |
| 045 | PARCIAL | virtualização e chunk de ícones existem; falta profiling real e auditoria das listas críticas |
| 046 | FALHA | source maps 23 MiB, sem Sentry real/upload/remoção |
| 047 | FALHA | telemetria manual não implementa INP corretamente e não possui RUM sink |
| 048 | PARCIAL | defaults React Query centralizados; falta waterfall, deduplicação e política por domínio |
| 049 | PARCIAL | há componentes a11y e axe DEV; falta auditoria manual WCAG 2.2 AA |
| 050 | AUSENTE | Lighthouse CI e matriz responsiva não existem |
| 051 | PARCIAL | inventários antigos existem, mas estão desatualizados e não formam trust-boundary matrix das 61 funções |
| 052 | FALHA | seis exceções JWT estão listadas, mas quatro webhooks públicos falham autenticação/assinatura |
| 053 | FALHA | Evolution valida shape, não autenticidade/replay/idempotência segura na borda |
| 054 | FALHA | Gmail/WhatsApp/ElevenLabs têm spoofing; cron usa comparação simples; public API tem token global |
| 055 | AUSENTE | rate limiter é `Map` por isolate |
| 056 | PARCIAL | schemas centrais cobrem parte das funções; status/envelopes/fuzz não são uniformes |
| 057 | PARCIAL | allowlist compartilhada é útil; há wildcard e métodos inconsistentes fora dela |
| 058 | FALHA | redirects/DNS/IPv6/rebinding e fetches de mídia externos não estão fechados |
| 059 | FALHA | 42 funções usam service role; autorização por ação/tenant e redaction não foram provadas |
| 060 | PARCIAL | Edge headers existem; Vercel/CSP/frontend não |
| 061 | FALHA | drift local/remoto bloqueia resolução segura |
| 062 | PARCIAL | scripts de catálogo/tipos/drift são bons, mas o guard de migration já falha |
| 063 | PARCIAL | existem RLS e auditorias históricas; falta matriz atual positiva/negativa no banco canônico |
| 064 | PARCIAL | houve hardening anterior, mas IDOR/órfãs/grants residuais seguem documentados e o remoto não foi revalidado |
| 065 | AUSENTE | não há top 10 atual por `pg_stat_statements` com owner/causa/plano |
| 066 | AUSENTE | ADR propõe cache; tempestade não foi medida/corrigida/provada |
| 067 | PARCIAL | índices e EXPLAINs históricos existem; falta medição atual e regressão automatizada |
| 068 | PARCIAL | muitos subscriptions fazem cleanup; publication/replica identity/lifecycle completos não foram provados |
| 069 | PARCIAL | política e jobs existem; falta inventário integral, legal hold, dry-run e prova de execução |
| 070 | BLOQUEADA | há estratégia de backup, sem restore sanitizado e RPO/RTO medidos |
| 071 | PARCIAL | logger/tabelas de telemetria existem; arquitetura, backend, custo e ownership não estão aprovados |
| 072 | PARCIAL | request ID local existe; não é propagado ponta a ponta como correlation/causation ID |
| 073 | FALHA | ErrorBoundary existe, mas transporte/release/scrub de erros frontend não |
| 074 | PARCIAL | algumas Edges têm Logger estruturado; não há métricas RED/spans/exportador comum |
| 075 | BLOQUEADA | telas/health checks locais não substituem métricas autenticadas da VPS/containers/backups |
| 076 | PARCIAL | há `webhook_failures`/DLQ e peças de idempotência; replay autenticado e cenários de crash não foram provados |
| 077 | AUSENTE | SLO/SLI/burn-rate/alertas acionáveis não foram implementados |
| 078 | PARCIAL | runbooks existem; estão desatualizados e não passaram tabletop |
| 079 | AUSENTE | nenhum game day controlado comprovado |
| 080 | PARCIAL | template de post-mortem existe; DORA não está instrumentado |
| 081 | PARCIAL | guards de identidade de DB existem; matriz completa de ambientes e anti-fallback ainda não |
| 082 | AUSENTE | preview isolado, seeds determinísticos e bloqueio de integrações reais não foram provados |
| 083 | PARCIAL | CI/proteção/rewrite existem; identidade Vercel, headers, smoke, promoção e rollback não foram provados |
| 084 | PARCIAL | deploy Edge é manual e tem guards; drift e falta de canary/smoke impedem aceite |
| 085 | BLOQUEADA | documentação Evolution existe; versão/host/container/backup/restore não foram verificados |
| 086 | PARCIAL | existem nomes de secrets e GitHub scanning; credenciais expostas e ciclo de rotação continuam abertos |
| 087 | AUSENTE | não há budgets/forecasts/alertas de custo multi-plataforma |
| 088 | FALHA | documentação afirma “100%”, PWA/Sentry/integrações que não existem e contagens obsoletas |
| 089 | PARCIAL | CODEOWNERS existe, mas só há um owner e falta RFC/review por risco |
| 090 | PARCIAL | há README/env examples; toolchain diverge e não há setup DB/E2E limpo comprovado |
| 091 | FALHA | PWA está simultaneamente documentada, dependenciada e desativada; service worker ausente |
| 092 | AUSENTE | matriz real de browsers/dispositivos/rede não existe |
| 093 | PARCIAL | modular monolith é o desenho observado, sem ADR atual baseado em métricas/ownership |
| 094 | PARCIAL | schemas versionados e contract tests existem; falta política/OpenAPI/contract diff/deprecação |
| 095 | BLOQUEADA | nenhum exercício DR ponta a ponta em ambiente isolado |
| 096 | AUSENTE | candidato imutável não existe e vários gates estão vermelhos/ausentes |
| 097 | FALHA | há P0/P1 abertos, facades, disables, dívida e claims falsos |
| 098 | AUSENTE | não há candidato congelado nem sign-off |
| 099 | BLOQUEADA | exige aprovação Classe D e depende de 098; não executar agora |
| 100 | AUSENTE | relatório final só pode existir após fechamento/decisão formal das anteriores |

## 8. Revisão obrigatória da ordem de execução

A ordem numérica continua sendo a fonte de rastreabilidade, mas o risco descoberto exige este **override de prioridade**:

1. **Custódia:** concluir 005–010, rotacionar as duas credenciais expostas e classificar o drift.
2. **Hotfix de segurança em branch/PR separado:** 052–060, começando por Evolution, WhatsApp, Gmail, ElevenLabs, RBAC do `evolution-api`, funções service-role e SSRF.
3. **Supply chain/CI:** 011–020, impedindo que vulnerabilidades, secrets e budgets piorem.
4. **Banco/autorização:** 061–064, incluindo IDOR das conexões e testes RLS negativos. Nenhuma aplicação sem aprovação Classe D.
5. **Confiança de mudança:** 021–040, coverage, E2E, strict, lint e arquitetura.
6. **Verdade funcional:** executar a matriz da seção 6; remover/ocultar facades ou implementar backend real com testes.
7. **Performance/WCAG:** 041–050 somente com medição automatizada.
8. **Observabilidade/operação/deploy:** 065–095.
9. **Release:** 096–100 somente quando zero P0, exceções P1 aprovadas e todos os gates obrigatórios estiverem verdes.

## 9. Critério novo: Definition of Done funcional

Uma funcionalidade só pode ser marcada `VERIFIED` quando houver, no mínimo:

1. rota/UI acessível somente ao papel correto;
2. persistência real ou integração real — não apenas `useState`, timeout, mock ou toast;
3. autorização no servidor, tenant scoping e RLS, quando aplicável;
4. schema de entrada/saída e tratamento de erro;
5. happy path, entrada inválida, sem auth, role incorreta, duplicata/retry e dependência indisponível;
6. teste de componente/contrato e E2E proporcional ao risco;
7. logs/métricas sem PII/segredos;
8. rollback/kill switch para integrações externas;
9. documentação compatível com o comportamento observado;
10. evidência em commit/CI/ambiente ligado ao mesmo SHA.

Se a intenção for apenas protótipo, o módulo deve ser rotulado `DEMO`, não aparecer como “Disponível” em produção e nunca exibir números simulados como métricas reais.

## 10. Ações que dependem do proprietário

1. Revogar/rotacionar o token do MCP e a credencial Vercel expostos em chat; fornecer ao Cline apenas os substitutos pelo mecanismo seguro do provedor.
2. Confirmar acesso read-only autenticado ao projeto Vercel e à VPS Hostinger para fechar 005/075/083/085.
3. Autorizar separadamente qualquer migration, rotação, deploy, alteração de proteção remota, restart ou game day. Essas ações são Classe C/D; banco/produção/segredos são Classe D.
4. Decidir produto para cada fachada: **implementar**, **ocultar/remover** ou **rotular DEMO**. A recomendação é ocultar imediatamente Sentry, n8n, Google Calendar, pagamento e Meta CAPI até haver backend real.

## 11. Recomendação objetiva ao Cline

- Não avançar como se 005/006 estivessem fechadas.
- Não aplicar SQL enquanto 010/061 estiverem em falha.
- Não usar a credencial Vercel publicada na conversa.
- Não alterar `main`, publicar branch ou fazer deploy sem autorização explícita.
- Criar PRs separados para: custódia/docs, segurança de webhooks, supply chain, drift/DB, testes/quality, performance/a11y e verdade funcional.
- Atualizar o diário em duas colunas independentes: `ESTADO_DA_EXECUCAO` e `ESTADO_DA_IMPLEMENTACAO`.
- Anexar evidência primária por etapa; relato textual ou existência de arquivo não basta.

Até que os P0 sejam fechados, o estado correto do programa é **NO-GO PARA MERGE, DEPLOY E BANCO**.
