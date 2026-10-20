# Handoff mestre para o Cline — execução corretiva exaustiva do Zapp Web V2

> **Destinatário:** Cline, executor Full Stack Sênior.
> **Data-base:** 2026-08-30, America/Sao_Paulo.
> **Repositório:** `adm01-debug/Zapp_Web_V2`.
> **Branch atual:** `chore/excellence-wave-01`.
> **Base da branch:** `origin/main` em `19b0f6448910bcb29ccd9ddd964f99a303a823b0`.
> **HEAD observado imediatamente antes deste handoff:** `b065b9c7d3da960a8cb3afe23bdee376d570de56`.
> **Commit da auditoria Codex:** `3861e1ae55ba789c20893a12d90d38d1039c4e9c`.
> **Estado da release:** **NO-GO para merge, deploy, banco e produção**.
> **Natureza:** ordem de execução local. Este documento não concede autorização para push, merge, rotação, SQL remoto, deploy, restart, replay ou qualquer mutação externa.

---

## 0. Prompt pronto para entregar ao Cline

Copie para uma nova tarefa do Cline o bloco abaixo, sem acrescentar credenciais:

```text
Você deve continuar o programa corretivo do Zapp Web V2 como executor Full Stack Sênior. Não reinicie do zero e não confie em alegações anteriores sem evidência.

LEITURA OBRIGATÓRIA, INTEGRAL E NESTA ORDEM:
1. CLAUDE.md
2. .codex/AGENTS.md
3. .agents/skills/zapp-web-v2/SKILL.md
4. docs/handoffs/handoff_cline_100_etapas_2026_08_30.md
5. docs/handoffs/cline_execution_log_2026_08_30.md
6. docs/handoffs/auditoria_exaustiva_plano_100_etapas_2026_08_30.md
7. docs/handoffs/handoff_cline_execucao_corretiva_exaustiva_2026_08_30.md

ESTADO DE PARTIDA:
- 001–004: execução VERIFIED; apenas revalidar se a base, o ambiente ou os arquivos mudarem.
- 005: BLOCKED; GitHub está confirmado, Supabase foi alegado pelo Cline mas não reproduzido pelo Codex, Vercel e Evolution ainda não têm identidade autenticada completa.
- 006: IN_PROGRESS; a ausência dos segredos no Git foi provada. MCP = ACCEPTED_TEMPORARY_RISK por adm01 até 2026-09-06 ou antes de qualquer escrita no banco; credencial Vercel = decisão independente pendente.
- 007–100: NOT_STARTED no ledger de execução, ainda que a implementação atual de algumas etapas seja parcial.
- Veredito atual: NO-GO para merge, deploy, banco e produção.

CORREÇÃO DE ROTA OBRIGATÓRIA:
- Não edite workflows como “etapa 006”. Isso foi uma interpretação incorreta. A etapa 006 trata exclusivamente da custódia das credenciais expostas.
- Os gatilhos atuais da CI já cobrem pull requests e pushes para main/develop. Qualquer melhoria de CI pertence às etapas 011–020 e deve ser reproduzida antes de editar.
- Preserve os IDs e títulos canônicos 001–100. Não invente etapas substitutas e não mude o significado de uma etapa.

REGRAS INEGOCIÁVEIS:
1. Trate toda afirmação anterior, inclusive sua, como alegação. Prove por código, comando, teste, CI ou leitura autenticada.
2. Nunca use, imprima, copie, persista ou faça teste com o URL autenticado do MCP nem com a credencial Vercel publicados em chat. Considere ambos comprometidos.
3. Nunca revele .env, Authorization, cookies, service-role keys, payloads pessoais ou secrets. Registre somente nomes, escopo e estado.
4. Projeto Supabase oficial: tnnnlkbymytvtqngbbqh, PostgreSQL 17.6. Qualquer mismatch interrompe a ação externa.
5. Não execute SQL remoto, migration, deploy, rotação, push, merge, workflow dispatch, alteração de proteção, restart da VPS, replay de webhook ou exclusão de dados sem aprovação explícita e pontual.
6. Não use git reset --hard, git clean -fd, checkout destrutivo, force push nem descarte mudanças do usuário.
7. Há drift bloqueante de migrations. Nenhuma migration pode ser aplicada enquanto 010/061 não estiverem reconciliadas.
8. Uma funcionalidade não está pronta porque existe tela, tabela, hook ou toast. Prove o fluxo ponta a ponta conforme a Definition of Done funcional deste handoff.
9. Não enfraqueça teste, baseline, budget, regra de lint ou check para fazê-lo passar.
10. Faça mudanças pequenas e reversíveis, em branches/PRs separados por risco. Não misture documentação, dependências, banco, segurança e features em um único PR.

MODO DE EXECUÇÃO:
- Atualize docs/handoffs/cline_execution_log_2026_08_30.md depois de cada cartão executado.
- Registre duas dimensões independentes: ESTADO_DA_EXECUCAO e ESTADO_DA_IMPLEMENTACAO.
- Para cada cartão registre: hipótese, baseline, arquivos, diff, comandos, exit code, contagem de testes, evidência, risco residual, rollback e próxima ação.
- Use o override de prioridade deste handoff. Os IDs permanecem canônicos, mas P0 de segurança vem antes de melhorias cosméticas.
- Faça leituras e alterações locais reversíveis de forma autônoma. Pare apenas nos checkpoints C/D definidos neste documento.
- Ao terminar cada PR local, execute os gates focados e o gate amplo aplicável; apresente o diff antes de pedir autorização de push.

COMECE AGORA:
1. faça preflight não destrutivo;
2. confirme que não existem mudanças concorrentes inesperadas;
3. corrija o ledger caso ele diverja deste handoff;
4. encerre localmente tudo o que for possível em 005–010;
5. prepare, sem executar, o pedido mínimo de decisão/autoridade para os bloqueios externos;
6. inicie o PR local de hotfix P0 das etapas 051–060, começando por testes que reproduzam spoofing, replay, RBAC ausente e SSRF.

Não aguarde aprovação para leitura, diagnóstico, teste ou patch local reversível. Aguarde obrigatoriamente antes de qualquer ação externa ou sensível.
```

---

## 1. Missão e critério de sucesso

A missão não é “marcar 100 linhas como feitas”. É entregar um sistema cuja segurança, comportamento funcional, banco, performance e operação sejam comprováveis no mesmo SHA.

O programa só termina quando:

- zero P0 estiver aberto;
- cada P1 estiver corrigido ou formalmente aceito com proprietário, prazo e compensação;
- nenhuma credencial exposta continuar válida sem decisão consciente, prazo e compensação do proprietário;
- migrations locais, ledger remoto, catálogo e tipos tiverem paridade explicada;
- autenticação, autorização por papel e isolamento de tenant estiverem testados negativamente;
- webhooks públicos provarem autenticidade, freshness, idempotência e proteção contra replay;
- o audit de supply chain, secret scanning, contratos, banco, coverage, E2E, build e budgets forem gates reais;
- funcionalidades anunciadas como disponíveis tiverem integração/persistência real e E2E; facades estiverem ocultas, removidas ou rotuladas `DEMO`;
- Vercel, Supabase e Evolution GO tiverem identidade, deploy, rollback, telemetria e runbooks verificados;
- uma release candidata imutável passar pela auditoria 096 e receber aprovação 098 antes do canary 099;
- o relatório 100 apontar evidência primária e não alegações.

## 2. Fontes de verdade e precedência

Use esta ordem quando documentos divergirem:

1. identidade autenticada e read-only do serviço consultado na sessão corrente;
2. código e configuração do SHA efetivamente auditado;
3. testes reproduzidos no ambiente limpo e resultados da CI no mesmo SHA;
4. `CLAUDE.md`, guards de identidade, migrations, catálogo e tipos versionados;
5. auditoria Codex de 2026-08-30;
6. diário do Cline;
7. handoff original e este handoff.

Uma fonte inferior nunca autoriza ignorar mismatch em fonte superior. Toda evidência deve trazer data, SHA, ambiente e método de obtenção.

### 2.1 Coordenadas canônicas

| Sistema | Identidade esperada | Condição de parada |
|---|---|---|
| GitHub | `adm01-debug/Zapp_Web_V2`, default `main` | owner/repo/default branch diferentes |
| Supabase | ref `tnnnlkbymytvtqngbbqh`, PostgreSQL 17.6, Supabase Cloud | outro ref, PG major diferente ou self-hosted |
| Vercel | `juca1/zapp-web-v2`, project id `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` | outro projeto/team ou identidade não autenticada |
| Evolution GO | projeto `evolution-go-rxj2`, VPS Hostinger `187.77.151.129` | outro host/projeto/container |
| Webhook principal | `evolution-webhook` no projeto Supabase oficial | URL/projeto diferente |

O project ref, project id e IP são identificadores operacionais, não substituem autenticação. Não registre credenciais associadas a eles.

## 3. Estado independente já comprovado

### 3.1 Execução do Cline

| Faixa | Estado de execução | Instrução |
|---|---|---|
| 001–004 | `VERIFIED` | preservar; revalidar somente se a base mudar |
| 005 | `BLOCKED` | fechar identidades read-only sem usar credenciais expostas |
| 006 | `IN_PROGRESS` | MCP com aceite temporário até 2026-09-06; Vercel ainda aguarda decisão |
| 007–100 | `NOT_STARTED` | executar pelo override de prioridade |

### 3.2 Implementação atual das 100 etapas

- `CONFIRMADA`: 4.
- `PARCIAL`: 49.
- `FALHA`: 24.
- `AUSENTE`: 17.
- `BLOQUEADA`: 6.

Esses números são baseline de 2026-08-30; não os copie para o fechamento. Recalcule a partir da evidência final.

### 3.3 Baseline técnico a preservar como comparação

| Gate/medida | Resultado observado | Meta de saída |
|---|---|---|
| instalação congelada | PASS; `bun.lock` intacto | continuar PASS |
| testes dos scripts CI | 23/23 PASS | continuar PASS e ampliar |
| lint ratchet | PASS com 1.123 ocorrências | não aumentar; reduzir por domínio |
| lint completo | FAIL: 891 erros, 232 warnings | zero erro; warnings com prazo/owner |
| typecheck atual | PASS com `strict: false` | manter PASS durante migração |
| dry-run strict | FAIL: ~146 erros | ratchet decrescente até zero |
| Vitest | 2.493 PASS, 32 skipped, 152 arquivos | manter; eliminar warnings e skips críticos |
| contratos | 160 PASS, 3 arquivos | cobrir todas as fronteiras P0/P1 |
| coverage | FAIL: provider ausente | executar e bloquear regressão |
| build | PASS | continuar PASS |
| dependências | FAIL: 1 crítica e 43 altas | zero crítica; altas só por exceção formal |
| drift de migrations | FAIL | paridade ou diferença esperada documentada |
| bundle | 7.864,63 KiB JS+CSS raw; 2.207,93 gzip; 1.866,56 Brotli | budgets aprovados e bloqueantes |
| CSS inicial | 205,59 KiB; budget 80 KiB | abaixo do budget ou budget recalibrado com decisão |
| maior chunk | Mapbox ~1.635,70 KiB; budget 200 KiB | sob demanda e dentro do budget aplicável |
| source maps | ~23,02 MiB | upload privado + remoção, ou desabilitados |

### 3.4 Bloqueadores P0/P1 conhecidos

1. `evolution-webhook` aceita tráfego público sem prova de assinatura, freshness ou replay protection.
2. `whatsapp-webhook`, `gmail-webhook` e `elevenlabs-webhook` não provam autenticidade do provedor.
3. `public-api` usa token global plaintext, exposto na UI administrativa, sem escopo por tenant.
4. `evolution-api` e funções com service role não têm autorização granular por ação/tenant suficiente.
5. `fetch-link-preview` e `ai-transcribe-audio` mantêm SSRF explorável; redirects e destinos resolvidos não são revalidados integralmente.
6. RPCs `get_connection_qr_code` e `get_connection_instance` mantêm risco de IDOR em migrations locais.
7. prefixo `20260829100000` aparece em duas migrations locais e o drift remoto relatado ainda não foi reconciliado.
8. CI tolera vulnerabilidades e usa um grep que não falha fechado para secrets.
9. Sentry, n8n, Google Calendar, pagamento, Meta CAPI e partes de LGPD são facades ou implementações incompletas.
10. documentação afirma PWA/integrações/“100%” que o código não sustenta.

## 4. Modelo de autorização

| Classe | Ação | Autonomia |
|---|---|---|
| A | leitura local/remota, testes, builds, consultas metadata-only, inspeção de diff | permitida, sem expor segredo/PII |
| B | código, testes, docs, scripts e migrations locais ainda não aplicadas | permitida na branch local |
| C | push, PR, dispatch não produtivo, mudança remota reversível | pedir aprovação pontual |
| D | secrets, banco oficial, deploy, merge, produção, restart, replay, dados | pedir aprovação pontual com rollback |

Regras:

- aprovação de uma ação não se estende à seguinte;
- “pode prosseguir” não significa permissão genérica de produção;
- SQL somente leitura também exige identidade comprovada e consulta sem dados pessoais;
- gere migrations localmente, mas pare antes de aplicá-las;
- prepare comandos de deploy, mas não os execute;
- não use a credencial Vercel exposta para “só consultar”.

### 4.1 Paradas obrigatórias

Interrompa a ação, preserve o estado e registre `BLOCKED` se:

- identidade não corresponder às coordenadas canônicas;
- houver dirty tree/edits concorrentes que colidam com o cartão;
- o diff incluir segredo, PII, payload real ou arquivo fora do escopo;
- migration tiver versão duplicada, ordem ambígua ou hash divergente;
- teste revelar falha de tenant/RLS, perda de dados ou bypass de autorização;
- o rollback não puder ser explicado e testado;
- o provedor não oferecer o mecanismo de autenticação assumido;
- for necessário escolher produto/fornecedor/contrato sem decisão do proprietário.

## 5. Protocolo de evidência e estados

### 5.1 Duas dimensões obrigatórias

`ESTADO_DA_EXECUCAO`:

- `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`, `SKIPPED_WITH_EVIDENCE`, `ROLLED_BACK`.

`ESTADO_DA_IMPLEMENTACAO`:

- `CONFIRMADA`, `PARCIAL`, `FALHA`, `AUSENTE`, `BLOQUEADA`.

Nunca use `VERIFIED` para dizer apenas que o problema foi encontrado. Nunca use `CONFIRMADA` para UI mockada, persistência local ou documentação.

### 5.2 Registro obrigatório por cartão

```markdown
### Etapa NNN — <título canônico>
- ESTADO_DA_EXECUCAO: IN_PROGRESS
- ESTADO_DA_IMPLEMENTACAO: FALHA
- SHA/base/branch:
- Hipótese e risco:
- Baseline reproduzido:
- Arquivos lidos:
- Arquivos alterados:
- Comandos e exit codes:
- Testes: pass/fail/skip + duração:
- Evidência primária:
- Diff revisado:
- Segurança/PII:
- Rollback:
- Risco residual:
- Próxima ação/dependência:
- Commit local:
```

Logs extensos devem ir para artefato temporário fora do repositório ou artifact de CI. O diário recebe resumo determinístico; nunca recebe segredo.

### 5.3 Loop de cada alteração

1. provar base/branch/dirty tree;
2. reproduzir falha;
3. escrever teste negativo ou fixture mínima;
4. implementar menor correção de causa raiz;
5. rodar teste focado;
6. rodar gates do domínio;
7. revisar diff, permissões, logs e fallback;
8. provar rollback;
9. atualizar diário;
10. fazer commit local Conventional Commit;
11. somente então pedir autorização para ação C/D, se necessária.

## 6. Preflight e gates

### 6.1 Preflight seguro de cada sessão

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git log --oneline --decorate -8
node --version
bun --version
git diff --check
```

Se precisar atualizar referências, use `git fetch --no-tags origin main`. Não faça rebase/merge automático sobre dirty tree.

### 6.2 Gate local mínimo atual

```bash
bun install --frozen-lockfile
node --test scripts/ci/*.unit.mjs
node scripts/ci/check-workflow-pins.mjs
node scripts/ci/lint-ratchet.mjs
bun run typecheck
bun run test
bun run test:contracts
bun run build
node scripts/db-audit/supabase-usage-guard.mjs
node scripts/db-audit/check-migration-drift.mjs
git diff --check
```

O drift já é esperado falhar até 010/061. Registre-o como bloqueio conhecido; não o silencie.

### 6.3 Gate alvo a construir

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test:coverage
bun run test:contracts
bun run test:db
bun run test:e2e
bun run test:a11y
bun run build
bun run check:bundle
bun run check:lighthouse
bun run check:secrets
bun run check:dependencies
node scripts/db-audit/supabase-usage-guard.mjs
node scripts/db-audit/check-migration-drift.mjs
git diff --check
```

Não declare esse gate disponível antes de criar os scripts, suas unit tests e a CI correspondente.

## 7. Ordem real de execução e topologia de PRs

Os IDs continuam 001–100 para rastreabilidade, mas a ordem de risco é:

1. **Custódia/identidade:** 005–010.
2. **Hotfix de segurança:** 051–060.
3. **Supply chain/CI:** 011–020.
4. **Banco e autorização:** 061–064, depois 065–070.
5. **Confiança de mudança:** 021–040.
6. **Verdade funcional:** matriz funcional deste documento, ligada a 008/051/088/097.
7. **Performance e WCAG:** 041–050.
8. **Operação/infra/governança:** 071–095.
9. **Release:** 096–100.

### 7.1 PRs locais recomendados

| PR | Escopo | Etapas | Não misturar |
|---|---|---|---|
| 01 | custódia, baseline e docs de decisão | 005–010 | rotação real, SQL, feature |
| 02 | webhooks e autenticação externa | 051–054, 056–057, 076 | dependências gerais, UI |
| 03 | RBAC/service role/API pública | 054–055, 059, 063–064 | observabilidade cosmética |
| 04 | SSRF e fetch seguro | 058 | refactors alheios |
| 05 | supply chain e CI | 011–020 | mudanças funcionais |
| 06 | drift/migrations/RLS | 061–064 | aplicação remota |
| 07 | testes, coverage, strict, lint | 021–040 | feature nova |
| 08 | performance/WCAG | 041–050 | rebranding/UI cosmética |
| 09+ | uma feature/integrador por PR | matriz funcional | vários provedores no mesmo PR |
| ops | observabilidade/infra/runbooks | 065–095 | deploy sem aprovação |
| release | candidato e promoção | 096–100 | qualquer dívida nova |

Use commits Conventional Commits, um motivo por commit. Não altere baselines no mesmo commit que corrige o código, salvo regeneração mecânica revisável e justificada.

---

# 8. Cartões executáveis 001–100

Cada cartão abaixo complementa o handoff original. Em conflito, prevalece a evidência atual e a opção mais segura.

## 001 — Ler as regras e declarar entendimento

- **Baseline:** execução `VERIFIED`; implementação `CONFIRMADA`.
- **Executar:** não refazer trabalho. Confirmar no diário que as sete fontes do prompt foram lidas e registrar instruções novas encontradas desde o último SHA.
- **Provar:** caminhos, SHA e resumo das Classes A–D; nenhum segredo na resposta.
- **Aceite:** entendimento inclui NO-GO, projeto Supabase oficial, preservação do working tree e proibição de mutação externa.
- **Reabrir se:** `CLAUDE.md`, `.codex/AGENTS.md`, skill ou handoffs mudarem.

## 002 — Sincronizar a base de trabalho sem destruir alterações

- **Baseline:** execução `VERIFIED`; branch nasceu de `origin/main@19b0f644` e agora contém commits locais documentais.
- **Executar:** `git fetch --no-tags origin main`, registrar `HEAD`, `origin/main`, merge-base, ahead/behind, commits exclusivos, arquivos tracked/untracked e eventual trabalho paralelo.
- **Provar:** `git status --short --branch`, `git log origin/main..HEAD`, `git diff --stat origin/main...HEAD` e `git diff --check`.
- **Aceite:** nenhuma mudança descartada, nenhum rebase implícito, branch e base inequívocas.
- **Parada:** conflito com edição alheia; não resolver com “main wins”.

## 003 — Fixar e registrar o ambiente de ferramentas

- **Baseline:** execução `VERIFIED`; Node 24.19.0, Bun 1.4.0; `.nvmrc` ainda declara 20.
- **Executar:** preservar o baseline e deixar a correção de toolchain para 014. Rodar instalação congelada somente quando `package.json`/`bun.lock` mudarem.
- **Provar:** versões, exit code, hash/status de `bun.lock` antes/depois.
- **Aceite:** nenhuma modificação do lockfile sem alteração consciente de dependência.
- **Rollback:** restaurar somente artefatos criados pelo próprio executor; nunca descartar alteração preexistente.

## 004 — Criar o diário de execução e a matriz de decisões

- **Baseline:** execução `VERIFIED`; 100 IDs/títulos canônicos já reconciliados pelo Codex.
- **Executar:** estender a tabela com `ESTADO_DA_EXECUCAO`, `ESTADO_DA_IMPLEMENTACAO`, dependência, evidência e PR; não regenerar títulos por fonte improvisada.
- **Provar:** script deve comparar exatamente os 100 títulos deste documento, do handoff original e do ledger; quantidade sozinha não basta.
- **Aceite:** 100 IDs únicos, ordenados, títulos idênticos e seção de decisões com owner/prazo.
- **Parada:** qualquer script que sobrescreva notas manuais ou resultados já auditados.

## 005 — Verificar identidades de todos os alvos sem mutação

- **Baseline:** execução `BLOCKED`; implementação `BLOQUEADA`. GitHub `MATCH`; Supabase `MATCH` alegado pelo Cline, não reproduzido pelo Codex; Vercel/Evolution `PARTIAL`.
- **Executar localmente:** confirmar `origin`, `supabase/config.toml`, `scripts/db-audit/database-identity.json`, workflow/CLI configs e coordenadas públicas.
- **Executar remotamente somente com credencial segura não exposta:** obter metadata autenticada read-only de Vercel e Hostinger/Evolution; para Supabase, fazer handshake da sessão e apenas `current_database/current_user/version` e metadata de projeto.
- **Provar:** tabela `esperado | observado | fonte | horário | MATCH/MISMATCH`; não guardar token nem resposta com PII.
- **Aceite:** quatro identidades `MATCH` na sessão corrente. `PARTIAL` não é `VERIFIED`.
- **Parada:** qualquer uso da credencial publicada ou qualquer mismatch. Nesse caso, manter `BLOCKED` e seguir apenas trabalho local independente.

## 006 — Tratar o URL autenticado do MCP como credencial exposta

- **Baseline:** execução `IN_PROGRESS`; implementação `PARCIAL`. Busca no Git/histórico não encontrou persistência. MCP tem `ACCEPTED_TEMPORARY_RISK` por adm01 até 2026-09-06 ou antes de qualquer escrita no banco; Vercel permanece sem decisão.
- **Executar:** manter os valores fora de terminal, logs e arquivos. Preparar dois runbooks separados de revogação/rotação, propagação segura, validação do valor novo e invalidação do antigo.
- **Decisão exigida:** preservar a decisão temporária do MCP e requisitar rotação quando vencer o prazo ou antes de escrita no banco; para Vercel, registrar `ROTATE_APPROVED`, `ROTATED` ou `ACCEPTED_TEMPORARY_RISK`, com owner e prazo. Recomendar rotação.
- **Provar:** scanners mostram ausência no repo; após autorização Classe D, o valor antigo deve falhar e o novo deve funcionar apenas no canal seguro. Registrar somente data/ator/estado.
- **Aceite:** a decisão Vercel está fechada e o prazo/condição do MCP está monitorado. Ausência no Git isoladamente não fecha o cartão.
- **Proibição:** não editar `.github/workflows/**` como parte desta etapa e não reutilizar o segredo comprometido para testar acesso.

## 007 — Inventariar superfícies de segredo e dados sensíveis

- **Baseline:** implementação `PARCIAL`; GitHub secret scanning/push protection existem, inventário integral não.
- **Executar:** mapear, por nome, ambiente, sistema, consumidor, owner, idade, rotação e fallback: GitHub Secrets, Vercel envs, Supabase Secrets, Cloudflare/MCP, Hostinger/Evolution, Bitrix, Google, ElevenLabs, Meta, Sicoob, SIP e bancos externos.
- **Implementar:** scanner fail-closed pertence a 017; nesta etapa criar o inventário sanitizado e política que proíbe secrets em `VITE_*`, logs e banco plaintext.
- **Provar:** busca em tracked files e histórico com scanner confiável; revisar bundle para nomes/valores proibidos; classificar falso positivo sem inserir allowlist ampla.
- **Aceite:** 100% dos nomes referenciados em código/workflows/config têm owner, escopo e mecanismo de rotação; zero segredo real versionado.
- **Artefato:** documento sanitizado em `docs/security/`, sem valores e sem exemplos semelhantes a chaves reais.

## 008 — Capturar o baseline completo da revisão atual

- **Baseline:** implementação `PARCIAL`; a auditoria Codex mediu gates, mas o Cline ainda não consolidou artefato próprio no ledger.
- **Executar:** medir três vezes quando houver variação; registrar duração, exit code, pass/fail/skip, versão, SHA e ambiente para install, CI units, lint ratchet/full, typecheck normal/strict, unit, contracts, coverage, build, audit, DB guards e migration drift.
- **Adicionar autenticidade funcional:** executar smoke de cada rota anunciada e classificar `REAL`, `PARTIAL`, `FACADE`, `DEMO`, `DISABLED` ou `ABSENT`; não alterar código nessa captura.
- **Provar:** anexar resumo determinístico, não apenas “passou”; separar falha preexistente de regressão.
- **Aceite:** baseline reproduzível no mesmo SHA e todas as divergências contra a seção 3 explicadas.
- **Parada:** comando que exija segredo real em máquina não segura; usar fixture sintética ou registrar bloqueio.

## 009 — Capturar baseline de UX, bundle e rede

- **Baseline:** implementação `PARCIAL`; tamanhos foram medidos, Lighthouse/waterfall/device matrix não.
- **Executar:** build limpo; medir raw/gzip/Brotli, entry, CSS linkado, preloads, source maps e top 20 chunks; rodar Lighthouse 3x com cache frio em mobile e desktop; capturar LCP/CLS/INP/TBT, requests, waterfall e rotas críticas.
- **Rotas mínimas:** login, inbox, conversa, contatos, dashboard, campanhas, integrações e uma rota Mapbox/PDF/charts.
- **Provar:** mediana de três execuções, configurações do navegador/CPU/rede, artefatos versionados apenas quando pequenos e sanitizados.
- **Aceite:** top offenders têm owner e hipótese; nenhum número simulado; medidas vinculadas ao SHA.
- **Parada:** teste contra produção que gere mensagem, cobrança ou integração externa.

## 010 — Reconciliar migrations do repositório e do banco em modo leitura

- **Baseline:** implementação `FALHA`. Há dois arquivos com prefixo `20260829100000`; o Cline alegou 16 versões remotas sem arquivo local.
- **Executar local:** rodar `node scripts/db-audit/check-migration-drift.mjs`; listar nome, versão e hash de todos os candidatos, `_superseded` e `_foreign`; identificar qual migration duplicada foi aplicada e dependências de ordem.
- **Executar remoto:** somente após 005 `MATCH`, consultar ledger e hashes em modo read-only. Não copiar conteúdo de dados.
- **Classificar cada divergência:** `PARITY`, `EXPECTED_DIFFERENCE`, `LOCAL_ONLY`, `REMOTE_ONLY`, `HASH_MISMATCH`, `DUPLICATE_VERSION` ou `UNKNOWN`.
- **Plano:** nunca renomear migration já aplicada sem estratégia de ledger. Preparar migration compensatória/reconciliação e rollback; a execução fica para checkpoint D em 061/084.
- **Aceite:** zero `UNKNOWN`; duplicata resolvida de modo histórico seguro; relatório local/remoto completo; guard passa com evidência aprovada.
- **Parada:** qualquer escrita, reparo de ledger ou `supabase db push`.

## 011 — Transformar o audit de dependências em backlog verificável

- **Baseline:** implementação `PARCIAL`; 1 crítica e 43 altas no grafo instalado.
- **Executar:** exportar resultado sanitizado de `bun audit --audit-level=high`; para cada CVE/advisory mapear pacote raiz, cadeia transitiva, componente alcançável, cenário explorável, versão corrigida, breaking change, owner e SLA.
- **Classificar:** `EXPLOITABLE`, `NOT_REACHABLE_WITH_EVIDENCE`, `DEV_ONLY`, `FIX_AVAILABLE`, `NO_FIX`, `ACCEPTED_TEMPORARILY`.
- **Provar:** não aceitar “transitiva” como mitigação; incluir import/call path ou teste de reachability.
- **Aceite:** 100% dos achados crítica/alta têm decisão, owner e prazo; backlog não contém segredo.

## 012 — Corrigir vulnerabilidades diretas em lotes pequenos

- **Baseline:** implementação `FALHA`.
- **Executar:** atualizar primeiro dependências diretas com fix compatível; um ecossistema por commit; ler changelog oficial; evitar update indiscriminado.
- **Testar por lote:** frozen install, typecheck, unit, contracts, build e fluxo da biblioteca; comparar lock diff por pacote.
- **Provar:** advisory deixa de resolver no grafo ou recebe exceção formal; nenhum baseline de segurança é inflado.
- **Aceite:** zero crítica; altas exploráveis corrigidas; altas residuais com compensação, prazo e aprovação.
- **Rollback:** revert do commit do lote, preservando lock consistente.

## 013 — Isolar ou substituir a cadeia de planilhas vulnerável

- **Baseline:** implementação `PARCIAL`; `xlsx` está fora do entry, mas permanece vulnerável.
- **Executar:** localizar todos os imports e fluxos de upload/exportação; avaliar versão/fork/substituto mantido; preferir processamento server-side isolado para arquivo não confiável.
- **Controles mínimos:** tamanho/linhas/colunas/sheets, MIME + magic bytes, timeout, memória, fórmulas perigosas, zip bomb, CSV injection, nomes/path traversal e conteúdo malformado.
- **Testar:** fixtures sintéticas hostis, arquivo grande, fórmula, formato falso, timeout e cancelamento; provar que browser inicial não carrega a lib.
- **Aceite:** advisory removido ou risco isolado com sandbox/limites e exceção; UX comunica rejeição sem vazar stack.

## 014 — Fixar a toolchain de forma explícita

- **Baseline:** implementação `FALHA`; `.nvmrc=20`, CI/ambiente=24; `engines` e `packageManager` ausentes.
- **Executar:** decidir Node 24 como referência se compatibilidade for confirmada; alinhar `.nvmrc`, `package.json.engines`, `packageManager`, README, containers e workflows; manter Bun 1.4.0 pinado.
- **Testar:** instalação/build/test em ambiente limpo e falha clara em versão incompatível.
- **Aceite:** uma única matriz declarada e reproduzível; `bun.lock` estável.
- **Rollback:** um commit isolado de toolchain.

## 015 — Habilitar coverage de fato

- **Baseline:** implementação `FALHA`; falta `@vitest/coverage-v8`.
- **Executar:** adicionar provider compatível com a versão do Vitest, configurar reporters `text`, `json-summary` e `lcov`, exclusões justificadas e artifact de CI.
- **Testar:** `bun run test:coverage` em clone limpo; relatório deve conter fontes relevantes e falhar em erro de instrumentação.
- **Aceite:** comando exit 0, artifact não vazio e sem upload de fontes/segredos indevidos.
- **Nota:** não impor threshold arbitrário antes de 024/025.

## 016 — Criar ratchet bloqueante para vulnerabilidades

- **Baseline:** implementação `FALHA`; audit está `continue-on-error: true`.
- **Executar:** criar script testável que normalize advisories por ID/severidade/pacote; baseline temporário somente para exceções aprovadas; falhar em nova crítica/alta ou piora.
- **CI:** remover tolerância depois que o ratchet estiver provado; gerar artifact legível mesmo em falha.
- **Testar:** fixtures com achado novo, removido, severidade aumentada, output inválido e falha do scanner.
- **Aceite:** scanner indisponível ou output inválido falha fechado; baseline só diminui; zero crítica permitida.

## 017 — Substituir o grep de secrets por scanner fail-closed

- **Baseline:** implementação `PARCIAL`; grep atual imprime aviso e termina com sucesso.
- **Executar:** integrar Gitleaks ou equivalente pinado, cobrindo working tree, commits do PR e histórico definido; política/allowlist mínima, com fingerprint e justificativa.
- **Testar:** fixture sintética deve falhar; placeholder permitido deve passar; erro de instalação/config também deve falhar.
- **CI:** artifact deve ser sanitizado; nunca imprimir o valor detectado em logs públicos.
- **Aceite:** check obrigatório, fail-closed, com documentação de remediação e rotação.

## 018 — Tornar budgets de bundle executáveis

- **Baseline:** implementação `FALHA`; budgets declarados não bloqueiam e já são excedidos.
- **Executar:** criar `scripts/ci/check-performance-budgets.mjs` com unit tests; medir entry JS, CSS inicial, maior chunk, total, sourcemaps/preload e compressões de modo determinístico.
- **Estratégia:** registrar baseline real como teto temporário apenas com trajetória de redução; nunca elevar budget para esconder regressão.
- **Testar:** fixtures abaixo/acima, arquivos ausentes, output malformado e diferenças de ordem.
- **Aceite:** CI falha em regressão; budgets finais aprovados; relatório mostra delta por asset.

## 019 — Otimizar a CI sem reduzir os gates

- **Baseline:** implementação `PARCIAL`; pins, permissões, concurrency e timeouts são bons; cadeia de gates é incompleta.
- **Executar:** medir p50/p95 por job; usar cache seguro do Bun, paralelizar jobs independentes, compartilhar somente artifacts imutáveis e evitar reinstalações quando comprovadamente seguro.
- **Preservar:** pins SHA, `persist-credentials:false`, permissões mínimas, cancel-in-progress e timeouts.
- **Testar:** PR docs-only, PR código, falha de lint, teste, build, security e cancelamento; nenhum gate deve ser pulado por condição errada.
- **Aceite:** duração reduzida ou justificada, mesma/maior cobertura, logs claros e reprodução local.

## 020 — Formalizar checks obrigatórios e proteção da main

- **Baseline:** implementação `PARCIAL`; proteção exige só lint/typecheck, unit e build; zero reviews e CODEOWNERS não obrigatório.
- **Executar local:** documentar conjunto alvo: lint/typecheck, unit+coverage, contracts, DB guard, secret scan, dependency ratchet, build, bundle, E2E crítico e Lighthouse/a11y conforme maturidade.
- **Preparar remoto:** branch protection/ruleset com required reviews, code owner review para áreas sensíveis, stale review dismissal e admin policy consciente.
- **Provar:** nomes dos checks estáveis e presentes em PR real; proteção não aponta para check inexistente.
- **Aceite:** configuração remota inspecionada após aprovação Classe C; bypasses documentados; nenhum merge possível com gate vermelho.
- **Parada:** não alterar ruleset sem autorização e sem confirmar que os checks já existem.

## 021 — Definir a taxonomia e os contratos da suíte

- **Baseline:** implementação `PARCIAL`; unit/contract configs existem, DB/E2E não.
- **Executar:** documentar pirâmide e globs para unit, component, integration, Edge contract, DB/RLS, E2E, a11y, performance e smoke; impedir que o mesmo teste rode em suítes erradas.
- **Implementar:** scripts explícitos e um teste que liste/compare arquivos coletados por cada config; tempos máximos e política de quarantine.
- **Aceite:** todo arquivo de teste pertence a uma categoria, nenhuma categoria crítica está vazia silenciosamente e skips têm owner/prazo.

## 022 — Eliminar avisos React `act(...)` pela causa raiz

- **Baseline:** implementação `FALHA`; unit passa com warnings.
- **Executar:** capturar `console.error/warn` em CI, classificar por stack, corrigir awaits, timers, subscriptions e cleanup; não envolver tudo em `act` sem compreender o evento.
- **Implementar:** allowlist mínima temporária por fingerprint; novos warnings falham.
- **Testar:** React Query, router, toasts, realtime e timers falsos/reais; nenhuma promise pendente após teardown.
- **Aceite:** zero warning não aprovado e teste sentinela prova que warning novo quebra CI.

## 023 — Padronizar mocks Supabase e contratos de erro

- **Baseline:** implementação `PARCIAL`; mocks incompletos ainda escondem comportamento.
- **Executar:** criar builders tipados para query chain, auth/session, functions, realtime/channel/storage; valores default devem ser explícitos, não sucesso implícito.
- **Cobrir:** `{data,error,count,status}`, `.single/.maybeSingle`, abort, unsubscribe, refresh session, RLS/401/403/409/429/5xx.
- **Aceite:** mocks falham quando método não configurado; testes críticos também exercitam contrato real/ephemeral e não dependem só de mock.

## 024 — Medir coverage por risco, não apenas média global

- **Baseline:** implementação `AUSENTE`; depende de 015.
- **Executar:** gerar mapa por domínio e criticidade: P0 webhooks/auth/RBAC/RLS/secrets/SSRF, P1 mensagens/pagamentos/LGPD/integrações, restante.
- **Métricas:** lines, statements, functions e branches; listar caminhos sem teste e mutation/negative cases mais relevantes.
- **Aceite:** relatório versionado pequeno ou artifact; owner e meta incremental por domínio; cobertura alta de código trivial não compensa fronteira P0 vazia.

## 025 — Implantar coverage ratchet incremental

- **Baseline:** implementação `AUSENTE`.
- **Executar:** criar baseline por arquivo/domínio e check de diff coverage; toda linha nova/alterada crítica deve estar coberta; baseline global só pode melhorar.
- **Testar:** fixture com queda, melhora, arquivo novo, rename e exclusão; scanner ausente falha fechado.
- **Aceite:** CI bloqueia regressão sem exigir correção imediata de toda dívida histórica; exceções têm owner/prazo.

## 026 — Cobrir autenticação, sessão, RBAC e troca de usuário

- **Baseline:** implementação `PARCIAL`; existem unit tests de auth/MFA, não matriz E2E completa.
- **Executar:** matriz para anônimo, agente, supervisor, admin e superadmin; tenants A/B; sessão expirada, refresh, logout, troca de usuário no mesmo browser, múltiplas abas e cache React Query.
- **Cenários negativos:** rota oculta e URL direta, Edge invoke sem JWT, role insuficiente, recurso de outro tenant, token revogado e cache do usuário anterior.
- **Aceite:** UI e servidor negam consistentemente; cache é limpo/segmentado por user+tenant; nenhuma credencial em screenshot/trace.

## 027 — Expandir testes de contrato das Edge Functions

- **Baseline:** implementação `PARCIAL`; 160 testes em 3 arquivos; 39 schemas e 30/61 handlers usam `parseBody`.
- **Executar:** gerar inventário das 61 funções, método, auth, schema, response, efeitos, secret e chamadas externas; priorizar todas as funções públicas/service-role.
- **Cobrir:** JSON inválido, body ausente/grande, método errado, sem auth, role errada, timeout, upstream 4xx/5xx, retry e redaction.
- **Aceite:** cada fronteira P0/P1 tem contract test; responses/envelopes/status são consistentes; testes não fazem rede real.

## 028 — Criar testes locais de migrations, RLS e grants

- **Baseline:** implementação `PARCIAL`; guards estáticos existem, banco efêmero completo não.
- **Executar:** levantar Supabase/Postgres efêmero isolado; aplicar migrations do zero na ordem; rodar testes SQL de schema, constraints, grants, RLS, SECURITY DEFINER e idempotência aplicável.
- **Matriz:** anônimo, authenticated A/B, roles de negócio, service role; leitura/escrita cross-tenant deve falhar.
- **Aceite:** setup reproduzível em CI, sem apontar para banco oficial; qualquer URL ausente deve falhar seguro, nunca fallback para produção.

## 029 — Implantar Playwright nos fluxos críticos

- **Baseline:** implementação `AUSENTE`.
- **Executar:** configurar browsers, webServer, retries somente em CI, trace/video/screenshot em falha, fixtures determinísticas e isolamento por worker.
- **Fluxos mínimos:** login/logout/MFA, RBAC, inbox/abrir conversa/enviar com fake, contatos, campanha em dry-run, integrações em sandbox e estados de erro.
- **Segurança:** interceptar chamadas externas; usar Supabase local/test; nenhum teste deve enviar WhatsApp/email/voz/cobrança real.
- **Aceite:** suíte passa em ambiente limpo e prova pelo menos happy path + sem auth + role errada + dependência indisponível para fluxos críticos.

## 030 — Automatizar smoke de acessibilidade

- **Baseline:** implementação `PARCIAL`; axe apenas em desenvolvimento.
- **Executar:** integrar axe aos componentes/Playwright; rotas críticas em desktop/mobile; política zero impacto crítico/sério novo.
- **Testar manualmente:** teclado, foco, skip links, modal/drawer, toast, formulário, contraste, zoom 200/400%, nomes acessíveis e live regions.
- **Aceite:** CI gera relatório; allowlist contém regra, elemento, justificativa, owner e prazo; nenhum overlay de DEV é contado como cobertura.

## 031 — Produzir mapa do débito TypeScript estrito

- **Baseline:** implementação `PARCIAL`; ~146 erros strict medidos, sem ownership.
- **Executar:** rodar config dry-run sem editar a config oficial; normalizar erros por código, arquivo, feature e fronteira; identificar clusters de tipos Supabase/nullability.
- **Artefato:** baseline testável, contagem total e por domínio, owner, risco e sequência.
- **Aceite:** resultado reproduzível, sem `skipLibCheck`/exclusões novas usadas para reduzir artificialmente a contagem.

## 032 — Criar ilhas estritas e ratchet de TypeScript

- **Baseline:** implementação `AUSENTE`.
- **Executar:** criar configs strict por domínio começando em auth, shared security, Edge contracts e integrações; habilitar `strict`, depois `noUncheckedIndexedAccess` quando viável.
- **Ratchet:** novos erros falham; baseline só diminui; arquivo novo não entra em exceção automaticamente.
- **Aceite:** pelo menos fronteiras P0 compilam strict; caminho para config global documentado; nenhum cast substitui validação runtime.

## 033 — Sincronizar e confiar nos tipos gerados do Supabase

- **Baseline:** implementação `PARCIAL`; workflow/guards existem, drift invalida confiança.
- **Executar:** resolver 010/061 primeiro; gerar tipos de fonte canônica em modo aprovado; comparar semanticamente, revisar enums/RPCs/nullability e eliminar tipos manuais divergentes.
- **CI:** contract diff deve detectar mudança incompatível e abrir PR controlado, nunca commitar secret/URL.
- **Aceite:** tipos, catálogo, manifest e migrations apontam para o mesmo schema/SHA; geração é determinística.

## 034 — Remover `any` de fronteiras P0

- **Baseline:** implementação `FALHA`; 572 ocorrências textuais de `any` no escopo auditado.
- **Executar:** priorizar payloads de webhook, auth claims, Supabase results, provider errors, SSRF responses e service-role functions; trocar `any` por `unknown` + schema/type guard.
- **Não fazer:** cast duplo `as unknown as` sem issue/validação; tipos gigantes globais para silenciar compilador.
- **Aceite:** zero `any` não justificado nas fronteiras P0; contagem global ratcheted e reduzida.

## 035 — Endurecer nullability e acesso a coleções

- **Baseline:** implementação `FALHA`; grande parte dos erros strict é de null/undefined/índices.
- **Executar:** modelar estados carregando/vazio/erro; usar discriminated unions; validar `.single`, arrays, mapas e envs antes do acesso; remover non-null assertions inseguras.
- **Testar:** resposta vazia, linha ausente, campo legado null, lista vazia, índice inválido e corrida de unmount.
- **Aceite:** domínios migrados passam strict e comportamento vazio tem UI/erro explícito.

## 036 — Classificar a dívida ESLint e limpar configuração

- **Baseline:** implementação `PARCIAL`; ratchet existe, baseline tem 1.123 ocorrências.
- **Executar:** agrupar por regra/feature/risco; remover regras obsoletas/duplicadas apenas com justificativa; revisar 17 disables e 59 suppressions TS.
- **Aceite:** baseline inclui fingerprint estável e owner; disable exige escopo mínimo, razão e issue; config não reduz severidade para maquiar dívida.

## 037 — Reduzir lint por ondas sem churn

- **Baseline:** implementação `FALHA`; dívida não caiu desde o baseline.
- **Executar:** atacar primeiro correctness, hooks, promises, unsafe types e unused que indicam código morto; commits por regra/domínio; formatação mecânica separada.
- **Testar:** typecheck, testes do domínio, lint ratchet e full lint; revisar alterações automáticas semanticamente.
- **Aceite:** redução mensurável sem novo disable; meta final zero erro e warnings aceitos apenas temporariamente.

## 038 — Mapear ciclos, god modules e dependências cruzadas

- **Baseline:** implementação `AUSENTE`; `graphify-out/graph.json` não existe na auditoria.
- **Executar:** como o repositório tem mais de 500 arquivos, analisar por recortes explícitos e depois consolidar: `src/auth+integrations`, `src/inbox+messages`, `src/features/UI`, `supabase/functions/_shared+P0`, `migrations+DB scripts`.
- **Ferramentas:** Graphify para relações semânticas nos recortes, mais ferramenta AST de dependências para ciclos; não inventar arestas nem tratar import como fluxo de autorização.
- **Entregável:** top ciclos, fan-in/fan-out, módulos de alta centralidade, fronteiras violadas e plano de extração com risco/testes.
- **Aceite:** resultados apontam `source_location`, raw cohesion/medidas e limitações; não versionar milhares de artefatos sem decisão.

## 039 — Formalizar arquitetura modular orientada a features

- **Baseline:** implementação `PARCIAL`; há pastas de domínio e lazy routes, mas regras de dependência não.
- **Executar:** definir camadas públicas por feature, shared kernel mínimo, adapters de Supabase/providers e regra de importação; impedir UI de usar service concerns e features de importar internals alheios.
- **Implementar:** lint/dependency rule incremental e barrels públicos pequenos; evitar big-bang.
- **Aceite:** pelo menos dois domínios críticos obedecem regras automatizadas; decisões em ADR; testes preservados.

## 040 — Corrigir governança de ADRs e documentação conflitante

- **Baseline:** implementação `FALHA`; IDs ADR duplicados e versões/contagens conflitantes.
- **Executar:** inventariar ADRs, renumerar sem quebrar links, marcar `proposed/accepted/superseded/deprecated`, corrigir índices e referências; não reescrever história sem nota de supersessão.
- **Verificar:** link checker; busca por React 18/Vite 5, 19 Edge Functions e claims “100%”. A correção funcional ampla termina em 088.
- **Aceite:** IDs únicos, owners/decisão/data/consequências e nenhuma contradição conhecida nos documentos de arquitetura.

## 041 — Gerar mapa de bundle por rota e dependência

- **Baseline:** implementação `PARCIAL`; pesos gerais conhecidos, sem owner/top 20 por rota reproduzível.
- **Executar:** integrar visualizador somente em modo analyze; mapear entry, preload, lazy chunks, shared chunks e dependências por rota; raw/gzip/Brotli.
- **Entregável:** top 20 assets e top packages com rota consumidora, motivo, owner e ação `remove/defer/split/replace/accept`.
- **Aceite:** análise nasce de build limpo e mesmo SHA; artifact não inclui source map público nem código sensível.

## 042 — Reduzir JavaScript realmente inicial

- **Baseline:** implementação `PARCIAL`; rotas lazy existem, mas PDF/charts são preloaded.
- **Executar:** medir o que o `index.html` baixa antes de interação; remover imports/barrels que puxam features; adiar providers opcionais; usar prefetch por intenção e idle apenas com budget.
- **Testar:** login e inbox em cache frio, navegação para feature lazy, erro de chunk/retry e rede lenta.
- **Aceite:** entry/preload abaixo do budget aprovado; nenhuma rota quebra offline/reload; melhora medida em três execuções.

## 043 — Reduzir CSS inicial e duplicação de estilos

- **Baseline:** implementação `FALHA`; 205,59 KiB CSS inicial contra 80 KiB.
- **Executar:** identificar CSS global, Tailwind gerado, fontes e bibliotecas; remover classes mortas com safelist explícita; dividir estilos por feature quando o bundler sustentar.
- **Testar:** visual regression nas rotas críticas, temas, breakpoints e componentes dinâmicos; não purgar classes montadas em runtime.
- **Aceite:** CSS inicial converge ao budget sem regressão visual/a11y.

## 044 — Carregar Mapbox, PDF, charts e planilhas apenas sob demanda

- **Baseline:** implementação `PARCIAL`; chunks manuais existem, Mapbox ~1,6 MiB e preloads contradizem on-demand.
- **Executar:** imports dinâmicos no ponto de uso, remover preload automático, lazy adapters, fallback/cancelamento; considerar alternativas menores somente com teste de capacidade.
- **Testar:** cada feature antes/depois do primeiro uso, navegação cancelada, falha de download e cache; entry não deve conter código dessas libs.
- **Aceite:** nenhuma biblioteca pesada é baixada na rota que não a usa; chunk próprio e budget específico documentado.

## 045 — Otimizar ícones, UI e renderização de listas

- **Baseline:** implementação `PARCIAL`; virtualização e chunks existem, profiling real não.
- **Executar:** React Profiler em inbox, contatos, campanhas e dashboards; medir commits, rerenders e long tasks; corrigir keys instáveis, selectors amplos e memoização improdutiva.
- **Ícones:** imports específicos/tree-shakable; evitar barrel que traga catálogo inteiro.
- **Aceite:** comparação antes/depois prova redução relevante sem stale props ou perda de a11y; nenhuma otimização só por intuição.

## 046 — Resolver estratégia de source maps e Sentry

- **Baseline:** implementação `FALHA`; ~23 MiB de maps e painel Sentry mockado.
- **Executar:** decisão explícita: integrar Sentry real ou remover/ocultar a UI. Se integrar, usar SDK oficial, release+dist ligados ao SHA, scrub de PII, traces/sample rates, upload privado no build e remoção do artifact público.
- **Testar:** erro sintético controlado em preview, symbolication, release correta, ausência de token/map em `dist`, consentimento/privacy e falha do upload.
- **Aceite:** transporte real e observável ou feature indisponível honestamente; nenhum DSN/config sensível editável apenas em `useState`.
- **Checkpoint:** criação de projeto/secret/upload remoto é Classe D; patch local e testes mockados são Classe B.

## 047 — Substituir Web Vitals manual por telemetria correta

- **Baseline:** implementação `FALHA`; FID legado, INP incorreto, buffer em memória e sem sink RUM.
- **Executar:** usar biblioteca oficial `web-vitals`; medir LCP, CLS, INP, TTFB e FCP; enviar payload mínimo, amostrado, com release/route/device e sem PII.
- **Testar:** batching, pagehide, offline, retry limitado, consentimento, sink indisponível e schema.
- **Aceite:** dashboards/queries usam dados reais; métricas de laboratório e campo são rotuladas separadamente.

## 048 — Auditar React Query, chamadas redundantes e cache

- **Baseline:** implementação `PARCIAL`; defaults centralizados, waterfalls/políticas por domínio não.
- **Executar:** mapear query keys, tenant/user scoping, stale/cache/gc time, retries, invalidations e prefetch; medir requests duplicados e cascatas.
- **Cenários:** logout/troca de tenant, reconnect, foco, mutation otimista falha, realtime+query race e abort no unmount.
- **Aceite:** zero vazamento de cache entre usuários/tenants; menos chamadas comprovadas; políticas documentadas por domínio.

## 049 — Executar auditoria manual WCAG 2.2 AA

- **Baseline:** implementação `PARCIAL`.
- **Executar:** checklist por critério relevante em login, inbox, conversa, contatos, campanhas, integrações e admin; NVDA/VoiceOver, teclado, zoom/reflow, contraste, focus order, target size, errors e timeouts.
- **Entregável:** issue por falha com critério WCAG, severidade, reprodução, screenshot sanitizada e owner.
- **Aceite:** zero blocker A/AA nos fluxos críticos; exceções documentadas com prazo e alternativa acessível.

## 050 — Instituir gate Lighthouse e matriz responsiva

- **Baseline:** implementação `AUSENTE`.
- **Executar:** Lighthouse CI com servidor de preview e config pinada; matrizes mobile/desktop e viewports; budgets de performance, a11y, best practices e SEO apenas onde aplicável.
- **Estabilidade:** três runs/mediana, tolerância pequena e artifact; separar regressão estatística de falha determinística.
- **Aceite:** PR regressivo falha; matriz inclui browsers/dispositivos prioritários e linka 092.

## 051 — Inventariar APIs, consumidores e trust boundaries

- **Baseline:** implementação `PARCIAL`; inventários antigos estão desatualizados.
- **Executar:** gerar matriz das 61 Edge Functions mais REST/RPC/realtime/provider callbacks: método, caller, auth gateway, auth de negócio, tenant source, schema, secret, service role, DB writes, external calls, idempotency e logs.
- **Classificar ações do `evolution-api`:** leitura, operação de mensagem, configuração, destructive/admin; definir role mínima e posse da conexão para cada uma.
- **Provar:** rastrear UI/hook → Edge/RPC → tabela/provider e caminho inverso de callback; existência de arquivo não prova uso.
- **Aceite:** 100% das fronteiras têm owner e decisão; qualquer endpoint público sem auth alternativa vira P0 e bloqueia release.

## 052 — Auditar toda exceção `verify_jwt = false`

- **Baseline:** implementação `FALHA`; seis exceções em `supabase/config.toml`.
- **Executar:** para `evolution-webhook`, `whatsapp-webhook`, `gmail-webhook`, `gmail-cron-sync`, `elevenlabs-webhook` e `public-api`, provar mecanismo alternativo, segredo/issuer, audience, freshness, replay, rate limit e escopo.
- **Testar:** sem credencial, inválida, expirada, body alterado, timestamp velho/futuro, replay, método errado e payload grande.
- **Aceite:** cada exceção tem justificativa e testes; se o caller pode enviar JWT Supabase, reativar `verify_jwt`; caso contrário, auth alternativa forte antes do parse/efeito.

## 053 — Endurecer o webhook Evolution contra spoofing e replay

- **Baseline:** implementação `FALHA`; valida shape, não autenticidade.
- **Arquivos iniciais:** `supabase/functions/evolution-webhook/index.ts`, shared auth/response/logger, migrations de idempotência/DLQ e contract tests.
- **Executar:** confirmar capacidade real do Evolution GO. Preferir assinatura HMAC sobre bytes crus + timestamp/nonce e comparação constant-time; se o provedor não assina, exigir secret dedicado no gateway/rota e compensações aprovadas. Nunca inventar header incompatível.
- **Pipeline obrigatório:** limitar método/tamanho → capturar raw body → autenticar/freshness → deduplicar atomicamente → validar schema → autorizar instance/tenant → persistir/transacionar → responder → enfileirar retry/DLQ.
- **Idempotência:** chave provider/event/instance com unique constraint; estado `processing/succeeded/failed`, lease e retry seguro; crash entre efeito e resposta deve ser testado.
- **Testar:** assinatura válida/inválida, body alterado, 4m59/5m01, replay simultâneo, evento fora de ordem, tenant errado, DB indisponível e retry.
- **Aceite:** request não autenticado nunca escreve com service role; replay não repete efeito; logs não contêm mensagem/token/telefone integral.

## 054 — Endurecer Gmail, ElevenLabs, cron e public API

- **Baseline:** implementação `FALHA`.
- **WhatsApp/Meta:** validar `X-Hub-Signature-256` sobre raw body com app secret e fluxo GET challenge/verify token; rejeitar antes do JSON/DB.
- **Gmail Pub/Sub:** verificar JWT/OIDC Google — issuer, audience, exp/iat, service account permitida — e vincular `subscription`/topic esperado; validar base64/messageId e deduplicar.
- **ElevenLabs:** implementar assinatura/timestamp exatamente conforme documentação oficial da versão usada; raw body e constant-time; se não suportado, gateway secret/restrição com decisão formal.
- **Cron Gmail:** segredo dedicado com hash/constant-time, rotação e rate limit; preferir scheduler com identidade verificável.
- **Public API:** substituir token global plaintext por credenciais por tenant: `key_id` público + segredo mostrado uma vez + hash forte/pepper, scopes, status, expiração, rotação, last-used e audit; nunca retornar hash/segredo. Escopar `connectionId` ao tenant.
- **Testar:** matriz completa de 052, cross-tenant, key revogada, scope insuficiente, rate limit e logs.
- **Aceite:** nenhum endpoint depende de segredo global exibido/copied da DB/UI; providers autenticados e deduplicados.

## 055 — Implementar rate limiting distribuído

- **Baseline:** implementação `AUSENTE`; `Map` por isolate reinicia em cold start.
- **Executar:** escolher storage atômico distribuído compatível — Postgres RPC/row locking, Redis/Upstash ou gateway — com chave por tenant+principal+ação+IP quando apropriado.
- **Algoritmo:** token bucket/sliding window com clock consistente, TTL, burst e custo por ação; definir comportamento fail-open/fail-closed por risco.
- **Privacidade:** hash/prefixe identificadores; retenção curta; não guardar token/telefone/email puro.
- **Testar:** concorrência multi-instância, boundary, clock, storage indisponível, bypass por header forjado e cleanup.
- **Aceite:** limite compartilhado comprovado por teste concorrente; resposta 429 com retry metadata segura; métricas/alerta.

## 056 — Validar payloads e normalizar erros em todas as fronteiras

- **Baseline:** implementação `PARCIAL`; 39 schemas compartilhados, 30/61 handlers usam `parseBody`.
- **Executar:** schema por action/version, limites de tamanho/string/array/URL, unknown keys conforme risco, coerção mínima; normalizar error envelope com request ID e código público.
- **Segurança:** detalhes internos ficam no logger redigido, nunca na resposta; não logar body completo em `elevenlabs-webhook` ou outros callbacks.
- **Testar:** property/fuzz limitado, JSON inválido, unicode, números extremos, prototype keys, payload enorme e content-type errado.
- **Aceite:** 100% das fronteiras P0/P1 passam pelo parser comum ou exceção justificada; status codes consistentes.

## 057 — Restringir CORS e métodos por endpoint

- **Baseline:** implementação `PARCIAL`; shared allowlist ajuda, `webhook-diagnostic` usa `*` e métodos variam.
- **Executar:** separar browser endpoints de server-to-server webhooks; webhooks não precisam de CORS permissivo; allowlist por ambiente; validar Origin apenas onde há browser.
- **Métodos:** OPTIONS mínimo, `Allow`, content-type e rejection explícita; não aceitar GET mutável.
- **Testar:** origin permitido/não permitido/null, preflight, método errado e header não permitido.
- **Aceite:** zero wildcard em endpoint autenticado/privilegiado; política central sem fallback silencioso para `*`.

## 058 — Fechar SSRF, redirects e processamento de URLs

- **Baseline:** implementação `FALHA`.
- **Superfícies mínimas:** `fetch-link-preview`, `ai-transcribe-audio`, fetch de avatar/mídia e toda URL de integração configurável.
- **Executar:** preferir allowlist de buckets/domínios canônicos e signed URLs curtas; onde URL arbitrária for requisito, criar `safeFetch` central com `http/https`, portas permitidas, DNS resolution, bloqueio IPv4/IPv6 privado/link-local/loopback/metadata/reserved, revalidação a cada redirect e proteção a rebinding.
- **Limites:** no máximo poucos redirects, timeout/abort, bytes/content-type, decompression ratio e sem encaminhar Authorization/cookies.
- **Testar:** IPv4 decimal/hex, IPv6, localhost variants, userinfo, DNS para privado, redirect público→privado, rebinding simulado, arquivo enorme e slowloris.
- **Aceite:** `ai-transcribe-audio` não faz fetch direto de URL do usuário; todo fetch externo P0 usa policy central ou allowlist comprovada.

## 059 — Reduzir privilégios e sanitizar logs

- **Baseline:** implementação `FALHA`; 42 Edge Functions referenciam service role.
- **Executar:** inventariar por função/ação/tabela; usar cliente do usuário quando RLS deve decidir; isolar service role em adapter mínimo após auth+role+tenant; remover capabilities desnecessárias.
- **Prioridade:** `evolution-api`, `webhook-diagnostic` auto-fix, `connection-health-check`, `batch-fetch-avatars`, repair/migration tools e endpoints administrativos.
- **RBAC:** matriz de ação e role, posse da conexão e tenant derivados server-side; nunca confiar `userId/tenantId/connectionId` do body.
- **Logs:** redaction central de token, auth header, cookie, phone, email, message, webhook body e provider response; retenção e acesso.
- **Testar:** anônimo, role baixa, tenant B, action administrativa, ID enumerado e log snapshot sanitizado.
- **Aceite:** toda utilização service role tem justificativa/teste; endpoint genérico não oferece ação privilegiada a qualquer authenticated.

## 060 — Aplicar headers de segurança e CSP por etapas

- **Baseline:** implementação `PARCIAL`; Edge headers existem, `vercel.json` só reescreve SPA.
- **Executar:** adicionar `Content-Security-Policy` inicialmente report-only com inventário real, depois enforce; `frame-ancestors`, `object-src`, `base-uri`, `form-action`, `connect-src`, scripts/styles, workers e media; nonces/hashes onde necessário.
- **Outros headers:** HSTS somente após HTTPS/subdomínios confirmados, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection compatível e cache correto.
- **Testar:** login, Supabase realtime/storage/functions, Mapbox, ElevenLabs/LiveKit, SIP, PDF/worker e PWA se adotada; coletar violações sem PII.
- **Aceite:** scanner/browser confirma headers em preview e produção somente após aprovação; sem `unsafe-eval`/wildcard não justificado.

## 061 — Resolver qualquer drift de migrations

- **Baseline:** implementação `FALHA`; depende de 005/010 e bloqueia SQL.
- **Executar:** a partir do relatório 010, decidir por divergência: recuperar arquivo remoto canônico, marcar histórico estrangeiro/superseded, criar migration compensatória ou corrigir ferramenta de ledger. Nunca editar silenciosamente migration aplicada.
- **Duplicata local:** determinar por ledger/hash qual `20260829100000` é histórica; atribuir versão nova apenas ao arquivo comprovadamente não aplicado, ajustando dependências/testes.
- **Remote-only:** obter SQL/metadata por fonte autorizada, revisar segredo/PII, verificar autoria e compatibilidade; não gerar stub vazio apenas para passar guard.
- **Testar:** clone/banco efêmero do zero, upgrade a partir de snapshot sanitizado, drift guard e rollback/forward-fix.
- **Aceite local:** guard passa, migrations únicas/ordenadas, hashes explicados e tipos regeneráveis.
- **Checkpoint D:** apresentar lista exata, SQL, impacto, lock/tempo, backup, dry-run e rollback antes de reparar ledger/aplicar no oficial.

## 062 — Automatizar paridade de schema, catálogo e tipos

- **Baseline:** implementação `PARCIAL`; scripts são bons, mas migration guard falha.
- **Executar:** encadear identity guard → migration ledger/hash → manifest/catalog → types diff; falhar em qualquer mismatch ou output vazio.
- **CI:** DB local sempre; live guard manual/read-only com environment protection e segredo; artifacts sanitizados e expiração curta.
- **Testar:** ref errado, PG major errado, coluna/RPC/policy divergente, type drift e ferramenta indisponível.
- **Aceite:** uma execução prova que todos os artefatos representam o mesmo banco/revisão; nenhum fallback para URL default.

## 063 — Construir matriz RLS multi-tenant com testes negativos

- **Baseline:** implementação `PARCIAL`; políticas existem, matriz atual integral não.
- **Executar:** inventariar tabelas/views/storage/RPCs por tenant; definir sujeito, role, operações, filtros, WITH CHECK e bypass; gerar testes positivos/negativos em banco efêmero.
- **Cenários:** usuário A lê/escreve A, tenta B, troca role, registro sem owner, relação indireta, upsert, realtime e função definer.
- **Autoridade:** auditar `user_roles` — guard de mudanças, trilha de UPDATE/DELETE, quem concede/revoga e proteção contra self-escalation.
- **Aceite:** cross-tenant retorna zero/erro coerente em todas as superfícies; service role está fora do teste de isolamento e justificado separadamente.

## 064 — Auditar `SECURITY DEFINER`, grants e `search_path`

- **Baseline:** implementação `PARCIAL`; riscos residuais documentados.
- **Prioridade:** corrigir `get_connection_qr_code` e `get_connection_instance` para validar posse/tenant/role; não confiar apenas no UUID fornecido.
- **Executar:** listar functions/procedures/views definer, owner, volatility, `search_path`, EXECUTE grants, dynamic SQL e tabelas tocadas; revogar PUBLIC/anon indevidos.
- **Revalidar achados antigos na revisão atual:** RPCs reset residuais/tipos fantasmas, funções órfãs, grants amplos, triggers duplicados de `agent_stats`; não repetir achado já corrigido sem reproduzir.
- **Testar:** attacker schema/object shadowing, anon/auth A/B, role baixa e chamada direta RPC.
- **Aceite:** `search_path` fixo/qualificado, grants mínimos, authorization interna e testes negativos; migration local revisada, aplicação só Classe D.

## 065 — Medir queries reais com `pg_stat_statements`

- **Baseline:** implementação `AUSENTE`.
- **Executar read-only após 005:** capturar top queries por total time, mean, calls, rows, temp, I/O e variance em janela definida; normalizar sem valores/PII.
- **Correlacionar:** rota/Edge/owner e plano; alto número de scans em tabela pequena pode ser tempestade de chamadas, não falta de índice.
- **Aceite:** top 10/20 com hipótese e prioridade; snapshot não é apresentado como série histórica.
- **Checkpoint:** enabling/reset de extensão/stats é Classe D; não executar para obter números “limpos”.

## 066 — Corrigir a tempestade em `whatsapp_connections`

- **Baseline:** implementação `AUSENTE`; ADR indica dezenas de milhões de scans em tabela pequena.
- **Executar:** instrumentar call sites, frequência, polling, invalidations, realtime e Edge invocations; identificar N+1/loop/reconnect em vez de adicionar índice por reflexo.
- **Correção:** cache request/session com invalidação correta, deduplicação React Query, backoff e endpoint agregado; evitar cache global entre tenants.
- **Testar:** múltiplas abas/agentes, reconnect, atualização de conexão, stale data, tenant switch e outage.
- **Aceite:** redução comprovada de calls/tempo, consistência preservada e ADR atualizado.

## 067 — Otimizar queries e índices com planos comprovados

- **Baseline:** implementação `PARCIAL`; índices/EXPLAINs históricos existem, medição atual não.
- **Executar:** para cada query candidata, salvar `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` em dataset sanitizado/staging e comparar before/after; revisar selectivity, compound order, partial index, write/storage cost.
- **Revalidar schema residual:** `whatsapp_connections.instance_id` nullable e índice duplicado; query Sicoob referindo `profiles.full_name`; não corrigir só por documento antigo.
- **Aceite:** ganho significativo medido, nenhuma duplicação inútil, plano de rollback `DROP INDEX CONCURRENTLY`/forward-fix e teste de regressão.
- **Checkpoint:** EXPLAIN ANALYZE e DDL no oficial exigem avaliação de impacto e autorização.

## 068 — Auditar Realtime, replica identity e lifecycle de subscriptions

- **Baseline:** implementação `PARCIAL`; vários cleanups existem, cobertura completa não.
- **Executar:** mapear canais por component/hook/table/event/filter, publication e replica identity; provar subscribe/unsubscribe em mount/unmount, auth refresh e tenant switch.
- **Testar:** StrictMode double mount, reconnect, tab background, evento duplicado/fora de ordem, update/delete sem old row e RLS.
- **Aceite:** zero listener órfão/duplicado, filtros tenant-side e server-side corretos, uso de replica identity justificado por tabela.

## 069 — Implementar retenção, minimização e limpeza LGPD

- **Baseline:** implementação `PARCIAL`; políticas/jobs existem, workflow completo não.
- **Executar:** inventário de dados pessoais por tabela/storage/log/provider, finalidade/base legal, retenção, owner, export/delete/anonymize e legal hold.
- **Workflow:** pedido autenticado → verificação de identidade/escopo → status/SLA → export seguro ou execução de delete/anonymize → fornecedores → prova/audit sem conservar o dado removido.
- **Dry-run:** relatório de volume/impacto; batch limitado, idempotente, resumível; kill switch.
- **Testar:** tenant errado, legal hold, dependência indisponível, retry, dado compartilhado, backup e revogação de link.
- **Aceite:** UI não diz “excluído” ao apenas gravar audit log; exportação e exclusão têm fluxo real ou são honestamente indisponíveis.

## 070 — Provar backup, restore e RPO/RTO do banco

- **Baseline:** implementação `BLOQUEADA`; documentação sem exercício.
- **Executar:** inventariar backup automático/PITR, retenção, criptografia, owner e dependências storage/auth/secrets; preparar restore em ambiente isolado e sanitizado.
- **Exercício:** medir último ponto recuperável, duração, consistência de migrations, RLS, functions, auth mapping e smoke do app.
- **Aceite:** RPO/RTO medidos versus objetivos, evidência do restore e gaps; backup sem restore testado não é `VERIFIED`.
- **Checkpoint D:** criação/restore/delete de ambiente remoto exige autorização e alvo explicitamente não produtivo.

## 071 — Definir arquitetura de observabilidade e taxonomia

- **Baseline:** implementação `PARCIAL`; logger/tabelas existem, backend/ownership não aprovados.
- **Executar:** definir logs, métricas e traces; ambientes/releases; severity; service/feature/tenant pseudonimizado; retenção, acesso, custo e scrub.
- **Escolha:** Sentry/OpenTelemetry/backend atual com ADR e dados reais; eliminar painéis mockados.
- **Aceite:** catálogo de eventos/métricas, owners e schemas versionados; nenhuma PII/secret por default.

## 072 — Padronizar correlation e causation IDs

- **Baseline:** implementação `PARCIAL`; request IDs locais não propagam ponta a ponta.
- **Executar:** gerar/validar ID na borda, propagar UI → Edge → DB/log → provider/webhook/DLQ; separar correlation de causation/idempotency.
- **Segurança:** não aceitar string ilimitada/controle do cliente como chave de log; não reutilizar token/message content.
- **Testar:** retry, webhook encadeado, async scheduler e dependência externa.
- **Aceite:** um incidente pode ser traçado sem pesquisar PII; IDs aparecem de modo consistente em logs e erros públicos seguros.

## 073 — Instrumentar erros e releases do frontend

- **Baseline:** implementação `FALHA`; ErrorBoundary sem transporte real.
- **Executar:** concluir decisão 046/071; capturar errors/unhandled rejection/router chunk failure com release SHA, route e breadcrumbs mínimos; user/tenant pseudonimizados.
- **Controles:** scrub de URL/query/body, sampling, consentimento, environment, ignore rules testadas e source maps privados.
- **Aceite:** erro sintético no preview chega symbolicated ao backend real e dispara política adequada; UI mock removida/oculta.

## 074 — Instrumentar Edge Functions e dependências externas

- **Baseline:** implementação `PARCIAL`.
- **Executar:** wrapper comum com duration/status/request ID, auth outcome, provider, timeout/retry e resultado; métricas RED e spans onde backend suportar.
- **Providers mínimos:** Evolution, Gmail, ElevenLabs, Meta, Bitrix, Sicoob, SIP/LiveKit, IA e DB externo.
- **Segurança:** atributos allowlisted; sem body, tokens, mensagens, telefones ou emails brutos.
- **Aceite:** dashboards/queries distinguem 4xx negócio, 5xx código, timeout/upstream e rate limit; overhead/custo medidos.

## 075 — Monitorar Evolution GO e a VPS Hostinger

- **Baseline:** implementação `BLOQUEADA`; só superfície HTTP, sem identidade interna.
- **Executar após acesso seguro:** confirmar VPS/projeto/container/image SHA/versão/portas/TLS/volume/backup; coletar health, CPU, memória, disco, restarts, queue, latency/error rate e conexão WhatsApp.
- **Alertas:** symptom-based, com dedupe e runbook; não alertar apenas “CPU alta” sem ação.
- **Aceite:** métricas autenticadas e identidade `MATCH`; painel local sozinho não prova saúde da VPS.
- **Checkpoint D:** não reiniciar, atualizar imagem, abrir porta ou alterar env.

## 076 — Consolidar idempotência, DLQ e replay de webhooks

- **Baseline:** implementação `PARCIAL`; `webhook_failures`/DLQ e peças existem.
- **Executar:** unificar event key, payload criptografado/minimizado, estado, attempts, next_attempt, lease, error code, created/processed; replay exige role elevada, motivo e audit.
- **Semântica:** at-least-once com efeitos idempotentes; transação/outbox quando DB+provider; poison message/quarantine e retenção.
- **Testar:** crash antes/depois do efeito, workers concorrentes, duplicate, poison, replay duplo e schema antigo.
- **Aceite:** replay não duplica mensagem/efeito; payload sensível tem retenção/acesso; dashboard não oferece botão privilegiado sem RBAC.

## 077 — Definir SLOs, SLIs e alertas acionáveis

- **Baseline:** implementação `AUSENTE`.
- **Executar:** SLIs para login, inbox load/send, webhook ingest/process, Evolution availability, Edge errors, DB latency e jobs; definir janela, target e error budget.
- **Alertas:** burn-rate multi-window, ausência de tráfego quando relevante, fila/age e dependency failure; owner, horário e runbook.
- **Aceite:** dados reais alimentam o cálculo; SLO não é apenas tabela documental; falso positivo/negativo revisado.

## 078 — Atualizar runbooks por sintoma e decisão

- **Baseline:** implementação `PARCIAL`; documentos existem e estão desatualizados.
- **Executar:** para cada P0/SLO: sintomas, impacto, triage read-only, identidade, dashboards/queries, decisões, mitigação, rollback, escalonamento, comunicação e evidência final.
- **Segurança:** comandos com placeholders; nenhum secret; distinguir claramente read-only de mutação.
- **Aceite:** tabletop por pessoa que não escreveu o runbook; links/comandos válidos e tempo medido.

## 079 — Executar game days controlados

- **Baseline:** implementação `AUSENTE`.
- **Cenários:** Evolution fora, webhook duplicado/atrasado, DB read-only/latente, secret revogado, queue backlog, deploy ruim e storage cheio — apenas em ambiente isolado.
- **Preparar:** hipótese, blast radius, abort conditions, observers, dados sintéticos, rollback e autorização.
- **Aceite:** resultados medidos, gaps viram backlog e ambiente é restaurado; nunca injetar falha em produção sem autorização específica.

## 080 — Instituir post-mortem sem culpa e métricas DORA

- **Baseline:** implementação `PARCIAL`; template existe, instrumentação DORA não.
- **Executar:** automatizar deployment frequency, lead time, change failure rate e time to restore a partir de PR/deploy/incident, com definições estáveis.
- **Post-mortem:** timeline factual, impacto, detecção, causas sistêmicas, fatores contribuintes, ações com owner/prazo e verificação de eficácia.
- **Aceite:** métricas derivam de eventos reais, não produtividade individual/linhas; revisão mensal e follow-up de ações.

## 081 — Formalizar ambientes e identity guards

- **Baseline:** implementação `PARCIAL`; guards de DB existem, matriz integral não.
- **Executar:** documentar local/test/preview/staging/prod para GitHub, Vercel, Supabase, Evolution, providers e dados; mapping de refs/domínios/projects/secrets por nome.
- **Guardas:** exigir environment explícito, ref/project/host/version e denylist de alvos antigos; variável ausente deve abortar, nunca cair em produção.
- **Aceite:** todo workflow/script externo executa identity preflight e mostra somente identificadores seguros; testes cobrem mismatch/fallback.

## 082 — Criar preview seguro e dados determinísticos

- **Baseline:** implementação `AUSENTE`.
- **Executar:** preview por PR com Supabase/test backend isolado ou mocks de contrato; seeds sintéticos determinísticos; outbound providers bloqueados/interceptados.
- **Controles:** expiração/cleanup, auth de preview, robots noindex, CSP, sem copiar produção/PII e sem secrets produtivos.
- **Aceite:** E2E roda no preview sem enviar WhatsApp/email/voz/cobrança; reset é idempotente; custo/owner definidos.

## 083 — Endurecer deploy e rollback Vercel

- **Baseline:** implementação `PARCIAL`; projeto autenticado, smoke, promoção e rollback não provados.
- **Executar local:** validar build, env schema, identity guard, headers, artifact/SHA e smoke read-only; documentar promoção preview→prod e rollback a deployment imutável.
- **Provar remotamente após autorização:** team/project id, git SHA do deployment, domínio, env e health; não usar token exposto.
- **Aceite:** rollback testado em ambiente não produtivo; deploy só promove artifact já auditado; observação pós-deploy definida.
- **Checkpoint D:** deploy/promote/rollback produtivo.

## 084 — Endurecer deploy de Edge Functions e migrations

- **Baseline:** implementação `PARCIAL`; deploy manual e guards existem, drift bloqueia.
- **Ordem:** 005 MATCH → 010/061 paridade → backup/impact → migration expand → functions compatíveis → smoke → contract → migrate data → contract/cleanup em release posterior.
- **Executar:** manifest de functions/verify_jwt/secrets por nome e hash de fonte; deploy seletivo; migrations transacionais quando possível, lock/timeout e forward-fix.
- **Aceite:** dry-run/staging passa; rollback/forward-fix e compatibilidade N/N-1; mesmo SHA/manifest no relatório.
- **Checkpoint D:** nenhum `db push`, apply, deploy function ou secret set sem aprovação pontual.

## 085 — Governar Evolution GO como serviço crítico

- **Baseline:** implementação `BLOQUEADA`.
- **Executar após identidade:** fixar imagem por digest, versionar config não secreta, secrets externos, volumes/backups, health/readiness, resource limits, log rotation, TLS/firewall e processo de upgrade.
- **Testar:** backup/restore de config/volume sanitizado, restart controlado em staging, compatibilidade de webhook/API e rollback de imagem.
- **Aceite:** owner, SLO, runbook, inventário e janela de manutenção; nenhuma atualização “latest”.
- **Checkpoint D:** qualquer alteração de container/VPS/rede/restart.

## 086 — Instituir ciclo de vida de secrets

- **Baseline:** implementação `PARCIAL`; scanning existe, credenciais expostas abertas.
- **Executar:** política create/store/distribute/use/rotate/revoke/audit; owner, ambiente, consumidores, data e SLA; short-lived/OIDC onde possível.
- **Automação:** scan, secret inventory por nome, alertas de idade e rotação sem downtime; dual-key window curta e revogação comprovada.
- **Aceite:** fechar 006; nenhum secret plaintext em Git/DB/UI/log/bundle; runbook testado.

## 087 — Criar orçamento e observabilidade de custos

- **Baseline:** implementação `AUSENTE`.
- **Executar:** baseline por Vercel, Supabase, Hostinger, Evolution, observabilidade, IA/ElevenLabs/LiveKit e egress; unidade por tenant/conversa/mensagem/minuto quando possível.
- **Alertas:** budget mensal e burn rate; tags/owners; anomalia; quota e kill switch para recursos caros.
- **Aceite:** dashboard/export real, forecast e ações; otimização não remove backup/log/security necessários.

## 088 — Reconciliar documentação técnica com o sistema atual

- **Baseline:** implementação `FALHA`.
- **Executar:** remover claims “100% implementado”; corrigir React 19/Vite 8, contagem atual de Edge Functions e estado PWA/Sentry/integrações; validar 68 caminhos ausentes em `COMPLETE_SYSTEM_FEATURES.md`.
- **Regra:** cada feature recebe `AVAILABLE`, `PARTIAL`, `BETA`, `DEMO`, `DISABLED` ou `PLANNED`, com link para evidência/limitação.
- **Revalidar achados antigos:** Gmail disconnect/thread já foram corrigidos na revisão auditada; não republicar issue histórica sem reprodução.
- **Aceite:** docs, menus e UI não prometem backend inexistente; link checker e busca de claims passam.

## 089 — Definir ownership, ADR/RFC e review baseado em risco

- **Baseline:** implementação `PARCIAL`; CODEOWNERS em uma conta, review não obrigatório.
- **Executar:** owners primário/secundário para frontend, Edge, DB, CI/security, Evolution e integrações; ADR para decisão local, RFC para mudança cross-domain/external.
- **Review:** checklist de auth/tenant/migration/observability/rollback; duas pessoas/owner em áreas críticas quando equipe permitir.
- **Aceite:** nenhuma área P0 sem backup owner; ruleset 020 exige review coerente após autorização.

## 090 — Tornar onboarding e ambiente local reproduzíveis

- **Baseline:** implementação `PARCIAL`; README/env examples existem, toolchain/DB/E2E limpos não provados.
- **Executar:** setup do zero em máquina/contêiner limpo: toolchain, install, env names, Supabase local, seeds sintéticos, Edge, tests, build e troubleshooting.
- **Segurança:** `.env.example` só placeholders; nenhum acesso produtivo exigido; fail-fast em env ausente.
- **Aceite:** outra pessoa executa o guia dentro do tempo-alvo e passa gate local; diferenças SO documentadas.

## 091 — Decidir e concluir a estratégia PWA

- **Baseline:** implementação `FALHA`; plugin importado/desabilitado, `public/sw.js` ausente, docs dizem completo.
- **Decisão A — implementar:** manifest, service worker versionado/gerado, update flow, cache strategy, offline shell, push subscription, permission UX, scope e revogação; evitar cache de dados sensíveis.
- **Decisão B — remover:** retirar plugin/dependências/hooks de push que esperam SW, menus/claims e código morto.
- **Testar:** install/update/rollback, offline, stale bundle, logout, multi-tab, Safari/Chrome/Android, push denied e cleanup de cache.
- **Aceite:** um único estado coerente; nenhuma UI aguarda `serviceWorker.ready` inexistente.

## 092 — Fechar matriz de browsers, dispositivos e conectividade

- **Baseline:** implementação `AUSENTE`.
- **Executar:** definir browsers/versões por analytics/requisito, desktop/mobile/tablet, touch/keyboard, 3G/offline/reconnect e recursos WebRTC/SIP/PWA.
- **Automação/manual:** Playwright multi-browser + device real para câmera/mic/notificações/VoIP; documentar unsupported com UX clara.
- **Aceite:** fluxos críticos passam na matriz aprovada; bugs têm severidade/owner e fallback.

## 093 — Ratificar modular monolith vs microsserviços

- **Baseline:** implementação `PARCIAL`; modular monolith é o desenho observado, sem ADR atual.
- **Executar:** medir acoplamento, ownership, deploy frequency, scaling e failure domains; manter monólito modular por default.
- **Extrair serviço somente se:** boundary estável, necessidade independente de escala/isolamento, owner operacional e custo compensam consistência/observabilidade/deploy.
- **Aceite:** ADR com decisão, alternativas, gatilhos futuros e consequências; não introduzir Kubernetes/microservice por tendência.

## 094 — Definir versionamento e compatibilidade de contratos

- **Baseline:** implementação `PARCIAL`; schemas/contract tests existem, política/OpenAPI/diff/deprecação não.
- **Executar:** versionar APIs/webhooks/events, additive-first, enum/nullable rules, deprecation window, consumer inventory e N/N-1; gerar OpenAPI/JSON Schema onde útil.
- **CI:** contract diff bloqueia breaking change sem versão/waiver; fixtures de provider versionadas e sanitizadas.
- **Aceite:** clientes/Edges atuais continuam compatíveis durante rollout; changelog e sunset owner.

## 095 — Executar exercício completo de disaster recovery

- **Baseline:** implementação `BLOQUEADA`.
- **Escopo:** Git/repo, Vercel artifact/env, Supabase DB/storage/auth/functions/secrets, Evolution config/volume e DNS/dependências.
- **Executar em isolamento:** declarar desastre, restaurar na ordem, reconfigurar identities/secrets, validar migrations/RLS, smoke/E2E e medir RPO/RTO.
- **Aceite:** sistema recuperado com dados sintéticos e evidência; falhas viram ações; credenciais temporárias revogadas.
- **Checkpoint D:** ambientes/backups/restore/removal exigem aprovação.

## 096 — Rodar auditoria da release candidata

- **Baseline:** implementação `AUSENTE`; nenhum candidato e gates vermelhos/ausentes.
- **Pré-condições:** 005/006/010, 052–064 e decisions de facades fechados; zero P0; CI alvo verde; migrations/rollback aprovadas.
- **Executar:** usar o prompt-mestre de auditoria independente; reconciliar Git/PR/SHA, revisar todo diff, reproduzir baseline, simular 20 cenários, executar gates e verificar ambientes read-only.
- **Aceite:** relatório com `GO`, `GO COM RESSALVAS` ou `NO-GO`; alegações do executor comparadas a evidência independente.
- **Regra:** o Cline não pode autoaprovar sua própria evidência como auditoria independente.

## 097 — Fechar P0/P1 e consolidar o registro de dívida

- **Baseline:** implementação `FALHA`; P0/P1, facades, disables e claims falsos permanecem.
- **Executar:** reconciliar todos os achados da auditoria, matriz funcional da seção 9, skips, suppressions, audit, strict, lint, perf, a11y, DB e ops.
- **Cada item:** severity, exploit/impact, estado, evidência, decisão, owner, prazo, compensação, issue/PR e teste de fechamento.
- **Aceite:** zero P0; P1 corrigido ou exceção assinada/expirável; nenhuma feature `FACADE` anunciada como disponível; dívida residual priorizada.

## 098 — Congelar o candidato e obter aprovação de release

- **Baseline:** implementação `AUSENTE`.
- **Executar:** fixar SHA/artifacts/manifests/image digests/migrations; bloquear mudanças; anexar relatório 096, changelog, rollout, rollback, SLO e riscos aceitos.
- **Aprovações:** produto, engenharia, segurança/DB/ops conforme impacto; confirmar janelas/contatos.
- **Aceite:** sign-off explícito no mesmo candidato; qualquer mudança posterior invalida e exige nova auditoria.

## 099 — Fazer canary, promover e observar

- **Baseline:** implementação `BLOQUEADA`; Classe D.
- **Executar somente autorizado:** canary de menor blast radius, smoke sintético, observação de SLO/error budget/logs/queues/DB/Evolution, promoção gradual e critérios automáticos/manuais de abort.
- **Rollback:** artifact anterior, forward-fix de migration compatível, secrets dual window e comunicação.
- **Aceite:** métricas estáveis durante janela aprovada, nenhum P0/P1 novo e relatório do deployment ligado ao SHA.
- **Proibição:** não usar usuário/dados reais para teste destrutivo e não “validar” enviando mensagem/cobrança sem autorização.

## 100 — Publicar relatório final e iniciar ciclo contínuo

- **Baseline:** implementação `AUSENTE`.
- **Executar:** consolidar os 100 cartões, PRs/commits, CI, deploy, DB, simulações, DORA/SLO, custos, riscos e decisões; recalcular estados, não copiar baseline.
- **Relatório:** resultado executivo, GO/NO-GO, evidências, ações externas efetivamente executadas, rollback, P0–P3 residual, owner/prazo e próximos ciclos 30/60/90 dias.
- **Aceite:** cada etapa tem prova ou bloqueio explícito; nenhuma alegação sem SHA/ambiente; relatório revisado por pessoa diferente do executor.
- **Fechamento:** iniciar revisão mensal de segurança, dependências, DR, performance, a11y, custo e competência, sem declarar “perfeição” permanente.

---

# 9. Matriz obrigatória de verdade funcional

Esta seção impede que funções sugeridas, parcialmente implementadas ou simuladas desapareçam dentro das 100 etapas. Cada linha exige uma decisão `IMPLEMENTAR`, `CONCLUIR`, `OCULTAR/REMOVER`, `ROTULAR DEMO` ou `ACEITAR BLOQUEIO`. Na ausência de decisão de produto/provedor, o default seguro é **não anunciar como disponível**.

## 9.1 Definition of Done para qualquer funcionalidade

Uma feature só recebe `REAL/VERIFIED` se provar, no mesmo SHA:

1. rota/menu/feature flag coerente com o estado real;
2. autenticação e role na UI e no servidor;
3. tenant scoping/RLS e ownership do recurso;
4. persistência ou integração real, sem `useState`, timeout, mock, números aleatórios ou toast como backend;
5. schemas versionados de entrada/saída e erros públicos seguros;
6. idempotência, retry, timeout e comportamento da dependência indisponível;
7. unit/component + contract/integration + E2E proporcionais ao risco;
8. telemetria real sem segredo/PII e alertas quando crítica;
9. rollback/kill switch e migração compatível;
10. documentação, UI e marketing correspondentes ao comportamento.

## 9.2 Inventário e ação mínima por domínio

| ID funcional | Área e estado atual | Arquivos/superfícies iniciais | Ação executável e critério mínimo | Mapeamento |
|---|---|---|---|---|
| F01 | Auth/RBAC/MFA/WebAuthn — `PARCIAL` | auth hooks/components, `webauthn`, `approve-password-reset`, `user_roles` | concluir matriz roles/tenants/sessões, server auth por ação e E2E negativo; bloquear self-escalation | 026, 051, 059, 063–064 |
| F02 | Inbox/mensagens/realtime — `PARCIAL` | inbox/chat hooks, Evolution APIs/webhooks, realtime | E2E com fake Evolution, concorrência/retry/idempotência, cache por tenant e cleanup de canais | 026, 048, 053, 068, 076 |
| F03 | IA/transcrição — `PARCIAL` | `ai-*`, `ai-transcribe-audio` | fechar SSRF, quota/rate limit distribuído, custo/consentimento, schema e telemetria; URL arbitrária proibida | 055–059, 074, 087 |
| F04 | Sentry — `FACADE` | `SentryIntegrationView.tsx`, `vite.config.ts`, ErrorBoundary | ocultar já ou integrar SDK/backend/release/scrub/source maps; teste de evento real | 046, 071, 073, 088, 097 |
| F05 | n8n genérico — `FACADE` | `N8nIntegrationView.tsx`; distinguir `useEvolutionIntegrations` real | remover simulação ou persistir config server-side, testar endpoint/credentials e executar webhook assinado; não confundir com config n8n do Evolution | 051, 056, 059, 088, 097 |
| F06 | Google Calendar — `AUSENTE` | `GoogleCalendarIntegration.tsx` | ocultar ou implementar OAuth PKCE/server callback, token criptografado/refresh, scopes mínimos, sync incremental, revogação e E2E sandbox | 051, 059, 086, 088, 097 |
| F07 | Bitrix24 — `PARCIAL` | `BitrixIntegrationView.tsx`, `useBitrixApi.ts`, `bitrix-api` | fazer campos UI alimentarem config segura real; RBAC/tenant, secret storage, sync cursor/idempotência, contract/E2E | 051, 056, 059, 074, 097 |
| F08 | CSAT/NPS — `FALHA PARCIAL` | `SatisfactionMetrics.tsx`, tabelas/queries NPS | remover valores fixos/aleatórios; query real com período/denominador/empty state, teste determinístico e linhagem da métrica | 047, 071, 088, 097 |
| F09 | Links de pagamento — `FACADE` | `PaymentLinksView.tsx`, `payment_links`, rota `/pay/*` ausente | ocultar até escolher provedor; implementação exige checkout server-side, state machine, assinatura de webhook, idempotência, valor/moeda imutáveis, conciliação/refund e requisitos PCI | 051–059, 076, 086, 097 |
| F10 | Meta CAPI — `FALHA PARCIAL` | `MetaCAPIView.tsx`, tabela de eventos | worker server-side chama Graph API, hashing/consentimento, event_id idempotente, retry/DLQ, `sent_to_meta`/erro e observabilidade; sandbox contract | 051, 056, 074, 076, 086, 097 |
| F11 | LGPD — `FALHA PARCIAL` | `LGPDComplianceView.tsx`, `exportReport.ts` | workflow real de export/delete/anonymize/status/SLA/legal hold/fornecedores; UI nunca declara conclusão ao só auditar | 059, 069–070, 086, 097 |
| F12 | Exportação automática — `DISABLED/PARCIAL` | `AutoExportManager.tsx`, scheduled reports | decidir unificar com relatórios agendados ou remover; autorização, scheduler, entrega segura, expiração, audit e LGPD | 069, 074, 088, 097 |
| F13 | PWA/Web Push — `FALHA` | `vite.config.ts`, manifest, push hooks; `public/sw.js` ausente | escolher implementar integralmente ou remover toda promessa/dependência; segurança de cache e subscription | 060, 082, 086, 091–092 |
| F14 | Automações genéricas — `PARCIAL` | `AutomationsManager.tsx`, `useAutomations.ts`, tabela `automations` | criar executor versionado de trigger→conditions→actions, allowlist/RBAC, idempotência, retry/DLQ, dry-run e audit; ou rotular “configuração sem execução” | 051, 056, 059, 074, 076, 094, 097 |
| F15 | Campanhas clássicas — `PARCIAL` | `CampaignsView.tsx`, `useCampaigns.ts` | reutilizar explicitamente o executor TalkX ou criar worker; audience snapshot, opt-out, schedule, throttle, idempotência e status real; não fingir envio por status DB | 055, 059, 074, 076, 097 |
| F16 | TalkX — `PARCIAL AVANÇADA` | `src/components/talkx/**`, `talkx-scheduler`, `talkx-send` | RBAC/tenant, scheduler autenticado, atomic claim, dedupe, limits, unsubscribe, DLQ, E2E fake Evolution e operação monitorada | 052, 055, 059, 074–077, 097 |
| F17 | Chatbot/flows genéricos — `PARCIAL` | `ChatbotFlowEditor`, `ChatbotFlowsView`, `chatbot-l1` | compilar versões publicadas, provar cada trigger/action suportado, state/timeout/idempotência e rollback; separar builder genérico do L1 específico | 051, 056, 059, 076, 094, 097 |
| F18 | WhatsApp Flows — `PARCIAL` | `WhatsAppFlowsBuilder.tsx` | draft/version/publish via API real Meta/Evolution, validation, send, submission webhook autenticado, status/rollback e sandbox E2E; ou rotular editor de rascunho | 051–059, 076, 094, 097 |
| F19 | API pública — `PARCIAL INSEGURA` | `PublicApiDashboard.tsx`, `public-api` | credenciais hash/scoped por tenant, rotação, RBAC, rate limit distribuído, logs/audit, OpenAPI e contract/E2E; remover exposição do token global | 052, 054–059, 086, 094, 097 |
| F20 | Diagnósticos/monitoramento — `PARCIAL INSEGURA` | `DiagnosticsView`, `MonitoringDiagnosticPanel`, `webhook-diagnostic`, `connection-health-check` | separar leitura de mutação; admin + reauth para repair, dry-run/confirm/audit, allowlist de ações e no auto-fix genérico | 051, 056, 059, 071–078, 097 |
| F21 | VoIP — `PARCIAL` | `VoIPPanel.tsx`, SIP hooks, `get-sip-password` | tirar config sensível/default de localStorage, provisionar server-side por tenant/role, short-lived credentials, E2E sandbox, permission/media handling e observabilidade | 051, 059, 074, 086, 092, 097 |
| F22 | Relatórios agendados — `PARCIAL` | `ScheduledReportsManager`, `useScheduledReports`, `send-scheduled-report` | provar scheduler, claim/idempotência, RBAC, query real, formato, entrega, retry/DLQ, expiração e audit; nenhum destinatário cross-tenant | 052, 055–059, 069, 074, 076–077 |
| F23 | Acessibilidade — `PARCIAL` | componentes, axe DEV | gate automatizado + auditoria manual WCAG 2.2 AA e matriz screen reader/keyboard | 030, 049–050, 092 |
| F24 | Performance — `FALHA/PARCIAL` | lazy routes, Vite chunks, Web Vitals | budgets bloqueantes, RUM real, libs sob demanda, CSS/entry reduzidos e profiling | 018, 041–050 |
| F25 | Documentação funcional — `FALHA` | docs/features/README/ADRs | remover “100%”, contagens/paths obsoletos e promessas falsas; status por feature ligado a testes | 040, 088–089, 097–100 |

## 9.3 Fluxo de decisão para cada F01–F25

1. Reproduzir o comportamento no SHA atual, sem rede externa real.
2. Localizar UI, hook, Edge/RPC, tabelas, migrations, secrets por nome e provider.
3. Desenhar um sequence diagram curto do fluxo atual; marcar onde ele termina em mock/toast/localStorage/DB-only.
4. Escolher uma decisão e registrar owner/prazo:
   - `CONCLUIR`: já há backend substancial e faltam gaps delimitados;
   - `IMPLEMENTAR`: contrato/provedor aprovados;
   - `OCULTAR/REMOVER`: não há backend ou valor atual;
   - `ROTULAR DEMO`: somente ambiente não produtivo, dados sintéticos e banner inequívoco;
   - `BLOQUEAR`: depende de decisão/credencial/contrato externo.
5. Escrever testes negativos antes da integração.
6. Implementar em PR exclusivo por feature/provedor.
7. Aplicar a Definition of Done 9.1.
8. Atualizar menu, docs e matriz apenas depois dos testes.

### 9.3.1 Default seguro imediato para facades

Até a implementação real ser aprovada, Cline deve preparar um patch local que:

- remova do menu produtivo ou marque inequivocamente `Indisponível/Beta/Demo` Sentry, n8n genérico, Google Calendar, pagamentos e Meta CAPI;
- substitua métricas aleatórias de satisfação por empty state “sem dados”;
- altere LGPD para não afirmar exportação/exclusão concluída;
- rotule Automations/Campaigns/WhatsApp Flows conforme o que efetivamente executam;
- mantenha rotas existentes acessíveis somente se isso não induzir operação real incorreta;
- inclua testes que falhem se a feature voltar a ser anunciada como disponível sem capability flag server-side.

Esse patch é Classe B. A decisão final de produto e qualquer integração externa continuam nos checkpoints apropriados.

---

# 10. Matriz de testes de segurança obrigatória

Use esta matriz em todas as funções P0/P1. Marque `EXECUTADO`, `INFERIDO` ou `BLOQUEADO`; somente `EXECUTADO` conta para `VERIFIED`.

| Cenário | Webhook | API autenticada | RPC/DB | URL fetch | Job/cron |
|---|---:|---:|---:|---:|---:|
| happy path autorizado | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| sem credencial/JWT | obrigatório | obrigatório | obrigatório | se aplicável | obrigatório |
| credencial/assinatura inválida | obrigatório | obrigatório | — | — | obrigatório |
| timestamp expirado/futuro | obrigatório | se key assinada | — | — | obrigatório |
| body alterado após assinatura | obrigatório | se assinado | — | — | — |
| role insuficiente | painel/replay | obrigatório | obrigatório | obrigatório | painel/manual |
| tenant/recurso alheio | instance binding | obrigatório | obrigatório | storage URL | destinatário |
| duplicata sequencial | obrigatório | mutation | mutation | cache | obrigatório |
| duplicata concorrente | obrigatório | mutation | mutation | — | obrigatório |
| timeout/falha parcial | obrigatório | obrigatório | transaction | obrigatório | obrigatório |
| retry/crash entre efeitos | obrigatório | mutation | transaction | — | obrigatório |
| payload inválido/grande | obrigatório | obrigatório | params | obrigatório | obrigatório |
| rate limit compartilhado | obrigatório | obrigatório | — | obrigatório | se público |
| logs sem segredo/PII | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| rollback/kill switch | obrigatório | mutation | migration | obrigatório | obrigatório |

## 10.1 Testes sentinela que não podem ser removidos

- request sem assinatura não chega ao cliente service role;
- mesma idempotency key em duas workers produz um único efeito;
- usuário tenant A não lê QR/instance/registro do tenant B;
- `evolution-api` role baixa não executa ação admin/destrutiva;
- URL pública que redireciona para IP privado é rejeitada;
- hostname que resolve para private/link-local/metadata é rejeitado;
- public API key revogada/scopeless/cross-tenant retorna 401/403 sem revelar existência;
- scanner indisponível, audit output inválido e budget script quebrado falham a CI;
- logout/troca de usuário remove cache e subscriptions do usuário anterior;
- facade não aparece como `Disponível` sem capability real.

---

# 11. Gates de saída por fase

## 11.1 Gate G0 — custódia e identidade

Só avançar para qualquer leitura remota sensível quando:

- 005 tem quatro `MATCH` autenticados ou o alvo ausente está explicitamente fora do cartão atual;
- 006 registra a decisão Vercel e mantém o vencimento/condição do aceite temporário MCP visível;
- 007 tem inventário sanitizado;
- 008/009 têm baseline no mesmo SHA;
- 010 classifica 100% do drift;
- nenhuma credencial exposta foi usada.

Trabalho local de hotfix pode avançar paralelamente; mutações remotas não.

## 11.2 Gate G1 — hotfix P0 de segurança

Ordem de implementação recomendada:

1. testes e helpers compartilhados de raw-body auth, constant-time, freshness e redaction;
2. assinatura Meta/WhatsApp;
3. autenticação Evolution conforme capacidade real do GO;
4. verificação Google OIDC/subscription no Gmail;
5. assinatura ElevenLabs conforme contrato oficial;
6. cron auth;
7. idempotência/DLQ comum;
8. RBAC por ação/tenant no `evolution-api` e funções service-role;
9. nova arquitetura de API keys tenant-scoped;
10. `safeFetch`/allowlists e migração das superfícies SSRF;
11. CORS/methods/headers;
12. gate amplo e revisão adversarial.

Saída:

- testes sentinela 10.1 passam;
- zero endpoint público mutável sem auth alternativa forte;
- zero ação service-role sem authorization de negócio;
- zero fetch P0 de URL arbitrária fora da policy;
- migrations locais passam em DB efêmero;
- nenhum segredo/provider real foi usado.

## 11.3 Gate G2 — supply chain e CI

Saída:

- zero vulnerabilidade crítica;
- alta nova/explorável bloqueia;
- secret scanner e dependency scanner falham fechado;
- coverage funciona e começa ratchet;
- bundle budget é executável;
- CI mantém pins/permissões/timeouts/concurrency;
- required checks só são configurados remotamente depois de existirem.

## 11.4 Gate G3 — banco e autorização

Saída local:

- migration versions únicas e ledger reconciliado;
- banco efêmero instala do zero e atualiza de snapshot;
- testes RLS/SECURITY DEFINER/grants negativos passam;
- IDOR das connection RPCs fechado;
- tipos/catalog/manifest sincronizam.

Saída remota exige checkpoint D, backup, dry-run e relatório pós-aplicação. Sem isso, marcar `READY_FOR_APPROVAL`, nunca `VERIFIED_REMOTE`.

## 11.5 Gate G4 — confiança de mudança

Saída:

- taxonomy/test globs provados;
- warnings React críticos zerados;
- coverage/strict/lint ratchets só diminuem;
- E2E crítico e a11y smoke passam em ambiente isolado;
- mocks não simulam sucesso por default;
- arquitetura tem regras de dependência incrementais.

## 11.6 Gate G5 — verdade funcional

Saída:

- F01–F25 têm decisão e owner;
- toda feature visível em produção é `REAL` pela Definition of Done 9.1;
- facades estão ocultas/removidas/DEMO;
- nenhum número aleatório ou timeout simulado é apresentado como integração/métrica;
- cada integração real tem sandbox contract, failure behavior, telemetry e kill switch.

## 11.7 Gate G6 — performance e acessibilidade

Saída:

- budgets de JS/CSS/chunk/total aprovados e verdes;
- Mapbox/PDF/charts/xlsx não carregam fora do uso;
- source maps têm estratégia segura;
- RUM Web Vitals é real;
- Lighthouse/axe e WCAG manual não têm blockers críticos;
- browser/device matrix aprovada.

## 11.8 Gate G7 — operação e governança

Saída:

- observabilidade, correlation, SLOs, alerts e runbooks usam dados reais;
- Evolution/VPS têm identidade, versioning, backup e monitoring;
- restore/game day/DR medem RPO/RTO em ambiente isolado;
- lifecycle de secrets e custos têm owner/alerta;
- docs/ADRs/ownership/onboarding são atuais.

## 11.9 Gate G8 — release

Saída:

- auditoria 096 independente produz GO/GO COM RESSALVAS;
- 097 fecha P0 e formaliza P1;
- 098 congela SHA/artifacts e obtém sign-off;
- 099 somente após autorização Classe D e canary observável;
- 100 liga cada conclusão à evidência.

---

# 12. Pacotes mínimos para solicitar autorização

O Cline não deve perguntar apenas “posso prosseguir?”. Deve apresentar o pacote aplicável.

## 12.1 Rotação/revogação de credencial

```markdown
- Credencial: <nome, nunca valor>
- Provedor/ambiente:
- Motivo/risco da exposição:
- Consumidores conhecidos:
- Plano de rotação sem downtime:
- Como validar o novo valor:
- Como provar que o antigo foi revogado:
- Rollback/dual-key window:
- Logs que serão sanitizados:
- Ação exata solicitada:
```

## 12.2 Acesso read-only a Vercel/Hostinger/Supabase

```markdown
- Identidade esperada:
- Metadata exata a consultar:
- Ferramenta/canal seguro:
- Permissões mínimas:
- Garantia de que não usará credencial exposta:
- Dados que não serão consultados:
- Resultado necessário para fechar a etapa:
```

## 12.3 Aplicação de migration/reparo de ledger

```markdown
- Project ref/PG/ambiente verificados:
- SHA e migration(s) exatas:
- Causa do drift:
- SQL revisado e efeitos:
- Locks/tempo/volume esperado:
- Compatibilidade app N/N-1:
- Backup/PITR e restore comprovados:
- Dry-run/staging:
- Rollback ou forward-fix:
- Smoke e monitoramento:
- Ação Classe D exata solicitada:
```

## 12.4 Deploy/promoção Vercel ou Edge

```markdown
- Projeto/ambiente/SHA/artifact:
- CI e auditoria vinculadas:
- Mudanças de env/secrets por nome:
- Migrations prévias/posteriores:
- Plano de canary:
- SLOs/abort conditions:
- Rollback imutável:
- Janela/owner/comunicação:
- Ação Classe D exata solicitada:
```

## 12.5 VPS/Evolution GO

```markdown
- Host/projeto/container/image digest:
- Estado/backup atual:
- Mudança exata e motivo:
- Compatibilidade API/webhook:
- Health/smoke:
- Resource/port/TLS impact:
- Rollback de imagem/config/volume:
- Janela e owner:
- Ação Classe D exata solicitada:
```

## 12.6 Escolha de feature/provedor

```markdown
- Feature Fxx:
- Estado real e risco de mantê-la visível:
- Opções: implementar / concluir / ocultar / demo:
- Provedor/contrato/custo/dados envolvidos:
- Escopo mínimo e Definition of Done:
- Dependências/credenciais ainda ausentes:
- Recomendação do executor:
- Decisão solicitada ao proprietário:
```

---

# 13. Regras de implementação e revisão de diff

## 13.1 Convenções do repositório

- TypeScript; arquivos novos em `snake_case` quando compatível com o diretório existente;
- funções `camelCase`, classes/tipos `PascalCase`, constantes `SCREAMING_SNAKE_CASE`;
- exports nomeados e estilo de import já adotado no módulo;
- Conventional Commits, imperativo e escopo claro;
- manter mudança mínima; não refatorar vizinhança sem vínculo com causa raiz.

## 13.2 Proibições de “greenwashing” técnico

Não é permitido:

- aumentar baseline de lint/coverage/audit/bundle para fazer CI passar;
- adicionar `continue-on-error`, `|| true`, catch vazio ou fallback success;
- enfraquecer assertion, remover negative test ou atualizar snapshot sem revisão;
- usar `as any`, non-null assertion ou `as unknown as` para esconder contrato quebrado;
- marcar integration test como unit mockado;
- retornar 200 em falha para silenciar provider sem protocolo explícito;
- criar migration vazia/stub para mascarar drift;
- esconder feature incompleta apenas na documentação enquanto menu continua ativo;
- registrar segredo em screenshot, trace, artifact, commit ou comentário.

## 13.3 Checklist linha por linha antes do commit

- diff está dentro do cartão/PR;
- imports/exports, dead code e naming coerentes;
- auth acontece antes de service role/efeito;
- tenant deriva de sessão/relação server-side;
- raw body é preservado quando assinatura depende dele;
- retry não duplica efeito;
- logs/responses redigidos;
- timeout/abort/limites presentes em rede;
- rollback e backwards compatibility descritos;
- testes falham sem o fix e passam com ele;
- `git diff --check` limpo;
- nenhum arquivo gerado/secret/artifact indevido.

---

# 14. Estrutura do relatório de cada PR local

```markdown
## Resultado
- Etapas/Fxx:
- Veredito local: READY / NOT READY / BLOCKED
- Base → HEAD:

## Causa raiz reproduzida
- Cenário:
- Evidência antes:

## Mudança
- Arquivos:
- Decisões de design:
- Compatibilidade:

## Segurança
- Auth/RBAC/tenant/RLS:
- Secrets/PII/logs:
- Idempotência/retry/rate limit:

## Testes
| Comando | Exit | Pass/fail/skip | Duração | Observação |

## Diff e commits
- git diff --stat:
- git diff --check:
- commits locais:

## Rollback
- Procedimento:
- Dados/migrations:

## Riscos e bloqueios
- Residual:
- Ação externa ainda não executada:
- Autorização mínima necessária:
```

---

# 15. Formato da próxima resposta do Cline

Na primeira devolutiva após receber este handoff, Cline deve informar:

1. confirmação das sete leituras obrigatórias;
2. preflight com branch/HEAD/base/dirty tree, sem URL remota credenciada;
3. confirmação de que 001–004 não foram refeitas e que 006 não foi reinterpretada como CI;
4. estado atualizado de 005–010, separando execução de implementação;
5. decisão ainda necessária para a credencial Vercel, expiração/condição do MCP, acesso Hostinger e drift;
6. branch/PR local escolhido para 051–060;
7. primeiro teste P0 que falha antes do patch;
8. arquivos que pretende tocar nesse PR e arquivos explicitamente fora do escopo;
9. nenhuma solicitação de push/deploy/SQL antes de apresentar diff, testes e rollback.

Exemplo de veredito correto nesta fase:

```text
Custódia: PARTIAL/BLOCKED por decisões externas.
Hotfix P0 local: IN_PROGRESS.
Banco/produção: NO ACTION — não autorizado.
Release: NO-GO.
```

---

# 16. Critério final de aceite deste handoff

O Cline executou este handoff corretamente somente se:

- preservou IDs/títulos e ledger 001–100;
- não usou nem repetiu as credenciais expostas;
- não fez ação C/D sem aprovação pontual;
- tratou o relatório anterior como alegação, não prova;
- reproduziu cada falha antes do patch;
- entregou testes negativos e rollback para cada P0/P1;
- resolveu ou classificou todo drift antes de SQL;
- aplicou a matriz F01–F25, incluindo funções ausentes e parciais;
- não apresentou facade como feature concluída;
- executou gates locais/CI proporcionais ao risco;
- separou commits/PRs por domínio;
- obteve auditoria independente antes da release;
- terminou com evidência no mesmo SHA e relatório 100, não com uma declaração genérica de “100%”.

Enquanto qualquer P0, credencial exposta válida sem decisão, drift desconhecido ou endpoint público sem autenticação forte permanecer aberto, o veredito obrigatório é:

> **NO-GO PARA MERGE, DEPLOY, BANCO E PRODUÇÃO.**
