# Anexo — todas as branches, uma a uma

Anexo do `RELATORIO-SESSAO-261115-261116.md`. Gerado dos dados da auditoria
(`auditoria/bruto/vereditos-finais.json`) e do estado do `origin` em 16/11/2026.

**Os resumos estão completos, sem corte.** Numa versão anterior deste material eu truquei
146 pareceres em 160 caracteres com um script meu; aqui não há `slice`.

---

## Parte A — As 288 branches que existem hoje no `origin`

- **281** foram auditadas (veredito e resumo abaixo);
- **7** não entraram na auditoria, e cada uma tem motivo:

### A.1 — As que não foram auditadas, e por quê

| Branch | Último commit | Por que não foi auditada |
|---|---|---|
| `automation/types-sync` | 2026-11-15 `556547903` | Branch de automação do `types-sync`; 3 PRs já mergeadas a partir dela (#44, #55, #60). |
| `claude/docs-trilha-auditoria-261116-0940` | 2026-11-16 `b5211e693` | Criada **nesta sessão** — PR #3162 (trilha da auditoria, ferramentas, handoff e este relatório). |
| `claude/feat-copilot-tick-transacao-261116-0115` | 2026-11-16 `04cab2193` | Criada **nesta sessão** — PR #3160 (`commit_copilot_tick`), aberta pela regra 8. |
| `claude/feat-copiloto-edges-261115-1555` | 2026-11-15 `8ea3e73f7` | Criada **nesta sessão**. É a branch da **PR #3146, que eu recusei e fechei**: o cálculo de merge do GitHub mostrava que ela apagaria 7.945 linhas de trabalho do mesmo dia. As 10 linhas que de fato faltavam foram reconstruídas como PR #3155, já mergeada. A branch continua viva, sem PR aberta, e **pode ser apagada** — seu conteúdo útil está na `main`. |
| `claude/fix-copilot-rls-supervisor-261116-0105` | 2026-11-16 `3fc22c050` | Criada **nesta sessão** — PR #3158 (RLS de supervisor do Copiloto), aberta pela regra 8. |
| `contexto` | 2026-11-16 `efd6cb025` | Branch **gerada** por automação (`.github/workflows/contexto.yml`), regenerada a cada 10 min. Nunca se edita nem se abre PR dela. |
| `main` | 2026-11-15 `b7c27b00b` | Ramo principal. |

### A.2 — As 281 auditadas que continuam vivas

`apagar` é a recomendação da auditoria, **não uma ação executada**: nenhuma branch foi
apagada nesta sessão. A coluna PR marca as que têm PR aberta agora.

#### Perda total — 5 branches

**`claude/chore-secdef-guard-ci-test-261107-1600`** — 2026-11-07 `afeba2d3b`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Teste de contrato (bash + Postgres descartável) que prova que as RPCs de gamificação update_agent_streak e increment_agent_resolutions usam o guard de segurança canônico (service_role passa, anon e usuário alheio negados). A correção que ele protege (migration 20261107153000, PR #2766) está na main e aplicada em produção, mas o teste não entrou em nenhum lugar — regressão futura nesse guard não seria pega pelo CI.

**`claude/fix-ga-fase1-lote-banco-261020-2200`** — 2026-10-20 `19c48a20c`  
<sub>verificada · 8 lacuna(s) · **apagar: não**</sub>

Fase 1 do plano GA (lote banco): GA19 cria exit 3 exclusivo para "só apply pendente" em check-migration-drift/lote-pendente e nos workflows db-live-guard e types-sync, devolvendo exit 2 a "só erro de infra"; GA18 confina o -f dos contratos de runtime ao repo; GA26 (prepare) adiciona --json. Nada disso está na main: hoje o drift script nem tem --classificar nem exit 3 (removido no lote 880 em 2026-10-16), então uma falha de autenticação/conexão com o ledger (exit 2) vira "apply pendente" verde no push do db-live-guard e awaiting_apply=true no types-sync (fail-open), enquanto apply pendente legítimo sai 1 e é tratado como drift real. Triagem anterior "OBSOLETA" refutada.

**`claude/fix-talkx-segmentos-regressao-261101-1944`** — 2026-11-01 `d8eb518aa`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

PR #2535 restaurava na biblioteca de segmentos do Talk X o que o squash #2240 apagou: painel "Detalhes do segmento" completo (↻ no cabeçalho com estado "contando", todos os critérios por extenso sem corte em 5, "Criado em", "Amostra de contatos"), cartão da grade com descrição e alternância lista/grade ligada ao hook, Esc/✕ devolvendo o foco também ao cartão da grade, e o typo visível `font--semibold` (nome do cartão sem negrito). Foi fechada só pelo congelamento de features (#2545), nunca mergeada, e nada disso chegou à main: hoje a main ainda tem o typo (L514), o corte `slice(0,5)` (L782), foco só na linha da tabela (L58/L536), `viewMode` do hook sem consumidor e sem "Criado em"/"Amostra". Valor médio (UX/a11y de tela não crítica). Ao portar: manter o retorno antecipado de is_set/is_empty do describeRule da main (bug apontado pela review), descartar o helper teclaDe (lint já resolvido) e preservar o '—' de estimativa nula (#2826).

**`claude/w21-classificar-migration-drift`** — 2026-11-01 `1b904f6a1`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

A branch cria o modo `--classificar`/`--json` do check-migration-drift, que separa "migration no disco ainda sem apply" (exit 2, neutro) de drift real (exit 1). A main NÃO tem esse flag, mas já tem o consumidor dele: `lote-pendente.mjs:49` chama `check-migration-drift.mjs --classificar` e o `db-live-guard.yml:152` e o `types-sync.yml:339` dependem do exit 2. Como a main nunca devolve 2 para apply-pendente, o guard de banco abre alerta de drift falso a cada lote mergeado antes do apply e o types-sync roda os gates de TypeScript contra schema não aplicado. O contrato de CI do banco está quebrado na main e a correção está só nesta branch. Triagem anterior ("DUPLICATA_PROVAVEL") estava errada.

**`codex/consolida-docs-deploy-ga98`** — 2026-10-28 `dc65649ad`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Endurece o gerador de docs do CI (scripts/ci/render-workflow-docs.mjs): descrição longa de item "nao-e-bug" quebrada em duas linhas passaria a ser concatenada em vez de descartada em silêncio; exporta o parser e adiciona teste unitário. Nenhum workflow da main usa descrição multilinha hoje, então é proteção futura, sem efeito em produto, WhatsApp, inbox ou banco. Nada do trabalho está na main; aplica limpo.


#### Perda parcial — 51 branches

**`claude/busy-cannon-40szm9`** — 2026-11-02 `0e112bccb`  
<sub>verificada · 8 lacuna(s) · **apagar: não**</sub>

Sessão de análise das PRs abertas de 01-02/11: 152 dos 162 arquivos são relatórios/dossiês em analise-prs/ sobre PRs #2100-#2606 que já não existem (a main reescreveu analise-prs/ com dossiês de #2811-#2970) e 2 seções de PENDENCIAS.md sobre a PR #2494, já fechada e com o arquivo inteiro reescrito na main. Os 6 ajustes em src/ estão obsoletos, superados ou sem efeito nenhum. Sobra uma única lacuna real de valor baixo: 2 linhas de guarda no script de container de teste do banco (scripts/db-audit/docker-shim) para não tentar dropar roles built-in do PostgreSQL. Nada de WhatsApp, inbox, envio, contatos ou login é afetado.

**`claude/charming-mccarthy-jbxy56`** — 2026-11-01 `0191895b8`  
<sub>verificada · 13 lacuna(s) · **apagar: não**</sub>

Lote 1 do plano "GitHub Actions 100 etapas" (GA01-GA92) + onda de a11y e correção de testes. A maior parte entrou na main por outras PRs (tokens AA de cor, safe-area mobile, cache de bun/Playwright, dependabot docker, notifica-falha-main, guarda do CLAUDE.md). Sobraram 7 itens de CI/CD que nunca foram mergeados, dois deles com impacto real: (1) relatórios/traces do E2E publicados no CI continuam podendo conter o JWT do usuário de teste, porque a redação automática de JWT (GA38) não está na main; (2) o deploy de edge functions publica sem rodar os 229 testes .test.ts de supabase/functions (GA27), e o rollback automático pode "reverter para o próprio SHA que acabou de falhar" (GA30), inutilizando o caminho de recuperação. Além disso o teardown do E2E não revoga as sessões do usuário de teste (GA39) e o coletor de KPI pode furar o limite de 1 000 req/h da API do GitHub (GA92). O resto da branch é obsoleto ou nocivo: o health-check foi reescrito na main com outro endpoint, e vários testes da branch enfraquecem asserções que a main mantém, removem um método que existe (cancelScroll) ou trazem uma regex corrompida. As marcações de "concluído — PR #2537" no plano e no P006.json são falsas: a PR não foi mergeada.

**`claude/chore-plano-E19-E20-E21-261101-1740`** — 2026-11-01 `40f7bb3d3`  
<sub>verificada · 6 lacuna(s) · **apagar: não**</sub>

Branch 100% documentação: marcava as etapas E19/E20/E21 do plano de auditoria do GitHub Actions como concluídas e propagava isso para o pacote de reconciliação. As três afirmações são verdadeiras na main de hoje (o types-sync.yml tem o Gate 3 por objetos, o dedupe de 6h e o filtro head_branch), mas a main ainda mostra as três como pendentes — ou seja, o relatório de auditoria mente sobre o próprio progresso. Efeito prático: nenhum, só a confiabilidade do painel de etapas. A ponta da branch está corrompida (um commit truncou o plano de 975 para 18 linhas), então ela só serve pelo commit c6ddabeac. A nota adicionada ao CONTRIBUTING.md ficou obsoleta: descreve um workflow que a main apagou em 14/11.

**`claude/confident-bardeen-ndq0ch`** — 2026-10-23 `229e32a7f`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch de conserto de CI (PR #2195, 35 commits de 2026-10-23): mocks de testes do chat, canal Realtime estável no chat de equipe, fila offline limpa no logout, ARIA do command-palette, fail-closed de real_sector/real_uf no Talk X, remoção do hook morto useTalkXSuppression e erro RLS sanitizado no painel de reset de senha. Tudo já está na main (mesma intenção, forma refatorada) ou ficou obsoleto (main adotou `ponteOnly` e mantém Promise.all como fail-closed), exceto um detalhe: o painel de reset de senha na main não reconhece HTTP 403 pelo status (só por código 42501/fragmentos de mensagem), então um admin não autorizado vê o texto cru em inglês da edge em vez da mensagem padrão de acesso negado. Valor baixo (UX de mensagem, sem vazamento).

**`claude/docs-g9-absorb-261019-1300`** — 2026-10-23 `f1b53effa`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch somente-docs (3 planos, +2036 linhas, zero código). Dois arquivos já estão na main — e no caso do plano do banner superior a main tem a versão mais nova (encerrada, com matriz de aceite preenchida), enquanto a branch traz o texto antigo "execução pendente", ou seja, portá-la seria regressão. O único trabalho realmente perdido é o arquivo docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md (741 linhas), um backlog técnico de 190 etapas em 9 fases (segurança, banco, edge functions, TS strict, testes, CI, performance, qualidade, docs) que nunca entrou na main e não tem equivalente lá. Impacto no produto: nenhum hoje — é documentação. Parte do plano já foi resolvida por outros caminhos (Dependabot e bun audit no CI já existem; os PRs #2091–#2095 que ele mandava mergear estão fechados), parte continua pendente (shared modules de edge functions, docs de segurança). Não apagar a branch antes de salvar esse arquivo ou o dono decidir descartá-lo.

**`claude/feat-completar-c121-261101-1330`** — 2026-11-01 `4d77db544`  
<sub>verificada · 14 lacuna(s) · **apagar: não**</sub>

Pausa de envios por instância de WhatsApp (C121). O banco já tem tudo em produção (tabela instance_pauses + RPCs pause_instance/resume_instance/is_instance_paused/auto_pause_instance, todas confirmadas por consulta), e os motores de campanha/entrega da main já respeitam a pausa. O que ficou de fora: (1) o operador não tem botão nenhum para pausar ou retomar os envios de um número — a main só lista pausas e permite marcá-las como investigadas; (2) a edge evolution-api é a única rota de envio que não consulta a pausa; (3) a auto-pausa de 30 min quando o provedor devolve 429 (limite de envio) não tem chamador em lugar nenhum — a função existe no banco e é código morto, então o sistema continua insistindo num número já bloqueado pelo provedor, o que é risco direto de ban. A PR #2469 foi fechada pelo congelamento de features (#2545), não por duplicidade: a triagem de 08/11 marcou DUPLICATA_PROVAVEL e isso está errado.

**`claude/feat-completar-c121-ddl-261101-1345`** — 2026-11-01 `edad6a6f5`  
<sub>verificada · 1 lacuna(s) · **apagar: não**</sub>

Investigação de incidentes de pausa de instância de WhatsApp (C121/IP2): 3 colunas em instance_pauses + 3 CHECKs + RPC mark_pause_investigated restrita a admin/supervisor com auditoria. A migration entrou na main byte-idêntica (só renumerada) e está aplicada em produção, com painel e service já na main. Perdida apenas a suíte de teste SQL que prova a fronteira de autorização, os CHECKs e a auditoria com papéis reais — nenhum equivalente existe na main.

**`claude/feat-copiloto-cv011-020-migrations-261016-1930`** — 2026-11-01 `e1c08eba4`  
<sub>verificada · 6 lacuna(s) · **apagar: não**</sub>

Fase 2 do Copiloto RADAR só em banco+docs. As tabelas de sessão, insight, feedback e o gatilho "cliente falou" a main já refez por conta própria com schema diferente (é esse que está em produção), então essa parte da branch é obsoleta. Sobraram duas peças que não existem em lugar nenhum: o porteiro de presença (só gastar IA quando o vendedor está com a conversa aberta — economia de custo por mensagem) e a retenção/limpeza LGPD dos dados do copiloto (hoje insight e texto de sugestão ficariam para sempre). A flag do RADAR está desligada e as tabelas têm 0 linhas, então nada vaza hoje; mas a retenção precisa existir antes de ligar a flag. Mais 3 docs pequenos.

**`claude/feat-copiloto-edges-261101-1330`** — 2026-11-01 `c5bac6ad2`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

As 7 edges do Copiloto (objeção, ancoragem de preço, risco de perda, recomendação de produto, prazo, temperatura do lead, análise de mídia) e a camada de IA dos hooks já estão na main, em versão melhor (contratos validados + testes). Sobram só 2 coisas de servidor: (1) o botão de desligar a IA do Copiloto (`ai.capability.copilot_live`) NÃO desliga essas 7 funções — elas continuam gastando provedor pago mesmo com a capacidade desligada; (2) a análise de imagem do WhatsApp manda para o modelo a URL de um bucket privado, que devolve erro — ou seja, analisar foto/figurinha do cliente não funciona hoje. Nada de UI, banco ou workflow a recuperar; as mudanças de CI e de arquivamento em massa da branch são o oposto do que a main já faz e devem ser descartadas.

**`claude/feat-copiloto-hooks-261101-1500`** — 2026-11-01 `358da5fcb`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch conectava 7 hooks do Copiloto RADAR às edges de IA. A main já tem isso completo via PR #2834 (commit 7ce81c015, que cita #2473), com tipos alinhados às edges reais — os tipos da branch foram escritos antes das edges existirem e contradizem os contratos Zod atuais (obsoletos). Única sobra que ainda faz sentido: em useObjectionHandler, trigger 'barato' em preço + detecção pelo tipo com mais triggers em vez do primeiro match (5 linhas, valor baixo; correção de problema que a própria branch criou). AbortController da branch é código morto (signal nunca passado). A classificação anterior DECISAO_DONO (custo LLM) está superada: o dono já mergeou as 7 edges e a camada AI.

**`claude/feat-cores-prioridade-d12-261101-1425`** — 2026-11-01 `c46e71fa1`  
<sub>verificada · 4 lacuna(s) · **apagar: não**</sub>

Escada de cor D12 nas pílulas de prioridade de Tarefas (Média âmbar em vez de azul; Alta vermelho contorno; Urgente vermelho /20 + borda cheia) em PriorityChip e PriorityPill. O produto (cores) está 100% na main via squash da PR #2478 (commit 7beecdb78, 2026-11-08). Ficaram de fora só 3 reforços de teste: Média não pode ser text-primary no Chip, contraste AA do texto de Urgente sobre a tinta /20, e igualdade da escada Pill × Chip (o defeito da etapa 170). Comentários/docblocks e border-warning/40 (main escolheu /30) não valem portar.

**`claude/feat-incidentes-pausa-investigados-261024-1640`** — 2026-11-01 `204ce07fb`  
<sub>verificada · 1 lacuna(s) · **apagar: não**</sub>

Investigação de incidentes de pausa de instância de WhatsApp (IP2): colunas + RPC mark_pause_investigated no banco e aba "Pausas" com ação "Marcar investigada" no painel de monitoramento. A funcionalidade está inteira na produção e na main (entrou pela PR #2822, commit bd62fc9d9): migration byte-idêntica (só renumerada para 20261111181000), front, hooks, service e os 2 testes de componente. O que ficou fora foi a suíte SQL de 493 linhas que prova no banco local que só admin/supervisor investigam, que a auditoria registra 1 linha por chamada sem copiar as notas e que o 1º ator congela. Sem ela, a autorização e a auditoria dessa RPC não têm teste automatizado de banco.

**`claude/feat-multiplix-cron-instancia-pausada-261101-1410`** — 2026-11-01 `81dc9cfaa`  
<sub>verificada · 1 lacuna(s) · **apagar: não**</sub>

Cron do Multiplix passa a retomar sozinho dispatches pausados por instância pausada (instance_paused) quando a pausa acaba. A mesma correção já está na main por outra migration (20261115020000, PR #3135) e aplicada em produção; a migration da branch, se aplicada hoje, sobrescreveria o corpo vigente e seria prejudicial.

**`claude/feat-pausa-entrega-campanhas-261101-1400`** — 2026-11-01 `c25689946`  
<sub>verificada · 1 lacuna(s) · **apagar: não**</sub>

C121 parte 2: instância do WhatsApp pausada bloqueia envio (message-delivery 409), pausa disparo Multiplix com motivo próprio e impede o scheduler Talk X de retomar campanhas enquanto a instância segue pausada. Todo o backend, testes e o texto do Talk X já estão na main (reintegrados pelo pacote 8, commit 2cf0153ae #3135). Falta apenas o texto amigável do motivo `instance_paused` no monitor Multiplix — hoje o operador vê o slug cru "Pausado automaticamente: instance_paused".

**`claude/feat-radar-motor-telas-261101-1330`** — 2026-11-01 `34d14be76`  
<sub>verificada · 6 lacuna(s) · **apagar: não**</sub>

Motor copilot.tick, 11 telas do RADAR, hooks, dados, testes e a migration 20261031160000 (aplicada em produção) entraram na main pela PR #2828. Faltou só a integração na Inbox: ChatInputArea não monta <RadarLive> (lazy), então o painel ao vivo das Fases 4–6 é código morto na main e nunca aparece, mesmo com a flag ai.capability.copilot_live ligada. Recuperar = 7 linhas em ChatInputArea.tsx + 3 mocks de teste.

**`claude/feat-talkx-x048-estados-servico-261101-2100`** — 2026-11-01 `764db93f0`  
<sub>verificada · 8 lacuna(s) · **apagar: não**</sub>

X048 (TL-106): estados de serviço do Talk X com botões ligados — campo `crm` no hook useTalkXServiceStatus, painel lateral ServiceStatusSheet, TalkXCrmUnavailableState em Segmentos, TalkXNoPermissionState no ViewRouter com botão "Falar com o administrador" → team-chat, 9 testes. Na main só entrou a troca RestrictedView→TalkXNoPermissionState (PR #2806), SEM a ação do botão; hook, sheet, integração em Segmentos, 3 arquivos de teste e P046 não entraram. PR #2548 foi fechada por congelamento de features TalkX (#2545), não por duplicata.

**`claude/feat-talkx-x070-suppression-reasons-261101-2230`** — 2026-11-01 `cc475ea94`  
<sub>verificada · 1 lacuna(s) · **apagar: não**</sub>

A branch criava o catálogo de motivos de supressão do Talk X (6 motivos de sistema + motivos personalizados por admin), trocava talkx_blacklist.reason_code de enum para texto com FK no catálogo e dropava o enum. Esse efeito de negócio inteiro JÁ está em produção: a mesma migration entrou na main renomeada (20261101223000 -> 20261108100000) e endurecida, mais o reforço de 20261112172000. Produção confirma tabela, 6 seeds, 3 policies, FK, enum removido e reason_code text. Falta apenas o teste comportamental do catálogo: a main só tem checagem estrutural pós-deploy (smoke.sh) e um teste comportamental vizinho (reconcilia) que não exerce a RLS do catálogo por papel. Sem cobertura: agente não-admin recusado ao criar motivo, motivo do sistema não pode ser desativado, FK recusa código inexistente (23503) e talkx_suppress_contact devolve uuid como service_role.

**`claude/feat-ui-visual-texto-longo-261101-1445`** — 2026-11-01 `c5178c37d`  
<sub>verificada · 6 lacuna(s) · **apagar: não**</sub>

C297 (PR #2480): texto longo nos primitivos de UI. Só o Badge (truncate/min-w-0) entrou na main via #2805 (25e13ff60). Card (min-w-0/break-words, leading-tight), Label (leading-snug), TabsTrigger (min-w-0 + span truncate) e o teste novo de 120 caracteres não entraram e ainda fazem sentido: os arquivos da main estão idênticos ao merge-base nesses trechos. A deleção das 6 baselines E2E de Contatos e o comentário no spec são obsoletos/não portar (main mantém os PNGs e roda chromium-contacts-visual no CI). Casts `as HTMLElement` em 5 testes são ruído.

**`claude/fix-E71-draft-skip-security-e2e-261101-1200`** — 2026-11-01 `3f3886545`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch queria pular os jobs security e e2e do CI em PRs rascunho para economizar minutes. A parte 'security' contradiz a main: o CI Gate exige security=success sem exceção de draft e o teste permanente scripts/ci/ci-gate.unit.mjs proíbe o guard fora de unit/build (decisão deliberada em #2711) — portar quebraria todo PR draft. Os 4 comentários são ruído. Só a 1 linha 'if: draft != true' no job e2e (45 min, fora do gate) é recuperável, valor baixo.

**`claude/fix-bulk-archive-rls-message-261101-2250`** — 2026-11-01 `171529dd6`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Arquivar em lote na inbox: quando o RLS barra a leitura prévia do estado das conversas, o hook não deve arquivar nem oferecer um "Desfazer" vazio. Esse comportamento já está na main via PR #2813 (toast + return, texto diferente). O que ficou de fora é o teste positivo que prova isso — a main ainda carrega um it.fails com comentário de bug obsoleto — e a escolha cosmética de toast.info (branch) vs toast.error (main) nesse ponto.

**`claude/fix-ci-E69-E71-draft-filter-261101-1830`** — 2026-11-01 `1b5eb7ca1`  
<sub>verificada · 5 lacuna(s) · **apagar: não**</sub>

PR #2503 queria baratear a CI: pular Security Audit (~20 min) e E2E (~45 min) em PR draft, rodar build em paralelo ao typecheck (~2 min/PR) e disparar CI ao marcar 'ready for review'. Só o gatilho ready_for_review entrou na main (#2858); o ajuste de docs ficou obsoleto (parágrafo reescrito). Os filtros de draft em security/e2e e a paralelização build/typecheck (com o teste de contrato correspondente) não estão na main nem foram substituídos — e o filtro em security hoje exigiria também ajustar o ci-gate, que na main passou a exigir success estrito (portar literal quebraria todo PR draft).

**`claude/fix-codex-findings-161016-1906`** — 2026-11-07 `f6b3e105e`  
<sub>verificada · 5 lacuna(s) · **apagar: não**</sub>

Lote de fixes de CI/Codex de 16/10/2026 (PR #2770). Tudo de impacto real já está na main ou foi superado: guarda Number.isInteger na janela do Talk X (talkx-window.ts:329), isProgrammaticScrollRef no ChatMessagesArea (:125-133,319), regex dos contract tests (workflow-contracts:137-138,444; talkx-schedule-timezone:37,77), baselines regenerados (typecheck 93 issues; known-violations zerado em b24e31500; realtime sem audit_logs — confirmado em produção), n011 reescrito por outra abordagem (4b9585052), live-invariants mantido de propósito (db-live-guard.yml:234). Sobram só 4 lacunas de valor baixo: --shm-size 256m em 2 testes de Postgres descartável, inicializador lazy em useOfflineCache, timeout 30 min do typecheck (main reduziu de propósito) e renomeação de copy "Mais convertidos"→"Melhor resposta" (contraria spec T04-039 + teste na main). Nada precisa ser portado para o negócio; hunks colados no dossiê.

**`claude/fix-copilot-rls-supervisor-261101-1530`** — 2026-11-01 `f7ceab508`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

A branch queria que só supervisor/admin pudesse registrar "momentos de aprendizado" e atualizar a "nota da conversa" no Copilot. A main fechou o buraco original (policies abertas) de outra forma em 2026-11-07 (#2763, já em produção): cada um só mexe no que é seu (tagged_by/scored_by = próprio usuário). Resultado: vendedor hoje PODE se auto-avaliar e, como a nota tem chave única por conversa, pode bloquear o supervisor de avaliar. A branch inverte essa permissão vigente, logo é decisão de negócio: quem avalia conversas — só supervisor (recuperar) ou vendedor também (obsoleta)? Sem impacto imediato: nenhuma tela ou edge usa essas duas tabelas hoje.

**`claude/fix-copilot-tick-atomicity-261101-1430`** — 2026-11-01 `3f68240b9`  
<sub>verificada · 3 lacuna(s) · **apagar: não**</sub>

Corrige perda silenciosa de insights do Copiloto RADAR: hoje o tick grava a sessão (cursor avança) e só depois insere os insights em outra chamada; se o INSERT falhar, o retry vê stale_state e desiste, e as sugestões daquelas mensagens somem para sempre. A branch junta as duas escritas numa RPC transacional (commit_copilot_tick). O handler do tick já entrou na main por #2828/#3127, mas a parte atômica (RPC + troca das 2 escritas por 1) não entrou e o bug continua no código que roda quando a capability for ligada.

**`claude/fix-db-guard-pguser-261019-1430`** — 2026-10-19 `054d4d89d`  
<sub>verificada · 4 lacuna(s) · **apagar: não**</sub>

Branch de correções de CI (PR #2104): PGUSER no db-guard, endpoint GA75 do settings-guard, remoção do auto-restore (GA77), novo settings-guard.yml, teste de secrets ignorando comentários e cast TS no hook de supressão Talk X. 6 de 7 itens já estão na main ou ficaram obsoletos (db-guard verde sem PGUSER; settings-guard.yml da main é mais novo; endpoint GA75 já corrigido no #2100; regex do security-unit já ignora comentários; hook Talk X reescrito sem o código alvo; CLAUDE.md virou @AGENTS.md). Única lacuna: GA77 — o settings-guard na main ainda tenta "restaurar" branch protection/auto_merge com um token que não pode escrever (PATCH 403), código morto que só polui o corpo da issue. Valor baixo, sem efeito em produção.

**`claude/fix-db-live-migrations-261107-1623`** — 2026-11-07 `35eb186a6`  
<sub>verificada · 3 lacuna(s) · **apagar: não**</sub>

A branch queria deixar 5 arquivos de migration de 07/11 idênticos ao que foi realmente aplicado no banco (ledger). Três (120000, 123000, 133000) já estão na main fiéis ao ledger; a branch só tirava comentários (sem valor). Dois (121000 message_reactions_one_per_agent e 122000 contacts_phone_search_digits) a main regrediu em 09/11 (a15fdfb81/fe6c6b0bf): SQL reescrito à mão que NÃO bate com o ledger nem com produção (índice com outro nome, coluna gerada com outra expressão, REVOKE sem service_role, sem COMMENTs), mascarado por exceção "ledger-divergence/pinned-replay" em migration-evidence.json. Contraria banco.md:96 ("o ledger ao vivo é a verdade"). Impacto: replays locais/snapshots divergem de produção; não afeta usuário final. Recuperação = restaurar os 2 arquivos a partir do ledger (ou do merge-base 43fb7342a) e remover as 2 exceções do evidence.

**`claude/fix-db-migrate-ga04-ga05-261016-0011`** — 2026-10-17 `fe4f40c67`  
<sub>verificada · 3 lacuna(s) · **apagar: não**</sub>

Endurecimento do workflow de migration (db-migrate): GA04 manda diagnósticos do heredoc inline para stderr e GA05 adiciona testes que provam que o ledger com cabeçalho "--" (caso real do run 37355980323) passa e arquivo diferente reprova. O essencial (scripts validate-runtime-proof/run-runtime-contract em stderr; normalização flatMap(splitStatements) no ledger) já está na main; faltam 2 linhas console.log→console.error no yml e 5 testes de proteção. O fechamento da PR alegou "delta zero", o que é falso. O yml da branch é cópia stale com regressões (remove guard CONFIRMATION_HASH, REF_DISPARO, --db-url, rebaixa pins) — portar só os 2 hunks GA04.

**`claude/fix-ga-fase0-banco-e2e-261020-2200`** — 2026-10-20 `e96677121`  
<sub>verificada · 4 lacuna(s) · **apagar: não**</sub>

Lote "fase 0" do plano de GitHub Actions (GA02-GA12). A maior parte já está na main, em versão melhor: a trava anti-apagão das instruções de agentes (ci.yml:73-76, hoje contra AGENTS.md + docs/agentes + skills), o gatilho/fila do E2E logado (workflow_run do CI verde no mesmo repo, grupo fixo), os headers de documentação dos dois workflows e a migration da RPC de fixture (arquivada byte a byte em _superseded/ por decisão registrada; produção confirma: migration 0, função 0). Sobram 4 lacunas reais e pequenas: no ci.yml, o teto interno de 11 min no Vitest (sem ele o estouro do job vira "cancelled" e o check agregado lê como pulado em vez de vermelho) e o grupo de concorrência próprio para o dispatch manual; e dois testes de contrato (GA04 do hash de prova do banco, GA05 do cabeçalho do ledger) cujo comportamento já está na main mas não está travado por teste — ambos aplicam limpo e passam. Nada de front, inbox, WhatsApp ou envio foi perdido.

**`claude/fix-ga-fase23-edge-e2e-261020-2200`** — 2026-10-23 `420aae588`  
<sub>verificada · 8 lacuna(s) · **apagar: não**</sub>

Pacote de CI/edge (PR #2128). A maior parte foi superada pela main (health-check de logs reescrito, e2e-logado refeito com backend descartável, hook do front), mas sobraram 4 lacunas reais: (1) 4 suítes E2E da main — talkx, onboarding-dispensar, multiplix-responsivo, tarefas-linha-de-base — não rodam em nenhum workflow e o guard que pegaria isso ficou na branch; (2) o resolvedor de rollback das edges está na main sem ninguém chamar, e o código inline que continua ativo pode "rolar de volta" para o próprio SHA quebrado; (3) segredos ainda vão no argv do supabase secrets set em 4 pontos do deploy; (4) mexer em fixture de edge function dispara deploy de produção à toa. A triagem anterior marcou OBSOLETA — está errada nesses 4 pontos.

**`claude/fix-ga-fase78-perimetro-custo-261020-2200`** — 2026-10-20 `1b2db4d1b`  
<sub>verificada · 21 lacuna(s) · **apagar: não**</sub>

Lote de CI/perímetro (GA75–GA95) fechado sem merge. A triagem anterior ("já na main") está errada: só 4 pedaços entraram por outro caminho (remoção do harden-runner, node 24 no vercel-env-cleanup, chave playwright do toolchain em versão mais nova e a correção do endpoint selected-actions no guard). Continuam fora da main: o KPI de custo do Actions que preenche as colunas "custo/semana" e "taxa de falha" do docs/ci/README.md (a main já tem o leitor, ninguém gera o arquivo, as colunas ficam em "—"), o cache de browsers Playwright que para de prender ~2,6 GB por PR, a notificação de startup_failure na main (hoje um workflow que nem arranca falha em silêncio), o dedupe da issue rotativa, a checagem de retenção de artifacts, o script de aplicação do perímetro e o teste que pegaria a divergência viva da imagem Go (Dockerfile em 1.27, go.mod/toolchain em 1.24). Nada aqui toca produto, WhatsApp, inbox ou banco: é custo e confiabilidade de CI. Dois pedaços não devem ser portados sem o dono: o baseline do perímetro da branch (desatualizado, mudaria required checks, apagaria environments e baixaria permissões) e a retirada da restauração automática de strict/auto-merge do guard.

**`claude/fix-ga-resto-dbmigrate-20261021-0729`** — 2026-10-21 `ed3996686`  
<sub>verificada · 20 lacuna(s) · **apagar: não**</sub>

A branch deixava o lote diário de migrations do banco rodar de ponta a ponta sem editar YAML: o dry-run (conferência) deixaria de esperar aprovação humana, o apply passaria a aplicar todas as migrations pendentes de uma vez com conferência por hash, migration destrutiva (DROP/DELETE/TRUNCATE) exigiria confirmação explícita, e o apply dispararia sozinho a sincronização de tipos e o guarda do banco. Nada disso está na main: o comentário que fechou a PR #2142 ("as mudanças já estão na main") é falso — a main segue com job único, 1493 linhas, sem apply_all_missing nem confirmação destrutiva, e os 6 scripts novos (1.246 linhas) e 4 testes não existem lá. Entrou só o detector de SQL destrutivo (list-destructive.mjs, PR #3135) — e em versão melhor que a da branch —, mas ele está órfão: nenhum workflow o chama, então o portão nunca foi ligado. Os próprios planos da main (PLANO_GITHUB_ACTIONS 2026-10-15 e REVISAO 2026-10-30) continuam pedindo GA13–GA17 como pendência aberta, com a ressalva do dono de não virar "apply de lote indiscriminado".

**`claude/fix-ga-resto-docs-regen-20261021-0726`** — 2026-10-21 `52761c075`  
<sub>verificada · 5 lacuna(s) · **apagar: não**</sub>

Branch de docs/CI (PR #2144) com 4 itens "GA": documentar que edge sobe sozinha no push (GA37), aliviar o workflow talkx-status-regen (GA96), CODEOWNERS sem "requer aprovação" (GA97) e passo órfão do db-guard + extrator nao-e-bug multi-linha (GA98). O núcleo já está na main por outros commits (#2345 DEPLOYMENT.md/template, #2156 concurrency única, passo em lote do db-guard, docs do notifica, CLAUDE.md virou @AGENTS.md com conteúdo em docs/agentes). Resta só baixo valor: comentário do CODEOWNERS contradizendo a regra vigente, filtro de paths/timeout/corpo do talkx-status-regen (workflow hoje disabled_manually), continuação multi-linha + export em render-workflow-docs.mjs (nenhum workflow da main usa item multi-linha hoje) e os testes GA96/97/98. Nada toca src, edge ou banco.

**`claude/fix-ga-resto-sonar-contracts-20261021-0726`** — 2026-10-21 `dc8b63494`  
<sub>verificada · 12 lacuna(s) · **apagar: não**</sub>

Branch do plano GA (15/10) com três blocos: testes anti-regressão de workflow, endurecimento de CI e higiene Sonar. A triagem anterior marcou #2145 como OBSOLETA — não confere. O que importa de verdade e NÃO está na main: o Gate 3 do types-sync hoje compara o catálogo do banco com ele mesmo (o passo de apply sobrescreve o arquivo antes do gate), ou seja, o portão que deveria barrar remoção de tabela/função ainda usada pelo app é um no-op — um DROP destrutivo passa em silêncio. Além disso ficaram de fora: o DSN de produção sai do GITHUB_ENV (lido por qualquer action de terceiros no job) em 4 workflows, duas imagens de container sem digest, e 5 testes que travariam essas regressões. Já incorporado ou obsoleto: e2e-logado (main tem forma melhor), CLAUDE.md (linha removida de propósito), health-check (parser reescrito). O resto (16 arquivos de higiene Sonar) é cosmético, sem efeito.

**`claude/fix-ga-resto-typessync-20261021-0730`** — 2026-10-21 `f63da0dd8`  
<sub>verificada · 9 lacuna(s) · **apagar: não**</sub>

Fase 1 do plano GA20-GA25: endurecer os três guardas de banco no CI (types-sync, db-live-guard, db-migrate). A main já tem o split de credencial (GA21) e recebeu as três bibliotecas novas no resgate do pacote 8 (#3135, 15/11), mas NENHUMA delas tem chamador — são código morto. A fiação GA20/GA22/GA23/GA24/GA25 ficou fora. Consequência ativa hoje: o Gate 3 do types-sync (único freio contra um PR de sync que apaga tabela/view/função ainda usada pelo src/) compara o catálogo já sobrescrito com ele mesmo e SEMPRE passa; e o auto-merge do PR de sync é incondicional, então DDL feito fora do db-migrate é legalizado sozinho. A alegação de fechamento da PR #2143 ("delta zero, já está na main") é falsa.

**`claude/fix-paleta-filtros-celebracoes-261025-2110`** — 2026-10-25 `c32f113a7`  
<sub>verificada · 4 lacuna(s) · **apagar: não**</sub>

Branch guarda-chuva com 103 commits (~100 fixes de inbox, Talk X, admin, a11y e testes + 1 migration de KPI). Praticamente tudo já está na main, muita coisa reimplementada melhor. Sobram 3 itens: dois testes de regressão que guardam comportamentos que a main JÁ tem em produção (tolerância de relógio nas celebrações de conquista e o filtro de tipo do inbox acompanhando o voltar/avançar do navegador) e um detalhe de acessibilidade da paleta ⌘K (as "Buscas recentes" ficam dentro da lista de opções). Nenhum fluxo de negócio está quebrado hoje por causa disso: o risco é alguém desfazer sem perceber os dois fixes que não têm teste. Um item da branch é obsoleto e NÃO deve ser recuperado: ela escondia criar/editar/excluir template de WhatsApp de supervisores, e a RLS de produção autoriza supervisor — a main já acerta.

**`claude/fix-talkx-segmentos-estimativa-261025-2110`** — 2026-10-25 `ccd09bebc`  
<sub>verificada · 12 lacuna(s) · **apagar: não**</sub>

Branch guarda-chuva (101 commits, 173 arquivos): quase tudo já está na main. Sobram 3 correções do Talk X → Segmentos: (1) quando todas as regras do segmento são "em breve", a tela mostra a BASE INTEIRA como público estimado em vez de "—"; (2) o botão Atualizar da biblioteca recalcula com Promise.all e, se um segmento falhar, perde o recálculo de todos em silêncio; (3) depois de excluir/arquivar em lote, o painel Detalhes continua mostrando um segmento que já não existe. Exposição hoje é baixa (produção tem 1 segmento e nenhum usa campo "em breve"), mas são guardas contra número de audiência errado em campanha de WhatsApp. Também perdidos os 2 testes que provam isso. O resto da branch é obsoleto: templates de WhatsApp só-admin contraria a RLS real (admin+supervisor), enum de papel com special_agent não existe no banco, e a fila offline/phone-input/TalkXView já evoluíram mais na main.

**`claude/fix-teste-notas-titulo-erro-261101-1410`** — 2026-11-01 `ac145076c`  
<sub>verificada · 3 lacuna(s) · **apagar: não**</sub>

PR #2475 (fechada pelo congelamento #2545, não por mérito) só endurece 3 testes da ficha de notas do contato: volta a exigir o título 'Erro ao atualizar nota' quando a RLS impede editar/fixar nota de colega e alinha os mocks ao caminho real da main (hook useContactNotes → ContactService.updateNote .select().single(); leitura paginada .range()). Nada entrou na main: os 3 arquivos estão byte a byte como no merge-base (#2281). Código de produção já faz o que os testes descrevem; a lacuna é só a proteção do teste. Verificado em cópia isolada: testes da branch passam 19/19 sobre a main atual; ao mutar o título em useContactNotes.ts:157 o teste da branch falha e o da main não. Triagem 2804 (OBSOLETA) não confere.

**`claude/fix-unit-tests-pre-existentes-261024-1700`** — 2026-10-25 `df8883db0`  
<sub>verificada · 15 lacuna(s) · **apagar: não**</sub>

Maratona de 87 commits de "corrigir testes pré-existentes" sobre a main de 24/10 que arrastou features de produto (X112 lista/grade, X156 campanha pausada, X079 células do kit, busca server-side do chat de equipe, aba Tarefas agendadas, contagem do AuditLogDashboard, validação de telefone DDI 55, avatar com URL assinada, áudio por MIME real). Em 3 semanas a main reimplementou TODOS esses itens de forma própria e melhor (hooks dedicados em vez de lógica no componente), então a branch virou história. Sobra uma única correção real que ninguém refez: no login com MFA, a verificação automática dispara antes dos fatores carregarem e a tela trava em "Nenhum fator MFA encontrado". Dois pontos da branch são regressão hoje e não devem ser portados: arquivar conversa por assigned_to (a main usa conversation_status via RPC) e restringir templates de WhatsApp a admin (a main já decidiu liberar para supervisor).

**`claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023`** — 2026-10-23 `e1cf8004d`  
<sub>verificada · 9 lacuna(s) · **apagar: não**</sub>

Lote de ajustes de CI (PR #2197, fechada como "delta zero"). O núcleo já está na main ou foi superado de propósito: fila-merge.mjs e seu workflow foram apagados no pacote 6 (41853318c, 2026-11-14: fila O(N²) substituída por merges em pacote); CodeQL diário já entrou (codeql.yml:23); branch-hygiene publica com condição mais estrita (!cancelled() && relatório ok, b46f5d291); docker-shim da main já falha fechado em CREATE/snapshot de roles (docker-shim:80-86,170-173) e a versão da branch é bash inválido. Sobram 5 hunks de valor baixo não incorporados: types-sync.yml (ignorar known-violations.json no gatilho, grupo de concurrency próprio para dispatch, Job summary com !cancelled()), remoção do ignore do actionlint (só após validar parse) e alerta de lote de pushes no KPI do Actions (precisa correções apontadas no review: conta runs e não pushes). Nada afeta WhatsApp, inbox, contatos ou login.

**`claude/infra-c121-ddl-261101-1350`** — 2026-11-01 `14d1417a7`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

A DDL inteira da investigação de pausas de instância (3 colunas, 3 CHECKs, RPC mark_pause_investigated, grants) já está na main e aplicada em produção, via a migration 20261111181000 trazida pela PR #2822 — o painel no front já usa. Sobram duas coisas da branch: (1) um fix na RPC que impede atribuir a investigação original a outra pessoa quando o perfil do investigador é excluído (produção hoje tem o comportamento errado) e (2) a suíte de teste de banco de 509 linhas, que é a única cobertura existente dessa RPC (hoje zero). Branch não pode ser apagada.

**`claude/kind-gates-87mwoe`** — 2026-10-31 `88291f53a`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch do loop de CI do PR #2185 (90 commits): correções de produto achadas pelo Qodo (Base de Conhecimento, inbox, diagnóstico, configurações, War Room, Talk X), infra de teste e relatórios de sessão. Praticamente tudo de produto já está na main, em forma igual ou melhor; as frentes de CI/teste/docs foram superadas por reescritas deliberadas da main. Sobram dois ajustes pequenos: o painel de diagnóstico mostra "Latência: Xms" mesmo quando declara o banco fora do ar por falha na contagem de conexões, e a tela de configurações não avisa o usuário quando a leitura falha por rede (fica com os padrões em silêncio). Nenhum fluxo crítico (WhatsApp, envio, inbox, login) está em falta.

**`claude/tender-heisenberg-a4jk3s`** — 2026-10-22 `dec13f873`  
<sub>verificada · 10 lacuna(s) · **apagar: não**</sub>

Lote de "CI verde" de 22/10 (PR #1979). Os 4 fixes de produto (filtro de tipo da inbox por ?type=, diagnostico de banco que nao aborta o ciclo, isError nas configuracoes do usuario, arquivamento em lote por conversation_status) ja estao todos na main, em varios casos com a main tendo ido alem. Falta apenas uma reordenacao de dedupe de comentario no workflow types-sync (ruido de alerta de CI, zero efeito em negocio). O resto e baseline gerado, mock de jsdom dispensavel, rename de job superado e um plano documental cuja premissa (14 workflows) virou 21 na main.

**`claude/w85-w86-w87-ossf-scorecard`** — 2026-10-18 `fe00bdfe5`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch reaplicava, sobre a main pós-"CI mínimo", o OpenSSF Scorecard (workflow novo, SARIF no Code Scanning) e o step Dependency review no job security do ci.yml (bloqueia PR que traz dependência com vulnerabilidade HIGH+). Nenhum dos dois está na main: foram removidos de propósito em 5721e4f50 (16/10), a branch nasceu depois e os readicionou, e a reaplicação mínima #2510 (01/11) foi fechada pelo congelamento de features #2545 com "branch preservada". O fechamento de #2051 alegando "delta zero" é falso para esses 2 itens. O resto (cache Bun, Playwright 1.64.1, regex do teste, allowlist) já está na main ou foi superado (install-deps despinado em #2054; e2e-logado reestruturado; harden-runner já removido em #2100).

**`claude_05/serene-feynman-3uuurw`** — 2026-11-02 `cc286ee0b`  
<sub>verificada · 1 lacuna(s) · **apagar: não**</sub>

Branch corrigia a tela admin "Insights de Busca" (RPC inexistente get_search_insights → search_insights, ZW-0011) e atualizava entregáveis da auditoria Supabase. O comportamento (hook + testes) já entrou na main via #2798; auditoria e grants-baseline foram superados por versões mais novas na main (08/11 e 15/11). Falta só a cópia/JSDoc da view: a tela da main ainda promete listas de termos e cita RPC inexistente, enquanto o hook devolve listas sempre vazias — texto enganoso para o admin, sem impacto funcional.

**`claude_juca/practical-rubin-8xnw0u`** — 2026-11-02 `652c56961`  
<sub>verificada · 22 lacuna(s) · **apagar: não**</sub>

Lote de etapas do módulo Talk X. Já está na main: trilha do cabeçalho/Monitor (X053, em forma melhor — item clicável volta à lista), busca ⌘K (X054), rótulo de status 'sending' na paleta, e a exportação CSV+PDF do relatório de campanha com gate de permissão (X168 foi superado por X164/TL-080, mais completo). Ficou fora da main: importar/exportar templates em CSV/JSON (feature inteira, ponta a ponta na branch), ações em massa (pausar/cancelar/excluir) na lista de campanhas, painel 'Status dos serviços' (o botão que o abre existe na main e não abre nada), RLS negada (42501) cair em 'sem permissão' em vez de erro genérico, o botão 'Falar com o administrador' na tela de permissão do Talk X e a dica do dia rotativa. Branch não pode ser apagada antes de recuperar esses itens.

**`claude_pink/cool-dijkstra-xk9ek2`** — 2026-11-01 `927a71bc7`  
<sub>verificada · 15 lacuna(s) · **apagar: não**</sub>

Branch do "plano GA01-GA100" (PR #2502/#2108, 94 commits, endurecimento de CI/CD/banco). A maior parte já está na main sob outros nomes (GA02 em check-claude-md-integrity.mjs, GA10 em workflow-contracts.unit.mjs, GA25 em check-deployments-ledger.mjs, GA64 via sla-code-scanning.mjs, GA21/GA61/GA62/GA68, gmail-helpers, settings-guard.yml), e a triagem de 2026-11-08 marcou "OBSOLETA" — errado em parte. Sobram 11 lacunas reais, todas de CI/infra (nenhuma toca WhatsApp, inbox, envio, contatos ou login). A mais importante é de segurança: o deploy-functions.yml da main ainda passa 7+ segredos na linha de comando do `supabase secrets set`, visíveis em /proc do runner; a branch corrige com env-file. Atenção: o tip da branch está corrompido — 4 arquivos foram substituídos por uma linha PLACEHOLDER_* (evolution-api/index.ts perdeu 1219 linhas), então a branch não é mergeável; só vale portar hunks avulsos. Não apagar antes de recuperar GA32/GA30/GA33.

**`codex/publish-followup-20261021`** — 2026-10-21 `47b1c07e3`  
<sub>verificada · 17 lacuna(s) · **apagar: não**</sub>

O banco da trilha de busca entrou na main (RPC log_search_event de 5 argumentos, coluna client_event_id, INSERT revogado — tudo aplicado em produção), mas o frontend que usa isso ficou de fora: hoje cada clique num resultado grava uma LINHA NOVA em search_events (infla a métrica de buscas) e o tipo do resultado clicado é sempre gravado como 'other'. A tela admin "Insights de Busca" mostra duas tabelas permanentemente vazias e descarta os dois números que a RPC já devolve (tamanho médio do termo e cliques por tipo). No Talk X, o wizard da main engole o erro da consulta de conexões (falha de rede aparece como "WhatsApp desconectado"), deixa avançar o passo 1 com a consulta de audiência falhada e agenda/lança campanha mesmo com zero contatos elegíveis — a branch corrigia os três. O resto (edge de saúde da conexão, hooks de segmento, CI, docs e guards) está obsoleto: a main avançou depois de 21/10 com decisões mais novas e porta-las seria regressão.

**`fix/f1a-lote-b-useteamchatnotifications`** — 2026-10-18 `ee3d010db`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

PR #2080 corrigia 3 causas no alerta do chat interno: (1) canal realtime recriado ao mexer no volume + tópico único, (2) aviso de desktop saía por caminho que exige Service Worker (desligado) e nunca aparecia, (3) toda mensagem de equipe disparava um SELECT em team_conversation_members em cada cliente conectado mesmo com a conversa já no cache do inbox. As causas 1 e 2 já estão na main em forma equivalente (refs + uniqueRealtimeTopic + showBrowserNotification). A causa 3 (ler o cache do inbox antes de ir ao banco) nunca entrou na main; o commit 61a973da6 (#2182) inverteu os asserts do teste para o CI passar, deixando títulos de teste contradizendo o que verificam. Comentário de fechamento cobriu só a causa 1.

**`hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`** — 2026-10-15 `878167173`  
<sub>verificada · 8 lacuna(s) · **apagar: não**</sub>

Branch portava 7 correções de robustez/acessibilidade dos primitivos de UI (dialog, skip-link, table, sparkline, avatar, visually-hidden, offline-indicator) + 360 linhas de teste. A main já resolveu 2 delas por caminho próprio (timer do offline-indicator e timer/detecção de alvo do SkipLinks, este com MutationObserver em vez de polling). Continuam de fora, e ainda fazem sentido: descrição acessível de fallback no DialogContent (leitor de tela perde o contexto do diálogo e o Radix avisa no console), tabindex=-1 no alvo do skip link (o atalho "pular para navegação" não move o foco hoje, porque o nav do Sidebar não é focável), limpeza do timer do useAnnounce (setState em componente desmontado), scope="col" no TableHead, Sparkline aria-hidden e chave estável no AvatarGroup. Nada de banco, edge ou workflow. Impacto: acessibilidade e ruído de console, sem fluxo crítico quebrado.

**`hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`** — 2026-10-03 `e31ccad51`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Branch T75 (Telefonia): fazia toda animação da tela de Telefonia respeitar "reduzir movimento" via um hook central useMotionSeguro. A main já atende esse aceite por outra arquitetura: useReducedMotion por componente (CallKpiCard fade 150 ms, ActiveCallPanel 120 ms), MotionConfig reducedMotion="user" global (App.tsx) e CSS global que zera transições (accessibility.css), com testes em telefoniaMotion.test.tsx. Os 21 ajustes de mocks de teste ficaram desnecessários (main usa ...actual do framer-motion) e os dois arquivos de teste alterados (VoIPPanel, CampaignsView) foram apagados na main. Sobram só 2 detalhes cosméticos (stagger dos KPIs e fade na troca do painel lateral), preservados no dossiê.

**`resolve-2381-from-main`** — 2026-10-31 `85bf846aa`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Motor do Copiloto RADAR (migration, gatilho, handler no ai-jobs-worker, flag desligada) e todas as telas das Fases 4–6 já estão na main e em produção (#2828 + #3127). Falta só a montagem do painel RadarLive na caixa de digitação da Inbox (ChatInputArea): hoje RadarLive.tsx é código morto — com a flag ligada o motor grava sessões/insights e nenhum vendedor vê. Lacuna de ~10 linhas de front, sem custo externo novo (custo de LLM já aceito ao mergear #3127 e gateado pela flag).


#### Decisão do dono — 3 branches

**`claude/feat-E90-main-failure-notify-261101-1730`** — 2026-11-01 `0265d2c2d`  
<sub>verificada · 6 lacuna(s) · **apagar: não**</sub>

Branch (PR #2499, fechada pelo congelamento de features) criava aviso por WhatsApp quando workflow crítico falha na main (via Evolution GO direto do GitHub Actions) e um dedup de 1h nos comentários da issue [falha-main]. Nada disso está na main: hoje falha na main só abre/comenta issue (notifica-falha-main.yml). O workflow WhatsApp contradiz a regra vigente AGENTS.md:76-77 ("EVOLUTION_* só nas edges"; URL só via EVOLUTION_API_URL nas edges): exige o token da Evolution em secret do Actions e grava o hostname da VPS em YAML de repo público. Se o dono quiser o aviso, o caminho conforme a regra é Actions -> Edge Function -> Evolution. O dedup da issue é lacuna pequena e recuperável (com a correção apontada pelo Qodo). Os hunks de inventário 17->18 estão obsoletos (main já está em 21 workflows).

**`claude/fix-radar-fase6-cv056-shortcuts-261108-2335`** — 2026-11-08 `4c63335e7`  
<sub>verificada · 5 lacuna(s) · **apagar: não**</sub>

A branch entrega a Fase 6 do Copiloto RADAR (painel flutuante na conversa, CV-051-060) com atalho Ctrl+Shift+A. A main já tem um painel da MESMA fase, feito por outro agente, com API incompatível: portar esta branch sobrescreve o hook useRadarPanel e quebra o painel que já está na main. São duas telas diferentes para a mesma função — escolha de produto, já registrada na main em PENDENCIAS.md item 2 (issue #2967) citando esta branch e a PR #2872. Agrava: o painel desta branch é casca, nada alimenta a timeline dele, então mostraria sempre "Aguardando análise da conversa"; o painel da main já está ligado ao motor. Única peça aproveitável nas duas opções: a entrada de atalho radar-toggle (Ctrl+Shift+A), que a main não tem. Hoje nenhum painel RADAR aparece na tela em produção, com qualquer das opções.

**`claude/radar-motor-copilot-live-301030`** — 2026-10-30 `fcf880a45`  
<sub>verificada · 2 lacuna(s) · **apagar: não**</sub>

Motor do Copiloto RADAR (copilot.tick, migration, worker), banco, hooks, 11 componentes e testes já estão na main via #2828 e #3127 (migration byte-idêntica renomeada para 20261115010000, aplicada em produção, capacidade semeada desligada); a main ainda melhorou o motor (parse do envelope do provedor, DECISION_ROLES, fail-closed). Falta UMA peça funcional: ninguém monta `RadarLive` na Inbox — `ChatInputArea` da main não o importa, então o painel RADAR das Fases 4–6 é código morto; quando o dono ligar a capacidade, o vendedor não verá nada. Lacuna de 7 linhas (lazy import + bloco Suspense), hunk no dossiê. Mais um mojibake cosmético no comentário do RadarPanel.


#### Incorporada — 130 branches

**`automation/inventario-estado`** — 2026-11-09 `72de368f7`  
<sub>verificada · apagar: sim</sub>

Branch automática do inventário semanal (inventario/estado/*.json) que já entrou na main via PR #2848 (squash 1c3535a04, 2026-11-09); o único "conflito" é edges.json, que a própria automação regenerou depois na main (ab657aa34, 2026-11-14, snapshot mais novo: 92 edges vs 85). Nada manual ou útil ficou de fora.

**`chore/analise-prs-261024-2325`** — 2026-10-24 `1c871e471`  
<sub>verificada · apagar: sim</sub>

Branch só despeja artefato de análise (inventário das 145 PRs abertas em 2026-10-24, #1930–#2241, em CSV+JSON, mais resumo de regras). Zero código, zero banco, zero edge, zero workflow. Os três arquivos já estão na main: prs.csv e regras-de-negocio.md byte a byte; o conteúdo do prs.json é a mesma tabela do prs.csv que a main tem (mesmos 145 registros, mesmos 15 campos), e o caminho prs.json foi reaproveitado de propósito pelo ciclo de análise atual (#2752, #3063) com PRs #2553–#2972. Aplicar o hunk apagaria o inventário vivo. Nada a recuperar; valor nenhum.

**`claude/br-dossies-lote1-261031`** — 2026-10-31 `278354677`  
<sub>verificada · apagar: sim</sub>

Branch só de documentação de auditoria (3 dossiês + 4 entradas de progresso.json registrando branches já cobertas pela main). Todo o conteúdo está na main byte a byte, movido para docs/_arquivo/analise/ (re-landado via #2458, arquivado via #2630). Sem efeito em produto, banco ou CI. Nada a recuperar.

**`claude/br-dossies-lote2-261031`** — 2026-10-31 `599e60294`  
<sub>verificada · apagar: sim</sub>

Branch docs-only (PR #2415): 5 dossiês de auditoria de branches + 9 entradas em analise/progresso.json. Todo o conteúdo já está na main, reaplicado pela PR #2458 (commit df4d597dc, "substitui ... #2415") e depois arquivado em docs/_arquivo/analise/ pela PR #2630. Nenhum código, migration ou workflow envolvido; nada a portar.

**`claude/br-dossies-lote4-261031`** — 2026-10-31 `01fff64d1`  
<sub>verificada · apagar: sim</sub>

Branch 100% documental (1 commit): 25 dossiês de auditoria de branches em analise/dossies/*.md + atualização de analise/progresso.json. Zero código, teste, migration, edge ou workflow. Todo o conteúdo entrou na main e depois foi movido para o arquivo morto pelo PR #2630 (c570d5d46), onde está byte-idêntico. O CONFLITO mecânico é falso positivo: a pasta analise/ foi arquivada em docs/_arquivo/analise/ e o progresso.json da raiz foi reescrito por um ciclo posterior de auditoria (#2761). Nada a recuperar; sem impacto no produto.

**`claude/chore-pacote3-merge-261113-2325`** — 2026-11-14 `36c9f9336`  
<sub>verificada · reexaminada · apagar: sim</sub>

Pacote 3 (#3048: conversas Evolution GO + desempenho da inbox, dossiês da triagem de PRs). Todo o código entrou na main pelo squash do pacote 4 (d084ca753, PR #3063); os 2 arquivos "em lacuna" são artefatos gerados (ESTADO.md e deployment-manifest.json) que a main já regenerou contra código mais novo. Nada a recuperar.

**`claude/chore-prod-readiness-261112-1421`** — 2026-11-13 `dc3424ee5`  
<sub>verificada · apagar: sim</sub>

Branch só de documentação (1 arquivo, docs/prod-readiness.md, 1100 linhas): o relatório de prontidão para produção com inventário provado da main @ 81f67b0db. O conteúdo já está na main desde 13/11, byte a byte: a versão criada pelo pacote #3035 (squash cb6576b2a) tem md5 idêntico ao da branch. As 665 linhas que o detector mecânico marcou como faltando são medições antigas que as rodadas seguintes (#3061, #3066, pacotes #3113/#3123) atualizaram dentro do mesmo arquivo — a main hoje tem 1857 linhas e é superset estrutural: 18/18 rotas, 55/55 vistas, 94/94 edges, 24/24 workflows, 224/224 relações, X1–X29 todos presentes, além das seções 1–5 da branch na íntegra. Nada de valor ficou de fora; não há nada a portar.

**`claude/chore-reconcile-ledger-drift-261101-2249`** — 2026-11-01 `2388e1ac5`  
<sub>verificada · apagar: sim</sub>

Branch reconciliava o ledger do banco: criava o arquivo da migration 20261030145126 (7 tabelas copilot + 16 policies) e registrava no replay-known-failures.json a falha esperada da 20261031100000. Ambos já estão na main (commit 587ec25f8, PR #2551) e em produção (ledger + pg_tables + pg_policies confirmados). O restante do diff da branch introduz erros de digitação em textos do JSON que a main tem corretos — não portar.

**`claude/chore-relatorio-ci-261112-0940`** — 2026-11-12 `5c655b681`  
<sub>verificada · apagar: sim</sub>

Branch só de documentação de CI (RELATORIO_CI.md §9–§11 com vitest task bhgtzypf7 verificado e PENDENCIAS.md reescrito com tabela de prova dos workflows, E2E PR #2987, zombie 409). Todo o conteúdo já está na main: PENDENCIAS.md da branch é prefixo exato do arquivo atual (main só acrescentou seções de 14/15-nov, 0 deleções); RELATORIO_CI.md difere apenas em 5 rótulos de tabela encurtados em §10.3 com mesmo status/PR/SHA. Incorporado via pacote #3035 (cb6576b2a). Nenhum trabalho perdido; PR #2990 pode ser considerada superada.

**`claude/chore-testes-edges-261112-1202`** — 2026-11-13 `62a75e9a4`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch só de testes (12 contratos Deno offline para edge functions sem teste). 11 arquivos idênticos à main; o 12º (copilot-live/index.test.ts) está na main em versão estendida: a única linha "faltante" (stub de ai_usage_logs retornando 201) foi refatorada em bloco que mantém o mesmo retorno padrão e adiciona o caso de cota diária excedida. Nada a recuperar; proteção de regressão já em produção via #3035.

**`claude/ci-deploy-functions-build-id-261114-0017`** — 2026-11-14 `801b605aa`  
<sub>verificada · apagar: sim</sub>

Passo do deploy que grava o SHA publicado como ZAPP_BUILD_ID nas edges (GET /status deixa de responder "unknown"). Já está na main, com condição mais restrita (só em deploy completo, nunca em parcial/rollback) decidida dentro do próprio pacote que a incorporou.

**`claude/feat-ci-local-espelho-261111`** — 2026-11-13 `26e264747`  
<sub>verificada · reexaminada · apagar: sim</sub>

CI local (`bun run ci:local`) que espelha ci.yml e db-guard.yml na máquina. Entrou inteira na main pelo squash cb6576b2a (#3035); as 20 linhas "faltantes" são versões antigas de funções que a main evoluiu (carregarWorkflows lê o YAML do commit via git show; checagem de migration editada virou checarMigrationsEditadas com critérios iguais ao db-guard). Nada perdido.

**`claude/feat-contexto-ia-261103-0728`** — 2026-11-03 `f1614500e`  
<sub>verificada · reexaminada · apagar: sim</sub>

Primeira versão do "contexto vivo para agentes de IA" (gerador scripts/ai-context + workflow contexto-ia publicando inventario/ia na branch contexto-ia). A PR #2661 não foi mergeada, mas o PR #2664 (f798a8826) absorveu o gerador (ampliado e endurecido) e substituiu o workflow por contexto.yml, que publica docs/contexto na branch `contexto`. Docs, .gitignore, package.json e teste de baseline já refletem o estado novo (21 workflows, caminhos novos). O único hunk sem equivalente literal (vercel.json `deploymentEnabled.contexto-ia`) é obsoleto: a main gera um vercel.json próprio na branch publicada. Nada a recuperar.

**`claude/feat-copiloto-ddl-261101-1330`** — 2026-11-01 `7a8bea7d4`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch só adiciona a migration das 7 tabelas do copiloto RADAR fases 13-15 (outcomes, objeções, uso/tokens, preferências do vendedor, pedidos de ajuda, momentos de aprendizado, notas de conversa) com RLS. Tudo já está na main (mesmo SQL, só formatação diferente) e aplicado em produção; nada a recuperar.

**`claude/feat-copiloto-edges-fases8-10-261024-1545`** — 2026-10-24 `46d6a02d9`  
<sub>verificada · apagar: sim</sub>

Branch criava 7 edges do copiloto de vendas (prazo, temperatura do lead, risco de perda, análise de mídia, objeções, ancoragem de preço, recomendação de produto) e as registrava no ESTADO.md. A main já tem as 7, em versão superior (validação zod da entrada, contrato de saída com envelope, testes, deps injetáveis, hooks em src/hooks/copilot que as chamam), via PR #2834 em 2026-11-10. Nada a recuperar.

**`claude/feat-copiloto-fases13-15-ddl-261024-1530`** — 2026-10-24 `0072cc1d1`  
<sub>verificada · apagar: sim</sub>

Migration DDL das 7 tabelas do copiloto RADAR fases 13-15 (help_requests, learning_moments, conversation_scores, outcomes, objection_catalog, usage, seller_settings) + regeneração do schema-catalog.json. Tudo já está na main: a migration entrou byte a byte idêntica como supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql (PR #2420) e está aplicada em produção com as 7 tabelas criadas; as policies abertas (USING true) da branch foram depois endurecidas de propósito na main (seller_id = auth.uid()). O catálogo da branch é snapshot antigo (2026-10-16) e o da main (2026-11-15) reflete o banco real.

**`claude/feat-evolution-rotas-pendentes-261112`** — 2026-11-12 `d7a90d1c2`  
<sub>verificada · reexaminada · apagar: sim</sub>

Restaurava na Edge evolution-api as rotas find-chats, offer-call, templates da Meta e catálogo (apagadas no #2054), com telas, hook useConnectionOptions e guarda de contrato front→Edge. Tudo já está em produção via pacote #3035 (squash cb6576b2a); os 6 arquivos com diferença são versões anteriores de conteúdo que a main tem em forma mais nova (artefatos gerados, lista de rotas maior, hook com opção extra, find-status-messages restaurada).

**`claude/feat-message-delivery-post-iniciado-261024-1719`** — 2026-10-24 `3d18fbf14`  
<sub>verificada · apagar: sim</sub>

Anti-reenvio duplicado de mensagem no WhatsApp quando o lease de 90s vence depois do POST ao provedor (PD-79) + código de erro estável na edge de envio (PD-80). Tudo já está na main e aplicado em produção: a migration foi renumerada para 20261111160000_outbound_post_started.sql (a versão 20261026210300 da branch colidia com outra já aplicada) e a main ainda vai além — a edge realmente chama mark_outbound_post_started, ligação que a própria branch deixou pendente ("COMPLETAR"). Produção confirma: função, coluna delivery_post_started_at e migration presentes. A triagem anterior (DECISAO_DONO) está refutada. Nada a recuperar.

**`claude/feat-message-delivery-post-iniciado-261101-1330`** — 2026-11-01 `ec9f2e9c3`  
<sub>verificada · apagar: sim</sub>

Branch fazia três coisas no envio de WhatsApp: impedir reenvio duplicado quando o provedor demora mais que o lease (carimbo do POST iniciado), dar código de erro estável no envio (número inválido, instância desconectada, limite) e permitir que o operador resolva à mão mensagens com entrega ambígua no chat. Tudo isso já está na main hoje, em versão igual ou mais estrita, e o banco está aplicado em produção. Nada a recuperar; reaplicar a migration da branch seria regressão.

**`claude/feat-message-delivery-post-iniciado-261101-1937`** — 2026-11-01 `229bb20a3`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

PD-79/C110: impede que uma mensagem de WhatsApp seja enviada duas vezes ao cliente quando o POST ao provedor já saiu (carimbo durável antes do POST) e dá ao operador um painel para resolver à mão as mensagens com entrega ambígua. Já está em produção: migration aplicada (20261111160000), coluna delivery_post_started_at, RPCs mark_outbound_post_started e resolve_unconfirmed_message, edge message-delivery, webhook e painel na inbox — tudo mergeado pela PR #2496 (commit 9727aaedd). A PR #2528 desta branch era um empilhamento sobre a #2496 e foi fechada pelo próprio autor; nada de negócio ficou de fora. A triagem anterior marcou DECISAO_DONO por engano: não há decisão pendente.

**`claude/feat-metas-seletor-periodo-261101-1208`** — 2026-11-01 `de9584f20`  
<sub>verificada · reexaminada · apagar: sim</sub>

Seletor Hoje/Semana/Mês na aba Metas (C130): título por período, faixa de datas, skeleton sem piscar 0%, prop title na GoalsTable e teste novo. Tudo já está na main pela PR #3125 (squash d4dddee87, 2026-11-14), que recuperou exatamente este trabalho.

**`claude/feat-radar-migration-261101-1550`** — 2026-11-01 `0789ca734`  
<sub>verificada · reexaminada · apagar: sim</sub>

Migration do motor do Copiloto RADAR (colunas em copilot_sessions/copilot_insights, semente da flag ai.capability.copilot_live desligada, trigger que agenda copilot.tick a cada mensagem do contato). O arquivo da branch está na main byte-idêntico, apenas renomeado de 20261030200000 para 20261115010000, e já aplicado em produção (função, trigger, 12 colunas e flag=false confirmados). Nada a recuperar.

**`claude/feat-radar-panels-8to15-261108-1906`** — 2026-11-08 `5472e4768`  
<sub>verificada · apagar: sim</sub>

Branch ligava o painel RADAR Fases 8-15 (objeções, catálogo, termômetro, coaching) na caixa de digitação da Inbox. A main já tem isso via PR #2809 (commit be8aa06a1, 2026-11-09), em versão superior: mesmos props mais daysSinceLastContact. PR #2820 era duplicata. Nada a recuperar.

**`claude/feat-remove-special-agent-261113`** — 2026-11-13 `08625ec76`  
<sub>verificada · apagar: sim</sub>

Remoção do rótulo morto `special_agent` do enum `app_role` (decisão do dono de 2026-11-03). Entrou inteira na main pelo pacote 5 (PR #3064, commit ab657aa34), com a migration renumerada para 20261113172000 e já APLICADA em produção: o enum hoje é admin,supervisor,agent e role_permissions não tem mais linha de special_agent. Nada a recuperar; a branch só carrega o número antigo da migration, e portar isso seria regressão.

**`claude/feat-talkx-relatorio-concluida-261112-1158`** — 2026-11-12 `331ceb96f`  
<sub>verificada · apagar: sim</sub>

Talk X: campanha concluída abre o Relatório (tela 14, ?screen=report) com exportação CSV/PDF em vez do monitor, com deep link resistente a lista em erro; cancelada segue no monitor. Tudo já está na main via pacote #3035 (squash cb6576b2a).

**`claude/feat-talkx-x053-breadcrumb-261102-1130`** — 2026-11-01 `21be44c62`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Trilha de navegação clicável no monitor do Talk X (item "Campanhas" volta à lista, substituindo o botão solto "Voltar à campanhas"). A mesma funcionalidade já entrou na main em 81a8cd979 (PR #2793, 2026-11-08), em forma melhor (botão da trilha com aria-label "Voltar à campanhas" e classes h-9/hover:bg-muted/50, mantendo o teste antigo válido). Só falta uma asserção de teste do clique, de valor baixo.

**`claude/feat-talkx-x054-cmdk-261108-0100`** — 2026-11-07 `2bbbe224e`  
<sub>verificada · apagar: sim</sub>

X054 (⌘K com dono único: itens Talk X via useQuery com enabled, botão "Buscar (⌘K)" e trilha clicável no TalkXView, listener ⌘K duplicado removido) já está em produção pela PR #2793 (81a8cd979), que substituiu explicitamente a PR #2788 corrigindo os erros de TypeScript da branch; #2869 (e903a7e51) ainda melhorou as queryKeys para evitar envenenamento de cache. Os únicos resíduos da branch fora da main são regressões que a main rejeitou de propósito (remoção da busca de contatos no ⌘K, paddings duplicados no Talk X já removidos por #2712) ou cosméticos sem efeito (listener open-global-search num componente legado não montado no app).

**`claude/feat-talkx-x058-campaign-queue-segment-261101-2300`** — 2026-11-01 `74ac91878`  
<sub>verificada · apagar: sim</sub>

A RPC X058 talkx_campaign_queue_by_segment (totais da fila e breakdown por segmento de uma campanha Talk X) já existe na main em outra migration (20261108203000, PR #2833, que cita #2531), está aplicada em produção e é consumida pelo relatório de campanha com teste. A versão da main é a que a UI espera (inclui "Sem segmento"); a da branch excluiria destinatários sem segmento. Nada a portar.

**`claude/feat-talkx-x074-analytics-rpcs-261101-2300`** — 2026-11-01 `2f1dc1a11`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

As 3 RPCs analíticas do Talk X (heatmap hora×dia, top segmentos, ranking de campanhas) desta branch já estão na main via migration 20261108201000 (PR #2833, que cita #2529), aplicadas em produção e consumidas por TalkXAnalytics.tsx. Única diferença é formatação e ausência de COMMENT ON FUNCTION (sem valor de negócio).

**`claude/feat-talkx-x086-template-metrics-rpcs-261101-2300`** — 2026-11-01 `421226c4a`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch criava as 2 RPCs de métricas de templates do Talk X (X086): talkx_template_metrics(uuid) e talkx_template_library_kpis(). A main já tem ambas, reimplementadas de propósito na PR #2833 (migration 20261108202000, que cita #2530 como origem) e aplicadas em produção. Só difere a forma do payload (campos extras best_reply_rate_pct/by_category/top_used na branch), sem nenhum consumidor no front. Nada a recuperar.

**`claude/feat-teamchat-cid-261021-0758`** — 2026-11-01 `c6d0f9780`  
<sub>verificada · apagar: sim</sub>

Receptor do deep-link ?cid= no chat da equipe (clique na notificação abre a conversa certa). A main já tem implementação mais completa (remove cid da URL, espera lista carregar, refetch para conversa recém-criada, não desfaz seleção manual) e testes que cobrem os 4 cenários da branch; lado emissor também já passa cid. Nada a recuperar.

**`claude/feat-x051-talkx-lifecycle-2611081915`** — 2026-11-09 `bbdf443d4`  
<sub>verificada · apagar: sim</sub>

Branch trocava os modais locais de Pausar/Cancelar da tela "Campanha em Andamento" (Talk X) pelo diálogo único de ciclo de vida (X051). A main já tem isso desde a PR #2555 (a49ef4ad5, 13/11), em forma melhor (useTalkXLifecycleWith, reaproveitando o useTalkX já montado); a main inclusive tem teste que rejeita a forma exata da branch. Nada a recuperar.

**`claude/fix-ci-talkx-report-test-261108-2152`** — 2026-11-08 `5c97aa006`  
<sub>verificada · reexaminada · 2 lacuna(s) · apagar: sim</sub>

Branch só restaurava os testes do relatório de campanha Talk X apagados pelo #2550 para destravar o CI da main. A main já recebeu em 568d3f932 (2026-11-09) uma suíte maior (12 testes vs 3) com a mesma intenção: série por dia, heatmap 7x24, três gráficos renderizados e série Conversões ausente. Nenhum impacto de negócio pendente.

**`claude/fix-ci-tests-batch2-2610-1830`** — 2026-10-24 `af0bb57e2`  
<sub>verificada · 7 lacuna(s) · apagar: sim</sub>

Branch de 7 correções pequenas de CI/bugs (limpar fila de envio offline no logout, canal único de notificações do chat interno, clique da notificação, isolamento da fila offline por atendente, aria-labels de TTS). Tudo isso já está na main, em versão igual ou melhor. O único conteúdo exclusivo da branch é o último commit, que APAGOU três arquivos (ESTADO.md, useWarRoomAlerts.ts e o teste filesPeriod adversarial) — destruição, não trabalho. Nada a recuperar; apagar a branch é seguro e evita que alguém reaproveite o commit destrutivo.

**`claude/fix-claude-md-gr011-261102-0100`** — 2026-11-02 `631d210e3`  
<sub>verificada · apagar: sim</sub>

Branch só corrigia docs: lista de required checks da main de 6 para 3 (CI Gate, Build, TypeCheck) no CLAUDE.md. O CLAUDE.md da main hoje é só `@AGENTS.md` (#2762) e a seção migrou para docs/agentes/github-ci.md, que já registra exatamente os 3 checks, strict=true e CodeQL como não-required; baseline JSON também já tem os 3. Nada a recuperar.

**`claude/fix-codeql-checkout-sha-261109-1920`** — 2026-11-09 `7bf81f91c`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Fechar alertas CodeQL #66-70 trocando o ref dos checkouts do workflow E2E isolado por github.sha. A mesma correção já entrou na main por outro commit (32129d82b); o único resíduo da branch é texto sem acento (efeito colateral do agente), que contraria o padrão da main e não deve ser portado.

**`claude/fix-console-gmail-409-261112`** — 2026-11-12 `3e4a44373`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Gmail: não repetir sync em 409 (em andamento/reauth_required), aviso de sincronização em andamento e tela oferecendo "Reconectar" quando a conta precisa de reautenticação. Tudo já está na main (via #3035, squash cb6576b2a) e a main foi além (mesma política de retry em syncLabels e guarda needsReconnect no EmailChatInbox).

**`claude/fix-console-sip-gate-261112`** — 2026-11-13 `25e6e43c3`  
<sub>verificada · reexaminada · apagar: sim</sub>

Telefonia SIP: trava "SIP não configurado" com prazo (não provisiona a cada carregamento quando o segredo falta), aba líder automática respeita a trava e botão "Reconectar linha" ignora a trava. Tudo já está na main via pacote #3035 (cb6576b2a) e evoluído em #3046.

**`claude/fix-console-status-msgs-261112`** — 2026-11-12 `c06fadc2a`  
<sub>verificada · reexaminada · apagar: sim</sub>

Restaurava a rota find-status-messages na edge evolution-api e fazia o painel do contato parar de gerar 404 no console ao buscar Status/Stories (memória por instância de "status indisponível"); via merges irmãos trazia também rotas Evolution restauradas, offer-call, templates da Meta e seletor de conexão. Tudo já está na main pelo pacote #3035 (squash cb6576b2a); o que resta na branch são docs/artefatos gerados já superados.

**`claude/fix-console-typing-closed-261112`** — 2026-11-13 `43c34c85e`  
<sub>verificada · reexaminada · apagar: sim</sub>

Fix do inbox que eliminava o aviso duplo "Typing presence channel not subscribed: CLOSED" a cada troca de conversa (flag disposed no desmonte, removeChannel único, espera canal saindo, prop enabled no ChatPanel) mais 2 testes. Tudo já está na main via squash cb6576b2a (#3035); o CONFLICT mecânico em useTypingPresence.ts é falso positivo por reindentação do bloco dentro de open().

**`claude/fix-conversas-go-perf-261113`** — 2026-11-13 `bb3a00877`  
<sub>verificada · reexaminada · apagar: sim</sub>

Correções da Evolution GO (recibos com aparelho/lid, editar mensagem, remover reação, envios sem cabeçalho), "marcar não lida" no Zapp e desempenho de metas/próxima ação (consultas em paralelo com cache, aba oculta não consulta) já estão todas em produção via pacote 4 (#3063, squash d084ca753). Main ainda melhorou dois pontos (allSettled nas metas, refetchOnMount na próxima ação). Nada a recuperar.

**`claude/fix-conversas-p0-p1-backend-261113`** — 2026-11-13 `7002ba64c`  
<sub>verificada · 4 lacuna(s) · apagar: sim</sub>

Auditoria Conversas P0/P1 (envio nunca cai em conexão de teste, transferência única com compare-and-set inclusive sem dono, FSM de status só por RPC com 'Aguardando' não arquivável, autor do encerramento, varredura de mensagens presas em 'enviando' e agendada em conexão caída). Tudo isso já está na main e aplicado em produção: entrou pela PR #3064 (pacote 5, merge ab657aa34) e ainda recebeu melhorias depois. O 'MISTO_CONFLITO' é falso positivo: as 4 migrações ditas ausentes estão na main com outro número (1302xx/1304xx/1305xx/1306xx viraram 1713xx/1714xx/1715xx/1716xx, porque nunca foram aplicadas e tiveram de subir acima do pacote 170000..171200), e quase toda 'linha faltando' nos arquivos TS/SQL/doc é só a string desse número. Nada a recuperar; portar qualquer trecho desta branch seria regressão.

**`claude/fix-copilot-brinde-state-261101-1500`** — 2026-11-01 `bbccc427f`  
<sub>verificada · apagar: sim</sub>

Migration que cria a coluna copilot_sessions.brinde_state (estado B·R·I·N·D·E do Copilot, CV-026) para a RPC merge_brinde_state funcionar. Já está na main via PR #2815 com DDL idêntico e aplicada em produção; a única diferença são comentários em ASCII sem acento (sem efeito).

**`claude/fix-db-guard-b0c-261024-1527`** — 2026-10-24 `4aab75adf`  
<sub>verificada · apagar: sim</sub>

Correção do backfill da migration de recibos/reações do chat de equipe (TC-009, assertion B.0c): impedir que o trigger de UPDATE preenchesse read_at em recibos legados ao reconciliar conversation_id. A main resolve o mesmo problema com DISABLE/ENABLE TRIGGER específico (PR #2282, commit 4efaa6db0), abordagem mais segura e já aplicada em produção. Nada a recuperar.

**`claude/fix-deno-check-config-261102-0630`** — 2026-11-02 `cee44e042`  
<sub>verificada · apagar: sim</sub>

Correção do typecheck das edge functions no CI (deno check --config apontando para supabase/functions/deno.json) já está na main via PR #2575 (commit 84b8b149e, mesmo dia), que resolveu o mesmo problema com escopo maior (cd + --config). Única diferença residual é texto de comentário.

**`claude/fix-department-invites-rls-261114-1200`** — 2026-11-14 `14a17d19d`  
<sub>verificada · apagar: sim</sub>

Fecha furo de segurança: qualquer usuário autenticado lia códigos de convite de qualquer departamento (policy SELECT com USING(true)); passa a exigir admin, igual às policies de INSERT/DELETE já restritas. Inclui teste em Postgres descartável. Tudo já está na main (pacote 6, #3113) e aplicado em produção.

**`claude/fix-deploy-deno-frozen-v2`** — 2026-10-31 `ae1adcf5f`  
<sub>verificada · apagar: sim</sub>

Fix de CI para destravar o deploy das edge functions (typecheck falhava por @types/node ausente). A intenção — `deno install --frozen=false` e `@types/node` declarado em `supabase/functions/deno.json` — já está na main por outras PRs (#2422, #2567). A única diferença da branch (remover o `npm install @types/node`) foi deliberadamente revertida pela main em #2855 porque o `deno install` sozinho não resolvia o erro; portar isso reintroduziria a falha. Nada a recuperar.

**`claude/fix-deploy-functions-types-node-011101`** — 2026-11-08 `e5e03afa5`  
<sub>verificada · apagar: sim</sub>

Branch que destravava o deploy das edge functions (deno install --frozen=false + npm install @types/node + deno check --config) e tornava o preflight do catálogo PromoGifts tolerante a timeout. Tudo já está na main com texto idêntico (commits #2567, #2590, #2855); a única linha ausente é um pin antigo do supabase/setup-cli (v3.1.0) já superado pela main (v3.2.0 via Dependabot). O arquivo .github/ci-refresh é vazio, só re-disparo de CI.

**`claude/fix-e2e-logado-w71-gr029-261102`** — 2026-11-01 `e00c8857b`  
<sub>verificada · apagar: sim</sub>

A branch trocava o gatilho do workflow "E2E logado" de push na main para workflow_run após o CI/CD Pipeline passar (GR-029/W71). O mesmo GR-029 entrou na main no mesmo dia por outro PR (#2569, commit 50ca61a6e) com diff funcionalmente idêntico, e foi depois endurecido em #2717 (afd8c7ca3). Nada funcional ficou de fora; os hunks restantes são comentário, emoji ou ajuste redundante de concurrency.

**`claude/fix-e2e-mock-app-bootstrap-261024-1527`** — 2026-10-24 `33e6cd02c`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

A branch adicionava mock do RPC app_bootstrap nas fixtures E2E do Mapa para o ProtectedRoute não travar em "Verificando permissões...". A main já faz isso desde 82e22bbb8 (2026-10-28), com mock mais completo (payload BOOT_FAKE em vez de {}) e precedência por ordem de registro em vez de alterar o lookahead do catch-all. Nada funcional a recuperar; só o comentário de cabeçalho não cita app_bootstrap (cosmético).

**`claude/fix-e2e-onboarding-modal-oculta-261114-0709`** — 2026-11-14 `eeeace208`  
<sub>verificada · apagar: sim</sub>

Fixture E2E do onboarding (gotoOnboardingContacts) passava a aceitar elementos sob aria-hidden do WelcomeModal via includeHidden:true em main/heading/tab. A main já tem exatamente isso pela PR #3071 (commit 58f1713ba), com texto diferente e escopo até mais estrito (tab Todos dentro do main). Nada a portar.

**`claude/fix-eslint-no-secret-compare-261110-2350`** — 2026-11-12 `847ffd1c4`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

A regra de lint que proíbe comparar credencial com === estava acusando falso positivo em teclas do teclado (Escape, Enter, Ctrl), o que forçava desativar a regra em telas do Talk X. O conserto da regra, o teste que o protege, o registro na CI e a limpeza das telas já estão todos na main. Nada a recuperar: as duas "lacunas" apontadas pela máquina são ruído de arquivo gerado (baseline de lint) e um caminho de arquivo que a main renomeou de propósito — portar a linha da branch pioraria a documentação.

**`claude/fix-esm-sh-import-regression-261108-2319`** — 2026-11-08 `60514ecae`  
<sub>verificada · apagar: sim</sub>

Branch trocava imports esm.sh por npm: em 2 edges e restaurava o teste truncado do relatório de campanha Talk X. As duas edges já estão idênticas na main (via #2865, 2026-11-11; só aspas diferem) e o teste foi recriado na main com 12 casos (568d3f932 + #3035) cobrindo as mesmas intenções da branch (3 casos) e mais. Nada a recuperar.

**`claude/fix-esm-sh-regression-261108-2320`** — 2026-11-08 `db7fc3750`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch trocava o import esm.sh por npm: em external-db-proxy e cleanup-rate-limit-logs (evita falha "Integrity check mismatch" no deploy das edges). A main já tem exatamente essa troca via PR #2865 (commit 71123cc07), que ainda atualizou o deployment-manifest.json. O restante do diff da branch (-74 linhas) é só remoção de comentários de documentação de segurança e troca de aspas — sem efeito funcional e sem valor; a main mantém os comentários.

**`claude/fix-esm-sh-regression-261108-2340`** — 2026-11-10 `890f8996a`  
<sub>verificada · apagar: sim</sub>

Branch trocava o import de @supabase/supabase-js de esm.sh para npm: em 2 edges (external-db-proxy, cleanup-rate-limit-logs) e regenerava o deployment manifest. A main já recebeu exatamente esse fix via PR #2865 (commit 71123cc07) e o manifest da main já foi regenerado várias vezes depois, consistente com os fontes atuais. PR #2868 era duplicata; nada a recuperar.

**`claude/fix-evolution-instance-bypass-261112`** — 2026-11-13 `7379d8fcd`  
<sub>verificada · reexaminada · apagar: sim</sub>

Edge evolution-api: validar instância usada, codificar groupJid/number, não vazar erro interno, restaurar rotas (find-status-messages, offer-call, templates Meta, catálogo) e degradar Status/Stories no painel do contato. Tudo já está na main via pacote #3035 (squash cb6576b2a); as 6 "lacunas" mecânicas são reindentação, âncoras/coberturas de docs regeneradas e manifest gerado.

**`claude/fix-evolution-integra-cadeia-261113-1052`** — 2026-11-13 `1c341407a`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch integradora da cadeia Evolution (#3008→#3020→#2999→#3024, PR #3030): restaura rotas da evolution-api (status, chats, offer-call, templates Meta, catálogo), valida groupJid/number, esconde erro interno no 500 e degrada Status/Stories no painel do contato. Tudo entrou na main pelo pacote #3035 (cb6576b2a); o que diverge hoje é só artefato gerado (manifest, âncoras do ESTADO.md, números de cobertura) e evolução posterior da própria main (useConnectionOptions ganhou onlyConnected; connect da GO reescrito no #3045).

**`claude/fix-evolution-rotas-orfas-261112`** — 2026-11-12 `125b39d39`  
<sub>verificada · reexaminada · apagar: sim</sub>

Restaurava 8 rotas da Edge evolution-api que o front chamava e respondiam 404/403 (set-settings, get-settings, get-webhook, set-presence, send-template, mark-unread, invite-info, toggle-ephemeral) e criava guardas de teste front→roteador. Tudo já está na main (pacote #3035, cb6576b2a) e foi além: find-status-messages e mais 7 rotas também cobertas pela guarda.

**`claude/fix-external-db-bridge-column-injection-261108-2319`** — 2026-11-12 `bc00f4027`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

A correção de segurança que esta branch (PR #2879) trazia — validar nome de coluna e operador antes de repassar `params.filters`/`params.order` ao cliente service_role da edge `external-db-bridge`, que ignora RLS — já está na main, em versão estritamente mais forte, trazida pelo commit dac285f62 (#3138): além do `validIdentifier` da branch, a main bloqueia nomes de controle do PostgREST (select/or/and/not/order/limit/offset/on_conflict/columns), limita filtros (20) e itens de `in` (1000), exige valor escalar e escapa aspas na lista do `in`. O teste `filters-validation.test.ts` da branch está byte a byte na main e cita #2879 no cabeçalho. As demais diferenças são artefatos: `scripts/ci/deno.lock` é o mesmo JSON apenas minificado (igualdade semântica comprovada) e `deployment-manifest.json` são hashes gerados que a main já tem corretos. Atenção: a branch está atrás da main e seu último commit (bc00f4027) reaplicou a validação FRACA por cima da endurecida que veio num merge de main — mergeá-la hoje seria regressão de segurança e quebraria o próprio teste, que importa `parseFilters`. Nada a recuperar.

**`claude/fix-external-db-bridge-validation-261108-2335`** — 2026-11-08 `413e05cc7`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch endurecia a edge external-db-bridge (rejeitar coluna/operador inválidos com 400) e restaurava o teste truncado de TalkXCampaignReport (X164). A main já tem a validação da edge em versão mais forte (SEC-Z018 + #3138: nomes reservados PostgREST, limite de filtros, validação de valor/in/is) e o teste foi restaurado por outro commit com 12 testes cobrindo a mesma intenção. Manifest da branch é obsoleto (hashes de código antigo; main já regenerou e o sha bate com o arquivo atual).

**`claude/fix-fila-merge-retry-json-261101-1605`** — 2026-11-01 `e5abad156`  
<sub>verificada · apagar: sim</sub>

Branch (PR #2492) duplicava a PR #2447: retry em fila-merge.mjs para JSON truncado, mock de getBoundingClientRect no teste de paginação do inbox e docs CI de 2026-10-31. Tudo entrou na main em 3617a2acd (#2447, 2026-11-01). O script fila-merge.mjs foi depois removido de propósito (#3113, 2026-11-14) porque o dono desativou a fila serial auto-update-pr-branch em 11/11 (docs/agentes/github-ci.md:58-62). Docs já arquivadas em docs/_arquivo/. Nada a recuperar.

**`claude/fix-fila-offline-sem-dono-261025-2110`** — 2026-10-25 `e84afb824`  
<sub>verificada · 5 lacuna(s) · apagar: sim</sub>

Branch-coletora de ~100 commits (fila de envio offline sem dono + correções de inbox, Talk X, admin, segurança e testes). O fix que dá nome a ela e a migration estão na main e em produção. Nenhuma das 25 lacunas é trabalho perdido: 19 arquivos já estão na main reescritos/renomeados (frequentemente superiores), 3 ficaram obsoletos porque a main corrigiu de propósito em sentido contrário (notadamente templates de WhatsApp: a branch travava o supervisor, mas a RLS de produção permite supervisor) e 4 são artefatos gerados. Nada a portar; branch pode ser apagada.

**`claude/fix-gmail-409-integra-261113-1102`** — 2026-11-13 `a15b724b9`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Gmail: sync não repete chamada em 409, UI avisa "sincronização em andamento" e conta com sessão expirada (reauth_required) recebe pedido de reconexão em vez de "em andamento". Tudo já está na main (pacotes #3035 e #3046), que inclusive foi além (guarda extra e teste adicional).

**`claude/fix-gmail-oauth-token-expose-20261108-1900`** — 2026-11-12 `6c4610ef7`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Fix de segurança: a edge gmail-oauth (action refresh) deixava de devolver o access_token do Google ao navegador, retornando só expires_at. O comportamento já está em produção na main pelo commit 623f37bc1 (SEC-Z017, 2026-11-12). O que a branch tem a mais são 2 linhas de comentário e um deployment-manifest.json desatualizado (artefato gerado).

**`claude/fix-gr011-required-checks-311031`** — 2026-11-01 `ebc6956fb`  
<sub>verificada · apagar: sim</sub>

Branch docs-only (1 commit útil, 19821da9) que corrigia no CLAUDE.md a contagem de required checks da main de 6 para 3 (🏗️ Build, 🔎 TypeCheck, ✅ CI Gate). A mesma correção entrou na main em ac04c5c03 (#2565, 2026-11-02); depois o CLAUDE.md virou só `@AGENTS.md` (effd6b0bb, #2762) e a tabela canônica com os 3 checks vive hoje em docs/agentes/github-ci.md:31 e em scripts/ci/github-settings-baseline.json. Nada a recuperar.

**`claude/fix-gr016-playwright-workers-011101`** — 2026-11-01 `901357404`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Fix GR-016 (Playwright com 2 workers também no CI, para o Email fixture não estourar timeout) já está na main via PR #2560 (commit a7a53f567, mesmo dia). A branch não traz nada além disso: as outras diferenças são acentos em comentários e um arquivo vazio `.github/ci-refresh` usado só para re-disparar o CI da PR #2536.

**`claude/fix-grants-baseline-pos-2822-261111`** — 2026-11-11 `d27cb593e`  
<sub>verificada · apagar: sim</sub>

A branch queria impedir que a chave de servidor (service_role) executasse a RPC mark_pause_investigated, editando uma migration já aplicada (inócuo em produção). A main entregou o mesmo efeito do jeito certo, via migration nova 20261112160000 (PR #3027), já aplicada; produção confirma service_role sem EXECUTE e authenticated com EXECUTE. Nada a recuperar.

**`claude/fix-high3-fk-indexes-261101-1830`** — 2026-11-01 `65012f35e`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch criava 48 índices em colunas de chave estrangeira (HIGH-3 da auditoria de performance). A main já tem a mesma migration (20261031170000_high3-fk-indexes.sql) com os mesmos 48 CREATE INDEX; a diferença é só formatação (1 linha por statement na main, 2 linhas + 4 comentários de cabeçalho na branch). A migration está registrada no ledger de produção e os 48 índices existem no banco. Nada a recuperar.

**`claude/fix-inventario-vault-cron-edges-261111-0315`** — 2026-11-13 `79fa2ea51`  
<sub>verificada · apagar: sim</sub>

Corrige falso positivo do inventário de edges: funções chamadas só por pg_cron com URL no Vault (talkx-scheduler, talkx-storage-purge) apareciam como "sem chamador". Fix, teste, ripgrep na CI e inventário regenerado já estão na main (via #3064, commit ab657aa34), em versão melhorada (ignora menções só em comentário SQL).

**`claude/fix-lint-mediamigration-service-261101-1250`** — 2026-11-01 `8fa57120c`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Extração da lógica de banco do MediaMigrationTool (admin) para src/services/mediaMigration.service.ts, para passar no lint no-restricted-imports; sem efeito funcional para o usuário. A mesma extração já entrou na main pela PR #2816 (cf79d70dd, 2026-11-10), inclusive âncoras em ESTADO.md/FEATURE_REGISTRY.md. Única diferença restante é a estratégia de mock do teste de progresso, com asserções idênticas e teste da main verde no CI.

**`claude/fix-merge-contato-telefone-secundario-261114-0000`** — 2026-11-14 `5ed381c55`  
<sub>verificada · apagar: sim</sub>

Fix da mesclagem de contatos que travava (23505 em contacts_phone_key) quando o usuário escolhia manter o telefone do contato secundário: reordena o UPDATE do primário para depois do DELETE dos secundários em merge_contacts_atomic, mais teste offline em scripts/db-audit. Tudo já está na main (pacote 6, #3113) e aplicado em produção.

**`claude/fix-migration-drift-20261102012200-261102-0900`** — 2026-11-02 `c70065af7`  
<sub>verificada · apagar: sim</sub>

Branch só adicionava o arquivo da migration 20261102012200 (convites de departamento: só admin cria/apaga; RPC create_department_invite exige admin). A main já tem a mesma versão com outro nome (20261102012200_department_invites_restringe_escrita.sql, commit d45033e81, PR #2570), com DDL idêntico; produção tem a versão no ledger, as 4 policies e a função conforme a migration — e versões posteriores da main (20261108090000 search_path, 20261114121000 SELECT admin) superam a da branch. Mergear criaria versão duplicada em supabase/migrations.

**`claude/fix-multiplix-retomar-seguro-261114`** — 2026-11-14 `941d989d2`  
<sub>verificada · apagar: sim</sub>

Multiplix: "Retomar" confirma a retomada pela mudança de status no servidor (sem esperar o lote inteiro e cair no timeout do gateway) e disparo legado pausado sem fila passa obrigatoriamente pelo "Iniciar" com confirmação (banco e worker recusam o atalho). Tudo já está na main (pacote 6, #3113) e a migration está aplicada em produção.

**`claude/fix-n011-dinamico-261021-0759`** — 2026-10-31 `77de63cb9`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Branch ajustava o teste offline do guard N-011 (dedup de policies de storage). O commit útil original (0913cfeb5, teto dinâmico por domínio) foi superado pela reescrita do arquivo no #2156 (4b9585052, 2026-10-21) e a própria branch foi depois sincronizada com a main (77de63cb9). Hoje o tip difere da main apenas em 2 linhas de comentário reformatado; zero código perdido. Teste roda verde na main (15 pass / 0 fail).

**`claude/fix-pd79-resolve-somente-sending-261112-1005`** — 2026-11-13 `ef837c437`  
<sub>verificada · reexaminada · 2 lacuna(s) · apagar: sim</sub>

PD-79: resolução manual de mensagem não confirmada só para mensagem em 'sending' com lease vencido (edge message-delivery, painel de não confirmadas na UI, migration da RPC resolve_unconfirmed_message). Tudo entrou na main pelo pacote #3046 (squash f32855df6) e a migration 20261112170000 está aplicada em produção. As 10 linhas de lacuna são artefatos gerados (âncoras de linha no ESTADO.md e hashes do deployment-manifest.json) já superados por versões mais novas na main.

**`claude/fix-reconcilia-261026-sem-ci-261102-0912`** — 2026-11-02 `757b6b362`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

Branch sem CI que duplica trabalho já mergeado na main pela PR #2615 (commit 4908feacd, 02/11/2026): criar a migration reservada 20261026240300_drop_bkp_261023.sql, registrar 3 falhas esperadas do replay local e corrigir a asserção B.0c do teste TC-009 (recibos/reações do Team Chat). Nada a recuperar: as diferenças que restam são evolução deliberada da main depois do merge (guards de idempotência nas migrations 220300/230300, tombstone do DROP destrutivo) mais uma corrupção de arquivo na própria branch — o teste team-receipts-reactions-conversation-id.test.sh está truncado em 5.933 bytes contra 28.684 na main, com lixo binário dentro. Restaurar qualquer coisa dela pioraria a main. Branch pode ser apagada.

**`claude/fix-reconcilia-migrations-20261026-261101-2230`** — 2026-11-01 `06ae04404`  
<sub>verificada · 4 lacuna(s) · apagar: sim</sub>

Branch criava o arquivo da migration 20261026240300 (DROP do schema de backup _bkp_261023), registrava 3 falhas esperadas no replay local e corrigia a asserção B.0c do teste TC-009. O mesmo trabalho entrou na main pela PR #2615 (4908feacd). Os deltas restantes são ruído (emoji no ci.yml, escape de aspas no teste) ou foram superados de propósito na main (guards IF EXISTS nas migrations 220300/230300 dispensaram as entradas de replay; o DROP ativo virou tombstone + cópia em _superseded/ para não repetir DDL destrutivo). Nada a recuperar.

**`claude/fix-revogar-grants-escrita-anon-261025-2115`** — 2026-10-25 `eb8e6ad19`  
<sub>verificada · apagar: sim</sub>

Branch queria tirar do usuário anônimo o poder de inserir/alterar/apagar/truncar em todas as tabelas públicas, preservando só o INSERT do fluxo "Esqueci a senha". Isso já está na main e aplicado em produção por outras duas migrations; em produção o anon só tem INSERT em password_reset_requests. O arquivo da branch ainda colidiria com uma migration já existente de mesma versão (20261026220300_classificar_rls_sem_policy). Nada a recuperar.

**`claude/fix-rls-department-invites-261101-2222`** — 2026-11-01 `15d1d4990`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Convites de departamento só criados/apagados por admin, via RPC create_department_invite gravando em department_invitations (tabela que o aceite lê). Tudo entrou pela PR #2570 (commit d45033e81) e está aplicado em produção; a regra está documentada em docs/agentes/regras-dominio.md. Só falta 1 linha cosmética na tabela do README do módulo.

**`claude/fix-rls-update-org-261101-1420`** — 2026-11-01 `4cc19fc6c`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Fechamento do achado de auditoria CRITICAL-2 (falso positivo: sistema single-tenant): migration que adiciona WITH CHECK explícito (= USING) em 8 policies UPDATE (contacts, calls, message_templates, payment_links, sales_deals, talkx_campaigns, talkx_recipients, talkx_templates), sem efeito comportamental. A main já contém o mesmo arquivo com SQL idêntico (formato condensado do ledger, sem comentários) e a migration está aplicada em produção com as 8 policies com with_check preenchido.

**`claude/fix-talkx-command-cache-261108-2320`** — 2026-11-08 `d64b521fe`  
<sub>verificada · apagar: sim</sub>

A branch isolava as queryKeys da paleta Ctrl+K do Talk X (campanhas, segmentos, templates) para o cache reduzido da paleta não corromper as telas completas. A main já faz exatamente isso via PR #2869 (commit e903a7e51), com subchave 'cmd-palette' em vez do sufixo '-palette' — abordagem equivalente e até melhor (mantém a família de chaves, então as invalidações das telas ainda alcançam a paleta). Nada a recuperar.

**`claude/fix-talkx-report-test-suite-261108-2355`** — 2026-11-08 `784bb18a7`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

A branch restaurava a suíte de testes do relatório de campanha Talk X que o PR #2550 apagou (CI com "No test suite found"). A main já resolveu isso com uma suíte maior (commit 568d3f932, 12 testes vs 3 da branch), cobrindo agrupamento por dia/hora no fuso, mapa de calor 7x24, os três cartões do relatório e ausência da série Conversões; os componentes individuais têm testes próprios. Nada relevante ao negócio ficou de fora.

**`claude/fix-talkx-wizard-remonta-rascunho-261114-0715`** — 2026-11-14 `04d30bf95`  
<sub>verificada · apagar: sim</sub>

Talk X: evitar que o primeiro autosave de uma campanha nova remonte o editor e descarte o que o usuário mudou depois (flaky E2E webkit talkx.spec.ts:213). O mesmo defeito, no mesmo ponto, já foi corrigido na main pela PR #3073 (4432834d6) reaproveitando localDraftRouteId, e refinado pela #3087 (6423dc237); os dois cenários do teste novo da branch já têm teste equivalente em TalkXView.route.test.tsx. A linha de ESTADOS.md é gerada e a main já está regerada com números mais novos.

**`claude/fix-talkx-x006-test-limites-261101-2130`** — 2026-11-01 `992c155d1`  
<sub>verificada · apagar: sim</sub>

Branch só adicionava 4 testes unitários de limitsPayload (segundos→ms, janela HH:mm→HH:mm:00, janela vazia→null) no Talk X. Todas as asserções já existem na main em outros arquivos de teste (TalkXLimitsDialog.test.tsx, TalkXCampaignRunning.limits.test.tsx, talkxLimits.test.ts), que inclusive cobrem mais (bug do Math.max silencioso, lista branca da RPC). Nada a portar; a única diferença residual é 1 linha de comentário cosmético.

**`claude/fix-talkxcampaignreport-tests-261109-0400`** — 2026-11-09 `2a4c94374`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch criava a suíte real de testes (12 casos) do relatório de campanha Talk X para destravar o CI. A main já tem os mesmos 12 testes byte a byte (commit 568d3f932) mais um 13º teste de falha de PDF, com a fixture tipada em vez de `as any`. Nada a recuperar; a branch pode ser apagada.

**`claude/fix-team-chat-deeplink-261108-1932`** — 2026-11-13 `eb15216f3`  
<sub>verificada · reexaminada · apagar: sim</sub>

Deep-link ?cid= do Chat da Equipe (notificação abre a conversa certa, limpa a URL, recarrega a lista uma vez e descarta sem tirar o usuário da conversa aberta). Tudo já está na main (pacotes #3035 e #3046), e a main ainda corrigiu o caso de perfil não carregado (isPending). Nada a portar.

**`claude/fix-templates-supervisor-knowledge-261025-2110`** — 2026-10-25 `101da0968`  
<sub>verificada · apagar: sim</sub>

Lote de 101 commits (templates WhatsApp só graváveis por admin/supervisor, Base de Conhecimento sem travar, erro visível em painéis, Talk X Segmentos/campanha pausada/ponte Singu, fila offline por usuário, reação única por autor, PhoneInput E.164, dezenas de testes). Tudo já está na main — em vários pontos a main foi além (tela de relatório do Talk X, tolerância de relógio nas conquistas, RPC de arquivamento em lote, fila offline mais rígida). Nada a recuperar; migration do KPI já aplicada em produção.

**`claude/fix-testes-unitarios-minimo-251025-1230`** — 2026-10-25 `c1952c450`  
<sub>verificada · apagar: sim</sub>

Branch (PR #2249) corrigia 3 testes unitários vermelhos (tooltip do HighContrastToggle, mock de canal em TalkXA11yNomePapel, nome acessível dos selects Categoria/Status do editor de template) e 2 fixes de runtime: logout esvazia a fila de envio offline e o canal de notificações do chat de equipe usa tópico único + preferências por ref (HZ5-09). Tudo já está na main com texto diferente mas mesma intenção, trazido pelo commit e1f2ee4dd (2026-10-27). Nada a recuperar.

**`claude/fix-types-rpc-ausentes-251025-1230`** — 2026-10-30 `ef39213ef`  
<sub>verificada · apagar: sim</sub>

Branch adicionava manualmente 9 assinaturas de RPC em src/integrations/supabase/types.ts. Todas as 9 já existem na main, geradas automaticamente a partir do banco (commit 21e828e43, #2357, 2026-10-30); transfer_conversation na main está até mais completa (p_expect_unassigned, #3070). As 20 linhas "faltantes" são só diferença de formato do gerador (Args: never vs Record<PropertyKey, never>, sem "| null"). Nada a recuperar.

**`claude/fix-unit-tests-createlogger-261019-1620`** — 2026-10-19 `e34c3f4dc`  
<sub>verificada · apagar: sim</sub>

Branch de correção de CI (PR #2110): adicionava o mock `createLogger` em 20 testes unitários e `PGUSER=postgres` num step do db-guard. Os 20 testes já têm na main mocks `createLogger`/`getLogger` mais completos (com `withCorrelation`), e a necessidade do PGUSER é atendida pelo docker-shim E47 (`POSTGRES_SERVICE_USER=postgres`), com db-guard e ci.yml verdes em main. Nada a recuperar.

**`claude/fix-unit-tests-main-261019-1500`** — 2026-10-23 `eec06ea3e`  
<sub>verificada · apagar: sim</sub>

Branch de 1 commit (PR #2097, fechada 01/11) que só queria fazer 3 testes unitários da main passarem: expor `error` no hook da Base de Conhecimento, marcar `lead_origin` como "em breve" e bloquear `real_sector`/`real_uf` nos filtros de segmento Talk X. Tudo isso já está na main (commits e1f2ee4dd, 0b77f8641/#2335, a0e21b651, a6fbadfa3/#2240), em forma igual ou melhor. A única mudança da branch ausente da main é um bug (escapar `|` em `quoted` transforma `a|b` em `a\"b`), apontado pelo Qodo e corretamente rejeitado. Nada a recuperar.

**`claude/fix-z011bc-timing-safe-261018-1855`** — 2026-10-18 `626811d3a`  
<sub>verificada · apagar: sim</sub>

Branch (PR #2091) trocava comparação de segredos por timingSafeStringEqual em duas edges (searchbox-budget-alert, whatsapp-webhook) e tipava reason_code da blacklist Talk X como union. As duas edges já estão idênticas na main via PR #2308 (com testes); o hook alvo da tipagem foi removido de propósito como código morto e a mesma union vive hoje em TalkXSuppression.tsx. Nada a recuperar; duplicata de #2308.

**`claude/focused-hopper-qhavw1`** — 2026-11-02 `c4500536e`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Sessão fix/ci-workflows (PR #2586, fechada 2026-11-02): timeout e caminho não-fatal no preflight PromoGifts do deploy de edges, @types/node para o deno check, e2e-logado disparado após CI verde na main, mocks em 5 testes, e dois relatórios de sessão (PENDENCIAS.md, RELATORIO_CI.md). Todo o código já está na main em versão igual ou superior (PRs #2569, #2575, #2590, #2855, #2717, #2100); os relatórios foram superados por reescritas posteriores. Nada a portar.

**`claude/perf-bundle-inicial-261113`** — 2026-11-14 `0ba37e1ed`  
<sub>verificada · apagar: sim</sub>

Otimização do bundle inicial (Radix e date-fns fora do first paint, controles de alto contraste carregados sob demanda) para a tela abrir mais rápido. Tudo já está em produção via PR #3064 (commit ab657aa34): 7 de 9 arquivos idênticos byte a byte; nos outros 2 a main adotou de propósito uma variante melhor (vendor-ui + vendor-radix, date-fns agrupado) porque a versão literal da branch estourava o teto de total-assets — a main documenta isso citando a própria PR #3034. Nada a portar.

**`claude/test-e2e-contatos-fab-261021-0819`** — 2026-10-23 `22cee627c`  
<sub>verificada · apagar: sim</sub>

Spec E2E deslogada do FAB de Contatos (390x844) + mocks de app_bootstrap/health nos fixtures. Tudo entrou na main em 82e22bbb8 (2026-10-28, integração do PR #2317) com variante mais estrita: mocks centralizados em mockAppShell e teste de toque no canto do FAB além do centro. Nada a recuperar.

**`claude/test-e2e-suite-completa-261104-1428`** — 2026-11-04 `b7c538b6b`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch de trabalho da PR #2716 (suíte E2E completa no ambiente isolado: controller `suite <grupo>`, HTTPS/TLS local com probes negativos, verificação de providers, fixture de onboarding isolado, teste de corrida em detect-new-device, tarefas-quadro no Chromium público). Tudo entrou na main via #2716/#2717/#2719 e foi evoluído depois (3 grupos → 5 grupos com shards 1/3-3/3, network-proof, cache do Bun com escopo). Nenhuma lacuna útil.

**`claude/test-e2e-tls-diagnostico-261104-1340`** — 2026-11-04 `0f80b210d`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch que exige HTTPS verificado no E2E isolado (CA por execução, sondas Node/Bun/browsers/Edge, diagnóstico TLS redigido) e move tarefas-quadro.spec.ts para o projeto Chromium deslogado. Todo o conteúdo entrou na main pela PR #2716 (merge f32223dda, 2026-11-04), que é um superconjunto desta branch: 17 dos 21 arquivos são byte-idênticos ao merge de #2716; os 4 restantes (tls.mjs, dois unit tests, README) foram deliberadamente refinados em #2716 (leaf 'untrusted' assinado por uma segunda CA em vez de autoassinado). Nada a recuperar.

**`claude/test-e2e-webkit-tls-261104-1430`** — 2026-11-04 `48b7ada59`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch de 2026-11-04 que exigia HTTPS verificado no E2E isolado (CA local, prova de rejeição TLS em node/bun/3 navegadores/edge), diagnóstico de falha WebKit antes do teardown e instrumentação E71 do picker de localização. Todo o conteúdo entrou na main pelos PRs #2716 (f32223dda) e #2717 (afd8c7ca3) no mesmo dia; a main evoluiu os mesmos arquivos depois (certificateNavigationFailure, 49 casos de teste, mais módulos), o que gerou os CONFLICT mecânicos. Nada a recuperar.

**`claude/test-toque44-seletores-261021-0853`** — 2026-10-23 `b19f9107d`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch fazia o teste E2E de alvos de toque 44px voltar ao verde (seletor 'Fechar' do dialog, mock da RPC app_bootstrap com matriz de permissões e sonda /auth/v1/health). Tudo isso já está na main pelo commit 82e22bbb8 (2026-10-28), em versão mais completa (mock parametrizado por role/onboarding). Sobra só um comentário de 3 linhas sem efeito em execução.

**`claude_04/clever-ramanujan-xllbpo`** — 2026-10-27 `63865d2fd`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch do GOAL "Backend 100% operacional" (PR #2277): classifica 17 tabelas RLS-sem-policy e revoga grants de link_preview_cache, dropa ops_backup e documenta _bkp_261023, reserva migration de DROP de _bkp_261023 (pós 22/11/2026), além de manutenção de CI (replay-known-failures, asserção B.0c, SKIP_DOCKER_SHIM, timeout E2E). Tudo de valor já está na main de forma refatorada (migrations idempotentes com IF EXISTS, tombstone + _superseded para o DROP), aplicado em produção e registrado no ledger. O que falta (timeout 120 min, emoji, manifest gerado, entradas de replay para migrations agora idempotentes, SKIP_DOCKER_SHIM no DASH-091/092) foi superado de propósito pela main. Pendência operacional fora da branch: schema _bkp_261023 ainda existe em produção; DROP após 22/11/2026 é decisão destrutiva do dono.

**`claude_04/dazzling-archimedes-n9k59w`** — 2026-11-01 `15d3bb73e`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

Branch corrigia o deploy das edge functions (erro `Could not find "@types/node"` no `deno check`) adicionando `--config supabase/functions/deno.json`. O fix já está na main, em versão mais completa, via PR #2575; o Deploy Edge Functions roda verde hoje (PENDENCIAS.md da main registra runs com success). Os dois .md da branch eram relato de sessão "aguardando validação da PR #2527" e foram superados pelo estado atual. Nada a recuperar.

**`claude_04/nice-cori-7snz6b`** — 2026-10-28 `2f74d378c`  
<sub>verificada · apagar: sim</sub>

Branch da PR #2274 (retry HTTP 502 nos scripts de CI + 9 assinaturas RPC em types.ts). Tudo o que tinha valor já está na main: o retry entrou por #2432 (commit 78fe258e7, que a própria PR declara como substituta da #2274); as 9 RPCs estão em types.ts via types-sync. O único arquivo ausente (scripts/ci/fila-merge.mjs) foi removido de propósito com o workflow auto-update-pr-branch por decisão do dono em 11/11/2026 (35bb4cba5). PENDENCIAS.md e RELATORIO_CI.md da branch são relatórios de sessão de 26/10 superados pelos atuais e já arquivados em docs/_arquivo/. Nada a recuperar; branch pode ser apagada.

**`claude_05/festive-carson-ub43wu`** — 2026-11-11 `697e94dd6`  
<sub>verificada · 8 lacuna(s) · apagar: sim</sub>

Sessão de "fix CI": corrigiu as falhas dos Unit Tests (mocks de jsdom/TanStack Virtual, ARIA da paleta de comandos, notificações do chat interno, deep-link ?type= do Inbox, erro de leitura da base de conhecimento, remoção do hook morto do Talk X), ajustou 2 scripts de db-audit, reconciliou uma migration de drift e manteve um diário de CI. Todo o trabalho de engenharia já está na main — em vários pontos com implementação melhor. O resíduo não incorporado é inútil hoje: diário de CI superado, manifesto de deploy vencido, âncoras erradas no ESTADO.md, 2 mocks de teste desnecessários (os testes passam sem eles) e um patch para um script que a main apagou de propósito. Nada a recuperar.

**`claude_05/wonderful-goodall-94qjyg`** — 2026-11-13 `1defc1da9`  
<sub>verificada · reexaminada · apagar: sim</sub>

PR #2838: move team-chat-db-validate para scripts/team-chat/, adiciona READMEs, registra suítes .unit.mjs no CI e corrige perda de dados por EAGAIN ao ler stdin em scripts/inventario/gerar-repo.mjs. Tudo já está na main; a correção de EAGAIN entrou com implementação equivalente (stream assíncrono) no commit ab657aa34 que fecha explicitamente a #2838.

**`claude_pink/pensive-keller-kjgdal`** — 2026-11-09 `e83509308`  
<sub>verificada · apagar: sim</sub>

Fix de segurança do CodeQL (#64/#65) no gerador de contexto de agentes: sanitizador de regex passou a escapar barra invertida. A main já contém a correção em forma mais ampla (escapa todos os metacaracteres de regex), com teste unitário e o mesmo fix no generate.py. Nenhum impacto pendente para o produto.

**`codex/diagnostico-e2e-mapa-20261028`** — 2026-10-28 `94bfe9aa1`  
<sub>verificada · reexaminada · apagar: sim</sub>

Lote de fixes de Contatos (FAB, barra de lote, topo sem cabeçalho), status chips do inbox por contagem filtrada, cache de não-lidos do Team Chat e mocks E2E do Mapa. Tudo já está em produção via squash da PR #2317 (commit 82e22bbb8, 2026-10-28), da qual esta branch é ancestral direta.

**`codex/fix-lint-phone-settings-20261101`** — 2026-11-01 `b46eabe42`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Branch de correção de lint/typecheck (atributo aria-label duplicado no botão de dispensar alerta de fila + ajuste de teste da inbox). O teste está byte-idêntico na main e o aria-label duplicado foi removido na main pelo commit 2ebe682c1 (2026-11-08). Única diferença: a main manteve o label sem o nome da fila (cosmético/a11y, valor baixo, opcional).

**`fix/contacts-race-condition-useLayoutEffect`** — 2026-11-02 `178a79cbb`  
<sub>verificada · apagar: sim</sub>

Fix da race condition no formulário de contatos (ref de endereço vigente atualizado via useLayoutEffect antes da resposta da geocodificação) já está em produção, byte a byte idêntico, via PR #2608 (commit 69da65ddf). O resto da branch é só log de status em PENDENCIAS.md, cujo conteúdo foi arquivado em docs/_arquivo/PENDENCIAS.md e a raiz reescrita de propósito (#2630). Nada a recuperar.

**`fix/f1a-framer-motion-mock-voicechangerpicker-20261018`** — 2026-10-23 `3f8ee72f3`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Correção de teste unitário: o mock de framer-motion em VoiceChangerPicker.aria.test.tsx precisava exportar useReducedMotion para o teste de acessibilidade do botão "Gravar áudio" rodar. A main já tem exatamente esse export (e um mock mais robusto com importOriginal), entregue pelo commit e1f2ee4dd que destravou o CI Gate. O restante da branch é só reformatação prettier de uma linha. Nenhum impacto em produção; nada a portar.

**`fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018`** — 2026-10-31 `0fd17f8d1`  
<sub>verificada · reexaminada · apagar: sim</sub>

Lote F1a: completar os mocks de @/lib/logger e useTextToSpeech (importOriginal + LOCAL_VOICE_ID) no teste "Ver na conversa" da aba Arquivos. A main já tem exatamente esse mock desde a5760922c (2026-10-23); o mock de logger já existia no merge-base. As 3 linhas exclusivas da branch são corrupção sintática do commit de "resolve conflict" (0fd17f8d1), não trabalho perdido.

**`fix/f1a-lote-b-admin-audit-page-size`** — 2026-10-23 `b6faf7736`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch só corrigia 3 testes de AdminView cujo mock de useAdminData não exportava AUDIT_PAGE_SIZE/MIN_PASSWORD_LENGTH. A main já tem as duas chaves nos 3 arquivos (commit e1f2ee4dd, 2026-10-27). Única diferença residual é uma vírgula final em um expect — cosmética, sem efeito em teste ou CI.

**`fix/f1a-lote-b-audiomemes-storage-path`** — 2026-10-23 `7fb8f4464`  
<sub>verificada · apagar: sim</sub>

Fix PK-16/PK-17: upload de áudio meme passa a gravar na pasta do próprio usuário (`<uid>/meme_...`) para respeitar a policy por pasta do bucket `audio-memes` (atendente comum recebia 42501), com guard "Sessão expirada" e teste. Tudo já está na main com texto diferente (estilo compacto em vez de Prettier); as 216 linhas de "lacuna" são reformatação Prettier e uma variante do mock Realtime no teste.

**`fix/f1a-lote-b-authprovider`** — 2026-10-18 `81543b967`  
<sub>verificada · apagar: sim</sub>

Branch só consertava 2 testes vitest que quebravam por falta de AuthProvider (mocks de useUserRole/useAuth/useGlobalIncomingMessageAlerts/createLogger). Os mesmos mocks já estão na main desde e1f2ee4dd (2026-10-27, "destrava o CI Gate"), em versão igual ou mais completa. O resto do diff é reformatação prettier sem efeito em CI nem em comportamento.

**`fix/f1a-lote-b-batch10`** — 2026-10-23 `56187bdae`  
<sub>verificada · apagar: sim</sub>

Branch de 1 arquivo (teste de paginação do Gmail antigo). Única mudança com conteúdo: mock de supabase.rpc para a RPC search_email_threads no setup do teste — já está na main (linhas 123-124 do arquivo, via commit e1f2ee4dd de 2026-10-27). O resto (~95% do diff) é reformatação Prettier sem efeito e sem gate no repo. A main ainda evoluiu o mesmo arquivo além da branch (mock framer-motion p/ Vitest 4, commit a5760922c); aplicar a branch regrediria isso. Nada a recuperar.

**`fix/f1a-lote-b-batch12`** — 2026-10-18 `ced1c1b49`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch de 1 arquivo (src/styles/utilities.css) com dois commits: reformatação prettier (sem efeito visual) e o fix real — criar as classes CSS .safe-area-top/.safe-area-bottom/.scrollbar-none e bloquear pull-to-refresh no celular, que o app já usava em ~15 telas mobile (cabeçalho, barra inferior, campo de envio do chat) sem regra definida. O fix já está na main (commit 4b9585052, PR #2156) com texto diferente e teste de contrato protegendo; o restante é cosmético. Nada a portar.

**`fix/f1a-lote-b-batch2`** — 2026-10-23 `d76fb9d57`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch do lote F1a com um único arquivo de teste (GroupsView.a11y.test.tsx). A única mudança funcional — acrescentar `useReducedMotion` e `MotionConfig` ao mock de framer-motion para o teste de acessibilidade de Grupos não quebrar — já está na main desde e1f2ee4dd (2026-10-27). O restante do diff é só reformatação prettier, sem efeito em comportamento, e prettier não é check de CI. Nada a recuperar.

**`fix/f1a-lote-b-batch4`** — 2026-10-23 `80a6e057a`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

N-216: falha no COUNT de whatsapp_connections derrubava toda a coleta da tela de Diagnósticos e mascarava falha de leitura como "0 conexões". A correção já está na main em outra forma (sem throw; erro entra na classificação de health.database) e com teste dedicado que a branch nem trazia. O restante da branch (~70 linhas) é só reformatação Prettier, sem gate em CI.

**`fix/f1a-lote-b-batch6`** — 2026-10-23 `8fa1bb340`  
<sub>verificada · apagar: sim</sub>

Painel NPS: estado de erro (com "Tentar novamente") quando a leitura falha e aviso de truncamento quando bate no teto de 500 respostas. Ambos já estão na main com o mesmo contrato (testids, texto, refetch) e cobertos por teste; o restante do diff da branch é só reformatação Prettier não exigida pelo CI.

**`fix/f1a-lote-b-batch7`** — 2026-10-23 `295286eb0`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

Ranking (Leaderboard) passou a distinguir "RPC caída" de "ranking vazio", mostrando erro com botão "Tentar de novo" em vez de mentir que não há ninguém no ranking. Essa correção já está na main (commit e1f2ee4dd, 2026-10-27) e coberta por teste; o que sobra na branch é só reformatação prettier e um ícone cosmético.

**`fix/f1a-lote-b-connectioncard-dialog`** — 2026-10-18 `ab0482162`  
<sub>verificada · apagar: sim</sub>

Corrigia o diálogo de desconectar WhatsApp no ConnectionCard (handler indefinido que quebrava a compilação, diálogo fica aberto com motivo quando a Evolution GO recusa desconectar). Tudo já está na main via PR #2156 (commit 4b9585052, 2026-10-21); o restante da branch é só reformatação prettier sem efeito.

**`fix/f1a-lote-b-hooks-misc-1`** — 2026-10-18 `ff66b4565`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Acessibilidade do overlay de proteção de tela (role=alert + aria-live=assertive para leitores de tela). As 2 linhas funcionais já estão na main; faltam só 3 linhas de comentário, sem efeito no comportamento.

**`fix/f1a-lote-b-main`** — 2026-10-18 `10d843f92`  
<sub>verificada · apagar: sim</sub>

Branch só adicionava `createLogger` aos mocks de `@/lib/logger` em 9 testes (porque `src/lib/invokeEdge.ts` usa `createLogger`) + reformatação prettier. Os 9 arquivos na main já têm `createLogger` no mock (versão até mais completa, com `withCorrelation`), via PRs #2156 e #2182. O restante do diff é cosmético; nos 3 arquivos com framer-motion a versão da branch seria regressão (main já migrou o mock para Vitest 4). Nada a recuperar; triagem anterior (OBSOLETA) corrigida para INCORPORADA.

**`fix/f1a-lote-b-realtime-channel-mock`** — 2026-10-23 `adeae7592`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch só corrigia os testes de AgentsView (capacidade/pendências) adicionando `channel`/`removeChannel` ao mock do Supabase para a tela não quebrar com "channel is not a function" via useConnectionsHealth; o resto do diff é formatação prettier. A main já tem o mesmo mock (texto diferente, comportamento equivalente) nos dois arquivos, introduzido por e1f2ee4dd. Nada útil ficou para trás.

**`fix/f1a-lote-b-talkxsegments`** — 2026-10-18 `81e743089`  
<sub>verificada · apagar: sim</sub>

Branch corrigia 3 coisas no hook de segmentos do Talk X: supabase.rpc perdendo o this (quebrava contagem/amostra de público, stats e ações em massa), lead_origin oferecido como filtro morto e real_sector/real_uf (ponte Singu) sem falha fechada. As três já estão na main por commits posteriores (a9ddd2f9a, e1f2ee4dd, a0e21b651/a6fbadfa3); a guarda ponteOnly da main cobre countAudience, resolveAudience e rulesToPostgrest. O restante da branch (≈330 linhas) é só reformatação prettier sem efeito no produto; main mantém estilo compacto e prettier não é checado em CI.

**`fix/f1a-lote-b-useadmindata-createuser-avatar`** — 2026-10-23 `8e37dd43e`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch trazia: (1) avatar dos usuários assinado ao carregar a lista do admin (bucket privado), (2) mensagens de erro ao criar usuário distinguindo "e-mail já cadastrado" e "papel inválido", (3) correção dos mocks do teste de handleCreateUser, (4) prettier. Tudo o que é funcional já está em origin/main; o que "falta" é só formatação prettier (a main manteve o estilo antigo) e uma string de teste com o papel special_agent, removido de propósito na main (#2692).

**`fix/f1a-lote-b-useadmindata-select`** — 2026-10-23 `cbef3bcab`  
<sub>verificada · apagar: sim</sub>

Branch só destravava um teste do painel admin (aba auditoria) acrescentando `.range()` ao mock do Supabase. Essa correção já está na main desde 27/10 (commit e1f2ee4dd). O resto do diff é formatação prettier e dois métodos de mock (`gte`/`lte`) que o teste nunca chama. Nada a recuperar.

**`fix/f1a-supabase-channel-mock-audiomeme-20261018`** — 2026-10-31 `54a6c5661`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch completava o mock do Supabase (channel/removeChannel, getPublicUrl) e o mock do framer-motion no teste de falha de envio de áudio-meme. Tudo isso já está na main com o mesmo texto (via e1f2ee4dd e a5760922c); as 8 linhas "faltantes" são corrupção de bytes no último commit da branch (bo#aoPorIcone, erro(m{), rejek#hão) e quebras de linha — portá-las quebraria o teste. Nada a recuperar.

**`fix/reconciliar-migration-copilot-fases13-15`** — 2026-11-01 `07ac5c6f0`  
<sub>verificada · apagar: sim</sub>

Branch reconciliava a migration das tabelas copilot_* (fases 13-15), registrava a versao duplicada 20261031100000 nas falhas esperadas do replay local e estabilizava o E2E de alto contraste no webkit. Tudo ja esta na main: migration identica, entrada do known-failures com texto mais completo, e espera de luminancia equivalente no spec E2E. Producao confirma as duas versoes no ledger e as tabelas/politicas existentes.

**`fix/types-rpc-ausentes-261025`** — 2026-10-25 `9fe3cd827`  
<sub>verificada · apagar: sim</sub>

Branch de 3 commits (2026-10-25): 9 assinaturas de RPC em types.ts, tipagem null em transfer_conversation, e fix de testes (fila offline de envio por usuário + limpeza no logout; extensão/contentType real no upload de áudio). Tudo já está na main em forma equivalente ou superior: types.ts regenerado pelo codegen (#2357) contém as 9 RPCs; fila offline usa predicado shouldDeliver/pertenceAoUsuarioAtual (mais estrito: item sem dono não drena); logout esvazia a fila com try/catch; uploadAudio mapeia webm/ogg/mp4/mpeg. Nenhuma lacuna a recuperar.

**`local/fase0-banco-local`** — 2026-10-04 `1bee59c5a`  
<sub>verificada · apagar: sim</sub>

Fase 0 da fábrica local (04/10/2026): app aceita banco local por desvio explícito, replay local trava chamadas à produção, 3 migrations (reconcile replay, fecha EXECUTE anônimo de record_incoming_call_event, tick Talk X não aborta no expurgo), 2 testes no db-guard, e2e via fonte única supabase-env, seção 0 do CLAUDE.md. Tudo entrou pela PR #1890 (b44540e35) e evoluiu depois: protocolo https aceito (#2716), cleanup do replay via trap (R2-INF-014), CLAUDE.md virou @AGENTS.md com as regras de banco em docs/agentes/banco.md (#2762). As únicas linhas da branch ausentes na main foram substituídas de propósito; as regras 1-3 da seção 0 (agente não faz push/PR/merge) contradizem o fluxo vigente em AGENTS.md e foram descartadas pelo dono.


#### Obsoleta — 92 branches

**`Github_Copilotauditorias-anteriores-reconciliacao`** — 2026-10-31 `141d30b34`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Rascunho paralelo (worktree cuddly-barnacle, 31/10 15:14Z) do relatório "Reconciliação de Auditorias Anteriores", só prosa. A main recebeu no mesmo dia outra redação do mesmo relatório (mesmo título/data/autor, cabeçalho cita a própria sessão), commitada direto pelo dono (ee8f4b6eb) e depois verificada/atualizada (#2748, #2752). As 161 linhas "faltando" são texto alternativo do mesmo conteúdo; a branch ainda afirma achados já refutados na main (enforceRateLimit "pendente") e estalados (main sem branch protection — baseline de 02/11 mostra strict=true). Nenhum código, migration, edge ou workflow. Nada a recuperar.

**`claude/archived-undo-constraint-fix`** — 2026-10-31 `eb98aad24`  
<sub>verificada · apagar: sim</sub>

Corrigia o "Desfazer" do arquivamento em massa do inbox para não quebrar na trigger (archived→open|pending), além de trocar undefined→null nos args da RPC de transferência e gravar updated_at. A main resolveu o mesmo problema depois, de forma mais completa e alinhada à trigger atual (resolved restaurado sem novo encerramento, waiting em dois passos, pending/closed→open, falha por grupo não aborta o lote; #2459, #2813, #3082). O resto (null vs undefined, UPDATE direto com updated_at) foi descartado de propósito: transferência passa pelo wrapper com undefined e arquivamento passa por RPC de lote. Nada a recuperar.

**`claude/auditoria-temp-261101`** — 2026-11-01 `f258d5acf`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch só contém o snapshot antigo (2026-10-25) do relatório de auditoria Supabase. A main já tem versão mais nova e mais completa dos mesmos dois arquivos (consolidada em #2844, 2026-11-10, após #2397 e #2630). Aplicar a branch regrediria a documentação. A única contribuição exclusiva da branch — reclassificar o bucket multiplix-voice de HIGH para INFO — corrige um achado que a main já eliminou na consolidação. Zero impacto em código, banco, edges ou workflows. Nada a recuperar.

**`claude/chore-auditoria-supabase-final-251025-1655`** — 2026-11-01 `f5d524607`  
<sub>verificada · 4 lacuna(s) · apagar: sim</sub>

Branch só de docs: snapshot de 2026-10-25 da auditoria Supabase (relatório de 943 linhas com 28 achados + progresso.json de sessão). O documento está obsoleto — a main tem a consolidação ZW-nnnn (48 achados, re-verificada em 01/11 e 08/11) mergeada pela PR #2844 em 2026-11-10, e a própria main registra que a sucessora desta branch (#2462, mesmo conteúdo rebaseado) foi "absorvida sem novos achados". Verifiquei achado por achado: 25 dos 28 estão na main (quase sempre com evidência mais fresca), 1 é achado falso e 3 nunca chegaram à main e seguem verdadeiros em produção hoje (0 fatores MFA em 10 usuários; autovacuum ausente; 8 índices trigram nominais com zero uso). O que vale recuperar são 3 entradas em auditoria-supabase/achados.json — a mais relevante é MFA zerado, que é risco de acesso e não está documentado em nenhum lugar da auditoria vigente. Restaurar o relatório ou o progresso.json seria regressão.

**`claude/chore-claude-md-required-checks-261101-1600`** — 2026-11-01 `a38e2ad40`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch só de documentação. A única correção de fato (required checks da main são 3, não 6) já está na main em docs/agentes/github-ci.md:31 e em scripts/ci/github-settings-baseline.json; o CLAUDE.md de 380 linhas que a branch editava foi deliberadamente apagado em 07/11 (hoje é só "@AGENTS.md"). O outro arquivo é um plano de 190 etapas de 19/10 que nunca entrou na main e cujas premissas já não existem (CLAUDE.md grande, 14 workflows, PRs #2081–#2095), com a função hoje coberta por docs/PRONTO_PRODUCAO.md. Nada de código, banco, edge ou teste a recuperar.

**`claude/chore-cmd-auditoria-supabase-261101-1430`** — 2026-11-01 `4b780aaf4`  
<sub>verificada · apagar: sim</sub>

Branch só adiciona um roteiro/prompt (.claude/commands/auditoria-supabase.md) para consolidar 3 auditorias Supabase e executar correções. O resultado que esse roteiro mandava produzir já está na main (PR #2844 mergeada em 10/11: achados.json com 48 ZW-nnnn, progresso.json com Fases 0 e A fechadas, relatório consolidado), e as regras da Fase B já estão em AGENTS.md/docs/agentes. O texto está datado (8 PRs que ele manda triar estão todas fechadas; retrato de produção de 01/11 superado; afirma regra de Git oposta à vigente). Nada a recuperar.

**`claude/chore-docs-relatorio-261112-0910`** — 2026-11-12 `47980f813`  
<sub>verificada · apagar: sim</sub>

Branch só adicionava ao RELATORIO_CI.md um snapshot transitório (runs "in_progress", "A VERIFICAR") do estado dos workflows logo após o merge da PR #2975. A main já registra, nas seções §9–§11 do mesmo arquivo, o desfecho final desses mesmos workflows (E2E logado resolvido via PR #2987, Types Sync resolvido via #2983/#2988, zombie confirmado ghost), tornando o snapshot sem valor. Nada a portar.

**`claude/chore-mapa-resgate-pos-24-10-261101-1415`** — 2026-11-01 `7f572d1f8`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Só documentação (PR #2479): mapa de 2026-11-01 das 59 branches locais arquivadas como tags resgate/pos-24-10/* e um JSON de contadores. Nada de código, edge, migration ou workflow. A main arquivou de propósito a pasta-alvo docs/resgate/ como "prosa morta" (#2630, c570d5d46) e as branches que o mapa lista estão sendo retriadas item a item nesta triagem; o dado bruto segue preservado nas tags. Nenhum efeito no produto.

**`claude/chore-relatorio-ci-261112-0803`** — 2026-11-12 `47bdaa7fd`  
<sub>verificada · apagar: sim</sub>

Branch docs-only (PR #2980): um commit em RELATORIO_CI.md registrando snapshot de CI às 07:58–08:03Z de 2026-11-12 logo após o merge da PR #2975 (runs "in_progress"/"A VERIFICAR" e 3 frases "fix mergeado via PR #2975"). A main reescreveu o arquivo depois (commits 15923813a, 65cf38544/#2989, cb6576b2a/#3035) com §9–§11 cobrindo o desfecho real: E2E Logado resolvido via PR #2987 (11:15Z), inventário fresco 11:12Z, tabela final 12:25Z. O §9 da branch colide com o §9 da main e traria estados desatualizados. Nada de código; nada a recuperar.

**`claude/chore-remove-hook-morto-talksuppression-261024-1541`** — 2026-10-24 `fd9096ce1`  
<sub>2 lacuna(s) · apagar: sim</sub>

Branch queria tirar o hook morto useTalkXSuppression (TL-002) mas apagava o módulo inteiro, que a tela de supressão do Talk X ainda importa (useTalkXSuppressionActivity/Stats). A main já resolveu a mesma necessidade de forma cirúrgica em #2071 (662083c5f, 2026-10-31): só a função morta e seus tipos saíram, o teste velho foi deletado e um guarda (hook-morto.test.ts) impede o retorno. Mergear o que resta da branch quebraria a tela. Nada a portar.

**`claude/chore-sync-catalog-grants-baseline-261107-1354`** — 2026-11-07 `e30d4ca08`  
<sub>verificada · apagar: sim</sub>

Branch só regenerava o snapshot scripts/db-audit/grants-baseline.json com o estado do banco em 2026-11-07 (contagem service_role 391→392, resto igual, mais reordenação de chaves). A main já tem snapshot mais novo (2026-11-15, counts 411/226) regenerado pelo mesmo gerador, e a lista anon_table_select que a branch mantinha foi esvaziada de propósito pelo fix de segurança #2859 (revogação de 99 grants anon). Nada a portar; apagar a branch é seguro.

**`claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023`** — 2026-10-23 `d3bef1973`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

Cherry-pick do dia 2026-10-19 (PR #2196): editor de templates Talk X encaixado no endereço (sub-aba ttab, breadcrumb, campo Descrição), props de erro X047, transcribed_at no adapter Evolution e ignore de worktrees no eslint. Toda a parte funcional já está na main (commit e1f2ee4dd, 2026-10-27) com implementação equivalente; o que sobra é refactor de constante, ignore de pastas locais inexistentes e baseline de lint gerado para outra config — nada a recuperar.

**`claude/ecstatic-bardeen-twiveb`** — 2026-11-07 `7305ed4f3`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch de 2026-10-23 cujo único objetivo era deixar a CI da main verde (60+ commits "fix(tests)"/"fix(typecheck)"). A main resolveu toda a mesma pauta de forma independente e mais completa nas 3 semanas seguintes. O que é exclusivo da branch hoje é retrocesso: ela reescreveu arquivos em vez de corrigi-los e reduziu o War Room e a ferramenta de migração de mídia a esqueletos, removeu o aviso de leitura incompleta do painel de sentimento e deixou o gate de templates WhatsApp mais restrito que a RLS (só admin, quando a regra vigente é admin+supervisor). O único componente novo (SentinelAlertPanel) grava uma coluna que não existe em produção. A migration do TalkX que a branch trazia já chegou à main, foi aposentada de propósito e substituída por outra, aplicada em produção. Nada a resgatar; nada em risco se a branch for apagada.

**`claude/feat-bulk-archive-two-step-undo-261101-0800`** — 2026-11-01 `873ba9480`  
<sub>verificada · apagar: sim</sub>

Desfazer do arquivamento em lote restaurando waiting/resolved/closed em dois passos (archived→open→original) com rollback para archived se o 2º passo falhar. A main já cobre a mesma necessidade desde PR #2813 (commit 7c9a18843, 2026-11-13) com abordagem diferente e melhor: via RPC moveConversationsStatus (UPDATE direto em conversation_status é recusado no banco, então o código da branch falharia em produção), resolved restaurado em 1 chamada em modo restore (evita 23505), pending/closed legados voltam a open, falha num grupo não bloqueia os outros ("X de Y restaurados"). Além disso, decisão do dono (2026-11-13): conversas waiting não são mais arquivadas, tirando o alvo principal da branch. Testes da main cobrem os cenários equivalentes. Nada a recuperar.

**`claude/feat-copilot-radar-20261108-1800`** — 2026-11-09 `be78e6cfa`  
<sub>verificada · 8 lacuna(s) · apagar: sim</sub>

Copiloto RADAR B·R·I·N·D·E (painel na aba IA da Inbox + motor de análise por mensagem). Tudo isso já está na main, numa versão mais completa e ligada ponta a ponta, feita por outras duas PRs: #2828 (11841dba9, 2026-11-09, telas e motor) e #3127 (f369f88b2, 2026-11-15, liga o gatilho + handler, nasce desligado). A main usa tick automático pelo banco (gatilho em messages → fila ai_jobs → ai-jobs-worker → _shared/copilot-tick.ts), enquanto esta branch dependia de um botão "Analisar" manual — abordagem superada. Sobram apenas duas migrations de tabela sem nenhum consumidor (presença e agregados de retenção) e um gatilho incompatível com o banco real, que se aplicado hoje quebraria a gravação de mensagens. Nada a recuperar.

**`claude/feat-copiloto-edge-fases8-10-261024-1700`** — 2026-10-24 `e9d2e0fa6`  
<sub>verificada · 7 lacuna(s) · apagar: sim</sub>

Rascunho antigo das 7 edges do Copiloto de Vendas (objeção, âncora de preço, risco de perda, recomendação de produto, prazo, temperatura do lead, análise de imagem). As 7 capacidades já estão na produção em versão melhor e integrada ao front (PR #2834 + #3001), com prompts de brindes corporativos, contratos Zod de saída e hooks em src/hooks/copilot/. Portar algo da branch regrediria a main. Nada a recuperar.

**`claude/feat-copiloto-edge-fns-fases8-15-261024-1615`** — 2026-10-31 `235d73a56`  
<sub>verificada · apagar: sim</sub>

Branch criava rascunho de 7 edge functions de IA do copiloto RADAR (prazo, temperatura do lead, risco de perda, multimodal, objeção, ancoragem de preço, recomendação de produto). A main já tem as mesmas 7 funções, com os mesmos nomes, em versão mais completa (validação zod de entrada/saída, testes, hooks no front, manifest de deploy) vinda da PR #2834 em 2026-11-10. O conteúdo da branch foi superado; portar seus prompts/campos quebraria os contratos consumidos pelos hooks.

**`claude/feat-e71-skip-draft-prs-281026-0250`** — 2026-10-28 `68bf4153b`  
<sub>verificada · 5 lacuna(s) · apagar: sim</sub>

Economizar minutos de CI pulando jobs pesados em PR draft (etapa E71). A main já faz isso desde 2026-10-31 (commit 578e5671c, PR #2046: unit-tests e build no ci.yml, offline-contract no db-guard.yml, com o ci-gate tolerando job pulado) e já tem o trigger ready_for_review. O que resta na branch é código morto (codeql não roda mais em PR), quebraria a CI como escrito (gate em node-scripts/security sem ajustar o ci-gate deixaria o required check vermelho em todo draft) ou é dano: a branch apagou as 975 linhas do plano de auditoria deixando o placeholder "PLANO_CONTENT_FROM_FILE" e marcou E71 como DONE_VERIFIED citando a PR #2295, que foi fechada sem merge. Resíduo útil de 1 linha (pular o job e2e, 45 min, em draft) está registrado no dossiê.

**`claude/feat-e75-toolchain-env-281028-0600`** — 2026-10-28 `307023ef8`  
<sub>verificada · 17 lacuna(s) · apagar: sim</sub>

A branch queria "uma só fonte de versões de ferramentas do CI" (E75): cada workflow leria .github/toolchain.json em runtime via jq e usaria ${{ env.NODE }}, env.BUN etc. A main já entrega essa mesma garantia por outro caminho: mantém os números escritos nos workflows e tem um verificador que reprova o CI se qualquer número divergir do toolchain.json — rodando contra os workflows reais na suíte de guards. Portar a branch só trocaria o mecanismo, somando um passo jq em 11 workflows, e um dos trechos dela (a imagem do Postgres no db-guard) resolveria vazio porque o env do job é avaliado antes dos steps. Os dois arquivos de docs da branch só destroem um documento histórico (975 linhas apagadas) e reformatam um ledger gerado. Nada a recuperar; branch pode ser apagada.

**`claude/feat-radar-fase6-261108-1933`** — 2026-11-08 `03e96a700`  
<sub>verificada · 6 lacuna(s) · apagar: sim</sub>

Painel flutuante do Copiloto RADAR (Fase 6). A main já tem a mesma tela em outro desenho, mais completa e ligada ao motor de IA (RadarPanel + RadarLive + RadarCards, PR #2828). O painel desta branch é uma meia-feature: desenha uma timeline que nada alimenta (pushInsight nunca é chamado), não implementa os 7 cards que o próprio cabeçalho promete, e troca o hook useRadarPanel por uma assinatura incompatível que quebraria o painel que já está na main. Além disso, a abordagem alternativa está preservada em versão corrigida na branch irmã #2872, que é a "opção B" que o dono tem em aberto na issue #2967 (PENDENCIAS.md:170-182). O único conteúdo exclusivo daqui é a suíte de teste do relatório TalkX, que a main já cobre com 13 casos em vez de 3. Nada a recuperar.

**`claude/feat-talkx-x003-demo-fixtures-261101-2143`** — 2026-11-01 `f9ca26332`  
<sub>verificada · 4 lacuna(s) · apagar: sim</sub>

Branch de teste E2E do Talk X (tela 01 de Campanhas). Não traz nada de útil que falte na main: a base das 17 fixtures, o mock e a régua visual já existiam antes do merge_base e continuam na main. O delta real da branch é (1) trocar travessão por "--" em comentários, (2) ENCOLHER a fixture da tela 01 de 24 campanhas (36 campos, 6 coleções) para 5 campanhas (19 campos, 2 coleções), (3) 17 arquivos placeholder com "{}" num esquema de nome paralelo ao que já está completo, e (4) reescrever o spec com um padrão que a main já tem no talkx-visual.spec.ts, insistindo num valor de KPI (24) que a main corrigiu de propósito para 21. Portar qualquer hunk pioraria a main. Zero impacto no negócio.

**`claude/feat-talkx-x047-matrix-estados-261101-2030`** — 2026-11-01 `8f619c709`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Zero impacto no produto. A branch queria provar com teste que, no Talk X, uma consulta que falha mostra "Não foi possível carregar" e nunca o texto de vazio — mas esse teste já existia na main desde 03/10, num arquivo bem mais completo (695 linhas contra 341, cobrindo erro + tentar novamente + carregando + vazio por tela, inclusive Monitor, Em andamento e wizard, que a branch nem tinha). O resto da branch é só reformatar um ledger de auditoria de 1,4 MB para marcar 8 etapas como verificadas, sem atualizar o próprio contador do arquivo. Nada a recuperar; branch pode ser apagada.

**`claude/festive-faraday-kv669k`** — 2026-11-01 `e3fa619cf`  
<sub>verificada · 14 lacuna(s) · apagar: sim</sub>

Branch 100% documental: auditoria do Supabase de produção (47 achados + 10 propostas SQL/MD + script de matriz RLS), nada de código de app. Os 47 achados já foram absorvidos pelo ledger da main (`auditoria-supabase/achados.json` cita textualmente "PR #2414 (47 achados A/M/C)", que é esta própria branch), e a prosa de auditoria foi deliberadamente arquivada em `docs/_arquivo/` (PR #2630). Três propostas já estão aplicadas em produção (anon TRUNCATE=0, anon SELECT=0, department_invites restringido) e uma foi resolvida pela decisão oposta da main (17 tabelas com RLS sem policy documentadas como intencionais). Sobra uma lacuna real de segurança: o achado de MFA (zero fatores MFA em produção, confirmado hoje) não existe em nenhum documento da main — ação é do dono (ligar "Enforce MFA" no Dashboard muda o login dos 10 usuários). Secundárias: complemento de policy/MIME do bucket multiplix-voice e a matriz RLS expandida (19 testes A×B vs. 8 na versão arquivada).

**`claude/fix-canonical-receipt-policies-261020-2005`** — 2026-10-23 `f632880fc`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Migration defensiva que recriaria incondicionalmente as duas policies RLS de recibos do Team Chat (INSERT/SELECT em team_message_receipts) na forma canônica, visando convergência do replay local. Produção já tem exatamente essas policies e a main já as declara em 20261003272707; o replay da main já converge (medido pelo próprio autor na PR #2137). Portar seria uma migration redundante sem efeito funcional.

**`claude/fix-ci-contratos-cache-261020-2320`** — 2026-10-20 `d90d3f78f`  
<sub>verificada · apagar: sim</sub>

Branch de CI (PR #2123): cache do Bun, pin do Playwright 1.64.1, hardening do vercel-env-cleanup e correção de falso positivo no teste de secrets. Tudo útil já está na main; o único trecho ausente (pin no step apt-only `install-deps`) foi removido de propósito na main (#2054) e não altera comportamento. Nenhum trabalho a recuperar.

**`claude/fix-ci-n008-261101-2340`** — 2026-11-01 `c61cbe617`  
<sub>verificada · reexaminada · 4 lacuna(s) · apagar: sim</sub>

Branch tentava destravar o step N-008 do db-guard (rate limit do Docker Hub ao puxar postgres:17-alpine) adicionando N008_POSTGRES_IMAGE ao step e lendo-a no script, mais relatório de CI de 2026-11-01. A main resolveu a mesma necessidade por outra via (PR #2622: script lê POSTGRES_TEST_IMAGE pinada por SHA no nível do job; PR #2543: --no-healthcheck e wait-postgres-final-start.sh). A linha do workflow seria redundante; os docs são snapshot pontual superado pelos relatórios de 11/12–11/15 já na main. Nada a recuperar.

**`claude/fix-ci-tests-261019-1200`** — 2026-10-19 `16a4c54f0`  
<sub>verificada · apagar: sim</sub>

Branch de 19/10 para destravar a CI (mocks de teste, baseline a11y, reduced-motion, aria-live). Tudo que era útil já está na main (baseline a11y, ConnectionsView/ScheduleCalendarView com reduced-motion, useScreenProtection, aria-label do botão CRM). O restante são cópias desatualizadas de CRMAutoSync.tsx e useTeamChatPanel.ts (regressão: apagam a refatoração do CRM sync e 72 linhas de comentários que a main mantém) e correções de teste superadas por outras já verdes na CI da main (dac285f62, Unit Tests 1/3-3/3 SUCCESS). Nada a recuperar.

**`claude/fix-ci-workflows-261030-0830`** — 2026-10-31 `1a8c80963`  
<sub>verificada · apagar: sim</sub>

Branch docs-only (PR #2372) com relatório e lista de pendências de CI da sessão de 2026-10-30. RELATORIO_CI_FINAL.md entrou byte a byte na main (#2458). PENDENCIAS.md e RELATORIO_CI.md da branch são versões anteriores de documentos vivos que a main já tem em versão de 31/10 (#2411); todos os 5 itens "bloqueados" que a branch pedia ao dono já foram resolvidos (deno install no deploy-functions via #2371/#2407, migrations copilot aplicadas em produção, db-guard sem ECR, branch-hygiene-audit com timeout 25 corrigido em #2551). Nada a recuperar; recuperar induziria o dono a agir sobre PRs já mergeadas/fechadas.

**`claude/fix-ci-workflows-hxupgs`** — 2026-11-05 `aac5bfceb`  
<sub>verificada · apagar: sim</sub>

Branch docs-only (1 commit, 2026-11-05) que refinava o relatório de CI já entregue pela própria PR #2730 (= merge-base). Reescrevia RELATORIO_CI.md em tabelas e ajustava 3 linhas de PENDENCIAS.md sobre o Deploy Edge Functions bloqueado pela PR #2707. Na main o relatório já tem as mesmas seções 1–5 de 2026-11-05 com mais detalhe e §6–§11 posteriores; a PR #2707 foi mergeada em 2026-11-06, o manifesto contém ai-usage-outbox-drain e PENDENCIAS.md (reescrito em 2026-11-12) registra Deploy Edge Functions com success. Nada a portar.

**`claude/fix-db-live-guard-dup-261109-1800`** — 2026-11-09 `ff8bafdfc`  
<sub>verificada · apagar: sim</sub>

Branch só movia 2 arquivos de migration (sufixos _constraint/_column) para _superseded/ para calar falso drift no db-live-guard. A main resolveu o mesmo problema de forma melhor no commit fe6c6b0bf: renomeou os arquivos para o nome exato do ledger de produção (20261107121000_message_reactions_one_per_agent.sql e 20261107122000_contacts_phone_search_digits.sql, conteúdo byte-idêntico) e registrou a divergência em scripts/db-audit/migration-evidence.json. Aplicar a branch hoje só criaria cópias duplicadas em _superseded/ e contrariaria a convenção do diretório (arquivar SQL que nunca rodou). Nada a recuperar.

**`claude/fix-deno-modules-dir-261102-0450`** — 2026-11-02 `38656b5a0`  
<sub>verificada · apagar: sim</sub>

A branch troca nodeModulesDir de "auto" para "none" em supabase/functions/deno.json para o deno check passar sem deno install. A main já tentou isso (#2399) e reverteu de propósito (#2404) porque "none" quebrava o deploy das edge functions; a main resolve a mesma necessidade com deno install + npm install no deploy-functions.yml, e os 3 últimos runs desse workflow em main estão verdes. Aplicar a branch reintroduziria a regressão.

**`claude/fix-deploy-deno-check-node-modules-261030-1200`** — 2026-10-30 `ea3af3e1e`  
<sub>verificada · apagar: sim</sub>

Branch tentava destravar o typecheck das edge functions no deploy desligando node_modules (--node-modules-dir=none) e corrigindo um hash esm.sh de tslib no deno.lock. A main resolveu o mesmo problema pelo caminho oposto (instala node_modules + @types/node e usa nodeModulesDir:"auto" via --config) e migrou o lock de esm.sh para npm specifiers, então a entrada que a branch corrigia nem existe mais. Nada a portar; deploy das edges já funciona na main.

**`claude/fix-deploy-frozen-oct31`** — 2026-10-30 `6521a05f2`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch que destravava o deploy das edge functions (deno check falhando por @types/node). O fix já está na main em forma mais completa (--frozen=false + npm install @types/node pinado + @types/node no deno.json); os dois .md (PENDENCIAS/RELATORIO_CI) descrevem o estado do CI de 2026-10-31 e foram totalmente reescritos na main. Nada a portar.

**`claude/fix-e2e-talkx-ajuda-ctrlk-261113-1629`** — 2026-11-13 `ea59665e2`  
<sub>verificada · apagar: sim</sub>

Branch só tentava estabilizar o E2E instável do Ctrl+K na Ajuda do Talk X adicionando esperas no teste. A causa real (atalho global abrindo a paleta por cima da Ajuda) foi corrigida na main pela PR #3078 (commit 91c63ff8c, 2026-11-14) no código-fonte, sem alterar o teste. Além disso, a pré-condição toBeFocused() da branch depende de um autofoco que não ocorre após o carregamento lazy dos docs, então o hunk falharia. Nada a recuperar.

**`claude/fix-e2e-workers-ci-timeout-271027-0924`** — 2026-11-01 `c2055dff9`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch (PR #2279) só mudava playwright.config.ts para `workers: process.env.CI ? 4 : 2`, tentando evitar o cancelamento do job E2E no timeout de 20 min. A main resolveu o mesmo GR-016 de propósito com `workers: 2` fixo (#2560) e eliminou a causa-raiz subindo o timeout do job E2E para 45 min e dividindo a suíte logada em shards de 75 min. 4 workers ainda causaria sobrescrita de screenshots em e2e/email-navy-visual.spec.ts (apontado pela review). Nada a portar.

**`claude/fix-e2e-workers-timeout-tests-011101-1800`** — 2026-11-01 `3153268fe`  
<sub>verificada · 4 lacuna(s) · apagar: sim</sub>

Branch só de infra de testes E2E (4 arquivos: playwright.config.ts + 3 specs; zero src/edge/migration). Queria 4 workers no CI para o job caber em 20 min e adicionava timeouts de 30 s/90 s para compensar a contenção de CPU. A main rejeitou de propósito (GR-016: workers fixos em 2, commit a7a53f567/#2560) e resolveu o problema-raiz de outro jeito (job e2e com 45 min; e2e-logado fatiado em 5 shards). Sem 4 workers, os timeouts extras perdem o motivo; o CI da main está verde nessas specs (CI/CD Pipeline success em dac285f62, 76a6b55ce, 2cf0153ae). Nada a recuperar.

**`claude/fix-email-navy-contrast-261101-2057`** — 2026-11-01 `b1ff2f007`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch (PR #2513) queria que o alto contraste escuro vencesse os inline styles do preset de tema (texto cinza ilegível 1,9:1) pondo !important nos 20 tokens de .dark.high-contrast e ensinando 14 testes de contraste a tolerar !important. A main resolveu a mesma necessidade de forma melhor: applyThemePreset não grava inline quando o alto contraste está ligado (presets.ts:714-722) e !important só nas 8 variáveis de texto (PR #2587, accessibility.css:29-45); todos os parsers de teste já aceitam !important. Nada a recuperar.

**`claude/fix-evolution-connect-500-261113-1721`** — 2026-11-13 `d8a2c92d8`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

PR #3041: botão "Conectar WhatsApp" (Evolution GO) parava de devolver 500 opaco quando a GO caía ou demorava, passando a dizer a etapa que falhou. A mesma necessidade já está em produção pela #3045 (098a648f6): todos os fetches do connect usam safeFetch (nunca lança) e respondem 200 + code go_unreachable 502/504 em PT-BR, com orçamento de prazo de 40 s que também evita apagar a instância sem conseguir recriá-la. ESTADO.md e deployment-manifest da branch eram só âncoras/hashes do arquivo da branch; src/hooks já estão na main (prova mecânica). Única sobra: 2 casos de teste (create que lança rede → 503 + retry) sem equivalente explícito na main, valor baixo, hunks no dossiê.

**`claude/fix-evolution-go-gaps-d6-261019-1548`** — 2026-10-19 `5615e53d9`  
<sub>verificada · apagar: sim</sub>

A branch apagava da edge evolution-api as rotas set-presence, find-chats e find-status-messages (inexistentes na Evolution GO) e removia seus chamadores no front (setPresence do useEvolutionInstance e toda a leitura de stories no useWhatsAppStatus). A main resolveu a mesma necessidade de outro jeito, por decisão do dono (#3035, 2026-11-13): mantém as 3 rotas com guarda goActionNotSupported/goHistoryNotSupported, o front trata notSupported sem erro (aba Presença, DeviceChatsPanel, memória por instância no useWhatsAppStatus) e um teste de contrato (rotas-chamadas-existem.test.ts) falha se uma rota chamada pelo front sumir do roteador. A branch ainda mantinha o send-chat-presence 'paused' ao contato, que a main removeu de propósito. Nada a portar.

**`claude/fix-gr011-311101`** — 2026-11-01 `7589315b0`  
<sub>verificada · apagar: sim</sub>

Branch só corrigia texto do CLAUDE.md antigo ("6 checks" → "3 checks", GR-011). Na main o CLAUDE.md longo foi removido de propósito (#2762, 2026-11-07; hoje contém só `@AGENTS.md`) e a tabela "Perímetro do GitHub" vive em docs/agentes/github-ci.md já com os 3 checks corretos; baseline JSON também diz 3. O segundo arquivo (.github/ci-refresh) é vazio, só gatilho de CI. Nada a portar.

**`claude/fix-gr023-ossf-scorecard`** — 2026-11-01 `de5df6dfd`  
<sub>verificada · apagar: sim</sub>

Branch tenta reintroduzir o OpenSSF Scorecard (workflow semanal + SARIF) e o dependency-review no CI, mais ajuste de inventário 17→18 workflows. Ambos já estiveram na main (W85/W86, 15/10) e foram removidos de propósito em 16/10 pelo commit "CI mínimo" por decisão explícita do dono; a main nunca os trouxe de volta e o inventário hoje é 21 workflows. Os hunks restantes do ci.yml na branch são corrupção (quebram shell e removem o bun install do job e2e). Nada a recuperar.

**`claude/fix-health-check-414-261109-2011`** — 2026-11-09 `e808365e3`  
<sub>verificada · apagar: sim</sub>

Paliativo de 1 linha no health-check de deploy das edges: tratar HTTP 414 (URL longa demais) como erro transitório para não derrubar o deploy. A main resolveu a causa raiz um minuto depois (commit 77dd76417: SQL sem enumerar 85 funções quando scope=all ou >20 slugs), então o 414 não ocorre mais; portar a linha hoje mascararia uma regressão real como "aviso".

**`claude/fix-healthcheck-http414-261109-1900`** — 2026-11-09 `d088b315d`  
<sub>verificada · apagar: sim</sub>

A branch mascarava o HTTP 414 do health-check de edges como aviso transitório. A main resolveu a causa raiz: a SQL enviada à Management API foi encurtada (sem filtro por rota em scope=all; prefixo /functions/v1/ para >20 funções), então o 414 não ocorre mais e tratá-lo como transitório esconderia um erro de cliente determinístico.

**`claude/fix-known-violations-copilot-feedback-261023-2035`** — 2026-10-23 `61f88092f`  
<sub>verificada · apagar: sim</sub>

A branch só adicionava uma exceção de CI (baseline do supabase-usage-guard) para a tabela copilot_feedback, que em 2026-10-23 ainda não existia no catálogo. Hoje a tabela existe na main (migrations 20261026* e supabase/schema-catalog.json), o guard não acusa violação e a chave seria podada como obsoleta. As 26 remoções de chaves antigas já estão na main (known: []). Nada a recuperar.

**`claude/fix-logger-vitest-mock-261017-1000`** — 2026-10-23 `bdfa4e670`  
<sub>verificada · 6 lacuna(s) · apagar: sim</sub>

Mega-PR #2035 (fechada, não mergeada) que travava em "mock do logger quebra o CI": 294 dos 319 arquivos são só a forma do mock de @/lib/logger nos testes, e a main já fez esse mesmo saneamento arquivo a arquivo (308 arquivos mockam o logger, 298 com createLogger) — CI da main verde em dac285f62 sem o mock global. Os poucos fixes de produção estão na main em versão melhor (cast tipado nas RPCs, helper transferConversation, estado de erro real no sentimento, busca do chat interno completa) e duas mudanças da branch são regressões (props opcionais em AppearanceSettings — a review da própria PR apontou crash no botão Salvar; downgrade do diálogo de desconexão). Três itens seriam nocivos hoje (campo sql-sha256 no guard de migrations quebraria as 74 exceções pinned-replay; exclusão das pastas do copiloto do typecheck). Nada de valor para o negócio se perde ao apagar.

**`claude/fix-migration-drift-071107-1500`** — 2026-11-07 `ac61366fc`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

Branch só adicionava os 5 arquivos .sql das migrations aplicadas em 07/11 (copiados do ledger de produção). A main já tem os 5 arquivos e o objetivo (paridade ledger x disco, CI verde) está atingido; porém 2 deles (20261107121000 e 20261107122000) na main NÃO reproduzem o SQL realmente aplicado em produção (nome de índice, expressão da coluna gerada, COMMENTs e revoke de service_role diferem) e a main contorna isso com exceções pinned-replay em scripts/db-audit/migration-evidence.json. Sem efeito em produção ou usuário; só fidelidade do repositório. Conteúdo recuperável do ledger a qualquer momento.

**`claude/fix-n017-harness-261101-2115`** — 2026-11-01 `ea7833bcb`  
<sub>verificada · apagar: sim</sub>

A branch adicionava um `deno cache` antes do baseline do teste de mutação N-017 (Multiplix) alegando que o check obrigatório `Contrato DB offline` quebrava em runner limpo. Na main atual esse passo roda verde sem nenhum pré-aquecimento (run 43684697261 de 15/11, passo N-017 success em 34 s), logo o problema que o patch corrigia não existe; o patch só acrescentaria um download redundante ao CI.

**`claude/fix-pd79-compat-pre-migration-261111`** — 2026-11-12 `d4e880c76`  
<sub>verificada · 11 lacuna(s) · apagar: sim</sub>

A branch fazia duas coisas: (1) deixar o PD-79 funcionar "antes da migration" e (2) restringir a correção manual de status a mensagens em envio, devolvendo o botão "Enviar de novo" para falha definitiva. O bloco 2 — o que valia para o negócio — já está na main pelo pacote #3046, em versão melhor que a da branch. O bloco 1 virou código morto: a migration 20261111160000 está aplicada em produção, então os fallbacks de coluna ausente nunca executam. Sobra um refinamento de polling do painel C110 (valor baixo), transcrito no dossiê. Nada de negócio se perde ao apagar.

**`claude/fix-plano-190-etapas-261019-1200`** — 2026-11-01 `108128f37`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch docs-only: só adiciona o documento de planejamento docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md (979 linhas, 190 etapas de melhoria em 9 fases). Zero código, migration, workflow ou edge. O arquivo não está na main e nunca foi executado, mas o escopo dele foi encerrado pelo próprio dono: a PR #2418 foi fechada em 01/11 pelo congelamento de features (#2545), que admite só os 9 fluxos críticos de docs/PRONTO_PRODUCAO.md, CI e segurança — e esse arquivo da main é hoje a lista fechada e versionada do que está quebrado, substituindo o plano. Sem impacto no negócio em recuperá-lo; o único resíduo útil (checklist de 30 itens de segurança da Fase A) ficou copiado no dossiê, junto do comando de recuperação, antes de qualquer deleção.

**`claude/fix-radar-shortcut-key-261108-2059`** — 2026-11-08 `3b3601747`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch registrava um atalho Ctrl+Shift+A para o painel RADAR (sem executor, só informativo) e recriava 3 testes do relatório de campanha Talk X. Na main o RADAR (#2828) já abre/fecha por Ctrl+Shift+L com listener próprio (RadarPanel.tsx:133, rodapé :457, teste RadarLive.test.tsx:96), então a entrada da branch contradiria a tecla real e não faria nada; a pendência "decidir e registrar um atalho único" já está na issue #2967 item 4. O arquivo de teste na main (568d3f932, 2026-11-09) tem 12 testes que cobrem o mesmo escopo e mais (exportação CSV/PDF); mergear regrediria para 3. Nada útil a recuperar; branch pode ser apagada.

**`claude/fix-replay-known-failures-261102-0935`** — 2026-11-02 `86f6e8c31`  
<sub>verificada · apagar: sim</sub>

Branch destravava o check de CI "Contrato DB offline" (3 exceções no replay-known-failures.json, arquivo da migration 20261026240300 e correção da asserção B.0c). O mesmo conteúdo já foi mergeado na main em 2026-11-02 via PR #2615 (commit 4908feacd). As únicas diferenças que restam foram superadas de propósito pela main: as exceções 220300/230300 ficaram desnecessárias depois que as migrations ganharam guards IF EXISTS (0c191b6b1) e foram removidas (a15fdfb81); o DROP SCHEMA _bkp_261023 executável foi substituído por tombstone só-comentários (#2756, 0601e3b64) com o SQL pinado em _superseded/, porque o ledger já registra a versão enquanto o schema ainda existe em produção (confirmado por consulta read-only). Nada a portar; branch pode ser apagada.

**`claude/fix-settings-salvar-aparencia-261025-1905`** — 2026-10-25 `eded8e947`  
<sub>verificada · 27 lacuna(s) · apagar: sim</sub>

Branch-guarda-chuva de resgate com 101 commits (fix titular: salvar Aparência dava TypeError porque a SettingsView não passava isSaving/onSave ao AppearanceSettings). Nada a recuperar: o fix titular está na main com nome melhor (saveAppearanceSettings) e, nos 27 arquivos com lacuna, a main tem a versão igual ou posterior. Três hunks da branch seriam regressão se portados hoje: fila offline sem dono voltaria a drenar por qualquer sessão, leitura do usuário autenticado voltaria a aceitar sessão de outro projeto no mesmo navegador, e os templates de WhatsApp ficariam admin-only contra a RLS de produção (is_admin_or_supervisor). Branch pode ser apagada.

**`claude/fix-talkx-cron-startup-timeout-261025-1700`** — 2026-10-25 `671b5294f`  
<sub>verificada · 5 lacuna(s) · apagar: sim</sub>

Branch atacava 9,3% de falhas do cron talkx-scheduler-1min (Talk X) com 4 peças: índice em cron.job_run_details, janela de 14 dias na função da UI, handler query_canceled e advisory lock + job de retenção. Só a retenção entrou na main (equivalente 20261102022200, ativo em produção como cron-historico-retencao-7d). Hoje a falha caiu para 0,06% e a mensagem é 'job startup timeout' (worker do pg_cron), causa que nenhuma das peças trata. Único item que ainda vale é o índice composto (UI de cron ainda faz seq scan de 74 mil linhas/81 MB). Branch é duplicata da irmã mais nova ...-261101-2200, que também está fora da main.

**`claude/fix-talkx-cron-startup-timeout-261101-2200`** — 2026-11-01 `9db8ac785`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

A branch queria parar as 4.007 falhas/30d (9,3%) do cron do Talk X. Esse problema já foi resolvido na main por outro caminho: a migration 20261102022200_cron_historico_retencao_7d.sql (de 2026-11-02, posterior à branch) limpa o histórico do pg_cron todo dia com janela de 7 dias — mais rígida que os 30 dias propostos aqui. Em produção hoje o job talkx-scheduler-1min falha 0,06% (6 em 10.075 execuções em 7 dias), e as falhas que sobraram são rajadas globais de 'job startup timeout' que atingem 7-9 jobs no mesmo minuto — não são do Talk X e esta branch não as trata. Além disso o índice que era o item central da branch não pode nem ser criado: a migration roda como 'postgres', que não tem permissão de criar nada no schema cron (a tabela é do supabase_admin), então o primeiro comando do arquivo abortaria a migration inteira. Sobra um trecho pequeno e de baixo valor (advisory lock + captura de query_canceled no tick), já transcrito no dossiê.

**`claude/fix-talkx-report-empty-suite-261108-2125`** — 2026-11-08 `97732853d`  
<sub>verificada · apagar: sim</sub>

A branch só adicionava um placeholder `it.todo` para o arquivo de teste do relatório de campanha Talk X não falhar com "No test suite found". A main já resolveu isso de forma melhor: o mesmo arquivo hoje tem 13 testes reais (commit 568d3f932, integrado via #3035). Nada a recuperar.

**`claude/fix-talkx-report-test-stub-20261108-2210`** — 2026-11-08 `be0a4f5da`  
<sub>verificada · apagar: sim</sub>

A branch só adicionava um teste placeholder vazio (expect(true)) em TalkXCampaignReport.test.tsx para calar o erro de CI "No test suite found". A main já resolveu isso de forma definitiva com 13 testes reais (commit 568d3f932, 2026-11-09). Nada a recuperar; portar o placeholder seria regressão.

**`claude/fix-talkx-test-suite-261108-2330`** — 2026-11-08 `a29a393e7`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch restaurava o arquivo de teste TalkXCampaignReport.test.tsx (CI quebrava com "No test suite found"). A main resolveu o mesmo problema com outra suíte de 12 testes (568d3f932, 2026-11-09) que cobre série diária/hora, heatmap 7x24, render dos 3 gráficos, ausência da série Conversões e ainda PDF; o funil tem teste próprio. Uma assertiva da branch (getByText('Clicaram')) contradiz o comportamento atual da main. Nada útil a recuperar; só um resíduo cosmético (assertiva do mapa creators → "Responsável").

**`claude/fix-talkx-test-suite-261109-0910`** — 2026-11-08 `3ff302c6e`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

A branch só recolocava a suíte de testes do relatório de campanha TalkX (arquivo ficou sem describe/it após PR #2830, quebrando o CI da main). A main resolveu a mesma necessidade por outra suíte mais ampla (commit 568d3f932, 13 testes reais no mesmo arquivo, CI verde). Nada exclusivo da branch é necessário; restam só dois reforços opcionais de teste (domingo=linha 6 no heatmap; "Responsável" via creators).

**`claude/fix-talkxcampaignreport-test-261109-0454`** — 2026-11-09 `291fe3f5f`  
<sub>verificada · apagar: sim</sub>

A branch só embrulhava um it.todo solto em um describe com 1 teste placeholder e 2 it.todo anunciando os testes reais do relatório de campanha Talk X. A main já tem os 12 testes reais (talkxReportData: agrupamento dia/hora + grade 7x24; TalkXCampaignReport: três gráficos + sem série Conversões + falha de PDF), que cobrem exatamente o que os todos descreviam. Nada a recuperar.

**`claude/fix-typecheck-suppression-261019-1342`** — 2026-10-19 `ec57655d5`  
<sub>verificada · apagar: sim</sub>

Ajuste de tipagem (reason_code da lista de supressão Talk X restrito aos 6 motivos do enum) sobre interfaces do hook useTalkXSuppression que a main apagou de propósito em e1f2ee4dd; o mesmo estreitamento já existe hoje em TalkXSuppression.tsx (type ReasonCode). Nenhum efeito para o usuário; nada a portar.

**`claude/fix-typecheck-suppression-261023-2230`** — 2026-10-23 `665432536`  
<sub>verificada · apagar: sim</sub>

Ajuste só de tipagem (narrow de reason_code em interfaces do hook useTalkXSuppression, #2111). O bloco-alvo (BlacklistEntry/AddBlacklistEntryInput/hook Z008) foi removido de propósito da main como código morto em e1f2ee4dd (2026-10-27) e há teste-guarda que impede reintrodução; o narrow de tipo já existe na tela viva TalkXSuppression.tsx (type ReasonCode com os mesmos 6 valores). Zero efeito no negócio; nada a portar.

**`claude/fix-unit-tests-inbox-261023-1108`** — 2026-11-01 `1a77ca485`  
<sub>verificada · apagar: sim</sub>

Fix de infra de testes (virtualizador do inbox no jsdom): shim global de clientHeight/clientWidth em src/test/setup.ts. A main resolveu a mesma necessidade com shims por arquivo em todos os testes do ChatMessagesArea/ChatPopup e a suíte unitária está verde; o segundo fix da PR (spy em FilesTab.fase6) já está na main byte a byte. Nada a recuperar; portar o shim global conflitaria com testes ChatPopup que dependem de clientHeight=0 fora do role=log.

**`claude/fix-unit-tests-mechanical-261024-1527`** — 2026-10-24 `af3fa1db7`  
<sub>verificada · apagar: sim</sub>

Branch de 1 commit (PR #2228, fechada sem merge em 2026-11-01) que consertava o teste unitário de criação de usuário no admin (useAdminDataCreateUser.test.ts), cujo mock apontava para o módulo errado. A main já corrigiu a mesma causa raiz no commit e1f2ee4dd (2026-10-27, "destrava o CI Gate 136 → 0") com abordagem melhor (mantém o parser real de erro em vez de mocká-lo); os hunks que a branch tem a mais são escolhas de teste superadas e um enum já removido na main (special_agent). Nada a portar.

**`claude/fix-unit-tests-src-261024-1630`** — 2026-10-24 `d31f39ae0`  
<sub>verificada · 8 lacuna(s) · apagar: sim</sub>

Branch de 24/10 criada só para deixar os Unit Tests de src/ verdes (mais as correções de produção que esses testes cobriam). A main resolveu o mesmo problema por outro caminho 3 dias depois (e1f2ee4dd, 136 arquivos vermelhos → 0) e depois refatorou os mesmos arquivos. Rodei os 19 arquivos de teste tocados pela branch na árvore atual da main: 11+8 arquivos, 158 testes, todos passam. Todo o código de produção da branch está na main em forma igual ou melhor (useAuth/SEC-FRONTEND-04, mime real do áudio, HZ5-09 do chat interno, ponteOnly do TalkX, aba Tarefas agendadas, MediaMigrationTool com serviço extraído, p_from/p_until do KPI). O que sobra seria regressão: a branch apagava 100 linhas de teste real da busca do chat de equipe (virava it.todo), pulava a asserção de fuso em vez de fixar TZ, e revertia o arquivamento em lote para um UPDATE por contato que o banco hoje recusa. Nada a recuperar; branch pode ser apagada.

**`claude/fix-x051-remote-completion-test-261108-2057`** — 2026-11-08 `6081b1675`  
<sub>verificada · reexaminada · apagar: sim</sub>

Branch corrigia os títulos "Pausar/Cancelar campanha?" (minúsculo) na tela de campanha em execução e no teste remote-completion, para um estado intermediário do X051. O X051 mergeado (#2555) manteve deliberadamente o texto antigo em maiúsculo nesta tela (override RUNNING_LIFECYCLE_COPY, Running.tsx:613/619) e a main é coerente (componente + remote-completion.test + lifecycle.test). Portar a branch quebraria testes da main. A suíte TalkXCampaignReport.test.tsx tem substituto mais completo na main (568d3f932, 12 testes). Nada a recuperar.

**`claude/fix-z017-z020-auth-cors-261018-1950`** — 2026-11-07 `930d57a1d`  
<sub>verificada · 10 lacuna(s) · apagar: sim</sub>

O fix de segurança que dava nome à branch (Z018/Z020: as edges external-db-proxy e cleanup-rate-limit-logs pararam de expor código de erro interno do Postgres em 502 e passaram a usar internalErrorResponse no catch) JÁ ESTÁ na produção, byte a byte, comentários inclusive — entrou pela PR #2794. Os 139 arquivos de "lacuna" apontados pela varredura mecânica são 137 arquivos de auditoria de PRs de 23–24/10/2026 (128 dossiês stub + baselines + prs.json/csv) que a própria main já reescreveu com a auditoria de 11–12/11/2026, mais um workflow de fila de merge que a main apagou de propósito em 14/11 junto com o script que ele chama. Portar a branch hoje reverteria duas decisões vigentes (migração de imports esm.sh→npm: nas edges e remoção da fila serial) e sobrescreveria relatórios mais novos. Sobra uma única linha útil: ignorar package-lock.json no .gitignore — higiene, sem impacto, e o arquivo nem é rastreado. Nenhum risco para WhatsApp/Evolution, inbox, envio, contatos ou login. Branch pode ser apagada.

**`claude/fix-z022-z024-dbguard-ci-261018-1930`** — 2026-10-18 `f0b5b7cd2`  
<sub>verificada · apagar: sim</sub>

Branch só tirava o pin `playwright@1.63.0` dos passos de instalação do Playwright em dois workflows de E2E. Na main o workflow logado nem usa mais `bunx playwright` (roda via scripts/e2e-isolated/run.sh, #2717) e o talkx pina deliberadamente `@1.64.1` igual ao bun.lock por regra SonarCloud S8543 (depois de já ter desafixado em #1923 e revertido em #2054/#2156); a linha de `install-deps` sem pin já está igual. Nada a recuperar; sem efeito no negócio.

**`claude/ga-ci-verde-261020`** — 2026-10-23 `3d4cf85c6`  
<sub>verificada · 8 lacuna(s) · apagar: sim</sub>

Branch guarda-chuva de "CI verde" de 20-21/10 (merge de 16 sub-branches de testes/a11y/contratos). A main fez o mesmo trabalho sozinha em e1f2ee4dd (27/10, 176 arquivos, "136 → 0 arquivos vermelhos") e nos PRs seguintes; onde a main difere, difere por decisão registrada (coverage em shards rejeitado, deno install no deploy-functions, contrato do VoiceChangerPicker sem Storage, ALLOWLIST_NODE zerada). Pior: o tip não compila (3 imports de exports inexistentes) e apaga ações do edge do WhatsApp que a main ainda tem — portar seria regressão. Sobram duas melhorias cosméticas de valor baixo (rótulo ⌘ no Mac nos atalhos e nome duplicado no tooltip do CRM), com o hunk salvo no dossiê.

**`claude/keen-galileo-dxai3p`** — 2026-10-30 `172c19c43`  
<sub>verificada · apagar: sim</sub>

Sessão de 2026-10-30 de conserto de workflows CI. O único código vivo (try/catch no gh pr list de scripts/ci/fila-merge.mjs) entrou na main em versão melhor (bcb11c845, PR #2394) e depois o script e o workflow auto-update-pr-branch foram removidos de propósito no pacote 6 (41853318c, PR #3113). O cast `any` em contact.service.ts só existia para contornar o types-sync enquanto contact_notes.is_pinned não estava nos tipos; hoje types.ts (linhas 2350/2362/2374) e a coluna em produção já o têm, e a main mantém a versão tipada. Os relatórios PENDENCIAS.md/RELATORIO_CI.md são da sessão e foram substituídos por relatórios posteriores já na main (2026-10-31 e 2026-11-12); RELATORIO_CI_FINAL.md já está idêntico na main. Nada a recuperar; branch pode ser apagada.

**`claude/loving-lovelace-esc3l2`** — 2026-11-01 `bc79d33b5`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Auditoria exaustiva do Supabase de produção (12 seções, 62 arquivos de relatório/inventário/propostas) + 3 migrations de segurança/LGPD + ajustes em src/. A main já consolidou formalmente esta auditoria: auditoria-supabase/achados.json da main lista "PR #2186 (68 achados P001-P010)" como fonte do ledger ZW-nnnn. As 3 migrations foram substituídas por versões melhores já aplicadas em produção (department_invites admin-only, retenção login_attempts 90d preservando lockout, log_search_event com correlação busca-clique). Os arquivos src/ são ou idênticos à main (MediaMigrationTool/service), ou regressão (useWarRoomAlerts volta ao Notification cru), ou alvo inexistente (useDepartmentManagement, que hoje usa RPC create_department_invite), ou testes mais fracos. Os números do relatório já estão obsoletos (grants anon 99→1, policies UPDATE sem WITH CHECK 39→29, FKs sem índice 20→6). Nada a portar.

**`claude/magical-pasteur-iz2pgy`** — 2026-10-23 `48ef50d2e`  
<sub>verificada · 6 lacuna(s) · apagar: sim</sub>

Lote de manutenção de CI de 23/10/2026 (deixar verde Unit Tests e Contrato DB offline), sem funcionalidade de negócio. Os 11 ajustes que importavam já estão na main por outros commits — e em versões melhores: logout limpa a fila de envio offline (useAuth), canal de notificação do Chat de Equipe por sessão (HZ5-09 + HZ3-001), diagnóstico não quebra com erro de contagem (N-216), erro ao carregar configurações avisa o usuário, ARIA completo na paleta de comandos, arquivamento em lote por conversation_status, filtro por segmento na aba Destinatários do Talk X (confirmado em produção: a RPC já tem os 6 parâmetros). Dois arquivos seriam regressão se recuperados: a branch troca o rótulo de data das Tarefas de "09 out." para "09/10/2026" e apaga 80 linhas do contrato de datas que a main mantém. Restam 5 resíduos cosméticos/defensivos, todos de valor baixo, com os hunks copiados no dossiê. Nada de alto ou médio valor foi perdido.

**`claude/project-thread-lrbsuz`** — 2026-11-01 `3ff941d8c`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

PR #2524 (1 commit) acrescentava 'gte'/'lte' ao mock do Supabase no teste useAdminData.select.test.ts alegando que o teste quebrava com "b.gte is not a function". A premissa é falsa: na main (e já no merge-base) o hook só chama .gte/.lte quando recebe filtro de data, e o teste chama useAdminData('audit') sem filtro — o mock nunca é invocado com esses métodos. Os demais hunks só apagam comentários que a main mantém. Nada a recuperar; sem efeito no negócio.

**`claude/wizardly-meitner-aejx3i`** — 2026-10-31 `51fdf980a`  
<sub>verificada · 9 lacuna(s) · apagar: sim</sub>

Diário de bordo de uma sessão /merge-prs de 30-31/10/2026: 21 commits chore(analise), 75 arquivos, todos dentro de analise-prs/. Zero código — nenhum arquivo em src/, supabase/, e2e/, scripts/ ou .github/. É o inventário e os 70 dossiês das PRs #2111-#2411 que estavam abertas naquela data. Hoje o repo não tem nenhuma PR aberta (GraphQL states:OPEN -> totalCount 0) e a main já carrega uma geração mais nova dos mesmos arquivos (último toque d084ca753, 2026-11-14, cobrindo PRs #3048-#3058). O único arquivo com conteúdo durável, regras-de-negocio.md reescrito como regras de domínio, é documentação derivada de código que segue na main e já é publicada por docs/agentes/regras-dominio.md e pela branch contexto (07-REGRAS-DE-NEGOCIO.md com 5.459 linhas, regerada a cada 10 min). Nada a recuperar; apagar a branch não perde valor de negócio.

**`claude/wizardly-ride-dimxnt`** — 2026-11-14 `35bb4cba5`  
<sub>verificada · apagar: sim</sub>

Auditoria dos workflows do GitHub Actions: removeu a fila de merge (auto-update-pr-branch + fila-merge), tentou remover o Vercel Env Cleanup, fez o check Talk X só rodar em PR com (X) no título e ajustou docs/testes de contagem. A parte útil entrou na main pelo pacote 6 (#3113); a remoção do Vercel Env Cleanup foi desfeita de propósito no pacote 7 (#3123, commit 03ad0a8fc) porque a medição na API da Vercel achou 12 variáveis a remover, 7 delas segredos de servidor em preview. Nada a recuperar.

**`claude_04/gifted-ride-xq3mj4`** — 2026-11-01 `fb3676d4a`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

PR #2525 reconciliava 2 migrations órfãs do ledger (índices FK e WITH CHECK em 8 políticas RLS) e atualizava PENDENCIAS.md/RELATORIO_CI.md com o estado dos workflows em 2026-11-01. As 2 migrations já estão na main byte a byte (via PR #2551); os dois documentos são snapshots de status de 2026-11-01 superados por versões de 2026-11-12 na main e pelo histórico em docs/_arquivo/PENDENCIAS.md. Nada a recuperar.

**`claude_04/intelligent-babbage-bo2g5s`** — 2026-11-02 `1adaffb06`  
<sub>verificada · apagar: sim</sub>

PR #2601 subia o timeout do login (edge auth-login) de 12s para 25s para não cortar logins legítimos quando a edge demora (cold start). A main já resolveu o mesmo problema pela PR #2602 com 30s (margem maior). Nada a recuperar; portar 25s seria regressão.

**`claude_04/pensive-tesla-ixtl9w`** — 2026-11-01 `f3cccccae`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

Sessão de "fix CI" de 2026-11-01 (PR #2526): 1 commit de código (deno check --config no deploy-functions.yml + espera do tema dark no teste axe do e2e/email-navy-visual.spec.ts) e 9 commits de relatório (RELATORIO_CI.md, PENDENCIAS.md). Os dois fixes de código já estão na main por outros commits (#2575 e #2710); os relatórios são snapshots datados substituídos de propósito por versões posteriores (2026-11-05 a 2026-11-15). Nada a recuperar.

**`claude_04/trusting-newton-duiglt`** — 2026-11-01 `fddda42f3`  
<sub>verificada · reexaminada · 1 lacuna(s) · apagar: sim</sub>

PR #2540: retry no gh pr list da fila de merge + conserto de 8 suítes vitest + uploadAudio com MIME real. A fila de merge (scripts/ci/fila-merge.mjs e o workflow que a chamava) foi apagada da main no pacote 6 (#3113), então o retry não tem mais alvo. O uploadAudio com MIME real e o clientHeight nos testes entraram na main por e1f2ee4dd com outro texto; os mocks extras e o unmount não são necessários porque as suítes já passam na main (CI verde em dac285f6). Nada útil perdido.

**`claude_05/awesome-ramanujan-ufxolu`** — 2026-11-08 `5cc25fbfe`  
<sub>verificada · 3 lacuna(s) · apagar: sim</sub>

Diário de uma sessão de triagem de PRs (01–09/11): 167 arquivos, todos em analise-prs/, zero código, zero migration, zero edge, zero workflow. A main arquivou de propósito essa geração de documentos como "prosa morta" (#2630 → docs/_arquivo/analise-prs/) e regenerou analise-prs/ com relatório vivo de 12/11; as PRs que a branch documentava já estão encerradas ou têm dossiê mais novo e mais fundo na main. O único arquivo com conteúdo durável (regras de domínio do produto) teve o caminho reaproveitado na main para outro documento, e seu conteúdo está coberto por docs/contexto/regras/manual/regras.md, docs/agentes/regras-dominio.md, IA-004, CV-005-brinde-spec e docs/dashboard/README.md — todos mais novos. Nada a recuperar; nenhum efeito no produto.

**`claude_05/zen-feynman-29b7ix`** — 2026-10-25 `c49753c71`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch de limpeza de CI de 25/10 (119 testes falhando, typecheck, workflow, relatório de PRs) que levou de carona melhorias de UX/a11y em WarRoom, Auditoria, Talk X Segmentos e Dashboard. Todo o trabalho útil já está na main por implementação equivalente ou melhor; o que falta teve o alvo apagado de propósito (o workflow auto-update-pr-branch.yml não existe mais), foi substituído por outra abordagem (service de mídia, hook de auditoria, mocks de teste) ou contradiz a main (fallback silencioso que esconderia falha das RPCs do WarRoom, .gitignore de um diretório que a main versiona, remoção do fallback da gamificação). Nada de valor para o negócio foi perdido; branch segura para apagar.

**`claude_pink/dreamy-wright-j0bser`** — 2026-10-28 `b6222cd8e`  
<sub>verificada · 8 lacuna(s) · apagar: sim</sub>

Branch sem nenhuma linha de código: 107 arquivos, todos em analise-prs/ (inventário + 100 dossiês de 12 linhas + relatório + baselines), retratando o backlog de PRs em 27/10/2026. O que ela documenta deixou de existir: as 100 PRs analisadas estão fechadas sem merge (amostra #2087, #2090, #2244, #2274, #2284 todas CLOSED/merged=false), inclusive as duas que o relatório apontava como bloqueio que exigia intervenção do dono; e o bloqueio de CI que ela descreve foi resolvido (relatório vivo da main, sessão 11-12/11, registra merge com todos os checks success). A main já guarda esse histórico em versão melhor: os 100 dossiês têm homônimo em docs/_arquivo/analise-prs/dossies/ com análise real (diff lido, SHA verificado) contra os da branch que dizem head_sha: unknown. Aplicar a branch seria piora: sobrescreveria o workspace vivo analise-prs/ (relatório de novembro, inventário com SHA real, regras de negócio completas) por um retrato de outubro. Nada a recuperar; branch pode ser apagada.

**`claude_pink/nice-hypatia-iikl82`** — 2026-11-01 `8b3efcceb`  
<sub>verificada · 15 lacuna(s) · apagar: sim</sub>

Mega-branch de consolidação de CI/testes de 2026-10-19 a 11-01 (PR #2511), 539 commits atrás da main. Nada exclusivo dela vale recuperar: as 305 lacunas de teste já existem na main (302/305) e o problema do mock de logger foi resolvido na origem (src/lib/logger.ts); os 3 testes exclusivos cobrem o módulo de compras/pagamentos removido de propósito (#2690); e toda ideia de produto dela já está na main em versão melhor (áudio com mime real, menções no painel de notas, contadores da inbox, safe-area mobile, reabrir conversa, aba 'memoria'). O conteúdo que só existe nela é REGRESSÃO: destrói o fluxo de Conexões WhatsApp (241→73 linhas, QR/trava E42 trocados por stubs vazios), destrói a Carteira de Clientes (135→35 linhas, hook que sempre retorna vazio), apaga a guarda de invariantes do banco vivo (RLS/security_invoker/policy aberta) e esvazia a guarda de settings do GitHub (396→25 linhas), além de corromper acentos em comentários. 310 dos 351 arquivos conflitam com a main — não é mergeável. Único ponto a registrar: ela renomeia o painel Talk X 'Mais convertidos' para 'Maior taxa de resposta', o oposto do que a main faz hoje (rótulo fixado por 3 testes).

**`codex/consolidacao-baseline-pr-20261101`** — 2026-11-01 `0eed116b7`  
<sub>verificada · 1 lacuna(s) · apagar: sim</sub>

Branch só de documentação: acrescentava ao docs/consolidacao/BASELINE.md uma fotografia de métricas (build/lint/typecheck/testes) da main de 01/11/2026. Na main o arquivo-alvo e toda a pasta docs/consolidacao/ foram arquivados de propósito em docs/_arquivo/ como "prosa morta" (PR #2630, 02/11), e já existe baseline posterior (02/11) em outro arquivo. Não corrige bug nem muda comportamento; nada a recuperar.

**`codex/fix-failed-workflows-20261020`** — 2026-10-21 `bf0ce7695`  
<sub>verificada · apagar: sim</sub>

Branch de conserto de CI (pin Playwright 1.64.1, job Deno de edges, cache Bun, baselines de docs geradas, a11y das abas do Admin, animação do estado vazio). O núcleo entrou na main pelo merge #2156 (4b9585052, 2026-10-21); o que hoje difere foi substituído de propósito depois (coverage upload removido com justificativa, install-deps despinado em #2054, teste de rotas legadas removido em #2054, docs geradas regeneradas com 21 workflows / banco de 2026-11-14). Nada a recuperar; apagar a branch é seguro.

**`dependabot/bun/deps-semanal-0b89910d44`** — 2026-11-14 `9aee73074`  
<sub>verificada · 5 lacuna(s) · apagar: sim</sub>

Bump semanal do Dependabot (16 pacotes) + alinhamento do pin do Playwright a 1.65.0. A main já tem 11 dos 16 bumps (squash ab657aa34, pacote 5/#3064). Os 5 restantes (supabase-js, react-query, i18next, pdfjs-dist, Playwright 1.65) e os 8 arquivos de infra que fixam Playwright 1.65.0 foram deixados de fora de propósito, com motivo registrado no commit (i18next/pdfjs estouram o orçamento de bundle/assets; Playwright 1.65 derruba o E2E no Firefox) e confirmado pelo CI do tip (Build e E2E FAILURE). Nada de src/, edge ou migration. O Dependabot regenera esses bumps semanalmente; a branch não carrega trabalho único.

**`docs/update-pendencias-db-live-guard-261102`** — 2026-11-02 `ed50aa9f3`  
<sub>verificada · apagar: sim</sub>

Snapshot de status do PENDENCIAS.md de 2026-11-02 (DB Live Guard com 6 falhas, types-sync disparado, fix --frozen=false do deploy de edges aguardando verificação). O arquivo foi reescrito 18 vezes na main desde então (hoje datado 2026-11-12/15) e registra DB Live Guard, types-sync e Deploy Edge Functions como resolvidos e verdes. Portar o texto reintroduziria informação falsa. Nada a recuperar.

**`f3/strict-false-baseline-20261018`** — 2026-10-18 `3de493255`  
<sub>verificada · 4 lacuna(s) · apagar: sim</sub>

Branch implementava a decisão F3 de 18/10 (strict=false no branch-protection da main, sem fila serial). Essa decisão foi revogada: a main hoje documenta strict=true como política vigente, proíbe mexer no strict, mede strict=true no baseline (2026-11-02) e apagou a fila serial (fila-merge.mjs/unit e auto-update-pr-branch.yml). Aplicar qualquer hunk regrediria o perímetro protegido pelo settings-guard. Nada útil pendente.

**`fix/ci-f1b-restaura-workflows-20261018`** — 2026-10-18 `4ce5a6e97`  
<sub>verificada · apagar: sim</sub>

Branch de 18/10 que recriava o workflow de fila de merge (auto-update-pr-branch.yml + fila-merge.mjs), recriava settings-guard.yml e completava a doc do notifica-falha-main. Hoje: settings-guard.yml já está na main (mesmo conteúdo; cron reduzido depois, de propósito, para 1x/dia em Z030); a doc do notifica-falha-main já tem os campos falha/avisa com outro texto; e o auto-update-pr-branch.yml foi recriado por outra PR (#2210) e depois REMOVIDO de propósito pelo dono em 14/11 (pacote 6, #3113, commit 41853318c), com instrução vigente de não religar (merge-prs.md). Nada a recuperar; recriar o workflow contradiz a decisão atual.

**`fix/ci-verde-261021`** — 2026-10-21 `64934014e`  
<sub>verificada · 8 lacuna(s) · apagar: sim</sub>

A branch não era funcionalidade: consertava uma main que não compilava em 21/10 (código pela metade no merge_base — testes importando funções inexistentes em evolution-api, variáveis não declaradas no handler de presença do WhatsApp). A main resolveu a MESMA quebra no mesmo dia por outro caminho (PR #2156, commit 4b9585052) e desde então avançou muito. Tudo que importa para o negócio já está na main, em geral melhor: presença/digitando do WhatsApp (grupo com autor, canal privado, visto por último só na transição), backoff e reauth do Gmail, alertas de conexão com dedupe, transferência de conversa pelo helper único com compare-and-set, tipos e manifesto do banco regenerados em 15/11. Sobra apenas: (a) pareamento por número (conectar sem QR) — 4 funções utilitárias que nunca foram ligadas a rota, hook ou tela, e cujos testes a main apagou de propósito; (b) um job de cobertura no CI que a main recusa por escrito; (c) um Retry-After que contraria a decisão vigente da main. Nada de alto valor a recuperar; branch pode ser apagada.

**`fix/ci-workflows-vermelhos`** — 2026-10-21 `0770f6b5e`  
<sub>verificada · 5 lacuna(s) · apagar: sim</sub>

A branch não entrega funcionalidade: é um reparo de emergência de uma main que não compilava em 19-21/10 (declarações duplicadas, símbolos inexistentes, concurrency duplicado). Para destravar o CI ela APAGOU código de produção: ~40 ações do evolution-api (set-settings, get-webhook, send-template, mark-unread, find-chats, find-messages...), dezenas de entradas da matriz de autorização do WhatsApp e o passo live-invariants do guarda de banco. A main resolveu a mesma quebra mantendo tudo. Portar hoje seria destruir funcionalidade de WhatsApp e afrouxar autorização. Os 272 testes com stub createLogger já estão na main em versão mais rica; os workflows já têm playwright 1.64.1, cache Bun, deno check --config, concurrency único e validate-runtime-proof. Sobram 3 ajustes de uma linha, de valor baixo, que não dependem da branch.

**`fix/sincronizar-migrations-sql-divergente-261101-0400`** — 2026-11-01 `2e2f97fb9`  
<sub>verificada · apagar: sim</sub>

Branch de 01/11 tentava zerar 5 falhas "SQL divergente" do db-live-guard editando a migration do Copilot (16 DROP POLICY IF EXISTS) e registrando 4 exceções no evidence. A main resolveu o mesmo problema de outro jeito: manteve a migration imutável e fixou-a por hash no evidence (pinned-replay) + replay-known-failures; as 4 exceções já existem na main com hashes idênticos; a prosa de PENDENCIAS foi arquivada em docs/_arquivo/PENDENCIAS.md. Aplicar o patch da branch hoje quebraria o pin de hash. Nada a recuperar.

**`resolve-2199-from-main`** — 2026-11-01 `4940f3847`  
<sub>verificada · 2 lacuna(s) · apagar: sim</sub>

Branch de CI (PR #2431, extração da #2199): guard anti-DROP de roles pg_* no docker-shim e mocks globais de virtualizador em src/test/setup.ts. O risco do shim (snapshot de roles vazio → drop de tudo) foi fechado na main por #2710 (aborta sem snapshot; pg_ é prefixo reservado do PostgreSQL). O hunk de setup.ts é desnecessário (o teste-alvo ChatMessagesArea.loop já tinha mocks próprios na base e a main usa mock por teste em 17 arquivos) e nocivo (remove writable:true e quebraria useFilesContainerColumns.test.tsx). Nada a portar; branch pode ser apagada.


---

## Parte B — As 329 entradas auditadas (branches e PRs fechadas)

Inclui entradas cuja branch **já não existe** no `origin` (PR fechada com a branch apagada).

| Veredito | Quantas | O que significa |
|---|---|---|
| `INCORPORADA` | 162 | O trabalho já está na `main`, provado por conteúdo |
| `OBSOLETA` | 105 | A `main` seguiu outro caminho; não há o que resgatar |
| `PERDIDA_PARCIAL` | 54 | Parte do trabalho não chegou à `main` |
| `PERDIDA_TOTAL` | 5 | Nada do trabalho chegou à `main` |
| `DECISAO_DONO` | 3 | Depende de escolha de negócio, não de engenharia |

**328 de 329** passaram pela verificação adversarial; **47** foram reexaminadas;
**165** registram ao menos uma lacuna; **267** receberam recomendação de apagar.

**Ressalva honesta:** 1 entrada não passou pela verificação adversarial — 
`claude__chore-remove-hook-morto-talksuppression-261024-1541` (veredito `OBSOLETA`). Não é 329 de 329.

### B.1 — As que a auditoria marcou como perda (total ou parcial)

São estas que sustentam as 226 evidências do `itens-confirmados.json`.

#### Perda total — 5 entradas

**`claude__chore-secdef-guard-ci-test-261107-1600`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Teste de contrato (bash + Postgres descartável) que prova que as RPCs de gamificação update_agent_streak e increment_agent_resolutions usam o guard de segurança canônico (service_role passa, anon e usuário alheio negados). A correção que ele protege (migration 20261107153000, PR #2766) está na main e aplicada em produção, mas o teste não entrou em nenhum lugar — regressão futura nesse guard não seria pega pelo CI.

- **Lacuna 1:** {"arquivo": "scripts/db-audit/secdef-guard-check.test.sh", "descricao": "Arquivo novo inteiro ausente na main: 4 asserts estáticos (pg_get_functiondef ILIKE guard canônico/quebrado) + 4 cenários runtime (service_role sem claims passa, anon negado, authenticated dono passa, authenticated alheio negado) aplicando a migration 20261107153000 em Postgres 17 descartável. Aplica limpo; migration-alvo existe na main com o mesmo nome.", "tipo": "test", "valor": "medio", "linhas_aprox": 154}
- **Lacuna 2:** {"arquivo": ".github/workflows/db-guard.yml", "descricao": "Não está na branch, mas é necessário para o teste contar: adicionar scripts/db-audit/secdef-guard-check.test.sh ao array testes=(...) do passo 'Provar contratos shell restantes em serviços descartáveis' (ou passo próprio com SECDEF_GUARD_POSTGRES_IMAGE=${{ env.POSTGRES_TEST_IMAGE }} + retry-disposable-postgres-test.sh); sem isso check-test-inventory.mjs marca órfão. Toca workflow → PR fica aberta para o dono.", "tipo": "workflow", "valor": "medio", "linhas_aprox": 2}

**`claude__fix-ga-fase1-lote-banco-261020-2200`** · *branch ainda viva no origin*  
<sub>8 lacuna(s) · verificada · **apagar: não**</sub>

Fase 1 do plano GA (lote banco): GA19 cria exit 3 exclusivo para "só apply pendente" em check-migration-drift/lote-pendente e nos workflows db-live-guard e types-sync, devolvendo exit 2 a "só erro de infra"; GA18 confina o -f dos contratos de runtime ao repo; GA26 (prepare) adiciona --json. Nada disso está na main: hoje o drift script nem tem --classificar nem exit 3 (removido no lote 880 em 2026-10-16), então uma falha de autenticação/conexão com o ledger (exit 2) vira "apply pendente" verde no push do db-live-guard e awaiting_apply=true no types-sync (fail-open), enquanto apply pendente legítimo sai 1 e é tratado como drift real. Triagem anterior "OBSOLETA" refutada.

- **Lacuna 1:** {"arquivo": "scripts/db-audit/check-migration-drift.mjs", "descricao": "GA19: compare() devolve pendingApply/externalOnly/pendingOnly (malformedNames contado) e main() retorna 3 quando pendingOnly; GA26: --json emite {ok, linhas:[{version,disco,ledger,classe}]} com log humano em stderr. Reencaixar após E53 (pendingStatus/DIVERGENCE_LINE_RE em :976-982).", "tipo": "script", "valor": "alto", "linhas_aprox": 49}
- **Lacuna 2:** {"arquivo": "scripts/db-audit/lote-pendente.mjs", "descricao": "GA19: ramo rc===3 = apply aguardado; rc 2 cai em drift real (falha fechada); docstring dos exits; opcional remover '--classificar' morto em :49.", "tipo": "script", "valor": "alto", "linhas_aprox": 21}
- **Lacuna 3:** {"arquivo": ".github/workflows/db-live-guard.yml", "descricao": "GA19: push neutro passa a testar `-eq 3` (hoje `-eq 2` = erro de infra vira verde) em :155.", "tipo": "workflow", "valor": "alto", "linhas_aprox": 4}
- **Lacuna 4:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA19: awaiting_apply=true só com `-eq 3` (hoje `-eq 2`) no passo apply-pending :342; comentário dos exits.", "tipo": "workflow", "valor": "alto", "linhas_aprox": 6}
- **Lacuna 5:** {"arquivo": "scripts/db-audit/check-migration-drift.test.mjs", "descricao": "runGuard ganha argv; testes ledger:[] passam a esperar 3; novos: falha de autenticação sai 2 nunca 3; --json emite tabela.", "tipo": "test", "valor": "medio", "linhas_aprox": 31}
- **Lacuna 6:** {"arquivo": "scripts/db-audit/lote-pendente.test.mjs", "descricao": "Mock/teste exit 3; helper runRealLote (psql falso) com 2 testes reais: pendente → 3; psql falhando → rc fora de {0,3}.", "tipo": "test", "valor": "medio", "linhas_aprox": 76}
- **Lacuna 7:** {"arquivo": "scripts/db-audit/run-runtime-contract.mjs", "descricao": "GA18: -f do contrato resolvido contra a raiz do repo, exige prefixo RAIZ+sep e .sql, exit 2 '::error::contrato com -f fora do repo'; psql-safe recebe o caminho resolvido.", "tipo": "script", "valor": "medio", "linhas_aprox": 25}
- **Lacuna 8:** {"arquivo": "scripts/ci/db-migrate-contratos.unit.mjs", "descricao": "GA18: 2 testes (-f em comentário ignorado por extrairInvocacoes; -f ../evil.sql sai 2 pelo executor).", "tipo": "test", "valor": "medio", "linhas_aprox": 29}

**`claude__fix-talkx-segmentos-regressao-261101-1944`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

PR #2535 restaurava na biblioteca de segmentos do Talk X o que o squash #2240 apagou: painel "Detalhes do segmento" completo (↻ no cabeçalho com estado "contando", todos os critérios por extenso sem corte em 5, "Criado em", "Amostra de contatos"), cartão da grade com descrição e alternância lista/grade ligada ao hook, Esc/✕ devolvendo o foco também ao cartão da grade, e o typo visível `font--semibold` (nome do cartão sem negrito). Foi fechada só pelo congelamento de features (#2545), nunca mergeada, e nada disso chegou à main: hoje a main ainda tem o typo (L514), o corte `slice(0,5)` (L782), foco só na linha da tabela (L58/L536), `viewMode` do hook sem consumidor e sem "Criado em"/"Amostra". Valor médio (UX/a11y de tela não crítica). Ao portar: manter o retorno antecipado de is_set/is_empty do describeRule da main (bug apontado pela review), descartar o helper teclaDe (lint já resolvido) e preservar o '—' de estimativa nula (#2826).

- **Lacuna 1:** {"arquivo": "src/components/talkx/TalkXSegments.tsx", "descricao": "Restaurar X111/X112/X116 sobre o X115 atual: SegmentDetailRail via RailCard (↻ no cabeçalho aria-label 'Recontar público deste segmento' com disabled+spin via isFetching, chips ruleText/rulesOf sem slice(0,5), ORIGIN_LONG, 'Criado em', 'Amostra de contatos' de est.sample), SegmentGridCard (descrição, origem, status, chips, público) + ViewModeToggle consumindo viewMode/setViewMode do hook (remover useState local L57), Map rowRefs para Esc/✕ devolverem foco à linha ou ao cartão, typo font--semibold. Ao portar: manter early-return is_set/is_empty do describeRule, não usar teclaDe, preservar '—' para estimativa nula (#2826), avaliar manter role=button e o botão Favoritar do rail.", "tipo": "front", "valor": "medio", "linhas_aprox": 260}
- **Lacuna 2:** {"arquivo": "src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx", "descricao": "6 testes novos (Criado em + Amostra via RPC p_mode=page; amostra vazia oculta; modo grade com descrição no cartão e foco de volta ao cartão por Esc e ✕; ↻ com nome acessível e disabled/spin enquanto conta; font-semibold no cartão; painel lista todos os critérios sem corte em 5) + mock do hook com viewMode/setViewMode. Patch aplica limpo na main; os 5 rótulos revertidos ('Editar', 'Recontar público deste segmento', Favoritar sem escopo) só valem se o componente for portado igual. Importar fmtDateTime de ../kit/format.", "tipo": "test", "valor": "medio", "linhas_aprox": 125}

**`claude__w21-classificar-migration-drift`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

A branch cria o modo `--classificar`/`--json` do check-migration-drift, que separa "migration no disco ainda sem apply" (exit 2, neutro) de drift real (exit 1). A main NÃO tem esse flag, mas já tem o consumidor dele: `lote-pendente.mjs:49` chama `check-migration-drift.mjs --classificar` e o `db-live-guard.yml:152` e o `types-sync.yml:339` dependem do exit 2. Como a main nunca devolve 2 para apply-pendente, o guard de banco abre alerta de drift falso a cada lote mergeado antes do apply e o types-sync roda os gates de TypeScript contra schema não aplicado. O contrato de CI do banco está quebrado na main e a correção está só nesta branch. Triagem anterior ("DUPLICATA_PROVAVEL") estava errada.

- **Lacuna 1:** {"arquivo": "scripts/db-audit/check-migration-drift.mjs", "descricao": "Modo --classificar/--json ausente na main: flag em main(), duplicateVersions em parseLedger(), array classifications + classifyIfDiverged() antes de cada continue dos ramos de exceção em compare(), driftErrors (intervalo applyPendenteStart..applyPendenteEnd), tabela 'version | disco | ledger | classe', saída JSON com totais e exit 2 para apply-pendente. A main já chama esse flag em lote-pendente.mjs:49 — sem ele o db-live-guard abre alerta de drift falso em push e o types-sync não marca awaiting_apply.", "linhas_aprox": 116, "tipo": "script", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "scripts/db-audit/check-migration-drift.test.mjs", "descricao": "12 testes W21 ausentes na main: parâmetro scriptArgs no runGuard, uma asserção por classe (apply-pendente exit 2, ledger-sem-arquivo/conteudo-divergente/version-duplicada exit 1), caso limpo exit 0, --json válido, formato de 4 campos por linha, 4 cenários de ramo de exceção (comment-only, name-and-file-pinned, pinned-replay, name malformado) que sem classifyIfDiverged sairiam com exit 0, 3 exceções válidas sem falso positivo e apply-pendente sozinho com erros vazios.", "linhas_aprox": 118, "tipo": "test", "valor": "medio"}

**`codex__consolida-docs-deploy-ga98`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Endurece o gerador de docs do CI (scripts/ci/render-workflow-docs.mjs): descrição longa de item "nao-e-bug" quebrada em duas linhas passaria a ser concatenada em vez de descartada em silêncio; exporta o parser e adiciona teste unitário. Nenhum workflow da main usa descrição multilinha hoje, então é proteção futura, sem efeito em produto, WhatsApp, inbox ou banco. Nada do trabalho está na main; aplica limpo.

- **Lacuna 1:** {"arquivo": "scripts/ci/render-workflow-docs.mjs", "descricao": "Parser extrairNaoEBug não concatena linha de continuação (#     texto) ao item anterior; funções extrairDocs/extrairNaoEBug não exportadas e corpo do script sem guarda process.argv[1] === fileURLToPath(import.meta.url), impedindo import em testes. Hunks no dossiê; aplica limpo (arquivo inalterado na main desde a base).", "tipo": "script", "valor": "baixo", "linhas_aprox": 11}
- **Lacuna 2:** {"arquivo": "scripts/ci/render-workflow-docs.multiline.unit.mjs", "descricao": "Teste node:test novo (2 casos: continuação multilinha de nao-e-bug e os quatro campos de docs). Depende dos exports do item anterior. Conteúdo íntegro no dossiê.", "tipo": "test", "valor": "baixo", "linhas_aprox": 27}

#### Perda parcial — 54 entradas

**`claude_05__serene-feynman-3uuurw`** · *branch ainda viva no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

Branch corrigia a tela admin "Insights de Busca" (RPC inexistente get_search_insights → search_insights, ZW-0011) e atualizava entregáveis da auditoria Supabase. O comportamento (hook + testes) já entrou na main via #2798; auditoria e grants-baseline foram superados por versões mais novas na main (08/11 e 15/11). Falta só a cópia/JSDoc da view: a tela da main ainda promete listas de termos e cita RPC inexistente, enquanto o hook devolve listas sempre vazias — texto enganoso para o admin, sem impacto funcional.

- **Lacuna 1:** {"arquivo": "src/components/admin/SearchInsightsView.tsx", "descricao": "JSDoc e textos da UI ainda citam RPC get_search_insights e prometem 'termos normalizados'/'use a lista abaixo'; empty-states 'Nenhum termo registrado/sem resultado no período' enquanto o hook devolve listas sempre vazias. Portar os 4 hunks do diff (só texto) e ajustar asserções em __tests__/SearchInsightsView.test.tsx linhas 51-52 e 97 para 'Textos de busca não são armazenados — privacidade por design.'", "tipo": "front", "valor": "medio", "linhas_aprox": 15}

**`claude__busy-cannon-40szm9`** · *branch ainda viva no origin*  
<sub>8 lacuna(s) · verificada · **apagar: não**</sub>

Sessão de análise das PRs abertas de 01-02/11: 152 dos 162 arquivos são relatórios/dossiês em analise-prs/ sobre PRs #2100-#2606 que já não existem (a main reescreveu analise-prs/ com dossiês de #2811-#2970) e 2 seções de PENDENCIAS.md sobre a PR #2494, já fechada e com o arquivo inteiro reescrito na main. Os 6 ajustes em src/ estão obsoletos, superados ou sem efeito nenhum. Sobra uma única lacuna real de valor baixo: 2 linhas de guarda no script de container de teste do banco (scripts/db-audit/docker-shim) para não tentar dropar roles built-in do PostgreSQL. Nada de WhatsApp, inbox, envio, contatos ou login é afetado.

- **Lacuna 1:** {"arquivo": "scripts/db-audit/docker-shim", "descricao": "Guarda de 2 linhas no laço de limpeza de roles (caso `rm`) para pular roles `pg_*` e `postgres` antes do DROP ROLE. Inserir após a linha 183 da main (`[[ -z \"$role\" ]] && continue`). Defensivo em script de container de teste; o Postgres já recusa esses DROPs e o erro é silenciado.", "linhas_aprox": 183, "tipo": "script", "valor": "baixo"}
- **Lacuna 2:** {"arquivo": "analise-prs/ (152 arquivos: 138 dossies, 8 baseline, RELATORIO_PRS.md, progresso.json, prs.json, prs.csv, prs-lista.json, regras-de-negocio.md)", "descricao": "Relatórios e dossiês da análise das PRs #2100-#2606 em 01-02/11/2026 e snapshot derivado de regras de negócio. Obsoletos: as PRs já não estão abertas, a main reescreveu analise-prs/ e a fonte oficial de regras geradas hoje é a branch `contexto` (regras/).", "tipo": "docs", "valor": "nenhum"}
- **Lacuna 3:** {"arquivo": "PENDENCIAS.md", "descricao": "32 linhas com §4/§5 sobre o CI vermelho da PR #2494 (drift de docs/DB-INVENTORY.md por 7 tabelas copilot_*). PR fechada e PENDENCIAS.md da main inteiramente reescrito (conteúdo de 12-15/11).", "tipo": "docs", "valor": "nenhum"}
- **Lacuna 4:** {"arquivo": "scripts/ci/eslint-baseline.json", "descricao": "Regeneração do baseline de lint de 01/11 (sha256 por arquivo). A main já regenerou com outros hashes; portar reintroduz estado antigo.", "tipo": "config", "valor": "nenhum"}
- **Lacuna 5:** {"arquivo": "src/test/setup.ts", "descricao": "Mock global de clientHeight/clientWidth/offsetHeight no HTMLElement.prototype para o virtualizador no jsdom. Superado pelo padrão por teste já adotado na main (seletivo por container), com o qual o mock global conflita.", "linhas_aprox": 130, "tipo": "test", "valor": "nenhum"}
- **Lacuna 6:** {"arquivo": "src/components/talkx/kit/dialogs.tsx + __tests__/dialogPresets.test.tsx", "descricao": "Rótulo 'Iniciando…' no botão de confirmação enquanto a ação está em curso, com os 2 asserts do teste ajustados. Necessidade já coberta na main pelo spinner + botão desabilitado do TalkXPrimaryButton.", "linhas_aprox": 196, "tipo": "front", "valor": "baixo"}
- **Lacuna 7:** {"arquivo": "src/components/ui/dialog.tsx + src/components/ui/sheet.tsx", "descricao": "aria-label=\"Fechar\" no botão de fechar. Sem efeito: o sr-only 'Fechar' já dá o mesmo nome acessível na main.", "linhas_aprox": 79, "tipo": "front", "valor": "nenhum"}
- **Lacuna 8:** {"arquivo": "src/hooks/calls/__tests__/useCallRecording.test.tsx", "descricao": "vi.stubGlobal('Blob', globalThis.Blob) no beforeEach (Blob cross-realm). Teste já verde na main sem isso (12 passed).", "linhas_aprox": 62, "tipo": "test", "valor": "nenhum"}

**`claude__charming-mccarthy-jbxy56`** · *branch ainda viva no origin*  
<sub>13 lacuna(s) · verificada · **apagar: não**</sub>

Lote 1 do plano "GitHub Actions 100 etapas" (GA01-GA92) + onda de a11y e correção de testes. A maior parte entrou na main por outras PRs (tokens AA de cor, safe-area mobile, cache de bun/Playwright, dependabot docker, notifica-falha-main, guarda do CLAUDE.md). Sobraram 7 itens de CI/CD que nunca foram mergeados, dois deles com impacto real: (1) relatórios/traces do E2E publicados no CI continuam podendo conter o JWT do usuário de teste, porque a redação automática de JWT (GA38) não está na main; (2) o deploy de edge functions publica sem rodar os 229 testes .test.ts de supabase/functions (GA27), e o rollback automático pode "reverter para o próprio SHA que acabou de falhar" (GA30), inutilizando o caminho de recuperação. Além disso o teardown do E2E não revoga as sessões do usuário de teste (GA39) e o coletor de KPI pode furar o limite de 1 000 req/h da API do GitHub (GA92). O resto da branch é obsoleto ou nocivo: o health-check foi reescrito na main com outro endpoint, e vários testes da branch enfraquecem asserções que a main mantém, removem um método que existe (cancelScroll) ou trazem uma regex corrompida. As marcações de "concluído — PR #2537" no plano e no P006.json são falsas: a PR não foi mergeada.

- **Lacuna 1:** {"arquivo": "scripts/ci/redigir-relatorio.mjs", "descricao": "GA38 — redação automática de JWT (regex eyJ<header>.<payload>.<sig>) em redigirConteudo e em redigirBytes (entradas de ZIP via latin1), sem depender de --segredo-env. Sem isso o JWT do usuário de teste pode sair em traces/relatórios de E2E publicados como artifact do CI.", "linhas_aprox": 16, "tipo": "script", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "scripts/ci/redigir-relatorio.unit.mjs", "descricao": "5 testes do GA38 (RE_JWT, JWT em texto, em arquivo, em entrada de ZIP, contarRestantes=0).", "linhas_aprox": 38, "tipo": "test", "valor": "alto"}
- **Lacuna 3:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA27 — passo 'Testes das edge functions (deno test)' antes do Deploy, com --config scripts/ci/deno.json e globstar sobre supabase/functions/**/*.test.ts (229 arquivos de teste hoje não rodam no deploy). GA30 — concurrency group próprio para rollback (deploy-edge-rollback-*) e, no rollback automático, pular Deployment cujo sha == GITHUB_SHA para não reverter para si mesmo.", "linhas_aprox": 21, "tipo": "workflow", "valor": "alto"}
- **Lacuna 4:** {"arquivo": "scripts/ci/deploy-functions-workflow.unit.mjs", "descricao": "Contratos GA27 (deno test antes do Deploy, lock do CI, cobertura **/*.test.ts) e GA30 (prefixo de grupo condicional, pular SHA atual). Exige relaxar o assert da main que fixa `^  group: deploy-edge-functions-...$`.", "linhas_aprox": 28, "tipo": "test", "valor": "alto"}
- **Lacuna 5:** {"arquivo": "scripts/ci/e2e-teardown.mjs", "descricao": "GA39 — POST /auth/v1/logout?scope=global com o JWT do usuário de teste no fim do teardown, não-bloqueante, devolvendo logoutStatus e avisando (::warning::) em falha. Evita acumular sessões/tokens do usuário de teste no banco de produção entre runs.", "linhas_aprox": 16, "tipo": "script", "valor": "medio"}
- **Lacuna 6:** {"arquivo": "scripts/ci/e2e-teardown.unit.mjs", "descricao": "3 testes do GA39 (logout chamado após a RPC com o JWT; falha HTTP não derruba; erro de rede resulta em logoutStatus null) + fetchFalso com logoutStatus e chamadas.length === 3.", "linhas_aprox": 22, "tipo": "test", "valor": "medio"}
- **Lacuna 7:** {"arquivo": "scripts/ci/actions-kpi.mjs", "descricao": "GA92 — opção maxRuns=300 em coletarJobs, priorizando os runs mais longos por duracaoMinutos, para não estourar o limite de 1 000 req/h da API do GitHub quando a janela tem 1 000+ runs.", "linhas_aprox": 11, "tipo": "script", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "scripts/ci/actions-kpi.unit.mjs", "descricao": "Teste do GA92: 5 runs com durações diferentes, maxRuns=3, confere que só os ids 5/4/3 geram GET de jobs.", "linhas_aprox": 15, "tipo": "test", "valor": "medio"}
- **Lacuna 9:** {"arquivo": "scripts/ci/migration-drift-stdout.unit.mjs", "descricao": "Arquivo novo — teste do E53: DIVERGENCE_LINE_RE /^\\d{14} \\| /u e garantia de que a linha de divergência é a primeira coisa no stdout do check-migration-drift (comportamento já existe na main, sem teste que o proteja).", "linhas_aprox": 64, "tipo": "test", "valor": "medio"}
- **Lacuna 10:** {"arquivo": "scripts/ci/verify-ledger-statements.unit.mjs", "descricao": "3 testes do GA05: ledger com cabeçalho '--' do psql CLI passa após flatMap(splitStatements), divergência real continua reprovando, e fixture real 20261004195051_gmail_oauth_state_attempts.sql (existe na main). Protege comportamento já presente em verify-ledger-statements.mjs:48.", "linhas_aprox": 37, "tipo": "test", "valor": "medio"}
- **Lacuna 11:** {"arquivo": ".github/codeql/codeql-config.yml", "descricao": "Acrescentar 'docs/**', '**/*.md' e 'supabase/migrations/**' ao paths-ignore, para o CodeQL não gerar alerta em documentação e migrations.", "linhas_aprox": 3, "tipo": "config", "valor": "baixo"}
- **Lacuna 12:** {"arquivo": "vitest.config.ts", "descricao": "Reporter 'json-summary' no coverage (necessário para o resumo de cobertura no Job Summary do CI — etapas E12/E72 do plano).", "linhas_aprox": 1, "tipo": "config", "valor": "baixo"}
- **Lacuna 13:** {"arquivo": "scripts/ci/ga04-runtime-stdout.unit.mjs", "descricao": "Arquivo novo — contrato de fonte GA04: validate-runtime-proof.mjs tem exatamente 1 process.stdout.write (o hash) e run-runtime-contract.mjs só emite o JSON da prova no stdout. A intenção já é coberta por scripts/ci/db-migrate-contratos.unit.mjs; só o contrato de fonte está ausente.", "linhas_aprox": 69, "tipo": "test", "valor": "baixo"}

**`claude__chore-plano-E19-E20-E21-261101-1740`** · *branch ainda viva no origin*  
<sub>6 lacuna(s) · verificada · **apagar: não**</sub>

Branch 100% documentação: marcava as etapas E19/E20/E21 do plano de auditoria do GitHub Actions como concluídas e propagava isso para o pacote de reconciliação. As três afirmações são verdadeiras na main de hoje (o types-sync.yml tem o Gate 3 por objetos, o dedupe de 6h e o filtro head_branch), mas a main ainda mostra as três como pendentes — ou seja, o relatório de auditoria mente sobre o próprio progresso. Efeito prático: nenhum, só a confiabilidade do painel de etapas. A ponta da branch está corrompida (um commit truncou o plano de 975 para 18 linhas), então ela só serve pelo commit c6ddabeac. A nota adicionada ao CONTRIBUTING.md ficou obsoleta: descreve um workflow que a main apagou em 14/11.

- **Lacuna 1:** {"arquivo": "docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md", "descricao": "Checkboxes E19/E20/E21 (linhas 507, 512, 514 da main) continuam `- [ ]` e a tabela de reconciliação (após a linha 133) não tem as 3 linhas `[x] CONCLUÍDA` com a evidência. As três etapas estão implementadas na main (types-sync.yml:485, :541/:604, :717-722). Portar de c6ddabeac, nunca do tip (truncado). Hunks prontos no dossiê.", "tipo": "docs", "valor": "baixo", "linhas_aprox": 507}
- **Lacuna 2:** {"arquivo": "docs/reconciliation/tasks/P006.json", "descricao": "As 3 tarefas E19/E20/E21 ainda estão NOT_IMPLEMENTED. Portar apenas as 241 linhas semânticas (status, implementation.state/note, acceptance.state/note, pr_numbers 1897/2378/[], texto antigo para remaining_work), preservando o formato minificado da main — não reserializar o arquivo.", "tipo": "docs", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 3:** {"arquivo": "docs/reconciliation/MASTER_LEDGER.json", "descricao": "Agregado global desatualizado: DONE_VERIFIED 271→274 e NOT_IMPLEMENTED 220→217. Apenas esses dois números; preservar o minificado da main (o pretty-print da branch são 36,6k linhas de churn sem valor).", "tipo": "docs", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 4:** {"arquivo": "docs/reconciliation/PLAN_REGISTRY.json", "descricao": "Bloco record_id P006, status_counts: DONE_VERIFIED 23→26 e NOT_IMPLEMENTED 15→12 (main, ~linha 211).", "tipo": "docs", "valor": "baixo", "linhas_aprox": 211}
- **Lacuna 5:** {"arquivo": "CONTRIBUTING.md", "descricao": "Nota sobre auto-update-pr-branch.yml atualizar a branch após push na main — OBSOLETA: o workflow foi apagado da main em 41853318c (PR #3113, 14/11). Não portar; aplicá-la documentaria workflow inexistente.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 64}
- **Lacuna 6:** {"arquivo": "docs/reconciliation/evidence/ARTIFACT_MANIFEST.json", "descricao": "4 sha256 recalculados + TASK_LEDGER_FULL.json.gz reempacotado (2.305.252→2.321.369 bytes). Artefato derivado; nenhum script/workflow da main confere esses hashes. Só portar se o pacote for regerado pelo script de origem.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 1}

**`claude__confident-bardeen-ndq0ch`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch de conserto de CI (PR #2195, 35 commits de 2026-10-23): mocks de testes do chat, canal Realtime estável no chat de equipe, fila offline limpa no logout, ARIA do command-palette, fail-closed de real_sector/real_uf no Talk X, remoção do hook morto useTalkXSuppression e erro RLS sanitizado no painel de reset de senha. Tudo já está na main (mesma intenção, forma refatorada) ou ficou obsoleto (main adotou `ponteOnly` e mantém Promise.all como fail-closed), exceto um detalhe: o painel de reset de senha na main não reconhece HTTP 403 pelo status (só por código 42501/fragmentos de mensagem), então um admin não autorizado vê o texto cru em inglês da edge em vez da mensagem padrão de acesso negado. Valor baixo (UX de mensagem, sem vazamento).

- **Lacuna 1:** {"arquivo": "src/components/security/PasswordResetRequestsPanel.tsx", "descricao": "Checar isAccessDeniedError no ParsedEdgeError (que carrega status 403) antes de converter para Error, nos handlers aprovar/rejeitar; hoje 403 da edge aparece como texto cru em inglês em vez de ACCESS_DENIED_MESSAGE. Hunk no dossiê (commit 229e32a7f).", "tipo": "front", "valor": "baixo", "linhas_aprox": 10}
- **Lacuna 2:** {"arquivo": "src/components/security/__tests__/PasswordResetRequestsPanel.acesso-negado.test.tsx", "descricao": "Caso de teste com FunctionsHttpError context.status=403 esperando ACCESS_DENIED_MESSAGE (só 42501 coberto hoje).", "tipo": "test", "valor": "baixo", "linhas_aprox": 20}

**`claude__docs-g9-absorb-261019-1300`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch somente-docs (3 planos, +2036 linhas, zero código). Dois arquivos já estão na main — e no caso do plano do banner superior a main tem a versão mais nova (encerrada, com matriz de aceite preenchida), enquanto a branch traz o texto antigo "execução pendente", ou seja, portá-la seria regressão. O único trabalho realmente perdido é o arquivo docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md (741 linhas), um backlog técnico de 190 etapas em 9 fases (segurança, banco, edge functions, TS strict, testes, CI, performance, qualidade, docs) que nunca entrou na main e não tem equivalente lá. Impacto no produto: nenhum hoje — é documentação. Parte do plano já foi resolvida por outros caminhos (Dependabot e bun audit no CI já existem; os PRs #2091–#2095 que ele mandava mergear estão fechados), parte continua pendente (shared modules de edge functions, docs de segurança). Não apagar a branch antes de salvar esse arquivo ou o dono decidir descartá-lo.

- **Lacuna 1:** {"arquivo": "docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md", "descricao": "Plano de backlog técnico de 190 etapas em 9 fases (A segurança, B banco, C edge functions, D TypeScript strict, E testes, F CI/CD, G performance, H qualidade, I documentação), com 6 etapas marcadas 'PARAR AQUI' (B33 pg_partman, B50 retenção, C80 staging, G159 CDN, H174 Sentry, I178 LGPD). Nunca entrou na main e não tem equivalente lá. Recuperação: git show f1b53effaa4da01f3e4a9b8be870af00426a6275:docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md — arquivo novo, aplica limpo, sem conflito. Parcialmente desatualizado: A1/A5 (mergear #2091–#2095) mortas, A12 (Dependabot) e A23 (audit no CI) já feitas.", "tipo": "docs", "valor": "baixo", "linhas_aprox": 741}
- **Lacuna 2:** {"arquivo": "docs/plans/PLANO_ORDEM_BANNER_SUPERIOR_20_ETAPAS_2026-09-30.md", "descricao": "As 18 linhas que a main 'não tem' são o texto antigo do plano (status 'execução pendente', matriz de aceite vazia). A main já tem a versão encerrada, com registro do PR #1257/commit db4516f538, contrato vigente dos rótulos (SalesView/Journey, PRs #1608/#1613/#1619) e matriz preenchida. Portar seria regressão de documentação — não recuperar.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 18}

**`claude__feat-completar-c121-261101-1330`** · *branch ainda viva no origin*  
<sub>14 lacuna(s) · verificada · **apagar: não**</sub>

Pausa de envios por instância de WhatsApp (C121). O banco já tem tudo em produção (tabela instance_pauses + RPCs pause_instance/resume_instance/is_instance_paused/auto_pause_instance, todas confirmadas por consulta), e os motores de campanha/entrega da main já respeitam a pausa. O que ficou de fora: (1) o operador não tem botão nenhum para pausar ou retomar os envios de um número — a main só lista pausas e permite marcá-las como investigadas; (2) a edge evolution-api é a única rota de envio que não consulta a pausa; (3) a auto-pausa de 30 min quando o provedor devolve 429 (limite de envio) não tem chamador em lugar nenhum — a função existe no banco e é código morto, então o sistema continua insistindo num número já bloqueado pelo provedor, o que é risco direto de ban. A PR #2469 foi fechada pelo congelamento de features (#2545), não por duplicidade: a triagem de 08/11 marcou DUPLICATA_PROVAVEL e isso está errado.

- **Lacuna 1:** {"arquivo": "supabase/functions/evolution-api/index.ts", "descricao": "Auto-pausa de 30 min quando o provedor devolve 429 num envio (chamada a auto_pause_instance, lida do corpo da resposta do proxy). Nenhum chamador dessa RPC existe na main: o sistema insiste num número já limitado pelo provedor. Risco de ban do WhatsApp. Também falta o gate que bloqueia ações de envio em instância pausada nesta edge (fail-open em erro de leitura) — é a única rota de envio da main que não consulta a pausa.", "linhas_aprox": 58, "tipo": "edge", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "supabase/functions/_shared/instance-pause-actions.ts", "descricao": "Arquivo novo (10 linhas) com PAUSE_BLOCKED_ACTIONS: o conjunto de ações da evolution-api que entregam conteúdo a terceiros e param na pausa (send-text, send-media, send-audio, send-sticker, send-location, send-contact, send-poll, send-list, send-buttons, send-ptv, send-status). mark-read, archive-chat, send-reaction e send-chat-presence ficam fora de propósito. Pré-requisito do gate da evolution-api.", "linhas_aprox": 10, "tipo": "edge", "valor": "alto"}
- **Lacuna 3:** {"arquivo": "src/components/connections/InstancePausesPanel.tsx", "descricao": "Painel staff em Conexões para PAUSAR e RETOMAR os envios de uma instância (RPCs pause_instance/resume_instance), com histórico de 7 dias, badge de pausa ativa, diálogo validando 5–1440 min e motivo obrigatório, gate por isSupervisor, estados carregando/erro/vazio, toasts e relógio vivo de 15 s. É o único freio manual do operador sobre um número de WhatsApp e não existe na main. Ao portar, corrigir o DialogDescription: o texto diz que campanhas e a fila de entrega não respeitam a pausa, o que hoje é falso.", "linhas_aprox": 180, "tipo": "front", "valor": "alto"}
- **Lacuna 4:** {"arquivo": "src/hooks/connections/useInstancePauses.ts", "descricao": "Hook com as mutations pause/resume (pause_instance/resume_instance) e a leitura das pausas abertas em query separada (.is('resumed_at', null)) mais o histórico de 7 dias paginado (1000 por página, até 10 páginas), para a série não perder registro em silêncio. Ao portar, resolver a colisão da chave ['instance-pauses'] com o hook de monitoring — de preferência concentrando pauseInstance/resumeInstance em src/services/instance-pauses.service.ts, que a main declara como único ponto do front que fala com essa tabela.", "linhas_aprox": 61, "tipo": "front", "valor": "alto"}
- **Lacuna 5:** {"arquivo": "src/components/connections/ConnectionsView.tsx", "descricao": "Duas linhas que montam o painel: o import de InstancePausesPanel e <InstancePausesPanel connections={connections} /> antes de <NumberReputationMonitor />. Sem isso o painel não tem entrada na UI.", "linhas_aprox": 2, "tipo": "front", "valor": "alto"}
- **Lacuna 6:** {"arquivo": "src/lib/instancePauseSeries.ts", "descricao": "Agregação pura das pausas em série 24h (por hora) e 7d (por dia), separando manual de automática, mais isPauseActive com a mesma regra de is_instance_paused (usado pelo painel para decidir se mostra Pausar ou Retomar).", "linhas_aprox": 35, "tipo": "front", "valor": "medio"}
- **Lacuna 7:** {"arquivo": "supabase/functions/evolution-api/index.test.ts", "descricao": "Três testes Deno que protegem o comportamento novo: envio em instância pausada não chega ao provedor (fake.posts vazio); mark-read passa e send-status é bloqueado; 429 do provedor chama auto_pause_instance com 30 min e a instância correta, com RPC ok e com RPC em erro (resposta original preservada). Diff salvo em /tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/evoapi-test.diff", "linhas_aprox": 87, "tipo": "test", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "src/components/connections/__tests__/InstancePausesPanel.test.tsx", "descricao": "Teste do painel (56 linhas): render com supervisor, chamada das RPCs, estado de erro de leitura e ocultação para quem não é supervisor.", "linhas_aprox": 56, "tipo": "test", "valor": "medio"}
- **Lacuna 9:** {"arquivo": "src/lib/__tests__/instancePauseSeries.test.ts", "descricao": "Quatro casos da série: 24 baldes por hora separando manual e automática, 7 baldes por dia ignorando o que está fora da janela, lista vazia zerada, e as três situações de isPauseActive.", "linhas_aprox": 25, "tipo": "test", "valor": "medio"}
- **Lacuna 10:** {"arquivo": "src/components/connections/__tests__/ConnectionsView.desconectar.test.tsx", "descricao": "Uma linha de vi.mock('../InstancePausesPanel') — necessária só depois que o painel entrar em ConnectionsView, senão os 5 testes de ConnectionsView quebram. Mesma linha em ConnectionsView.erro-dialogo, ConnectionsView.sync-historico, ConnectionsView.telefone-validacao e ConnectionsView.trava-multiconexao.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 11:** {"arquivo": "src/components/__tests__/reduzirMovimentoInboxCrmConexoes.test.tsx", "descricao": "Uma linha de vi.mock('@/components/connections/InstancePausesPanel') — dependente da montagem do painel.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 12:** {"arquivo": "supabase/functions/_shared/talkx-resume-policy.ts", "descricao": "Só o texto explicativo do campo 'because' para pauseReason === 'instance_paused' ('instância pode ter voltado — talkx-send re-pausa se ainda estiver inativa'). A main (linha 170) mantém o ternário de dois ramos. A decisão de retomar já é idêntica: AUTO_RESUME_REASONS com instance_paused está na main (linha 35). Cosmético.", "linhas_aprox": 5, "tipo": "edge", "valor": "baixo"}
- **Lacuna 13:** {"arquivo": "ESTADO.md", "descricao": "Atualização de números de linha num arquivo gerado por automação. A main já está à frente (ConnectionsView.tsx:135 e :110 contra :131 e :106 da branch). Não portar: regerar depois do merge.", "linhas_aprox": 3, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 14:** {"arquivo": "supabase/deployment-manifest.json", "descricao": "Manifesto de deploy regerado por script (hashes e contagem de arquivos). Não portar: sai do script quando as edges entrarem.", "linhas_aprox": 20, "tipo": "config", "valor": "nenhum"}

**`claude__feat-completar-c121-ddl-261101-1345`** · *branch ainda viva no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

Investigação de incidentes de pausa de instância de WhatsApp (C121/IP2): 3 colunas em instance_pauses + 3 CHECKs + RPC mark_pause_investigated restrita a admin/supervisor com auditoria. A migration entrou na main byte-idêntica (só renumerada) e está aplicada em produção, com painel e service já na main. Perdida apenas a suíte de teste SQL que prova a fronteira de autorização, os CHECKs e a auditoria com papéis reais — nenhum equivalente existe na main.

- **Lacuna 1:** {"arquivo": "supabase/tests/instance_pause_investigation.sql", "descricao": "Suíte SQL (493 linhas, 448 úteis) que prova em banco local, com papel real via request.jwt.claims + set_config('role') (caminho do PostgREST, não service_role): T1 admin investiga e audita sem copiar notas; T2 negado sem efeito nem auditoria para agent (42501) e anon (para no ACL); T3 validação da função e dos CHECKs antes do efeito; T3b FK ON DELETE SET NULL x CHECK em savepoint; T4 P0002 para pausa inexistente; T5 idempotência com 1 auditoria por chamada e 1º ator congelado por COALESCE; T5b supervisor; T6 RLS/ACL; T7 executa o bloco -- Rollback: da migration no schema real. Arquivo novo, sem conflito: port com 'git show origin/claude/feat-completar-c121-ddl-261101-1345:supabase/tests/instance_pause_investigation.sql > supabase/tests/instance_pause_investigation.sql'. Único retoque: o cabeçalho cita a imagem zapp-db-local v2-2610161333f0ad (16/10) — conferir a tag atual.", "tipo": "test", "valor": "medio", "linhas_aprox": 448}

**`claude__feat-copiloto-cv011-020-migrations-261016-1930`** · *branch ainda viva no origin*  
<sub>6 lacuna(s) · verificada · **apagar: não**</sub>

Fase 2 do Copiloto RADAR só em banco+docs. As tabelas de sessão, insight, feedback e o gatilho "cliente falou" a main já refez por conta própria com schema diferente (é esse que está em produção), então essa parte da branch é obsoleta. Sobraram duas peças que não existem em lugar nenhum: o porteiro de presença (só gastar IA quando o vendedor está com a conversa aberta — economia de custo por mensagem) e a retenção/limpeza LGPD dos dados do copiloto (hoje insight e texto de sugestão ficariam para sempre). A flag do RADAR está desligada e as tabelas têm 0 linhas, então nada vaza hoje; mas a retenção precisa existir antes de ligar a flag. Mais 3 docs pequenos.

- **Lacuna 1:** {"arquivo": "supabase/migrations/20261016193400_copilot_presence.sql", "descricao": "CV-017: tabela copilot_presence (TTL 90 s, RLS com cap de expires_at) + upsert_copilot_presence() + copilot_has_presence(). Porteiro de custo: o worker só chama o modelo se alguém está com a conversa aberta. Nada equivalente na main/produção. Precisa adaptação: em produção copilot_sessions.profile_id referencia auth.users(id), então as subconsultas 'SELECT id FROM public.profiles WHERE user_id = auth.uid()' devem virar auth.uid() direto. Ponta a ponta falta ainda heartbeat no front e checagem em supabase/functions/copilot-live/index.ts.", "tipo": "migration", "linhas_aprox": 49, "valor": "medio"}
- **Lacuna 2:** {"arquivo": "supabase/migrations/20261016193500_copilot_retention.sql", "descricao": "CV-019: copilot_retention_aggregates + run_copilot_retention() (agrega e apaga insights > 90 dias, anonimiza texto de feedback > 30 dias preservando a ação) + REVOKE EXECUTE + cron diário 02:35 UTC. Sem isso o copiloto não tem prazo nem purge. Precisa adaptação: copilot_insights usa insight_type e já tem profile_id (dispensa JOIN); copilot_insight_feedback não existe — a tabela da main é copilot_feedback, sem profile_id e sem retained_at. É DELETE recorrente em produção: prazos devem ser confirmados com o dono antes do apply.", "tipo": "migration", "linhas_aprox": 68, "valor": "medio"}
- **Lacuna 3:** {"arquivo": "supabase/migrations/20261016193200_copilot_feedback.sql", "descricao": "Guard trigger guard_copilot_insight_feedback_retained_at(): impede cliente autenticado de escrever retained_at e força final_text = NULL depois de retido. A tabela em si é obsoleta (a main usa copilot_feedback), mas o guard vale ser portado se copilot_feedback ganhar retained_at junto com a retenção. Observação separada: a RLS de copilot_feedback na main é USING(true)/WITH CHECK(true) para authenticated.", "tipo": "migration", "linhas_aprox": 25, "valor": "baixo"}
- **Lacuna 4:** {"arquivo": "docs/LGPD-RETENTION-POLICY.md", "descricao": "Seção 4.6 (prazos dos dados do copiloto) + bump de versão 1.0→1.1 e linha no histórico. Portar junto com a retenção, corrigindo nomes para o schema real (insight_type; copilot_feedback em vez de copilot_insight_feedback). Não portar a troca de separador de tabela na seção 7.1 (churn).", "tipo": "docs", "linhas_aprox": 14, "valor": "baixo"}
- **Lacuna 5:** {"arquivo": "docs/REALTIME-CHANNELS-INVENTORY.md", "descricao": "O canal do copiloto não está no inventário embora exista. Portar corrigido: seção 2 com 'copilot_insights:{sessionId}' / src/hooks/copilot/useLiveSuggestions.ts:121 e seção 5 com migration 20261030110000_copilot_insights.sql. Não portar os blocos 'copilot_insights — painel ao vivo (CV-018)' e 'Regras gerais (desde CV-018)' como escritos: citam canal, hook e migration que não existem.", "tipo": "docs", "linhas_aprox": 16, "valor": "baixo"}
- **Lacuna 6:** {"arquivo": "docs/copiloto/CV-016-coalescencia-delegada.md", "descricao": "Doc de 15 linhas delegando coalescência ao IA-048, com contrato (state_version menor aborta o INSERT) que a main não implementa — o motor atual usa bucket de 4 s e ON CONFLICT DO NOTHING. Portar criaria doc divergente da realidade.", "tipo": "docs", "linhas_aprox": 9, "valor": "nenhum"}

**`claude__feat-copiloto-edges-261101-1330`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

As 7 edges do Copiloto (objeção, ancoragem de preço, risco de perda, recomendação de produto, prazo, temperatura do lead, análise de mídia) e a camada de IA dos hooks já estão na main, em versão melhor (contratos validados + testes). Sobram só 2 coisas de servidor: (1) o botão de desligar a IA do Copiloto (`ai.capability.copilot_live`) NÃO desliga essas 7 funções — elas continuam gastando provedor pago mesmo com a capacidade desligada; (2) a análise de imagem do WhatsApp manda para o modelo a URL de um bucket privado, que devolve erro — ou seja, analisar foto/figurinha do cliente não funciona hoje. Nada de UI, banco ou workflow a recuperar; as mudanças de CI e de arquivamento em massa da branch são o oposto do que a main já faz e devem ser descartadas.

- **Lacuna 1:** {"arquivo": "supabase/functions/_shared/ai-feature-flags.ts", "descricao": "As 7 edges do Copiloto não estão em AI_CAPABILITY_BY_FUNCTION, então o kill switch `ai.capability.copilot_live` não as barra: desligar a capacidade não impede o gasto com o provedor pago. Portar as 7 linhas (`\"ai-objection-handler\": \"copilot_live\"` etc.) após a entrada `\"copilot-live\"` (linha 78) e atualizar supabase/functions/_shared/__tests__/ai-feature-flags.test.ts.", "linhas_aprox": 78, "tipo": "edge", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "supabase/functions/ai-multimodal-analysis/index.ts", "descricao": "A mensagem de visão envia a URL crua do Storage privado (`image_url: { url: imageUrl }`, linha 68), que o provedor não consegue buscar (bucket whatsapp-media é privado). Portar o download inline da branch com `toInlineImage` sob a identidade do chamador (bearer token + anon key) e o 422 quando a imagem não puder ser obtida; o limite de bytes já vem do helper.", "linhas_aprox": 68, "tipo": "edge", "valor": "alto"}

**`claude__feat-copiloto-hooks-261101-1500`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch conectava 7 hooks do Copiloto RADAR às edges de IA. A main já tem isso completo via PR #2834 (commit 7ce81c015, que cita #2473), com tipos alinhados às edges reais — os tipos da branch foram escritos antes das edges existirem e contradizem os contratos Zod atuais (obsoletos). Única sobra que ainda faz sentido: em useObjectionHandler, trigger 'barato' em preço + detecção pelo tipo com mais triggers em vez do primeiro match (5 linhas, valor baixo; correção de problema que a própria branch criou). AbortController da branch é código morto (signal nunca passado). A classificação anterior DECISAO_DONO (custo LLM) está superada: o dono já mergeou as 7 edges e a camada AI.

- **Lacuna 1:** {"arquivo": "src/hooks/copilot/useObjectionHandler.ts", "descricao": "Adicionar trigger 'barato' em OBJECTION_TRIGGERS.preco (main:39) e trocar detecção first-match (main:105-108, `break`) por contagem de triggers (tipo com maxMatches vence). Hunk completo no dossiê. Precisa ir em par: só o trigger quebra o teste de 'concorrente'. Validar com npx vitest run src/hooks/copilot/__tests__/useObjectionHandler.test.ts", "tipo": "front", "valor": "baixo", "linhas_aprox": 5}
- **Lacuna 2:** {"arquivo": "src/hooks/copilot/*.ts (7 hooks)", "descricao": "abortRef/AbortController da branch: signal nunca passado ao invokeEdge; código morto. Não portar.", "tipo": "front", "valor": "nenhum", "linhas_aprox": 0}

**`claude__feat-cores-prioridade-d12-261101-1425`** · *branch ainda viva no origin*  
<sub>4 lacuna(s) · verificada · **apagar: não**</sub>

Escada de cor D12 nas pílulas de prioridade de Tarefas (Média âmbar em vez de azul; Alta vermelho contorno; Urgente vermelho /20 + borda cheia) em PriorityChip e PriorityPill. O produto (cores) está 100% na main via squash da PR #2478 (commit 7beecdb78, 2026-11-08). Ficaram de fora só 3 reforços de teste: Média não pode ser text-primary no Chip, contraste AA do texto de Urgente sobre a tinta /20, e igualdade da escada Pill × Chip (o defeito da etapa 170). Comentários/docblocks e border-warning/40 (main escolheu /30) não valem portar.

- **Lacuna 1:** {"arquivo": "src/components/tasks/__tests__/movimentoEContraste.test.tsx", "descricao": "Falta (a) asserção de que PriorityChip medium usa text-[hsl(var(--warning-text))] e não text-primary; (b) caso 'Urgente sobre bg-destructive/20 fecha AA' medindo razaoNaTinta(destructive-text, destructive, 0.2, card) nos modos claro/escuro. Hunks prontos no dossiê.", "tipo": "test", "valor": "medio", "linhas_aprox": 16}
- **Lacuna 2:** {"arquivo": "src/components/tasks/__tests__/primitivosCompartilhados.test.tsx", "descricao": "Falta import de PriorityChip, expect(media).not.toContain('text-primary') e o caso 'escada do PriorityPill === escada do PriorityChip' para as 4 prioridades (compara className com trim). Passa com a main atual; protege a regressão Média azul numa tela e âmbar na outra. Hunks prontos no dossiê.", "tipo": "test", "valor": "medio", "linhas_aprox": 20}
- **Lacuna 3:** {"arquivo": "src/components/tasks/shared/PriorityChip.tsx", "descricao": "Só docblock explicativo (D12/etapa 170) e border-warning/40 em medium; main tem a mesma escada com /30 e comentário inline. Não portar.", "tipo": "front", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 4:** {"arquivo": "src/components/tasks/shared/PriorityPill.tsx", "descricao": "Só docblock (o da main ficou desatualizado: ainda diz que apenas high/urgent usam tokens de texto) e border-warning/40. Comportamento idêntico na main. Não portar; no máximo atualizar o comentário.", "tipo": "front", "valor": "nenhum", "linhas_aprox": 0}

**`claude__feat-incidentes-pausa-investigados-261024-1640`** · *branch ainda viva no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

Investigação de incidentes de pausa de instância de WhatsApp (IP2): colunas + RPC mark_pause_investigated no banco e aba "Pausas" com ação "Marcar investigada" no painel de monitoramento. A funcionalidade está inteira na produção e na main (entrou pela PR #2822, commit bd62fc9d9): migration byte-idêntica (só renumerada para 20261111181000), front, hooks, service e os 2 testes de componente. O que ficou fora foi a suíte SQL de 493 linhas que prova no banco local que só admin/supervisor investigam, que a auditoria registra 1 linha por chamada sem copiar as notas e que o 1º ator congela. Sem ela, a autorização e a auditoria dessa RPC não têm teste automatizado de banco.

- **Lacuna 1:** {"arquivo": "supabase/tests/instance_pause_investigation.sql", "descricao": "Suíte SQL do IP2 (493 linhas) ausente da main: T1 investiga+audita sem copiar notas; T2 nega anon/agente/service_role sem efeito nem auditoria; T3 validação da função e dos 3 CHECKs; T3b FK x CHECK (apagar perfil do investigador preserva a investigação, ator sem data segue negado); T4 P0002; T5 3 auditorias com 1º ator congelado; T5b supervisor; T6 RLS/ACL; T7 rollback. Portar com: git show origin/claude/feat-incidentes-pausa-investigados-261024-1640:supabase/tests/instance_pause_investigation.sql > supabase/tests/instance_pause_investigation.sql. Exige UM ajuste nas linhas 191-206: o bloco de service_role exige v_errmsg = 'sem_permissao_para_investigar_pausa', mas desde a #3027 service_role não tem EXECUTE e a mensagem é 'permission denied for function mark_pause_investigated' — usar o mesmo padrão do bloco de anon (linhas 185-189). T6 (415-419) já casa com a produção.", "tipo": "test", "valor": "medio", "linhas_aprox": 493}

**`claude__feat-multiplix-cron-instancia-pausada-261101-1410`** · *branch ainda viva no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

Cron do Multiplix passa a retomar sozinho dispatches pausados por instância pausada (instance_paused) quando a pausa acaba. A mesma correção já está na main por outra migration (20261115020000, PR #3135) e aplicada em produção; a migration da branch, se aplicada hoje, sobrescreveria o corpo vigente e seria prejudicial.

- **Lacuna 1:** {"arquivo": "supabase/migrations/20261101150000_multiplix_cron_retoma_instancia_pausada.sql", "descricao": "Divergência residual, não trabalho perdido: dispatch sem whatsapp_connection_id fixo pausado por instance_paused nunca retoma sozinho na main (CONTINUE fail-closed, escolha deliberada); a branch retomava quando não havia nenhuma pausa aberta em instance_pauses. Se desejado, entra como nova migration (trecho no dossiê), nunca reaplicando o arquivo da branch.", "tipo": "migration", "valor": "baixo", "linhas_aprox": 8}

**`claude__feat-pausa-entrega-campanhas-261101-1400`** · *branch ainda viva no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

C121 parte 2: instância do WhatsApp pausada bloqueia envio (message-delivery 409), pausa disparo Multiplix com motivo próprio e impede o scheduler Talk X de retomar campanhas enquanto a instância segue pausada. Todo o backend, testes e o texto do Talk X já estão na main (reintegrados pelo pacote 8, commit 2cf0153ae #3135). Falta apenas o texto amigável do motivo `instance_paused` no monitor Multiplix — hoje o operador vê o slug cru "Pausado automaticamente: instance_paused".

- **Lacuna 1:** {"arquivo": "src/components/multiplix/MultiplixMonitor.tsx", "descricao": "Adicionar ramo `dispatch.pause_reason === 'instance_paused'` com texto 'Pausado automaticamente: a instância foi pausada (retome manualmente depois)' antes do fallback genérico (main :489-490). Sem isso o monitor exibe o slug técnico `instance_paused` que multiplix-send/index.ts:916 já grava.", "tipo": "front", "valor": "baixo", "linhas_aprox": 2}

**`claude__feat-radar-motor-telas-261101-1330`** · *branch ainda viva no origin*  
<sub>6 lacuna(s) · verificada · **apagar: não**</sub>

Motor copilot.tick, 11 telas do RADAR, hooks, dados, testes e a migration 20261031160000 (aplicada em produção) entraram na main pela PR #2828. Faltou só a integração na Inbox: ChatInputArea não monta <RadarLive> (lazy), então o painel ao vivo das Fases 4–6 é código morto na main e nunca aparece, mesmo com a flag ai.capability.copilot_live ligada. Recuperar = 7 linhas em ChatInputArea.tsx + 3 mocks de teste.

- **Lacuna 1:** {"arquivo": "src/components/inbox/chat/ChatInputArea.tsx", "descricao": "Importar lazy/Suspense e montar <RadarLive className='mx-4 mt-2' contactId onDraftText={setNativeValue(inputRef, text)}> quando !logic.isMobile && !editingMessage && contactId, após o bloco RadarPhase8to15Panel (~L221). Hunk completo no dossiê.", "tipo": "front", "valor": "medio", "linhas_aprox": 10}
- **Lacuna 2:** {"arquivo": "src/components/inbox/__tests__/ChatPanel.atalhos-busca.test.tsx", "descricao": "vi.mock('../copilot/RadarLive', () => ({ default: () => null })) — RadarLive usa useAuth e o teste não monta AuthProvider; obrigatório junto com a lacuna 1", "tipo": "test", "valor": "baixo", "linhas_aprox": 2}
- **Lacuna 3:** {"arquivo": "src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx", "descricao": "vi.mock('../copilot/RadarLive', () => ({ default: () => null })) — idem, junto com a lacuna 1", "tipo": "test", "valor": "baixo", "linhas_aprox": 2}
- **Lacuna 4:** {"arquivo": "src/components/inbox/chat/__tests__/ChatInputArea.limite-enter.test.tsx", "descricao": "vi.mock('@/components/inbox/copilot/RadarLive', () => ({ default: () => null })) — idem, junto com a lacuna 1", "tipo": "test", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 5:** {"arquivo": "scripts/db-audit/runtime-config.test.sh", "descricao": "mode 100755 não entrou na main (conteúdo já incorporado); irrelevante porque o CI invoca via `bash`", "tipo": "script", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 6:** {"arquivo": "supabase/deployment-manifest.json", "descricao": "Artefato gerado (hashes/contagem) já regenerado na main", "tipo": "config", "valor": "nenhum", "linhas_aprox": 0}

**`claude__feat-talkx-x048-estados-servico-261101-2100`** · *branch ainda viva no origin*  
<sub>8 lacuna(s) · verificada · **apagar: não**</sub>

X048 (TL-106): estados de serviço do Talk X com botões ligados — campo `crm` no hook useTalkXServiceStatus, painel lateral ServiceStatusSheet, TalkXCrmUnavailableState em Segmentos, TalkXNoPermissionState no ViewRouter com botão "Falar com o administrador" → team-chat, 9 testes. Na main só entrou a troca RestrictedView→TalkXNoPermissionState (PR #2806), SEM a ação do botão; hook, sheet, integração em Segmentos, 3 arquivos de teste e P046 não entraram. PR #2548 foi fechada por congelamento de features TalkX (#2545), não por duplicata.

- **Lacuna 1:** {"arquivo": "src/pages/ViewRouter.tsx", "descricao": "Passar onContactAdmin={onNavigateTo ? () => onNavigateTo('team-chat') : undefined} ao TalkXNoPermissionState já renderizado na L142 (botão 'Falar com o administrador' hoje não aparece)", "tipo": "front", "valor": "alto", "linhas_aprox": 4}
- **Lacuna 2:** {"arquivo": "src/hooks/integrations/useTalkXServiceStatus.ts", "descricao": "Adicionar `export type CrmStatus = 'ok'|'unavailable'|'not_configured'`, campo `crm: CrmStatus` na interface e `crm: 'ok'` (stub até CAP-092) no retorno", "tipo": "front", "valor": "medio", "linhas_aprox": 8}
- **Lacuna 3:** {"arquivo": "src/components/talkx/kit/ServiceStatusSheet.tsx", "descricao": "Novo painel lateral 'Status dos serviços' (WhatsApp / CRM 360 / Tempo real) com data-testid service-status-sheet e botão fechar; conteúdo integral na branch", "tipo": "front", "valor": "medio", "linhas_aprox": 97}
- **Lacuna 4:** {"arquivo": "src/components/talkx/TalkXSegments.tsx", "descricao": "Chamar useTalkXServiceStatus; renderizar TalkXCrmUnavailableState quando crm==='unavailable' com onViewStatus abrindo ServiceStatusSheet (estado statusSheetOpen)", "tipo": "front", "valor": "medio", "linhas_aprox": 14}
- **Lacuna 5:** {"arquivo": "src/pages/__tests__/ViewRouter.talkx-permission.test.tsx", "descricao": "3 testes: agent em ?view=talkx vê 'Você não tem permissão para acessar Campanhas'; botão chama onNavigateTo('team-chat'); admin não bloqueado", "tipo": "test", "valor": "medio", "linhas_aprox": 67}
- **Lacuna 6:** {"arquivo": "src/hooks/integrations/__tests__/useTalkXServiceStatus.test.ts", "descricao": "3 testes do hook: connected true / false / null quando a consulta falha; crm 'ok'", "tipo": "test", "valor": "medio", "linhas_aprox": 62}
- **Lacuna 7:** {"arquivo": "src/components/talkx/__tests__/TalkXSegments.crmUnavailable.test.tsx", "descricao": "3 testes: crm unavailable exibe 'CRM 360 indisponível'; 'Ver status dos serviços' abre o sheet; fechar remove. Conferir mock de useTalkXSegments contra a assinatura atual da main", "tipo": "test", "valor": "medio", "linhas_aprox": 86}
- **Lacuna 8:** {"arquivo": "docs/reconciliation/tasks/P046.json", "descricao": "X048 → DONE_VERIFIED após porte; X047 só se PR #2546 (matriz talkxStates.matrix.test.tsx) estiver na main; ajustar status_counts", "tipo": "docs", "valor": "baixo", "linhas_aprox": 2}

**`claude__feat-talkx-x070-suppression-reasons-261101-2230`** · *branch ainda viva no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

A branch criava o catálogo de motivos de supressão do Talk X (6 motivos de sistema + motivos personalizados por admin), trocava talkx_blacklist.reason_code de enum para texto com FK no catálogo e dropava o enum. Esse efeito de negócio inteiro JÁ está em produção: a mesma migration entrou na main renomeada (20261101223000 -> 20261108100000) e endurecida, mais o reforço de 20261112172000. Produção confirma tabela, 6 seeds, 3 policies, FK, enum removido e reason_code text. Falta apenas o teste comportamental do catálogo: a main só tem checagem estrutural pós-deploy (smoke.sh) e um teste comportamental vizinho (reconcilia) que não exerce a RLS do catálogo por papel. Sem cobertura: agente não-admin recusado ao criar motivo, motivo do sistema não pode ser desativado, FK recusa código inexistente (23503) e talkx_suppress_contact devolve uuid como service_role.

- **Lacuna 1:** {"arquivo": "scripts/db-audit/talkx-suppression-reasons.test.sh", "descricao": "Teste comportamental do catálogo em Postgres descartável, ausente na main. 4 asserções sem equivalente: (2) admin cria código personalizado, (3) agente não-admin recusado por RLS, (4) gatilho bloqueia desativar motivo do sistema, (5) FK recusa código inexistente com 23503, (6) talkx_suppress_contact como service_role devolve uuid. Não portar o arquivo como está: ele aponta para a migration 20261101223000 (inexistente) e afrouxa os GRANTs. Portar os cenários para supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh (que já aplica a X070 real com papéis reais) ou criar supabase/tests/db-audit/talkx-suppression-reasons.test.sh no mesmo molde, apontando para 20261108100000 e 20261112172000, e sem is_system no INSERT do admin (a main não dá GRANT nessa coluna).", "tipo": "test", "valor": "medio", "linhas_aprox": 160}

**`claude__feat-ui-visual-texto-longo-261101-1445`** · *branch ainda viva no origin*  
<sub>6 lacuna(s) · verificada · **apagar: não**</sub>

C297 (PR #2480): texto longo nos primitivos de UI. Só o Badge (truncate/min-w-0) entrou na main via #2805 (25e13ff60). Card (min-w-0/break-words, leading-tight), Label (leading-snug), TabsTrigger (min-w-0 + span truncate) e o teste novo de 120 caracteres não entraram e ainda fazem sentido: os arquivos da main estão idênticos ao merge-base nesses trechos. A deleção das 6 baselines E2E de Contatos e o comentário no spec são obsoletos/não portar (main mantém os PNGs e roda chromium-contacts-visual no CI). Casts `as HTMLElement` em 5 testes são ruído.

- **Lacuna 1:** {"arquivo": "src/components/ui/card.tsx", "descricao": "min-w-0 em CardHeader/Content/Footer; min-w-0 break-words em CardTitle/CardDescription; CardTitle leading-none → leading-tight (5 linhas). Atualizar junto card.test.tsx:103,113,125 (leading-none → leading-tight).", "tipo": "front", "valor": "medio", "linhas_aprox": 8}
- **Lacuna 2:** {"arquivo": "src/components/ui/label.tsx", "descricao": "labelVariants: leading-none → leading-snug (rótulo de 2 linhas não cola).", "tipo": "front", "valor": "medio", "linhas_aprox": 2}
- **Lacuna 3:** {"arquivo": "src/components/ui/tabs.tsx", "descricao": "TabsTrigger: min-w-0 na classe base. O inner span `truncate min-w-0` da branch clipa badge absolute em DiagnosticsView.tsx:155 e quebra gap-2 com ícones; portar só min-w-0 ou truncate opt-in.", "tipo": "front", "valor": "medio", "linhas_aprox": 5}
- **Lacuna 4:** {"arquivo": "src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx", "descricao": "Arquivo novo com 8 testes (Badge/Tabs/Card/Label com 120 chars). Reescrever o caso do inner span das Tabs se o span não for portado.", "tipo": "test", "valor": "medio", "linhas_aprox": 116}
- **Lacuna 5:** {"arquivo": "e2e/__screenshots__/contacts-*-linux.png", "descricao": "NÃO apagar (branch apagava). Se Card/Label/Tabs forem portados e os pixels mudarem >0,2%, regenerar as 6 baselines no runner Linux do CI.", "tipo": "test", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 6:** {"arquivo": "src/components/{ai,contacts,crm360,integrations,talkx}/__tests__/*.test.tsx", "descricao": "Casts `as HTMLElement` em getByText/findByText e troca de comentário — ruído, não portar.", "tipo": "test", "valor": "nenhum", "linhas_aprox": 12}

**`claude__fix-E71-draft-skip-security-e2e-261101-1200`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch queria pular os jobs security e e2e do CI em PRs rascunho para economizar minutes. A parte 'security' contradiz a main: o CI Gate exige security=success sem exceção de draft e o teste permanente scripts/ci/ci-gate.unit.mjs proíbe o guard fora de unit/build (decisão deliberada em #2711) — portar quebraria todo PR draft. Os 4 comentários são ruído. Só a 1 linha 'if: draft != true' no job e2e (45 min, fora do gate) é recuperável, valor baixo.

- **Lacuna 1:** {"arquivo": ".github/workflows/ci.yml", "descricao": "Adicionar `if: github.event.pull_request.draft != true` ao job e2e (após timeout-minutes: 45, ~L443) para não rodar Playwright (45 min) em PR rascunho; ready_for_review (ci.yml:23) já garante rerun ao marcar pronto. Não tocar no job security (quebra gate e ci-gate.unit.mjs).", "linhas_aprox": 1, "tipo": "workflow", "valor": "baixo"}
- **Lacuna 2:** {"arquivo": ".github/workflows/ci.yml", "descricao": "if draft no job security + 4 comentários E71: NÃO portar — contradiz ci-gate (L427) e scripts/ci/ci-gate.unit.mjs:31-38; comentários são ruído.", "linhas_aprox": 5, "tipo": "workflow", "valor": "nenhum"}

**`claude__fix-bulk-archive-rls-message-261101-2250`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Arquivar em lote na inbox: quando o RLS barra a leitura prévia do estado das conversas, o hook não deve arquivar nem oferecer um "Desfazer" vazio. Esse comportamento já está na main via PR #2813 (toast + return, texto diferente). O que ficou de fora é o teste positivo que prova isso — a main ainda carrega um it.fails com comentário de bug obsoleto — e a escolha cosmética de toast.info (branch) vs toast.error (main) nesse ponto.

- **Lacuna 1:** {"arquivo": "src/hooks/inbox/__tests__/useInboxBulkActions.test.ts", "descricao": "Substituir o it.fails (linhas ~871-891) e o comentário 'BUG (documentado)' obsoleto por teste positivo: selectError → zero escritas, execute não chamado, lastUndo null, bulkLoading false, toast chamado com o texto vigente na main; ajustar cabeçalho linha 15. Hunk no dossiê.", "tipo": "test", "valor": "medio", "linhas_aprox": 21}
- **Lacuna 2:** {"arquivo": "src/hooks/inbox/useInboxBulkActions.ts", "descricao": "Linha 194: branch usava toast.info('Sem permissão para verificar o estado das conversas'); main usa toast.error('Não foi possível verificar o estado das conversas'). Cosmético; só mudar se o dono preferir tom neutro (commit #2813 anunciou info mas entregou error).", "tipo": "front", "valor": "baixo", "linhas_aprox": 1}

**`claude__fix-ci-E69-E71-draft-filter-261101-1830`** · *branch ainda viva no origin*  
<sub>5 lacuna(s) · verificada · **apagar: não**</sub>

PR #2503 queria baratear a CI: pular Security Audit (~20 min) e E2E (~45 min) em PR draft, rodar build em paralelo ao typecheck (~2 min/PR) e disparar CI ao marcar 'ready for review'. Só o gatilho ready_for_review entrou na main (#2858); o ajuste de docs ficou obsoleto (parágrafo reescrito). Os filtros de draft em security/e2e e a paralelização build/typecheck (com o teste de contrato correspondente) não estão na main nem foram substituídos — e o filtro em security hoje exigiria também ajustar o ci-gate, que na main passou a exigir success estrito (portar literal quebraria todo PR draft).

- **Lacuna 1:** {"arquivo": ".github/workflows/ci.yml", "descricao": "Adicionar `if: github.event.pull_request.draft != true` ao job e2e (portável isolado; e2e não entra no ci-gate nem nos required checks). Economiza até 45 min de runner por push em draft.", "linhas_aprox": 1, "tipo": "workflow", "valor": "medio"}
- **Lacuna 2:** {"arquivo": ".github/workflows/ci.yml", "descricao": "Adicionar `if: draft != true` ao job security E, no ci-gate (linha 427), isentar `security.result == skipped` quando draft (mesmo padrão das linhas 422/425) + mensagem de validação parcial (linha 431). Sem o ajuste do gate, todo PR draft fica vermelho.", "linhas_aprox": 3, "tipo": "workflow", "valor": "medio"}
- **Lacuna 3:** {"arquivo": ".github/workflows/ci.yml", "descricao": "E69: build `needs: [typecheck, unit-tests]` → `needs: [unit-tests]` (linha 229). Ganho ~2 min wall-clock/PR; build (required) pode ficar verde com typecheck vermelho, gate ainda bloqueia. Opcional.", "linhas_aprox": 1, "tipo": "workflow", "valor": "baixo"}
- **Lacuna 4:** {"arquivo": "scripts/ci/workflow-contracts.unit.mjs", "descricao": "Substituir teste 'E69: o build continua atrás do lint E do test' (linhas 561-565) pela versão da branch (build sem typecheck; ci-gate ainda espera typecheck e build) e ajustar comentário 469-474. Só junto com a mudança do needs; hunk colado no dossiê.", "linhas_aprox": 10, "tipo": "test", "valor": "baixo"}
- **Lacuna 5:** {"arquivo": "docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md", "descricao": "Aritmética 19→20: obsoleta, parágrafo reescrito na main (21 arquivos, sem dinâmicos). Nada a portar.", "linhas_aprox": 0, "tipo": "docs", "valor": "nenhum"}

**`claude__fix-codex-findings-161016-1906`** · *branch ainda viva no origin*  
<sub>5 lacuna(s) · verificada · **apagar: não**</sub>

Lote de fixes de CI/Codex de 16/10/2026 (PR #2770). Tudo de impacto real já está na main ou foi superado: guarda Number.isInteger na janela do Talk X (talkx-window.ts:329), isProgrammaticScrollRef no ChatMessagesArea (:125-133,319), regex dos contract tests (workflow-contracts:137-138,444; talkx-schedule-timezone:37,77), baselines regenerados (typecheck 93 issues; known-violations zerado em b24e31500; realtime sem audit_logs — confirmado em produção), n011 reescrito por outra abordagem (4b9585052), live-invariants mantido de propósito (db-live-guard.yml:234). Sobram só 4 lacunas de valor baixo: --shm-size 256m em 2 testes de Postgres descartável, inicializador lazy em useOfflineCache, timeout 30 min do typecheck (main reduziu de propósito) e renomeação de copy "Mais convertidos"→"Melhor resposta" (contraria spec T04-039 + teste na main). Nada precisa ser portado para o negócio; hunks colados no dossiê.

- **Lacuna 1:** {"arquivo": "scripts/db-audit/ai-projection-version-guard.test.mjs", "descricao": "Adicionar '--shm-size','256m' ao docker run do postgres:17-alpine (linha 191). Robustez de CI; sem sinal de falha na main.", "tipo": "test", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 2:** {"arquivo": "scripts/db-audit/talkx-engine-window-contract.test.mjs", "descricao": "Adicionar '--shm-size','256m' ao docker run (linha 124). Mesmo motivo acima.", "tipo": "test", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 3:** {"arquivo": "src/hooks/system/useOfflineCache.ts", "descricao": "Trocar useState(null)+useEffect de leitura do cache por inicializador lazy do useState (remove setState em effect e 1 render; permite tirar entrada do eslint-baseline.json:1020/7194).", "tipo": "front", "valor": "baixo", "linhas_aprox": 12}
- **Lacuna 4:** {"arquivo": ".github/workflows/ci.yml", "descricao": "timeout-minutes do job typecheck 15→30. Main reduziu de propósito (5721e4f50); só portar se o job voltar a estourar.", "tipo": "workflow", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 5:** {"arquivo": "src/components/talkx/TalkXTemplates.tsx", "descricao": "Renomear título do painel 'Mais convertidos' → 'Melhor resposta' (linha 357 + comentários). Contraria spec T04-039 e teste TalkXTemplatesRail.test.tsx; é decisão de produto, não resgate.", "tipo": "front", "valor": "baixo", "linhas_aprox": 4}

**`claude__fix-copilot-rls-supervisor-261101-1530`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

A branch queria que só supervisor/admin pudesse registrar "momentos de aprendizado" e atualizar a "nota da conversa" no Copilot. A main fechou o buraco original (policies abertas) de outra forma em 2026-11-07 (#2763, já em produção): cada um só mexe no que é seu (tagged_by/scored_by = próprio usuário). Resultado: vendedor hoje PODE se auto-avaliar e, como a nota tem chave única por conversa, pode bloquear o supervisor de avaliar. A branch inverte essa permissão vigente, logo é decisão de negócio: quem avalia conversas — só supervisor (recuperar) ou vendedor também (obsoleta)? Sem impacto imediato: nenhuma tela ou edge usa essas duas tabelas hoje.

- **Lacuna 1:** {"arquivo": "supabase/migrations/20261031150000_copilot_rls_supervisor_only.sql", "descricao": "Restringir a supervisor/admin INSERT em copilot_learning_moments e INSERT/UPDATE em copilot_conversation_scores (precisa versão nova > 20261115010000 e ser escrita sobre as policies atuais de main; hunk adaptado no dossiê)", "linhas_aprox": 20, "tipo": "migration", "valor": "medio"}
- **Lacuna 2:** {"arquivo": ".github/.ci-trigger", "descricao": "Arquivo de redisparo de CI, sem função", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}

**`claude__fix-copilot-tick-atomicity-261101-1430`** · *branch ainda viva no origin*  
<sub>3 lacuna(s) · verificada · **apagar: não**</sub>

Corrige perda silenciosa de insights do Copiloto RADAR: hoje o tick grava a sessão (cursor avança) e só depois insere os insights em outra chamada; se o INSERT falhar, o retry vê stale_state e desiste, e as sugestões daquelas mensagens somem para sempre. A branch junta as duas escritas numa RPC transacional (commit_copilot_tick). O handler do tick já entrou na main por #2828/#3127, mas a parte atômica (RPC + troca das 2 escritas por 1) não entrou e o bug continua no código que roda quando a capability for ligada.

- **Lacuna 1:** {"arquivo": "supabase/migrations/<nova versão>_copilot_commit_tick_rpc.sql", "descricao": "Criar RPC public.commit_copilot_tick(uuid,int,jsonb,jsonb) SECURITY DEFINER: UPDATE copilot_sessions com trava otimista (state_version) + INSERT copilot_insights na mesma transação; REVOKE de PUBLIC/authenticated/anon, GRANT service_role. SQL completo no dossiê; renumerar (main já tem 20261115010000).", "tipo": "migration", "valor": "alto", "linhas_aprox": 79}
- **Lacuna 2:** {"arquivo": "supabase/functions/_shared/copilot-tick.ts", "descricao": "Substituir passo 5 (main L511-533): trocar update(copilot_sessions)+insert(copilot_insights) por uma chamada deps.supabase.rpc('commit_copilot_tick', {p_session_id, p_state_version, p_patch, p_insights}); false → skipped stale_state; erro → COPILOT_WRITE_FAILED. Manter imports npm:, DECISION_ROLES, isRealDate e safeParse da main (não reintroduzir parseModelOutput).", "tipo": "edge", "valor": "alto", "linhas_aprox": 20}
- **Lacuna 3:** {"arquivo": "supabase/functions/_shared/__tests__/copilot-tick.test.ts", "descricao": "Ajustar mocks: de .from('copilot_sessions').update / .from('copilot_insights').insert para supabase.rpc('commit_copilot_tick') devolvendo true, false (stale) e erro. Conteúdo atual do teste NÃO VERIFICADO linha a linha.", "tipo": "test", "valor": "medio", "linhas_aprox": 30}

**`claude__fix-db-guard-pguser-261019-1430`** · *branch ainda viva no origin*  
<sub>4 lacuna(s) · verificada · **apagar: não**</sub>

Branch de correções de CI (PR #2104): PGUSER no db-guard, endpoint GA75 do settings-guard, remoção do auto-restore (GA77), novo settings-guard.yml, teste de secrets ignorando comentários e cast TS no hook de supressão Talk X. 6 de 7 itens já estão na main ou ficaram obsoletos (db-guard verde sem PGUSER; settings-guard.yml da main é mais novo; endpoint GA75 já corrigido no #2100; regex do security-unit já ignora comentários; hook Talk X reescrito sem o código alvo; CLAUDE.md virou @AGENTS.md). Única lacuna: GA77 — o settings-guard na main ainda tenta "restaurar" branch protection/auto_merge com um token que não pode escrever (PATCH 403), código morto que só polui o corpo da issue. Valor baixo, sem efeito em produção.

- **Lacuna 1:** {"arquivo": "scripts/ci/github-settings-guard.mjs", "descricao": "GA77: remover restaurar() (:348-365), o laço de restauração (:530-543), o bloco '### Restaurações aplicadas' e `forcar: restauracoesEfetivas.length > 0` (:599); `restauravel` passa a false em :176 e :223; ajustar cabeçalho :4 e comentário :152. Código morto: GITHUB_TOKEN do job (contents:read, issues:write) não consegue PATCH.", "tipo": "script", "valor": "baixo", "linhas_aprox": 45}
- **Lacuna 2:** {"arquivo": "scripts/ci/github-settings-guard.unit.mjs", "descricao": "Reescrever expectativas W05 da main (:204 passa a !includes('Restaurado'); :315-333 substituir os dois testes de restauração pelos testes 'dedupe dentro da janela' e 'fora da janela comenta de novo' — hunks no dossiê). Remover opção patchStatus do stub se ficar sem uso.", "tipo": "test", "valor": "baixo", "linhas_aprox": 20}
- **Lacuna 3:** {"arquivo": ".github/workflows/settings-guard.yml", "descricao": "Nome do step 'Verificar e restaurar configurações' e comentário 'restaura via PATCH' (:45-48) ficam falsos após GA77; trocar por 'Verificar configurações / abre ou atualiza issue'. Workflow: PR fica aberta para o dono.", "tipo": "workflow", "valor": "baixo", "linhas_aprox": 4}
- **Lacuna 4:** {"arquivo": "docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md", "descricao": "Marcar GA77 como [x] (:328) ao fechar a lacuna.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 1}

**`claude__fix-db-live-migrations-261107-1623`** · *branch ainda viva no origin*  
<sub>3 lacuna(s) · verificada · **apagar: não**</sub>

A branch queria deixar 5 arquivos de migration de 07/11 idênticos ao que foi realmente aplicado no banco (ledger). Três (120000, 123000, 133000) já estão na main fiéis ao ledger; a branch só tirava comentários (sem valor). Dois (121000 message_reactions_one_per_agent e 122000 contacts_phone_search_digits) a main regrediu em 09/11 (a15fdfb81/fe6c6b0bf): SQL reescrito à mão que NÃO bate com o ledger nem com produção (índice com outro nome, coluna gerada com outra expressão, REVOKE sem service_role, sem COMMENTs), mascarado por exceção "ledger-divergence/pinned-replay" em migration-evidence.json. Contraria banco.md:96 ("o ledger ao vivo é a verdade"). Impacto: replays locais/snapshots divergem de produção; não afeta usuário final. Recuperação = restaurar os 2 arquivos a partir do ledger (ou do merge-base 43fb7342a) e remover as 2 exceções do evidence.

- **Lacuna 1:** {"arquivo": "supabase/migrations/20261107121000_message_reactions_one_per_agent.sql", "descricao": "Substituir SQL da main (CREATE TABLE AS SELECT/DISTINCT ON, REVOKE sem service_role, sem COMMENTs) pelo SQL do ledger (CTE ranked com row_number, REVOKE incl. service_role, 2 COMMENTs). Fonte: git show 43fb7342a:<arquivo> ou hunk no dossiê.", "tipo": "migration", "valor": "medio", "linhas_aprox": 45}
- **Lacuna 2:** {"arquivo": "supabase/migrations/20261107122000_contacts_phone_search_digits.sql", "descricao": "Substituir pelo SQL do ledger: regexp_replace(coalesce(phone,''),'[^0-9]','','g'), índice idx_contacts_phone_search_digits_trgm, search_path com extensions, COMMENT ON COLUMN. Fonte: git show 43fb7342a:<arquivo> ou hunk no dossiê.", "tipo": "migration", "valor": "medio", "linhas_aprox": 12}
- **Lacuna 3:** {"arquivo": "scripts/db-audit/migration-evidence.json", "descricao": "Remover as 2 entradas ledger-divergence/pinned-replay (versões 20261107121000 e 20261107122000, ~linhas 1254-1279); conferir replay-known-failures.json (entradas 20261107* de a15fdfb81). Validar com node --test scripts/db-audit/check-migration-drift.test.mjs e CI db-live-guard.", "tipo": "config", "valor": "medio", "linhas_aprox": 26}

**`claude__fix-db-migrate-ga04-ga05-261016-0011`** · *branch ainda viva no origin*  
<sub>3 lacuna(s) · verificada · **apagar: não**</sub>

Endurecimento do workflow de migration (db-migrate): GA04 manda diagnósticos do heredoc inline para stderr e GA05 adiciona testes que provam que o ledger com cabeçalho "--" (caso real do run 37355980323) passa e arquivo diferente reprova. O essencial (scripts validate-runtime-proof/run-runtime-contract em stderr; normalização flatMap(splitStatements) no ledger) já está na main; faltam 2 linhas console.log→console.error no yml e 5 testes de proteção. O fechamento da PR alegou "delta zero", o que é falso. O yml da branch é cópia stale com regressões (remove guard CONFIRMATION_HASH, REF_DISPARO, --db-url, rebaixa pins) — portar só os 2 hunks GA04.

- **Lacuna 1:** {"arquivo": ".github/workflows/db-migrate.yml", "descricao": "Trocar console.log por console.error em main:865 ('Contrato generico: estrutura de public em') e main:895 (modHash.descreverConfirmacao) dentro do heredoc inline. Só esses 2 hunks; o resto do diff da branch é stale/regressivo. Workflow → PR fica aberta para o dono.", "tipo": "workflow", "valor": "baixo", "linhas_aprox": 2}
- **Lacuna 2:** {"arquivo": "scripts/ci/db-migrate-contratos.unit.mjs", "descricao": "3 testes GA04 (bloco no dossiê): yml sem console.log para 'Contrato generico'/'descreverConfirmacao' (depende do hunk do yml, falha na main hoje); validate-runtime-proof.mjs sem console.log e com process.stdout.write(confirmacao)/process.stderr.write descreverConfirmacao; run-runtime-contract.mjs sem console.log. Inserir após o teste 'E62: todo o inventario...' (main:293-314). Não remover os testes W28 da main.", "tipo": "test", "valor": "baixo", "linhas_aprox": 31}
- **Lacuna 3:** {"arquivo": "scripts/ci/verify-ledger-statements.unit.mjs", "descricao": "2 testes GA05 (bloco no dossiê): ledger com cabeçalho '-- cabecalho de psql\\n' + statement igual ao arquivo → ok:true,total:1; arquivo diferente → ok:false, motivo /statement 1/. Inserir após 'R2-INF-005: o heredoc do ledger e SQL valido' (main:102-109). Código já na main e fixture já passa; independente dos outros itens.", "tipo": "test", "valor": "medio", "linhas_aprox": 25}

**`claude__fix-ga-fase0-banco-e2e-261020-2200`** · *branch ainda viva no origin*  
<sub>4 lacuna(s) · verificada · **apagar: não**</sub>

Lote "fase 0" do plano de GitHub Actions (GA02-GA12). A maior parte já está na main, em versão melhor: a trava anti-apagão das instruções de agentes (ci.yml:73-76, hoje contra AGENTS.md + docs/agentes + skills), o gatilho/fila do E2E logado (workflow_run do CI verde no mesmo repo, grupo fixo), os headers de documentação dos dois workflows e a migration da RPC de fixture (arquivada byte a byte em _superseded/ por decisão registrada; produção confirma: migration 0, função 0). Sobram 4 lacunas reais e pequenas: no ci.yml, o teto interno de 11 min no Vitest (sem ele o estouro do job vira "cancelled" e o check agregado lê como pulado em vez de vermelho) e o grupo de concorrência próprio para o dispatch manual; e dois testes de contrato (GA04 do hash de prova do banco, GA05 do cabeçalho do ledger) cujo comportamento já está na main mas não está travado por teste — ambos aplicam limpo e passam. Nada de front, inbox, WhatsApp ou envio foi perdido.

- **Lacuna 1:** {"arquivo": ".github/workflows/ci.yml", "descricao": "GA56: `timeout 11m` interno no passo do shard do Vitest. Sem ele, o estouro do `timeout-minutes: 12` do job mata o passo como `cancelled` e o check agregado trata como pulado em vez de vermelho. Hunk pronto no dossiê.", "tipo": "workflow", "linhas_aprox": 109, "valor": "medio"}
- **Lacuna 2:** {"arquivo": "scripts/ci/verify-ledger-statements.unit.mjs", "descricao": "GA05: dois casos que travam a normalização do cabeçalho `--` do CLI no ledger (um aceita o cabeçalho, outro garante que arquivo divergente continua reprovando). O comportamento já está na main (verify-ledger-statements.mjs:48-49); o teste aplica limpo e passa. Hunk pronto no dossiê.", "tipo": "test", "linhas_aprox": 55, "valor": "medio"}
- **Lacuna 3:** {"arquivo": "scripts/ci/confirm-hash.unit.mjs", "descricao": "GA04: caso que trava o contrato de saída do validate-runtime-proof (hash sozinho no stdout, descrição e log do contrato genérico no stderr). O comportamento já está na main (validate-runtime-proof.mjs:611,643,649); o teste aplica limpo e passa. Hunk pronto no dossiê.", "tipo": "test", "linhas_aprox": 58, "valor": "medio"}
- **Lacuna 4:** {"arquivo": ".github/workflows/ci.yml", "descricao": "GA58: grupo de concorrência próprio para o dispatch manual (`github.run_id`), para não disputar nem cancelar o grupo do push na main. Hunk pronto no dossiê.", "tipo": "workflow", "linhas_aprox": 34, "valor": "baixo"}

**`claude__fix-ga-fase23-edge-e2e-261020-2200`** · *branch ainda viva no origin*  
<sub>8 lacuna(s) · verificada · **apagar: não**</sub>

Pacote de CI/edge (PR #2128). A maior parte foi superada pela main (health-check de logs reescrito, e2e-logado refeito com backend descartável, hook do front), mas sobraram 4 lacunas reais: (1) 4 suítes E2E da main — talkx, onboarding-dispensar, multiplix-responsivo, tarefas-linha-de-base — não rodam em nenhum workflow e o guard que pegaria isso ficou na branch; (2) o resolvedor de rollback das edges está na main sem ninguém chamar, e o código inline que continua ativo pode "rolar de volta" para o próprio SHA quebrado; (3) segredos ainda vão no argv do supabase secrets set em 4 pontos do deploy; (4) mexer em fixture de edge function dispara deploy de produção à toa. A triagem anterior marcou OBSOLETA — está errada nesses 4 pontos.

- **Lacuna 1:** {"arquivo": "scripts/ci/ci-e2e-projects.unit.mjs", "descricao": "GA47: guard do contrato inverso (todo projeto do playwright.config.ts roda em algum workflow ou está em ALLOWLIST_ORFAOS com prazo). Hoje a main tem 4 projetos órfãos: suítes de talkx, onboarding-dispensar, multiplix-responsivo e tarefas-linha-de-base nunca executam. Ao portar: incluir e2e-logado-isolado.yml na varredura, descartar os 2 testes finais da branch (contrariam o ci.yml atual) e corrigir o regex do prazo (\\\\d dentro de literal nunca casa).", "tipo": "test", "linhas_aprox": 58, "valor": "alto"}
- **Lacuna 2:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA30: trocar o resolvedor de rollback inline (:147-180) pela chamada a scripts/edge-deploy/resolve-rollback-ref.mjs, que já está na main e escolhe o último deploy bem-sucedido ANTERIOR ao SHA atual (recusa se não houver). Sem isso o rollback pode republicar o próprio SHA quebrado e o script testado fica como código morto.", "tipo": "workflow", "linhas_aprox": 36, "valor": "alto"}
- **Lacuna 3:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA32: passar os segredos por --env-file (mktemp + chmod 600 + printf + rm) em vez do argv de supabase secrets set, nos 4 pontos (:315 CRON_SECRET, :370 EXTERNAL_*, :412 PROMOGIFTS_*, :441 PREVIEW_*). Reimplementar: os blocos -K da branch estão quebrados.", "tipo": "workflow", "linhas_aprox": 30, "valor": "medio"}
- **Lacuna 4:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "Adicionar - '!supabase/functions/**/__fixtures__/**' ao push.paths (:38-42): hoje mexer em supabase/functions/_shared/__fixtures__/*.json dispara deploy de produção das edges sem mudar bundle.", "tipo": "workflow", "linhas_aprox": 1, "valor": "medio"}
- **Lacuna 5:** {"arquivo": "scripts/ci/e2e-teardown.mjs", "descricao": "GA39: logoutSessaoAtual + principalLogout + subcomando 'logout' + ::warning:: nas falhas (com o unit em scripts/ci/e2e-teardown.unit.mjs). Valor baixo porque o e2e-logado da main não chama mais o teardown de produção.", "tipo": "script", "linhas_aprox": 58, "valor": "baixo"}
- **Lacuna 6:** {"arquivo": "scripts/ci/redigir-relatorio.mjs", "descricao": "GA38: PADROES_TOKEN + redigirPadroes (JWT, access/refresh_token em JSON e query string, Authorization Bearer) ligados em redigirZip/redigirTextoComZipEmbutido, com os testes em redigir-relatorio.unit.mjs. Valor baixo: nenhum workflow chama o redator; a main protege excluindo error-context.md e *.zip dos artifacts.", "tipo": "script", "linhas_aprox": 88, "valor": "baixo"}
- **Lacuna 7:** {"arquivo": "scripts/ci/marcador-specs.mjs", "descricao": "GA42: em nomesDeTestResults, ignorar diretórios .playwright-artifacts* e colapsar o sufixo -retryN (2 runs iguais = 1 comentário). Valor baixo: a função não é mais usada pelo workflow, que monta a issue de results-summary.json.", "tipo": "script", "linhas_aprox": 11, "valor": "baixo"}
- **Lacuna 8:** {"arquivo": "eslint.config.js", "descricao": "Ignorar worktrees manuais: { ignores: [\"dist\", \".claude/worktrees/**\", \"Zapp_fase456/**\", \"zapp-worktrees/**\"] } — e regenerar scripts/ci/eslint-baseline.json, cujo eslintConfigSha256 está casado com o config.", "tipo": "config", "linhas_aprox": 3, "valor": "baixo"}

**`claude__fix-ga-fase78-perimetro-custo-261020-2200`** · *branch ainda viva no origin*  
<sub>21 lacuna(s) · verificada · **apagar: não**</sub>

Lote de CI/perímetro (GA75–GA95) fechado sem merge. A triagem anterior ("já na main") está errada: só 4 pedaços entraram por outro caminho (remoção do harden-runner, node 24 no vercel-env-cleanup, chave playwright do toolchain em versão mais nova e a correção do endpoint selected-actions no guard). Continuam fora da main: o KPI de custo do Actions que preenche as colunas "custo/semana" e "taxa de falha" do docs/ci/README.md (a main já tem o leitor, ninguém gera o arquivo, as colunas ficam em "—"), o cache de browsers Playwright que para de prender ~2,6 GB por PR, a notificação de startup_failure na main (hoje um workflow que nem arranca falha em silêncio), o dedupe da issue rotativa, a checagem de retenção de artifacts, o script de aplicação do perímetro e o teste que pegaria a divergência viva da imagem Go (Dockerfile em 1.27, go.mod/toolchain em 1.24). Nada aqui toca produto, WhatsApp, inbox ou banco: é custo e confiabilidade de CI. Dois pedaços não devem ser portados sem o dono: o baseline do perímetro da branch (desatualizado, mudaria required checks, apagaria environments e baixaria permissões) e a retirada da restauração automática de strict/auto-merge do guard.

- **Lacuna 1:** {"arquivo": "scripts/ci/actions-kpi.mjs", "descricao": "GA93/GA92: percentil, montarKpi, gravarKpi, mapaNomeArquivo e KPI_JSON_PATH ausentes, e coletarJobs sem a amostragem (só runs com falha/cancelamento, teto 200) que evitava estourar o limite de 1.000 req/h do GITHUB_TOKEN. Sem isso as colunas de custo/falha do docs/ci/README.md ficam em '—'. Portar só o aditivo: a main ganhou retry em pedir() depois da base e a branch o reverte.", "linhas_aprox": 92, "tipo": "script", "valor": "medio"}
- **Lacuna 2:** {"arquivo": "scripts/ci/actions-kpi.unit.mjs", "descricao": "Testes de GA92/GA93 (coletarJobs ignora runs verdes; fixture de 1.500 runs gera < 300 chamadas; contrato do kpi.json e do continue-on-error no workflow).", "linhas_aprox": 85, "tipo": "test", "valor": "medio"}
- **Lacuna 3:** {"arquivo": ".github/workflows/branch-hygiene-audit.yml", "descricao": "GA92/GA93: continue-on-error no passo do KPI (o passo abortou o hygiene de 19/10), KPI_JSON_PATH, upload do kpi.json como artifact e o job publicar-kpi que abre/atualiza a PR automation/kpi (merge manual) com docs/ci/kpi.json.", "linhas_aprox": 68, "tipo": "workflow", "valor": "medio"}
- **Lacuna 4:** {"arquivo": ".github/workflows/ci.yml", "descricao": "GA89: separar o cache dos browsers Playwright em actions/cache/restore (todo run, com restore-keys) e actions/cache/save (só push na main, chave com run_id) — hoje cada PR prende um cache em refs/pull/N/merge (~2,6 GB em 9 caches). GA87: job egress-image fazendo docker build do preview-egress-proxy sem push (não-required).", "linhas_aprox": 39, "tipo": "workflow", "valor": "medio"}
- **Lacuna 5:** {"arquivo": ".github/workflows/e2e-talkx.yml", "descricao": "GA89 com a chave pw-c- (só Chromium): restore em todo run, save só em push na main.", "linhas_aprox": 18, "tipo": "workflow", "valor": "medio"}
- **Lacuna 6:** {"arquivo": "scripts/ci/allowed-actions.json", "descricao": "Faltam actions/cache/restore e actions/cache/save (pré-requisito do GA89: sem eles o job morre com startup_failure). O resto do diff é reordenação alfabética — não portar.", "linhas_aprox": 2, "tipo": "config", "valor": "medio"}
- **Lacuna 7:** {"arquivo": ".github/workflows/notifica-falha-main.yml", "descricao": "GA95: notificar também conclusion == 'startup_failure' (foi a falha do branch-hygiene em 15/10, que ficou sem issue) e montar o corpo com gh + jq a partir de workflow_run.html_url/conclusion, no lugar do actions/github-script.", "linhas_aprox": 72, "tipo": "workflow", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "scripts/ci/issue-rotativa.mjs", "descricao": "GA78: dedupe por causa (marcador + janelaMs + autor, com detalhar), rotação fechando como state_reason 'not_planned' e sanitização de quebras de linha nos valores vindos da API. Arquivo intocado na main desde a base; todos os parâmetros novos são opcionais, então os chamadores atuais continuam funcionando.", "linhas_aprox": 70, "tipo": "script", "valor": "medio"}
- **Lacuna 9:** {"arquivo": "scripts/ci/issue-rotativa.unit.mjs", "descricao": "Testes do dedupe por marcador (suprime dentro da janela, volta a comentar depois) e do fechamento como not_planned.", "linhas_aprox": 92, "tipo": "test", "valor": "medio"}
- **Lacuna 10:** {"arquivo": "scripts/ci/github-settings-guard.mjs", "descricao": "GA79: checar artifact_and_log_retention_days em /actions/permissions/artifact-and-log-retention (403 = não verificável). GA76: ler merge.* por GraphQL antes de declarar ponto cego (o REST omite os campos para token sem push/admin). GA78: usar o dedupe da issue-rotativa. NÃO portar o GA77 (tirar a restauração automática de strict/allow_auto_merge) nem reverter o endpoint/verified_allowed/github_owned_allowed que a main ganhou depois da base.", "linhas_aprox": 292, "tipo": "script", "valor": "medio"}
- **Lacuna 11:** {"arquivo": "scripts/ci/github-settings-guard.unit.mjs", "descricao": "Testes dos itens acima (stub de GraphQL completo/parcial/erro, retenção de artifacts, dedupe). Portar só o que acompanhar o código portado: a main ganhou testes novos depois da base.", "linhas_aprox": 164, "tipo": "test", "valor": "medio"}
- **Lacuna 12:** {"arquivo": "scripts/ci/docker-pins.unit.mjs", "descricao": "Arquivo novo (51 linhas): trava a tag golang do Dockerfile no major.minor do toolchain, exige digest em todo FROM e confere o go.mod. Falharia hoje na main (Dockerfile 1.27 vs toolchain 1.24) — é o teste que expõe a divergência.", "linhas_aprox": 51, "tipo": "test", "valor": "medio"}
- **Lacuna 13:** {"arquivo": "infrastructure/preview-egress-proxy/Dockerfile", "descricao": "Alinhar o FROM golang a 1.24 (toolchain e go.mod), resolvendo o digest atual — o da branch é de 20/10. Impacto baixo: nada constrói nem publica essa imagem hoje.", "linhas_aprox": 2, "tipo": "config", "valor": "baixo"}
- **Lacuna 14:** {"arquivo": "scripts/ci/bump-toolchain.mjs", "descricao": "GA88: acrescentar go, zizmor e shellcheck-version à lista de bump e usar a chave canônica actionlint. Não portar a remoção do playwright (a main bumpa por aqui e já está em 1.64.1); a chave canônica exige o dedupe do toolchain.json em todos os leitores.", "linhas_aprox": 26, "tipo": "script", "valor": "baixo"}
- **Lacuna 15:** {"arquivo": ".github/toolchain.json", "descricao": "Remover as duplicatas actionlint-version/-sha256 e zizmor-version/-sha256 (só junto com o GA88). A chave playwright já está na main, em versão mais nova.", "linhas_aprox": 5, "tipo": "config", "valor": "baixo"}
- **Lacuna 16:** {"arquivo": "scripts/ci/aplicar-perimetro.mjs", "descricao": "GA80, arquivo novo (155 linhas): aplica o baseline do perímetro no repositório vivo, dry-run por padrão, --apply exige --confirm=APLICAR-PERIMETRO e token administration:write. Recuperável SOMENTE com o baseline atual da main: com o baseline da branch, um --apply mudaria os required checks, apagaria copilot/Preview/Production e poria default_workflow_permissions=read.", "linhas_aprox": 155, "tipo": "script", "valor": "baixo"}
- **Lacuna 17:** {"arquivo": "scripts/ci/aplicar-perimetro.unit.mjs", "descricao": "Arquivo novo (114 linhas): roda o script de verdade em child process com fetch stubbado — dry-run sem diferença, recusa sem --confirm, idempotência.", "linhas_aprox": 114, "tipo": "test", "valor": "baixo"}
- **Lacuna 18:** {"arquivo": "scripts/ci/github-settings-baseline.json", "descricao": "Só 2 campos valem: artifact_and_log_retention_days: 14 (GA79) e os padrões actions/cache/restore|save (GA89). O resto do baseline da branch é de 2026-10-16 e contradiz a tabela canônica de docs/agentes/github-ci.md (3 required checks, 9 environments, default_workflow_permissions=write) — não portar.", "linhas_aprox": 27, "tipo": "config", "valor": "baixo"}
- **Lacuna 19:** {"arquivo": ".github/dependabot.yml", "descricao": "OBSOLETA: adicionava ossf/scorecard-action* ao grupo actions-misc, mas não existe nenhum workflow Scorecard na main — não há o que bumpar.", "linhas_aprox": 3, "tipo": "workflow", "valor": "nenhum"}
- **Lacuna 20:** {"arquivo": ".github/workflows/e2e-logado.yml", "descricao": "OBSOLETA: o passo de cache dos browsers que o GA89 alterava deixou de existir na main (afd8c7ca3, #2717).", "linhas_aprox": 18, "tipo": "workflow", "valor": "nenhum"}
- **Lacuna 21:** {"arquivo": "scripts/ci/github-settings-guard.mjs (GA77)", "descricao": "GA77 tira do guard a restauração automática de strict e allow_auto_merge por PATCH, que a main faz hoje (github-settings-guard.mjs:346-360), trocando-a por alerta + aplicação manual via aplicar-perimetro. É mudança de política de perímetro contrária ao comportamento vigente: decisão do dono, não portar por conta própria.", "linhas_aprox": 60, "tipo": "script", "valor": "baixo"}

**`claude__fix-ga-resto-dbmigrate-20261021-0729`** · *branch ainda viva no origin*  
<sub>20 lacuna(s) · verificada · **apagar: não**</sub>

A branch deixava o lote diário de migrations do banco rodar de ponta a ponta sem editar YAML: o dry-run (conferência) deixaria de esperar aprovação humana, o apply passaria a aplicar todas as migrations pendentes de uma vez com conferência por hash, migration destrutiva (DROP/DELETE/TRUNCATE) exigiria confirmação explícita, e o apply dispararia sozinho a sincronização de tipos e o guarda do banco. Nada disso está na main: o comentário que fechou a PR #2142 ("as mudanças já estão na main") é falso — a main segue com job único, 1493 linhas, sem apply_all_missing nem confirmação destrutiva, e os 6 scripts novos (1.246 linhas) e 4 testes não existem lá. Entrou só o detector de SQL destrutivo (list-destructive.mjs, PR #3135) — e em versão melhor que a da branch —, mas ele está órfão: nenhum workflow o chama, então o portão nunca foi ligado. Os próprios planos da main (PLANO_GITHUB_ACTIONS 2026-10-15 e REVISAO 2026-10-30) continuam pedindo GA13–GA17 como pendência aberta, com a ressalva do dono de não virar "apply de lote indiscriminado".

- **Lacuna 1:** {"arquivo": ".github/workflows/db-migrate.yml", "descricao": "GA13-GA17 inteiros ausentes: divisao em preflight (banco-leitura, sem Waiting no dry-run) + apply (producao-ddl, if apply==true); inputs apply_all_missing e confirm_destructive; passo do portao destrutivo; fiacao para calcular-lote.sh, provar-lote.sh e contracts/post-apply.sh; fechamento TOCTOU do lote; gancho GA25 (GA25-DEPLOYMENT-RECORD + outputs); disparo de types-sync + db-live-guard com actions: write. NAO aplica por patch (reescrita de 1738 linhas contra arquivo que a main mexeu) — reconstruir a partir do YAML de 466 linhas da branch reaplicando --db-url, validate-runtime-proof.mjs, correcoes de zizmor/shellcheck e os pins novos de action.", "linhas_aprox": 466, "tipo": "workflow", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "scripts/db-audit/contracts/post-apply.sh", "descricao": "Dispatcher com as 16 validacoes pos-apply de versions historicas, extraidas verbatim do YAML (GA16). As validacoes seguem inline na main (1240 linhas removidas pela branch ainda estao la), entao o porte e refatoracao sem mudanca de comportamento — mas e o que permite o YAML < 500 linhas.", "linhas_aprox": 476, "tipo": "script", "valor": "medio"}
- **Lacuna 3:** {"arquivo": "scripts/db-audit/assert-runtime-proof.mjs", "descricao": "Assercao de runtime pre/pos-push extraida do YAML, fail-closed (exit 1). Entrada por ambiente: RUNTIME_JSON, TARGET_VERSION, NEEDS_APPLY, APPLY_BUNDLE. Chamado por provar-lote.sh. Sobrepoe parcialmente o validate-runtime-proof.mjs que ja esta na main — decidir no porte se os dois coexistem.", "linhas_aprox": 597, "tipo": "script", "valor": "medio"}
- **Lacuna 4:** {"arquivo": "scripts/db-audit/compose-confirm-hash.mjs", "descricao": "GA14: hash do LOTE (lista ordenada de versions + runtime_sha de cada uma + sha de cada arquivo + commit do dry-run). E o mecanismo que fecha a janela TOCTOU quando uma migration entra depois do dry-run. Exporta comporHashLote; importa de confirm-hash.mjs (ja na main). Nada equivalente existe na main.", "linhas_aprox": 51, "tipo": "script", "valor": "alto"}
- **Lacuna 5:** {"arquivo": "scripts/db-audit/provar-lote.sh", "descricao": "GA14/GA16: para cada version do CSV roda o contrato de runtime, valida a assercao historica e coleta os shas; imprime o hash do lote. Qualquer falha => exit != 0 e nenhum hash impresso. Orquestra assert-runtime-proof.mjs + proof-sha.mjs + compose-confirm-hash.mjs.", "linhas_aprox": 33, "tipo": "script", "valor": "alto"}
- **Lacuna 6:** {"arquivo": "scripts/db-audit/calcular-lote.sh", "descricao": "GA14: calcula o conjunto de versions locais ausentes do ledger (escopo do lote) e bloqueia se o ledger remoto tiver version sem arquivo local. Usa psql-safe.mjs (ja na main). Sem ele o apply_all_missing nao tem escopo.", "linhas_aprox": 75, "tipo": "script", "valor": "alto"}
- **Lacuna 7:** {"arquivo": "scripts/db-audit/proof-sha.mjs", "descricao": "GA14: extrai runtime_sha256 da prova impressa por run-runtime-contract.mjs; fail-closed (prova invalida => exit 2, nunca string vazia como sha).", "linhas_aprox": 11, "tipo": "script", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "scripts/db-audit/dry-run-plan.mjs", "descricao": "GA14: modo CLI --apply-all --esperados v1,v2,... que liga avaliarPlanoDoDryRunApplyAll (funcao ja na main, :125, nunca chamada). Sem isso o dry-run do lote nao confere o conjunto exato.", "linhas_aprox": 9, "tipo": "script", "valor": "alto"}
- **Lacuna 9:** {"arquivo": "scripts/ci/db-migrate-ga13-17.unit.mjs", "descricao": "Pins estruturais novos do YAML (2 jobs, environments, if apply==true, destino dos contratos). Cita a verificacao de cada etapa do plano; quebra antes do apply se o YAML regredir. So faz sentido junto com o YAML.", "linhas_aprox": 77, "tipo": "test", "valor": "medio"}
- **Lacuna 10:** {"arquivo": "scripts/ci/compose-confirm-hash.unit.mjs", "descricao": "Testes do hash do lote: determinismo, forma sha256, e que qualquer componente diferente (arquivo editado, runtime diferente, ordem, version a mais/menos) muda o hash.", "linhas_aprox": 61, "tipo": "test", "valor": "medio"}
- **Lacuna 11:** {"arquivo": "scripts/ci/assert-runtime-proof.unit.mjs", "descricao": "Testes de que a assercao extraida mantem a semantica do YAML original (mesmo fail-closed, mesmo exit 1).", "linhas_aprox": 51, "tipo": "test", "valor": "medio"}
- **Lacuna 12:** {"arquivo": "scripts/ci/proof-sha.unit.mjs", "descricao": "Testes do extrator de runtime_sha256, incluindo recusa fail-closed (exit 2, nada em stdout).", "linhas_aprox": 22, "tipo": "test", "valor": "medio"}
- **Lacuna 13:** {"arquivo": "scripts/ci/db-migrate-workflow.unit.mjs", "descricao": "Lacuna: tetos por job (preflight 20 min, apply 45 min) e invariante R2-INF-003 de que o secret bruto aparece 1x por job (2x no total), sempre no passo que endurece o DSN. Pin do YAML novo; portar junto.", "linhas_aprox": 19, "tipo": "test", "valor": "medio"}
- **Lacuna 14:** {"arquivo": "scripts/ci/secrets-environments.unit.mjs", "descricao": "Lacuna: mapa de environments passa de `db-migrate.yml:migrate -> producao-ddl` (main :77) para `db-migrate.yml:preflight -> banco-leitura` + `db-migrate.yml:apply -> producao-ddl`. Consequencia direta do GA13.", "linhas_aprox": 5, "tipo": "test", "valor": "medio"}
- **Lacuna 15:** {"arquivo": "scripts/ci/parity-hardening.unit.mjs", "descricao": "Lacuna: o teste passa a prender a cadeia inteira workflow -> contracts/post-apply.sh -> contrato de runtime do alvo 20260922220000, em vez do `case` inline. Depende do dispatcher da GA16.", "linhas_aprox": 11, "tipo": "test", "valor": "baixo"}
- **Lacuna 16:** {"arquivo": "scripts/ci/db-migrate-contratos.unit.mjs", "descricao": "Lacuna: passa a exigir que o workflow prove o lote via provar-lote.sh e que o script chame run-runtime-contract.mjs. Depende do YAML novo.", "linhas_aprox": 4, "tipo": "test", "valor": "baixo"}
- **Lacuna 17:** {"arquivo": "scripts/ci/dry-run-plan.unit.mjs", "descricao": "Lacuna: cobertura do CLI --apply-all (conjunto exato aceito, divergencia recusada com exit 1, ausencia de --esperados = uso invalido exit 2) e do nome do passo `Aplicar lote autorizado`.", "linhas_aprox": 24, "tipo": "test", "valor": "medio"}
- **Lacuna 18:** {"arquivo": "scripts/ci/verify-ledger-statements.unit.mjs", "descricao": "Lacuna: 1 linha — o recorte do bloco passa a terminar em `- name: Validar contratos historicos pos-apply` (nome do passo no YAML novo).", "linhas_aprox": 1, "tipo": "test", "valor": "baixo"}
- **Lacuna 19:** {"arquivo": "docs/runbooks/migracao-segredos-environments.md", "descricao": "3 linhas: a tabela de environments ainda aponta `db-migrate.yml › migrate` (main :37 e :241); com o GA13 passa a `db-migrate.yml › apply` (producao-ddl, com revisor) e ganha a linha `db-migrate.yml › preflight` (banco-leitura, sem revisor). Portar junto com o YAML, nunca antes.", "linhas_aprox": 3, "tipo": "docs", "valor": "baixo"}
- **Lacuna 20:** {"arquivo": "scripts/db-audit/list-destructive.mjs", "descricao": "Sem lacuna real: as 2 linhas missing_in_main (regex RE_ALTER_DROP estreita + comentario) foram SUPERADAS pela versao da main (PR #3135), que cobre DROP de coluna sem a palavra COLUMN e DELETE/TRUNCATE embutidos. Nao portar a versao da branch. O que falta e o consumidor: hoje o arquivo e codigo orfao na main.", "linhas_aprox": 2, "tipo": "script", "valor": "nenhum"}

**`claude__fix-ga-resto-docs-regen-20261021-0726`** · *branch ainda viva no origin*  
<sub>5 lacuna(s) · verificada · **apagar: não**</sub>

Branch de docs/CI (PR #2144) com 4 itens "GA": documentar que edge sobe sozinha no push (GA37), aliviar o workflow talkx-status-regen (GA96), CODEOWNERS sem "requer aprovação" (GA97) e passo órfão do db-guard + extrator nao-e-bug multi-linha (GA98). O núcleo já está na main por outros commits (#2345 DEPLOYMENT.md/template, #2156 concurrency única, passo em lote do db-guard, docs do notifica, CLAUDE.md virou @AGENTS.md com conteúdo em docs/agentes). Resta só baixo valor: comentário do CODEOWNERS contradizendo a regra vigente, filtro de paths/timeout/corpo do talkx-status-regen (workflow hoje disabled_manually), continuação multi-linha + export em render-workflow-docs.mjs (nenhum workflow da main usa item multi-linha hoje) e os testes GA96/97/98. Nada toca src, edge ou banco.

- **Lacuna 1:** {"arquivo": ".github/CODEOWNERS", "descricao": "Comentário 'Todas as mudanças requerem aprovação do admin' contradiz a regra vigente (review obrigatório: nenhum, docs/agentes/github-ci.md:35). Só comentário, sem efeito funcional.", "tipo": "config", "valor": "baixo", "linhas_aprox": 4}
- **Lacuna 2:** {"arquivo": ".github/workflows/talkx-status-regen.yml", "descricao": "Filtro paths (docs/talkx/**, scripts/talkx/**) no push, cancel-in-progress: true, timeout-minutes: 10 e corpo do PR coerente com o auto-merge já ligado (main:98 vs :161). Workflow está disabled_manually hoje — só vale se for religado.", "tipo": "workflow", "valor": "baixo", "linhas_aprox": 15}
- **Lacuna 3:** {"arquivo": "scripts/ci/render-workflow-docs.mjs", "descricao": "extrairNaoEBug com continuação de item multi-linha (`#     texto`) e export de extrairDocs/extrairNaoEBug com fluxo executável guardado por process.argv[1]. Nenhum workflow da main usa item multi-linha hoje; ganho = robustez/testabilidade.", "tipo": "script", "valor": "baixo", "linhas_aprox": 22}
- **Lacuna 4:** {"arquivo": "scripts/ci/docs-deploy-coerencia.unit.mjs", "descricao": "Testes GA96 (talkx-status-regen leve), GA97 (CODEOWNERS sem aprovação) e GA98 (extrator multi-linha). Dependem das 3 lacunas acima; adicionar à versão da main, não substituir.", "tipo": "test", "valor": "baixo", "linhas_aprox": 40}
- **Lacuna 5:** {"arquivo": ".github/PULL_REQUEST_TEMPLATE.md", "descricao": "Comentário HTML l.37 'Estes dois têm passo obrigatório DEPOIS do merge' ficou incoerente com a linha Edge já atualizada (#2345). Cosmético.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 1}

**`claude__fix-ga-resto-sonar-contracts-20261021-0726`** · *branch ainda viva no origin*  
<sub>12 lacuna(s) · verificada · **apagar: não**</sub>

Branch do plano GA (15/10) com três blocos: testes anti-regressão de workflow, endurecimento de CI e higiene Sonar. A triagem anterior marcou #2145 como OBSOLETA — não confere. O que importa de verdade e NÃO está na main: o Gate 3 do types-sync hoje compara o catálogo do banco com ele mesmo (o passo de apply sobrescreve o arquivo antes do gate), ou seja, o portão que deveria barrar remoção de tabela/função ainda usada pelo app é um no-op — um DROP destrutivo passa em silêncio. Além disso ficaram de fora: o DSN de produção sai do GITHUB_ENV (lido por qualquer action de terceiros no job) em 4 workflows, duas imagens de container sem digest, e 5 testes que travariam essas regressões. Já incorporado ou obsoleto: e2e-logado (main tem forma melhor), CLAUDE.md (linha removida de propósito), health-check (parser reescrito). O resto (16 arquivos de higiene Sonar) é cosmético, sem efeito.

- **Lacuna 1:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA20: Gate 3 de remoções destrutivas compara supabase/schema-catalog.json (já sobrescrito pelo passo de apply) com o próprio candidato — gate é no-op e um DROP de objeto consumido pelo src/ passa. Fix de 2 linhas: ler o catálogo antigo de `git show HEAD:`.", "linhas_aprox": 485, "tipo": "workflow", "valor": "alto"}
- **Lacuna 2:** {"arquivo": ".github/workflows/db-migrate.yml", "descricao": "GA21: DSN endurecido (DESTINO_URL e SUPABASE_DB_URL) gravado no GITHUB_ENV, legível por todos os passos seguintes inclusive actions de terceiros. Deve sair por outputs do passo `id: credencial` e cada passo declarar env próprio.", "linhas_aprox": 164, "tipo": "workflow", "valor": "medio"}
- **Lacuna 3:** {"arquivo": ".github/workflows/db-live-guard.yml", "descricao": "GA21: mesmo caso — DESTINO_URL no GITHUB_ENV; 11 passos passam a receber `DESTINO_URL: ${{ steps.credencial.outputs.destino }}`. Também GHCR_IMG sem digest (tag mutável) na linha 287.", "linhas_aprox": 124, "tipo": "workflow", "valor": "medio"}
- **Lacuna 4:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA21 + digest: DESTINO_URL no GITHUB_ENV (:177), `DESTINO_URL: ${{ env.DESTINO_URL }}` no gate1b, e GHCR_IMG `postgres-meta:v0.98.0` sem @sha256 (:202).", "linhas_aprox": 177, "tipo": "workflow", "valor": "medio"}
- **Lacuna 5:** {"arquivo": ".github/workflows/targeted-ledger-evidence.yml", "descricao": "GA21: falta `id: credencial` e o DSN sai pelo GITHUB_ENV (:85); 1 passo a converter para env próprio.", "linhas_aprox": 85, "tipo": "workflow", "valor": "medio"}
- **Lacuna 6:** {"arquivo": "scripts/ci/workflow-contracts.unit.mjs", "descricao": "5 dos 6 testes anti-regressão GA99 ausentes: Gate 3 via HEAD, DESTINO fora do GITHUB_ENV, imagem sem digest (adaptar a asserção de replay-local.sh para ghcr.io), e2e-logado if+grupo (adaptar ao grupo condicional da main), stdout limpo do hash (GA04, passa já) e !cancelled() com needs reuso (GA55, passa já). Fonte pronta em dc8b63494 linhas 611-778.", "linhas_aprox": 607, "tipo": "test", "valor": "medio"}
- **Lacuna 7:** {"arquivo": "scripts/ci/db-migrate-workflow.unit.mjs", "descricao": "Contrato ainda afirma o padrão antigo (DSN pelo GITHUB_ENV); precisa migrar para GITHUB_OUTPUT/steps.credencial.outputs junto da lacuna GA21 (21 linhas).", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 8:** {"arquivo": ".sonarcloud.properties", "descricao": "docs/reconciliation/** (776 arquivos de harness/relatório de auditoria, que nunca rodam em produção) fora de sonar.exclusions — geravam ~270 issues BLOCKER/HIGH em código novo sem achado em código entregue. Conferir no painel se o portão ainda sangra por isso.", "linhas_aprox": 28, "tipo": "config", "valor": "baixo"}
- **Lacuna 9:** {"arquivo": "scripts/ci/matriz-oth013-validar.py", "descricao": "Falta a contenção do caminho do plano dentro do repositório (3 linhas com plan_path.resolve() + checagem de parents). Hardening de CLI local de auditoria.", "tipo": "script", "valor": "baixo"}
- **Lacuna 10:** {"arquivo": "scripts/db-audit/check-remocoes-destrutivas.mjs", "descricao": "Falta recusar argumento com segmento `..` (3 linhas). Hardening de CLI local; o script é o mesmo usado pelo Gate 3.", "tipo": "script", "valor": "baixo"}
- **Lacuna 11:** {"arquivo": "scripts/ci/github-settings-guard.mjs", "descricao": "4 chamadas .sort() sem comparador (:273,:277,:312,:313) comparadas via join — o comparador porCodigo já existe e é usado onde a ordem vira hash. Puramente cosmético (Sonar S2871).", "linhas_aprox": 273, "tipo": "script", "valor": "nenhum"}
- **Lacuna 12:** {"arquivo": "scripts/ci/actions-kpi.unit.mjs", "descricao": "Higiene Sonar cosmética: base de new URL `http://x` → `https://x` em teste. Igual para bump-toolchain.mjs, catalog-ct73-docs.unit.mjs, check-test-inventory.mjs, lamejs-attack-indexing.unit.mjs, consolidar-veredito.mjs, run-runtime-contract.mjs, v4-status.mjs/.unit.mjs (sort/Number.parse*) e replay-local.sh, replay-local-harness.test.sh, revoke-auth-sessions.test.sh, preparar-artifact-deploy.sh ([ ] → [[ ]]). Sem mudança de comportamento.", "tipo": "script", "valor": "nenhum"}

**`claude__fix-ga-resto-typessync-20261021-0730`** · *branch ainda viva no origin*  
<sub>9 lacuna(s) · verificada · **apagar: não**</sub>

Fase 1 do plano GA20-GA25: endurecer os três guardas de banco no CI (types-sync, db-live-guard, db-migrate). A main já tem o split de credencial (GA21) e recebeu as três bibliotecas novas no resgate do pacote 8 (#3135, 15/11), mas NENHUMA delas tem chamador — são código morto. A fiação GA20/GA22/GA23/GA24/GA25 ficou fora. Consequência ativa hoje: o Gate 3 do types-sync (único freio contra um PR de sync que apaga tabela/view/função ainda usada pelo src/) compara o catálogo já sobrescrito com ele mesmo e SEMPRE passa; e o auto-merge do PR de sync é incondicional, então DDL feito fora do db-migrate é legalizado sozinho. A alegação de fechamento da PR #2143 ("delta zero, já está na main") é falsa.

- **Lacuna 1:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA20: congelar o catálogo base do HEAD antes dos gates ('git show HEAD:supabase/schema-catalog.json > /tmp/catalog.base.json') e passar /tmp/catalog.base.json como 1o argumento do check-remocoes-destrutivas.mjs. Hoje o Gate 3 compara o arquivo já sobrescrito com ele mesmo e nunca bloqueia remoção destrutiva de objeto ainda consumido pelo src/.", "tipo": "workflow", "linhas_aprox": 485, "valor": "alto"}
- **Lacuna 2:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA22: step 'Verificar se sync e explicado por migration' (drift-explicado.mjs sobre catalog.base x catalog novo), condição extra no auto-merge (explicado=true E grants_changed=false) e step que aplica o label needs-human quando a revisão humana é obrigatória, mais a regra declarada no corpo do PR. Hoje o auto-merge é incondicional e legaliza sozinho DDL feito fora do db-migrate. Depende da lacuna GA20 (/tmp/catalog.base.json).", "tipo": "workflow", "linhas_aprox": 758, "valor": "alto"}
- **Lacuna 3:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA23: output 'pendente' do ler-banco + lista /tmp/pending-versions.txt no artifact; Gate 1b chamando scripts/db-audit/gate1-pendente.mjs (--tsc-log --pending --migrations-dir) em vez do booleano grosso; 'pendente != true' nas condições de abrir/exigir PR; step 'Registrar sync pendente' no summary. Sem isso o sync abre PR com apply pendente e pode reverter o lote.", "tipo": "workflow", "linhas_aprox": 447, "valor": "medio"}
- **Lacuna 4:** {"arquivo": ".github/workflows/db-live-guard.yml", "descricao": "GA24: step auxiliar 'Listar versions pendentes' (sem id:, continue-on-error) gerando /tmp/pending-versions.txt e .csv, e fallback com drift-explicado.mjs --versions nos passos catalog, manifest e types — divergência explicada pelo lote pendente vira 'sync pendente' (notice) em vez de issue falsa. grants e triple-parity seguem estritos.", "tipo": "workflow", "linhas_aprox": 257, "valor": "medio"}
- **Lacuna 5:** {"arquivo": ".github/workflows/db-live-guard.yml", "descricao": "GA25: permissions 'deployments: read' + step 'Detector de DDL fora do fluxo' (ledger em JSON, lista de Deployments, check-deployments-ledger.mjs --since --environment producao-ddl) e o log /tmp/step-ddl-fluxo.log no artifact. Como está na branch NÃO funciona: falta GH_TOKEN no env do step e o corte 20261016000000 pega 122 versions sem Deployment correspondente (guarda vermelho na 1a execução) — o corte tem de ser a data do merge do GA25.", "tipo": "workflow", "linhas_aprox": 369, "valor": "medio"}
- **Lacuna 6:** {"arquivo": ".github/workflows/db-migrate.yml", "descricao": "GA25 no apply: permissions 'deployments: write', step 'Coletar versions aplicadas no ledger' (comm -12 do preflight com o ledger final) e step que registra o Deployment producao-ddl via actions/github-script. Precisa de correção: passar 'payload: { versions }' no createDeployment, porque check-deployments-ledger.mjs:46 lê d.payload.versions e a branch só grava description.", "tipo": "workflow", "linhas_aprox": 1486, "valor": "medio"}
- **Lacuna 7:** {"arquivo": "scripts/db-audit/consolidar-veredito.mjs", "descricao": "Entrada { id: 'ddl-fora-do-fluxo', log: '/tmp/step-ddl-fluxo.log' } em PASSOS e em ORDEM_CAUSA. Só pode entrar no mesmo PR que o step GA25 do db-live-guard: consolidar() marca outcome vazio como '❌ (ausente)' e falha o job.", "tipo": "script", "linhas_aprox": 32, "valor": "medio"}
- **Lacuna 8:** {"arquivo": "scripts/ci/ga20-ga25-contratos.unit.mjs", "descricao": "Arquivo novo (142 linhas, 11 testes) que trava os invariantes de YAML dos GA20-GA25; roda no ci.yml:166 via 'node --test scripts/ci/*.unit.mjs'. Ao portar: remover os 2 testes GA21 (duplicam types-sync-jobs-credentials.unit.mjs, já na main), limpar 3 trechos mortos (void auto / void passo / void tripla) e ajustar o teste GA25 se o corte de data mudar.", "tipo": "test", "linhas_aprox": 1, "valor": "medio"}
- **Lacuna 9:** {"arquivo": "scripts/ci/allowed-actions.json", "descricao": "Acrescenta 'step-security/harden-runner' à allowlist (e aos selected_actions_patterns do github-settings-baseline.json) sem que nenhum workflow use a action, nem na própria branch. Alarga o perímetro do GitHub sem necessidade — descartar.", "tipo": "config", "linhas_aprox": 1, "valor": "nenhum"}

**`claude__fix-paleta-filtros-celebracoes-261025-2110`** · *branch ainda viva no origin*  
<sub>4 lacuna(s) · verificada · **apagar: não**</sub>

Branch guarda-chuva com 103 commits (~100 fixes de inbox, Talk X, admin, a11y e testes + 1 migration de KPI). Praticamente tudo já está na main, muita coisa reimplementada melhor. Sobram 3 itens: dois testes de regressão que guardam comportamentos que a main JÁ tem em produção (tolerância de relógio nas celebrações de conquista e o filtro de tipo do inbox acompanhando o voltar/avançar do navegador) e um detalhe de acessibilidade da paleta ⌘K (as "Buscas recentes" ficam dentro da lista de opções). Nenhum fluxo de negócio está quebrado hoje por causa disso: o risco é alguém desfazer sem perceber os dois fixes que não têm teste. Um item da branch é obsoleto e NÃO deve ser recuperado: ela escondia criar/editar/excluir template de WhatsApp de supervisores, e a RLS de produção autoriza supervisor — a main já acerta.

- **Lacuna 1:** {"arquivo": "src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx", "descricao": "Teste de regressão 'relógio do cliente levemente atrasado não transforma conquista antiga em festa' (conquista com earned_at ~1 s à frente do marco do mount não vira festa). O fix de produção está na main (TOLERANCIA_RELOGIO_MS = 2000), mas sem este teste nada impede a tolerância de ser removida — o sintoma seria confete de conquistas antigas ao abrir o app. Hunk aplica limpo na main (ABSENT_APPLIES_CLEAN); inserir após o caso 'a-nova'.", "linhas_aprox": 257, "tipo": "test", "valor": "medio"}
- **Lacuna 2:** {"arquivo": "src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx", "descricao": "Bloco describe('useInboxFilters — back/forward do histórico (?type=)') com o caso 'depois de troca manual, a URL mudando por fora atualiza o filtro'. A main implementa o comportamento (useInboxFilters.ts:162-178) mas não o guarda. Para portar é preciso reinstalar o useNavigate no Probe (a main removeu) e usar a forma atual de setFilters (sem o campo tags).", "linhas_aprox": 146, "tipo": "test", "valor": "medio"}
- **Lacuna 3:** {"arquivo": "src/components/ui/command-palette.tsx", "descricao": "Na main os botões de 'Buscas recentes' (e o 'Limpar') continuam dentro de <div id={listboxId} role=\"listbox\"> sem role=\"option\": filhos inválidos de listbox, o leitor de tela anuncia a contagem de opções errada. A branch movia esse bloco para fora do listbox e marcava as seções com role=\"group\" aria-label=\"Recentes\"/\"Acesso rápido\". A parte de ids duplicados NÃO deve ser portada: a main já deduplica a fonte (quickAccessItems filtra recentIds) e tem teste próprio.", "linhas_aprox": 270, "tipo": "front", "valor": "baixo"}
- **Lacuna 4:** {"arquivo": "src/components/ui/__tests__/command-palette.a11y.test.tsx", "descricao": "Teste 'buscas recentes ficam fora do listbox' (perdido junto com o ajuste acima). Só faz sentido portar depois de mover o bloco de buscas recentes para fora do listbox.", "linhas_aprox": 155, "tipo": "test", "valor": "baixo"}

**`claude__fix-talkx-segmentos-estimativa-261025-2110`** · *branch ainda viva no origin*  
<sub>12 lacuna(s) · verificada · **apagar: não**</sub>

Branch guarda-chuva (101 commits, 173 arquivos): quase tudo já está na main. Sobram 3 correções do Talk X → Segmentos: (1) quando todas as regras do segmento são "em breve", a tela mostra a BASE INTEIRA como público estimado em vez de "—"; (2) o botão Atualizar da biblioteca recalcula com Promise.all e, se um segmento falhar, perde o recálculo de todos em silêncio; (3) depois de excluir/arquivar em lote, o painel Detalhes continua mostrando um segmento que já não existe. Exposição hoje é baixa (produção tem 1 segmento e nenhum usa campo "em breve"), mas são guardas contra número de audiência errado em campanha de WhatsApp. Também perdidos os 2 testes que provam isso. O resto da branch é obsoleto: templates de WhatsApp só-admin contraria a RLS real (admin+supervisor), enum de papel com special_agent não existe no banco, e a fila offline/phone-input/TalkXView já evoluíram mais na main.

- **Lacuna 1:** {"arquivo": "src/hooks/integrations/useTalkXSegments.ts", "descricao": "useAudienceEstimate sem guarda de contagem nula: segmento cujas regras são todas 'em breve' (lead_origin/lead_score/risk_score) vira complete.groups=[] e a RPC devolve a BASE INTEIRA como público estimado. Portar hasComingSoonRule + retorno { count: null } e aceitar count nulo em TalkXCampaignWizard (SegmentPreviewCard), segments/TalkXSegmentBuilder.tsx:289 e TalkXSegments.tsx:787 (mostrar '—'). NÃO portar comingSoon em real_sector/real_uf (main usa ponteOnly).", "tipo": "front", "valor": "medio", "linhas_aprox": 360}
- **Lacuna 2:** {"arquivo": "src/hooks/integrations/useTalkXSegments.ts", "descricao": "refreshEstimates usa Promise.all sem onError: um segmento que lança (regra da ponte Singu) aborta o recálculo de toda a biblioteca em silêncio no ↻ Atualizar. Portar Promise.allSettled + contagem de falhas + toast 'Não foi possível recalcular N de M segmento(s)'.", "tipo": "front", "valor": "medio", "linhas_aprox": 789}
- **Lacuna 3:** {"arquivo": "src/components/talkx/TalkXSegments.tsx", "descricao": "Seleção fantasma no painel Detalhes: depois de excluir/arquivar em lote, o segmento sai da lista mas o rail continua aberto com ele. O efeito atual (linhas 196-205) só limpa selectedIds. Portar o seenInListRef/useEffect que zera setSelected(null) quando o segmento já esteve na lista e desapareceu.", "tipo": "front", "valor": "medio", "linhas_aprox": 196}
- **Lacuna 4:** {"arquivo": "src/hooks/integrations/__tests__/useTalkXSegments.estimativa.test.tsx", "descricao": "Teste novo (96 linhas), ausente na main: prova a contagem nula para regra só 'em breve' (usar lead_origin) e a falha parcial de refreshEstimates (update({estimated_count:5}), eq('id','ok'), toast com '1 de 2'). Descartar o describe de real_sector/real_uf comingSoon, que contraria o ponteOnly da main.", "tipo": "test", "valor": "medio", "linhas_aprox": 1}
- **Lacuna 5:** {"arquivo": "src/components/talkx/__tests__/TalkXSegments.selecaoFantasma.test.tsx", "descricao": "Teste novo (67 linhas), ausente na main: clica num cartão, esvazia a lista de segmentos e exige que o rail 'Detalhes do segmento' desapareça. Precisa adaptar aos mocks atuais (ver TalkXSegments.detailPanel.test.tsx).", "tipo": "test", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 6:** {"arquivo": "src/components/catalog/WhatsAppTemplatesManager.tsx", "descricao": "OBSOLETA e incorreta: a branch restringia criar/editar/duplicar/excluir a isAdmin, mas a RLS de produção é is_admin_or_supervisor; a main já acerta com isSupervisor. Não recuperar (tiraria acesso legítimo do supervisor).", "tipo": "front", "valor": "nenhum", "linhas_aprox": 39}
- **Lacuna 7:** {"arquivo": "src/hooks/integrations/__tests__/useTalkXSegments.test.ts", "descricao": "OBSOLETA: fixa real_sector/real_uf como comingSoon e incompleteCount=3; a main decidiu ponteOnly com falha fechada e o teste da main (:130) lista só lead_origin/lead_score/risk_score.", "tipo": "test", "valor": "nenhum", "linhas_aprox": 130}
- **Lacuna 8:** {"arquivo": "src/components/admin/__tests__/useAdminDataCreateUser.test.ts", "descricao": "OBSOLETA: espera enum de papel com special_agent; app_role em produção tem apenas admin, supervisor, agent.", "tipo": "test", "valor": "nenhum", "linhas_aprox": 148}
- **Lacuna 9:** {"arquivo": "src/services/outbound-message.service.ts", "descricao": "OBSOLETA: a branch deixava item de fila offline sem dono drenar (return true); a main endureceu (return false e enqueue que lança sem sessão).", "tipo": "front", "valor": "nenhum", "linhas_aprox": 379}
- **Lacuna 10:** {"arquivo": "ESTADO.md", "descricao": "Inventário gerado; a versão da main é mais nova (ESTADO.md:116,119). Sem valor.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 116}
- **Lacuna 11:** {"arquivo": "docs/talkx/ARQUITETURA.md", "descricao": "Doc já atualizado na main com TalkXCampaignPaused e a rota ?screen=report (ARQUITETURA.md:7,92). Sem valor.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 7}
- **Lacuna 12:** {"arquivo": "supabase/schema-manifest.json", "descricao": "Artefato gerado (hashes de policies de message_reactions); a main tem manifest próprio mais novo. Sem valor.", "tipo": "config", "valor": "nenhum", "linhas_aprox": 112}

**`claude__fix-teste-notas-titulo-erro-261101-1410`** · *branch ainda viva no origin*  
<sub>3 lacuna(s) · verificada · **apagar: não**</sub>

PR #2475 (fechada pelo congelamento #2545, não por mérito) só endurece 3 testes da ficha de notas do contato: volta a exigir o título 'Erro ao atualizar nota' quando a RLS impede editar/fixar nota de colega e alinha os mocks ao caminho real da main (hook useContactNotes → ContactService.updateNote .select().single(); leitura paginada .range()). Nada entrou na main: os 3 arquivos estão byte a byte como no merge-base (#2281). Código de produção já faz o que os testes descrevem; a lacuna é só a proteção do teste. Verificado em cópia isolada: testes da branch passam 19/19 sobre a main atual; ao mutar o título em useContactNotes.ts:157 o teste da branch falha e o da main não. Triagem 2804 (OBSOLETA) não confere.

- **Lacuna 1:** {"arquivo": "src/components/contacts/__tests__/ContactNotes.editarFixar.test.tsx", "descricao": "Asserção do erro de UPDATE bloqueado por RLS exige title 'Erro ao atualizar nota' + variant (main só exige variant e não detecta mudança do título); mock simula RLS via updateAllowed devolvendo PGRST116 e honra .order()/.range() do serviço; doc-comment e typos corrigidos; TestQueryWrapper compartilhado", "tipo": "test", "valor": "medio", "linhas_aprox": 87}
- **Lacuna 2:** {"arquivo": "src/components/contacts/__tests__/ContactNotes.ordemFoco.test.tsx", "descricao": "Mock passa a honrar .range() (o serviço não chama .limit(); na main _limit nunca é setado e o teste da fixada antiga passa trivialmente); doc-comment alinhado ao hook; TestQueryWrapper. Asserções iguais", "tipo": "test", "valor": "baixo", "linhas_aprox": 65}
- **Lacuna 3:** {"arquivo": "src/components/contacts/__tests__/ContactNotes.semColuna.test.tsx", "descricao": "Troca wrapper QueryClient local por TestQueryWrapper de src/test/mocks/queryClient.tsx; sem mudança de asserção", "tipo": "test", "valor": "baixo", "linhas_aprox": 12}

**`claude__fix-unit-tests-pre-existentes-261024-1700`** · *branch ainda viva no origin*  
<sub>15 lacuna(s) · verificada · **apagar: não**</sub>

Maratona de 87 commits de "corrigir testes pré-existentes" sobre a main de 24/10 que arrastou features de produto (X112 lista/grade, X156 campanha pausada, X079 células do kit, busca server-side do chat de equipe, aba Tarefas agendadas, contagem do AuditLogDashboard, validação de telefone DDI 55, avatar com URL assinada, áudio por MIME real). Em 3 semanas a main reimplementou TODOS esses itens de forma própria e melhor (hooks dedicados em vez de lógica no componente), então a branch virou história. Sobra uma única correção real que ninguém refez: no login com MFA, a verificação automática dispara antes dos fatores carregarem e a tela trava em "Nenhum fator MFA encontrado". Dois pontos da branch são regressão hoje e não devem ser portados: arquivar conversa por assigned_to (a main usa conversation_status via RPC) e restringir templates de WhatsApp a admin (a main já decidiu liberar para supervisor).

- **Lacuna 1:** {"arquivo": "src/components/mfa/MFAVerify.tsx", "descricao": "Auto-verificação do MFA dispara quando o código chega a 6 dígitos mesmo com factors ainda vazio: handleVerify cai em 'Nenhum fator MFA encontrado' (main:48), não limpa o código, e como a dependência é só [code] nada tenta de novo quando os fatores chegam — a pessoa trava no login com MFA. A branch adiciona o guard factors.length > 0 e passa a depender de [code, factors]. A main nunca tocou o arquivo desde a base.", "linhas_aprox": 72, "tipo": "front", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "src/hooks/system/useGlobalSettings.ts", "descricao": "A branch adiciona useGlobalSettings(options?: { enabled?: boolean }) repassando enabled ao useQuery, e IntegrationKeysSection passa { enabled: isAdmin }. Na main o hook é chamado sem gate para todo mundo e o componente só retorna cedo depois (linha 83), então não-admin dispara uma consulta a global_settings que o RLS recusa. Sem impacto visível.", "linhas_aprox": 46, "tipo": "front", "valor": "baixo"}
- **Lacuna 3:** {"arquivo": "src/hooks/chat/useScheduledReports.ts", "descricao": "Troca do texto do toast para 'Erro ao atualizar o relatorio' (sem acentos) só para casar com um teste da branch — piora o texto atual da main. Não portar.", "linhas_aprox": 144, "tipo": "front", "valor": "nenhum"}
- **Lacuna 4:** {"arquivo": "src/components/talkx/kit/primitives.tsx", "descricao": "Spread de ThHTMLAttributes no componente Th para permitir data-testid; nenhum consumidor na main precisa disso hoje. Não portar.", "linhas_aprox": 99, "tipo": "front", "valor": "nenhum"}
- **Lacuna 5:** {"arquivo": "src/hooks/inbox/useInboxBulkActions.ts", "descricao": "A branch volta o arquivamento em lote para assigned_to=null; a main arquiva por conversation_status via RPC de lote (com trigger de transição). Portar seria regressão.", "linhas_aprox": 188, "tipo": "front", "valor": "nenhum"}
- **Lacuna 6:** {"arquivo": "src/components/catalog/WhatsAppTemplatesManager.tsx", "descricao": "A branch restringe criar/editar/duplicar/excluir template a isAdmin; a main já decidiu liberar para isSupervisor (decisão posterior). Portar contraria a regra vigente.", "linhas_aprox": 39, "tipo": "front", "valor": "nenhum"}
- **Lacuna 7:** {"arquivo": "scripts/ci/eslint-baseline.json", "descricao": "Baseline de lint com 65 entradas/hashes divergentes, gerado contra o fonte da branch de 24/10. Regerar na main é o caminho; portar quebraria o guard.", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 8:** {"arquivo": "scripts/db-audit/known-violations.json", "descricao": "Baseline do supabase-usage-guard reescrito pela branch (perde 7 entradas de contexto que a main ainda tem). Artefato de ratchet, não portar.", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 9:** {"arquivo": "supabase/schema-manifest.json", "descricao": "Manifesto de schema gerado, divergente por 3 semanas de migrations na main. Regerado por automação.", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 10:** {"arquivo": "ESTADO.md", "descricao": "Âncoras arquivo:linha de edges/consumidores atualizadas para o fonte da branch; os números não valem mais na main.", "linhas_aprox": 1, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 11:** {"arquivo": "docs/talkx/ARQUITETURA.md", "descricao": "Nota de que TalkXCampaignPaused passou a existir (X156) — a main já descreve o estado atual e o guard scripts/ci/talkx-docs-drift.unit.mjs já foi ajustado lá.", "linhas_aprox": 1, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 12:** {"arquivo": "docs/DB-INVENTORY.md", "descricao": "Linha de consumidores de user_service_accounts; a main tem a própria versão da linha.", "linhas_aprox": 1, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 13:** {"arquivo": ".github/.keep-ci", "descricao": "Arquivo vazio criado só para forçar rerun de CI ('ci-trigger-2'). Ruído.", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 14:** {"arquivo": "src/hooks/integrations/__tests__/useTalkXSuppression.test.ts", "descricao": "A branch reescrevia o arquivo (-372 linhas); a main o apagou de propósito no commit e1f2ee4dd ao destravar o CI Gate. Obsoleto.", "linhas_aprox": 1, "tipo": "test", "valor": "nenhum"}
- **Lacuna 15:** {"arquivo": "src/components/**/__tests__/ (cerca de 60 arquivos)", "descricao": "Mocks e asserções reescritos contra o fonte da branch (AdminView, AuditLogDashboard.corte, DashboardView, TalkXOverview.table, useTeamChatNotifications.aviso-navegador, ChatPopup, WorkItemSheet.fuso, etc.). A main reimplementou o fonte e tem a própria suíte; portar quebraria o CI.", "tipo": "test", "valor": "nenhum"}

**`claude__ga-ci-batch-ga49-ga54-ga60-ga64-231023`** · *branch ainda viva no origin*  
<sub>9 lacuna(s) · verificada · **apagar: não**</sub>

Lote de ajustes de CI (PR #2197, fechada como "delta zero"). O núcleo já está na main ou foi superado de propósito: fila-merge.mjs e seu workflow foram apagados no pacote 6 (41853318c, 2026-11-14: fila O(N²) substituída por merges em pacote); CodeQL diário já entrou (codeql.yml:23); branch-hygiene publica com condição mais estrita (!cancelled() && relatório ok, b46f5d291); docker-shim da main já falha fechado em CREATE/snapshot de roles (docker-shim:80-86,170-173) e a versão da branch é bash inválido. Sobram 5 hunks de valor baixo não incorporados: types-sync.yml (ignorar known-violations.json no gatilho, grupo de concurrency próprio para dispatch, Job summary com !cancelled()), remoção do ignore do actionlint (só após validar parse) e alerta de lote de pushes no KPI do Actions (precisa correções apontadas no review: conta runs e não pushes). Nada afeta WhatsApp, inbox, contatos ou login.

- **Lacuna 1:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "GA61: negar '!scripts/db-audit/known-violations.json' em paths (merge do PR de sync redispara o workflow); concurrency group com run próprio para dispatch; Job summary com `if: ${{ !cancelled() }}` em vez de always()", "tipo": "workflow", "valor": "baixo", "linhas_aprox": 10}
- **Lacuna 2:** {"arquivo": ".github/actionlint.yaml", "descricao": "GA60: remover o ignore 'could not parse as YAML' de branch-hygiene-audit.yml — só após rodar actionlint na main e confirmar que o arquivo parseia", "tipo": "config", "valor": "baixo", "linhas_aprox": 4}
- **Lacuna 3:** {"arquivo": "scripts/ci/actions-kpi.mjs", "descricao": "GA54: detectarLote/tabelaLote — alerta no KPI semanal de branch com >15 runs em 24 h (R6). Portar só com correções do review: filtrar event push/pull_request, contar head_sha distintos, ignorar main, janela coerente com caller semanal", "tipo": "script", "valor": "baixo", "linhas_aprox": 35}
- **Lacuna 4:** {"arquivo": "scripts/ci/actions-kpi.unit.mjs", "descricao": "GA54: 2 testes (limite 15 / fora da janela de 24 h) — na branch estão duplicados; colar uma cópia", "tipo": "test", "valor": "baixo", "linhas_aprox": 38}
- **Lacuna 5:** {"arquivo": "scripts/ci/fila-merge.mjs", "descricao": "GA49/GA50 (bloqueado por CANCELLED/ACTION_REQUIRED, teto 45 min, motivoFora) — OBSOLETA: arquivo e auto-update-pr-branch.yml removidos em 41853318c; não portar", "tipo": "script", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 6:** {"arquivo": "scripts/db-audit/docker-shim", "descricao": "GA66 já coberto na main com implementação mais forte (b46f5d291); GA70 referencia EXPECTED_DB inexistente e o hunk é bash inválido — não portar", "tipo": "script", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 7:** {"arquivo": ".github/workflows/codeql.yml", "descricao": "cron diário já na main; `needs: [analyze]` obsoleto (CodeQL não roda em PR) — não portar", "tipo": "workflow", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 8:** {"arquivo": ".github/workflows/branch-hygiene-audit.yml", "descricao": "!cancelled() já na main em forma mais estrita; 'publicar mesmo com relatório falho' foi decidido ao contrário — não portar", "tipo": "workflow", "valor": "nenhum", "linhas_aprox": 0}
- **Lacuna 9:** {"arquivo": "scripts/ci/eslint-baseline.json", "descricao": "artefato gerado, regenerado na main depois; eslint.config.js (worktrees locais), .gitignore (node_modules já existia) e mock generateCorrelationId no teste do ChatPopup são ruído — não portar", "tipo": "config", "valor": "nenhum", "linhas_aprox": 0}

**`claude__infra-c121-ddl-261101-1350`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

A DDL inteira da investigação de pausas de instância (3 colunas, 3 CHECKs, RPC mark_pause_investigated, grants) já está na main e aplicada em produção, via a migration 20261111181000 trazida pela PR #2822 — o painel no front já usa. Sobram duas coisas da branch: (1) um fix na RPC que impede atribuir a investigação original a outra pessoa quando o perfil do investigador é excluído (produção hoje tem o comportamento errado) e (2) a suíte de teste de banco de 509 linhas, que é a única cobertura existente dessa RPC (hoje zero). Branch não pode ser apagada.

- **Lacuna 1:** {"arquivo": "supabase/migrations/20261111181000_instance_pause_investigation.sql", "descricao": "Linha 125: main/produção usam `investigated_by = COALESCE(investigated_by, v_profile)`. Se o perfil do investigador for excluído (FK ON DELETE SET NULL zera o ator e a data sobrevive), uma chamada seguinte grava o NOVO chamador como autor da investigação original, com a data antiga congelada — autoria falsa, e o CHECK instance_pauses_investigacao_completa não impede. A branch (commit e66c92b4f) usa `CASE WHEN investigated_at IS NULL THEN v_profile ELSE investigated_by END`. Correção = nova migration com CREATE OR REPLACE FUNCTION trocando só essa linha (a migration de 2026-11-11 já foi aplicada, não se reescreve).", "linhas_aprox": 125, "tipo": "migration", "valor": "medio"}
- **Lacuna 2:** {"arquivo": "supabase/tests/instance_pause_investigation.sql", "descricao": "Suíte de banco de 509 linhas (T1–T7) ausente na main e sem substituto: cobre investiga+audita sem copiar notas, negação para agente/anon/service_role sem efeito nem auditoria, validações da função (22023) e dos 3 CHECKs (23514), FK×CHECK, P0002, reinvestigação com 1 auditoria por chamada e ator/data congelados, supervisor, RLS/ACL e rollback. Portar de `git show origin/claude/infra-c121-ddl-261101-1350:supabase/tests/instance_pause_investigation.sql`. O bloco T3b (linhas 329–337) só passa se a lacuna da migration for aplicada; o T6 (431–432) passa como está contra a main.", "linhas_aprox": 509, "tipo": "test", "valor": "medio"}

**`claude__kind-gates-87mwoe`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch do loop de CI do PR #2185 (90 commits): correções de produto achadas pelo Qodo (Base de Conhecimento, inbox, diagnóstico, configurações, War Room, Talk X), infra de teste e relatórios de sessão. Praticamente tudo de produto já está na main, em forma igual ou melhor; as frentes de CI/teste/docs foram superadas por reescritas deliberadas da main. Sobram dois ajustes pequenos: o painel de diagnóstico mostra "Latência: Xms" mesmo quando declara o banco fora do ar por falha na contagem de conexões, e a tela de configurações não avisa o usuário quando a leitura falha por rede (fica com os padrões em silêncio). Nenhum fluxo crítico (WhatsApp, envio, inbox, login) está em falta.

- **Lacuna 1:** {"arquivo": "src/hooks/system/useDiagnosticsData.ts", "descricao": "Quando a contagem de whatsapp_connections falha, a main marca o banco como 'down' mas ainda exibe a latência medida na sonda de contacts ('Latência: Xms'), o que engana o operador. Portar: const dbLatencyFinal = (dbError ?? connectionsCountError) ? null : dbLatency; e usar dbLatencyFinal em classifyHealth e no campo dbLatency. O resto do hunk da branch (try/catch nas contagens e ?? 0) já é equivalente na main.", "linhas_aprox": 317, "tipo": "front", "valor": "baixo"}
- **Lacuna 2:** {"arquivo": "src/hooks/system/useUserSettings.ts", "descricao": "O catch de fetchSettings (falha de rede/transporte) só marca isError, sem toast: a tela mostra os padrões em silêncio. Portar o toast destrutivo 'Não foi possível carregar as configurações' dentro do if (ativo) do catch, padronizando a redação com a do caminho PostgREST (:124).", "linhas_aprox": 166, "tipo": "front", "valor": "baixo"}

**`claude__tender-heisenberg-a4jk3s`** · *branch ainda viva no origin*  
<sub>10 lacuna(s) · verificada · **apagar: não**</sub>

Lote de "CI verde" de 22/10 (PR #1979). Os 4 fixes de produto (filtro de tipo da inbox por ?type=, diagnostico de banco que nao aborta o ciclo, isError nas configuracoes do usuario, arquivamento em lote por conversation_status) ja estao todos na main, em varios casos com a main tendo ido alem. Falta apenas uma reordenacao de dedupe de comentario no workflow types-sync (ruido de alerta de CI, zero efeito em negocio). O resto e baseline gerado, mock de jsdom dispensavel, rename de job superado e um plano documental cuja premissa (14 workflows) virou 21 na main.

- **Lacuna 1:** {"arquivo": ".github/workflows/types-sync.yml", "descricao": "E20: dedupe de comentario deve rodar ANTES da rotacao de issue. Na main o bloco if (ultimaPagina > 20) cria comentario e da return antes de o dedupe rodar, entao o mesmo gate vermelho volta a comentar mesmo com menos de 6h e mesma causa. Patch: remover as linhas 594-606 da main e inserir o mesmo bloco de listComments/causaAnterior/idadeUltimoMs logo apos const ultimaPagina = (linha 573). Hunk completo no dossie.", "linhas_aprox": 574, "tipo": "workflow", "valor": "baixo"}
- **Lacuna 2:** {"arquivo": "src/test/setup.ts", "descricao": "Mocks globais de clientHeight/clientWidth (600x800) em HTMLElement.prototype, com comentario explicando que o @tanstack/react-virtual v3 mede por clientHeight. Nao esta na main e nao e necessario: a suite virtualizada passa sem ele (9 testes de FilesTab.fase6 verdes).", "linhas_aprox": 144, "tipo": "test", "valor": "nenhum"}
- **Lacuna 3:** {"arquivo": "docs/audits/PLANO_WORKFLOWS_FAILURE_200_ETAPAS_2026-10-16.md", "descricao": "Plano de 635 linhas (F001-F200) sobre os workflows em failure, medido em 16/10 sobre 14 arquivos de .github/workflows/. Premissa vencida: a main tem 21 workflows hoje, inclusive settings-guard.yml que o plano declara deletado. Nada do plano foi executado e os numeros nao valem mais.", "linhas_aprox": 1, "tipo": "docs", "valor": "baixo"}
- **Lacuna 4:** {"arquivo": "scripts/ci/typecheck-baseline.json", "descricao": "Baseline gerado por tsc -b --force, estado de 22/10 (removia 116 entradas). Artefato: o baseline da main e a verdade do estado atual dela.", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 5:** {"arquivo": "scripts/ci/ci-docs-baseline.unit.mjs", "descricao": "Branch REMOVE /14 workflows/ e /14 arquivos/ de CONTAGEM_ANTIGA; a main tem os 4 padroes. Aplicar afrouxaria o guard de contagem antiga em docs. Regressivo, nao portar.", "linhas_aprox": 27, "tipo": "script", "valor": "nenhum"}
- **Lacuna 6:** {"arquivo": "scripts/db-audit/known-violations.json", "descricao": "Branch reacrescenta rpc:talk_me_list_pending_messages e from:connection_alert_preferences ao allowlist; a main zerou o ratchet (known: []). Reinserir afrouxaria o guard. Nao portar.", "linhas_aprox": 15, "tipo": "config", "valor": "nenhum"}
- **Lacuna 7:** {"arquivo": ".github/workflows/ci.yml", "descricao": "Rename do job typecheck para Lint & TypeCheck, par do rename do teste E69 em workflow-contracts.unit.mjs. A main manteve a chave typecheck e o nome TypeCheck, e o contrato E69 da main cita typecheck. Superado.", "linhas_aprox": 35, "tipo": "workflow", "valor": "nenhum"}
- **Lacuna 8:** {"arquivo": "scripts/ci/workflow-contracts.unit.mjs", "descricao": "Rename do teste E69 para test/node-scripts nao esperam o lint-and-typecheck + sufixo SL-095 em comentario. Contradiz a chave real do ci.yml na main. Superado.", "linhas_aprox": 548, "tipo": "script", "valor": "nenhum"}
- **Lacuna 9:** {"arquivo": "scripts/db-audit/dashboard-rls-authorization.test.sh", "descricao": "Atualizacao das origens de assert_last_definer (dashboard_kpi para 20261007013217, is_admin_or_supervisor para 20261016170000) e awk anchored. A main ja fez isso e foi alem (dashboard_kpi em 20261026210000). O resto do diff e um espaco extra, ruido.", "linhas_aprox": 165, "tipo": "test", "valor": "nenhum"}
- **Lacuna 10:** {"arquivo": "src/hooks/tasks/workItemAggregates.ts", "descricao": "Troca /[̀-ͯ]/g pelos caracteres combinantes literais em normalizarBusca. Comportamento identico, forma menos legivel. Nao portar.", "linhas_aprox": 102, "tipo": "front", "valor": "nenhum"}

**`claude__w85-w86-w87-ossf-scorecard`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch reaplicava, sobre a main pós-"CI mínimo", o OpenSSF Scorecard (workflow novo, SARIF no Code Scanning) e o step Dependency review no job security do ci.yml (bloqueia PR que traz dependência com vulnerabilidade HIGH+). Nenhum dos dois está na main: foram removidos de propósito em 5721e4f50 (16/10), a branch nasceu depois e os readicionou, e a reaplicação mínima #2510 (01/11) foi fechada pelo congelamento de features #2545 com "branch preservada". O fechamento de #2051 alegando "delta zero" é falso para esses 2 itens. O resto (cache Bun, Playwright 1.64.1, regex do teste, allowlist) já está na main ou foi superado (install-deps despinado em #2054; e2e-logado reestruturado; harden-runner já removido em #2100).

- **Lacuna 1:** {"arquivo": ".github/workflows/ci.yml", "descricao": "Step '🔍 Dependency review' (actions/dependency-review-action@a1d282b3… v5.0.0, fail-on-severity: high, só em pull_request) no job security, após o gitleaks. Hunk colado no dossiê.", "linhas_aprox": 8, "tipo": "workflow", "valor": "medio"}
- **Lacuna 2:** {"arquivo": ".github/workflows/scorecard.yml", "descricao": "Workflow novo OpenSSF Scorecard (push main + cron '50 7 * * 1' + dispatch; ossf/scorecard-action v2.5.0 fa7117db…, publish_results, upload-sarif). Ao portar: usar pin atual do codeql-action da main (33d7b85d… v4.39.3), regerar docs/ci/README.md com render-workflow-docs.mjs e atualizar contagem 21→22 em ci-docs-baseline.unit.mjs:296,300,337. Direção atual do dono é reduzir workflows (freeze #2545) — valor baixo.", "linhas_aprox": 63, "tipo": "workflow", "valor": "baixo"}

**`claude_juca__practical-rubin-8xnw0u`** · *branch ainda viva no origin*  
<sub>22 lacuna(s) · verificada · **apagar: não**</sub>

Lote de etapas do módulo Talk X. Já está na main: trilha do cabeçalho/Monitor (X053, em forma melhor — item clicável volta à lista), busca ⌘K (X054), rótulo de status 'sending' na paleta, e a exportação CSV+PDF do relatório de campanha com gate de permissão (X168 foi superado por X164/TL-080, mais completo). Ficou fora da main: importar/exportar templates em CSV/JSON (feature inteira, ponta a ponta na branch), ações em massa (pausar/cancelar/excluir) na lista de campanhas, painel 'Status dos serviços' (o botão que o abre existe na main e não abre nada), RLS negada (42501) cair em 'sem permissão' em vez de erro genérico, o botão 'Falar com o administrador' na tela de permissão do Talk X e a dica do dia rotativa. Branch não pode ser apagada antes de recuperar esses itens.

- **Lacuna 1:** {"arquivo": "src/components/talkx/talkxTemplateFile.ts", "descricao": "X093 — parser/serializador de templates em CSV e JSON (limites 500 linhas / 2 MB, escape anti-injeção CSV, tipos ParsedTemplateRow/ConflictAction). Arquivo novo, ausente da main; portar inteiro de 652c56961.", "tipo": "front", "linhas_aprox": 217, "valor": "medio"}
- **Lacuna 2:** {"arquivo": "src/components/talkx/TalkXTemplateImportDialog.tsx", "descricao": "X093 — dialog de importação com prévia por linha, erros, e resolução de conflito por nome (pular/sobrescrever/criar cópia). Arquivo novo, ausente da main.", "tipo": "front", "linhas_aprox": 297, "valor": "medio"}
- **Lacuna 3:** {"arquivo": "src/components/talkx/TalkXTemplates.tsx", "descricao": "X092/X093 — fiação do import/export: botões CSV/JSON/Importar no rightSlot da FilterBarV2 e RailAction 'Importar templates' (ambos sob canDownload), handlers handleExportCsv/handleExportJson/handleImport (createTemplate.mutateAsync + refetch) e render do dialog.", "tipo": "front", "linhas_aprox": 82, "valor": "medio"}
- **Lacuna 4:** {"arquivo": "src/components/talkx/TalkXOverview.tsx", "descricao": "X081 — barra de ações em massa na lista de campanhas (Pausar/Cancelar/Excluir com contagem de elegíveis por status) usando TalkXBulkBar, que já existe em kit/table.tsx:76. Também o X082 (TIPS + tipOffset + TipCard onNext). Não portar o RailAction 'Importar contatos': leva a onGoTab('contacts') que cai em segments.", "tipo": "front", "linhas_aprox": 52, "valor": "medio"}
- **Lacuna 5:** {"arquivo": "src/components/talkx/kit/states.tsx", "descricao": "X048 — em TalkXQueryBoundary, erro com code '42501' (RLS/permission denied) renderiza TalkXNoPermissionState em vez do erro genérico.", "tipo": "front", "linhas_aprox": 4, "valor": "medio"}
- **Lacuna 6:** {"arquivo": "src/pages/ViewRouter.tsx", "descricao": "X048 — passar onContactAdmin={() => navigateToView('team-chat')} ao TalkXNoPermissionState da view talkx (hoje o botão 'Falar com o administrador' nunca aparece).", "tipo": "front", "linhas_aprox": 3, "valor": "medio"}
- **Lacuna 7:** {"arquivo": "src/components/talkx/kit/ServiceStatusSheet.tsx", "descricao": "X048 — painel lateral 'Status dos serviços' (WhatsApp / CRM 360 / Tempo real). Ausente na main; o botão que o abriria já existe (kit/states.tsx:175) e nada passa onViewStatus. Ao portar, completar a fiação (renderizar o Sheet e passar onViewStatus/whatsappConnected via useTalkXServiceStatus), senão fica código morto.", "tipo": "front", "linhas_aprox": 92, "valor": "medio"}
- **Lacuna 8:** {"arquivo": "src/components/talkx/kit/constants.ts", "descricao": "X082 — array TIPS com 10 dicas do dia para o TipCard.", "tipo": "front", "linhas_aprox": 15, "valor": "baixo"}
- **Lacuna 9:** {"arquivo": "src/components/talkx/kit/rail.tsx", "descricao": "X082 — TipCard aceita onNext e desenha a seta '›' (aria-label 'Próxima dica').", "tipo": "front", "linhas_aprox": 9, "valor": "baixo"}
- **Lacuna 10:** {"arquivo": "src/components/talkx/talkxShared.ts", "descricao": "Reexport de kit/ServiceStatusSheet no barril (só faz sentido junto com a lacuna do Sheet).", "tipo": "front", "linhas_aprox": 1, "valor": "baixo"}
- **Lacuna 11:** {"arquivo": "src/components/talkx/__tests__/talkxTemplateFile.test.ts", "descricao": "Provas do parser CSV/JSON de templates (limites, escape, conflitos). Ausente na main.", "tipo": "test", "linhas_aprox": 169, "valor": "medio"}
- **Lacuna 12:** {"arquivo": "src/components/talkx/__tests__/TalkXTemplateImportDialog.test.tsx", "descricao": "Provas do dialog de importação. Ausente na main.", "tipo": "test", "linhas_aprox": 90, "valor": "medio"}
- **Lacuna 13:** {"arquivo": "src/components/talkx/__tests__/TalkXOverview.bulk.test.tsx", "descricao": "Provas das ações em massa (X081). Ausente na main.", "tipo": "test", "linhas_aprox": 125, "valor": "medio"}
- **Lacuna 14:** {"arquivo": "src/pages/__tests__/ViewRouter.talkx-permission.test.tsx", "descricao": "Provas do X048 no ViewRouter (agent em ?view=talkx vê o estado de Campanhas; botão navega para team-chat; outra view restrita segue genérica). Ausente na main; o 2º caso depende do hunk do ViewRouter.", "tipo": "test", "linhas_aprox": 68, "valor": "medio"}
- **Lacuna 15:** {"arquivo": "src/components/talkx/__tests__/TalkXOverview.rail.test.tsx", "descricao": "Provas do painel lateral/dica do dia (X082). Ausente na main.", "tipo": "test", "linhas_aprox": 106, "valor": "baixo"}
- **Lacuna 16:** {"arquivo": "src/components/talkx/__tests__/TalkXTemplatesRail.test.tsx", "descricao": "Hunk que adiciona o mock de useDownloadPermission e o caso 'Importar templates abre o dialog' — só junto com a lacuna X093.", "tipo": "test", "linhas_aprox": 15, "valor": "baixo"}
- **Lacuna 17:** {"arquivo": "docs/reconciliation/tasks/P046.json", "descricao": "Ledger de reconciliação reescrito (16.733 linhas) marcando 137 etapas como IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE contra 28 na main. NÃO PORTAR: gravaria status falso para código que não está na main.", "tipo": "docs", "linhas_aprox": 22045, "valor": "nenhum"}
- **Lacuna 18:** {"arquivo": "src/lib/talkxCsv.ts", "descricao": "X168 obsoleto: a main tem a exportação CSV do relatório por X164/TL-080 (buildTalkXCampaignCsvBlob), mais completa. Não portar.", "tipo": "front", "linhas_aprox": 126, "valor": "nenhum"}
- **Lacuna 19:** {"arquivo": "src/lib/talkxReportPdf.ts", "descricao": "X168 obsoleto: a main tem buildTalkXCampaignPdfBlob (jsPDF dinâmico) por X164/TL-080. Não portar.", "tipo": "front", "linhas_aprox": 169, "valor": "nenhum"}
- **Lacuna 20:** {"arquivo": "src/components/talkx/report/TalkXCampaignReport.tsx", "descricao": "X168 obsoleto: main já tem botões CSV e PDF com gate canDownload (linhas 9-10,112,220-235). Não portar.", "tipo": "front", "linhas_aprox": 51, "valor": "nenhum"}
- **Lacuna 21:** {"arquivo": "src/components/talkx/report/__tests__/TalkXCampaignReportExport.test.tsx", "descricao": "Testa a implementação X168 da branch, substituída na main. Não portar.", "tipo": "test", "linhas_aprox": 103, "valor": "nenhum"}
- **Lacuna 22:** {"arquivo": "src/lib/__tests__/talkxCsv.test.ts", "descricao": "Testa o serializador X168 da branch; a main tem o seu próprio teste para X164/TL-080. Não portar.", "tipo": "test", "linhas_aprox": 115, "valor": "nenhum"}

**`claude_pink__cool-dijkstra-xk9ek2`** · *branch ainda viva no origin*  
<sub>15 lacuna(s) · verificada · **apagar: não**</sub>

Branch do "plano GA01-GA100" (PR #2502/#2108, 94 commits, endurecimento de CI/CD/banco). A maior parte já está na main sob outros nomes (GA02 em check-claude-md-integrity.mjs, GA10 em workflow-contracts.unit.mjs, GA25 em check-deployments-ledger.mjs, GA64 via sla-code-scanning.mjs, GA21/GA61/GA62/GA68, gmail-helpers, settings-guard.yml), e a triagem de 2026-11-08 marcou "OBSOLETA" — errado em parte. Sobram 11 lacunas reais, todas de CI/infra (nenhuma toca WhatsApp, inbox, envio, contatos ou login). A mais importante é de segurança: o deploy-functions.yml da main ainda passa 7+ segredos na linha de comando do `supabase secrets set`, visíveis em /proc do runner; a branch corrige com env-file. Atenção: o tip da branch está corrompido — 4 arquivos foram substituídos por uma linha PLACEHOLDER_* (evolution-api/index.ts perdeu 1219 linhas), então a branch não é mergeável; só vale portar hunks avulsos. Não apagar antes de recuperar GA32/GA30/GA33.

- **Lacuna 1:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA32: segredos passados na linha de comando do `supabase secrets set` (CRON_SECRET, EXTERNAL_SUPABASE_URL/SERVICE_ROLE_KEY, PROMOGIFTS_*, proxy de previews) ficam visíveis em /proc/<pid>/cmdline no runner. A branch troca por mktemp + chmod 600 + --env-file + rm -f. Hunk completo no dossiê.", "linhas_aprox": 315, "tipo": "workflow", "valor": "alto"}
- **Lacuna 2:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA30: rollback de edge compartilha o grupo de concorrência do deploy normal (um push automático o cancela) e pode resolver o próprio SHA atual como destino. A branch dá grupo 'deploy-edge-functions-rollback' e pula dep.sha === GITHUB_SHA; adiciona o aviso de que rollback de edge não reverte migration aplicada.", "linhas_aprox": 91, "tipo": "workflow", "valor": "medio"}
- **Lacuna 3:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA33: 5xx no preflight read-only do CRM externo faz exit 1 e bloqueia o deploy de TODAS as edges. A branch degrada em deploy total (FN vazio): ::warning:: + CRM_PREFLIGHT_FAILED=true, pulando só crm-integration; exit 1 continua quando o alvo é a própria função.", "linhas_aprox": 356, "tipo": "workflow", "valor": "medio"}
- **Lacuna 4:** {"arquivo": ".github/workflows/deploy-functions.yml", "descricao": "GA35: o bloco paths: exclui 'fixtures/' mas não '__fixtures__/' (duplo underscore, convenção do Deno/Supabase CLI) — mudança em fixture dispara deploy de edge.", "linhas_aprox": 40, "tipo": "workflow", "valor": "baixo"}
- **Lacuna 5:** {"arquivo": ".github/workflows/db-live-guard.yml", "descricao": "GA25: falta o passo 'Detectar DDL fora do fluxo' que executa o detector. O script scripts/db-audit/check-deployments-ledger.mjs já está na main mas nenhum workflow o chama — o guarda está morto.", "tipo": "workflow", "valor": "medio"}
- **Lacuna 6:** {"arquivo": "scripts/db-migrate/register-deployments.mjs", "descricao": "GA25: script que registra o Deployment 'producao-ddl' a cada apply, que é o que o detector de DDL fora do fluxo procura. Pasta scripts/db-migrate/ não existe na main; db-migrate.yml só usa environment: producao-ddl para aprovação.", "linhas_aprox": 87, "tipo": "script", "valor": "medio"}
- **Lacuna 7:** {"arquivo": "scripts/ci/check-test-inventory.mjs", "descricao": "GA73: inventário de testes só valida um sentido (suite no disco sem YAML). Falta padroesYamlSemArquivo() — padrão em `run:` que não casa com nenhum arquivo no disco, cobrindo suite renomeada/apagada sem atualizar o YAML. Hunk completo no dossiê; 2 testes em check-test-inventory.unit.mjs.", "linhas_aprox": 302, "tipo": "script", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "scripts/ci/check-edge-envs.mjs", "descricao": "GA31: nenhuma guarda de variáveis de ambiente das edge functions na main. O script varre Deno.env.get('X') em supabase/functions/**/*.ts e falha com ::error:: para var não declarada no baseline (scripts/ci/edge-env-baseline.json, 49 vars: EVOLUTION_*, GMAIL_*, CRON_SECRET, MEDIA_EGRESS_*, MULTIPLIX_*). O baseline precisa ser regerado contra as edges atuais antes de entrar.", "linhas_aprox": 41, "tipo": "script", "valor": "medio"}
- **Lacuna 9:** {"arquivo": "scripts/ci/actions-kpi.mjs", "descricao": "GA54: falta branchesQuentes(runs, { limiteEm24h = 15 }) e o aviso no step summary para branch com mais de 15 pushes em 24 h (caso real: 96 pushes = 414 runs). Hunk completo no dossiê + testes em actions-kpi.unit.mjs. Obs.: o GA92 do mesmo arquivo já está coberto na main por .slice(0, 50) em actions-kpi.mjs:231.", "linhas_aprox": 195, "tipo": "script", "valor": "baixo"}
- **Lacuna 10:** {"arquivo": ".github/workflows/db-guard.yml", "descricao": "GA65 (W55): PR que toca só docs/markdown roda todos os contratos de banco. A branch adiciona o passo 'Detectar PR apenas-docs' que exporta CONTRATOS_PULADOS=true e condiciona cada passo de contrato com `if: env.CONTRATOS_PULADOS != 'true'` (o check precisa existir em todo PR por branch protection, então não pode ser skipped no job). ~250 linhas de diff.", "tipo": "workflow", "valor": "baixo"}
- **Lacuna 11:** {"arquivo": "scripts/ci/aplicar-perimetro.mjs", "descricao": "GA80: script de 215 linhas que aplica o github-settings-baseline.json via API (dry-run por padrão, --apply com ADMIN_WRITE_TOKEN). A necessidade central já é coberta pelo PATCH de restauração em origin/main:scripts/ci/github-settings-guard.mjs:352,359; isto cobriria o baseline inteiro. Recuperar só se o dono quiser a ferramenta completa.", "linhas_aprox": 1, "tipo": "script", "valor": "baixo"}
- **Lacuna 12:** {"arquivo": ".github/dependabot.yml", "descricao": "GA88: faltam os grupos scorecard-action (par init/scorecard precisa da mesma versão), deps-proxy-go e deps-proxy-docker — sem eles os bumps do proxy viram PRs separadas.", "tipo": "config", "valor": "baixo"}
- **Lacuna 13:** {"arquivo": "infrastructure/preview-egress-proxy/go.mod", "descricao": "GA87: `go 1.24.0` → `go 1.27` (com .github/toolchain.json e o docker build do CI). Validar se 1.27 é desejado hoje antes de portar.", "linhas_aprox": 5, "tipo": "config", "valor": "baixo"}
- **Lacuna 14:** {"arquivo": "scripts/ci/fila-merge.mjs", "descricao": "GA49/GA50: fila de merge (bloqueio por CANCELLED/teto + CONFLICTING) + fila-merge.unit.mjs. Nada equivalente na main e nenhum workflow a chamaria — portar só junto com o workflow que a usa.", "linhas_aprox": 1, "tipo": "script", "valor": "baixo"}
- **Lacuna 15:** {"arquivo": "scripts/db-audit/verify-ledger-statements.unit.mjs", "descricao": "GA05/GA04: testes de verify-ledger-statements e validate-runtime-proof em scripts/db-audit/. A main tem scripts/ci/verify-ledger-statements.unit.mjs — conferir sobreposição antes de portar; provável duplicata de local.", "tipo": "test", "valor": "baixo"}

**`codex__publish-followup-20261021`** · *branch ainda viva no origin*  
<sub>17 lacuna(s) · verificada · **apagar: não**</sub>

O banco da trilha de busca entrou na main (RPC log_search_event de 5 argumentos, coluna client_event_id, INSERT revogado — tudo aplicado em produção), mas o frontend que usa isso ficou de fora: hoje cada clique num resultado grava uma LINHA NOVA em search_events (infla a métrica de buscas) e o tipo do resultado clicado é sempre gravado como 'other'. A tela admin "Insights de Busca" mostra duas tabelas permanentemente vazias e descarta os dois números que a RPC já devolve (tamanho médio do termo e cliques por tipo). No Talk X, o wizard da main engole o erro da consulta de conexões (falha de rede aparece como "WhatsApp desconectado"), deixa avançar o passo 1 com a consulta de audiência falhada e agenda/lança campanha mesmo com zero contatos elegíveis — a branch corrigia os três. O resto (edge de saúde da conexão, hooks de segmento, CI, docs e guards) está obsoleto: a main avançou depois de 21/10 com decisões mais novas e porta-las seria regressão.

- **Lacuna 1:** {"arquivo": "src/components/inbox/useGlobalSearchData.ts", "descricao": "Correlação busca↔clique: gera UUID (createSearchEventId com fallback getRandomValues), guarda eventId no lastSearchEvent e envia p_event_id/p_result_kind para a RPC. Sem isso cada clique insere linha nova em search_events (infla contagem de buscas) e result_kind grava sempre 'other'. Também zera a telemetria quando o termo encurta, para não atribuir clique à busca anterior.", "linhas_aprox": 130, "tipo": "front", "valor": "alto"}
- **Lacuna 2:** {"arquivo": "src/components/inbox/GlobalSearch.tsx", "descricao": "handleSelect passa o tipo do resultado: registerResultClick(result.type) em vez de registerResultClick() (linha 88).", "linhas_aprox": 88, "tipo": "front", "valor": "alto"}
- **Lacuna 3:** {"arquivo": "src/components/inbox/__tests__/useGlobalSearchData.eventos.test.tsx", "descricao": "Testes da correlação: um evento por termo, clique como update do mesmo UUID, termo curto não herda clique, ausência de crypto não envia evento.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 4:** {"arquivo": "src/components/talkx/useCampaignEditor.ts", "descricao": "Endurecimento do wizard: (a) a consulta de conexões passa a lançar o erro em vez de devolver [] (main:554 descarta), (b) connectionIsReady/audienceQueryReady entram no canProceed do passo 1 (main:874 não checa sucesso das consultas), (c) agendar/lançar falha quando snapshot.eligible <= 0 (main:981-993 segue adiante), (d) regras real_sector/real_uf barradas com mensagem antes do save, (e) expõe audienceQueryError/Loading, connectionQueryError/Loading, refetchAudience, refetchConnections. Reaproveitar o useTalkXCampaignSummary da main em vez do summarizeAudience da branch.", "linhas_aprox": 554, "tipo": "front", "valor": "alto"}
- **Lacuna 5:** {"arquivo": "src/components/talkx/TalkXCampaignWizard.tsx", "descricao": "Estados de erro/carregando no passo de audiência: role=\"alert\" + 'Tentar novamente' para falha de conexões e de audiência, role=\"status\" nos carregamentos, estados vazios ('Nenhum segmento encontrado', TalkXWhatsAppDisconnectedState) condicionados a !loading && !error, 'Contagem indisponível' no cabeçalho dos filtros, repasse de isLoading/hasError ao seletor de contatos, mais aria-pressed no SourceCard e htmlFor/id nos campos nome e descrição. NÃO portar a remoção do useTalkXCampaignSummary nem o '?? s.estimated_count'.", "linhas_aprox": 395, "tipo": "front", "valor": "medio"}
- **Lacuna 6:** {"arquivo": "src/components/talkx/TalkXContactSelector.tsx", "descricao": "Props isLoading/hasError e mensagem distinta ('Carregando contatos…' com role=status / 'Não foi possível carregar contatos. Tente novamente.') em vez de 'Nenhum contato disponível' quando a consulta falhou ou está em voo.", "linhas_aprox": 163, "tipo": "front", "valor": "medio"}
- **Lacuna 7:** {"arquivo": "src/components/talkx/__tests__/useCampaignEditor.test.tsx", "descricao": "Testes do gating: não avança com consulta falhada, não lança com zero elegíveis, erro de audiência não vira público vazio, refetch funciona.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "src/components/talkx/__tests__/TalkXMultiSegmentos.test.tsx", "descricao": "União de segmentos em UMA chamada ao servidor (não soma das estimativas). Adaptar de summarizeAudience para o caminho que a main usa.", "linhas_aprox": 1, "tipo": "test", "valor": "baixo"}
- **Lacuna 9:** {"arquivo": "src/hooks/admin/useSearchInsights.ts", "descricao": "Expor averageTermLength e searchesByKind (que a RPC search_insights já devolve em produção), remover topQueries/noResultTerms sempre vazios e validar a resposta (linha ausente, contagens negativas/não inteiras, noResults>total, clicks>total) lançando SearchInsightsError.", "linhas_aprox": 13, "tipo": "front", "valor": "medio"}
- **Lacuna 10:** {"arquivo": "src/components/admin/SearchInsightsView.tsx", "descricao": "Trocar as duas tabelas permanentemente vazias (main:223,229) pelos cards 'Tamanho médio do termo' e 'Cliques por tipo de resultado' e ajustar o resumo textual (main:237-238 conta termos que nunca existem).", "linhas_aprox": 223, "tipo": "front", "valor": "medio"}
- **Lacuna 11:** {"arquivo": "src/components/admin/__tests__/SearchInsightsView.test.tsx", "descricao": "Testes da tela com os novos cards e com resposta inválida da RPC.", "linhas_aprox": 1, "tipo": "test", "valor": "baixo"}
- **Lacuna 12:** {"arquivo": "supabase/tests/search_events.sql", "descricao": "Bloco T9 (+ rollback T8) de pgTAP para log_search_event: assinatura (text,integer,boolean,uuid,text), EXECUTE só para authenticated (anon e service_role sem), colunas com client_event_id, descarte de PII (e-mail, >=7 dígitos, token >=32), limites 3..200, p_result_count nulo/negativo, clique sem resultado ignorado, idempotência por (user_id, client_event_id) e compatibilidade da chamada de 3 argumentos.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 13:** {"arquivo": ".github/workflows/vercel-env-cleanup.yml", "descricao": "Separar token de leitura e de escrita: VERCEL_TOKEN condicional ao dry_run e step que falha quando dry_run=0 sem VERCEL_WRITE_TOKEN. Hoje a main usa sempre o readonly e documenta isso como estado consciente; exige criar o secret VERCEL_WRITE_TOKEN.", "linhas_aprox": 50, "tipo": "workflow", "valor": "baixo"}
- **Lacuna 14:** {"arquivo": "scripts/ci/vercel-env-cleanup-workflow.unit.mjs", "descricao": "Guard novo (ausente na main) das asserções de ref==main, permissions e separação dos tokens do workflow de limpeza da Vercel. Só faz sentido junto da lacuna anterior.", "linhas_aprox": 1, "tipo": "test", "valor": "baixo"}
- **Lacuna 15:** {"arquivo": "scripts/ci/talkx-status-regen-workflow.unit.mjs", "descricao": "Asserção de que o job regen só roda a partir de refs/heads/main — o workflow da main já atende (linha 52), falta só o teste que trava isso.", "linhas_aprox": 65, "tipo": "test", "valor": "baixo"}
- **Lacuna 16:** {"arquivo": "docs/talkx/README.md", "descricao": "Linha de índice para docs/talkx/ESTADOS.md, que existe na main mas não está listado.", "linhas_aprox": 13, "tipo": "docs", "valor": "baixo"}
- **Lacuna 17:** {"arquivo": "scripts/ci/marcador-specs.mjs", "descricao": "tituloBase customizável em tituloDe (e o caso de teste correspondente em marcador-specs.unit.mjs). A main mudou o arquivo em 04/11; avaliar isolado, pois o hunk da branch remove 6 linhas do contrato atual.", "linhas_aprox": 1, "tipo": "script", "valor": "baixo"}

**`fix__f1a-lote-b-useteamchatnotifications`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

PR #2080 corrigia 3 causas no alerta do chat interno: (1) canal realtime recriado ao mexer no volume + tópico único, (2) aviso de desktop saía por caminho que exige Service Worker (desligado) e nunca aparecia, (3) toda mensagem de equipe disparava um SELECT em team_conversation_members em cada cliente conectado mesmo com a conversa já no cache do inbox. As causas 1 e 2 já estão na main em forma equivalente (refs + uniqueRealtimeTopic + showBrowserNotification). A causa 3 (ler o cache do inbox antes de ir ao banco) nunca entrou na main; o commit 61a973da6 (#2182) inverteu os asserts do teste para o CI passar, deixando títulos de teste contradizendo o que verificam. Comentário de fechamento cobriu só a causa 1.

- **Lacuna 1:** {"arquivo": "src/hooks/chat/useTeamChatNotifications.ts", "descricao": "Ler o cache do inbox (useContext(QueryClientContext) → getQueryData(queryKeys.inbox(profile.id)) → members[].is_muted) antes de consultar team_conversation_members; só ir ao banco quando a conversa não está em cache. Evita um SELECT por mensagem de equipe em cada cliente conectado. Hunk pronto no dossiê (adaptar aos refs já existentes na main; members é opcional em TeamConversation).", "tipo": "front", "valor": "medio", "linhas_aprox": 35}
- **Lacuna 2:** {"arquivo": "src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx", "descricao": "Reverter a inversão feita em 61a973da6: nos 3 testes de cache voltar `not.toContain('team_conversation_members')` e remover os `h.membership = ...` injetados, para que os títulos ('não vai ao banco', 'em cache') voltem a corresponder ao comportamento verificado.", "tipo": "test", "valor": "medio", "linhas_aprox": 8}

**`hermes__robustez-primitivos-ui-2610121626bec5-2610141859e423`** · *branch ainda viva no origin*  
<sub>8 lacuna(s) · verificada · **apagar: não**</sub>

Branch portava 7 correções de robustez/acessibilidade dos primitivos de UI (dialog, skip-link, table, sparkline, avatar, visually-hidden, offline-indicator) + 360 linhas de teste. A main já resolveu 2 delas por caminho próprio (timer do offline-indicator e timer/detecção de alvo do SkipLinks, este com MutationObserver em vez de polling). Continuam de fora, e ainda fazem sentido: descrição acessível de fallback no DialogContent (leitor de tela perde o contexto do diálogo e o Radix avisa no console), tabindex=-1 no alvo do skip link (o atalho "pular para navegação" não move o foco hoje, porque o nav do Sidebar não é focável), limpeza do timer do useAnnounce (setState em componente desmontado), scope="col" no TableHead, Sparkline aria-hidden e chave estável no AvatarGroup. Nada de banco, edge ou workflow. Impacto: acessibilidade e ruído de console, sem fluxo crítico quebrado.

- **Lacuna 1:** {"arquivo": "src/components/ui/dialog.tsx", "descricao": "Injeção de descrição acessível de fallback no DialogContent (temFilhoDescricao + aria-describedby automático via useId, respeitando quem passa a prop, inclusive aria-describedby={undefined}). Ausente na main; portar POR CIMA da versão atual (que já tem a prop container do portal), não substituir o arquivo.", "tipo": "front", "valor": "medio", "linhas_aprox": 60}
- **Lacuna 2:** {"arquivo": "src/components/ui/skip-link.tsx", "descricao": "No handleClick do SkipLink, aplicar tabindex=-1 no alvo que não tem tabindex antes de focar. Hoje o atalho 'pular para navegação' não move o foco porque o <nav id=\"main-navigation\"> do Sidebar não é focável.", "tipo": "front", "valor": "medio", "linhas_aprox": 3}
- **Lacuna 3:** {"arquivo": "src/components/ui/visually-hidden.tsx", "descricao": "useAnnounce guarda o id do setTimeout(100) em ref, cancela o anterior e limpa no desmonte (hoje o timer sobrevive ao unmount e chama setState em componente desmontado).", "tipo": "front", "valor": "medio", "linhas_aprox": 5}
- **Lacuna 4:** {"arquivo": "src/components/ui/table.tsx", "descricao": "TableHead emite scope=\"col\" por padrão, com override por prop. Risco de porte: muda o papel acessível de cell para columnheader e pode quebrar testes que buscam por getByRole('cell').", "tipo": "front", "valor": "medio", "linhas_aprox": 3}
- **Lacuna 5:** {"arquivo": "src/components/ui/sparkline.tsx", "descricao": "SVG do Sparkline (decorativo) marcado com aria-hidden=\"true\".", "tipo": "front", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 6:** {"arquivo": "src/components/ui/avatar.tsx", "descricao": "AvatarGroup com chave derivada do conteúdo (src/alt/fallback + índice) em vez de key={index}.", "tipo": "front", "valor": "baixo", "linhas_aprox": 1}
- **Lacuna 7:** {"arquivo": "src/components/ui/__tests__/robustez-primitivos.test.tsx", "descricao": "Testes por papel das lacunas (a) diálogo, (b) skip link focável, (c) timer do useAnnounce, (d) scope do TableHead, (e) Sparkline aria-hidden, (f) chave do AvatarGroup. Portar SÓ esses blocos; descartar o bloco (g) (afirma polling de 1,5 s, contraditado pela main) e os casos de useOfflineStatus/timer do aviso de Tab, já cobertos em timers-unmount.test.tsx.", "tipo": "test", "valor": "medio", "linhas_aprox": 220}
- **Lacuna 8:** {"arquivo": "src/components/ui/offline-indicator.tsx", "descricao": "Resíduo sem valor prático: isOnlineRef + efeito de listeners com deps [] em vez de [isOnline]. A limpeza do timer, que era o objetivo, já está na main por outra implementação.", "tipo": "front", "valor": "nenhum", "linhas_aprox": 10}

**`hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Branch T75 (Telefonia): fazia toda animação da tela de Telefonia respeitar "reduzir movimento" via um hook central useMotionSeguro. A main já atende esse aceite por outra arquitetura: useReducedMotion por componente (CallKpiCard fade 150 ms, ActiveCallPanel 120 ms), MotionConfig reducedMotion="user" global (App.tsx) e CSS global que zera transições (accessibility.css), com testes em telefoniaMotion.test.tsx. Os 21 ajustes de mocks de teste ficaram desnecessários (main usa ...actual do framer-motion) e os dois arquivos de teste alterados (VoIPPanel, CampaignsView) foram apagados na main. Sobram só 2 detalhes cosméticos (stagger dos KPIs e fade na troca do painel lateral), preservados no dossiê.

- **Lacuna 1:** {"arquivo": "src/components/calls/CallsKpiGrid.tsx", "descricao": "Stagger de entrada dos tiles de KPI (delay i*0.03 s, teto 5 itens, 0 sob redução). Main faz só o fade de 150 ms em CallKpiCard, sem escalonamento. Cosmético; hunk portado para a convenção da main no dossiê.", "linhas_aprox": 10, "tipo": "front", "valor": "baixo"}
- **Lacuna 2:** {"arquivo": "src/components/calls/TelefoniaView.tsx", "descricao": "Fade de 120 ms na troca entre SelectedCallPanel / ActiveCallPanel / NewCallPanel (motion.div com key por painel). Main anima só o ActiveCallPanel internamente; Selected/New entram sem animação. Cosmético; risco de fade duplo com ActiveCallPanel.", "linhas_aprox": 12, "tipo": "front", "valor": "baixo"}

**`pr-213`** · *branch já não existe no origin*  
<sub>1 lacuna(s) · verificada · **apagar: não**</sub>

Hardening de segurança pós-auditoria (3 migrations: guard admin em get_identity_matrix, remoção de SECURITY DEFINER em contacts_count_by_type, revokes anon em funções internas; 2 edges: gmail-oauth sem access_token no refresh e evolution-api-proxy sem corpo bruto de erro; gate de CI layout-guard; catálogo manual de ops.hermes_change_log). Banco e edges entraram via #222 e estão aplicados em produção; o catálogo manual é obsoleto (arquivo gerado, só schema public). Falta apenas o step de CI que roda layout-guard.mjs contra o src/ real — hoje o CI só roda o teste unitário do guard com fixtures.

- **Lacuna 1:** {"arquivo": ".github/workflows/ci.yml", "descricao": "Adicionar step `node scripts/ui-audit/layout-guard.mjs` (gate de 0 violações de layout no src/ real) no job Node CI Scripts; script já existe em main e passa hoje", "tipo": "workflow", "valor": "medio", "linhas_aprox": 3}

**`pr-2550`** · *branch já não existe no origin*  
<sub>12 lacuna(s) · verificada · **apagar: não**</sub>

Talk X (Campanhas) em seis frentes. Já está na main ou foi superado: botão de busca ⌘K no cabeçalho, status "Em andamento" na paleta, testes do cabeçalho/indicador de campanha ativa e a exportação CSV+PDF do relatório (a main tem a versão X164/TL-080, melhor: com gate de permissão de download e testes). Continua faltando: (1) a barra de ações em massa na Visão geral — hoje o usuário pode marcar campanhas na tabela e a seleção não faz nada; (2) erro de permissão do banco (42501) mostrando "sem permissão" em vez de erro genérico nas telas do módulo; (3) o botão "Falar com o administrador" na tela de bloqueio de Campanhas; (4) dica do dia rotativa com seta de avanço. Nada disso toca banco, edge, workflow ou segredo.

- **Lacuna 1:** {"arquivo": "src/components/talkx/TalkXOverview.tsx", "descricao": "X081 — barra de ações em massa (Pausar/Cancelar/Excluir com rótulo 'X de Y') na Visão geral. A main já marca campanhas (selectable, selected, selectionResetKey) mas não oferece nenhuma ação: seleção sem efeito. Hunk completo no dossiê. Ressalva ao portar: o 'Excluir' da branch chamava onDelete(id) direto, sem o diálogo de confirmação usado nas ações de linha (TalkXOverview.tsx:102-112) — usar rowActions.run('delete', c) ou um TalkXConfirmDialog, como TalkXSuppression.tsx:598.", "linhas_aprox": 344, "tipo": "front", "valor": "medio"}
- **Lacuna 2:** {"arquivo": "src/components/talkx/kit/states.tsx", "descricao": "X048 — no TalkXQueryBoundary, erro com code '42501' (permission_denied do PostgreSQL/RLS) deve render TalkXNoPermissionState em vez de TalkXErrorState genérico. 4 linhas, vale para todas as telas do módulo.", "linhas_aprox": 352, "tipo": "front", "valor": "medio"}
- **Lacuna 3:** {"arquivo": "src/pages/ViewRouter.tsx", "descricao": "X048 — passar onContactAdmin={() => navigateToView('team-chat')} ao TalkXNoPermissionState da view talkx; sem a prop o botão 'Falar com o administrador' não aparece e o usuário bloqueado fica sem saída. Inclui o import de navigateToView.", "linhas_aprox": 142, "tipo": "front", "valor": "baixo"}
- **Lacuna 4:** {"arquivo": "src/components/talkx/kit/constants.ts", "descricao": "X082 — array TIPS com 10 dicas do dia (hoje a main usa uma frase fixa hardcoded em TalkXOverview.tsx:466).", "linhas_aprox": 82, "tipo": "front", "valor": "baixo"}
- **Lacuna 5:** {"arquivo": "src/components/talkx/kit/rail.tsx", "descricao": "X082 — TipCard aceita onNext e mostra a seta '›' (aria-label 'Próxima dica'); na Visão geral, índice = dias desde a época + offset manual. Precedente na main: CatalogRail.tsx:428.", "linhas_aprox": 101, "tipo": "front", "valor": "baixo"}
- **Lacuna 6:** {"arquivo": "src/components/talkx/kit/ServiceStatusSheet.tsx", "descricao": "X048 — Sheet lateral 'Ver status dos serviços' (WhatsApp por conexão, CRM 360 com hora da última sincronização, Tempo real). Só vale portar junto com a ligação do onViewStatus de TalkXCrmUnavailableState (states.tsx:175), que nenhuma tela passa hoje; isolado continua código morto.", "linhas_aprox": 1, "tipo": "front", "valor": "baixo"}
- **Lacuna 7:** {"arquivo": "src/components/talkx/__tests__/TalkXOverview.bulk.test.tsx", "descricao": "Prova do X081: barra aparece ao selecionar, rótulo 'Pausar (1 de 3)' com elegibilidade por status, seleção mantida ao trocar lista↔grade e limpa ao paginar. Só faz sentido com a lacuna X081 portada.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 8:** {"arquivo": "src/pages/__tests__/ViewRouter.talkx-permission.test.tsx", "descricao": "Prova do X048 na rota: papel 'agent' em ?view=talkx vê TalkXNoPermissionState e o botão navega para team-chat (mocka useUserRole e navigateToView).", "linhas_aprox": 1, "tipo": "test", "valor": "baixo"}
- **Lacuna 9:** {"arquivo": "src/components/talkx/__tests__/TalkXOverview.rail.test.tsx", "descricao": "Prova do X082: dica determinística pelo dia e seta '›' avançando. Contém asserção das 4 ações rápidas incluindo 'Importar contatos' — precisa ser ajustada, porque essa ação não deve ser portada (não existe aba 'contacts').", "linhas_aprox": 1, "tipo": "test", "valor": "baixo"}
- **Lacuna 10:** {"arquivo": "src/components/talkx/__tests__/ModuleHeader.test.tsx", "descricao": "3 casos que a versão da main (kit/__tests__/ModuleHeader.test.tsx) não tem: separadores da trilha, último item com font-medium, trilha do wizard. Duplicata quase completa; valor marginal.", "linhas_aprox": 1, "tipo": "test", "valor": "nenhum"}
- **Lacuna 11:** {"arquivo": "src/components/talkx/TalkXView.tsx", "descricao": "Ação rápida 'Importar contatos' / onGoTab('contacts'): OBSOLETA — não existe aba contacts em TALKX_TABS e a branch redirecionava para segments (rótulo enganoso). Não portar.", "linhas_aprox": 605, "tipo": "front", "valor": "nenhum"}
- **Lacuna 12:** {"arquivo": "docs/reconciliation/tasks/P046.json", "descricao": "Ledger de reconciliação regerado (+16,7 mil linhas). Artefato gerado; a main tem a sua versão e o ledger ao vivo é a verdade. Não portar.", "linhas_aprox": 1, "tipo": "docs", "valor": "nenhum"}

**`pr-2926`** · *branch já não existe no origin*  
<sub>23 lacuna(s) · verificada · **apagar: não**</sub>

A PR criava um dispatcher de automação local (scripts/automation.mjs + perfil de 635 registros + grafo próprio + workflow "Automação local" + doc de 712 linhas). Esse bloco, ~95% das 10,4 mil linhas, está obsoleto: o dono fechou a PR porque os agentes que a automação dirigia foram desligados e o check doctor --static travaria PRs sem relação; e o grafo próprio foi superado pelo scripts/graphify/setup.sh que já está na main e é o prescrito no AGENTS.md. Sobra um núcleo pequeno e ainda útil de endurecimento do motor de manutenção local (o fixer que formata src/ sozinho), que a main continuou corrigindo em 10-11/11 e que não tem: impedir o fixer de reescrever arquivos gerados (src/integrations/supabase/types.ts), rejeitar mudança de modo/remoção de arquivo, validar a saída do Prettier, commitar passando pelos hooks reais e criar o config.example.json que o README da main cita e não existe. Branch não pode ser apagada antes desse porte.

- **Lacuna 1:** {"arquivo": "scripts/maintenance/run.mjs", "descricao": "Nova allowedSourceFiles(): exclui do escopo do fixer autônomo arquivos gerados (generated/, __generated__/, *.generated.*, cabeçalho @generated/auto-generated) e os nomes de config.fix.exclude, sempre incluindo src/integrations/supabase/types.ts; changed() passa a falhar com 'Correção alterou arquivo gerado ou excluído do escopo'. A main não tem nenhuma proteção equivalente, então um heal pode reescrever os tipos gerados do Supabase e brigar com o types-sync.yml.", "linhas_aprox": 183, "tipo": "script", "valor": "medio"}
- **Lacuna 2:** {"arquivo": "scripts/maintenance/config.json", "descricao": "Acrescenta \"exclude\": [\"src/integrations/supabase/types.ts\"] em fix. Par obrigatório do item acima.", "linhas_aprox": 28, "tipo": "config", "valor": "medio"}
- **Lacuna 3:** {"arquivo": "scripts/maintenance/run.mjs", "descricao": "changed() lê git diff --raw e rejeita mudança de modo/tipo ou remoção de arquivo ('apenas conteúdo de texto é permitido'); hoje a main só checa escopo e numstat.", "linhas_aprox": 183, "tipo": "script", "valor": "medio"}
- **Lacuna 4:** {"arquivo": "scripts/maintenance/run.mjs", "descricao": "prettierCandidates() valida a saída do Prettier (stderr vazio, lista dentro do lote esperado, coerência entre exit code e lista) e varre em lotes de 16 arquivos com '--'; a main faz scan.output.split('\\n') ignorando stderr e exit code, aceitando lista inválida como base da correção.", "linhas_aprox": 207, "tipo": "script", "valor": "medio"}
- **Lacuna 5:** {"arquivo": "scripts/maintenance/lib.mjs", "descricao": "commitWithHooks(): commita o patch de manutenção passando pelos hooks reais do repo (lê core.hooksPath, detecta Husky, recria cada hook rastreado num diretório privado do job com PATH do node_modules/.bin). Na main o commit é feito com hooks desligados, escapando do commit-msg.", "linhas_aprox": 155, "tipo": "script", "valor": "medio"}
- **Lacuna 6:** {"arquivo": "scripts/maintenance/lib.mjs", "descricao": "readRegularDependency() (lê por descritor e confere stat antes/depois, evitando troca de arquivo entre stat e read), directoryHash() e localDependencies() (fingerprint de dependências file: declaradas no package.json/lockfiles) para decidir reuso de node_modules por symlink.", "linhas_aprox": 383, "tipo": "script", "valor": "baixo"}
- **Lacuna 7:** {"arquivo": "scripts/maintenance/config.example.json", "descricao": "Arquivo-exemplo de configuração do motor (gates lint/types/test/build, fix, limites) que o README da main já cita e que não existe no repo.", "linhas_aprox": 1, "tipo": "config", "valor": "baixo"}
- **Lacuna 8:** {"arquivo": "package.json", "descricao": "maintenance:doctor/check/heal passam a chamar sh scripts/maintenance/run.sh em vez de node scripts/maintenance/run.mjs, para não pular a trava global de flock, como o README manda.", "linhas_aprox": 11, "tipo": "config", "valor": "baixo"}
- **Lacuna 9:** {"arquivo": "scripts/maintenance/maintenance.unit.mjs", "descricao": "Testes dos itens acima (escopo de arquivos permitidos, lista do Prettier, commit com hooks, fingerprint de dependências locais). Só vale portado junto com o código correspondente.", "linhas_aprox": 1, "tipo": "test", "valor": "medio"}
- **Lacuna 10:** {"arquivo": "scripts/maintenance/README.md", "descricao": "Reescreve 9 linhas para descrever o comportamento novo (hooks reais no commit, exclusão de gerados, trava por pipe). Acompanha o porte.", "linhas_aprox": 7, "tipo": "docs", "valor": "baixo"}
- **Lacuna 11:** {"arquivo": "scripts/automation.mjs", "descricao": "Dispatcher de automação local (820 linhas) com doctor/test/check/heal/nightly/graph/install-hooks. Obsoleto: os agentes que ele dirigia foram desligados (decisão do dono no fechamento).", "linhas_aprox": 1, "tipo": "script", "valor": "nenhum"}
- **Lacuna 12:** {"arquivo": "scripts/automation.config.json", "descricao": "Perfil versionado com 635 registros manuais de scripts. Obsoleto: é exatamente o custo que motivou o fechamento (todo script novo teria de ser registrado à mão, sob pena de PR vermelha).", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 13:** {"arquivo": ".github/workflows/automation-local.yml", "descricao": "Workflow 'Automação local' (doctor --static + test) em PR/push/dispatch. Obsoleto: travaria PRs sem relação com a automação.", "linhas_aprox": 1, "tipo": "workflow", "valor": "nenhum"}
- **Lacuna 14:** {"arquivo": "scripts/graphify-local.mjs", "descricao": "Adaptador próprio de grafo (903 linhas) com venv pinada. Superado: a main já usa scripts/graphify/setup.sh (graph:setup/graph:update), que é o prescrito no AGENTS.md.", "linhas_aprox": 1, "tipo": "script", "valor": "nenhum"}
- **Lacuna 15:** {"arquivo": "scripts/graphify-local.unit.mjs", "descricao": "Testes do adaptador de grafo superado.", "linhas_aprox": 1, "tipo": "test", "valor": "nenhum"}
- **Lacuna 16:** {"arquivo": "graphify.local.json", "descricao": "Configuração do adaptador de grafo superado.", "linhas_aprox": 1, "tipo": "config", "valor": "nenhum"}
- **Lacuna 17:** {"arquivo": "scripts/automation.unit.mjs", "descricao": "Testes do dispatcher obsoleto.", "linhas_aprox": 1, "tipo": "test", "valor": "nenhum"}
- **Lacuna 18:** {"arquivo": "docs/AUTOMACAO_LOCAL.md", "descricao": "Documentação (692 linhas) do dispatcher obsoleto.", "linhas_aprox": 1, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 19:** {"arquivo": "docs/ci/README.md", "descricao": "Sobe o inventário para 22 workflows e acrescenta a ficha de automation-local.yml. Obsoleto: a main está coerente em 21.", "linhas_aprox": 1, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 20:** {"arquivo": "docs/agentes/github-ci.md", "descricao": "Troca 21 por 22 workflows e inclui automation-local na lista. Obsoleto junto com o workflow.", "linhas_aprox": 71, "tipo": "docs", "valor": "nenhum"}
- **Lacuna 21:** {"arquivo": "scripts/ci/ci-docs-baseline.unit.mjs", "descricao": "Guard passa a exigir 22 workflows. Obsoleto: quebraria o CI da main, que tem 21.", "linhas_aprox": 293, "tipo": "test", "valor": "nenhum"}
- **Lacuna 22:** {"arquivo": ".gitignore", "descricao": "Ignora /.tools/repo-automation/ e /.tools/graphify/local-state/, estado dos adaptadores que não entram.", "linhas_aprox": 138, "tipo": "config", "valor": "nenhum"}
- **Lacuna 23:** {"arquivo": "scripts/maintenance/run.sh", "descricao": "Move o state dir para $HOME/.cache e renomeia global.lock para fleet.lock. NÃO portar: regressão frente à main, que manteve XDG_STATE_HOME e endureceu mkdir/chmod no #2965.", "linhas_aprox": 3, "tipo": "script", "valor": "nenhum"}

**`resolve-2381-from-main`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Motor do Copiloto RADAR (migration, gatilho, handler no ai-jobs-worker, flag desligada) e todas as telas das Fases 4–6 já estão na main e em produção (#2828 + #3127). Falta só a montagem do painel RadarLive na caixa de digitação da Inbox (ChatInputArea): hoje RadarLive.tsx é código morto — com a flag ligada o motor grava sessões/insights e nenhum vendedor vê. Lacuna de ~10 linhas de front, sem custo externo novo (custo de LLM já aceito ao mergear #3127 e gateado pela flag).

- **Lacuna 1:** {"arquivo": "src/components/inbox/chat/ChatInputArea.tsx", "descricao": "Montar RadarLive (lazy + Suspense) após o bloco RadarPhase8to15Panel (main L220-229), com guard !logic.isMobile && !editingMessage && contactId e onDraftText={(text) => setNativeValue(inputRef, text)}; sem isso o painel RADAR Fases 4–6 nunca aparece na Inbox. Hunk pronto no dossiê.", "tipo": "front", "valor": "alto", "linhas_aprox": 10}
- **Lacuna 2:** {"arquivo": "src/components/inbox/copilot/RadarPanel.tsx", "descricao": "Corrigir mojibake no comentário de cabeçalho (L3-4): 'encãixado' -> 'encaixado', '\"ãão perturbe\"' -> '\"não perturbe\"'.", "tipo": "front", "valor": "baixo", "linhas_aprox": 2}

#### Decisão do dono — 3 entradas

**`claude__feat-E90-main-failure-notify-261101-1730`** · *branch ainda viva no origin*  
<sub>6 lacuna(s) · verificada · **apagar: não**</sub>

Branch (PR #2499, fechada pelo congelamento de features) criava aviso por WhatsApp quando workflow crítico falha na main (via Evolution GO direto do GitHub Actions) e um dedup de 1h nos comentários da issue [falha-main]. Nada disso está na main: hoje falha na main só abre/comenta issue (notifica-falha-main.yml). O workflow WhatsApp contradiz a regra vigente AGENTS.md:76-77 ("EVOLUTION_* só nas edges"; URL só via EVOLUTION_API_URL nas edges): exige o token da Evolution em secret do Actions e grava o hostname da VPS em YAML de repo público. Se o dono quiser o aviso, o caminho conforme a regra é Actions -> Edge Function -> Evolution. O dedup da issue é lacuna pequena e recuperável (com a correção apontada pelo Qodo). Os hunks de inventário 17->18 estão obsoletos (main já está em 21 workflows).

- **Lacuna 1:** {"arquivo": ".github/workflows/main-failure-notify.yml", "descricao": "Workflow novo: WhatsApp via Evolution GO /send/text ao falhar E2E logado/DB Live Guard/Deploy Edge Functions/types-sync na main, dedupe 1h por listWorkflowRuns. Ausente na main. Contradiz AGENTS.md:76-77 (EVOLUTION_* só nas edges; host hardcoded em YAML público). Se aprovado, reimplementar via Edge Function chamada pelo Actions.", "tipo": "workflow", "valor": "medio", "linhas_aprox": 125}
- **Lacuna 2:** {"arquivo": ".github/workflows/notifica-falha-main.yml", "descricao": "Dedup de 1h antes de createComment na issue [falha-main] (origin/main:62-63 sem dedup). Portar usando created_at do último comentário do bot em vez de updated_at da issue (finding Qodo).", "tipo": "workflow", "valor": "medio", "linhas_aprox": 8}
- **Lacuna 3:** {"arquivo": "docs/ci/README.md", "descricao": "Linha/seção main-failure-notify no README gerado — só se o workflow entrar (gerado por render-workflow-docs.mjs a partir do bloco # docs:). Contagem 18 obsoleta (main=21).", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 8}
- **Lacuna 4:** {"arquivo": "CLAUDE.md", "descricao": "Inventário 17->18: obsoleto, CLAUDE.md na main é só @AGENTS.md (effd6b0bb); inventário em docs/agentes/github-ci.md:75 = 21.", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 1}
- **Lacuna 5:** {"arquivo": "docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md", "descricao": "Inventário 17->18: obsoleto, main já em 21 (linha 78).", "tipo": "docs", "valor": "nenhum", "linhas_aprox": 2}
- **Lacuna 6:** {"arquivo": "scripts/ci/ci-docs-baseline.unit.mjs", "descricao": "Asserts 17->18: obsoletos, main já espera 21 (linhas 298-340).", "tipo": "test", "valor": "nenhum", "linhas_aprox": 5}

**`claude__fix-radar-fase6-cv056-shortcuts-261108-2335`** · *branch ainda viva no origin*  
<sub>5 lacuna(s) · verificada · **apagar: não**</sub>

A branch entrega a Fase 6 do Copiloto RADAR (painel flutuante na conversa, CV-051-060) com atalho Ctrl+Shift+A. A main já tem um painel da MESMA fase, feito por outro agente, com API incompatível: portar esta branch sobrescreve o hook useRadarPanel e quebra o painel que já está na main. São duas telas diferentes para a mesma função — escolha de produto, já registrada na main em PENDENCIAS.md item 2 (issue #2967) citando esta branch e a PR #2872. Agrava: o painel desta branch é casca, nada alimenta a timeline dele, então mostraria sempre "Aguardando análise da conversa"; o painel da main já está ligado ao motor. Única peça aproveitável nas duas opções: a entrada de atalho radar-toggle (Ctrl+Shift+A), que a main não tem. Hoje nenhum painel RADAR aparece na tela em produção, com qualquer das opções.

- **Lacuna 1:** {"arquivo": "src/hooks/shortcuts/defaultShortcuts.ts", "descricao": "Entrada de atalho radar-toggle (Ctrl+Shift+A, categoria chat) + inclusão em SHORTCUTS_SOMENTE_INFORMATIVOS. A main não tem nenhuma entrada radar. Reaproveitável com qualquer das duas opções de painel; com a opção A precisa apontar para toggleCollapsed, que é o único estado de abertura que aquele painel tem.", "tipo": "front", "valor": "medio", "linhas_aprox": 3}
- **Lacuna 2:** {"arquivo": "src/components/inbox/ChatPanel.tsx", "descricao": "Montagem lazy do painel RADAR no ChatPanel (Suspense + conversationId/contactName). É a peça que falta para o RADAR aparecer na tela; na main nenhum painel é montado. Monta o painel da opção B; o equivalente da opção A é montar RadarLive em src/components/inbox/chat/ChatInputArea.tsx.", "tipo": "front", "valor": "medio", "linhas_aprox": 8}
- **Lacuna 3:** {"arquivo": "src/components/copilot/RadarPhase6Panel.tsx", "descricao": "Painel flutuante da opção B (321 linhas): mini chip, modos mini/normal/foco, drawer mobile <640px, aria-live, indicador pensando com timeout, não perturbe. Concorrente do RadarPanel.tsx já na main. Só vale portar se o dono escolher B; renderiza vazio enquanto nada chamar pushInsight.", "tipo": "front", "valor": "medio", "linhas_aprox": 251}
- **Lacuna 4:** {"arquivo": "src/hooks/copilot/useRadarPanel.ts", "descricao": "Hook de estado da opção B (open/toggle, modo por conversa, thinking com timeout de 10 s, timeline de insights, mute por conversa e mute global de 30 min). Aplicar como está SOBRESCREVE o hook da main e quebra RadarLive/RadarPanel e seus testes; se portar, renomear (ex.: useRadarPanel6).", "tipo": "front", "valor": "medio", "linhas_aprox": 166}
- **Lacuna 5:** {"arquivo": "src/components/copilot/index.ts", "descricao": "Export do RadarPhase6Panel e do tipo no barrel do copiloto, com o cabeçalho passando de 'Fases 7–13' para 'Fases 6–13'. Depende de portar o painel.", "tipo": "front", "valor": "baixo", "linhas_aprox": 4}

**`claude__radar-motor-copilot-live-301030`** · *branch ainda viva no origin*  
<sub>2 lacuna(s) · verificada · **apagar: não**</sub>

Motor do Copiloto RADAR (copilot.tick, migration, worker), banco, hooks, 11 componentes e testes já estão na main via #2828 e #3127 (migration byte-idêntica renomeada para 20261115010000, aplicada em produção, capacidade semeada desligada); a main ainda melhorou o motor (parse do envelope do provedor, DECISION_ROLES, fail-closed). Falta UMA peça funcional: ninguém monta `RadarLive` na Inbox — `ChatInputArea` da main não o importa, então o painel RADAR das Fases 4–6 é código morto; quando o dono ligar a capacidade, o vendedor não verá nada. Lacuna de 7 linhas (lazy import + bloco Suspense), hunk no dossiê. Mais um mojibake cosmético no comentário do RadarPanel.

- **Lacuna 1:** {"arquivo": "src/components/inbox/chat/ChatInputArea.tsx", "descricao": "Montar RadarLive (lazy + Suspense) abaixo do RadarPhase8to15Panel quando !isMobile && !editingMessage && contactId, com onDraftText=(text)=>setNativeValue(inputRef,text). Portar só as adições (manter RadarPhase8to15Panel e ConnectionHealthBanner da main). Hunk completo no dossiê.", "tipo": "front", "valor": "alto", "linhas_aprox": 8}
- **Lacuna 2:** {"arquivo": "src/components/inbox/copilot/RadarPanel.tsx", "descricao": "Corrigir mojibake no comentário de cabeçalho (l.3-4): 'encãixado'→'encaixado', '\"ãão perturbe\"'→'\"não perturbe\"'.", "tipo": "front", "valor": "baixo", "linhas_aprox": 2}

### B.2 — Incorporadas e obsoletas

Para estas a auditoria concluiu que não há o que resgatar. O resumo de cada uma diz por quê.

#### Incorporada — 162 entradas

**`automation__inventario-estado`** — Branch automática do inventário semanal (inventario/estado/*.json) que já entrou na main via PR #2848 (squash 1c3535a04, 2026-11-09); o único "conflito" é edges.json, que a própria automação regenerou depois na main (ab657aa34, 2026-11-14, snapshot mais novo: 92 edges vs 85). Nada manual ou útil ficou de fora.

**`chore__analise-prs-261024-2325`** — Branch só despeja artefato de análise (inventário das 145 PRs abertas em 2026-10-24, #1930–#2241, em CSV+JSON, mais resumo de regras). Zero código, zero banco, zero edge, zero workflow. Os três arquivos já estão na main: prs.csv e regras-de-negocio.md byte a byte; o conteúdo do prs.json é a mesma tabela do prs.csv que a main tem (mesmos 145 registros, mesmos 15 campos), e o caminho prs.json foi reaproveitado de propósito pelo ciclo de análise atual (#2752, #3063) com PRs #2553–#2972. Aplicar o hunk apagaria o inventário vivo. Nada a recuperar; valor nenhum.

**`claude_04__clever-ramanujan-xllbpo`** — Branch do GOAL "Backend 100% operacional" (PR #2277): classifica 17 tabelas RLS-sem-policy e revoga grants de link_preview_cache, dropa ops_backup e documenta _bkp_261023, reserva migration de DROP de _bkp_261023 (pós 22/11/2026), além de manutenção de CI (replay-known-failures, asserção B.0c, SKIP_DOCKER_SHIM, timeout E2E). Tudo de valor já está na main de forma refatorada (migrations idempotentes com IF EXISTS, tombstone + _superseded para o DROP), aplicado em produção e registrado no ledger. O que falta (timeout 120 min, emoji, manifest gerado, entradas de replay para migrations agora idempotentes, SKIP_DOCKER_SHIM no DASH-091/092) foi superado de propósito pela main. Pendência operacional fora da branch: schema _bkp_261023 ainda existe em produção; DROP após 22/11/2026 é decisão destrutiva do dono.

**`claude_04__dazzling-archimedes-n9k59w`** — Branch corrigia o deploy das edge functions (erro `Could not find "@types/node"` no `deno check`) adicionando `--config supabase/functions/deno.json`. O fix já está na main, em versão mais completa, via PR #2575; o Deploy Edge Functions roda verde hoje (PENDENCIAS.md da main registra runs com success). Os dois .md da branch eram relato de sessão "aguardando validação da PR #2527" e foram superados pelo estado atual. Nada a recuperar.

**`claude_04__nice-cori-7snz6b`** — Branch da PR #2274 (retry HTTP 502 nos scripts de CI + 9 assinaturas RPC em types.ts). Tudo o que tinha valor já está na main: o retry entrou por #2432 (commit 78fe258e7, que a própria PR declara como substituta da #2274); as 9 RPCs estão em types.ts via types-sync. O único arquivo ausente (scripts/ci/fila-merge.mjs) foi removido de propósito com o workflow auto-update-pr-branch por decisão do dono em 11/11/2026 (35bb4cba5). PENDENCIAS.md e RELATORIO_CI.md da branch são relatórios de sessão de 26/10 superados pelos atuais e já arquivados em docs/_arquivo/. Nada a recuperar; branch pode ser apagada.

**`claude_05__festive-carson-ub43wu`** — Sessão de "fix CI": corrigiu as falhas dos Unit Tests (mocks de jsdom/TanStack Virtual, ARIA da paleta de comandos, notificações do chat interno, deep-link ?type= do Inbox, erro de leitura da base de conhecimento, remoção do hook morto do Talk X), ajustou 2 scripts de db-audit, reconciliou uma migration de drift e manteve um diário de CI. Todo o trabalho de engenharia já está na main — em vários pontos com implementação melhor. O resíduo não incorporado é inútil hoje: diário de CI superado, manifesto de deploy vencido, âncoras erradas no ESTADO.md, 2 mocks de teste desnecessários (os testes passam sem eles) e um patch para um script que a main apagou de propósito. Nada a recuperar.

**`claude_05__wonderful-goodall-94qjyg`** — PR #2838: move team-chat-db-validate para scripts/team-chat/, adiciona READMEs, registra suítes .unit.mjs no CI e corrige perda de dados por EAGAIN ao ler stdin em scripts/inventario/gerar-repo.mjs. Tudo já está na main; a correção de EAGAIN entrou com implementação equivalente (stream assíncrono) no commit ab657aa34 que fecha explicitamente a #2838.

**`claude__br-dossies-lote1-261031`** — Branch só de documentação de auditoria (3 dossiês + 4 entradas de progresso.json registrando branches já cobertas pela main). Todo o conteúdo está na main byte a byte, movido para docs/_arquivo/analise/ (re-landado via #2458, arquivado via #2630). Sem efeito em produto, banco ou CI. Nada a recuperar.

**`claude__br-dossies-lote2-261031`** — Branch docs-only (PR #2415): 5 dossiês de auditoria de branches + 9 entradas em analise/progresso.json. Todo o conteúdo já está na main, reaplicado pela PR #2458 (commit df4d597dc, "substitui ... #2415") e depois arquivado em docs/_arquivo/analise/ pela PR #2630. Nenhum código, migration ou workflow envolvido; nada a portar.

**`claude__br-dossies-lote4-261031`** — Branch 100% documental (1 commit): 25 dossiês de auditoria de branches em analise/dossies/*.md + atualização de analise/progresso.json. Zero código, teste, migration, edge ou workflow. Todo o conteúdo entrou na main e depois foi movido para o arquivo morto pelo PR #2630 (c570d5d46), onde está byte-idêntico. O CONFLITO mecânico é falso positivo: a pasta analise/ foi arquivada em docs/_arquivo/analise/ e o progresso.json da raiz foi reescrito por um ciclo posterior de auditoria (#2761). Nada a recuperar; sem impacto no produto.

**`claude__chore-pacote3-merge-261113-2325`** — Pacote 3 (#3048: conversas Evolution GO + desempenho da inbox, dossiês da triagem de PRs). Todo o código entrou na main pelo squash do pacote 4 (d084ca753, PR #3063); os 2 arquivos "em lacuna" são artefatos gerados (ESTADO.md e deployment-manifest.json) que a main já regenerou contra código mais novo. Nada a recuperar.

**`claude__chore-prod-readiness-261112-1421`** — Branch só de documentação (1 arquivo, docs/prod-readiness.md, 1100 linhas): o relatório de prontidão para produção com inventário provado da main @ 81f67b0db. O conteúdo já está na main desde 13/11, byte a byte: a versão criada pelo pacote #3035 (squash cb6576b2a) tem md5 idêntico ao da branch. As 665 linhas que o detector mecânico marcou como faltando são medições antigas que as rodadas seguintes (#3061, #3066, pacotes #3113/#3123) atualizaram dentro do mesmo arquivo — a main hoje tem 1857 linhas e é superset estrutural: 18/18 rotas, 55/55 vistas, 94/94 edges, 24/24 workflows, 224/224 relações, X1–X29 todos presentes, além das seções 1–5 da branch na íntegra. Nada de valor ficou de fora; não há nada a portar.

**`claude__chore-reconcile-ledger-drift-261101-2249`** — Branch reconciliava o ledger do banco: criava o arquivo da migration 20261030145126 (7 tabelas copilot + 16 policies) e registrava no replay-known-failures.json a falha esperada da 20261031100000. Ambos já estão na main (commit 587ec25f8, PR #2551) e em produção (ledger + pg_tables + pg_policies confirmados). O restante do diff da branch introduz erros de digitação em textos do JSON que a main tem corretos — não portar.

**`claude__chore-relatorio-ci-261112-0940`** — Branch só de documentação de CI (RELATORIO_CI.md §9–§11 com vitest task bhgtzypf7 verificado e PENDENCIAS.md reescrito com tabela de prova dos workflows, E2E PR #2987, zombie 409). Todo o conteúdo já está na main: PENDENCIAS.md da branch é prefixo exato do arquivo atual (main só acrescentou seções de 14/15-nov, 0 deleções); RELATORIO_CI.md difere apenas em 5 rótulos de tabela encurtados em §10.3 com mesmo status/PR/SHA. Incorporado via pacote #3035 (cb6576b2a). Nenhum trabalho perdido; PR #2990 pode ser considerada superada.

**`claude__chore-relatorio-ci-261112-1340`** — Branch só de documentação de CI (PENDENCIAS.md e RELATORIO_CI.md: registro do vitest verificado na task bhgtzypf7 e tabela de workflows). Tudo já entrou na main pelo squash do pacote #3035 (cb6576b2a); a main evoluiu depois sem perder nada da branch. Nenhum impacto em produto.

**`claude__chore-testes-edges-261112-1202`** — Branch só de testes (12 contratos Deno offline para edge functions sem teste). 11 arquivos idênticos à main; o 12º (copilot-live/index.test.ts) está na main em versão estendida: a única linha "faltante" (stub de ai_usage_logs retornando 201) foi refatorada em bloco que mantém o mesmo retorno padrão e adiciona o caso de cota diária excedida. Nada a recuperar; proteção de regressão já em produção via #3035.

**`claude__ci-deploy-functions-build-id-261114-0017`** — Passo do deploy que grava o SHA publicado como ZAPP_BUILD_ID nas edges (GET /status deixa de responder "unknown"). Já está na main, com condição mais restrita (só em deploy completo, nunca em parcial/rollback) decidida dentro do próprio pacote que a incorporou.

**`claude__feat-ci-local-espelho-261111`** — CI local (`bun run ci:local`) que espelha ci.yml e db-guard.yml na máquina. Entrou inteira na main pelo squash cb6576b2a (#3035); as 20 linhas "faltantes" são versões antigas de funções que a main evoluiu (carregarWorkflows lê o YAML do commit via git show; checagem de migration editada virou checarMigrationsEditadas com critérios iguais ao db-guard). Nada perdido.

**`claude__feat-contexto-ia-261103-0728`** — Primeira versão do "contexto vivo para agentes de IA" (gerador scripts/ai-context + workflow contexto-ia publicando inventario/ia na branch contexto-ia). A PR #2661 não foi mergeada, mas o PR #2664 (f798a8826) absorveu o gerador (ampliado e endurecido) e substituiu o workflow por contexto.yml, que publica docs/contexto na branch `contexto`. Docs, .gitignore, package.json e teste de baseline já refletem o estado novo (21 workflows, caminhos novos). O único hunk sem equivalente literal (vercel.json `deploymentEnabled.contexto-ia`) é obsoleto: a main gera um vercel.json próprio na branch publicada. Nada a recuperar.

**`claude__feat-copiloto-ddl-261101-1330`** — Branch só adiciona a migration das 7 tabelas do copiloto RADAR fases 13-15 (outcomes, objeções, uso/tokens, preferências do vendedor, pedidos de ajuda, momentos de aprendizado, notas de conversa) com RLS. Tudo já está na main (mesmo SQL, só formatação diferente) e aplicado em produção; nada a recuperar.

**`claude__feat-copiloto-edges-fases8-10-261024-1545`** — Branch criava 7 edges do copiloto de vendas (prazo, temperatura do lead, risco de perda, análise de mídia, objeções, ancoragem de preço, recomendação de produto) e as registrava no ESTADO.md. A main já tem as 7, em versão superior (validação zod da entrada, contrato de saída com envelope, testes, deps injetáveis, hooks em src/hooks/copilot que as chamam), via PR #2834 em 2026-11-10. Nada a recuperar.

**`claude__feat-copiloto-fases13-15-ddl-261024-1530`** — Migration DDL das 7 tabelas do copiloto RADAR fases 13-15 (help_requests, learning_moments, conversation_scores, outcomes, objection_catalog, usage, seller_settings) + regeneração do schema-catalog.json. Tudo já está na main: a migration entrou byte a byte idêntica como supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql (PR #2420) e está aplicada em produção com as 7 tabelas criadas; as policies abertas (USING true) da branch foram depois endurecidas de propósito na main (seller_id = auth.uid()). O catálogo da branch é snapshot antigo (2026-10-16) e o da main (2026-11-15) reflete o banco real.

**`claude__feat-evolution-rotas-pendentes-261112`** — Restaurava na Edge evolution-api as rotas find-chats, offer-call, templates da Meta e catálogo (apagadas no #2054), com telas, hook useConnectionOptions e guarda de contrato front→Edge. Tudo já está em produção via pacote #3035 (squash cb6576b2a); os 6 arquivos com diferença são versões anteriores de conteúdo que a main tem em forma mais nova (artefatos gerados, lista de rotas maior, hook com opção extra, find-status-messages restaurada).

**`claude__feat-evolution-ui-orfas-261112`** — Telas Evolution GO órfãs (presença da instância, convite/mensagens temporárias de grupo, envio de template aprovado, avisos amigáveis de recurso não suportado). Tudo já está em produção na main via pacote #3035 (squash cb6576b2a); nada a recuperar.

**`claude__feat-message-delivery-post-iniciado-261024-1719`** — Anti-reenvio duplicado de mensagem no WhatsApp quando o lease de 90s vence depois do POST ao provedor (PD-79) + código de erro estável na edge de envio (PD-80). Tudo já está na main e aplicado em produção: a migration foi renumerada para 20261111160000_outbound_post_started.sql (a versão 20261026210300 da branch colidia com outra já aplicada) e a main ainda vai além — a edge realmente chama mark_outbound_post_started, ligação que a própria branch deixou pendente ("COMPLETAR"). Produção confirma: função, coluna delivery_post_started_at e migration presentes. A triagem anterior (DECISAO_DONO) está refutada. Nada a recuperar.

**`claude__feat-message-delivery-post-iniciado-261101-1330`** — Branch fazia três coisas no envio de WhatsApp: impedir reenvio duplicado quando o provedor demora mais que o lease (carimbo do POST iniciado), dar código de erro estável no envio (número inválido, instância desconectada, limite) e permitir que o operador resolva à mão mensagens com entrega ambígua no chat. Tudo isso já está na main hoje, em versão igual ou mais estrita, e o banco está aplicado em produção. Nada a recuperar; reaplicar a migration da branch seria regressão.

**`claude__feat-message-delivery-post-iniciado-261101-1937`** — PD-79/C110: impede que uma mensagem de WhatsApp seja enviada duas vezes ao cliente quando o POST ao provedor já saiu (carimbo durável antes do POST) e dá ao operador um painel para resolver à mão as mensagens com entrega ambígua. Já está em produção: migration aplicada (20261111160000), coluna delivery_post_started_at, RPCs mark_outbound_post_started e resolve_unconfirmed_message, edge message-delivery, webhook e painel na inbox — tudo mergeado pela PR #2496 (commit 9727aaedd). A PR #2528 desta branch era um empilhamento sobre a #2496 e foi fechada pelo próprio autor; nada de negócio ficou de fora. A triagem anterior marcou DECISAO_DONO por engano: não há decisão pendente.

**`claude__feat-metas-seletor-periodo-261101-1208`** — Seletor Hoje/Semana/Mês na aba Metas (C130): título por período, faixa de datas, skeleton sem piscar 0%, prop title na GoalsTable e teste novo. Tudo já está na main pela PR #3125 (squash d4dddee87, 2026-11-14), que recuperou exatamente este trabalho.

**`claude__feat-radar-migration-261101-1550`** — Migration do motor do Copiloto RADAR (colunas em copilot_sessions/copilot_insights, semente da flag ai.capability.copilot_live desligada, trigger que agenda copilot.tick a cada mensagem do contato). O arquivo da branch está na main byte-idêntico, apenas renomeado de 20261030200000 para 20261115010000, e já aplicado em produção (função, trigger, 12 colunas e flag=false confirmados). Nada a recuperar.

**`claude__feat-radar-panels-8to15-261108-1906`** — Branch ligava o painel RADAR Fases 8-15 (objeções, catálogo, termômetro, coaching) na caixa de digitação da Inbox. A main já tem isso via PR #2809 (commit be8aa06a1, 2026-11-09), em versão superior: mesmos props mais daysSinceLastContact. PR #2820 era duplicata. Nada a recuperar.

**`claude__feat-remove-special-agent-261113`** — Remoção do rótulo morto `special_agent` do enum `app_role` (decisão do dono de 2026-11-03). Entrou inteira na main pelo pacote 5 (PR #3064, commit ab657aa34), com a migration renumerada para 20261113172000 e já APLICADA em produção: o enum hoje é admin,supervisor,agent e role_permissions não tem mais linha de special_agent. Nada a recuperar; a branch só carrega o número antigo da migration, e portar isso seria regressão.

**`claude__feat-talkx-relatorio-concluida-261112-1158`** — Talk X: campanha concluída abre o Relatório (tela 14, ?screen=report) com exportação CSV/PDF em vez do monitor, com deep link resistente a lista em erro; cancelada segue no monitor. Tudo já está na main via pacote #3035 (squash cb6576b2a).

**`claude__feat-talkx-x053-breadcrumb-261102-1130`** — Trilha de navegação clicável no monitor do Talk X (item "Campanhas" volta à lista, substituindo o botão solto "Voltar à campanhas"). A mesma funcionalidade já entrou na main em 81a8cd979 (PR #2793, 2026-11-08), em forma melhor (botão da trilha com aria-label "Voltar à campanhas" e classes h-9/hover:bg-muted/50, mantendo o teste antigo válido). Só falta uma asserção de teste do clique, de valor baixo.

**`claude__feat-talkx-x054-cmdk-261108-0100`** — X054 (⌘K com dono único: itens Talk X via useQuery com enabled, botão "Buscar (⌘K)" e trilha clicável no TalkXView, listener ⌘K duplicado removido) já está em produção pela PR #2793 (81a8cd979), que substituiu explicitamente a PR #2788 corrigindo os erros de TypeScript da branch; #2869 (e903a7e51) ainda melhorou as queryKeys para evitar envenenamento de cache. Os únicos resíduos da branch fora da main são regressões que a main rejeitou de propósito (remoção da busca de contatos no ⌘K, paddings duplicados no Talk X já removidos por #2712) ou cosméticos sem efeito (listener open-global-search num componente legado não montado no app).

**`claude__feat-talkx-x058-campaign-queue-segment-261101-2300`** — A RPC X058 talkx_campaign_queue_by_segment (totais da fila e breakdown por segmento de uma campanha Talk X) já existe na main em outra migration (20261108203000, PR #2833, que cita #2531), está aplicada em produção e é consumida pelo relatório de campanha com teste. A versão da main é a que a UI espera (inclui "Sem segmento"); a da branch excluiria destinatários sem segmento. Nada a portar.

**`claude__feat-talkx-x074-analytics-rpcs-261101-2300`** — As 3 RPCs analíticas do Talk X (heatmap hora×dia, top segmentos, ranking de campanhas) desta branch já estão na main via migration 20261108201000 (PR #2833, que cita #2529), aplicadas em produção e consumidas por TalkXAnalytics.tsx. Única diferença é formatação e ausência de COMMENT ON FUNCTION (sem valor de negócio).

**`claude__feat-talkx-x086-template-metrics-rpcs-261101-2300`** — Branch criava as 2 RPCs de métricas de templates do Talk X (X086): talkx_template_metrics(uuid) e talkx_template_library_kpis(). A main já tem ambas, reimplementadas de propósito na PR #2833 (migration 20261108202000, que cita #2530 como origem) e aplicadas em produção. Só difere a forma do payload (campos extras best_reply_rate_pct/by_category/top_used na branch), sem nenhum consumidor no front. Nada a recuperar.

**`claude__feat-teamchat-cid-261021-0758`** — Receptor do deep-link ?cid= no chat da equipe (clique na notificação abre a conversa certa). A main já tem implementação mais completa (remove cid da URL, espera lista carregar, refetch para conversa recém-criada, não desfaz seleção manual) e testes que cobrem os 4 cenários da branch; lado emissor também já passa cid. Nada a recuperar.

**`claude__feat-x051-talkx-lifecycle-2611081915`** — Branch trocava os modais locais de Pausar/Cancelar da tela "Campanha em Andamento" (Talk X) pelo diálogo único de ciclo de vida (X051). A main já tem isso desde a PR #2555 (a49ef4ad5, 13/11), em forma melhor (useTalkXLifecycleWith, reaproveitando o useTalkX já montado); a main inclusive tem teste que rejeita a forma exata da branch. Nada a recuperar.

**`claude__fix-axe-email-webkit-contrast-261101-2325`** — Fix de contraste axe (WebKit) no workspace de Email: separador "•" do cabeçalho passou de text-border para text-muted-foreground e o teste axe passou a esperar o tema dark aplicado. Ambas as mudanças já estão na main (a do componente entrou via PR #2832, commit 71dd7238d; a do e2e já existe na linha 155 do mesmo teste). Nada a recuperar.

**`claude__fix-ci-gr027-261102-0100`** — Correção de CI (GR-027): mocks do cliente Supabase em 3 testes do ChatMessagesArea e ordem de aplicação de migration no script de auditoria recuperacao-anonima. Todo o conteúdo já está na main via PR #2569 (commit 50ca61a6e); PR #2559 ficou redundante.

**`claude__fix-ci-talkx-report-test-261108-2152`** — Branch só restaurava os testes do relatório de campanha Talk X apagados pelo #2550 para destravar o CI da main. A main já recebeu em 568d3f932 (2026-11-09) uma suíte maior (12 testes vs 3) com a mesma intenção: série por dia, heatmap 7x24, três gráficos renderizados e série Conversões ausente. Nenhum impacto de negócio pendente.

**`claude__fix-ci-tests-batch2-2610-1830`** — Branch de 7 correções pequenas de CI/bugs (limpar fila de envio offline no logout, canal único de notificações do chat interno, clique da notificação, isolamento da fila offline por atendente, aria-labels de TTS). Tudo isso já está na main, em versão igual ou melhor. O único conteúdo exclusivo da branch é o último commit, que APAGOU três arquivos (ESTADO.md, useWarRoomAlerts.ts e o teste filesPeriod adversarial) — destruição, não trabalho. Nada a recuperar; apagar a branch é seguro e evita que alguém reaproveite o commit destrutivo.

**`claude__fix-claude-md-gr011-261102-0100`** — Branch só corrigia docs: lista de required checks da main de 6 para 3 (CI Gate, Build, TypeCheck) no CLAUDE.md. O CLAUDE.md da main hoje é só `@AGENTS.md` (#2762) e a seção migrou para docs/agentes/github-ci.md, que já registra exatamente os 3 checks, strict=true e CodeQL como não-required; baseline JSON também já tem os 3. Nada a recuperar.

**`claude__fix-codeql-checkout-sha-261109-1920`** — Fechar alertas CodeQL #66-70 trocando o ref dos checkouts do workflow E2E isolado por github.sha. A mesma correção já entrou na main por outro commit (32129d82b); o único resíduo da branch é texto sem acento (efeito colateral do agente), que contraria o padrão da main e não deve ser portado.

**`claude__fix-console-gmail-409-261112`** — Gmail: não repetir sync em 409 (em andamento/reauth_required), aviso de sincronização em andamento e tela oferecendo "Reconectar" quando a conta precisa de reautenticação. Tudo já está na main (via #3035, squash cb6576b2a) e a main foi além (mesma política de retry em syncLabels e guarda needsReconnect no EmailChatInbox).

**`claude__fix-console-sip-gate-261112`** — Telefonia SIP: trava "SIP não configurado" com prazo (não provisiona a cada carregamento quando o segredo falta), aba líder automática respeita a trava e botão "Reconectar linha" ignora a trava. Tudo já está na main via pacote #3035 (cb6576b2a) e evoluído em #3046.

**`claude__fix-console-status-msgs-261112`** — Restaurava a rota find-status-messages na edge evolution-api e fazia o painel do contato parar de gerar 404 no console ao buscar Status/Stories (memória por instância de "status indisponível"); via merges irmãos trazia também rotas Evolution restauradas, offer-call, templates da Meta e seletor de conexão. Tudo já está na main pelo pacote #3035 (squash cb6576b2a); o que resta na branch são docs/artefatos gerados já superados.

**`claude__fix-console-typing-closed-261112`** — Fix do inbox que eliminava o aviso duplo "Typing presence channel not subscribed: CLOSED" a cada troca de conversa (flag disposed no desmonte, removeChannel único, espera canal saindo, prop enabled no ChatPanel) mais 2 testes. Tudo já está na main via squash cb6576b2a (#3035); o CONFLICT mecânico em useTypingPresence.ts é falso positivo por reindentação do bloco dentro de open().

**`claude__fix-conversas-go-perf-261113`** — Correções da Evolution GO (recibos com aparelho/lid, editar mensagem, remover reação, envios sem cabeçalho), "marcar não lida" no Zapp e desempenho de metas/próxima ação (consultas em paralelo com cache, aba oculta não consulta) já estão todas em produção via pacote 4 (#3063, squash d084ca753). Main ainda melhorou dois pontos (allSettled nas metas, refetchOnMount na próxima ação). Nada a recuperar.

**`claude__fix-conversas-p0-p1-backend-261113`** — Auditoria Conversas P0/P1 (envio nunca cai em conexão de teste, transferência única com compare-and-set inclusive sem dono, FSM de status só por RPC com 'Aguardando' não arquivável, autor do encerramento, varredura de mensagens presas em 'enviando' e agendada em conexão caída). Tudo isso já está na main e aplicado em produção: entrou pela PR #3064 (pacote 5, merge ab657aa34) e ainda recebeu melhorias depois. O 'MISTO_CONFLITO' é falso positivo: as 4 migrações ditas ausentes estão na main com outro número (1302xx/1304xx/1305xx/1306xx viraram 1713xx/1714xx/1715xx/1716xx, porque nunca foram aplicadas e tiveram de subir acima do pacote 170000..171200), e quase toda 'linha faltando' nos arquivos TS/SQL/doc é só a string desse número. Nada a recuperar; portar qualquer trecho desta branch seria regressão.

**`claude__fix-copilot-brinde-state-261101-1500`** — Migration que cria a coluna copilot_sessions.brinde_state (estado B·R·I·N·D·E do Copilot, CV-026) para a RPC merge_brinde_state funcionar. Já está na main via PR #2815 com DDL idêntico e aplicada em produção; a única diferença são comentários em ASCII sem acento (sem efeito).

**`claude__fix-db-guard-b0c-261024-1527`** — Correção do backfill da migration de recibos/reações do chat de equipe (TC-009, assertion B.0c): impedir que o trigger de UPDATE preenchesse read_at em recibos legados ao reconciliar conversation_id. A main resolve o mesmo problema com DISABLE/ENABLE TRIGGER específico (PR #2282, commit 4efaa6db0), abordagem mais segura e já aplicada em produção. Nada a recuperar.

**`claude__fix-deno-check-config-261101-2157`** — Branch de 1 commit que adicionava `--config supabase/functions/deno.json` ao `deno check` no workflow de deploy das edges (CI). A linha exata já está na main (deploy-functions.yml:494), introduzida pela PR #2575 (commit 84b8b149e, 2026-11-02), que resolveu a mesma causa (@types/node) de forma mais completa. Nada a recuperar.

**`claude__fix-deno-check-config-261102-0630`** — Correção do typecheck das edge functions no CI (deno check --config apontando para supabase/functions/deno.json) já está na main via PR #2575 (commit 84b8b149e, mesmo dia), que resolveu o mesmo problema com escopo maior (cd + --config). Única diferença residual é texto de comentário.

**`claude__fix-department-invites-rls-261114-1200`** — Fecha furo de segurança: qualquer usuário autenticado lia códigos de convite de qualquer departamento (policy SELECT com USING(true)); passa a exigir admin, igual às policies de INSERT/DELETE já restritas. Inclui teste em Postgres descartável. Tudo já está na main (pacote 6, #3113) e aplicado em produção.

**`claude__fix-deploy-deno-frozen-v2`** — Fix de CI para destravar o deploy das edge functions (typecheck falhava por @types/node ausente). A intenção — `deno install --frozen=false` e `@types/node` declarado em `supabase/functions/deno.json` — já está na main por outras PRs (#2422, #2567). A única diferença da branch (remover o `npm install @types/node`) foi deliberadamente revertida pela main em #2855 porque o `deno install` sozinho não resolvia o erro; portar isso reintroduziria a falha. Nada a recuperar.

**`claude__fix-deploy-functions-types-node-011101`** — Branch que destravava o deploy das edge functions (deno install --frozen=false + npm install @types/node + deno check --config) e tornava o preflight do catálogo PromoGifts tolerante a timeout. Tudo já está na main com texto idêntico (commits #2567, #2590, #2855); a única linha ausente é um pin antigo do supabase/setup-cli (v3.1.0) já superado pela main (v3.2.0 via Dependabot). O arquivo .github/ci-refresh é vazio, só re-disparo de CI.

**`claude__fix-e2e-logado-w71-gr029-261102`** — A branch trocava o gatilho do workflow "E2E logado" de push na main para workflow_run após o CI/CD Pipeline passar (GR-029/W71). O mesmo GR-029 entrou na main no mesmo dia por outro PR (#2569, commit 50ca61a6e) com diff funcionalmente idêntico, e foi depois endurecido em #2717 (afd8c7ca3). Nada funcional ficou de fora; os hunks restantes são comentário, emoji ou ajuste redundante de concurrency.

**`claude__fix-e2e-mock-app-bootstrap-261024-1527`** — A branch adicionava mock do RPC app_bootstrap nas fixtures E2E do Mapa para o ProtectedRoute não travar em "Verificando permissões...". A main já faz isso desde 82e22bbb8 (2026-10-28), com mock mais completo (payload BOOT_FAKE em vez de {}) e precedência por ordem de registro em vez de alterar o lookahead do catch-all. Nada funcional a recuperar; só o comentário de cabeçalho não cita app_bootstrap (cosmético).

**`claude__fix-e2e-onboarding-modal-oculta-261114-0709`** — Fixture E2E do onboarding (gotoOnboardingContacts) passava a aceitar elementos sob aria-hidden do WelcomeModal via includeHidden:true em main/heading/tab. A main já tem exatamente isso pela PR #3071 (commit 58f1713ba), com texto diferente e escopo até mais estrito (tab Todos dentro do main). Nada a portar.

**`claude__fix-e2e-telefonia-teclado-261101-1558`** — Estabilização do E2E de Telefonia (Firefox GR-012): esperar o teclado numérico visível em abrirDiscador antes de clicar nos dígitos. A única linha da branch já está na main, entregue pela PR #2522.

**`claude__fix-eslint-no-secret-compare-261110-2350`** — A regra de lint que proíbe comparar credencial com === estava acusando falso positivo em teclas do teclado (Escape, Enter, Ctrl), o que forçava desativar a regra em telas do Talk X. O conserto da regra, o teste que o protege, o registro na CI e a limpeza das telas já estão todos na main. Nada a recuperar: as duas "lacunas" apontadas pela máquina são ruído de arquivo gerado (baseline de lint) e um caminho de arquivo que a main renomeou de propósito — portar a linha da branch pioraria a documentação.

**`claude__fix-esm-sh-import-regression-261108-2319`** — Branch trocava imports esm.sh por npm: em 2 edges e restaurava o teste truncado do relatório de campanha Talk X. As duas edges já estão idênticas na main (via #2865, 2026-11-11; só aspas diferem) e o teste foi recriado na main com 12 casos (568d3f932 + #3035) cobrindo as mesmas intenções da branch (3 casos) e mais. Nada a recuperar.

**`claude__fix-esm-sh-regression-261108-2320`** — Branch trocava o import esm.sh por npm: em external-db-proxy e cleanup-rate-limit-logs (evita falha "Integrity check mismatch" no deploy das edges). A main já tem exatamente essa troca via PR #2865 (commit 71123cc07), que ainda atualizou o deployment-manifest.json. O restante do diff da branch (-74 linhas) é só remoção de comentários de documentação de segurança e troca de aspas — sem efeito funcional e sem valor; a main mantém os comentários.

**`claude__fix-esm-sh-regression-261108-2340`** — Branch trocava o import de @supabase/supabase-js de esm.sh para npm: em 2 edges (external-db-proxy, cleanup-rate-limit-logs) e regenerava o deployment manifest. A main já recebeu exatamente esse fix via PR #2865 (commit 71123cc07) e o manifest da main já foi regenerado várias vezes depois, consistente com os fontes atuais. PR #2868 era duplicata; nada a recuperar.

**`claude__fix-evolution-instance-bypass-261112`** — Edge evolution-api: validar instância usada, codificar groupJid/number, não vazar erro interno, restaurar rotas (find-status-messages, offer-call, templates Meta, catálogo) e degradar Status/Stories no painel do contato. Tudo já está na main via pacote #3035 (squash cb6576b2a); as 6 "lacunas" mecânicas são reindentação, âncoras/coberturas de docs regeneradas e manifest gerado.

**`claude__fix-evolution-integra-cadeia-261113-1052`** — Branch integradora da cadeia Evolution (#3008→#3020→#2999→#3024, PR #3030): restaura rotas da evolution-api (status, chats, offer-call, templates Meta, catálogo), valida groupJid/number, esconde erro interno no 500 e degrada Status/Stories no painel do contato. Tudo entrou na main pelo pacote #3035 (cb6576b2a); o que diverge hoje é só artefato gerado (manifest, âncoras do ESTADO.md, números de cobertura) e evolução posterior da própria main (useConnectionOptions ganhou onlyConnected; connect da GO reescrito no #3045).

**`claude__fix-evolution-rotas-orfas-261112`** — Restaurava 8 rotas da Edge evolution-api que o front chamava e respondiam 404/403 (set-settings, get-settings, get-webhook, set-presence, send-template, mark-unread, invite-info, toggle-ephemeral) e criava guardas de teste front→roteador. Tudo já está na main (pacote #3035, cb6576b2a) e foi além: find-status-messages e mais 7 rotas também cobertas pela guarda.

**`claude__fix-external-db-bridge-column-injection-261108-2319`** — A correção de segurança que esta branch (PR #2879) trazia — validar nome de coluna e operador antes de repassar `params.filters`/`params.order` ao cliente service_role da edge `external-db-bridge`, que ignora RLS — já está na main, em versão estritamente mais forte, trazida pelo commit dac285f62 (#3138): além do `validIdentifier` da branch, a main bloqueia nomes de controle do PostgREST (select/or/and/not/order/limit/offset/on_conflict/columns), limita filtros (20) e itens de `in` (1000), exige valor escalar e escapa aspas na lista do `in`. O teste `filters-validation.test.ts` da branch está byte a byte na main e cita #2879 no cabeçalho. As demais diferenças são artefatos: `scripts/ci/deno.lock` é o mesmo JSON apenas minificado (igualdade semântica comprovada) e `deployment-manifest.json` são hashes gerados que a main já tem corretos. Atenção: a branch está atrás da main e seu último commit (bc00f4027) reaplicou a validação FRACA por cima da endurecida que veio num merge de main — mergeá-la hoje seria regressão de segurança e quebraria o próprio teste, que importa `parseFilters`. Nada a recuperar.

**`claude__fix-external-db-bridge-validation-261108-2335`** — Branch endurecia a edge external-db-bridge (rejeitar coluna/operador inválidos com 400) e restaurava o teste truncado de TalkXCampaignReport (X164). A main já tem a validação da edge em versão mais forte (SEC-Z018 + #3138: nomes reservados PostgREST, limite de filtros, validação de valor/in/is) e o teste foi restaurado por outro commit com 12 testes cobrindo a mesma intenção. Manifest da branch é obsoleto (hashes de código antigo; main já regenerou e o sha bate com o arquivo atual).

**`claude__fix-fila-merge-retry-json-261101-1605`** — Branch (PR #2492) duplicava a PR #2447: retry em fila-merge.mjs para JSON truncado, mock de getBoundingClientRect no teste de paginação do inbox e docs CI de 2026-10-31. Tudo entrou na main em 3617a2acd (#2447, 2026-11-01). O script fila-merge.mjs foi depois removido de propósito (#3113, 2026-11-14) porque o dono desativou a fila serial auto-update-pr-branch em 11/11 (docs/agentes/github-ci.md:58-62). Docs já arquivadas em docs/_arquivo/. Nada a recuperar.

**`claude__fix-fila-offline-sem-dono-261025-2110`** — Branch-coletora de ~100 commits (fila de envio offline sem dono + correções de inbox, Talk X, admin, segurança e testes). O fix que dá nome a ela e a migration estão na main e em produção. Nenhuma das 25 lacunas é trabalho perdido: 19 arquivos já estão na main reescritos/renomeados (frequentemente superiores), 3 ficaram obsoletos porque a main corrigiu de propósito em sentido contrário (notadamente templates de WhatsApp: a branch travava o supervisor, mas a RLS de produção permite supervisor) e 4 são artefatos gerados. Nada a portar; branch pode ser apagada.

**`claude__fix-gmail-409-integra-261113-1102`** — Gmail: sync não repete chamada em 409, UI avisa "sincronização em andamento" e conta com sessão expirada (reauth_required) recebe pedido de reconexão em vez de "em andamento". Tudo já está na main (pacotes #3035 e #3046), que inclusive foi além (guarda extra e teste adicional).

**`claude__fix-gmail-oauth-token-expose-20261108-1900`** — Fix de segurança: a edge gmail-oauth (action refresh) deixava de devolver o access_token do Google ao navegador, retornando só expires_at. O comportamento já está em produção na main pelo commit 623f37bc1 (SEC-Z017, 2026-11-12). O que a branch tem a mais são 2 linhas de comentário e um deployment-manifest.json desatualizado (artefato gerado).

**`claude__fix-gr011-required-checks-311031`** — Branch docs-only (1 commit útil, 19821da9) que corrigia no CLAUDE.md a contagem de required checks da main de 6 para 3 (🏗️ Build, 🔎 TypeCheck, ✅ CI Gate). A mesma correção entrou na main em ac04c5c03 (#2565, 2026-11-02); depois o CLAUDE.md virou só `@AGENTS.md` (effd6b0bb, #2762) e a tabela canônica com os 3 checks vive hoje em docs/agentes/github-ci.md:31 e em scripts/ci/github-settings-baseline.json. Nada a recuperar.

**`claude__fix-gr016-playwright-workers-011101`** — Fix GR-016 (Playwright com 2 workers também no CI, para o Email fixture não estourar timeout) já está na main via PR #2560 (commit a7a53f567, mesmo dia). A branch não traz nada além disso: as outras diferenças são acentos em comentários e um arquivo vazio `.github/ci-refresh` usado só para re-disparar o CI da PR #2536.

**`claude__fix-grants-baseline-pos-2822-261111`** — A branch queria impedir que a chave de servidor (service_role) executasse a RPC mark_pause_investigated, editando uma migration já aplicada (inócuo em produção). A main entregou o mesmo efeito do jeito certo, via migration nova 20261112160000 (PR #3027), já aplicada; produção confirma service_role sem EXECUTE e authenticated com EXECUTE. Nada a recuperar.

**`claude__fix-high3-fk-indexes-261101-1830`** — Branch criava 48 índices em colunas de chave estrangeira (HIGH-3 da auditoria de performance). A main já tem a mesma migration (20261031170000_high3-fk-indexes.sql) com os mesmos 48 CREATE INDEX; a diferença é só formatação (1 linha por statement na main, 2 linhas + 4 comentários de cabeçalho na branch). A migration está registrada no ledger de produção e os 48 índices existem no banco. Nada a recuperar.

**`claude__fix-inventario-vault-cron-edges-261111-0315`** — Corrige falso positivo do inventário de edges: funções chamadas só por pg_cron com URL no Vault (talkx-scheduler, talkx-storage-purge) apareciam como "sem chamador". Fix, teste, ripgrep na CI e inventário regenerado já estão na main (via #3064, commit ab657aa34), em versão melhorada (ignora menções só em comentário SQL).

**`claude__fix-lint-mediamigration-service-261101-1250`** — Extração da lógica de banco do MediaMigrationTool (admin) para src/services/mediaMigration.service.ts, para passar no lint no-restricted-imports; sem efeito funcional para o usuário. A mesma extração já entrou na main pela PR #2816 (cf79d70dd, 2026-11-10), inclusive âncoras em ESTADO.md/FEATURE_REGISTRY.md. Única diferença restante é a estratégia de mock do teste de progresso, com asserções idênticas e teste da main verde no CI.

**`claude__fix-merge-contato-telefone-secundario-261114-0000`** — Fix da mesclagem de contatos que travava (23505 em contacts_phone_key) quando o usuário escolhia manter o telefone do contato secundário: reordena o UPDATE do primário para depois do DELETE dos secundários em merge_contacts_atomic, mais teste offline em scripts/db-audit. Tudo já está na main (pacote 6, #3113) e aplicado em produção.

**`claude__fix-migration-drift-20261102012200-261102-0900`** — Branch só adicionava o arquivo da migration 20261102012200 (convites de departamento: só admin cria/apaga; RPC create_department_invite exige admin). A main já tem a mesma versão com outro nome (20261102012200_department_invites_restringe_escrita.sql, commit d45033e81, PR #2570), com DDL idêntico; produção tem a versão no ledger, as 4 policies e a função conforme a migration — e versões posteriores da main (20261108090000 search_path, 20261114121000 SELECT admin) superam a da branch. Mergear criaria versão duplicada em supabase/migrations.

**`claude__fix-multiplix-retomar-seguro-261114`** — Multiplix: "Retomar" confirma a retomada pela mudança de status no servidor (sem esperar o lote inteiro e cair no timeout do gateway) e disparo legado pausado sem fila passa obrigatoriamente pelo "Iniciar" com confirmação (banco e worker recusam o atalho). Tudo já está na main (pacote 6, #3113) e a migration está aplicada em produção.

**`claude__fix-n011-dinamico-261021-0759`** — Branch ajustava o teste offline do guard N-011 (dedup de policies de storage). O commit útil original (0913cfeb5, teto dinâmico por domínio) foi superado pela reescrita do arquivo no #2156 (4b9585052, 2026-10-21) e a própria branch foi depois sincronizada com a main (77de63cb9). Hoje o tip difere da main apenas em 2 linhas de comentário reformatado; zero código perdido. Teste roda verde na main (15 pass / 0 fail).

**`claude__fix-pd79-resolve-somente-sending-261112-1005`** — PD-79: resolução manual de mensagem não confirmada só para mensagem em 'sending' com lease vencido (edge message-delivery, painel de não confirmadas na UI, migration da RPC resolve_unconfirmed_message). Tudo entrou na main pelo pacote #3046 (squash f32855df6) e a migration 20261112170000 está aplicada em produção. As 10 linhas de lacuna são artefatos gerados (âncoras de linha no ESTADO.md e hashes do deployment-manifest.json) já superados por versões mais novas na main.

**`claude__fix-reconcilia-261026-sem-ci-261102-0912`** — Branch sem CI que duplica trabalho já mergeado na main pela PR #2615 (commit 4908feacd, 02/11/2026): criar a migration reservada 20261026240300_drop_bkp_261023.sql, registrar 3 falhas esperadas do replay local e corrigir a asserção B.0c do teste TC-009 (recibos/reações do Team Chat). Nada a recuperar: as diferenças que restam são evolução deliberada da main depois do merge (guards de idempotência nas migrations 220300/230300, tombstone do DROP destrutivo) mais uma corrupção de arquivo na própria branch — o teste team-receipts-reactions-conversation-id.test.sh está truncado em 5.933 bytes contra 28.684 na main, com lixo binário dentro. Restaurar qualquer coisa dela pioraria a main. Branch pode ser apagada.

**`claude__fix-reconcilia-migrations-20261026-261101-2230`** — Branch criava o arquivo da migration 20261026240300 (DROP do schema de backup _bkp_261023), registrava 3 falhas esperadas no replay local e corrigia a asserção B.0c do teste TC-009. O mesmo trabalho entrou na main pela PR #2615 (4908feacd). Os deltas restantes são ruído (emoji no ci.yml, escape de aspas no teste) ou foram superados de propósito na main (guards IF EXISTS nas migrations 220300/230300 dispensaram as entradas de replay; o DROP ativo virou tombstone + cópia em _superseded/ para não repetir DDL destrutivo). Nada a recuperar.

**`claude__fix-revogar-grants-escrita-anon-261025-2115`** — Branch queria tirar do usuário anônimo o poder de inserir/alterar/apagar/truncar em todas as tabelas públicas, preservando só o INSERT do fluxo "Esqueci a senha". Isso já está na main e aplicado em produção por outras duas migrations; em produção o anon só tem INSERT em password_reset_requests. O arquivo da branch ainda colidiria com uma migration já existente de mesma versão (20261026220300_classificar_rls_sem_policy). Nada a recuperar.

**`claude__fix-rls-department-invites-261101-2222`** — Convites de departamento só criados/apagados por admin, via RPC create_department_invite gravando em department_invitations (tabela que o aceite lê). Tudo entrou pela PR #2570 (commit d45033e81) e está aplicado em produção; a regra está documentada em docs/agentes/regras-dominio.md. Só falta 1 linha cosmética na tabela do README do módulo.

**`claude__fix-rls-update-org-261101-1420`** — Fechamento do achado de auditoria CRITICAL-2 (falso positivo: sistema single-tenant): migration que adiciona WITH CHECK explícito (= USING) em 8 policies UPDATE (contacts, calls, message_templates, payment_links, sales_deals, talkx_campaigns, talkx_recipients, talkx_templates), sem efeito comportamental. A main já contém o mesmo arquivo com SQL idêntico (formato condensado do ledger, sem comentários) e a migration está aplicada em produção com as 8 policies com with_check preenchido.

**`claude__fix-separator-contrast-261108-1930`** — Fix cosmético no cabeçalho da inbox de email: separador "•" entre a conta ativa e o contador de não lidos passou de text-border (quase invisível) para text-muted-foreground, mais um comentário explicativo. Tudo já está na main via PR #2832 (commit 71dd7238d). Sem efeito pendente para o negócio.

**`claude__fix-talkx-command-cache-261108-2320`** — A branch isolava as queryKeys da paleta Ctrl+K do Talk X (campanhas, segmentos, templates) para o cache reduzido da paleta não corromper as telas completas. A main já faz exatamente isso via PR #2869 (commit e903a7e51), com subchave 'cmd-palette' em vez do sufixo '-palette' — abordagem equivalente e até melhor (mantém a família de chaves, então as invalidações das telas ainda alcançam a paleta). Nada a recuperar.

**`claude__fix-talkx-report-test-suite-261108-2355`** — A branch restaurava a suíte de testes do relatório de campanha Talk X que o PR #2550 apagou (CI com "No test suite found"). A main já resolveu isso com uma suíte maior (commit 568d3f932, 12 testes vs 3 da branch), cobrindo agrupamento por dia/hora no fuso, mapa de calor 7x24, os três cartões do relatório e ausência da série Conversões; os componentes individuais têm testes próprios. Nada relevante ao negócio ficou de fora.

**`claude__fix-talkx-wizard-remonta-rascunho-261114-0715`** — Talk X: evitar que o primeiro autosave de uma campanha nova remonte o editor e descarte o que o usuário mudou depois (flaky E2E webkit talkx.spec.ts:213). O mesmo defeito, no mesmo ponto, já foi corrigido na main pela PR #3073 (4432834d6) reaproveitando localDraftRouteId, e refinado pela #3087 (6423dc237); os dois cenários do teste novo da branch já têm teste equivalente em TalkXView.route.test.tsx. A linha de ESTADOS.md é gerada e a main já está regerada com números mais novos.

**`claude__fix-talkx-x006-test-limites-261101-2130`** — Branch só adicionava 4 testes unitários de limitsPayload (segundos→ms, janela HH:mm→HH:mm:00, janela vazia→null) no Talk X. Todas as asserções já existem na main em outros arquivos de teste (TalkXLimitsDialog.test.tsx, TalkXCampaignRunning.limits.test.tsx, talkxLimits.test.ts), que inclusive cobrem mais (bug do Math.max silencioso, lista branca da RPC). Nada a portar; a única diferença residual é 1 linha de comentário cosmético.

**`claude__fix-talkxcampaignreport-tests-261109-0400`** — Branch criava a suíte real de testes (12 casos) do relatório de campanha Talk X para destravar o CI. A main já tem os mesmos 12 testes byte a byte (commit 568d3f932) mais um 13º teste de falha de PDF, com a fixture tipada em vez de `as any`. Nada a recuperar; a branch pode ser apagada.

**`claude__fix-team-chat-deeplink-261108-1932`** — Deep-link ?cid= do Chat da Equipe (notificação abre a conversa certa, limpa a URL, recarrega a lista uma vez e descarta sem tirar o usuário da conversa aberta). Tudo já está na main (pacotes #3035 e #3046), e a main ainda corrigiu o caso de perfil não carregado (isPending). Nada a portar.

**`claude__fix-telefonia-firefox-gr012`** — Correção de flake do E2E de Telefonia no Firefox (GR-012): esperar o teclado numérico ficar visível em abrirDiscador antes do primeiro clique. As 2 linhas da branch já estão na main, idênticas, via PR #2522.

**`claude__fix-templates-supervisor-knowledge-261025-2110`** — Lote de 101 commits (templates WhatsApp só graváveis por admin/supervisor, Base de Conhecimento sem travar, erro visível em painéis, Talk X Segmentos/campanha pausada/ponte Singu, fila offline por usuário, reação única por autor, PhoneInput E.164, dezenas de testes). Tudo já está na main — em vários pontos a main foi além (tela de relatório do Talk X, tolerância de relógio nas conquistas, RPC de arquivamento em lote, fila offline mais rígida). Nada a recuperar; migration do KPI já aplicada em produção.

**`claude__fix-testes-unitarios-minimo-251025-1230`** — Branch (PR #2249) corrigia 3 testes unitários vermelhos (tooltip do HighContrastToggle, mock de canal em TalkXA11yNomePapel, nome acessível dos selects Categoria/Status do editor de template) e 2 fixes de runtime: logout esvazia a fila de envio offline e o canal de notificações do chat de equipe usa tópico único + preferências por ref (HZ5-09). Tudo já está na main com texto diferente mas mesma intenção, trazido pelo commit e1f2ee4dd (2026-10-27). Nada a recuperar.

**`claude__fix-types-rpc-ausentes-251025-1230`** — Branch adicionava manualmente 9 assinaturas de RPC em src/integrations/supabase/types.ts. Todas as 9 já existem na main, geradas automaticamente a partir do banco (commit 21e828e43, #2357, 2026-10-30); transfer_conversation na main está até mais completa (p_expect_unassigned, #3070). As 20 linhas "faltantes" são só diferença de formato do gerador (Args: never vs Record<PropertyKey, never>, sem "| null"). Nada a recuperar.

**`claude__fix-unit-tests-createlogger-261019-1620`** — Branch de correção de CI (PR #2110): adicionava o mock `createLogger` em 20 testes unitários e `PGUSER=postgres` num step do db-guard. Os 20 testes já têm na main mocks `createLogger`/`getLogger` mais completos (com `withCorrelation`), e a necessidade do PGUSER é atendida pelo docker-shim E47 (`POSTGRES_SERVICE_USER=postgres`), com db-guard e ci.yml verdes em main. Nada a recuperar.

**`claude__fix-unit-tests-main-261019-1500`** — Branch de 1 commit (PR #2097, fechada 01/11) que só queria fazer 3 testes unitários da main passarem: expor `error` no hook da Base de Conhecimento, marcar `lead_origin` como "em breve" e bloquear `real_sector`/`real_uf` nos filtros de segmento Talk X. Tudo isso já está na main (commits e1f2ee4dd, 0b77f8641/#2335, a0e21b651, a6fbadfa3/#2240), em forma igual ou melhor. A única mudança da branch ausente da main é um bug (escapar `|` em `quoted` transforma `a|b` em `a\"b`), apontado pelo Qodo e corretamente rejeitado. Nada a recuperar.

**`claude__fix-z011bc-timing-safe-261018-1855`** — Branch (PR #2091) trocava comparação de segredos por timingSafeStringEqual em duas edges (searchbox-budget-alert, whatsapp-webhook) e tipava reason_code da blacklist Talk X como union. As duas edges já estão idênticas na main via PR #2308 (com testes); o hook alvo da tipagem foi removido de propósito como código morto e a mesma union vive hoje em TalkXSuppression.tsx. Nada a recuperar; duplicata de #2308.

**`claude__focused-hopper-qhavw1`** — Sessão fix/ci-workflows (PR #2586, fechada 2026-11-02): timeout e caminho não-fatal no preflight PromoGifts do deploy de edges, @types/node para o deno check, e2e-logado disparado após CI verde na main, mocks em 5 testes, e dois relatórios de sessão (PENDENCIAS.md, RELATORIO_CI.md). Todo o código já está na main em versão igual ou superior (PRs #2569, #2575, #2590, #2855, #2717, #2100); os relatórios foram superados por reescritas posteriores. Nada a portar.

**`claude__perf-bundle-inicial-261113`** — Otimização do bundle inicial (Radix e date-fns fora do first paint, controles de alto contraste carregados sob demanda) para a tela abrir mais rápido. Tudo já está em produção via PR #3064 (commit ab657aa34): 7 de 9 arquivos idênticos byte a byte; nos outros 2 a main adotou de propósito uma variante melhor (vendor-ui + vendor-radix, date-fns agrupado) porque a versão literal da branch estourava o teto de total-assets — a main documenta isso citando a própria PR #3034. Nada a portar.

**`claude__test-e2e-contatos-fab-261021-0819`** — Spec E2E deslogada do FAB de Contatos (390x844) + mocks de app_bootstrap/health nos fixtures. Tudo entrou na main em 82e22bbb8 (2026-10-28, integração do PR #2317) com variante mais estrita: mocks centralizados em mockAppShell e teste de toque no canto do FAB além do centro. Nada a recuperar.

**`claude__test-e2e-suite-completa-261104-1428`** — Branch de trabalho da PR #2716 (suíte E2E completa no ambiente isolado: controller `suite <grupo>`, HTTPS/TLS local com probes negativos, verificação de providers, fixture de onboarding isolado, teste de corrida em detect-new-device, tarefas-quadro no Chromium público). Tudo entrou na main via #2716/#2717/#2719 e foi evoluído depois (3 grupos → 5 grupos com shards 1/3-3/3, network-proof, cache do Bun com escopo). Nenhuma lacuna útil.

**`claude__test-e2e-tls-diagnostico-261104-1340`** — Branch que exige HTTPS verificado no E2E isolado (CA por execução, sondas Node/Bun/browsers/Edge, diagnóstico TLS redigido) e move tarefas-quadro.spec.ts para o projeto Chromium deslogado. Todo o conteúdo entrou na main pela PR #2716 (merge f32223dda, 2026-11-04), que é um superconjunto desta branch: 17 dos 21 arquivos são byte-idênticos ao merge de #2716; os 4 restantes (tls.mjs, dois unit tests, README) foram deliberadamente refinados em #2716 (leaf 'untrusted' assinado por uma segunda CA em vez de autoassinado). Nada a recuperar.

**`claude__test-e2e-webkit-tls-261104-1430`** — Branch de 2026-11-04 que exigia HTTPS verificado no E2E isolado (CA local, prova de rejeição TLS em node/bun/3 navegadores/edge), diagnóstico de falha WebKit antes do teardown e instrumentação E71 do picker de localização. Todo o conteúdo entrou na main pelos PRs #2716 (f32223dda) e #2717 (afd8c7ca3) no mesmo dia; a main evoluiu os mesmos arquivos depois (certificateNavigationFailure, 49 casos de teste, mais módulos), o que gerou os CONFLICT mecânicos. Nada a recuperar.

**`claude__test-toque44-seletores-261021-0853`** — Branch fazia o teste E2E de alvos de toque 44px voltar ao verde (seletor 'Fechar' do dialog, mock da RPC app_bootstrap com matriz de permissões e sonda /auth/v1/health). Tudo isso já está na main pelo commit 82e22bbb8 (2026-10-28), em versão mais completa (mock parametrizado por role/onboarding). Sobra só um comentário de 3 linhas sem efeito em execução.

**`claude_pink__pensive-keller-kjgdal`** — Fix de segurança do CodeQL (#64/#65) no gerador de contexto de agentes: sanitizador de regex passou a escapar barra invertida. A main já contém a correção em forma mais ampla (escapa todos os metacaracteres de regex), com teste unitário e o mesmo fix no generate.py. Nenhum impacto pendente para o produto.

**`codex__diagnostico-e2e-mapa-20261028`** — Lote de fixes de Contatos (FAB, barra de lote, topo sem cabeçalho), status chips do inbox por contagem filtrada, cache de não-lidos do Team Chat e mocks E2E do Mapa. Tudo já está em produção via squash da PR #2317 (commit 82e22bbb8, 2026-10-28), da qual esta branch é ancestral direta.

**`codex__fix-lint-phone-settings-20261101`** — Branch de correção de lint/typecheck (atributo aria-label duplicado no botão de dispensar alerta de fila + ajuste de teste da inbox). O teste está byte-idêntico na main e o aria-label duplicado foi removido na main pelo commit 2ebe682c1 (2026-11-08). Única diferença: a main manteve o label sem o nome da fila (cosmético/a11y, valor baixo, opcional).

**`fix__contacts-race-condition-useLayoutEffect`** — Fix da race condition no formulário de contatos (ref de endereço vigente atualizado via useLayoutEffect antes da resposta da geocodificação) já está em produção, byte a byte idêntico, via PR #2608 (commit 69da65ddf). O resto da branch é só log de status em PENDENCIAS.md, cujo conteúdo foi arquivado em docs/_arquivo/PENDENCIAS.md e a raiz reescrita de propósito (#2630). Nada a recuperar.

**`fix__f1a-framer-motion-mock-voicechangerpicker-20261018`** — Correção de teste unitário: o mock de framer-motion em VoiceChangerPicker.aria.test.tsx precisava exportar useReducedMotion para o teste de acessibilidade do botão "Gravar áudio" rodar. A main já tem exatamente esse export (e um mock mais robusto com importOriginal), entregue pelo commit e1f2ee4dd que destravou o CI Gate. O restante da branch é só reformatação prettier de uma linha. Nenhum impacto em produção; nada a portar.

**`fix__f1a-logger-ttsvoice-mock-arquivos-conversa-20261018`** — Lote F1a: completar os mocks de @/lib/logger e useTextToSpeech (importOriginal + LOCAL_VOICE_ID) no teste "Ver na conversa" da aba Arquivos. A main já tem exatamente esse mock desde a5760922c (2026-10-23); o mock de logger já existia no merge-base. As 3 linhas exclusivas da branch são corrupção sintática do commit de "resolve conflict" (0fd17f8d1), não trabalho perdido.

**`fix__f1a-lote-b-admin-audit-page-size`** — Branch só corrigia 3 testes de AdminView cujo mock de useAdminData não exportava AUDIT_PAGE_SIZE/MIN_PASSWORD_LENGTH. A main já tem as duas chaves nos 3 arquivos (commit e1f2ee4dd, 2026-10-27). Única diferença residual é uma vírgula final em um expect — cosmética, sem efeito em teste ou CI.

**`fix__f1a-lote-b-audiomemes-storage-path`** — Fix PK-16/PK-17: upload de áudio meme passa a gravar na pasta do próprio usuário (`<uid>/meme_...`) para respeitar a policy por pasta do bucket `audio-memes` (atendente comum recebia 42501), com guard "Sessão expirada" e teste. Tudo já está na main com texto diferente (estilo compacto em vez de Prettier); as 216 linhas de "lacuna" são reformatação Prettier e uma variante do mock Realtime no teste.

**`fix__f1a-lote-b-authprovider`** — Branch só consertava 2 testes vitest que quebravam por falta de AuthProvider (mocks de useUserRole/useAuth/useGlobalIncomingMessageAlerts/createLogger). Os mesmos mocks já estão na main desde e1f2ee4dd (2026-10-27, "destrava o CI Gate"), em versão igual ou mais completa. O resto do diff é reformatação prettier sem efeito em CI nem em comportamento.

**`fix__f1a-lote-b-batch10`** — Branch de 1 arquivo (teste de paginação do Gmail antigo). Única mudança com conteúdo: mock de supabase.rpc para a RPC search_email_threads no setup do teste — já está na main (linhas 123-124 do arquivo, via commit e1f2ee4dd de 2026-10-27). O resto (~95% do diff) é reformatação Prettier sem efeito e sem gate no repo. A main ainda evoluiu o mesmo arquivo além da branch (mock framer-motion p/ Vitest 4, commit a5760922c); aplicar a branch regrediria isso. Nada a recuperar.

**`fix__f1a-lote-b-batch12`** — Branch de 1 arquivo (src/styles/utilities.css) com dois commits: reformatação prettier (sem efeito visual) e o fix real — criar as classes CSS .safe-area-top/.safe-area-bottom/.scrollbar-none e bloquear pull-to-refresh no celular, que o app já usava em ~15 telas mobile (cabeçalho, barra inferior, campo de envio do chat) sem regra definida. O fix já está na main (commit 4b9585052, PR #2156) com texto diferente e teste de contrato protegendo; o restante é cosmético. Nada a portar.

**`fix__f1a-lote-b-batch2`** — Branch do lote F1a com um único arquivo de teste (GroupsView.a11y.test.tsx). A única mudança funcional — acrescentar `useReducedMotion` e `MotionConfig` ao mock de framer-motion para o teste de acessibilidade de Grupos não quebrar — já está na main desde e1f2ee4dd (2026-10-27). O restante do diff é só reformatação prettier, sem efeito em comportamento, e prettier não é check de CI. Nada a recuperar.

**`fix__f1a-lote-b-batch4`** — N-216: falha no COUNT de whatsapp_connections derrubava toda a coleta da tela de Diagnósticos e mascarava falha de leitura como "0 conexões". A correção já está na main em outra forma (sem throw; erro entra na classificação de health.database) e com teste dedicado que a branch nem trazia. O restante da branch (~70 linhas) é só reformatação Prettier, sem gate em CI.

**`fix__f1a-lote-b-batch5`** — Branch expunha `isError` no hook useUserSettings e mostrava toast quando a leitura das configurações do usuário falhava (antes a falha era invisível). Os 4 hunks (+7 linhas, 1 arquivo) já estão na main de forma idêntica, e a main ainda foi além (catch também marca erro e bloqueia auto-save em erro). Nada a recuperar.

**`fix__f1a-lote-b-batch6`** — Painel NPS: estado de erro (com "Tentar novamente") quando a leitura falha e aviso de truncamento quando bate no teto de 500 respostas. Ambos já estão na main com o mesmo contrato (testids, texto, refetch) e cobertos por teste; o restante do diff da branch é só reformatação Prettier não exigida pelo CI.

**`fix__f1a-lote-b-batch7`** — Ranking (Leaderboard) passou a distinguir "RPC caída" de "ranking vazio", mostrando erro com botão "Tentar de novo" em vez de mentir que não há ninguém no ranking. Essa correção já está na main (commit e1f2ee4dd, 2026-10-27) e coberta por teste; o que sobra na branch é só reformatação prettier e um ícone cosmético.

**`fix__f1a-lote-b-connectioncard-dialog`** — Corrigia o diálogo de desconectar WhatsApp no ConnectionCard (handler indefinido que quebrava a compilação, diálogo fica aberto com motivo quando a Evolution GO recusa desconectar). Tudo já está na main via PR #2156 (commit 4b9585052, 2026-10-21); o restante da branch é só reformatação prettier sem efeito.

**`fix__f1a-lote-b-hooks-misc-1`** — Acessibilidade do overlay de proteção de tela (role=alert + aria-live=assertive para leitores de tela). As 2 linhas funcionais já estão na main; faltam só 3 linhas de comentário, sem efeito no comportamento.

**`fix__f1a-lote-b-main`** — Branch só adicionava `createLogger` aos mocks de `@/lib/logger` em 9 testes (porque `src/lib/invokeEdge.ts` usa `createLogger`) + reformatação prettier. Os 9 arquivos na main já têm `createLogger` no mock (versão até mais completa, com `withCorrelation`), via PRs #2156 e #2182. O restante do diff é cosmético; nos 3 arquivos com framer-motion a versão da branch seria regressão (main já migrou o mock para Vitest 4). Nada a recuperar; triagem anterior (OBSOLETA) corrigida para INCORPORADA.

**`fix__f1a-lote-b-realtime-channel-mock`** — Branch só corrigia os testes de AgentsView (capacidade/pendências) adicionando `channel`/`removeChannel` ao mock do Supabase para a tela não quebrar com "channel is not a function" via useConnectionsHealth; o resto do diff é formatação prettier. A main já tem o mesmo mock (texto diferente, comportamento equivalente) nos dois arquivos, introduzido por e1f2ee4dd. Nada útil ficou para trás.

**`fix__f1a-lote-b-talkxsegments`** — Branch corrigia 3 coisas no hook de segmentos do Talk X: supabase.rpc perdendo o this (quebrava contagem/amostra de público, stats e ações em massa), lead_origin oferecido como filtro morto e real_sector/real_uf (ponte Singu) sem falha fechada. As três já estão na main por commits posteriores (a9ddd2f9a, e1f2ee4dd, a0e21b651/a6fbadfa3); a guarda ponteOnly da main cobre countAudience, resolveAudience e rulesToPostgrest. O restante da branch (≈330 linhas) é só reformatação prettier sem efeito no produto; main mantém estilo compacto e prettier não é checado em CI.

**`fix__f1a-lote-b-useadmindata-createuser-avatar`** — Branch trazia: (1) avatar dos usuários assinado ao carregar a lista do admin (bucket privado), (2) mensagens de erro ao criar usuário distinguindo "e-mail já cadastrado" e "papel inválido", (3) correção dos mocks do teste de handleCreateUser, (4) prettier. Tudo o que é funcional já está em origin/main; o que "falta" é só formatação prettier (a main manteve o estilo antigo) e uma string de teste com o papel special_agent, removido de propósito na main (#2692).

**`fix__f1a-lote-b-useadmindata-select`** — Branch só destravava um teste do painel admin (aba auditoria) acrescentando `.range()` ao mock do Supabase. Essa correção já está na main desde 27/10 (commit e1f2ee4dd). O resto do diff é formatação prettier e dois métodos de mock (`gte`/`lte`) que o teste nunca chama. Nada a recuperar.

**`fix__f1a-supabase-channel-mock-audiomeme-20261018`** — Branch completava o mock do Supabase (channel/removeChannel, getPublicUrl) e o mock do framer-motion no teste de falha de envio de áudio-meme. Tudo isso já está na main com o mesmo texto (via e1f2ee4dd e a5760922c); as 8 linhas "faltantes" são corrupção de bytes no último commit da branch (bo#aoPorIcone, erro(m{), rejek#hão) e quebras de linha — portá-las quebraria o teste. Nada a recuperar.

**`fix__reconciliar-migration-copilot-fases13-15`** — Branch reconciliava a migration das tabelas copilot_* (fases 13-15), registrava a versao duplicada 20261031100000 nas falhas esperadas do replay local e estabilizava o E2E de alto contraste no webkit. Tudo ja esta na main: migration identica, entrada do known-failures com texto mais completo, e espera de luminancia equivalente no spec E2E. Producao confirma as duas versoes no ledger e as tabelas/politicas existentes.

**`fix__types-rpc-ausentes-261025`** — Branch de 3 commits (2026-10-25): 9 assinaturas de RPC em types.ts, tipagem null em transfer_conversation, e fix de testes (fila offline de envio por usuário + limpeza no logout; extensão/contentType real no upload de áudio). Tudo já está na main em forma equivalente ou superior: types.ts regenerado pelo codegen (#2357) contém as 9 RPCs; fila offline usa predicado shouldDeliver/pertenceAoUsuarioAtual (mais estrito: item sem dono não drena); logout esvazia a fila com try/catch; uploadAudio mapeia webm/ogg/mp4/mpeg. Nenhuma lacuna a recuperar.

**`local__fase0-banco-local`** — Fase 0 da fábrica local (04/10/2026): app aceita banco local por desvio explícito, replay local trava chamadas à produção, 3 migrations (reconcile replay, fecha EXECUTE anônimo de record_incoming_call_event, tick Talk X não aborta no expurgo), 2 testes no db-guard, e2e via fonte única supabase-env, seção 0 do CLAUDE.md. Tudo entrou pela PR #1890 (b44540e35) e evoluiu depois: protocolo https aceito (#2716), cleanup do replay via trap (R2-INF-014), CLAUDE.md virou @AGENTS.md com as regras de banco em docs/agentes/banco.md (#2762). As únicas linhas da branch ausentes na main foram substituídas de propósito; as regras 1-3 da seção 0 (agente não faz push/PR/merge) contradizem o fluxo vigente em AGENTS.md e foram descartadas pelo dono.

**`pr-2000`** — Fase 4 do Copiloto RADAR (inteligência B·R·I·N·D·E ao vivo: evidência por letra, estilo de comunicação, papel na decisão, ocasião, stakeholders, medidor de etapa/temperatura e motor de análise em dois andares). Tudo já está na main e em produção: as 2 migrations estão lá (uma byte a byte, outra só sem comentários) e aplicadas; os 6 componentes do painel são idênticos; o motor foi portado para o handler de fila `_shared/copilot-tick.ts` pela PR #3127, que cita o #2000 como origem do desenho. A capacidade nasce DESLIGADA (`ai.capability.copilot_live=false` em produção), então o custo de LLM por mensagem não está correndo e não há decisão do dono pendente — isso derruba a classificação DECISAO_DONO da triagem anterior. Nada útil a recuperar; a branch pode ser apagada.

**`pr-2003`** — Painel flutuante RADAR do copiloto (CV-051–060: pop-up arrastável, 3 modos, drawer mobile, não perturbe, atalhos, a11y, timeout "pensando") já está em produção via PR #2828 em versão mais refinada; stubs de hooks foram substituídos por implementações reais; fix do isOverdue duplicado e export nextBestActionKey já na main. Triagem anterior "PERDIDA" refutada.

**`pr-2361`** — Copiloto RADAR fases 8–15 (80 hooks, 21 componentes, 2 migrations, edge copilot-live). A PR foi mergeada por squash na main (commit 8748ebf2a, #2361) e a árvore do tip da branch é byte-idêntica a esse commit. As 24 "lacunas" mecânicas são evolução posterior da main: 5 hooks duplicados unificados (#2379), camada AI nos hooks e copilot-live real (#2834), lint/clipboard, artefatos de auditoria resincronizados. Nada a recuperar; triagem anterior (DECISAO_DONO) superada.

**`pr-2430`** — Filtro por segmento na aba Destinatários do Talk X (RPC talkx_campaign_recipients_page com p_segment_id). A PR foi mergeada (00ad8718f), o arquivo foi movido para _superseded/ por nunca ter sido aplicado, e a mesma mudança foi re-implementada e aplicada em produção pela migration 20261107180000; o front já usa p_segment_id.

**`pr-2496`** — C110/PD-79/PD-80: carimbo do POST iniciado no envio de WhatsApp, código de erro estável no message-delivery, painel de mensagens com entrega ambígua (resolução manual por admin/supervisor) e guarda contra recibo tardio sobrescrever decisão manual nos webhooks. A PR #2496 foi squash-mergeada em main (9727aaedd, 2026-11-11) com árvore idêntica ao tip da branch; migrations 20261111160000 e 20261112170000 estão aplicadas em produção. As 9 "lacunas" são evolução posterior da main (#2988 types-sync, #3046 pacote 2: SendErrorBanner volta a permitir reenvio de 'failed', hook filtra só 'sending', fallback 42883 removido de propósito), não trabalho perdido.

**`pr-2870`** — Sessão de "fix CI" (49 commits, 2026-11-01→09): ARIA da paleta de comandos, canal estável do chat interno, deep-link ?type= do Inbox, erro exposto na base de conhecimento, remoção de hook morto do TalkX, mocks jsdom do virtualizador, geolocation no Playwright e migration de reconciliação. Todo o código já está na main — em vários casos em forma melhor. O que não está é só lixo com prova: um script de fila de merge apagado de propósito, o manifest gerado (já regenerado) e três documentos de sessão superados por versões de 12-15/11. Nada a recuperar.

**`pr-2977`** — Validação de coluna/operador na edge external-db-bridge (SEC-Z018) já está na main em versão mais rígida (6f90c9332 + dac285f62 #3138): mesma allowlist de operadores, validIdentifier com limite de 63 chars e bloqueio de nomes reservados do PostgREST, 400 em filtro/ordem inválidos. Manifest da main corresponde ao arquivo atual (sha256 verificado). Nada a recuperar.

**`pr-3067`** — Snapshot automático do bot types-sync (types.ts, schema-catalog, schema-manifest, grants-baseline, known-violations) gerado em 2026-11-14 05:27Z. Zero código de produto. A main já recebeu dois snapshots posteriores do mesmo bot (#3070 em 2026-11-14 e #3136 em 2026-11-15), que contêm todas as chaves que a branch adicionava e valores mais novos (contagens de grants, generated_at, hashes de funções alteradas depois). Portar a branch regrediria os artefatos.

**`pr-3076`** — Atualização do relatório vivo docs/prod-readiness.md (fechamento final: pacote 5 aplicado, E2E verde, pendências do dono, registro da #3075). Só documentação; nenhum código, edge, migration ou workflow. Conteúdo já está na main integralmente.

**`pr-3088`** — Fix no connect da Evolution GO (teto de 40 s e não apagar instância órfã sem prazo de recriar) com teste de regressão. Código e teste estão byte a byte na main (pacote 6, #3113, commit 41853318cd). As únicas 2 linhas "faltando" são hashes do deployment-manifest.json, artefato gerado que a main já regenerou corretamente para o estado atual; portar o hash da PR quebraria a verificação de deploy.

**`pr-3093`** — Fix da edge copilot-live (rate limit e cota de IA antes de chamar o provedor) e seu teste já estão byte a byte na main (pacote 6, #3113, commit 41853318c). A única "lacuna" são 2 hashes agregados do deployment-manifest.json gerado, já recalculados pela main com o estado atual dos _shared.

**`pr-3095`** — Fix que evita alerta duplicado de reconexão da instância Evolution no War Room (handler do webhook + teste). Código e teste já estão na main byte a byte via pacote 6 (#3113, commit 41853318c). O único arquivo com "lacuna" é o deployment-manifest.json, artefato gerado automaticamente pelo CI: as 2 linhas ausentes são hashes agregados (source_sha256 do bundle evolution-webhook e manifest_sha256) que divergem porque a main avançou em outros arquivos; a entrada do handler no manifesto da main já é exatamente a da branch.

**`pr-3097`** — Fix para a resposta 422 de validação das edges sair com os security headers (schemas.ts) e teste que protege isso. Código e teste já estão byte a byte na main (pacote 6, commit 41853318c / #3113); o único arquivo divergente é o deployment-manifest.json, artefato gerado que a main já regenerou para seu estado atual.

**`pr-3101`** — Fecha o bypass de perfil desativado (profiles.is_active) em 3 edges (ai-churn-analysis, ai-classify-tickets, approve-password-reset) com testes. Tudo já está na main via pacote 6 (#3113, commit 41853318c).

**`pr-3105`** — Fecha brecha de segurança: usuários logados (role authenticated) podiam executar a função privilegiada merge_brinde_state. A migration corretiva e o teste que prova o fix já estão na main e a migration está aplicada em produção (authenticated sem EXECUTE, service_role mantém). As 3 linhas "faltando" no teste são apenas chamadas diretas a `sudo -u postgres psql` que a main envolveu num wrapper `psql_su` com o mesmo comportamento local mais suporte ao Postgres do CI.

**`pr-3106`** — Webhook do Gmail passa a paginar history.list e gravar o cursor historyId com compare-and-swap (não perde eventos nem regride cursor em concorrência), com teste dedicado. Tudo já está na main via pacote 6 (#3113).

**`pr-3114`** — Regeneração automática de artefatos derivados do banco (tipos TS, catálogo, manifesto, baseline de grants) após a tabela away_message_log. Tudo já está na main em versão mais nova (#3136, 143f44afd); as 2 linhas "ausentes" são só carimbo de data e contador de grants superados pela geração seguinte.

**`pr-3117`** — Branch só regenerava artefatos derivados do banco (inventário, manifest, grants, types) após a migration da tabela away_message_log. Todo o conteúdo já está na main; as 3 linhas "faltantes" são contadores/timestamp que a main regenerou depois (2026-11-15, #3136) com valores mais novos. Nada a recuperar.

**`pr-3130`** — Commit automático de sincronização dos artefatos derivados do banco (snapshot de schema/grants) após a migração do Copilot (coluna copilot_sessions.last_contact_message_at, trigger trg_copilot_tick_on_contact_message, função enqueue_copilot_tick_on_contact_message). Tudo já está na main via #3135/#3136; a única linha ausente é o carimbo generated_at, superado por snapshot mais recente. Sem efeito no negócio.

**`pr-3132`** — Pausa de instância passa a bloquear os 3 caminhos de envio WhatsApp (message-delivery, multiplix-send, talkx-send) + scheduler/resume-policy, com testes. Tudo já está na main via pacote 8 (#3135, commit 2cf0153ae); nada a recuperar.

**`pr-3133`** — Resgate de 5 scripts de guarda de DDL/rollback + 4 suítes. Tudo entrou na main pelo pacote 8 (commit 2cf0153ae, PR #3135): 8 arquivos byte a byte idênticos; o detector de DDL destrutivo e seu teste entraram em versão mais estrita (detecta também `ALTER TABLE t DROP coluna` sem a palavra COLUMN e DELETE/TRUNCATE em CTE, furos que a branch deixava passar). As 2 linhas "faltantes" são a regex antiga, substituída de propósito por um superset. Nada a recuperar.

**`pr-3134`** — Regeneração automática dos artefatos derivados do banco (catálogo, manifesto, grants, inventário). Sem código de produto. Tudo que a branch adicionou já está na main, que tem um snapshot ainda mais novo (#3136).

**`pr-606`** — Fix de 1 linha para o PageHeader de cada tela voltar a desenhar a própria trilha (Início / Módulo) no desktop, depois que a barra global de breadcrumbs foi removida na #599. A main já faz exatamente isso: o campo foi renomeado para hidePageBreadcrumbs (#609) e fixado em false na #2819 (2026-11-08), com teste que cita a #606. Nada a recuperar.


#### Obsoleta — 105 entradas

**`Github_Copilotauditorias-anteriores-reconciliacao`** — Rascunho paralelo (worktree cuddly-barnacle, 31/10 15:14Z) do relatório "Reconciliação de Auditorias Anteriores", só prosa. A main recebeu no mesmo dia outra redação do mesmo relatório (mesmo título/data/autor, cabeçalho cita a própria sessão), commitada direto pelo dono (ee8f4b6eb) e depois verificada/atualizada (#2748, #2752). As 161 linhas "faltando" são texto alternativo do mesmo conteúdo; a branch ainda afirma achados já refutados na main (enforceRateLimit "pendente") e estalados (main sem branch protection — baseline de 02/11 mostra strict=true). Nenhum código, migration, edge ou workflow. Nada a recuperar.

**`claude_04__gifted-ride-xq3mj4`** — PR #2525 reconciliava 2 migrations órfãs do ledger (índices FK e WITH CHECK em 8 políticas RLS) e atualizava PENDENCIAS.md/RELATORIO_CI.md com o estado dos workflows em 2026-11-01. As 2 migrations já estão na main byte a byte (via PR #2551); os dois documentos são snapshots de status de 2026-11-01 superados por versões de 2026-11-12 na main e pelo histórico em docs/_arquivo/PENDENCIAS.md. Nada a recuperar.

**`claude_04__intelligent-babbage-bo2g5s`** — PR #2601 subia o timeout do login (edge auth-login) de 12s para 25s para não cortar logins legítimos quando a edge demora (cold start). A main já resolveu o mesmo problema pela PR #2602 com 30s (margem maior). Nada a recuperar; portar 25s seria regressão.

**`claude_04__pensive-tesla-ixtl9w`** — Sessão de "fix CI" de 2026-11-01 (PR #2526): 1 commit de código (deno check --config no deploy-functions.yml + espera do tema dark no teste axe do e2e/email-navy-visual.spec.ts) e 9 commits de relatório (RELATORIO_CI.md, PENDENCIAS.md). Os dois fixes de código já estão na main por outros commits (#2575 e #2710); os relatórios são snapshots datados substituídos de propósito por versões posteriores (2026-11-05 a 2026-11-15). Nada a recuperar.

**`claude_04__trusting-newton-duiglt`** — PR #2540: retry no gh pr list da fila de merge + conserto de 8 suítes vitest + uploadAudio com MIME real. A fila de merge (scripts/ci/fila-merge.mjs e o workflow que a chamava) foi apagada da main no pacote 6 (#3113), então o retry não tem mais alvo. O uploadAudio com MIME real e o clientHeight nos testes entraram na main por e1f2ee4dd com outro texto; os mocks extras e o unmount não são necessários porque as suítes já passam na main (CI verde em dac285f6). Nada útil perdido.

**`claude_05__awesome-ramanujan-ufxolu`** — Diário de uma sessão de triagem de PRs (01–09/11): 167 arquivos, todos em analise-prs/, zero código, zero migration, zero edge, zero workflow. A main arquivou de propósito essa geração de documentos como "prosa morta" (#2630 → docs/_arquivo/analise-prs/) e regenerou analise-prs/ com relatório vivo de 12/11; as PRs que a branch documentava já estão encerradas ou têm dossiê mais novo e mais fundo na main. O único arquivo com conteúdo durável (regras de domínio do produto) teve o caminho reaproveitado na main para outro documento, e seu conteúdo está coberto por docs/contexto/regras/manual/regras.md, docs/agentes/regras-dominio.md, IA-004, CV-005-brinde-spec e docs/dashboard/README.md — todos mais novos. Nada a recuperar; nenhum efeito no produto.

**`claude_05__zen-feynman-29b7ix`** — Branch de limpeza de CI de 25/10 (119 testes falhando, typecheck, workflow, relatório de PRs) que levou de carona melhorias de UX/a11y em WarRoom, Auditoria, Talk X Segmentos e Dashboard. Todo o trabalho útil já está na main por implementação equivalente ou melhor; o que falta teve o alvo apagado de propósito (o workflow auto-update-pr-branch.yml não existe mais), foi substituído por outra abordagem (service de mídia, hook de auditoria, mocks de teste) ou contradiz a main (fallback silencioso que esconderia falha das RPCs do WarRoom, .gitignore de um diretório que a main versiona, remoção do fallback da gamificação). Nada de valor para o negócio foi perdido; branch segura para apagar.

**`claude__archived-undo-constraint-fix`** — Corrigia o "Desfazer" do arquivamento em massa do inbox para não quebrar na trigger (archived→open|pending), além de trocar undefined→null nos args da RPC de transferência e gravar updated_at. A main resolveu o mesmo problema depois, de forma mais completa e alinhada à trigger atual (resolved restaurado sem novo encerramento, waiting em dois passos, pending/closed→open, falha por grupo não aborta o lote; #2459, #2813, #3082). O resto (null vs undefined, UPDATE direto com updated_at) foi descartado de propósito: transferência passa pelo wrapper com undefined e arquivamento passa por RPC de lote. Nada a recuperar.

**`claude__auditoria-temp-261101`** — Branch só contém o snapshot antigo (2026-10-25) do relatório de auditoria Supabase. A main já tem versão mais nova e mais completa dos mesmos dois arquivos (consolidada em #2844, 2026-11-10, após #2397 e #2630). Aplicar a branch regrediria a documentação. A única contribuição exclusiva da branch — reclassificar o bucket multiplix-voice de HIGH para INFO — corrige um achado que a main já eliminou na consolidação. Zero impacto em código, banco, edges ou workflows. Nada a recuperar.

**`claude__chore-auditoria-supabase-final-251025-1655`** — Branch só de docs: snapshot de 2026-10-25 da auditoria Supabase (relatório de 943 linhas com 28 achados + progresso.json de sessão). O documento está obsoleto — a main tem a consolidação ZW-nnnn (48 achados, re-verificada em 01/11 e 08/11) mergeada pela PR #2844 em 2026-11-10, e a própria main registra que a sucessora desta branch (#2462, mesmo conteúdo rebaseado) foi "absorvida sem novos achados". Verifiquei achado por achado: 25 dos 28 estão na main (quase sempre com evidência mais fresca), 1 é achado falso e 3 nunca chegaram à main e seguem verdadeiros em produção hoje (0 fatores MFA em 10 usuários; autovacuum ausente; 8 índices trigram nominais com zero uso). O que vale recuperar são 3 entradas em auditoria-supabase/achados.json — a mais relevante é MFA zerado, que é risco de acesso e não está documentado em nenhum lugar da auditoria vigente. Restaurar o relatório ou o progresso.json seria regressão.

**`claude__chore-claude-md-required-checks-261101-1600`** — Branch só de documentação. A única correção de fato (required checks da main são 3, não 6) já está na main em docs/agentes/github-ci.md:31 e em scripts/ci/github-settings-baseline.json; o CLAUDE.md de 380 linhas que a branch editava foi deliberadamente apagado em 07/11 (hoje é só "@AGENTS.md"). O outro arquivo é um plano de 190 etapas de 19/10 que nunca entrou na main e cujas premissas já não existem (CLAUDE.md grande, 14 workflows, PRs #2081–#2095), com a função hoje coberta por docs/PRONTO_PRODUCAO.md. Nada de código, banco, edge ou teste a recuperar.

**`claude__chore-cmd-auditoria-supabase-261101-1430`** — Branch só adiciona um roteiro/prompt (.claude/commands/auditoria-supabase.md) para consolidar 3 auditorias Supabase e executar correções. O resultado que esse roteiro mandava produzir já está na main (PR #2844 mergeada em 10/11: achados.json com 48 ZW-nnnn, progresso.json com Fases 0 e A fechadas, relatório consolidado), e as regras da Fase B já estão em AGENTS.md/docs/agentes. O texto está datado (8 PRs que ele manda triar estão todas fechadas; retrato de produção de 01/11 superado; afirma regra de Git oposta à vigente). Nada a recuperar.

**`claude__chore-docs-relatorio-261112-0910`** — Branch só adicionava ao RELATORIO_CI.md um snapshot transitório (runs "in_progress", "A VERIFICAR") do estado dos workflows logo após o merge da PR #2975. A main já registra, nas seções §9–§11 do mesmo arquivo, o desfecho final desses mesmos workflows (E2E logado resolvido via PR #2987, Types Sync resolvido via #2983/#2988, zombie confirmado ghost), tornando o snapshot sem valor. Nada a portar.

**`claude__chore-mapa-resgate-pos-24-10-261101-1415`** — Só documentação (PR #2479): mapa de 2026-11-01 das 59 branches locais arquivadas como tags resgate/pos-24-10/* e um JSON de contadores. Nada de código, edge, migration ou workflow. A main arquivou de propósito a pasta-alvo docs/resgate/ como "prosa morta" (#2630, c570d5d46) e as branches que o mapa lista estão sendo retriadas item a item nesta triagem; o dado bruto segue preservado nas tags. Nenhum efeito no produto.

**`claude__chore-relatorio-ci-261112-0803`** — Branch docs-only (PR #2980): um commit em RELATORIO_CI.md registrando snapshot de CI às 07:58–08:03Z de 2026-11-12 logo após o merge da PR #2975 (runs "in_progress"/"A VERIFICAR" e 3 frases "fix mergeado via PR #2975"). A main reescreveu o arquivo depois (commits 15923813a, 65cf38544/#2989, cb6576b2a/#3035) com §9–§11 cobrindo o desfecho real: E2E Logado resolvido via PR #2987 (11:15Z), inventário fresco 11:12Z, tabela final 12:25Z. O §9 da branch colide com o §9 da main e traria estados desatualizados. Nada de código; nada a recuperar.

**`claude__chore-remove-hook-morto-talksuppression-261024-1541`** — Branch queria tirar o hook morto useTalkXSuppression (TL-002) mas apagava o módulo inteiro, que a tela de supressão do Talk X ainda importa (useTalkXSuppressionActivity/Stats). A main já resolveu a mesma necessidade de forma cirúrgica em #2071 (662083c5f, 2026-10-31): só a função morta e seus tipos saíram, o teste velho foi deletado e um guarda (hook-morto.test.ts) impede o retorno. Mergear o que resta da branch quebraria a tela. Nada a portar.

**`claude__chore-sync-catalog-grants-baseline-261107-1354`** — Branch só regenerava o snapshot scripts/db-audit/grants-baseline.json com o estado do banco em 2026-11-07 (contagem service_role 391→392, resto igual, mais reordenação de chaves). A main já tem snapshot mais novo (2026-11-15, counts 411/226) regenerado pelo mesmo gerador, e a lista anon_table_select que a branch mantinha foi esvaziada de propósito pelo fix de segurança #2859 (revogação de 99 grants anon). Nada a portar; apagar a branch é seguro.

**`claude__dia-2026-10-19-ct011-hmac-talkx-artefatos-231023`** — Cherry-pick do dia 2026-10-19 (PR #2196): editor de templates Talk X encaixado no endereço (sub-aba ttab, breadcrumb, campo Descrição), props de erro X047, transcribed_at no adapter Evolution e ignore de worktrees no eslint. Toda a parte funcional já está na main (commit e1f2ee4dd, 2026-10-27) com implementação equivalente; o que sobra é refactor de constante, ignore de pastas locais inexistentes e baseline de lint gerado para outra config — nada a recuperar.

**`claude__ecstatic-bardeen-twiveb`** — Branch de 2026-10-23 cujo único objetivo era deixar a CI da main verde (60+ commits "fix(tests)"/"fix(typecheck)"). A main resolveu toda a mesma pauta de forma independente e mais completa nas 3 semanas seguintes. O que é exclusivo da branch hoje é retrocesso: ela reescreveu arquivos em vez de corrigi-los e reduziu o War Room e a ferramenta de migração de mídia a esqueletos, removeu o aviso de leitura incompleta do painel de sentimento e deixou o gate de templates WhatsApp mais restrito que a RLS (só admin, quando a regra vigente é admin+supervisor). O único componente novo (SentinelAlertPanel) grava uma coluna que não existe em produção. A migration do TalkX que a branch trazia já chegou à main, foi aposentada de propósito e substituída por outra, aplicada em produção. Nada a resgatar; nada em risco se a branch for apagada.

**`claude__feat-bulk-archive-two-step-undo-261101-0800`** — Desfazer do arquivamento em lote restaurando waiting/resolved/closed em dois passos (archived→open→original) com rollback para archived se o 2º passo falhar. A main já cobre a mesma necessidade desde PR #2813 (commit 7c9a18843, 2026-11-13) com abordagem diferente e melhor: via RPC moveConversationsStatus (UPDATE direto em conversation_status é recusado no banco, então o código da branch falharia em produção), resolved restaurado em 1 chamada em modo restore (evita 23505), pending/closed legados voltam a open, falha num grupo não bloqueia os outros ("X de Y restaurados"). Além disso, decisão do dono (2026-11-13): conversas waiting não são mais arquivadas, tirando o alvo principal da branch. Testes da main cobrem os cenários equivalentes. Nada a recuperar.

**`claude__feat-copilot-radar-20261108-1800`** — Copiloto RADAR B·R·I·N·D·E (painel na aba IA da Inbox + motor de análise por mensagem). Tudo isso já está na main, numa versão mais completa e ligada ponta a ponta, feita por outras duas PRs: #2828 (11841dba9, 2026-11-09, telas e motor) e #3127 (f369f88b2, 2026-11-15, liga o gatilho + handler, nasce desligado). A main usa tick automático pelo banco (gatilho em messages → fila ai_jobs → ai-jobs-worker → _shared/copilot-tick.ts), enquanto esta branch dependia de um botão "Analisar" manual — abordagem superada. Sobram apenas duas migrations de tabela sem nenhum consumidor (presença e agregados de retenção) e um gatilho incompatível com o banco real, que se aplicado hoje quebraria a gravação de mensagens. Nada a recuperar.

**`claude__feat-copiloto-edge-fases8-10-261024-1700`** — Rascunho antigo das 7 edges do Copiloto de Vendas (objeção, âncora de preço, risco de perda, recomendação de produto, prazo, temperatura do lead, análise de imagem). As 7 capacidades já estão na produção em versão melhor e integrada ao front (PR #2834 + #3001), com prompts de brindes corporativos, contratos Zod de saída e hooks em src/hooks/copilot/. Portar algo da branch regrediria a main. Nada a recuperar.

**`claude__feat-copiloto-edge-fns-fases8-15-261024-1615`** — Branch criava rascunho de 7 edge functions de IA do copiloto RADAR (prazo, temperatura do lead, risco de perda, multimodal, objeção, ancoragem de preço, recomendação de produto). A main já tem as mesmas 7 funções, com os mesmos nomes, em versão mais completa (validação zod de entrada/saída, testes, hooks no front, manifest de deploy) vinda da PR #2834 em 2026-11-10. O conteúdo da branch foi superado; portar seus prompts/campos quebraria os contratos consumidos pelos hooks.

**`claude__feat-e71-skip-draft-prs-281026-0250`** — Economizar minutos de CI pulando jobs pesados em PR draft (etapa E71). A main já faz isso desde 2026-10-31 (commit 578e5671c, PR #2046: unit-tests e build no ci.yml, offline-contract no db-guard.yml, com o ci-gate tolerando job pulado) e já tem o trigger ready_for_review. O que resta na branch é código morto (codeql não roda mais em PR), quebraria a CI como escrito (gate em node-scripts/security sem ajustar o ci-gate deixaria o required check vermelho em todo draft) ou é dano: a branch apagou as 975 linhas do plano de auditoria deixando o placeholder "PLANO_CONTENT_FROM_FILE" e marcou E71 como DONE_VERIFIED citando a PR #2295, que foi fechada sem merge. Resíduo útil de 1 linha (pular o job e2e, 45 min, em draft) está registrado no dossiê.

**`claude__feat-e75-toolchain-env-281028-0600`** — A branch queria "uma só fonte de versões de ferramentas do CI" (E75): cada workflow leria .github/toolchain.json em runtime via jq e usaria ${{ env.NODE }}, env.BUN etc. A main já entrega essa mesma garantia por outro caminho: mantém os números escritos nos workflows e tem um verificador que reprova o CI se qualquer número divergir do toolchain.json — rodando contra os workflows reais na suíte de guards. Portar a branch só trocaria o mecanismo, somando um passo jq em 11 workflows, e um dos trechos dela (a imagem do Postgres no db-guard) resolveria vazio porque o env do job é avaliado antes dos steps. Os dois arquivos de docs da branch só destroem um documento histórico (975 linhas apagadas) e reformatam um ledger gerado. Nada a recuperar; branch pode ser apagada.

**`claude__feat-radar-fase6-261108-1933`** — Painel flutuante do Copiloto RADAR (Fase 6). A main já tem a mesma tela em outro desenho, mais completa e ligada ao motor de IA (RadarPanel + RadarLive + RadarCards, PR #2828). O painel desta branch é uma meia-feature: desenha uma timeline que nada alimenta (pushInsight nunca é chamado), não implementa os 7 cards que o próprio cabeçalho promete, e troca o hook useRadarPanel por uma assinatura incompatível que quebraria o painel que já está na main. Além disso, a abordagem alternativa está preservada em versão corrigida na branch irmã #2872, que é a "opção B" que o dono tem em aberto na issue #2967 (PENDENCIAS.md:170-182). O único conteúdo exclusivo daqui é a suíte de teste do relatório TalkX, que a main já cobre com 13 casos em vez de 3. Nada a recuperar.

**`claude__feat-talkx-x003-demo-fixtures-261101-2143`** — Branch de teste E2E do Talk X (tela 01 de Campanhas). Não traz nada de útil que falte na main: a base das 17 fixtures, o mock e a régua visual já existiam antes do merge_base e continuam na main. O delta real da branch é (1) trocar travessão por "--" em comentários, (2) ENCOLHER a fixture da tela 01 de 24 campanhas (36 campos, 6 coleções) para 5 campanhas (19 campos, 2 coleções), (3) 17 arquivos placeholder com "{}" num esquema de nome paralelo ao que já está completo, e (4) reescrever o spec com um padrão que a main já tem no talkx-visual.spec.ts, insistindo num valor de KPI (24) que a main corrigiu de propósito para 21. Portar qualquer hunk pioraria a main. Zero impacto no negócio.

**`claude__feat-talkx-x047-matrix-estados-261101-2030`** — Zero impacto no produto. A branch queria provar com teste que, no Talk X, uma consulta que falha mostra "Não foi possível carregar" e nunca o texto de vazio — mas esse teste já existia na main desde 03/10, num arquivo bem mais completo (695 linhas contra 341, cobrindo erro + tentar novamente + carregando + vazio por tela, inclusive Monitor, Em andamento e wizard, que a branch nem tinha). O resto da branch é só reformatar um ledger de auditoria de 1,4 MB para marcar 8 etapas como verificadas, sem atualizar o próprio contador do arquivo. Nada a recuperar; branch pode ser apagada.

**`claude__festive-faraday-kv669k`** — Branch 100% documental: auditoria do Supabase de produção (47 achados + 10 propostas SQL/MD + script de matriz RLS), nada de código de app. Os 47 achados já foram absorvidos pelo ledger da main (`auditoria-supabase/achados.json` cita textualmente "PR #2414 (47 achados A/M/C)", que é esta própria branch), e a prosa de auditoria foi deliberadamente arquivada em `docs/_arquivo/` (PR #2630). Três propostas já estão aplicadas em produção (anon TRUNCATE=0, anon SELECT=0, department_invites restringido) e uma foi resolvida pela decisão oposta da main (17 tabelas com RLS sem policy documentadas como intencionais). Sobra uma lacuna real de segurança: o achado de MFA (zero fatores MFA em produção, confirmado hoje) não existe em nenhum documento da main — ação é do dono (ligar "Enforce MFA" no Dashboard muda o login dos 10 usuários). Secundárias: complemento de policy/MIME do bucket multiplix-voice e a matriz RLS expandida (19 testes A×B vs. 8 na versão arquivada).

**`claude__fix-canonical-receipt-policies-261020-2005`** — Migration defensiva que recriaria incondicionalmente as duas policies RLS de recibos do Team Chat (INSERT/SELECT em team_message_receipts) na forma canônica, visando convergência do replay local. Produção já tem exatamente essas policies e a main já as declara em 20261003272707; o replay da main já converge (medido pelo próprio autor na PR #2137). Portar seria uma migration redundante sem efeito funcional.

**`claude__fix-ci-contratos-cache-261020-2320`** — Branch de CI (PR #2123): cache do Bun, pin do Playwright 1.64.1, hardening do vercel-env-cleanup e correção de falso positivo no teste de secrets. Tudo útil já está na main; o único trecho ausente (pin no step apt-only `install-deps`) foi removido de propósito na main (#2054) e não altera comportamento. Nenhum trabalho a recuperar.

**`claude__fix-ci-n008-261101-2340`** — Branch tentava destravar o step N-008 do db-guard (rate limit do Docker Hub ao puxar postgres:17-alpine) adicionando N008_POSTGRES_IMAGE ao step e lendo-a no script, mais relatório de CI de 2026-11-01. A main resolveu a mesma necessidade por outra via (PR #2622: script lê POSTGRES_TEST_IMAGE pinada por SHA no nível do job; PR #2543: --no-healthcheck e wait-postgres-final-start.sh). A linha do workflow seria redundante; os docs são snapshot pontual superado pelos relatórios de 11/12–11/15 já na main. Nada a recuperar.

**`claude__fix-ci-tests-261019-1200`** — Branch de 19/10 para destravar a CI (mocks de teste, baseline a11y, reduced-motion, aria-live). Tudo que era útil já está na main (baseline a11y, ConnectionsView/ScheduleCalendarView com reduced-motion, useScreenProtection, aria-label do botão CRM). O restante são cópias desatualizadas de CRMAutoSync.tsx e useTeamChatPanel.ts (regressão: apagam a refatoração do CRM sync e 72 linhas de comentários que a main mantém) e correções de teste superadas por outras já verdes na CI da main (dac285f62, Unit Tests 1/3-3/3 SUCCESS). Nada a recuperar.

**`claude__fix-ci-workflows-261030-0830`** — Branch docs-only (PR #2372) com relatório e lista de pendências de CI da sessão de 2026-10-30. RELATORIO_CI_FINAL.md entrou byte a byte na main (#2458). PENDENCIAS.md e RELATORIO_CI.md da branch são versões anteriores de documentos vivos que a main já tem em versão de 31/10 (#2411); todos os 5 itens "bloqueados" que a branch pedia ao dono já foram resolvidos (deno install no deploy-functions via #2371/#2407, migrations copilot aplicadas em produção, db-guard sem ECR, branch-hygiene-audit com timeout 25 corrigido em #2551). Nada a recuperar; recuperar induziria o dono a agir sobre PRs já mergeadas/fechadas.

**`claude__fix-ci-workflows-hxupgs`** — Branch docs-only (1 commit, 2026-11-05) que refinava o relatório de CI já entregue pela própria PR #2730 (= merge-base). Reescrevia RELATORIO_CI.md em tabelas e ajustava 3 linhas de PENDENCIAS.md sobre o Deploy Edge Functions bloqueado pela PR #2707. Na main o relatório já tem as mesmas seções 1–5 de 2026-11-05 com mais detalhe e §6–§11 posteriores; a PR #2707 foi mergeada em 2026-11-06, o manifesto contém ai-usage-outbox-drain e PENDENCIAS.md (reescrito em 2026-11-12) registra Deploy Edge Functions com success. Nada a portar.

**`claude__fix-db-live-guard-dup-261109-1800`** — Branch só movia 2 arquivos de migration (sufixos _constraint/_column) para _superseded/ para calar falso drift no db-live-guard. A main resolveu o mesmo problema de forma melhor no commit fe6c6b0bf: renomeou os arquivos para o nome exato do ledger de produção (20261107121000_message_reactions_one_per_agent.sql e 20261107122000_contacts_phone_search_digits.sql, conteúdo byte-idêntico) e registrou a divergência em scripts/db-audit/migration-evidence.json. Aplicar a branch hoje só criaria cópias duplicadas em _superseded/ e contrariaria a convenção do diretório (arquivar SQL que nunca rodou). Nada a recuperar.

**`claude__fix-deno-modules-dir-261102-0450`** — A branch troca nodeModulesDir de "auto" para "none" em supabase/functions/deno.json para o deno check passar sem deno install. A main já tentou isso (#2399) e reverteu de propósito (#2404) porque "none" quebrava o deploy das edge functions; a main resolve a mesma necessidade com deno install + npm install no deploy-functions.yml, e os 3 últimos runs desse workflow em main estão verdes. Aplicar a branch reintroduziria a regressão.

**`claude__fix-deploy-deno-check-node-modules-261030-1200`** — Branch tentava destravar o typecheck das edge functions no deploy desligando node_modules (--node-modules-dir=none) e corrigindo um hash esm.sh de tslib no deno.lock. A main resolveu o mesmo problema pelo caminho oposto (instala node_modules + @types/node e usa nodeModulesDir:"auto" via --config) e migrou o lock de esm.sh para npm specifiers, então a entrada que a branch corrigia nem existe mais. Nada a portar; deploy das edges já funciona na main.

**`claude__fix-deploy-frozen-oct31`** — Branch que destravava o deploy das edge functions (deno check falhando por @types/node). O fix já está na main em forma mais completa (--frozen=false + npm install @types/node pinado + @types/node no deno.json); os dois .md (PENDENCIAS/RELATORIO_CI) descrevem o estado do CI de 2026-10-31 e foram totalmente reescritos na main. Nada a portar.

**`claude__fix-e2e-talkx-ajuda-ctrlk-261113-1629`** — Branch só tentava estabilizar o E2E instável do Ctrl+K na Ajuda do Talk X adicionando esperas no teste. A causa real (atalho global abrindo a paleta por cima da Ajuda) foi corrigida na main pela PR #3078 (commit 91c63ff8c, 2026-11-14) no código-fonte, sem alterar o teste. Além disso, a pré-condição toBeFocused() da branch depende de um autofoco que não ocorre após o carregamento lazy dos docs, então o hunk falharia. Nada a recuperar.

**`claude__fix-e2e-workers-ci-timeout-271027-0924`** — Branch (PR #2279) só mudava playwright.config.ts para `workers: process.env.CI ? 4 : 2`, tentando evitar o cancelamento do job E2E no timeout de 20 min. A main resolveu o mesmo GR-016 de propósito com `workers: 2` fixo (#2560) e eliminou a causa-raiz subindo o timeout do job E2E para 45 min e dividindo a suíte logada em shards de 75 min. 4 workers ainda causaria sobrescrita de screenshots em e2e/email-navy-visual.spec.ts (apontado pela review). Nada a portar.

**`claude__fix-e2e-workers-timeout-tests-011101-1800`** — Branch só de infra de testes E2E (4 arquivos: playwright.config.ts + 3 specs; zero src/edge/migration). Queria 4 workers no CI para o job caber em 20 min e adicionava timeouts de 30 s/90 s para compensar a contenção de CPU. A main rejeitou de propósito (GR-016: workers fixos em 2, commit a7a53f567/#2560) e resolveu o problema-raiz de outro jeito (job e2e com 45 min; e2e-logado fatiado em 5 shards). Sem 4 workers, os timeouts extras perdem o motivo; o CI da main está verde nessas specs (CI/CD Pipeline success em dac285f62, 76a6b55ce, 2cf0153ae). Nada a recuperar.

**`claude__fix-email-navy-contrast-261101-2057`** — Branch (PR #2513) queria que o alto contraste escuro vencesse os inline styles do preset de tema (texto cinza ilegível 1,9:1) pondo !important nos 20 tokens de .dark.high-contrast e ensinando 14 testes de contraste a tolerar !important. A main resolveu a mesma necessidade de forma melhor: applyThemePreset não grava inline quando o alto contraste está ligado (presets.ts:714-722) e !important só nas 8 variáveis de texto (PR #2587, accessibility.css:29-45); todos os parsers de teste já aceitam !important. Nada a recuperar.

**`claude__fix-evolution-connect-500-261113-1721`** — PR #3041: botão "Conectar WhatsApp" (Evolution GO) parava de devolver 500 opaco quando a GO caía ou demorava, passando a dizer a etapa que falhou. A mesma necessidade já está em produção pela #3045 (098a648f6): todos os fetches do connect usam safeFetch (nunca lança) e respondem 200 + code go_unreachable 502/504 em PT-BR, com orçamento de prazo de 40 s que também evita apagar a instância sem conseguir recriá-la. ESTADO.md e deployment-manifest da branch eram só âncoras/hashes do arquivo da branch; src/hooks já estão na main (prova mecânica). Única sobra: 2 casos de teste (create que lança rede → 503 + retry) sem equivalente explícito na main, valor baixo, hunks no dossiê.

**`claude__fix-evolution-go-gaps-d6-261019-1548`** — A branch apagava da edge evolution-api as rotas set-presence, find-chats e find-status-messages (inexistentes na Evolution GO) e removia seus chamadores no front (setPresence do useEvolutionInstance e toda a leitura de stories no useWhatsAppStatus). A main resolveu a mesma necessidade de outro jeito, por decisão do dono (#3035, 2026-11-13): mantém as 3 rotas com guarda goActionNotSupported/goHistoryNotSupported, o front trata notSupported sem erro (aba Presença, DeviceChatsPanel, memória por instância no useWhatsAppStatus) e um teste de contrato (rotas-chamadas-existem.test.ts) falha se uma rota chamada pelo front sumir do roteador. A branch ainda mantinha o send-chat-presence 'paused' ao contato, que a main removeu de propósito. Nada a portar.

**`claude__fix-gr011-311101`** — Branch só corrigia texto do CLAUDE.md antigo ("6 checks" → "3 checks", GR-011). Na main o CLAUDE.md longo foi removido de propósito (#2762, 2026-11-07; hoje contém só `@AGENTS.md`) e a tabela "Perímetro do GitHub" vive em docs/agentes/github-ci.md já com os 3 checks corretos; baseline JSON também diz 3. O segundo arquivo (.github/ci-refresh) é vazio, só gatilho de CI. Nada a portar.

**`claude__fix-gr023-ossf-scorecard`** — Branch tenta reintroduzir o OpenSSF Scorecard (workflow semanal + SARIF) e o dependency-review no CI, mais ajuste de inventário 17→18 workflows. Ambos já estiveram na main (W85/W86, 15/10) e foram removidos de propósito em 16/10 pelo commit "CI mínimo" por decisão explícita do dono; a main nunca os trouxe de volta e o inventário hoje é 21 workflows. Os hunks restantes do ci.yml na branch são corrupção (quebram shell e removem o bun install do job e2e). Nada a recuperar.

**`claude__fix-health-check-414-261109-2011`** — Paliativo de 1 linha no health-check de deploy das edges: tratar HTTP 414 (URL longa demais) como erro transitório para não derrubar o deploy. A main resolveu a causa raiz um minuto depois (commit 77dd76417: SQL sem enumerar 85 funções quando scope=all ou >20 slugs), então o 414 não ocorre mais; portar a linha hoje mascararia uma regressão real como "aviso".

**`claude__fix-healthcheck-http414-261109-1900`** — A branch mascarava o HTTP 414 do health-check de edges como aviso transitório. A main resolveu a causa raiz: a SQL enviada à Management API foi encurtada (sem filtro por rota em scope=all; prefixo /functions/v1/ para >20 funções), então o 414 não ocorre mais e tratá-lo como transitório esconderia um erro de cliente determinístico.

**`claude__fix-known-violations-copilot-feedback-261023-2035`** — A branch só adicionava uma exceção de CI (baseline do supabase-usage-guard) para a tabela copilot_feedback, que em 2026-10-23 ainda não existia no catálogo. Hoje a tabela existe na main (migrations 20261026* e supabase/schema-catalog.json), o guard não acusa violação e a chave seria podada como obsoleta. As 26 remoções de chaves antigas já estão na main (known: []). Nada a recuperar.

**`claude__fix-logger-vitest-mock-261017-1000`** — Mega-PR #2035 (fechada, não mergeada) que travava em "mock do logger quebra o CI": 294 dos 319 arquivos são só a forma do mock de @/lib/logger nos testes, e a main já fez esse mesmo saneamento arquivo a arquivo (308 arquivos mockam o logger, 298 com createLogger) — CI da main verde em dac285f62 sem o mock global. Os poucos fixes de produção estão na main em versão melhor (cast tipado nas RPCs, helper transferConversation, estado de erro real no sentimento, busca do chat interno completa) e duas mudanças da branch são regressões (props opcionais em AppearanceSettings — a review da própria PR apontou crash no botão Salvar; downgrade do diálogo de desconexão). Três itens seriam nocivos hoje (campo sql-sha256 no guard de migrations quebraria as 74 exceções pinned-replay; exclusão das pastas do copiloto do typecheck). Nada de valor para o negócio se perde ao apagar.

**`claude__fix-migration-drift-071107-1500`** — Branch só adicionava os 5 arquivos .sql das migrations aplicadas em 07/11 (copiados do ledger de produção). A main já tem os 5 arquivos e o objetivo (paridade ledger x disco, CI verde) está atingido; porém 2 deles (20261107121000 e 20261107122000) na main NÃO reproduzem o SQL realmente aplicado em produção (nome de índice, expressão da coluna gerada, COMMENTs e revoke de service_role diferem) e a main contorna isso com exceções pinned-replay em scripts/db-audit/migration-evidence.json. Sem efeito em produção ou usuário; só fidelidade do repositório. Conteúdo recuperável do ledger a qualquer momento.

**`claude__fix-n017-harness-261101-2115`** — A branch adicionava um `deno cache` antes do baseline do teste de mutação N-017 (Multiplix) alegando que o check obrigatório `Contrato DB offline` quebrava em runner limpo. Na main atual esse passo roda verde sem nenhum pré-aquecimento (run 43684697261 de 15/11, passo N-017 success em 34 s), logo o problema que o patch corrigia não existe; o patch só acrescentaria um download redundante ao CI.

**`claude__fix-pd79-compat-pre-migration-261111`** — A branch fazia duas coisas: (1) deixar o PD-79 funcionar "antes da migration" e (2) restringir a correção manual de status a mensagens em envio, devolvendo o botão "Enviar de novo" para falha definitiva. O bloco 2 — o que valia para o negócio — já está na main pelo pacote #3046, em versão melhor que a da branch. O bloco 1 virou código morto: a migration 20261111160000 está aplicada em produção, então os fallbacks de coluna ausente nunca executam. Sobra um refinamento de polling do painel C110 (valor baixo), transcrito no dossiê. Nada de negócio se perde ao apagar.

**`claude__fix-plano-190-etapas-261019-1200`** — Branch docs-only: só adiciona o documento de planejamento docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md (979 linhas, 190 etapas de melhoria em 9 fases). Zero código, migration, workflow ou edge. O arquivo não está na main e nunca foi executado, mas o escopo dele foi encerrado pelo próprio dono: a PR #2418 foi fechada em 01/11 pelo congelamento de features (#2545), que admite só os 9 fluxos críticos de docs/PRONTO_PRODUCAO.md, CI e segurança — e esse arquivo da main é hoje a lista fechada e versionada do que está quebrado, substituindo o plano. Sem impacto no negócio em recuperá-lo; o único resíduo útil (checklist de 30 itens de segurança da Fase A) ficou copiado no dossiê, junto do comando de recuperação, antes de qualquer deleção.

**`claude__fix-radar-shortcut-key-261108-2059`** — Branch registrava um atalho Ctrl+Shift+A para o painel RADAR (sem executor, só informativo) e recriava 3 testes do relatório de campanha Talk X. Na main o RADAR (#2828) já abre/fecha por Ctrl+Shift+L com listener próprio (RadarPanel.tsx:133, rodapé :457, teste RadarLive.test.tsx:96), então a entrada da branch contradiria a tecla real e não faria nada; a pendência "decidir e registrar um atalho único" já está na issue #2967 item 4. O arquivo de teste na main (568d3f932, 2026-11-09) tem 12 testes que cobrem o mesmo escopo e mais (exportação CSV/PDF); mergear regrediria para 3. Nada útil a recuperar; branch pode ser apagada.

**`claude__fix-replay-known-failures-261102-0935`** — Branch destravava o check de CI "Contrato DB offline" (3 exceções no replay-known-failures.json, arquivo da migration 20261026240300 e correção da asserção B.0c). O mesmo conteúdo já foi mergeado na main em 2026-11-02 via PR #2615 (commit 4908feacd). As únicas diferenças que restam foram superadas de propósito pela main: as exceções 220300/230300 ficaram desnecessárias depois que as migrations ganharam guards IF EXISTS (0c191b6b1) e foram removidas (a15fdfb81); o DROP SCHEMA _bkp_261023 executável foi substituído por tombstone só-comentários (#2756, 0601e3b64) com o SQL pinado em _superseded/, porque o ledger já registra a versão enquanto o schema ainda existe em produção (confirmado por consulta read-only). Nada a portar; branch pode ser apagada.

**`claude__fix-settings-salvar-aparencia-261025-1905`** — Branch-guarda-chuva de resgate com 101 commits (fix titular: salvar Aparência dava TypeError porque a SettingsView não passava isSaving/onSave ao AppearanceSettings). Nada a recuperar: o fix titular está na main com nome melhor (saveAppearanceSettings) e, nos 27 arquivos com lacuna, a main tem a versão igual ou posterior. Três hunks da branch seriam regressão se portados hoje: fila offline sem dono voltaria a drenar por qualquer sessão, leitura do usuário autenticado voltaria a aceitar sessão de outro projeto no mesmo navegador, e os templates de WhatsApp ficariam admin-only contra a RLS de produção (is_admin_or_supervisor). Branch pode ser apagada.

**`claude__fix-talkx-cron-startup-timeout-261025-1700`** — Branch atacava 9,3% de falhas do cron talkx-scheduler-1min (Talk X) com 4 peças: índice em cron.job_run_details, janela de 14 dias na função da UI, handler query_canceled e advisory lock + job de retenção. Só a retenção entrou na main (equivalente 20261102022200, ativo em produção como cron-historico-retencao-7d). Hoje a falha caiu para 0,06% e a mensagem é 'job startup timeout' (worker do pg_cron), causa que nenhuma das peças trata. Único item que ainda vale é o índice composto (UI de cron ainda faz seq scan de 74 mil linhas/81 MB). Branch é duplicata da irmã mais nova ...-261101-2200, que também está fora da main.

**`claude__fix-talkx-cron-startup-timeout-261101-2200`** — A branch queria parar as 4.007 falhas/30d (9,3%) do cron do Talk X. Esse problema já foi resolvido na main por outro caminho: a migration 20261102022200_cron_historico_retencao_7d.sql (de 2026-11-02, posterior à branch) limpa o histórico do pg_cron todo dia com janela de 7 dias — mais rígida que os 30 dias propostos aqui. Em produção hoje o job talkx-scheduler-1min falha 0,06% (6 em 10.075 execuções em 7 dias), e as falhas que sobraram são rajadas globais de 'job startup timeout' que atingem 7-9 jobs no mesmo minuto — não são do Talk X e esta branch não as trata. Além disso o índice que era o item central da branch não pode nem ser criado: a migration roda como 'postgres', que não tem permissão de criar nada no schema cron (a tabela é do supabase_admin), então o primeiro comando do arquivo abortaria a migration inteira. Sobra um trecho pequeno e de baixo valor (advisory lock + captura de query_canceled no tick), já transcrito no dossiê.

**`claude__fix-talkx-report-empty-suite-261108-2125`** — A branch só adicionava um placeholder `it.todo` para o arquivo de teste do relatório de campanha Talk X não falhar com "No test suite found". A main já resolveu isso de forma melhor: o mesmo arquivo hoje tem 13 testes reais (commit 568d3f932, integrado via #3035). Nada a recuperar.

**`claude__fix-talkx-report-test-stub-20261108-2210`** — A branch só adicionava um teste placeholder vazio (expect(true)) em TalkXCampaignReport.test.tsx para calar o erro de CI "No test suite found". A main já resolveu isso de forma definitiva com 13 testes reais (commit 568d3f932, 2026-11-09). Nada a recuperar; portar o placeholder seria regressão.

**`claude__fix-talkx-test-suite-261108-2330`** — Branch restaurava o arquivo de teste TalkXCampaignReport.test.tsx (CI quebrava com "No test suite found"). A main resolveu o mesmo problema com outra suíte de 12 testes (568d3f932, 2026-11-09) que cobre série diária/hora, heatmap 7x24, render dos 3 gráficos, ausência da série Conversões e ainda PDF; o funil tem teste próprio. Uma assertiva da branch (getByText('Clicaram')) contradiz o comportamento atual da main. Nada útil a recuperar; só um resíduo cosmético (assertiva do mapa creators → "Responsável").

**`claude__fix-talkx-test-suite-261109-0910`** — A branch só recolocava a suíte de testes do relatório de campanha TalkX (arquivo ficou sem describe/it após PR #2830, quebrando o CI da main). A main resolveu a mesma necessidade por outra suíte mais ampla (commit 568d3f932, 13 testes reais no mesmo arquivo, CI verde). Nada exclusivo da branch é necessário; restam só dois reforços opcionais de teste (domingo=linha 6 no heatmap; "Responsável" via creators).

**`claude__fix-talkxcampaignreport-test-261109-0454`** — A branch só embrulhava um it.todo solto em um describe com 1 teste placeholder e 2 it.todo anunciando os testes reais do relatório de campanha Talk X. A main já tem os 12 testes reais (talkxReportData: agrupamento dia/hora + grade 7x24; TalkXCampaignReport: três gráficos + sem série Conversões + falha de PDF), que cobrem exatamente o que os todos descreviam. Nada a recuperar.

**`claude__fix-typecheck-suppression-261019-1342`** — Ajuste de tipagem (reason_code da lista de supressão Talk X restrito aos 6 motivos do enum) sobre interfaces do hook useTalkXSuppression que a main apagou de propósito em e1f2ee4dd; o mesmo estreitamento já existe hoje em TalkXSuppression.tsx (type ReasonCode). Nenhum efeito para o usuário; nada a portar.

**`claude__fix-typecheck-suppression-261023-2230`** — Ajuste só de tipagem (narrow de reason_code em interfaces do hook useTalkXSuppression, #2111). O bloco-alvo (BlacklistEntry/AddBlacklistEntryInput/hook Z008) foi removido de propósito da main como código morto em e1f2ee4dd (2026-10-27) e há teste-guarda que impede reintrodução; o narrow de tipo já existe na tela viva TalkXSuppression.tsx (type ReasonCode com os mesmos 6 valores). Zero efeito no negócio; nada a portar.

**`claude__fix-unit-tests-inbox-261023-1108`** — Fix de infra de testes (virtualizador do inbox no jsdom): shim global de clientHeight/clientWidth em src/test/setup.ts. A main resolveu a mesma necessidade com shims por arquivo em todos os testes do ChatMessagesArea/ChatPopup e a suíte unitária está verde; o segundo fix da PR (spy em FilesTab.fase6) já está na main byte a byte. Nada a recuperar; portar o shim global conflitaria com testes ChatPopup que dependem de clientHeight=0 fora do role=log.

**`claude__fix-unit-tests-mechanical-261024-1527`** — Branch de 1 commit (PR #2228, fechada sem merge em 2026-11-01) que consertava o teste unitário de criação de usuário no admin (useAdminDataCreateUser.test.ts), cujo mock apontava para o módulo errado. A main já corrigiu a mesma causa raiz no commit e1f2ee4dd (2026-10-27, "destrava o CI Gate 136 → 0") com abordagem melhor (mantém o parser real de erro em vez de mocká-lo); os hunks que a branch tem a mais são escolhas de teste superadas e um enum já removido na main (special_agent). Nada a portar.

**`claude__fix-unit-tests-src-261024-1630`** — Branch de 24/10 criada só para deixar os Unit Tests de src/ verdes (mais as correções de produção que esses testes cobriam). A main resolveu o mesmo problema por outro caminho 3 dias depois (e1f2ee4dd, 136 arquivos vermelhos → 0) e depois refatorou os mesmos arquivos. Rodei os 19 arquivos de teste tocados pela branch na árvore atual da main: 11+8 arquivos, 158 testes, todos passam. Todo o código de produção da branch está na main em forma igual ou melhor (useAuth/SEC-FRONTEND-04, mime real do áudio, HZ5-09 do chat interno, ponteOnly do TalkX, aba Tarefas agendadas, MediaMigrationTool com serviço extraído, p_from/p_until do KPI). O que sobra seria regressão: a branch apagava 100 linhas de teste real da busca do chat de equipe (virava it.todo), pulava a asserção de fuso em vez de fixar TZ, e revertia o arquivamento em lote para um UPDATE por contato que o banco hoje recusa. Nada a recuperar; branch pode ser apagada.

**`claude__fix-x051-remote-completion-test-261108-2057`** — Branch corrigia os títulos "Pausar/Cancelar campanha?" (minúsculo) na tela de campanha em execução e no teste remote-completion, para um estado intermediário do X051. O X051 mergeado (#2555) manteve deliberadamente o texto antigo em maiúsculo nesta tela (override RUNNING_LIFECYCLE_COPY, Running.tsx:613/619) e a main é coerente (componente + remote-completion.test + lifecycle.test). Portar a branch quebraria testes da main. A suíte TalkXCampaignReport.test.tsx tem substituto mais completo na main (568d3f932, 12 testes). Nada a recuperar.

**`claude__fix-z017-z020-auth-cors-261018-1950`** — O fix de segurança que dava nome à branch (Z018/Z020: as edges external-db-proxy e cleanup-rate-limit-logs pararam de expor código de erro interno do Postgres em 502 e passaram a usar internalErrorResponse no catch) JÁ ESTÁ na produção, byte a byte, comentários inclusive — entrou pela PR #2794. Os 139 arquivos de "lacuna" apontados pela varredura mecânica são 137 arquivos de auditoria de PRs de 23–24/10/2026 (128 dossiês stub + baselines + prs.json/csv) que a própria main já reescreveu com a auditoria de 11–12/11/2026, mais um workflow de fila de merge que a main apagou de propósito em 14/11 junto com o script que ele chama. Portar a branch hoje reverteria duas decisões vigentes (migração de imports esm.sh→npm: nas edges e remoção da fila serial) e sobrescreveria relatórios mais novos. Sobra uma única linha útil: ignorar package-lock.json no .gitignore — higiene, sem impacto, e o arquivo nem é rastreado. Nenhum risco para WhatsApp/Evolution, inbox, envio, contatos ou login. Branch pode ser apagada.

**`claude__fix-z022-z024-dbguard-ci-261018-1930`** — Branch só tirava o pin `playwright@1.63.0` dos passos de instalação do Playwright em dois workflows de E2E. Na main o workflow logado nem usa mais `bunx playwright` (roda via scripts/e2e-isolated/run.sh, #2717) e o talkx pina deliberadamente `@1.64.1` igual ao bun.lock por regra SonarCloud S8543 (depois de já ter desafixado em #1923 e revertido em #2054/#2156); a linha de `install-deps` sem pin já está igual. Nada a recuperar; sem efeito no negócio.

**`claude__ga-ci-verde-261020`** — Branch guarda-chuva de "CI verde" de 20-21/10 (merge de 16 sub-branches de testes/a11y/contratos). A main fez o mesmo trabalho sozinha em e1f2ee4dd (27/10, 176 arquivos, "136 → 0 arquivos vermelhos") e nos PRs seguintes; onde a main difere, difere por decisão registrada (coverage em shards rejeitado, deno install no deploy-functions, contrato do VoiceChangerPicker sem Storage, ALLOWLIST_NODE zerada). Pior: o tip não compila (3 imports de exports inexistentes) e apaga ações do edge do WhatsApp que a main ainda tem — portar seria regressão. Sobram duas melhorias cosméticas de valor baixo (rótulo ⌘ no Mac nos atalhos e nome duplicado no tooltip do CRM), com o hunk salvo no dossiê.

**`claude__keen-galileo-dxai3p`** — Sessão de 2026-10-30 de conserto de workflows CI. O único código vivo (try/catch no gh pr list de scripts/ci/fila-merge.mjs) entrou na main em versão melhor (bcb11c845, PR #2394) e depois o script e o workflow auto-update-pr-branch foram removidos de propósito no pacote 6 (41853318c, PR #3113). O cast `any` em contact.service.ts só existia para contornar o types-sync enquanto contact_notes.is_pinned não estava nos tipos; hoje types.ts (linhas 2350/2362/2374) e a coluna em produção já o têm, e a main mantém a versão tipada. Os relatórios PENDENCIAS.md/RELATORIO_CI.md são da sessão e foram substituídos por relatórios posteriores já na main (2026-10-31 e 2026-11-12); RELATORIO_CI_FINAL.md já está idêntico na main. Nada a recuperar; branch pode ser apagada.

**`claude__loving-lovelace-esc3l2`** — Auditoria exaustiva do Supabase de produção (12 seções, 62 arquivos de relatório/inventário/propostas) + 3 migrations de segurança/LGPD + ajustes em src/. A main já consolidou formalmente esta auditoria: auditoria-supabase/achados.json da main lista "PR #2186 (68 achados P001-P010)" como fonte do ledger ZW-nnnn. As 3 migrations foram substituídas por versões melhores já aplicadas em produção (department_invites admin-only, retenção login_attempts 90d preservando lockout, log_search_event com correlação busca-clique). Os arquivos src/ são ou idênticos à main (MediaMigrationTool/service), ou regressão (useWarRoomAlerts volta ao Notification cru), ou alvo inexistente (useDepartmentManagement, que hoje usa RPC create_department_invite), ou testes mais fracos. Os números do relatório já estão obsoletos (grants anon 99→1, policies UPDATE sem WITH CHECK 39→29, FKs sem índice 20→6). Nada a portar.

**`claude__magical-pasteur-iz2pgy`** — Lote de manutenção de CI de 23/10/2026 (deixar verde Unit Tests e Contrato DB offline), sem funcionalidade de negócio. Os 11 ajustes que importavam já estão na main por outros commits — e em versões melhores: logout limpa a fila de envio offline (useAuth), canal de notificação do Chat de Equipe por sessão (HZ5-09 + HZ3-001), diagnóstico não quebra com erro de contagem (N-216), erro ao carregar configurações avisa o usuário, ARIA completo na paleta de comandos, arquivamento em lote por conversation_status, filtro por segmento na aba Destinatários do Talk X (confirmado em produção: a RPC já tem os 6 parâmetros). Dois arquivos seriam regressão se recuperados: a branch troca o rótulo de data das Tarefas de "09 out." para "09/10/2026" e apaga 80 linhas do contrato de datas que a main mantém. Restam 5 resíduos cosméticos/defensivos, todos de valor baixo, com os hunks copiados no dossiê. Nada de alto ou médio valor foi perdido.

**`claude__project-thread-lrbsuz`** — PR #2524 (1 commit) acrescentava 'gte'/'lte' ao mock do Supabase no teste useAdminData.select.test.ts alegando que o teste quebrava com "b.gte is not a function". A premissa é falsa: na main (e já no merge-base) o hook só chama .gte/.lte quando recebe filtro de data, e o teste chama useAdminData('audit') sem filtro — o mock nunca é invocado com esses métodos. Os demais hunks só apagam comentários que a main mantém. Nada a recuperar; sem efeito no negócio.

**`claude__wizardly-meitner-aejx3i`** — Diário de bordo de uma sessão /merge-prs de 30-31/10/2026: 21 commits chore(analise), 75 arquivos, todos dentro de analise-prs/. Zero código — nenhum arquivo em src/, supabase/, e2e/, scripts/ ou .github/. É o inventário e os 70 dossiês das PRs #2111-#2411 que estavam abertas naquela data. Hoje o repo não tem nenhuma PR aberta (GraphQL states:OPEN -> totalCount 0) e a main já carrega uma geração mais nova dos mesmos arquivos (último toque d084ca753, 2026-11-14, cobrindo PRs #3048-#3058). O único arquivo com conteúdo durável, regras-de-negocio.md reescrito como regras de domínio, é documentação derivada de código que segue na main e já é publicada por docs/agentes/regras-dominio.md e pela branch contexto (07-REGRAS-DE-NEGOCIO.md com 5.459 linhas, regerada a cada 10 min). Nada a recuperar; apagar a branch não perde valor de negócio.

**`claude__wizardly-ride-dimxnt`** — Auditoria dos workflows do GitHub Actions: removeu a fila de merge (auto-update-pr-branch + fila-merge), tentou remover o Vercel Env Cleanup, fez o check Talk X só rodar em PR com (X) no título e ajustou docs/testes de contagem. A parte útil entrou na main pelo pacote 6 (#3113); a remoção do Vercel Env Cleanup foi desfeita de propósito no pacote 7 (#3123, commit 03ad0a8fc) porque a medição na API da Vercel achou 12 variáveis a remover, 7 delas segredos de servidor em preview. Nada a recuperar.

**`claude_pink__dreamy-wright-j0bser`** — Branch sem nenhuma linha de código: 107 arquivos, todos em analise-prs/ (inventário + 100 dossiês de 12 linhas + relatório + baselines), retratando o backlog de PRs em 27/10/2026. O que ela documenta deixou de existir: as 100 PRs analisadas estão fechadas sem merge (amostra #2087, #2090, #2244, #2274, #2284 todas CLOSED/merged=false), inclusive as duas que o relatório apontava como bloqueio que exigia intervenção do dono; e o bloqueio de CI que ela descreve foi resolvido (relatório vivo da main, sessão 11-12/11, registra merge com todos os checks success). A main já guarda esse histórico em versão melhor: os 100 dossiês têm homônimo em docs/_arquivo/analise-prs/dossies/ com análise real (diff lido, SHA verificado) contra os da branch que dizem head_sha: unknown. Aplicar a branch seria piora: sobrescreveria o workspace vivo analise-prs/ (relatório de novembro, inventário com SHA real, regras de negócio completas) por um retrato de outubro. Nada a recuperar; branch pode ser apagada.

**`claude_pink__nice-hypatia-iikl82`** — Mega-branch de consolidação de CI/testes de 2026-10-19 a 11-01 (PR #2511), 539 commits atrás da main. Nada exclusivo dela vale recuperar: as 305 lacunas de teste já existem na main (302/305) e o problema do mock de logger foi resolvido na origem (src/lib/logger.ts); os 3 testes exclusivos cobrem o módulo de compras/pagamentos removido de propósito (#2690); e toda ideia de produto dela já está na main em versão melhor (áudio com mime real, menções no painel de notas, contadores da inbox, safe-area mobile, reabrir conversa, aba 'memoria'). O conteúdo que só existe nela é REGRESSÃO: destrói o fluxo de Conexões WhatsApp (241→73 linhas, QR/trava E42 trocados por stubs vazios), destrói a Carteira de Clientes (135→35 linhas, hook que sempre retorna vazio), apaga a guarda de invariantes do banco vivo (RLS/security_invoker/policy aberta) e esvazia a guarda de settings do GitHub (396→25 linhas), além de corromper acentos em comentários. 310 dos 351 arquivos conflitam com a main — não é mergeável. Único ponto a registrar: ela renomeia o painel Talk X 'Mais convertidos' para 'Maior taxa de resposta', o oposto do que a main faz hoje (rótulo fixado por 3 testes).

**`codex__consolidacao-baseline-pr-20261101`** — Branch só de documentação: acrescentava ao docs/consolidacao/BASELINE.md uma fotografia de métricas (build/lint/typecheck/testes) da main de 01/11/2026. Na main o arquivo-alvo e toda a pasta docs/consolidacao/ foram arquivados de propósito em docs/_arquivo/ como "prosa morta" (PR #2630, 02/11), e já existe baseline posterior (02/11) em outro arquivo. Não corrige bug nem muda comportamento; nada a recuperar.

**`codex__fix-failed-workflows-20261020`** — Branch de conserto de CI (pin Playwright 1.64.1, job Deno de edges, cache Bun, baselines de docs geradas, a11y das abas do Admin, animação do estado vazio). O núcleo entrou na main pelo merge #2156 (4b9585052, 2026-10-21); o que hoje difere foi substituído de propósito depois (coverage upload removido com justificativa, install-deps despinado em #2054, teste de rotas legadas removido em #2054, docs geradas regeneradas com 21 workflows / banco de 2026-11-14). Nada a recuperar; apagar a branch é seguro.

**`dependabot__bun__deps-semanal-0b89910d44`** — Bump semanal do Dependabot (16 pacotes) + alinhamento do pin do Playwright a 1.65.0. A main já tem 11 dos 16 bumps (squash ab657aa34, pacote 5/#3064). Os 5 restantes (supabase-js, react-query, i18next, pdfjs-dist, Playwright 1.65) e os 8 arquivos de infra que fixam Playwright 1.65.0 foram deixados de fora de propósito, com motivo registrado no commit (i18next/pdfjs estouram o orçamento de bundle/assets; Playwright 1.65 derruba o E2E no Firefox) e confirmado pelo CI do tip (Build e E2E FAILURE). Nada de src/, edge ou migration. O Dependabot regenera esses bumps semanalmente; a branch não carrega trabalho único.

**`docs__update-pendencias-db-live-guard-261102`** — Snapshot de status do PENDENCIAS.md de 2026-11-02 (DB Live Guard com 6 falhas, types-sync disparado, fix --frozen=false do deploy de edges aguardando verificação). O arquivo foi reescrito 18 vezes na main desde então (hoje datado 2026-11-12/15) e registra DB Live Guard, types-sync e Deploy Edge Functions como resolvidos e verdes. Portar o texto reintroduziria informação falsa. Nada a recuperar.

**`f3__strict-false-baseline-20261018`** — Branch implementava a decisão F3 de 18/10 (strict=false no branch-protection da main, sem fila serial). Essa decisão foi revogada: a main hoje documenta strict=true como política vigente, proíbe mexer no strict, mede strict=true no baseline (2026-11-02) e apagou a fila serial (fila-merge.mjs/unit e auto-update-pr-branch.yml). Aplicar qualquer hunk regrediria o perímetro protegido pelo settings-guard. Nada útil pendente.

**`fix__ci-f1b-restaura-workflows-20261018`** — Branch de 18/10 que recriava o workflow de fila de merge (auto-update-pr-branch.yml + fila-merge.mjs), recriava settings-guard.yml e completava a doc do notifica-falha-main. Hoje: settings-guard.yml já está na main (mesmo conteúdo; cron reduzido depois, de propósito, para 1x/dia em Z030); a doc do notifica-falha-main já tem os campos falha/avisa com outro texto; e o auto-update-pr-branch.yml foi recriado por outra PR (#2210) e depois REMOVIDO de propósito pelo dono em 14/11 (pacote 6, #3113, commit 41853318c), com instrução vigente de não religar (merge-prs.md). Nada a recuperar; recriar o workflow contradiz a decisão atual.

**`fix__ci-verde-261021`** — A branch não era funcionalidade: consertava uma main que não compilava em 21/10 (código pela metade no merge_base — testes importando funções inexistentes em evolution-api, variáveis não declaradas no handler de presença do WhatsApp). A main resolveu a MESMA quebra no mesmo dia por outro caminho (PR #2156, commit 4b9585052) e desde então avançou muito. Tudo que importa para o negócio já está na main, em geral melhor: presença/digitando do WhatsApp (grupo com autor, canal privado, visto por último só na transição), backoff e reauth do Gmail, alertas de conexão com dedupe, transferência de conversa pelo helper único com compare-and-set, tipos e manifesto do banco regenerados em 15/11. Sobra apenas: (a) pareamento por número (conectar sem QR) — 4 funções utilitárias que nunca foram ligadas a rota, hook ou tela, e cujos testes a main apagou de propósito; (b) um job de cobertura no CI que a main recusa por escrito; (c) um Retry-After que contraria a decisão vigente da main. Nada de alto valor a recuperar; branch pode ser apagada.

**`fix__ci-workflows-vermelhos`** — A branch não entrega funcionalidade: é um reparo de emergência de uma main que não compilava em 19-21/10 (declarações duplicadas, símbolos inexistentes, concurrency duplicado). Para destravar o CI ela APAGOU código de produção: ~40 ações do evolution-api (set-settings, get-webhook, send-template, mark-unread, find-chats, find-messages...), dezenas de entradas da matriz de autorização do WhatsApp e o passo live-invariants do guarda de banco. A main resolveu a mesma quebra mantendo tudo. Portar hoje seria destruir funcionalidade de WhatsApp e afrouxar autorização. Os 272 testes com stub createLogger já estão na main em versão mais rica; os workflows já têm playwright 1.64.1, cache Bun, deno check --config, concurrency único e validate-runtime-proof. Sobram 3 ajustes de uma linha, de valor baixo, que não dependem da branch.

**`fix__sincronizar-migrations-sql-divergente-261101-0400`** — Branch de 01/11 tentava zerar 5 falhas "SQL divergente" do db-live-guard editando a migration do Copilot (16 DROP POLICY IF EXISTS) e registrando 4 exceções no evidence. A main resolveu o mesmo problema de outro jeito: manteve a migration imutável e fixou-a por hash no evidence (pinned-replay) + replay-known-failures; as 4 exceções já existem na main com hashes idênticos; a prosa de PENDENCIAS foi arquivada em docs/_arquivo/PENDENCIAS.md. Aplicar o patch da branch hoje quebraria o pin de hash. Nada a recuperar.

**`pr-123`** — Branch só mexe em artefatos derivados do banco (evidence de migrations, manifest, catálogo, types) gerados em 01/09/2026 para destravar o DB Live Guard. A main já registrou as 3 exceções de migration (#2829, #2026-11-09) e já regenerou manifest/catálogo/types em 15/11/2026 (#3136), com hashes conferidos contra o banco ao vivo. O que "falta" na main são linhas de objetos que não existem mais em produção (dedup_baseline_20260901, tags, contact_tags, payment_links, contact_purchases), hashes antigos que contradizem o ledger real e diferença de indentação do gerador velho. Nada a portar: reaplicar quebraria o guard de drift. Sem impacto em WhatsApp, inbox, envio ou login.

**`pr-1991`** — Pacote de correções de CI/guards de 16/10 (baseline typecheck, contratos de workflow, baselines db-audit, teste N-011) mais fix de scroll no chat e guarda de janela Talk X. Tudo que importa já está na main por outras PRs (#2021, #2156, #2385, pacotes 5/7), às vezes em forma melhor; o restante foi substituído de propósito (timeout 15 min, known-violations zerado, step live-invariants existe no YAML) ou está errado/contra spec (audit_logs não está na publication realtime em produção; rótulo "Melhor resposta" contradiz T04-039 e quebra 4 testes). Nenhum trabalho útil perdido; triagem anterior "PERDIDA" não se confirma.

**`pr-1998`** — A branch queria virar o copiloto RADAR em motor assíncrono (worker de fila com análise incremental em dois andares). Esse desenho JÁ está na main, reescrito contra o banco real: o próprio arquivo da main diz "Portado do desenho do #1998/#2000/#2002" (supabase/functions/_shared/copilot-tick.ts:19-20). A única peça de banco da branch (RPC merge_brinde_state) está byte-idêntica na main e aplicada em produção. O resto não deve ser portado: o contrato da branch contradiz o esquema vivo (temperature 0-10 vs CHECK 0-100; stage E1..E6 vs sale_stage novo_contato..perdido; brinde_state jsonb vs colunas brinde_*), o worker da branch depende de uma RPC que não existe (get_copilot_live_cron_secret) e tem defeito que impediria qualquer tick (valida/passa o job no lugar de job.payload). O custo por mensagem já tem gate na main e está DESLIGADO em produção, então não há decisão do dono pendente — a triagem anterior (DECISAO_DONO) fica refutada. Nada a recuperar; branch pode ser apagada.

**`pr-2002`** — Fase 5 do Copiloto RADAR (sugestões ao vivo em 3 caminhos, tone chips, split de balões e motor de dois andares tier-1/tier-2). Já está funcionando na main de ponta a ponta: AiTab → RadarPanel → RadarLive → LiveSuggestions + useLiveSuggestions, alimentados por ai-jobs-worker → _shared/copilot-tick.ts → copilot_insights, atrás da capacidade ai.capability.copilot_live (semeada desligada). O código da branch é a versão antiga desse mesmo desenho: a main o portou para o esquema real do banco, e o arquivo da branch grava em colunas que não existem em produção (copilot_insights.payload, copilot_sessions.stage). Nada de valor a recuperar.

**`pr-206`** — PR queria igualar 8 migrations ao ledger apagando comentários, trocar o no-op de 20260903200000 pelo REVOKE anon em record_failed_login e remover a exceção pinned-replay do migration-evidence.json. A main manteve de propósito o no-op + exceção (evita janela de força bruta no replay) e o checker ignora comentários SQL; a falha do DB Live Guard que motivou a PR foi corrigida por #207. Nada a portar.

**`pr-2190`** — Branch de 68 commits do dia 2026-10-23 cujo único objetivo era deixar a CI da main verde (testes, typecheck, guards de banco), mais artefatos daquela sessão de análise de PRs. A main avançou 3 semanas e já tem, por outros caminhos, tudo que tinha valor de produto: o filtro por segmento da campanha Talk X (migration equivalente aplicada em produção), a busca do chat de equipe, a fila offline por usuário, o estado de erro de base de conhecimento/sentimento/configurações, o aviso de desktop do War Room, o avatar com nome estável, a janela de período no KPI do dashboard, a tela de admin e a de migração de mídia. Os 413 arquivos de teste dessas áreas passam na main hoje, sem nenhuma falha — ou seja, o trabalho de consertar testes virou pó. O que a branch ainda traria é regressão: tirar a confirmação antes de disparar migração de mídia em massa, trocar o gate de templates de WhatsApp de supervisor para só-admin (tirando permissão de supervisor), desfazer o arquivamento restaurando o responsável em vez do status, afrouxar o ratchet do guard de banco com 3 exceções e perder a flag global de um escape de texto. Sobra uma única lacuna legítima e pequena: a guarda de contrato de banco do Talk X ainda só testa a versão de 5 parâmetros da função de destinatários; a versão com filtro de segmento, já no ar em produção, não é exercida por nenhum teste. Nenhum código de produto se perde ao apagar a branch, mas essa cobertura vale recuperar.

**`pr-2589`** — Tentava calar o db-live-guard tirando o prefixo `extensions.` de `gen_random_bytes` na migration 20261102012200 (convites de departamento). A main resolveu a causa raiz por outro caminho (migration 20261108090000, PR #2827: adiciona `extensions` ao search_path e remove o prefixo), já aplicada em produção; o guard está verde. O patch da branch, sozinho, quebraria o RPC de criar convite. Nada a recuperar.

**`pr-2971`** — Snapshot automático dos artefatos do banco (types.ts, schema-manifest/catalog, grants-baseline, known-violations) gerado em 2026-11-14. A main já tem o snapshot de 2026-11-15 (commit 143f44afd, PR #3136), que confere com o banco de produção. Nada a portar; os hunks divergentes da branch (remoção de talkx_campaign_resume_precheck e de comm_style) contradizem o banco atual e estariam errados.

**`pr-3016`** — Template genérico "ESLint" do marketplace do GitHub (eslint@8.10.0 + .eslintrc.js + SARIF). É o mesmo arquivo que a main já adicionou (#2158) e removeu de propósito em #2182 (61a973da6, 21/10/2026) por quebrar os contratos de workflow e falhar no startup; só muda o minuto do cron. Incompatível com o repo (eslint 9 flat config, sem .eslintrc), rodaria `eslint .` cru contra 319 arquivos de dívida legada. Lint já é coberto pelo lint-ratchet (husky pre-commit/pre-push) e code scanning pelo codeql.yml. Nada a recuperar.

**`pr-3017`** — PR adicionava o workflow-modelo genérico do GitHub para Deno (v1.x, sem config, `deno lint` + `deno test -A` na raiz). A main já testa as edge functions em Deno no job "Edge contracts" do ci.yml, com Deno 2.9.5, `scripts/ci/deno.json` e `--frozen`. O modelo é incompatível com o repo (sem deno.json na raiz, varreria testes Vitest/Playwright, regride pin de actions). Nada útil a recuperar; branch pode ser apagada.

**`pr-3018`** — PR adiciona o template padrão do GitHub "Node.js CI" (.github/workflows/node.js.yml) sem adaptação: npm ci com matriz Node 18/20/22. A necessidade (typecheck, testes, build em push/PR na main) já é coberta por ci.yml na main; o template quebraria em todas as matrizes (repo só tem bun.lock, engines node >=24). Nada a portar.

**`pr-3120`** — Tentativa de consertar o step do CI "Provar EXECUTE de merge_brinde_state" (db-guard.yml) subindo o cluster PostgreSQL nativo do runner na porta 5433. Falhou no CI real (check "Contrato DB offline" = FAILURE no tip d1ccc2912). O pacote 7 (b24e3150004c, PR #3123) resolveu a mesma necessidade por outro caminho — o teste fala por TCP com o service container que o job já tem (POSTGRES_SERVICE_*) — e está verde na main. O diagnóstico desta PR ficou registrado como comentário em db-guard.yml:1601-1605. Nada a recuperar.

**`pr-981`** — A PR só renomeava a migration do fix de NULL-bypass em handle_new_user_role (290000 → 300000) para resolver colisão de version com multiplix_cron_scheduler. A main resolveu a colisão pelo outro lado (cron renomeado para 320000, commit 097207fdd), o fix já está na main como 20260927290000 e aplicado em produção (função atual contém o coalesce(..., false)). A version 300000 já é usada em produção por fix_gamification_rpc_guard_anon, então aplicar a PR hoje criaria nova colisão. Nada a recuperar.

**`resolve-2199-from-main`** — Branch de CI (PR #2431, extração da #2199): guard anti-DROP de roles pg_* no docker-shim e mocks globais de virtualizador em src/test/setup.ts. O risco do shim (snapshot de roles vazio → drop de tudo) foi fechado na main por #2710 (aborta sem snapshot; pg_ é prefixo reservado do PostgreSQL). O hunk de setup.ts é desnecessário (o teste-alvo ChatMessagesArea.loop já tinha mocks próprios na base e a main usa mock por teste em 17 arquivos) e nocivo (remove writable:true e quebraria useFilesContainerColumns.test.tsx). Nada a portar; branch pode ser apagada.



---

## Parte C — As PRs desta sessão, uma a uma

### C.1 — Mergeadas (25)

Ordem cronológica de merge. "Verificado" é o que foi **rodado**, não o que deveria funcionar.

| # | O que resolve | Como foi verificado |
|---|---|---|
| [#3125](https://github.com/adm01-debug/Zapp_Web_V2/pull/3125) | Recupera o seletor Hoje/Semana/Mês da aba Metas (C130) — trabalho perdido **duas vezes** | CI verde |
| [#3126](https://github.com/adm01-debug/Zapp_Web_V2/pull/3126) | Expõe `isError` nos 3 componentes que consumiam hooks da #2873 | CI verde |
| [#3127](https://github.com/adm01-debug/Zapp_Web_V2/pull/3127) | Liga o motor do RADAR (gatilho + handler) — **nasce desligado** | CI verde; capacidade deixada em `false` de propósito |
| [#3128](https://github.com/adm01-debug/Zapp_Web_V2/pull/3128) | Documenta: chaves ElevenLabs sem crédito, MFA zerado, custo de IA sem tabela de preços | documentação |
| [#3135](https://github.com/adm01-debug/Zapp_Web_V2/pull/3135) | Pacote 8: 5 PRs de resgate + **2 defeitos reais fechados antes do merge** | CI verde |
| [#3136](https://github.com/adm01-debug/Zapp_Web_V2/pull/3136) | Sincroniza artefatos derivados do banco | guards do repo |
| [#3137](https://github.com/adm01-debug/Zapp_Web_V2/pull/3137) | Fundo do login em WebP — libera 40 KB e destrava o teto de assets | guard de tamanho de bundle |
| [#3138](https://github.com/adm01-debug/Zapp_Web_V2/pull/3138) | Endurece o filtro da ponte de banco externo contra nome reservado do PostgREST | contrato de edge |
| [#3139](https://github.com/adm01-debug/Zapp_Web_V2/pull/3139) | **Monta o painel RADAR ao vivo na Inbox** — resgate da #2419 e da branch `radar-motor-copilot-live` | CI verde |
| [#3140](https://github.com/adm01-debug/Zapp_Web_V2/pull/3140) | Botão da tela sem permissão do Talk X e escolha da objeção pelo copiloto | CI verde |
| [#3141](https://github.com/adm01-debug/Zapp_Web_V2/pull/3141) | **Os 329 dossiês**, um por branch/PR fechada | documentação da auditoria |
| [#3142](https://github.com/adm01-debug/Zapp_Web_V2/pull/3142) | RADAR aparece na primeira sessão sem reabrir a conversa | CI verde; substituiu o polling por gatilho `AFTER INSERT` na mesma transação |
| [#3143](https://github.com/adm01-debug/Zapp_Web_V2/pull/3143) | Guard de drift volta a distinguir **apply pendente** de divergência real | `check-migration-drift` + 95 testes do próprio guard |
| [#3144](https://github.com/adm01-debug/Zapp_Web_V2/pull/3144) | Pausa de envios por instância: freio manual, auto-pausa no 429, painel em Conexões | CI verde |
| [#3145](https://github.com/adm01-debug/Zapp_Web_V2/pull/3145) | **Login com 2FA não trava** quando o código é digitado antes de os fatores carregarem | CI verde |
| [#3147](https://github.com/adm01-debug/Zapp_Web_V2/pull/3147) | Clique da busca deixa de inflar o relatório; wizard trava sem audiência; Insights mostra dado real | CI verde |
| [#3149](https://github.com/adm01-debug/Zapp_Web_V2/pull/3149) | E2E logado volta ao verde: a varredura aponta para a tabela real de Insights de Busca | E2E Playwright verde |
| [#3150](https://github.com/adm01-debug/Zapp_Web_V2/pull/3150) | Contrato de runtime não aceita mais ler SQL de fora do repositório | guards do repo |
| [#3151](https://github.com/adm01-debug/Zapp_Web_V2/pull/3151) | **Análise de imagem: o modelo recebe a foto**, não um link de bucket privado | CI verde; `deployment-manifest` regenerado (o guard pegou que estava velho) |
| [#3153](https://github.com/adm01-debug/Zapp_Web_V2/pull/3153) | **Prova** de que nenhuma branch fechada levou trabalho junto: `itens-confirmados.json` com 226 evidências | a própria auditoria de 3 passadas |
| [#3154](https://github.com/adm01-debug/Zapp_Web_V2/pull/3154) | Quem não tem permissão para de ver "erro, tente novamente" | CI verde; `ESTADOS.md` regenerado (o guard pegou o deslocamento de linha) |
| [#3155](https://github.com/adm01-debug/Zapp_Web_V2/pull/3155) | **O botão de desligar a IA passa a desligar as 7 funções que cobram** | CI verde + `Deploy Edge Functions` SUCCESS + capacidade posta em `true` pelo dono às 23:38:07 UTC |
| [#3156](https://github.com/adm01-debug/Zapp_Web_V2/pull/3156) | Três defeitos do relatório de campanha que nenhum teste pegava | 6 testes novos, cada um provado por mutação |
| [#3157](https://github.com/adm01-debug/Zapp_Web_V2/pull/3157) | **Recriar o banco pelos arquivos deixa de apagar reação de cliente** | `check-migration-drift` 1137 arquivos exit 0; 95/95 no teste do guard; conferido no ledger que a migration já estava aplicada (merge não roda DDL) |
| [#3159](https://github.com/adm01-debug/Zapp_Web_V2/pull/3159) | **Oito defeitos da biblioteca de segmentos**, incluindo público estimado = base inteira | 16 testes novos; **prova inversa nos 9 fixes**; suíte completa de `src` 16.407 passed / 0 failed |

### C.2 — Fechada sem merge (1)

**[#3146](https://github.com/adm01-debug/Zapp_Web_V2/pull/3146) — "Kill switch do Copiloto passa a valer para as 7 edges de IA".**
Recusei o merge. A PR estava `mergeable: false, dirty`, e o cálculo de merge do GitHub mostrava
que ela **apagaria 7.945 linhas** de trabalho do mesmo dia — a pausa por instância da #3144 e meu
próprio fix do estimador de tokens. Reconstruí só as 10 linhas que de fato faltavam como
**#3155**, que foi mergeada. Fechei a #3146 com a explicação completa.
A branch `claude/feat-copiloto-edges-261115-1555` continua viva e **pode ser apagada**.

### C.3 — Abertas, esperando o dono (3)

| # | O que resolve | Por que não mergeei |
|---|---|---|
| [#3158](https://github.com/adm01-debug/Zapp_Web_V2/pull/3158) | RLS de supervisor do Copiloto: hoje o pedido de ajuda **não é lido por ninguém** e qualquer vendedor pontua (e trava) a conversa de qualquer colega | **Regra 8** — migration em produção **e** passo novo em `db-guard.yml`. 23/23 num Postgres real, com o bloco A provando as 3 falhas atuais antes da correção. As 3 tabelas têm 0 linhas em produção. |
| [#3160](https://github.com/adm01-debug/Zapp_Web_V2/pull/3160) | `commit_copilot_tick`: hoje, se a segunda gravação falha, o cursor já andou e **a análise que o provedor cobrou é perdida em silêncio** | **Regra 8** — migration + workflow. 25/25, com o bloco A reproduzindo a perda. Entrega só o DDL: o código que chama tem de vir **depois** do apply, senão o tick quebra. |
| [#3162](https://github.com/adm01-debug/Zapp_Web_V2/pull/3162) | A trilha da auditoria, as ferramentas, o handoff e este relatório saem do contêiner | Aguardando CI. É docs; pode ser mergeada sem decisão de negócio. |
