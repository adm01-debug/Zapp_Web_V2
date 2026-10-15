# Decisões pendentes do plano de Actions (15/10/2026)

**Para:** Joaquim (dono do produto) · **Plano:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-14.md`
**Itens:** W20, W64, W67, W74, W79, W84, W89, W90, as etapas que o plano marca como decisão sua.
**Medição:** 15/10/2026, entre 17:00 e 17:20 UTC. Tudo foi lido sem alterar nada: API do GitHub, API da Vercel e
consultas `SELECT` no banco oficial (`tnnnlkbymytvtqngbbqh`, confirmado por 4 jobs do `pg_cron` com esse endereço e
pela função `reserve_migration_version`).

Cada item tem: o que você decide, os números medidos (com a fonte), as opções com custo e risco, **uma recomendação**
e o passo exato. A ordem vai do maior ganho com menos esforço ao menor.

> **Custo em dinheiro do GitHub Actions: zero.** O repositório é público, e minutos de runner padrão em repositório
> público não são cobrados. Onde este documento fala em "custo", é tempo de espera, fila e ruído, não fatura.
> A exceção é a Vercel, que cobra build por time (ver W67).

## Atualização de 15/10/2026 (noite) — progresso desta sessão

- **W74 e W84: feitos.** PR [#1953](https://github.com/adm01-debug/Zapp_Web_V2/pull/1953) (`ci: W74 (tira service_role do E2E) + W84 (destrava CodeQL required)`),
  com auto-merge (squash) ligado pelo Joaquim. Depois do merge faltam os 2 passos manuais que já eram só clique:
  apagar `SUPABASE_SERVICE_ROLE_KEY` (após o primeiro `e2e-logado` verde) e adicionar `CodeQL` aos required checks.
- **W89 (parte SonarCloud): causa raiz encontrada, correção ainda não aplicada.** A nota D/E do código novo vem de
  **2 issues BLOCKER** (`json:S6418`, "possível segredo hard-coded") em `docs/reconciliation/evidence/
  publication-harness-hardening.json:568` e `docs/reconciliation/evidence/skins-probe-results.json:9` — confirmado
  **falso positivo**: é a chave `"src/styles/tokens.css": "<hash sha256>"`, a regra bateu na palavra "token" dentro
  de "tokens.css". Faltam 2 cliques do Joaquim em sonarcloud.io marcando as duas como Won't Fix/False Positive
  (nenhum token de agente alcança essa transição sem o `sonarqube-cli` autenticado). `sonarqube-cli` já instalado
  nesta sessão; autenticação via `SONARQUBE_CLI_TOKEN` em andamento (variável de ambiente só é lida numa sessão
  nova do Claude Code). As outras 79 BUG + ~327 VULNERABILITY abertas no "new code" não foram tocadas — é debt
  real, mas fora do escopo desta leva.
- **W89 (parte Supabase), W90, W67: sem mudança.** Continuam exigindo clique do Joaquim nos respectivos painéis —
  nenhum token de MCP ou API alcança `github.com/settings/installations` (confirmado por 403 explícito: "must
  authenticate with an access token authorized to a GitHub App") nem desconecta Git de projeto Vercel já existente
  (a API da Vercel tem o endpoint, o MCP não o expõe).
- **W20 e W79:** sem mudança — seguem como "não agir agora" (recomendação original).

---

## Resumo

| # | Item | O que se decide | Recomendação | Seu esforço | Precisa mesmo de você? |
|---|---|---|---|---|---|
| 1 | **W90** | Quais bots ficam no repositório | Ficar com **Codex, SonarCloud e Vercel** (mais o app Claude, que é como os agentes acessam o repo). Remover os outros 12 | ~10 min de cliques | **Sim**: só o dono da conta remove apps |
| 2 | **W89** | Supabase for GitHub e SonarCloud | **Remover o app Supabase. Manter o SonarCloud** sem afrouxar o portão | 2 min (+1 min opcional) | **Sim** para o Supabase. Sonar: 2 cliques — causa raiz já achada (ver atualização acima) |
| 3 | **W67** | Qual projeto Vercel é o oficial | **`zapp_web_v2`**. Desconectar `zapp-web-v2-main` do Git e apagar os 2 environments dele | ~5 min | **Sim**: painel da Vercel e configurações do repo |
| 4 | **W84** | Tornar o CodeQL obrigatório | ✅ **Feito** — PR [#1953](https://github.com/adm01-debug/Zapp_Web_V2/pull/1953). Falta só adicionar o check `CodeQL` aos required checks | 1 clique, depois do merge | Sim para a regra. A PR já está pronta |
| 5 | **W20** | Revisão obrigatória, `prevent_self_review`, conversas resolvidas | **Não ligar nenhum dos três agora.** Registrar o motivo no `CLAUDE.md` | 0 min (só confirmar) | Só confirmar: a recomendação é deixar como está |
| 6 | **W74** | Tirar a chave `service_role` do CI | ✅ **Feito** — PR [#1953](https://github.com/adm01-debug/Zapp_Web_V2/pull/1953), auto-merge ligado. Falta apagar o secret após 1º `e2e-logado` verde | 1 clique, depois do merge | Só apagar o secret no fim. O código já foi |
| 7 | **W64** | Credencial somente-leitura para os guardas | **Sim, mas depois do W63.** Role própria `ci_readonly`, não a interna do Supabase | ~15 min | **Sim**: senha de role e secret são só seus (seção 0 do `CLAUDE.md`) |
| 8 | **W79** | Supabase local para a suíte logada | **Não agora.** A suíte não falha por causa do banco: estoura o limite de 15 min e o login oscila. Corrigir isso primeiro, com código | 0 min | **Não**: o próximo passo é código, não política |

---

## 1. W90: quais bots ficam (maior ganho, menos esforço)

**O que você decide:** quais GitHub Apps continuam instalados neste repositório. A meta do plano é que uma PR nova
receba no máximo 3 comentários de bot.

**Dados medidos (PRs #1947, #1949 e #1950, via GraphQL `comments`/`reviews`/`reviewThreads` e `checkSuites`):**

| PR | Pushes | Comentários de bot | Reviews de bot | Achados úteis |
|---|---|---|---|---|
| #1947 (21 arquivos) | 4 | 28 (ECC Tools 24, Codex 1, CodeRabbit 1, Sonar 1, Vercel 1) | 4 (Greptile, todas "trial ended") | 0 |
| #1949 (34 arquivos) | 5 | 34 (ECC Tools 30, Codex 1, CodeRabbit 1, Sonar 1, Vercel 1) | 7 (Greptile 5, Codex 2) | 2 do Codex; Sonar motivou 2 commits de correção |
| #1950 (6 arquivos) | 2 | 16 (ECC Tools 12, Codex 1, CodeRabbit 1, Sonar 1, Vercel 1) | 4 (Greptile 2, Codex 2) | 2 do Codex |
| **Total** | **11** | **78** | **15** | **4 achados reais, todos do Codex** |

Dos 93 itens de bot, **66 (71 %) são do ECC Tools**: 6 comentários por push, sempre os mesmos. Os dois achados
"high" dele ("Environment variable with secret exposed" em `db-live-guard.yml` e `types-sync.yml`) são falso
positivo: passar secret por `env:` é justamente o padrão correto. O próprio comentário avisa que o app não tem
permissão de publicar check.

**O que cada app entrega hoje (check suites do commit `a349aad` da #1950 e da `main` `8d990fd`):**

| App | O que aparece | Útil? | Recomendação |
|---|---|---|---|
| **ChatGPT Codex Connector** | 1 resumo + revisão por push com achado | **Sim.** 4 achados em 2 PRs (P1 fila travada atrás de PR de fork; P2 job de reuso tratado como reprovado; P2 falha ambígua do `gh`; P2 fork em dia fora do "em voo"). Os 4 viraram commit de correção (`48d1dbb`, `e863c5b`, `a349aad` e `d16a0e0`) | **Manter** |
| **SonarQubeCloud** | 1 comentário + check `SonarCloud Code Analysis` | **Sim.** Gerou correções reais: S5145 (#1876), S4036 e 2 achados de fluxo na #1949 (commits `26da809`, `91fd214`) | **Manter** (ver W89) |
| **Vercel** | 1 comentário editado + 2 statuses + `Vercel Preview Comments` | Sim (link de preview). O `Vercel Agent Review` sai `neutral`: "Skipped because of insufficient Credit" | **Manter**. Desligar o Agent Review é opcional |
| **Claude** | check suite vazio | É o app pelo qual as sessões do Claude Code acessam o repositório | **Manter. Não remover** |
| ECC Tools | 6 comentários/push, sem check (sem permissão) | Não: repetitivo e com falso positivo | Remover |
| Greptile Apps | 1 review/push: "Your trial has ended" | Não | Remover |
| CodeRabbit | 1 comentário: não revisa (repo com menos de 10 estrelas) + **"Billing warning: we have not been able to collect payment … for more than 72 hours"**; status `CodeRabbit` = "Review skipped" | Não | Remover (e conferir a cobrança no painel do CodeRabbit) |
| cubic-dev-ai | check `neutral`: "reviewed 80,054 of the 80,000 allowed lines … Reviews resume on 1 November" | Não, até novembro | Remover |
| Devin.ai Integration | status `Devin Review`: "trial expired and no credits remaining" | Não | Remover |
| Mermaid Diagram Sync Assistant | check `skipped` em todo push ("No Mermaid diagram files … reference the changed source files") | Não | Remover |
| Supabase | check `Supabase Preview` `skipped` em todo push | Não (ver W89) | Remover |
| Gitar Bot, diffray, Netlify, Cloudflare Workers and Pages, CircleCI Checks | check suite criado e parado em `QUEUED`, sem resultado | Não: nenhum arquivo de configuração deles no repo | Remover |
| Cursor | check suite em `QUEUED` | Só se você usa agentes do Cursor neste repo | Remover se não usa |

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. Ficar com Codex + Sonar + Vercel (+ Claude) | ~10 min de cliques | Nenhum medido: os removidos não entregaram nada nas 3 PRs |
| B. Remover só os que avisam de trial ou cobrança (Greptile, CodeRabbit, cubic, Devin) | ~5 min | O ECC Tools continua gerando 71 % do ruído |
| C. Não mexer | 0 | PR de 6 arquivos com 20 itens de bot; o achado do Codex se perde no meio |

**Recomendação:** opção A.

**Passo exato:** abra <https://github.com/settings/installations>. Em cada app da coluna "Remover", clique em
**Configure** e:
- se "Repository access" estiver em **All repositories** e você usa o app em outro repositório: troque para
  **Only select repositories** e tire `Zapp_Web_V2`;
- se não usa o app em lugar nenhum: role até o fim e clique em **Uninstall**.

Confira na próxima PR: no máximo 3 comentários de bot (Vercel, Sonar e Codex).

---

## 2. W89: app Supabase e SonarCloud

**O que você decide:** (a) remover o app "Supabase for GitHub"; (b) manter, ajustar ou remover o SonarCloud.

**Dados medidos:**
- **Supabase:** o check `Supabase Preview` saiu `skipped` no HEAD da `main` (`8d990fd`) e na #1950, com a mensagem
  "This git branch is not associated with any Supabase Branch". Branching automático e deploy por Git foram
  desligados em 25/09 (`CLAUDE.md`). O deploy das edge functions é feito pelo `deploy-functions.yml`, e o
  `project_id` do `supabase/config.toml` é lido pela CLI, não pelo app. Nada no repositório depende do app.
- **SonarCloud na `main`:** **39 dos últimos 40 commits** com `SonarCloud Code Analysis` = failure (o 40º foi
  cancelado), de 04/10 a 15/10 (GraphQL `checkSuites(filterBy:{appId:12526})`). As condições que falham hoje não
  são as que o plano cita (duplicação/Reliability C). São **"D Reliability Rating on New Code (required ≥ A)"** e
  **"E Security Rating on New Code (required ≥ A)"** (check-run 116557712575). Nota E em segurança quer dizer que
  existe pelo menos um problema de segurança classificado como bloqueante no "código novo" acumulado da `main`.
- **SonarCloud nas PRs:** portão aprovado nas 3 PRs ("0 New issues"). Mesmo assim ele encontrou problema real
  durante a #1949, e os agentes corrigiram (S4036 e 2 achados de fluxo). Antes disso, a #1876 corrigiu um S5145.
- **Não consegui listar os problemas da `main`:** `sonarcloud.io` está bloqueado pelo proxy desta sessão.

**Opções para o SonarCloud:**

| Opção | Custo | Risco |
|---|---|---|
| A. Manter o portão como está e mandar um agente corrigir os problemas do código novo da `main` | Agente: algumas horas. Você: liberar `sonarcloud.io` na rede da sessão ou colar a lista | Nenhum. Se o E de segurança for real, é exatamente o que se quer achar |
| B. Afrouxar o portão (Reliability ≥ C, por exemplo) | 1 min no painel | Esconde o E de segurança sem saber o que é |
| C. Ajustar a definição de "código novo" para 30 dias | 1 min no painel | Baixo. O vermelho antigo sai da conta, mas o problema continua no código se não for corrigido |
| D. Desinstalar | 1 min | Perde a única ferramenta que achou S5145/S4036. O CodeQL não cobre essas regras |

**Recomendação:** remover o app Supabase e manter o SonarCloud (opção A). A opção C é aceitável como complemento,
nunca no lugar da A.

**Passo exato:**
1. Supabase: <https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/settings/integrations> → GitHub →
   **Disconnect**. Depois, em <https://github.com/settings/installations> → Supabase → **Configure** → tirar
   `Zapp_Web_V2` (ou **Uninstall** se nenhum outro projeto usa).
2. Sonar: abra
   <https://sonarcloud.io/project/issues?id=adm01-debug_Zapp_Web_V2&branch=main&inNewCodePeriod=true&issueStatuses=OPEN,CONFIRMED>
   e veja o que está lá. Para um agente corrigir, libere `sonarcloud.io` na política de rede do ambiente ou cole a
   lista na conversa.
3. (Opcional, opção C) SonarCloud → projeto → **Administration → New Code** → "Number of days" = 30.

---

## 3. W67: projeto Vercel oficial

**O que você decide:** qual projeto da Vercel é o oficial e o que fazer com os outros.

**Dados medidos (MCP da Vercel, time `juca1`, só leitura):**

| Projeto | Criado em | Domínios | Builds | Ligado a este repo? |
|---|---|---|---|---|
| **`zapp_web_v2`** | 27/08/2026 | **`zappweb.app.br`, `www.zappweb.app.br`, `zapp-web-v2.vercel.app`**, `zappwebv2-juca1.vercel.app` | todo push | Sim. É o que o `docs/DEPLOYMENT.md` chama de oficial |
| `zapp-web-v2-main` | **03/10/2026 14:02** | só `*.vercel.app` | **≥ 100 deploys de 00:21 a 17:14 de 15/10** (8 de produção), duplicando cada build | Sim |
| `zapp-web` | 03/09/2026 | só `*.vercel.app` | 1 deploy, 03/09, nunca mais | **Não.** O único deploy veio de `adm01-debug/zapp-web`, outro repositório (commit `1c60336`, "#149") |

- No GitHub há **13 environments**. 4 foram criados pela Vercel em 03/10 entre 14:04 e 14:09:
  `Preview – zapp_web_v2`, `Production – zapp_web_v2`, `Preview – zapp-web-v2-main` e `Production – zapp-web-v2-main`.
- **O projeto duplicado não funciona de verdade:** as edge functions só aceitam origem `zapp-web-v2.vercel.app`,
  `zappweb.app.br` e `zappwebv2-*-juca1.vercel.app` (`supabase/functions/_shared/cors-origins.ts`). Os previews
  `zapp-web-v2-main-*.vercel.app` não passam no CORS.
- Nenhum código ou workflow cita `zapp-web-v2-main`. As citações estão só em documentos de auditoria e evidência.
- Cada commit recebe 2 statuses (`Vercel – zapp_web_v2` e `Vercel – zapp-web-v2-main`) e 2 linhas no comentário da
  Vercel.

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. `zapp_web_v2` oficial; **desconectar o Git** do `zapp-web-v2-main` (o projeto fica, parado) e apagar os 2 environments dele | ~5 min | Baixo. Se alguém usava a URL `zapp-web-v2-main.vercel.app`, ela continua servindo o último build |
| B. Igual à A, mas **apagar** o `zapp-web-v2-main` | ~5 min | Baixo, mas não tem volta |
| C. Manter os dois | 0 | Build em dobro, status duplicado e preview que não chama as edge functions. Se o time tiver 1 build simultâneo, a fila também dobra |

`zapp-web` não precisa de ação neste item, porque não está ligado a este repositório. Apagá-lo é faxina opcional.

**Recomendação:** opção A.

**Passo exato:**
1. <https://vercel.com/juca1/zapp-web-v2-main/settings/git> → **Disconnect** do repositório.
2. Repositório → **Settings → Environments** → apagar `Preview – zapp-web-v2-main` e `Production – zapp-web-v2-main`.
   Os dois `… – zapp_web_v2` ficam, porque a Vercel os recria a cada deploy. O baseline do `settings-guard` já os
   trata como "gerenciados pela Vercel" (W13).
3. (Conferência) Supabase → Authentication → URL Configuration: se `zapp-web-v2-main.vercel.app` estiver nas URLs de
   redirecionamento, remover.

Verificação: o próximo commit tem um só status `Vercel – …`.

---

## 4. W84: tornar o CodeQL obrigatório

**O que você decide:** se a análise de segurança do CodeQL passa a bloquear merge.

**Dados medidos (`codeql.yml`, 160 runs de 08/10 10:57 a 15/10 17:04):**
- **148 sucessos, 12 cancelados, 0 falhas.** Os cancelados são push novo na mesma PR (`cancel-in-progress` em
  PR), não erro.
- Duração dos sucessos: **mediana 2,2 min, 90 % abaixo de 3,6 min**, máximo 23 min (1 caso). Roda em paralelo com o
  CI de ~6 min, então não aumenta a espera de ninguém.
- **Code Scanning: 0 alertas abertos agora** (`GET /code-scanning/alerts?state=open` = `[]`; eram 15 em 14/10).
- Existem **dois** checks diferentes, e a escolha importa:
  - `🔬 CodeQL (javascript-typescript)` (o job) só prova que a análise **rodou**. Ele fica verde mesmo quando
    encontra alerta novo.
  - `CodeQL` (do GitHub Advanced Security) é o que diz **"No new alerts in code changed by this pull request"**
    (#1950). Este é o que barra uma vulnerabilidade nova.
- **Armadilha que impede ligar hoje:** o `codeql.yml` tem `paths-ignore` (`docs/**`, `**/*.md`,
  `supabase/migrations/**`). Uma PR só de docs ou só de migration não dispara o CodeQL. Se o check for
  obrigatório, essa PR fica para sempre em "Expected — Waiting for status", e a fila trava. Isso inclui todo PR de
  lote que só tenha migration.

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. PR de agente tira o `paths-ignore` (ou faz o job sempre reportar), **depois** você exige o check `CodeQL` | Agente: 1 PR pequena. Você: 2 min. +~2 min de runner por PR de docs (grátis) | Baixo. Instabilidade do Code Scanning do GitHub trava merge enquanto durar (raro). `enforce_admins` está ligado, então nem você passa por cima sem desligar a regra |
| B. Exigir só o job `🔬 CodeQL (javascript-typescript)` | Igual à A | Só garante que rodou. Alerta novo passa do mesmo jeito |
| C. Manter informativo, com o SLA de 30 dias do W83 | 0 | Alerta `high` pode entrar e ficar até alguém olhar. Foi o que gerou os 15 alertas de 02–09/10 |

**Recomendação:** opção A. Exigir `CodeQL`, e só depois de a PR sem `paths-ignore` estar na `main`.

**Passo exato (depois da PR mergeada):**
1. Repositório → **Settings → Branches** → regra da `main` → **Require status checks** → adicionar `CodeQL`.
   Manter `strict` e os 6 checks atuais.
2. Repositório → **Settings → Code security → Code scanning → Protection rules** → "Check runs failure threshold":
   **High or higher** (segurança) e **Only errors** (qualidade).
3. No mesmo PR que muda a regra, atualizar a tabela "Perímetro do GitHub" do `CLAUDE.md` e
   `scripts/ci/github-settings-baseline.json` (7 checks). A regra do próprio `CLAUDE.md` exige isso.

---

## 5. W20: revisão obrigatória, `prevent_self_review` e conversas resolvidas

**O que você decide:** se liga alguma destas três travas: (1) revisão humana obrigatória na `main`;
(2) `prevent_self_review` nos 3 environments que pedem aprovação; (3) `required_conversation_resolution`.

**Dados medidos:**
- **1 colaborador** no repositório: `adm01-debug`, admin (`GET /collaborators`).
- As 3 PRs foram abertas por `adm01-debug`, e as respostas aos achados do Codex também saem como `adm01-debug`
  ("Generated by Claude Code"). Agentes e você usam **a mesma conta**.
- Branch protection hoje (`GET /branches/main/protection`): `strict: true`, 6 checks, `enforce_admins: true`,
  `required_linear_history: true`, `required_conversation_resolution: false`, sem revisão obrigatória. Bate com a
  tabela do `CLAUDE.md`.
- Environments com aprovador: `producao-ddl`, `db-ledger-evidence` e `legacy-import-destrutivo`, todos com
  revisor `adm01-debug`, `prevent_self_review: false` e `can_admins_bypass: true`. `producao-edge-functions` não
  tem revisor.
- Conversas: na #1949, 1 das 2 threads do Codex ficou **sem resolver** e a PR mergeou. Na #1950, idem (1 de 2).
  Os achados foram corrigidos; só ninguém clicou em "Resolve".
- A identidade separada para bots (E36: GitHub App `zapp-bot`, grátis) **não existe**.

**O que aconteceria se ligasse hoje:**

| Trava | Efeito com uma conta só |
|---|---|
| Revisão obrigatória | O GitHub não deixa o autor aprovar a própria PR. **Nenhuma PR mergearia** |
| `prevent_self_review` | Quem dispara o workflow é o único revisor. **`db-migrate` nunca seria aprovado**, e o DDL do lote pararia |
| Conversas resolvidas | Teria travado #1949 e #1950 até alguém resolver a thread. Com o auto-merge, a PR ficaria parada sem ninguém ver |

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. Não ligar nenhuma. Registrar no `CLAUDE.md`: "não, enquanto humano e agentes usam a mesma conta" | 0 | O gate dos environments continua sendo "branch protegida + você clica", não uma segunda pessoa. É o estado atual |
| B. Criar o `zapp-bot` (E36) e só então ligar `prevent_self_review` + revisão obrigatória | Algumas horas (criar o app, trocar o token dos agentes e dos workflows) | Muda o fluxo de todos os agentes. Seus merges passam a depender do seu clique em cada PR |
| C. Ligar só "conversas resolvidas", depois do W90 (só o Codex abrindo thread) | 1 min | Toda thread do Codex vira bloqueio, inclusive as que forem discordância. Exige que o agente resolva a thread ao corrigir |

**Recomendação:** opção A agora. Reavaliar a C duas semanas depois do W90, quando houver um único revisor bot.

**Passo exato:** nenhum clique. Responda "W20: A". O coordenador registra a decisão no `CLAUDE.md`.

---

## 6. W74: tirar a chave `service_role` do CI

**O que você decide:** aprovar a troca da limpeza do E2E, que hoje usa a chave mestra do banco, por uma função
restrita, e depois apagar o secret `SUPABASE_SERVICE_ROLE_KEY`.

**Dados medidos:**
- **Único consumidor do secret:** os 2 passos de limpeza do `e2e-logado.yml` (linhas 211–251). Nenhum outro workflow
  usa `SUPABASE_SERVICE_ROLE_KEY` (`grep` em `.github/workflows`). O secret existe no nível do repo desde 28/09.
- O que a limpeza apaga: `conversation_closures` e `catalog_send_events` do contato fixo
  `04dff4dc-c6b1-4283-ac22-bd8639804759`.
- Por que hoje precisa da chave mestra (consulta em `pg_class`/`pg_policy`): `conversation_closures` tem RLS e
  **nenhuma** policy de DELETE; `catalog_send_events` tem RLS e o usuário logado **não tem** permissão de DELETE.
- Linhas do contato de teste agora: **0** em `conversation_closures` (de 17 no total) e **0** em
  `catalog_send_events` (de 2 no total).
- As outras limpezas do E2E (mensagens, reações, rascunhos de campanha) já usam o login do próprio teste
  (`e2e/fixtures/e2e-contact.ts`, `e2e-talkx.ts`).
- Não existe hoje nenhuma função `*e2e*` no schema `public`.

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. Função `e2e_cleanup()` `SECURITY DEFINER` que só apaga se `auth.uid()` for o usuário de teste, e só as linhas do contato fixo. O teste chama com o próprio login. Depois, apagar o secret | Agente: migration + ajuste do workflow. Você: aprovar no lote (já faz) e apagar o secret (1 min) | Baixo. Mesmo que vaze a senha do usuário de teste, só dá para apagar linhas de teste |
| B. Mover o secret para um environment próprio, sem DDL | Você: ~5 min | A chave mestra continua no CI, só que com menos workflows enxergando |
| C. Manter | 0 | Um vazamento de log ou de workflow expõe a chave que ignora todo o RLS do banco de produção |

**Recomendação:** opção A. A função é DDL aditivo e vai no lote do dia, como qualquer outra.

**Passo exato:**
1. Quando a migration da função entrar no lote, aprove no `db-migrate.yml` (environment `producao-ddl`), como
   sempre.
2. Depois do primeiro `e2e-logado` verde sem a chave: repositório → **Settings → Secrets and variables → Actions** →
   `SUPABASE_SERVICE_ROLE_KEY` → **Remove**.

---

## 7. W64: credencial somente-leitura para os guardas

**O que você decide:** criar uma role de banco que só lê, para o `db-live-guard` e o `types-sync` pararem de usar a
URL com permissão de escrita (`DESTINO_URL`).

**Dados medidos (`pg_roles`):**
- **Não existe role do projeto para CI.** Os logins são todos do Supabase: `postgres`, `authenticator`,
  `supabase_admin` etc.
- **Existe `supabase_read_only_user`**, interno do Supabase: membro de `pg_read_all_data`, com
  `default_transaction_read_only=on`, `rolbypassrls=true`. É reservado da plataforma (extensão `supautils`), e não
  há garantia de que você consiga definir a senha dele. Não recomendo depender dele.
- **O código atual recusaria uma role nova:** `scripts/db-audit/database-identity.mjs:62` só aceita usuário de
  pooler no formato `postgres.<ref>`. Uma URL com `ci_readonly.<ref>` falha com "não identifica um projeto
  Supabase". É uma linha de código (agente), mas precisa entrar antes.
- **Pré-requisito pendente:** W63 (secrets em environments). O environment `banco-leitura` existe desde 15/10 14:10,
  mas sem secret. Os 14 secrets continuam no nível do repo, `DESTINO_URL` inclusive.
- Os guardas precisam ver linhas de fixture (check E85), então a role precisa ignorar RLS para leitura ou ter
  SELECT explícito nessas tabelas.

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. Role `ci_readonly` (LOGIN, `default_transaction_read_only=on`, SELECT só no que os guardas leem: `supabase_migrations` + tabelas de fixture + catálogo) por migration, sem senha; você define a senha e cria `DESTINO_URL_RO` em `banco-leitura` | Agente: migration + ajuste do validador. Você: ~15 min | Baixo. **Não** usar `pg_read_all_data` sem conferir o schema `vault`, onde ficam 2 segredos com a URL de produção |
| B. Usar `supabase_read_only_user` | Você: tentar definir a senha | Role reservada: pode não aceitar e pode mudar sem aviso |
| C. Não fazer. O W63 já separa o blast radius por environment | 0 | Um workflow de leitura com `bun install` (`types-sync`) continua tendo URL que escreve em produção |

**Recomendação:** opção A, **depois** do W63.

**Passo exato (quando a migration da role estiver aplicada):**
1. Supabase → SQL Editor: `ALTER ROLE ci_readonly PASSWORD '<senha forte nova>';`. A senha não vai para o Git nem
   para a conversa.
2. Montar a URL do pooler com usuário `ci_readonly.tnnnlkbymytvtqngbbqh` e criar o secret `DESTINO_URL_RO` em
   **Settings → Environments → banco-leitura**.
3. Avisar o agente para trocar `DESTINO_URL` por `DESTINO_URL_RO` nos dois workflows. Verificação: um
   `supabase db push` com essa URL tem de responder `permission denied`.

---

## 8. W79: Supabase local na suíte logada (recomendação: não agora)

**O que você decide:** se a suíte `e2e-logado` deixa de rodar contra produção e passa a subir um Supabase local no
CI, com dados de exemplo.

**Dados medidos (`e2e-logado.yml`, 24 runs de 08/10 a 15/10):**

| Resultado | Runs | Duração | Minutos |
|---|---|---|---|
| `cancelled` | 19 | **15 a 20 min cada** | 302 |
| `failure` | 5 | 2 a 10 min | 22 |
| `success` | **0** | — | — |

- **Os "cancelados" não são cancelamento por fila: estouram o limite de tempo.** No run 38771373068 (após o W71), o
  passo `📐 Run Playwright E2E` rodou de 16:47:12 a 17:02:17 e foi cortado ("The operation was canceled"), com o
  WebKit ainda executando. O job tem `timeout-minutes: 15` e roda 10 projetos do Playwright, entre eles
  Firefox e WebKit. Todos os 19 cancelados duraram ≥ 15 min. Um run cancelado antes de começar duraria segundos.
  Isso **corrige o diagnóstico N-03 do plano** ("o pendente é cancelado antes de começar"): o W71 (gatilho por
  `workflow_run`, concorrência por SHA) não muda isso, e os 2 runs depois dele também foram cortados.
- **O login oscila, não está fixo quebrado.** Os 5 `failure` param em `[setup] › e2e/auth.setup.ts › authenticate`
  (run 38773362900, 15/10 17:01). Os 19 cortados passaram do login, já que rodaram 15 min de testes (inferência pela
  duração).
- Custo de subir Supabase local no CI (estimado; não há medição no repo):
  - imagens do stack Supabase: ~2–3 GB, ~2–4 min para baixar e subir num runner limpo;
  - **bloqueio real:** `supabase start` aplica as 816 migrations e **para na primeira que falha**. O replay do zero
    tem **21 falhas esperadas** (`scripts/db-audit/replay-known-failures.json`) e 64 diferenças contra o manifesto
    (`CLAUDE.md`, seção 0, regra 7). A reconciliação mora fora do repo (`zapp-db-local`, no seu WSL), e não há
    `supabase/schema-baseline.sql` (D3 da arquitetura) nem `supabase/seed.sql`;
  - **risco que exige trava:** as migrations gravam a URL de produção em 4 jobs do `pg_cron`, 3 funções e 2 segredos
    do cofre. Um banco local sem `/etc/hosts` + `cron.launch_active_jobs=off` chama as edge functions reais
    (`CLAUDE.md`, seção 0, regra 6);
  - minutos de runner: grátis (repo público).

**Opções:**

| Opção | Custo | Risco |
|---|---|---|
| A. Não agora. Primeiro, com código de agente: subir o limite ou dividir o job (Chromium num, Firefox/WebKit noutro), e estabilizar o login (W06). Reavaliar o Supabase local quando existir o baseline D3 | Agente: 1–2 PRs. Você: 0 | A suíte continua tocando produção, com usuário e contato de teste dedicados |
| B. Supabase local já | Agente: dias (reconciliar as 21 falhas no CI, seed, travas de rede). +4–6 min por run | Alto: sem a trava de cron, o banco do CI chama produção |
| C. Desligar o `e2e-logado` | 0 | Perde o único teste de login real |

**Recomendação:** opção A. **Este item não precisa de decisão sua agora.** O que destrava a suíte é código (tempo
limite, divisão por navegador, login), não política.

**Passo exato:** nenhum.

---

## Achados laterais para o coordenador (não são decisões)

1. **N-03 do plano está errado no mecanismo:** os cancelamentos do `e2e-logado` são estouro de `timeout-minutes: 15`,
   não fila (ver W79). O W71 não resolve. Sugestão: uma etapa nova de código para tempo limite e divisão por
   navegador.
2. **Code Scanning com 0 alertas abertos** em 15/10 ~17:10 UTC. O W81 pode ser conferido como fechado.
3. **SonarCloud mudou de motivo:** a `main` falha hoje por Reliability D e **Security E** no código novo, não por
   duplicação. O texto do W89 no plano está desatualizado.
4. **Environments são 13, não 11 nem 9:** a tabela canônica do `CLAUDE.md` lista 9, sem contar os 4 da Vercel.
   Depois do W67 ficam 11 (9 + os 2 de `zapp_web_v2`).
5. **O token desta sessão lê `required_reviewers`/`prevent_self_review` dos environments** (o `GITHUB_TOKEN` de
   workflow leva 403). Útil para conferir o W11/W12.
6. MCP da Vercel: `list_projects`/`get_project` com `teamId` devolvem vazio ou 404. Sem `teamId` funciona (o time
   padrão já é `juca1`).

## O que não consegui medir

- **Lista dos problemas do SonarCloud na `main`:** `sonarcloud.io` é recusado pelo proxy desta sessão
  (`connect_rejected`).
- **Lista completa de apps instalados:** não há endpoint de instalações para este token. O inventário do W90 vem
  dos check suites e comentários das PRs. Um app que nunca comenta nem cria check não aparece ali.
- **Tempo real de `supabase start` + 816 migrations num runner:** não há medição no repositório. O número do W79 é
  estimativa.
- **Plano de cobrança da Vercel e limite de builds simultâneos do time:** a API lida não informa. O impacto do
  projeto duplicado em dinheiro fica em aberto.
- **URLs de redirecionamento do Supabase Auth:** não lidas (configuração da plataforma, não SQL). O passo 3 do W67 é
  conferência manual.
