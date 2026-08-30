# Handoff operacional para o Cline — Zapp Web V2 em 100 etapas

> **Destinatário:** Cline, atuando como executor Full Stack Sênior.
> **Data-base:** 2026-08-30, fuso America/Sao_Paulo.
> **Repositório:** `adm01-debug/zapp-web-v2`.
> **Base remota verificada na elaboração:** `origin/main` em `19b0f6448910bcb29ccd9ddd964f99a303a823b0`.
> **Natureza deste documento:** plano operacional. Ele não autoriza, por si só, escrita no banco, rotação de credenciais, push, merge ou deploy.

---

## 0. Prompt de início para entregar ao Cline

Copie e envie ao Cline exatamente o bloco abaixo:

```text
Você é o executor responsável pelo programa de correção e melhoria do Zapp Web V2.

1. Abra e leia integralmente:
   - CLAUDE.md
   - .codex/AGENTS.md
   - .agents/skills/zapp-web-v2/SKILL.md
   - docs/handoffs/handoff_cline_100_etapas_2026_08_30.md
2. Trate este handoff como checklist operacional, mas trate o código, a CI e os serviços consultados ao vivo como fonte de verdade. Não aplique uma correção apenas porque ela aparece no plano: primeiro reproduza ou prove o problema.
3. Comece pela etapa 001 e respeite dependências, gates e critérios de aceite. Não pule etapas silenciosamente.
4. Para cada etapa, registre estado, evidência, arquivos alterados, comandos e resultados no diário definido na etapa 004.
5. Pode executar autonomamente leituras, testes e alterações reversíveis em uma branch local. Pare e solicite aprovação antes de: revelar/rotacionar credenciais; escrever SQL no banco oficial; registrar migrations ao vivo; alterar serviços externos; disparar workflows; fazer push/merge; publicar Vercel/Supabase; reiniciar ou modificar a VPS/Evolution GO; apagar dados ou arquivos materiais.
6. Nunca use outro projeto Supabase. O projeto oficial é tnnnlkbymytvtqngbbqh. Verifique a identidade novamente imediatamente antes de qualquer operação externa.
7. Nunca copie para arquivos, logs, commits, terminal compartilhado ou respostas o URL autenticado do MCP fornecido em conversa, tokens, chaves, cookies ou conteúdo de .env.
8. Preserve mudanças preexistentes do usuário. Não use git reset --hard, git clean -fd, checkout destrutivo ou force push.
9. Uma etapa só pode ficar VERIFIED quando todas as verificações e o critério de aceite tiverem evidência. Se já estiver resolvida, use SKIPPED_WITH_EVIDENCE e anexe a prova.
10. Ao fechar cada onda de 10 etapas, execute o gate da onda, apresente um resumo de riscos e aguarde aprovação apenas se o próximo trabalho exigir mutação externa.

Comece agora pelas etapas 001–005, sem alterar serviços externos, e apresente o baseline obtido.
```

---

## 1. Missão, resultado esperado e limites

### 1.1 Missão

Elevar o Zapp Web V2 de um sistema funcional com dívida técnica conhecida para uma plataforma com segurança verificável, CI confiável, contratos testados, performance mensurada, banco governado, observabilidade operacional e processo sustentável de entrega.

### 1.2 Resultado final esperado

Ao concluir a etapa 100, deve existir evidência de que:

- a cadeia de dependências não possui vulnerabilidade crítica conhecida e toda vulnerabilidade alta restante tem exceção temporária, proprietário e prazo;
- instalação congelada, typecheck, testes, contratos, build, ratchets, segurança e budgets executam de modo reprodutível na CI;
- fluxos críticos possuem testes unitários, de integração, contrato e E2E proporcionais ao risco;
- o frontend mede Core Web Vitals reais, atende budgets aprovados e passa o baseline WCAG 2.2 AA nos fluxos críticos;
- Edge Functions públicas têm autenticação alternativa, validação, rate limiting e proteção contra replay documentados e testados;
- migrations, catálogo, tipos gerados e banco oficial têm paridade comprovada;
- RLS, funções `SECURITY DEFINER`, grants e isolamento multi-tenant possuem testes negativos;
- webhooks têm idempotência, fila de falhas, replay controlado, métricas, alertas e runbook;
- Vercel, Supabase Cloud e Evolution GO possuem procedimentos de deploy, rollback, backup e recuperação exercitados;
- métricas DORA/SLO, dívida técnica, ADRs e ownership alimentam uma rotina mensal de melhoria.

### 1.3 Fora de escopo sem nova autorização

- reescrever o produto em outro framework;
- migrar prematuramente para microsserviços ou Kubernetes;
- trocar Supabase, Vercel, Hostinger ou Evolution GO;
- alterar bancos externos consumidos pelo produto;
- apagar migrations históricas, dados de clientes, backups ou recursos de produção;
- executar deploy, merge ou mudança de DNS/infra apenas para “validar” uma hipótese.

---

## 2. Coordenadas e fontes de verdade

| Domínio | Coordenada autorizada / regra |
|---|---|
| Repositório | `adm01-debug/zapp-web-v2`, branch-base `main` |
| Supabase oficial | Projeto `tnnnlkbymytvtqngbbqh`, PostgreSQL 17.6 |
| MCP Supabase | Preferir a conexão nomeada `SUPABASE - ZAPP WEB V2 - MCP`; não persistir seu URL autenticado |
| MCP alternativo informado | `MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2`; só usar depois de confirmar que resolve para o mesmo project ref |
| Frontend | Vercel `juca1/zapp-web-v2`, project id `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` |
| WhatsApp | Evolution GO, projeto Hostinger `evolution-go-rxj2`, host público documentado em `CLAUDE.md` |
| VPS | Hostinger `187.77.151.129`; não confundir com outra VPS/Portainer |
| Webhook principal | Edge Function `evolution-webhook` do projeto oficial |
| Regra de banco | Revalidar `CLAUDE.md`, project ref, usuário corrente, database e versão antes de qualquer SQL |
| Bancos proibidos para escrita | Todos os refs explicitamente marcados como antigos ou externos em `CLAUDE.md` |

Ordem de autoridade quando houver divergência:

1. identidade consultada ao vivo do serviço;
2. código da `origin/main` atual;
3. `CLAUDE.md` e guards automatizados;
4. migrations, catálogo, tipos e workflows versionados;
5. handoffs e auditorias históricas;
6. este documento.

Se 1–4 divergirem, parar a mutação, registrar o conflito e resolver a fonte de verdade antes de continuar.

---

## 3. Snapshot técnico conhecido — é baseline histórico, não verdade eterna

O Cline deve medir novamente na etapa 008. Os números abaixo servem para detectar regressão ou mudança de cenário:

- a branch local estava um commit atrás; a `origin/main` já continha `19b0f644`, que corrige o `bun.lock` e remove um `as any` dos testes de contrato;
- a árvore da `origin/main` tinha 312 arquivos SQL em `supabase/migrations/` e 61 entradas `supabase/functions/*/index.ts`;
- o usuário relatou 299 migrations no banco. Essa diferença não prova drift: contagem e identidade precisam ser reconciliadas ao vivo, incluindo stubs, prefixos, ledger e hashes;
- `bun run typecheck` passava com `strict: false`; um dry-run estrito produziu cerca de 146 erros, concentrados em nullability e contratos Supabase;
- o lint completo tinha aproximadamente 1.123 ocorrências na base atual, protegidas por ratchet, mas ainda não zeradas;
- 152 arquivos de teste passaram, com 2.493 testes aprovados e 32 ignorados; o log continha avisos de `act(...)` e mocks Supabase incompletos;
- `bun run test:coverage` falhava porque `@vitest/coverage-v8` não estava instalado;
- não havia suíte Playwright/Cypress E2E detectada;
- o build passava, mas o HTML inicial referenciava aproximadamente 2.102,66 KB brutos / 606,94 KB gzip de JavaScript e 205,59 KB de CSS;
- assets de produção, sem source maps, somavam aproximadamente 9.354,92 KB; source maps somavam cerca de 23.568,21 KB;
- budgets declarados: JS inicial 350 KB, CSS inicial 80 KB, maior chunk 200 KB e total de assets 2.000 KB; a CI reportava tamanhos, mas não os bloqueava;
- chunks pesados observados: Mapbox ~1,64 MB, PDF ~455 KB, charts ~442 KB, UI ~330 KB, VoIP ~237 KB e Contacts ~225 KB;
- o audit de dependências reportou 44 vulnerabilidades resolvidas no grafo instalado: 1 crítica e 43 altas; a CI executava o audit com `continue-on-error: true`;
- `tsconfig.app.json` mantinha `strict`, `noImplicitAny`, `noUnusedLocals` e `noUnusedParameters` desabilitados;
- `vite.config.ts` gerava hidden source maps em produção sem integração de upload/remoção comprovada;
- `src/lib/web-vitals.ts` mantinha métricas apenas em memória/log, incluía FID legado e não implementava corretamente a agregação de INP;
- `supabase/config.toml` configurava `verify_jwt = false` para webhooks, cron Gmail e `public-api`; cada exceção precisa de autenticação alternativa provada;
- o rate limiter compartilhado usava `Map` por isolate e zerava em cold start, portanto não era um controle distribuído suficiente;
- o ADR de cache do WhatsApp registrava tabela minúscula com dezenas de milhões de sequential scans; a causa provável é frequência de consulta, não falta de índice;
- rotas React já usavam `lazy`/`Suspense`, o que deve ser preservado e medido antes de novas divisões;
- havia ADRs duplicados com o identificador `ADR-003` e documentos com métricas/versões desatualizadas.

---

## 4. Protocolo operacional obrigatório

### 4.1 Estados aceitos por etapa

- `NOT_STARTED`: ainda não analisada.
- `IN_PROGRESS`: em execução, com branch e responsável registrados.
- `BLOCKED`: impedimento externo ou decisão necessária; incluir causa e próxima ação.
- `VERIFIED`: implementada e todos os critérios de aceite comprovados.
- `SKIPPED_WITH_EVIDENCE`: já resolvida ou inaplicável, com comando/link que prova isso.
- `ROLLED_BACK`: tentativa revertida; registrar motivo, mecanismo e estado restaurado.

### 4.2 Loop de execução de cada etapa

1. Re-sincronizar metadados remotos com `git fetch --no-tags origin main`.
2. Confirmar branch, HEAD e `git status --short`; preservar qualquer mudança preexistente.
3. Reproduzir ou medir o problema antes de editar.
4. Definir o menor diff que elimina a causa raiz.
5. Escrever ou atualizar o teste que falha antes da correção quando isso for viável.
6. Implementar seguindo arquivos `snake_case`, funções `camelCase`, classes/tipos `PascalCase`, constantes `SCREAMING_SNAKE_CASE`, exports nomeados e imports no padrão existente.
7. Executar verificações focadas e depois o gate amplo aplicável.
8. Revisar `git diff --check`, `git diff --stat` e o diff integral.
9. Atualizar o diário de execução e documentação afetada.
10. Só então marcar `VERIFIED` ou `SKIPPED_WITH_EVIDENCE`.

### 4.3 Gates de autorização

| Classe | Exemplos | Autonomia do Cline |
|---|---|---|
| A — leitura | `rg`, testes, builds, consultas SQL somente leitura, inspeção de Vercel/VPS | Permitida, sem imprimir segredos |
| B — escrita reversível local | branch local, código, testes, migrations ainda não aplicadas, documentação | Permitida no escopo deste plano |
| C — escrita remota reversível | push de branch, abertura de PR, dispatch não produtivo | Exige aprovação explícita no momento da ação |
| D — produção/sensível | SQL/DDL/DML no banco oficial, secrets, deploy, merge, rollback, restart da VPS, replay de webhook | Exige aprovação explícita e plano de rollback validado |

Uma autorização para uma ação Classe D não autoriza automaticamente a próxima.

### 4.4 Condições de parada imediata

Parar e informar o usuário se ocorrer qualquer um destes casos:

- project ref, repositório, branch ou host não corresponder às coordenadas acima;
- working tree tiver alterações não reconhecidas que colidam com a etapa;
- uma migration local tiver prefixo duplicado ou divergir do ledger remoto;
- um comando puder expor `.env`, token, service-role key, URL autenticado ou payload pessoal;
- testes indicarem perda de isolamento tenant/RLS, quebra de autenticação ou corrupção de dados;
- o rollback não puder ser descrito e testado proporcionalmente ao risco;
- houver sessão paralela mudando o mesmo arquivo, migration ou serviço;
- a correção exigir apagar dados, reescrever histórico Git ou alterar banco externo.

### 4.5 Estratégia Git

Não atualizar a branch local com comandos destrutivos. O início seguro, com working tree limpo, é:

```bash
git fetch --no-tags origin main
git status --short --branch
git switch -c chore/excellence-wave-01 origin/main
git rev-parse --verify HEAD
```

Se a branch já existir, escolher outro nome; não sobrescrever. Sugestão de divisão:

- uma branch/PR por onda quando o diff for pequeno e coeso;
- separar dependências, CI, migrations, segurança, performance e documentação em PRs próprios;
- alvo preferencial: menos de 400 linhas sem arquivos gerados; máximo de uma decisão arquitetural por PR;
- commits no padrão Conventional Commits, como `fix(ci): torna audit de dependências bloqueante`.

Não versionar `node_modules/`, `dist/`, relatórios temporários, credenciais ou arquivos do MCP.

### 4.6 Gate local mínimo

O gate exato pode evoluir, mas a intenção deve permanecer:

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
git diff --check
```

Comandos não existentes ainda devem ser registrados como lacunas, não simulados como sucesso.

---

## 5. Diário e evidência exigidos

Na etapa 004, criar `docs/handoffs/cline_execution_log_2026_08_30.md` com uma linha por etapa:

| Etapa | Estado | Branch/commit | Evidência | Arquivos/serviços | Risco residual | Próxima ação |
|---:|---|---|---|---|---|---|
| 001 | NOT_STARTED | — | — | — | — | Ler fontes |

Para comandos demorados, registrar resumo e caminho do artefato, não milhares de linhas de log. Nunca incluir valores de secrets, `.env`, headers de autorização ou dados pessoais.

---

# Onda 1 — Custódia, baseline e identidade (001–010)

**Objetivo da onda:** garantir que o Cline esteja corrigindo a revisão e os serviços certos, com baseline reproduzível e sem vazar credenciais.

### 001 — Ler as regras e declarar entendimento

- **Prioridade / risco / dependências:** P0, risco operacional; nenhuma dependência.
- **Executar:** ler integralmente as quatro fontes indicadas no prompt, localizar instruções adicionais `AGENTS.md`/skills aplicáveis e resumir limites, convenções e serviços proibidos.
- **Verificar:** citar os caminhos lidos, o project ref oficial, a branch-base e as ações Classe D.
- **Aceite:** nenhuma edição feita antes da leitura; resumo sem credenciais e sem contradições com `CLAUDE.md`.
- **Rollback/registro:** não aplicável; registrar a revisão de cada documento.

### 002 — Sincronizar a base de trabalho sem destruir alterações

- **Prioridade / risco / dependências:** P0; depende de 001.
- **Executar:** rodar `git status`, `git remote -v` com cuidado para não exibir credenciais embutidas, `git fetch --no-tags origin main` e criar branch nova a partir de `origin/main`.
- **Verificar:** `git rev-parse HEAD` deve coincidir com `git rev-parse origin/main` no momento da criação; confirmar que o commit `19b0f644` ou seu sucessor está contido.
- **Aceite:** branch de trabalho isolada, nenhuma mudança do usuário descartada e instalação não iniciada sobre o commit local defasado.
- **Rollback/registro:** apagar a branch só após confirmar que não contém trabalho; caso haja dirty tree, parar em vez de limpar.

### 003 — Fixar e registrar o ambiente de ferramentas

- **Prioridade / risco / dependências:** P0; depende de 002.
- **Executar:** registrar SO, arquitetura, `node --version`, `bun --version`, `git --version`, `psql --version` se disponível e versões declaradas nos workflows. Usar Bun 1.4.0 e Node 24 para reproduzir a CI, de preferência via gerenciador de versões.
- **Verificar:** `bun install --frozen-lockfile` deve finalizar sem modificar `bun.lock`; comparar `git status` antes/depois.
- **Aceite:** matriz local/CI documentada; qualquer divergência tem justificativa ou correção planejada.
- **Rollback/registro:** não commitar arquivos gerados pela instalação.

### 004 — Criar o diário de execução e a matriz de decisões

- **Prioridade / risco / dependências:** P0; depende de 002.
- **Executar:** criar o diário no formato da seção 5, pré-popular as 100 etapas como `NOT_STARTED` e uma seção `Decisões pendentes` com proprietário e prazo.
- **Verificar:** um script simples ou inspeção deve provar que existem exatamente 100 IDs únicos de `001` a `100`.
- **Aceite:** toda ação posterior consegue apontar para uma linha de evidência; nenhum segredo no arquivo.
- **Rollback/registro:** a própria mudança é documental e reversível.

### 005 — Verificar identidades de todos os alvos sem mutação

- **Prioridade / risco / dependências:** P0; depende de 001–003.
- **Executar:** confirmar repo/owner, Vercel project id, Supabase project ref/database/version e Evolution GO host/projeto. No SQL, usar somente `SELECT current_database(), current_user, version()` e metadados equivalentes; não consultar conteúdo pessoal.
- **Verificar:** comparar com a seção 2 e `CLAUDE.md`; confirmar que MCPs alternativos apontam para o mesmo ref antes de usá-los.
- **Aceite:** tabela de identidade preenchida com `MATCH`/`MISMATCH`; qualquer `MISMATCH` bloqueia ações externas.
- **Rollback/registro:** consultas exclusivamente read-only.

### 006 — Tratar o URL autenticado do MCP como credencial exposta

- **Prioridade / risco / dependências:** P0 de segurança; depende de 005.
- **Executar:** não copiar o URL informado na conversa. Verificar apenas se ele foi acidentalmente persistido no Git e nos arquivos locais com busca pelo domínio e por fragmentos não secretos. Preparar procedimento de rotação/revogação no provedor responsável.
- **Verificar:** `git grep` e busca em arquivos versionáveis não devem retornar o token; revisar histórico recente sem imprimir a credencial inteira.
- **Aceite:** ausência comprovada no repositório e decisão registrada: `ROTATE_APPROVED`, `ROTATED` ou `ACCEPTED_TEMPORARY_RISK` com proprietário/prazo.
- **Rollback/registro:** rotação é Classe D; o Cline deve parar antes de executá-la. Nunca registrar o valor antigo ou novo.

### 007 — Inventariar superfícies de segredo e dados sensíveis

- **Prioridade / risco / dependências:** P0; depende de 003.
- **Executar:** mapear `.env*`, GitHub Actions secrets referenciados, Supabase Edge secrets, Vercel envs e Evolution GO envs por **nome**, nunca por valor. Rodar scanner local confiável contra working tree e histórico relevante.
- **Verificar:** classificar achados em segredo real, fixture sintética ou falso positivo; conferir se service-role/token global nunca chega ao bundle `VITE_*`.
- **Aceite:** inventário de nomes, escopo, proprietário e rotação; zero segredo real versionado sem remediação imediata.
- **Rollback/registro:** não abrir arquivos secretos na saída; qualquer vazamento interrompe o trabalho e aciona rotação aprovada.

### 008 — Capturar o baseline completo da revisão atual

- **Prioridade / risco / dependências:** P0; depende de 002–003.
- **Executar:** rodar instalação congelada, testes de scripts CI, lint ratchet, lint completo capturado, typecheck, strict dry-run, testes unitários, contratos, coverage, build, audit e guard DB. Medir duração e exit code de cada comando.
- **Verificar:** diferenciar falha esperada de dívida histórica de regressão real; confirmar que a correção de `19b0f644` removeu lockfile drift e o novo erro de lint observado no commit anterior.
- **Aceite:** relatório com comando, duração, exit code, contagens e artefatos; nenhum resultado descrito como verde se o processo retornou erro.
- **Rollback/registro:** remover apenas artefatos ignorados criados por esta medição, sem `git clean` e sem apagar arquivos desconhecidos.

### 009 — Capturar baseline de UX, bundle e rede

- **Prioridade / risco / dependências:** P1; depende de 008 e build válido.
- **Executar:** medir bytes raw/gzip/brotli por entrada e chunk, preloads do `index.html`, CSS inicial, total sem `.map`, source maps separados, Lighthouse mobile/desktop e waterfall dos fluxos login, inbox e dashboard.
- **Verificar:** comparar com `performance-budget.json` e com o snapshot histórico; marcar exatamente quais budgets falham.
- **Aceite:** artefato reproduzível com ambiente, URL/commit, cache frio/quente e três execuções quando houver variância.
- **Rollback/registro:** não publicar o build; dados Lighthouse sem tokens ou conteúdo do cliente.

### 010 — Reconciliar migrations do repositório e do banco em modo leitura

- **Prioridade / risco / dependências:** P0; depende de 005.
- **Executar:** contar SQLs, extrair prefixos/nomes/hashes locais, consultar o ledger remoto e comparar conjuntos. Investigar a diferença entre 312 arquivos observados e 299 migrations relatadas, incluindo stubs e registros sem arquivo.
- **Verificar:** duplicatas com `uniq -d`, versões somente-local, somente-remoto, colisões de nome e hash; executar os scripts de drift existentes sem imprimir SQL sensível do ledger.
- **Aceite:** uma das conclusões deve estar provada: `PARITY`, `EXPECTED_DIFFERENCE` documentada ou `DRIFT_BLOCKING`; nenhuma migration aplicada.
- **Rollback/registro:** read-only. Drift bloqueia toda etapa Classe D de banco.

### Gate da onda 1

Só avançar se 001–010 tiverem evidência, a base Git estiver correta, a identidade Supabase for `MATCH`, nenhum segredo estiver sendo persistido e qualquer drift de migration estiver classificado.

---

# Onda 2 — Supply chain e CI fail-closed (011–020)

**Objetivo da onda:** impedir que vulnerabilidades, segredos, regressões de bundle ou instalações irreproduzíveis sejam aceitos silenciosamente.

### 011 — Transformar o audit de dependências em backlog verificável

- **Prioridade / risco / dependências:** P0; depende de 008.
- **Executar:** exportar o resultado atual do `bun audit` em formato tratável, agrupar por pacote raiz, caminho transitivo, severidade, exploração, impacto no runtime e existência de correção.
- **Verificar:** reproduzir cada crítica/alta contra o lockfile da `origin/main`; remover achados que desapareceram após `19b0f644`.
- **Aceite:** toda crítica/alta tem decisão `upgrade`, `replace`, `remove` ou exceção com owner e data curta; crítica sem mitigação bloqueia release.
- **Rollback/registro:** nenhum upgrade ainda; relatório não deve incorporar tokens de registries privados.

### 012 — Corrigir vulnerabilidades diretas em lotes pequenos

- **Prioridade / risco / dependências:** P0; depende de 011.
- **Executar:** atualizar primeiro dependências diretas críticas/altas, uma família por commit. Ler changelog/migration guide, ajustar código e lockfile usando Bun; não usar `--force` cegamente.
- **Verificar:** testes focados, suite completa, contratos e build a cada lote; comparar bundle e comportamento.
- **Aceite:** nenhuma vulnerabilidade crítica corrigível; altas corrigíveis removidas sem regressão; exceções remanescentes documentadas.
- **Rollback/registro:** reverter apenas o lote causal pelo commit; nunca editar manualmente o lockfile.

### 013 — Isolar ou substituir a cadeia de planilhas vulnerável

- **Prioridade / risco / dependências:** P0/P1; depende de 011.
- **Executar:** localizar todos os imports e fluxos de `xlsx`/SheetJS, verificar se processam arquivos não confiáveis e avaliar versão corrigida, alternativa mantida ou processamento server-side isolado com limites.
- **Verificar:** fixtures malformadas, limite de tamanho/linhas/células, timeout e ausência do pacote no chunk inicial.
- **Aceite:** risco conhecido eliminado ou isolado; import somente sob demanda; validação de arquivo e erros seguros testados.
- **Rollback/registro:** preservar formato de exportação/importação existente com testes dourados.

### 014 — Fixar a toolchain de forma explícita

- **Prioridade / risco / dependências:** P1; depende de 003.
- **Executar:** declarar `packageManager` compatível com Bun 1.4.0 e `engines`/documentação para Node 24, alinhando local, CI e onboarding. Avaliar `.tool-versions` ou arquivo equivalente já adotado, sem criar fontes concorrentes.
- **Verificar:** instalação congelada em checkout limpo e CI; garantir que mudança de metadados não reescreve o lockfile de modo inesperado.
- **Aceite:** um desenvolvedor novo reproduz as versões sem adivinhação.
- **Rollback/registro:** remover apenas o mecanismo novo se conflitar com a plataforma.

### 015 — Habilitar coverage de fato

- **Prioridade / risco / dependências:** P1; depende de 008.
- **Executar:** adicionar `@vitest/coverage-v8` em versão compatível, configurar reporters `text`, `json-summary` e `html`, exclusões justificadas e diretório ignorado.
- **Verificar:** `bun run test:coverage` retorna zero e produz summary; a CI faz upload de artefato que realmente existe.
- **Aceite:** coverage reproduzível sem esconder arquivos críticos; ainda não impor meta arbitrária.
- **Rollback/registro:** dependência e configuração no mesmo commit.

### 016 — Criar ratchet bloqueante para vulnerabilidades

- **Prioridade / risco / dependências:** P0; depende de 011–012.
- **Executar:** substituir `continue-on-error: true` por script que compara achados estruturados com baseline versionado, falha para nova crítica/alta e para exceção expirada.
- **Verificar:** testes unitários do ratchet cobrindo novo achado, remoção, alteração de severidade, baseline malformado e expiração.
- **Aceite:** CI vermelha para piora; baseline só muda em diff revisável com motivo, owner e prazo.
- **Rollback/registro:** manter o comando audit visível; não mascarar falha de rede como “sem vulnerabilidades”.

### 017 — Substituir o grep de secrets por scanner fail-closed

- **Prioridade / risco / dependências:** P0; depende de 007.
- **Executar:** integrar Gitleaks ou ferramenta equivalente, com versão/action presa a SHA, configuração mínima de allowlist para fixtures sintéticas e varredura de commits do PR.
- **Verificar:** teste controlado em branch temporária ou fixture prova que padrão secreto faz o job falhar; falso positivo permitido deve ser específico.
- **Aceite:** job não usa `|| echo`; achado real bloqueia CI e não é impresso integralmente.
- **Rollback/registro:** documentar atualização da versão do scanner e resposta a incidente.

### 018 — Tornar budgets de bundle executáveis

- **Prioridade / risco / dependências:** P1; depende de 009.
- **Executar:** criar script determinístico que lê `dist/index.html` e assets, separa entry, preloads, CSS, maior chunk, total sem maps e maps; comparar com `performance-budget.json`.
- **Verificar:** testes do parser com fixtures; alterar temporariamente um limite deve causar falha previsível.
- **Aceite:** CI bloqueia regressão acima do budget aprovado ou usa ratchet explícito enquanto o legado é reduzido; bytes e semântica raw/gzip claramente distinguidos.
- **Rollback/registro:** não redefinir budgets para o valor atual apenas para obter verde.

### 019 — Otimizar a CI sem reduzir os gates

- **Prioridade / risco / dependências:** P1; depende de 014–018.
- **Executar:** revisar cache do Bun, duplicação de installs, artefatos, timeouts, concorrência e dependências entre jobs. Manter actions pinadas por SHA e permissões mínimas.
- **Verificar:** comparar duração p50 de pelo menos três execuções e garantir que falha em lint/type/test impede build/deploy conforme desenho.
- **Aceite:** redução mensurável ou justificativa para não mudar; nenhum cache persiste secrets ou `dist` entre trust boundaries.
- **Rollback/registro:** reverter otimização se causar flakiness ou cache poisoning.

### 020 — Formalizar checks obrigatórios e proteção da main

- **Prioridade / risco / dependências:** P0 de processo; depende de 016–019.
- **Executar:** documentar conjunto de required checks, review obrigatório, bloqueio de force push/deletion, branches atualizadas e política de exceção emergencial. Preparar configuração; alterar GitHub é Classe C.
- **Verificar:** consultar proteção atual read-only e comparar com a política desejada; testar em PR não produtivo após aprovação.
- **Aceite:** nenhum merge normal contorna typecheck, testes, contratos, segurança e build; bypass tem auditoria e owner.
- **Rollback/registro:** exportar configuração anterior antes de qualquer mudança remota.

### Gate da onda 2

Instalação congelada deve passar. Novas vulnerabilidades altas/críticas, secrets e regressões de bundle precisam falhar de modo demonstrável. Toda exceção deve ter owner e expiração.

---

# Onda 3 — Pirâmide de testes e confiança de mudança (021–030)

**Objetivo da onda:** fazer com que falhas reais sejam detectadas perto da causa e que os fluxos de maior risco tenham proteção ponta a ponta.

### 021 — Definir a taxonomia e os contratos da suíte

- **Prioridade / risco / dependências:** P1; depende de 008 e 015.
- **Executar:** separar claramente unitários, componentes, integração Supabase simulada, contratos Edge/Schema, banco local e E2E. Definir nomenclatura, diretórios, ambiente, timeout, responsabilidades e quando mock é permitido.
- **Verificar:** listar todos os testes atuais por categoria e identificar duplicações/lacunas; alinhar `vitest.config.ts` e `vitest.contracts.config.ts` sem misturar runtime Deno e browser indevidamente.
- **Aceite:** documento curto e scripts distintos permitem executar cada camada isoladamente; nenhum teste crítico fica fora da CI por glob acidental.
- **Rollback/registro:** preservar paths reconhecidos pela CI durante migração gradual.

### 022 — Eliminar avisos React `act(...)` pela causa raiz

- **Prioridade / risco / dependências:** P1; depende de 021.
- **Executar:** capturar arquivos que emitem warnings, corrigir awaits de `userEvent`, timers, promises, providers e cleanup. Não suprimir `console.error` globalmente.
- **Verificar:** rodar testes afetados com console estrito que falha em warning inesperado; confirmar ausência de updates após unmount.
- **Aceite:** zero warning `act(...)` na suíte ou allowlist temporária por teste com issue/owner/prazo.
- **Rollback/registro:** mudanças de timing devem ter teste que reproduz a condição original.

### 023 — Padronizar mocks Supabase e contratos de erro

- **Prioridade / risco / dependências:** P1; depende de 021–022.
- **Executar:** criar builders tipados para query chains, auth, realtime, storage, RPC e functions; permitir configurar `{ data, error, count }`; resetar estado entre testes.
- **Verificar:** casos de sucesso, erro PostgREST, sessão expirada, abort e unsubscribe; falhar ao chamar método não configurado em vez de devolver `undefined` silencioso.
- **Aceite:** desaparecem erros de mock incompleto observados no baseline; testes não dependem de ordem global.
- **Rollback/registro:** migrar por domínio para evitar reescrita massiva.

### 024 — Medir coverage por risco, não apenas média global

- **Prioridade / risco / dependências:** P1; depende de 015 e 021.
- **Executar:** gerar mapa por arquivos críticos: autenticação/RBAC, webhook, validação, mensagens, pagamentos se houver, cache e funções de dados. Distinguir linhas, branches, funções e statements.
- **Verificar:** cruzar arquivos sem cobertura com criticidade e frequência de mudança; confirmar que arquivos gerados não inflam a média.
- **Aceite:** baseline versionado e backlog priorizado; relatório explica quais fluxos continuam sem prova.
- **Rollback/registro:** coverage baixa não autoriza excluir código relevante.

### 025 — Implantar coverage ratchet incremental

- **Prioridade / risco / dependências:** P1; depende de 024.
- **Executar:** impedir queda global e queda nos arquivos tocados, começando com tolerância pequena e metas maiores para módulos críticos novos.
- **Verificar:** teste automatizado do comparador com aumento, queda, arquivo novo e renomeado; evitar flakiness por arredondamento.
- **Aceite:** PR que reduz cobertura sem exceção explícita falha; não há meta “80%” sem relação com risco.
- **Rollback/registro:** baseline só muda com relatório comparativo.

### 026 — Cobrir autenticação, sessão, RBAC e troca de usuário

- **Prioridade / risco / dependências:** P0; depende de 023–025.
- **Executar:** testar boot sem sessão, login, logout, refresh, MFA se aplicável, sessão expirada, troca de usuário, profile fetch falho, permissões stale e limpeza de caches/subscriptions.
- **Verificar:** testes negativos provam que usuário sem papel não vê nem executa ação; simular concorrência entre callbacks de auth.
- **Aceite:** nenhuma permissão ou dado do usuário anterior sobrevive à troca de sessão; erros não deixam refs/locks presos.
- **Rollback/registro:** qualquer mudança em auth exige revisão dedicada.

### 027 — Expandir testes de contrato das Edge Functions

- **Prioridade / risco / dependências:** P0/P1; depende de 021 e da correção em `19b0f644`.
- **Executar:** para cada schema exportado, cobrir payload válido, campo ausente, tipo incorreto, string vazia, limites e campos extras. Verificar status, `Content-Type`, envelope e correlação de erro.
- **Verificar:** `bun run test:contracts`; produzir matriz função → schema → casos; não usar `as any` para contornar contrato.
- **Aceite:** toda função pública/externa possui schema e ao menos um caso de rejeição 4xx consistente.
- **Rollback/registro:** mudança de contrato incompatível exige etapa 094.

### 028 — Criar testes locais de migrations, RLS e grants

- **Prioridade / risco / dependências:** P0; depende de 010; não exige banco de produção.
- **Executar:** subir Supabase/Postgres efêmero compatível, aplicar migrations do zero, executar smoke de schema, políticas, grants e funções. Usar identidades `anon`, `authenticated`, service role e dois tenants.
- **Verificar:** aplicar do zero e, quando viável, a partir de snapshot suportado; testar que tenant A não lê/escreve B.
- **Aceite:** migrations novas falham na CI se não aplicarem ou ampliarem acesso indevidamente.
- **Rollback/registro:** containers e dados de teste descartáveis; nunca apontar a suíte para produção.

### 029 — Implantar Playwright nos fluxos críticos

- **Prioridade / risco / dependências:** P1; depende de 021, 026 e ambiente de teste isolado.
- **Executar:** adicionar Playwright pinado, page objects mínimos e casos login, navegação, abrir conversa, enviar mensagem simulada, logout e recuperação de erro. Preferir acessibilidade/role selectors.
- **Verificar:** Chromium obrigatório; Firefox/WebKit conforme matriz de suporte. Capturar trace/screenshot apenas em falha, com sanitização.
- **Aceite:** suíte roda local e CI sem credencial de produção, com dados determinísticos e retry apenas para diagnóstico.
- **Rollback/registro:** flake não pode ser “resolvido” aumentando retries indefinidamente.

### 030 — Automatizar smoke de acessibilidade

- **Prioridade / risco / dependências:** P1; depende de 029.
- **Executar:** integrar `@axe-core/playwright` ou equivalente nas páginas críticas, além de testes de teclado, foco visível, dialogs e live regions.
- **Verificar:** fixture de violação controlada prova que a CI falha; revisar falsos positivos individualmente.
- **Aceite:** zero violação axe crítica/séria nos fluxos cobertos e navegação essencial completa sem mouse.
- **Rollback/registro:** axe complementa, mas não substitui auditoria manual da etapa 049.

### Gate da onda 3

Os testes devem encerrar sem warnings inesperados, coverage deve ser mensurável e ratcheted, e ao menos autenticação + um fluxo de atendimento devem estar cobertos de ponta a ponta em ambiente isolado.

---

# Onda 4 — TypeScript, lint e arquitetura sustentável (031–040)

**Objetivo da onda:** reduzir dívida sem “big bang”, criar fronteiras claras e fazer o compilador impedir classes inteiras de defeitos.

### 031 — Produzir mapa do débito TypeScript estrito

- **Prioridade / risco / dependências:** P1; depende de 008.
- **Executar:** executar `tsc` com `strict: true` sem alterar a configuração oficial, agrupar os ~146 erros históricos por código, pasta e causa: nullability, tipos Supabase, callbacks, implicit any ou narrowing.
- **Verificar:** comparar contagem com o snapshot; listar top 20 arquivos e módulos críticos.
- **Aceite:** backlog quantificado e ordenado por risco; nenhum erro “corrigido” com cast amplo ou `@ts-ignore` sem justificativa.
- **Rollback/registro:** somente análise nesta etapa.

### 032 — Criar ilhas estritas e ratchet de TypeScript

- **Prioridade / risco / dependências:** P1; depende de 031.
- **Executar:** adotar configuração estrita para módulos novos/corrigidos ou script que impede crescimento da contagem por código/arquivo. Começar por bibliotecas puras, schemas e auth.
- **Verificar:** arquivo novo com implicit any deve falhar; legado intocado continua compilando até ser migrado.
- **Aceite:** dívida nunca aumenta e há caminho incremental documentado para `strict: true` global.
- **Rollback/registro:** evitar dois sistemas de aliases/includes divergentes.

### 033 — Sincronizar e confiar nos tipos gerados do Supabase

- **Prioridade / risco / dependências:** P0/P1; depende de 010 e 032.
- **Executar:** auditar o workflow de geração, project identity guards e diffs de tipos; corrigir nullability e relações na origem quando schema estiver errado, não no cast consumidor.
- **Verificar:** geração repetida sem mudanças produz diff vazio; comparar tipos gerados com catálogo/migrations.
- **Aceite:** nenhum tipo manual concorrente para tabela/RPC já gerada; CI sinaliza drift sem escrever direto na main.
- **Rollback/registro:** regeneração é arquivo gerado; revisar sem “embelezar” manualmente.

### 034 — Remover `any` de fronteiras P0

- **Prioridade / risco / dependências:** P0/P1; depende de 031–033.
- **Executar:** priorizar auth, RBAC, payloads externos, Supabase responses, Evolution events e parsing de arquivos. Substituir por `unknown` + validação/narrowing ou tipos gerados.
- **Verificar:** contar ocorrências antes/depois e adicionar regra/ratchet; testes com payload adversarial.
- **Aceite:** zero `any` injustificado nas fronteiras P0 tocadas; nenhuma redução meramente cosmética por cast duplo.
- **Rollback/registro:** documentar exceções de bibliotecas sem tipos.

### 035 — Endurecer nullability e acesso a coleções

- **Prioridade / risco / dependências:** P1; depende de 032–034.
- **Executar:** migrar módulos em lotes para `strictNullChecks`, `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` quando compatível. Tratar estados loading/empty/error explicitamente.
- **Verificar:** testes de lista vazia, índice ausente, relacionamento nulo e resposta parcial.
- **Aceite:** flags ativas ao menos nas ilhas migradas, sem non-null assertions não comprovadas.
- **Rollback/registro:** uma flag por lote para isolar regressões.

### 036 — Classificar a dívida ESLint e limpar configuração

- **Prioridade / risco / dependências:** P1; depende de 008.
- **Executar:** exportar lint estruturado, agrupar ~1.123 ocorrências por regra/pasta, separar defeitos prováveis de estilo e revisar disables. Excluir somente artefatos legítimos, não código difícil.
- **Verificar:** baseline contém fingerprint estável e testes do ratchet; regra desabilitada tem ADR ou justificativa local.
- **Aceite:** novas ocorrências falham e o top de regras tem ordem de remediação.
- **Rollback/registro:** não executar `lint:fix` no repo inteiro em um único diff.

### 037 — Reduzir lint por ondas sem churn

- **Prioridade / risco / dependências:** P1; depende de 036.
- **Executar:** corrigir primeiro hooks, promises, acessibilidade e unsafe types; depois imports/unused/style. Um módulo por commit, com testes focados.
- **Verificar:** ratchet diminui exatamente o esperado; diff não mistura formatação de arquivos não relacionados.
- **Aceite:** zero erro nas áreas P0 e tendência descendente registrada; warnings remanescentes têm plano.
- **Rollback/registro:** se autofix alterar semântica, reverter o arquivo e corrigir manualmente.

### 038 — Mapear ciclos, god modules e dependências cruzadas

- **Prioridade / risco / dependências:** P1; depende de 036.
- **Executar:** usar ferramenta estática compatível para detectar imports circulares, módulos de alta centralidade e violações de camada. Analisar `src/` por fatias, dado o tamanho do corpus.
- **Verificar:** confirmar cada ciclo manualmente e distinguir barrel legítimo de ciclo runtime; capturar peso/churn dos god modules.
- **Aceite:** topologia documentada e cinco maiores riscos convertidos em tarefas pequenas; nenhum refactor amplo sem teste de caracterização.
- **Rollback/registro:** ferramenta deve ser dev-only e não inflar build.

### 039 — Formalizar arquitetura modular orientada a features

- **Prioridade / risco / dependências:** P1; depende de 038.
- **Executar:** escrever ADR para fronteiras entre `pages`, `components`, `features`, `hooks`, `services/lib` e providers. Definir regra de dependência, ownership de server state e API pública por feature.
- **Verificar:** aplicar a regra a duas features-piloto e checar imports; preservar lazy routes.
- **Aceite:** novas features têm local previsível, exports nomeados e não importam internals de outras features.
- **Rollback/registro:** não mover centenas de arquivos apenas para satisfazer o desenho.

### 040 — Corrigir governança de ADRs e documentação conflitante

- **Prioridade / risco / dependências:** P1; depende de 039.
- **Executar:** resolver IDs `ADR-003` duplicados sem quebrar links, criar índice único, status (`proposed/accepted/superseded`) e template. Revisar a afirmação de grafo em `CLAUDE.md` se `graphify-out/graph.json` continuar ausente.
- **Verificar:** scanner de IDs/links e busca por referências antigas; documentos históricos devem ser marcados, não reescritos como se fossem atuais.
- **Aceite:** IDs únicos, links válidos, fonte de verdade clara e decisões propostas distinguíveis das implementadas.
- **Rollback/registro:** redirects/aliases documentais preservam links externos quando necessário.

### Gate da onda 4

TypeScript e ESLint não podem piorar; módulos P0 tocados devem estar em ilha estrita; arquitetura e ADRs devem refletir a implementação real, sem migração massiva não testada.

---

# Onda 5 — Performance, Web Vitals e WCAG 2.2 (041–050)

**Objetivo da onda:** reduzir custo de carregamento e renderização com dados, preservar usabilidade e provar acessibilidade nos principais fluxos.

### 041 — Gerar mapa de bundle por rota e dependência

- **Prioridade / risco / dependências:** P1; depende de 009 e 018.
- **Executar:** integrar visualizer em modo manual/CI-artifact e associar cada chunk a rota, feature e importador. Separar entry/preload de chunks realmente sob demanda.
- **Verificar:** abrir relatório e rastrear Mapbox, PDF, charts, UI, VoIP e Contacts até o import de origem.
- **Aceite:** top 20 módulos por peso possuem owner, rota, necessidade inicial e ação proposta.
- **Rollback/registro:** visualizer não roda no build produtivo normal nem publica source code.

### 042 — Reduzir JavaScript realmente inicial

- **Prioridade / risco / dependências:** P1; depende de 041.
- **Executar:** remover preloads indevidos, imports transitivos em barrels/providers e dependências de rotas não visitadas. Usar `lazy`/dynamic import no ponto de interação, com prefetch apenas por intenção.
- **Verificar:** comparar `index.html`, network waterfall, main-thread time e funcionalidade em cache frio/lento.
- **Aceite:** JS inicial converge ao budget aprovado ou ratchet reduz de forma material; nenhum flash/falha de navegação.
- **Rollback/registro:** medir cada split, pois chunks demais também degradam rede.

### 043 — Reduzir CSS inicial e duplicação de estilos

- **Prioridade / risco / dependências:** P1; depende de 009 e 041.
- **Executar:** auditar imports globais, tokens, Tailwind content/purge, estilos duplicados e CSS de features raras. Consolidar tokens sem mudar aparência inadvertidamente.
- **Verificar:** coverage CSS nas três rotas principais, regressão visual e contraste; medir raw/gzip.
- **Aceite:** CSS inicial atinge budget ou ratchet aprovado; nenhum componente perde estados focus/hover/disabled/high-contrast.
- **Rollback/registro:** screenshots de referência antes/depois para áreas tocadas.

### 044 — Carregar Mapbox, PDF, charts e planilhas apenas sob demanda

- **Prioridade / risco / dependências:** P1; depende de 013 e 041–042.
- **Executar:** mover bibliotecas pesadas para adaptadores lazy chamados por ação/rota; evitar re-export em barrels iniciais. Fornecer loading, cancelamento e erro recuperável.
- **Verificar:** chunks ausentes na navegação inicial e baixados somente ao abrir feature; testar falha de rede durante import.
- **Aceite:** nenhum dos quatro grupos integra entry/preload sem justificativa medida.
- **Rollback/registro:** manter testes de resultado PDF/XLSX/chart/mapa.

### 045 — Otimizar ícones, UI e renderização de listas

- **Prioridade / risco / dependências:** P1; depende de 041.
- **Executar:** auditar imports de ícones, providers globais, Radix/framer e listas de mensagens/contatos. Aplicar memoização apenas com profiling; virtualizar listas longas preservando foco e leitura.
- **Verificar:** React Profiler, commit duration, renders por interação, heap e navegação por teclado.
- **Aceite:** redução mensurável no fluxo mais lento; nenhuma memoização ritual ou quebra de acessibilidade.
- **Rollback/registro:** benchmark e trace anexados à etapa.

### 046 — Resolver estratégia de source maps e Sentry

- **Prioridade / risco / dependências:** P0/P1; depende de 007 e 009.
- **Executar:** escolher explicitamente: integrar Sentry/serviço com upload autenticado e remoção de `.map` do artefato público, ou desligar source maps de produção. Não manter maps de ~23 MB sem consumidor comprovado.
- **Verificar:** inspecionar deploy preview para garantir que `.map` não é público; se Sentry, provocar erro sintético e conferir stack simbolizada/release.
- **Aceite:** estratégia documentada, sem token no browser/CI log e sem source original exposto.
- **Rollback/registro:** alteração de Vercel/Sentry é Classe C/D; preparar antes e executar após aprovação.

### 047 — Substituir Web Vitals manual por telemetria correta

- **Prioridade / risco / dependências:** P1; depende de 071 para backend final, mas implementação local pode começar.
- **Executar:** usar biblioteca `web-vitals` mantida para LCP, INP, CLS e TTFB; remover FID dos Core Web Vitals. Enviar delta/final por navegação com consentimento, amostragem e dimensões não pessoais.
- **Verificar:** page hide/background, soft navigation quando suportada, duplicação e p75 por mobile/desktop; comparar com DevTools.
- **Aceite:** métricas chegam a um sink verificável ou ficam atrás de interface testada até a onda 8; console não é o observability backend.
- **Rollback/registro:** falha de telemetria nunca deve quebrar a aplicação.

### 048 — Auditar React Query, chamadas redundantes e cache

- **Prioridade / risco / dependências:** P1; depende de 045 e baseline de rede.
- **Executar:** mapear query keys, stale/gc time, invalidações, refetchOnMount/focus e queries duplicadas. Definir políticas por volatilidade, não apenas default global de cinco minutos.
- **Verificar:** número de requests por login/navegação/reconexão, dado stale, troca de tenant e offline/online.
- **Aceite:** elimina rajadas/N+1 sem exibir dado obsoleto de outro usuário; query keys incluem escopo correto.
- **Rollback/registro:** registrar before/after de rede e testes de invalidação.

### 049 — Executar auditoria manual WCAG 2.2 AA

- **Prioridade / risco / dependências:** P0/P1; depende de 030 e 043–045.
- **Executar:** revisar login, MFA, inbox, dialogs, formulários, dashboard e erros: teclado, ordem/foco, skip links, nomes/roles/values, contraste, zoom 200/400%, reflow, target size, drag alternatives, reduced motion e anúncios.
- **Verificar:** axe + NVDA/VoiceOver/Orca em amostra, high contrast e mobile; cada falha com critério WCAG e reprodução.
- **Aceite:** zero bloqueador crítico nos fluxos essenciais; P1 restantes têm prazo/owner e workaround.
- **Rollback/registro:** não remover semântica para satisfazer scanner.

### 050 — Instituir gate Lighthouse e matriz responsiva

- **Prioridade / risco / dependências:** P1; depende de 042–049.
- **Executar:** configurar Lighthouse CI ou runner equivalente com ambiente estável, budgets para performance/a11y/best-practices e páginas representativas; definir viewports e rede/CPU.
- **Verificar:** múltiplas execuções para reduzir variância, falha controlada e comparação com RUM; segurança/login simulados sem conta real.
- **Aceite:** regressão relevante bloqueia PR, mas thresholds são baseados em p75/baseline e não em um único número flakey.
- **Rollback/registro:** manter relatório como artifact e revisar thresholds trimestralmente.

### Gate da onda 5

Budgets precisam estar automatizados, bibliotecas pesadas não podem contaminar a entrada sem justificativa, a estratégia de source maps deve estar segura e fluxos críticos devem ter evidência WCAG 2.2 AA.

---

# Onda 6 — APIs, autenticação e segurança de aplicação (051–060)

**Objetivo da onda:** definir contratos consistentes e proteger todas as entradas externas segundo risco, especialmente as funções sem verificação JWT da plataforma.

### 051 — Inventariar APIs, consumidores e trust boundaries

- **Prioridade / risco / dependências:** P0; depende de 027 e 040.
- **Executar:** catalogar Edge Functions, RPCs, webhooks, chamadas Evolution GO, APIs externas e endpoints públicos. Para cada um: caller, auth, payload/schema, dados, idempotência, timeout, retries e owner.
- **Verificar:** cruzar 61 `index.ts`, `supabase/config.toml`, `supabase.functions.invoke`, cron e documentação; localizar funções órfãs.
- **Aceite:** 100% das entradas têm classificação `internal-user`, `server-to-server`, `webhook`, `cron` ou `public`; lacuna de auth vira P0.
- **Rollback/registro:** inventário não deve conter keys ou payloads reais.

### 052 — Auditar toda exceção `verify_jwt = false`

- **Prioridade / risco / dependências:** P0; depende de 051.
- **Executar:** revisar `evolution-webhook`, `whatsapp-webhook`, `gmail-webhook`, `gmail-cron-sync`, `elevenlabs-webhook` e `public-api`. Identificar autenticação alternativa antes do parse/efeito: assinatura, token opaco, mTLS/rede, cron secret ou API key com escopo.
- **Verificar:** testes negativos sem header, assinatura errada, timestamp expirado, body alterado e credencial válida. Confirmar que logs não revelam material criptográfico.
- **Aceite:** cada exceção tem justificativa versionada e teste; endpoint sem alternativa forte é bloqueado até correção.
- **Rollback/registro:** não ligar `verify_jwt` cegamente se o provedor não envia JWT; isso causaria indisponibilidade.

### 053 — Endurecer o webhook Evolution contra spoofing e replay

- **Prioridade / risco / dependências:** P0; depende de 052 e conhecimento do flavor GO.
- **Executar:** validar método/content type/tamanho, autenticar conforme capacidade real do Evolution GO, usar comparação constant-time, checar timestamp/nonce quando disponível e deduplicar event/message id com escopo de instância.
- **Verificar:** replay concorrente, assinatura/body adulterado, evento desconhecido, payload gigante e ordem fora de sequência; confirmar resposta rápida 2xx somente após persistência/aceitação segura.
- **Aceite:** uma entrega legítima produz no máximo um efeito; spoof/replay não altera estado; compatibilidade GO preservada.
- **Rollback/registro:** canary e monitor de rejeições antes de endurecer produção; deploy é Classe D.

### 054 — Endurecer Gmail, ElevenLabs, cron e public API

- **Prioridade / risco / dependências:** P0; depende de 052.
- **Executar:** aplicar verificação específica de cada provedor; no cron usar segredo rotacionável e timing-safe; na public API usar chave hash/escopo/tenant, expiração e rate limit. Separar 401 de 403 sem oracle de usuário.
- **Verificar:** casos de autenticação, expiração, revogação, tenant incorreto e duplicate delivery; confirmar documentação do provedor.
- **Aceite:** nenhuma rota pública confia em campo de tenant/user do body sem vinculá-lo à credencial.
- **Rollback/registro:** oferecer janela de rotação com duas chaves apenas se documentada e curta.

### 055 — Implementar rate limiting distribuído

- **Prioridade / risco / dependências:** P0/P1; depende de 051–054.
- **Executar:** substituir `Map` por isolate como controle primário por armazenamento atômico compartilhado apropriado (Redis/Upstash ou Postgres RPC cuidadosamente limitada). Chavear por credencial/tenant/rota e IP apenas como sinal complementar.
- **Verificar:** concorrência entre isolates, cold start, janela, burst, expiração, indisponibilidade do limiter e bypass por headers falsos.
- **Aceite:** limite permanece efetivo entre instâncias; comportamento fail-open/fail-closed é explícito por endpoint e gera métrica.
- **Rollback/registro:** rollout em shadow mode antes de bloquear tráfego legítimo.

### 056 — Validar payloads e normalizar erros em todas as fronteiras

- **Prioridade / risco / dependências:** P0/P1; depende de 027 e 051.
- **Executar:** centralizar schemas Zod compatíveis com runtime Deno/bundle, limites de strings/arrays/URLs/enums e rejeição de campos perigosos. Adotar envelope inspirado em Problem Details sem expor stack/SQL.
- **Verificar:** fuzz básico, payload nulo, tipos errados, unicode, números extremos, nesting e corpo inválido; contract tests para 400/401/403/409/422/429/500.
- **Aceite:** toda entrada externa valida antes de I/O; erros têm código estável e correlation id.
- **Rollback/registro:** mudanças incompatíveis exigem versionamento/compatibilidade da etapa 094.

### 057 — Restringir CORS e métodos por endpoint

- **Prioridade / risco / dependências:** P0/P1; depende de 051–056.
- **Executar:** remover wildcard onde há credencial/dado privado, definir allowlist por ambiente, responder preflight mínimo e limitar métodos/headers. Webhooks server-to-server normalmente não precisam de CORS permissivo.
- **Verificar:** origin permitido, malicioso, ausente, `null`, preflight e credenciais; testar Vercel preview de forma controlada.
- **Aceite:** browser só chama a origem autorizada; endpoint público documenta por que wildcard é seguro, se mantido.
- **Rollback/registro:** monitorar rejeições e manter allowlist configurável sem rebuild quando apropriado.

### 058 — Fechar SSRF, redirects e processamento de URLs

- **Prioridade / risco / dependências:** P0; depende de 051 e 056.
- **Executar:** localizar fetches dirigidos por usuário/webhook, bloquear schemes não HTTP(S), credentials embutidas, localhost, link-local, metadata cloud e IPs privados após resolução DNS; limitar redirects, tempo e bytes.
- **Verificar:** IPv4/IPv6, decimal/hex, DNS rebinding dentro do possível, redirect para privado, URL encurtada e resposta gigante.
- **Aceite:** nenhum URL não confiável alcança rede interna/metadata; allowlists de provedores preferidas.
- **Rollback/registro:** preservar integrações legítimas com casos de teste explícitos.

### 059 — Reduzir privilégios e sanitizar logs

- **Prioridade / risco / dependências:** P0; depende de 007, 051 e 063–064 para fechamento.
- **Executar:** mapear usos de service role, tokens Evolution e banco externo. Manter secrets apenas server-side, escopo mínimo e redaction central de Authorization, cookies, telefone, email, tokens e payloads.
- **Verificar:** testes unitários de redaction em objetos aninhados/errors/URLs; buscar service role no bundle e logs de fixtures.
- **Aceite:** browser nunca recebe segredo elevado; log operacional conserva correlation id e tipo de evento sem conteúdo sensível.
- **Rollback/registro:** mudanças de grants/secrets são Classe D; código preparatório pode ser local.

### 060 — Aplicar headers de segurança e CSP por etapas

- **Prioridade / risco / dependências:** P1; depende de 041 e 057.
- **Executar:** configurar no Vercel `Content-Security-Policy` inicialmente report-only, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e proteção de framing. Inventariar scripts/styles/connect/media/frame/font.
- **Verificar:** relatórios CSP em login, chat, mapas, VoIP e integrações; remover `unsafe-*` gradualmente com nonces/hashes quando aplicável.
- **Aceite:** headers presentes em preview, CSP enforcement sem quebrar fluxos e nenhuma origem ampla sem justificativa.
- **Rollback/registro:** manter rollback do header e observabilidade de violações; deploy é Classe C/D.

### Gate da onda 6

Toda entrada deve ter owner, schema, autenticação e limites. As seis exceções JWT devem estar justificadas/testadas, e webhooks críticos precisam resistir a spoofing, replay e duplicação.

---

# Onda 7 — PostgreSQL, RLS, migrations e caching (061–070)

**Objetivo da onda:** provar paridade e isolamento, otimizar a causa real das queries e garantir que dados possam ser recuperados.

### 061 — Resolver qualquer drift de migrations

- **Prioridade / risco / dependências:** P0; depende do resultado de 010 e aprovação para Classe D se houver escrita.
- **Executar:** para `DRIFT_BLOCKING`, classificar: arquivo faltante, registro faltante, prefixo colidido, SQL divergente ou migration não canônica. Criar plano aditivo; nunca renumerar/apagar histórico aplicado.
- **Verificar:** conjuntos e hashes convergem, `max(version)` imediatamente antes de registrar e prefixos únicos. Considerar as limitações documentadas de `supabase_apply_migration`, mas revalidá-las.
- **Aceite:** `PARITY` comprovada por scripts; arquivo, ledger, catálogo e baseline guard coerentes.
- **Rollback/registro:** SQL é Classe D; backup/rollback e aprovação por migration, sem comandos multi-statement opacos.

### 062 — Automatizar paridade de schema, catálogo e tipos

- **Prioridade / risco / dependências:** P0/P1; depende de 033 e 061.
- **Executar:** fazer CI comparar migrations, ledger sanitizado/manifesto, `supabase/schema-catalog.json`, tipos gerados e violações conhecidas. Reusar guards existentes em vez de duplicá-los.
- **Verificar:** fixture de tabela/RPC adicionada sem catálogo/tipo deve falhar; saída não imprime SQL sensível.
- **Aceite:** todo DDL exige fechamento triplo/quádruplo automaticamente e identidade do project ref é validada.
- **Rollback/registro:** jobs read-only em PR; escrita automática em branch separada, nunca na main.

### 063 — Construir matriz RLS multi-tenant com testes negativos

- **Prioridade / risco / dependências:** P0; depende de 028 e 061.
- **Executar:** inventariar tabelas expostas, RLS enabled/forced, policies por operação, papel e tenant. Testar anon, usuário A/B, supervisor/admin e service role; incluir INSERT/UPDATE com `WITH CHECK`.
- **Verificar:** tabelas com RLS sem SELECT, policy permissiva inesperada, owner bypass, views/functions que contornam políticas e realtime.
- **Aceite:** tenant A não lê, altera, assina nem infere B; toda exceção administrativa tem teste e auditoria.
- **Rollback/registro:** policies novas começam em ambiente local/staging; produção Classe D com rollback SQL.

### 064 — Auditar `SECURITY DEFINER`, grants e `search_path`

- **Prioridade / risco / dependências:** P0; depende de 063.
- **Executar:** listar funções definer, owner, `proconfig`, grants PUBLIC/anon/authenticated e corpo. Fixar `search_path`, qualificar objetos, revogar execução ampla e validar auth/tenant dentro da função.
- **Verificar:** chamadas diretas por anon/usuário comum, spoof de objetos via search path e funções que usam parâmetros de user id sem vínculo a `auth.uid()`.
- **Aceite:** nenhuma função elevada executável amplamente sem necessidade e guard interno; testes negativos passam.
- **Rollback/registro:** capturar DDL/grants anteriores; alteração live é Classe D.

### 065 — Medir queries reais com `pg_stat_statements`

- **Prioridade / risco / dependências:** P1; depende de 005 e aprovação read-only de metadados.
- **Executar:** coletar top queries por total time, calls, mean/p95 aproximado, rows e I/O em janela representativa, com query text normalizado/sanitizado. Cruzar com tráfego Edge e telas.
- **Verificar:** não interpretar seq scan em tabela minúscula como problema automático; usar `EXPLAIN (ANALYZE, BUFFERS, WAL)` apenas em ambiente seguro ou query read-only controlada.
- **Aceite:** top 10 tem causa, owner, frequência e plano; nenhuma otimização baseada só em intuição.
- **Rollback/registro:** não executar `EXPLAIN ANALYZE` em escrita ou consulta explosiva em produção.

### 066 — Corrigir a tempestade em `whatsapp_connections`

- **Prioridade / risco / dependências:** P0/P1; depende de 048 e 065; orientado por `ADR-006-whatsapp-connections-cache.md`.
- **Executar:** rastrear callers que geram ~40 mil consultas/hora e milhões de scans. Deduplicar requests, cachear leitura estável com TTL/invalidation por tenant/instância e evitar polling redundante; não criar índice inútil para duas linhas.
- **Verificar:** medir calls antes/depois, staleness após reconexão, cold starts e concorrência. Cache por isolate pode complementar, mas não ser a única defesa para tempestade global.
- **Aceite:** redução material de calls/tempo sem conexão stale; ADR atualizado de proposed para accepted somente após evidência.
- **Rollback/registro:** feature flag/TTL configurável e fallback ao banco.

### 067 — Otimizar queries e índices com planos comprovados

- **Prioridade / risco / dependências:** P1; depende de 065.
- **Executar:** para cada top query, reduzir frequência/rows primeiro; depois revisar predicados, joins, paginação keyset, N+1 e índices compostos/parciais/cobertura quando o planner provar ganho.
- **Verificar:** plano antes/depois, buffers, tempo, tamanho do índice, write amplification e seletividade com dados representativos.
- **Aceite:** ganho mensurável e regressão de escrita aceitável; índices duplicados/inúteis não são adicionados.
- **Rollback/registro:** migration aditiva separada e DROP reversível planejado; live é Classe D.

### 068 — Auditar Realtime, replica identity e lifecycle de subscriptions

- **Prioridade / risco / dependências:** P1; depende de 063 e 067.
- **Executar:** listar publication tables, necessidade real, `REPLICA IDENTITY`, payload e filtros. No frontend, garantir unsubscribe em unmount/logout/troca de tenant e reconexão sem duplicar handlers.
- **Verificar:** sessão longa, rede oscilante, múltiplas abas, troca de usuário e evento duplicado; medir WAL/egress.
- **Aceite:** apenas tabelas necessárias publicadas, isolamento RLS mantido e zero subscription órfã nos fluxos testados.
- **Rollback/registro:** mudanças de publication live são Classe D e exigem smoke em tempo real.

### 069 — Implementar retenção, minimização e limpeza LGPD

- **Prioridade / risco / dependências:** P0/P1; depende de inventário de dados e docs LGPD.
- **Executar:** mapear mensagens, mídia, transcrições, logs, webhook payloads, failures e backups por finalidade/prazo/legal hold. Criar jobs idempotentes, batchados e observáveis; preferir apagar/anonymizar o mínimo necessário.
- **Verificar:** dry-run/count, fixtures antigas/recentes, tenant, legal hold, cascades e impacto de restore; auditar jobs existentes.
- **Aceite:** política e implementação convergem, jobs têm métricas/alertas e deleção é comprovável sem apagar dados ainda válidos.
- **Rollback/registro:** deleção live exige aprovação Classe D e backup/restauração testados.

### 070 — Provar backup, restore e RPO/RTO do banco

- **Prioridade / risco / dependências:** P0; depende de 061–069.
- **Executar:** documentar backups Supabase/PITR disponíveis, RPO/RTO contratados e itens fora do backup lógico (secrets/GUCs/storage). Restaurar cópia sanitizada em ambiente isolado e executar smoke/paridade.
- **Verificar:** migrations/ledger, RLS, funções, cron, storage metadata e secrets reconfiguráveis; cronometrar o exercício.
- **Aceite:** restore concluído dentro do objetivo ou gap com plano/owner; evidência sem dados pessoais expostos.
- **Rollback/registro:** nunca restaurar sobre produção; exercício externo requer aprovação e ambiente identificado.

### Gate da onda 7

Paridade deve estar comprovada, testes RLS/definer devem ser negativos e positivos, otimizações devem usar dados reais e um restore isolado deve demonstrar recuperabilidade.

---

# Onda 8 — Observabilidade, resiliência e resposta a incidentes (071–080)

**Objetivo da onda:** detectar, diagnosticar e recuperar falhas sem depender de console, memória individual ou inspeção manual tardia.

### 071 — Definir arquitetura de observabilidade e taxonomia

- **Prioridade / risco / dependências:** P1; depende de 040, 046 e 047.
- **Executar:** escrever ADR cobrindo frontend, Edge Functions, Supabase/Postgres e Evolution VPS; definir eventos, logs, métricas, traces, RUM, retenção, sampling, custo e dados proibidos. Escolher Sentry/OpenTelemetry/backend compatível por camada.
- **Verificar:** PoC liga uma interação do browser a uma Edge Function e operação externa via correlation id sem PII.
- **Aceite:** solução, custo e ownership aprovados; browser instrumentation experimental não é tratada como garantia sem fallback.
- **Rollback/registro:** instrumentação deve poder ser desligada por configuração.

### 072 — Padronizar correlation e causation IDs

- **Prioridade / risco / dependências:** P1; depende de 071.
- **Executar:** gerar/propagar IDs em requests, webhooks, jobs, chamadas Evolution e filas; rejeitar valores gigantes/inválidos e nunca usar telefone/email como id.
- **Verificar:** teste ponta a ponta e retry preservando causation mas distinguindo attempt; logs e respostas de erro incluem id seguro.
- **Aceite:** um incidente consegue ser traçado entre camadas sem buscar payload pessoal.
- **Rollback/registro:** compatibilidade com callers que ainda não enviam o header.

### 073 — Instrumentar erros e releases do frontend

- **Prioridade / risco / dependências:** P1; depende de 046, 071–072.
- **Executar:** conectar ErrorBoundary, unhandled errors/rejections e versão Git/release; sanitizar breadcrumbs, URLs e user context. Upload de maps no pipeline e remoção do deploy se solução escolhida.
- **Verificar:** erro sintético em preview, stack simbolizada, release correta, deduplicação e redaction.
- **Aceite:** erro crítico gera evento acionável com commit/rota/correlation id, sem conteúdo de mensagem/token.
- **Rollback/registro:** sampling e kill switch; integração externa Classe C/D.

### 074 — Instrumentar Edge Functions e dependências externas

- **Prioridade / risco / dependências:** P1; depende de 071–072.
- **Executar:** logs JSON estruturados com função, versão, tenant pseudonimizado, duração, status, attempt e dependency; métricas RED (rate/errors/duration) e spans para Supabase/Evolution/Gmail sem payload.
- **Verificar:** sucesso, 4xx, 5xx, timeout, abort e retry; garantir flush compatível com lifecycle Edge.
- **Aceite:** dashboards distinguem erro do caller, aplicação e dependência; custo/amostragem sob controle.
- **Rollback/registro:** telemetria nunca bloqueia resposta de negócio.

### 075 — Monitorar Evolution GO e a VPS Hostinger

- **Prioridade / risco / dependências:** P0/P1; depende de 005 e 071.
- **Executar:** mapear health endpoint real, estado da instância `PRINCIPAL`, container restarts, CPU, memória, disco, Postgres interno, backup e latência API. Não confundir com banco Supabase.
- **Verificar:** coleta read-only e alerta sintético; validar host/projeto antes de qualquer agente/configuração.
- **Aceite:** dashboard e alertas para down, disconnect, restart loop, disco e backup stale; runbook aponta ação segura.
- **Rollback/registro:** instalação/restart na VPS é Classe D.

### 076 — Consolidar idempotência, DLQ e replay de webhooks

- **Prioridade / risco / dependências:** P0; depende de 053–054 e estruturas existentes de `webhook_failures`.
- **Executar:** definir chave idempotente por provedor/instância/evento, estados de processamento, attempts, backoff com jitter, limite e dead-letter. Criar replay autenticado, auditado e seletivo.
- **Verificar:** duplicata simultânea, crash depois do efeito/antes do ack, poison event, ordem fora de sequência e replay manual duplo.
- **Aceite:** at-least-once não vira efeito duplicado; nenhuma DLQ cresce silenciosamente; replay não ignora auth/schema atuais.
- **Rollback/registro:** nunca replay em produção sem filtro, dry-run, contagem e aprovação Classe D.

### 077 — Definir SLOs, SLIs e alertas acionáveis

- **Prioridade / risco / dependências:** P1; depende de 047 e 073–076.
- **Executar:** definir disponibilidade/latência/erro para login, leitura/envio de mensagem, ingestão webhook e sync; adotar p75 Web Vitals por dispositivo. Criar burn-rate alerts e ownership.
- **Verificar:** dados realmente disponíveis, janelas curta/longa, teste de alerta e rota de notificação; evitar alertar por métrica sem ação.
- **Aceite:** cada alerta tem severidade, condição, runbook e destinatário; SLO não é 100% sem razão.
- **Rollback/registro:** thresholds começam observacionais antes de paging.

### 078 — Atualizar runbooks por sintoma e decisão

- **Prioridade / risco / dependências:** P1; depende de 075–077.
- **Executar:** atualizar `docs/INCIDENT-RUNBOOK.md`, deploy/troubleshooting/webhook docs com triagem: impacto, identidade, dashboards, queries read-only, mitigação, rollback, escalonamento e comunicação.
- **Verificar:** tabletop por pessoa não autora; todos os comandos têm alvo explícito e não imprimem secrets.
- **Aceite:** operador consegue diagnosticar login down, webhook backlog, Evolution disconnect e migration/deploy falho em menos de 15 minutos.
- **Rollback/registro:** documentação histórica recebe data/status.

### 079 — Executar game days controlados

- **Prioridade / risco / dependências:** P1; depende de 070, 075–078.
- **Executar:** em staging/ambiente isolado, simular Evolution timeout, Supabase indisponível, Edge 500, evento duplicado, token expirado, rate limiter down e rollback de frontend.
- **Verificar:** observar alertas, graceful degradation, retries, DLQ e recuperação; medir MTTD/MTTR.
- **Aceite:** nenhum cenário causa perda/duplicação silenciosa; gaps viram tarefas com owner/prazo.
- **Rollback/registro:** proibir injeção de falha em produção sem plano e autorização específicos.

### 080 — Instituir post-mortem sem culpa e métricas DORA

- **Prioridade / risco / dependências:** P1; depende de 077–079.
- **Executar:** criar template de timeline, impacto, detecção, fatores contribuintes, cinco porquês quando útil, ações verificáveis e aprendizado. Instrumentar change lead time, deployment frequency, failed deployment recovery time, change fail rate e deployment rework rate.
- **Verificar:** aplicar retrospectivamente a um incidente/deploy recente sem inventar dados; separar métricas de sistema de avaliação individual.
- **Aceite:** ações de post-mortem têm owner/prazo/critério; DORA vira tendência de time, não ranking de desenvolvedor.
- **Rollback/registro:** dados agregados e retenção apropriada.

### Gate da onda 8

Um erro sintético e um webhook de teste devem poder ser rastreados ponta a ponta; alertas e runbooks precisam ser exercitados; DLQ/replay deve ser idempotente e controlado.

---

# Onda 9 — Ambientes, deploy, custo, documentação e time (081–090)

**Objetivo da onda:** tornar releases repetíveis e reversíveis, reduzir risco operacional e evitar que conhecimento crítico fique apenas em handoffs antigos.

### 081 — Formalizar ambientes e identity guards

- **Prioridade / risco / dependências:** P0; depende de 005, 061 e 078.
- **Executar:** definir local/test/preview/staging/production para frontend, Supabase e Evolution; mapear quais realmente existem. Adicionar guards que comparam project ref/URL/branch antes de DB, geração de tipos e deploy.
- **Verificar:** apontar deliberadamente para ref sintético deve falhar antes de qualquer escrita; confirmar que bancos externos continuam read-only.
- **Aceite:** cada comando de mutação exige ambiente e identidade explícitos; nenhum fallback silencioso para produção.
- **Rollback/registro:** criação de ambiente externo é Classe C/D e depende de custo/aprovação.

### 082 — Criar preview seguro e dados determinísticos

- **Prioridade / risco / dependências:** P1; depende de 029, 063 e 081.
- **Executar:** conectar PR previews a backend isolado ou mocks de contrato, seeds sintéticos e contas de teste por papel/tenant. Desabilitar integrações reais ou usar sandbox.
- **Verificar:** preview não alcança produção, não envia WhatsApp/email real e expira recursos/dados; E2E roda nele.
- **Aceite:** QA revisa fluxos críticos sem credenciais/dados reais e sem efeito externo.
- **Rollback/registro:** teardown automatizado e budget de preview.

### 083 — Endurecer deploy e rollback Vercel

- **Prioridade / risco / dependências:** P0/P1; depende de 018, 020, 050, 060 e 082.
- **Executar:** documentar source commit → preview → checks → promoção, env scopes, headers, source maps, smoke e rollback instantâneo. Verificar associação exata ao project id informado.
- **Verificar:** ensaio em preview e rollback para deployment anterior sem alterar produção até aprovação; conferir SPA rewrites e assets.
- **Aceite:** release só promove commit verde, com release id observável e rollback testado dentro do RTO.
- **Rollback/registro:** promoção/rollback real é Classe D; guardar deployment id anterior, não tokens.

### 084 — Endurecer deploy de Edge Functions e migrations

- **Prioridade / risco / dependências:** P0; depende de 052–064, 076 e 081.
- **Executar:** revisar `deploy-functions.yml`, função única vs todas, project ref guard, secrets e ordem expand/contract. Separar migration de deploy quando rollback de código depender de schema compatível.
- **Verificar:** dry-run/preview, smoke autenticado e não autenticado, versão da função, logs/metrics e rollback para bundle anterior.
- **Aceite:** deploy não ocorre automaticamente por push acidental; função pode ser canarizada/validada e migrations são backward-compatible.
- **Rollback/registro:** dispatch/deploy/SQL são Classe D e precisam de aprovação independente.

### 085 — Governar Evolution GO como serviço crítico

- **Prioridade / risco / dependências:** P0/P1; depende de 075, 078 e 081.
- **Executar:** versionar documentação da imagem/configuração não secreta, volumes, portas, flavor, backups e upgrade. Registrar compatibilidade das rotas em `_shared/evolution-go-routes.ts` e plano de cutover legado.
- **Verificar:** inspecionar versão/health/backup read-only; restore em ambiente isolado e smoke de conexão quando possível.
- **Aceite:** upgrade tem changelog, backup verificável, janela, canary e rollback; nenhum `latest` não controlado.
- **Rollback/registro:** mudança de container/restart/cutover é Classe D e exige snapshot/backup.

### 086 — Instituir ciclo de vida de secrets

- **Prioridade / risco / dependências:** P0; depende de 006–007, 052–059 e 081.
- **Executar:** consolidar inventário por ambiente, owner, consumidor, criação/rotação/expiração/revogação e break-glass. Preferir OIDC/credenciais curtas quando suportado e separar GitHub, Vercel, Supabase Edge e Evolution.
- **Verificar:** detectar segredo órfão, duplicado, sem owner e nunca rotacionado; testar rotação em staging com sobreposição curta.
- **Aceite:** nenhum segredo permanente sem owner/prazo; credencial exposta da etapa 006 resolvida; runbook não contém valores.
- **Rollback/registro:** rotação/revogação real é Classe D; validar todos os consumidores antes de revogar antigo.

### 087 — Criar orçamento e observabilidade de custos

- **Prioridade / risco / dependências:** P1; depende de 065–070, 075 e 082.
- **Executar:** mapear Supabase compute/egress/storage/functions, Vercel bandwidth/build, Hostinger e observabilidade; definir budget mensal, forecasts e alertas. Associar drivers técnicos como polling, assets, logs e retenção.
- **Verificar:** comparar ao menos três períodos quando dados existirem; alertas testados e valores sensíveis não versionados.
- **Aceite:** top drivers têm owner e ação; otimização não reduz segurança, backup ou SLO sem decisão explícita.
- **Rollback/registro:** alterações de plano/recursos são Classe D.

### 088 — Reconciliar documentação técnica com o sistema atual

- **Prioridade / risco / dependências:** P1; depende de 040 e resultados anteriores.
- **Executar:** atualizar README/technical/deployment/migrations/features: React 19, Vite 8, quantidade dinâmica de Edge/migrations, PWA real, observabilidade, comandos e ambientes. Marcar snapshots históricos com data.
- **Verificar:** executar comandos copiados em checkout limpo; scanner de links e números conflitantes; não afirmar “100% completo” com KPIs pendentes.
- **Aceite:** onboarding e operação usam documentação atual, e contagens são geradas ou claramente datadas.
- **Rollback/registro:** preservar histórico em Git; não apagar auditorias úteis.

### 089 — Definir ownership, ADR/RFC e review baseado em risco

- **Prioridade / risco / dependências:** P1; depende de 039–040 e 088.
- **Executar:** criar mapa de owners para auth, DB/RLS, Edge, frontend, Evolution e infra; propor CODEOWNERS, template RFC e checklist de review por risco.
- **Verificar:** simular PR de migration/security/dependency e confirmar reviewers/checklists esperados; evitar owner único sem backup.
- **Aceite:** mudanças P0 exigem especialista de domínio; decisões irreversíveis têm RFC/ADR e alternativas.
- **Rollback/registro:** CODEOWNERS/proteção remota é Classe C.

### 090 — Tornar onboarding e ambiente local reproduzíveis

- **Prioridade / risco / dependências:** P1; depende de 014, 021, 028, 081–082 e 088.
- **Executar:** criar quickstart validado, `.env.example` apenas com nomes/placeholders, health check local e scripts de setup idempotentes. Documentar como rodar app, testes, Supabase local e E2E.
- **Verificar:** pessoa/ambiente limpo chega ao primeiro teste/build verde sem segredo de produção; tempo e dúvidas anotados.
- **Aceite:** setup repetível em uma sessão, sem passos secretos informais e sem modificar produção.
- **Rollback/registro:** scripts não podem sobrescrever `.env` existente nem instalar globalmente sem consentimento.

### Gate da onda 9

Ambientes e alvos devem ser inequívocos; previews não podem tocar produção; Vercel, Edge e Evolution devem ter deploy/rollback documentados; documentação e ownership devem refletir o estado real.

---

# Onda 10 — Decisões finais, release candidata e melhoria contínua (091–100)

**Objetivo da onda:** encerrar ambiguidades arquiteturais, provar o release completo e converter o plano em processo recorrente.

### 091 — Decidir e concluir a estratégia PWA

- **Prioridade / risco / dependências:** P1/P2; depende de 042–050 e 088.
- **Executar:** decidir entre remover `vite-plugin-pwa`/alegações de PWA ou reativar com escopo, update UX, offline boundaries e cache seguros. Não cachear respostas autenticadas/PII indiscriminadamente.
- **Verificar:** install/update, versão nova, cache invalidation, logout, offline, storage quota e fallback; Lighthouse PWA quando aplicável.
- **Aceite:** código, dependência e documentação contam a mesma história; service worker não serve dados de usuário anterior.
- **Rollback/registro:** rollout do service worker requer kill switch e plano para usuários com worker antigo.

### 092 — Fechar matriz de browsers, dispositivos e conectividade

- **Prioridade / risco / dependências:** P1; depende de 029–030, 049–050 e 091.
- **Executar:** definir versões suportadas por analytics/usuários e testar desktop/mobile, touch/keyboard, conexão lenta/offline, múltiplas abas, permissões de áudio/notificação e viewport reduzido.
- **Verificar:** Playwright/device farm proporcional, aparelhos reais para VoIP/WhatsApp quando necessário e teste de memória em sessão longa.
- **Aceite:** matriz publicada com limitações e fallback; fluxos essenciais funcionam nos browsers suportados.
- **Rollback/registro:** não elevar `build.target`/polyfills sem medir bundle.

### 093 — Ratificar modular monolith vs microsserviços

- **Prioridade / risco / dependências:** P1 de arquitetura; depende de 039, 051, 065 e 071.
- **Executar:** avaliar escala, deploy coupling, ownership, dados, falhas e carga. Presumir modular monolith + Edge Functions até existir pressão mensurada; identificar somente candidatos com boundary e SLO próprios.
- **Verificar:** comparar custo/complexidade operacional e transações; PoC apenas se uma limitação real não puder ser resolvida modularmente.
- **Aceite:** ADR explícito evita microserviço por moda; eventual extração tem contrato, dados, observabilidade e rollback.
- **Rollback/registro:** nenhuma migração arquitetural nesta etapa sem projeto aprovado.

### 094 — Definir versionamento e compatibilidade de contratos

- **Prioridade / risco / dependências:** P1; depende de 027, 051, 056 e 084.
- **Executar:** adotar política para schemas de webhook/API/RPC, mudanças aditivas, deprecação, idempotency keys e erros. Publicar OpenAPI/JSON Schema onde útil e validar consumers.
- **Verificar:** contract diff detecta breaking change; consumer antigo continua funcionando durante janela; eventos desconhecidos são tolerados com segurança.
- **Aceite:** nenhuma quebra externa chega a produção sem versão/janela/migração e telemetria de uso.
- **Rollback/registro:** manter implementação anterior até adoção comprovada.

### 095 — Executar exercício completo de disaster recovery

- **Prioridade / risco / dependências:** P0; depende de 070, 078, 083–086.
- **Executar:** simular perda do frontend, Edge release ruim, banco/restauração e Evolution indisponível em ambiente isolado. Recuperar config, secrets, schema, dados, DNS/deploy e comunicação na ordem documentada.
- **Verificar:** RPO/RTO medidos, checks de integridade, autenticação, webhook e mensagem sintética; gaps e dependências humanas.
- **Aceite:** recuperação ponta a ponta comprovada ou riscos aceitos formalmente com plano.
- **Rollback/registro:** jamais usar produção como laboratório; exercício externo Classe D.

### 096 — Rodar auditoria da release candidata

- **Prioridade / risco / dependências:** P0; depende de 011–095 aplicáveis.
- **Executar:** em commit imutável, executar instalação, CI completa, audit, secret scan, SAST/guards, migrations locais, RLS, unit/integration/contracts/E2E/a11y, build/budgets/Lighthouse e smoke preview.
- **Verificar:** anexar checksums/commit/ambiente e comparar com baselines; repetir falhas flakey até encontrar causa, não até “passar”.
- **Aceite:** todos os gates obrigatórios verdes; exceções listadas com owner/prazo/aprovação e sem P0 aberto.
- **Rollback/registro:** a auditoria não modifica produção.

### 097 — Fechar P0/P1 e consolidar o registro de dívida

- **Prioridade / risco / dependências:** P0; depende de 096.
- **Executar:** revisar 100 etapas, issues, audit, post-mortems e exceções. Para todo item aberto, definir severidade, impacto, evidência, owner, prazo e gatilho de escalonamento.
- **Verificar:** procurar marcadores TODO/HACK, disables, baselines e `continue-on-error`; confirmar que não escondem P0/P1.
- **Aceite:** zero P0; P1 somente com aceitação explícita e data próxima; dívida técnica mensurável, não lista esquecida.
- **Rollback/registro:** não baixar severidade para fechar a onda.

### 098 — Congelar o candidato e obter aprovação de release

- **Prioridade / risco / dependências:** P0; depende de 096–097.
- **Executar:** registrar commit SHA, changelog, migrations, flags, env changes, dashboards, smoke, rollback e responsáveis da janela. Proibir novos diffs sem reiniciar checks afetados.
- **Verificar:** revisão de segurança/DB/UX/ops proporcional, artefatos ligados ao mesmo SHA e dependências externas saudáveis.
- **Aceite:** go/no-go assinado; plano de rollback tem comandos/alvos e critérios objetivos.
- **Rollback/registro:** qualquer alteração posterior invalida aprovação pertinente.

### 099 — Fazer canary, promover e observar

- **Prioridade / risco / dependências:** P0; depende de 098 e aprovação Classe D explícita.
- **Executar:** promover pelo mecanismo oficial, preferindo canary/preview e rollout controlado. Rodar smoke sem dados reais destrutivos e acompanhar SLOs, erros, webhook backlog, Evolution, DB e Web Vitals pela janela combinada.
- **Verificar:** release id/commit correto, migrations compatíveis, métricas comparadas ao baseline e ausência de alerta crítico. Acionar rollback no primeiro critério definido, sem improvisar.
- **Aceite:** janela encerrada com saúde estável e evidência; ou rollback completo com incidente aberto.
- **Rollback/registro:** esta etapa é inteiramente Classe D; Cline deve parar antes de executá-la sem autorização contemporânea.

### 100 — Publicar relatório final e iniciar ciclo contínuo

- **Prioridade / risco / dependências:** P1; depende de 099 ou decisão de não release.
- **Executar:** consolidar estado das 100 etapas, SHAs/PRs, métricas antes/depois, vulnerabilidades, coverage, budgets, Web Vitals, WCAG, DB, SLOs, custos, incidentes, riscos e próximos 30/60/90 dias.
- **Verificar:** auditar links/evidências e obter sign-off dos owners; distinguir `VERIFIED`, `SKIPPED_WITH_EVIDENCE`, `BLOCKED` e `ROLLED_BACK`.
- **Aceite:** documento permite a outra equipe reproduzir os resultados; agendar revisão mensal de segurança/dívida/SLO e trimestral de DR/arquitetura.
- **Rollback/registro:** relatório não contém segredos, PII ou falsa afirmação de perfeição; excelência passa a ser um processo mensurado.

### Gate final

O programa só está concluído quando a etapa 100 possuir evidência verificável. “Código escrito”, “teste passou uma vez” ou “deploy realizado” não substituem segurança, operação, rollback e ownership.

---

## 6. Matriz de dependências e PRs sugeridos

| Faixa | Tema | Dependência crítica | Separação de PR recomendada |
|---|---|---|---|
| 001–010 | Custódia/baseline | nenhuma | docs/baseline sem mudança funcional |
| 011–020 | Supply chain/CI | 008–009 | deps; security ratchet; bundle CI |
| 021–030 | Testes | 015 | coverage; mocks/warnings; E2E/a11y |
| 031–040 | Tipos/arquitetura | 008, 033 | strict ratchet; lint batches; ADRs |
| 041–050 | Performance/a11y | 009, 018 | bundle splits; telemetry; WCAG |
| 051–060 | API/security | 027, 051 | webhook auth; rate limit; CORS/headers |
| 061–070 | Banco | 010, 028 | parity tooling; RLS/definer; query fixes; retention |
| 071–080 | Observabilidade | 046–047, 053 | correlation; frontend/edge; DLQ/SLO/runbooks |
| 081–090 | Deploy/processo | 061, 071 | env guards; Vercel; Edge; docs/ownership |
| 091–100 | Consolidação | todas aplicáveis | PWA; compatibility; release docs |

Dependências duras que o Cline não deve contornar:

- 010 → 061 → 062 antes de qualquer migration live;
- 052 → 053/054 antes de expor/alterar webhooks;
- 063/064 antes de considerar banco “seguro”;
- 046 + 071 antes de publicar source maps/telemetria;
- 070 + 078 antes de exercício de DR;
- 096 → 097 → 098 → aprovação → 099.

---

## 7. Checklists reutilizáveis pelo Cline

### 7.1 Antes de editar

- [ ] Li as instruções aplicáveis por inteiro.
- [ ] `git fetch --no-tags origin main` foi executado.
- [ ] Branch e HEAD foram registrados.
- [ ] `git status` está limpo ou as mudanças preexistentes foram identificadas e preservadas.
- [ ] Reproduzi o problema no commit atual.
- [ ] Sei quais arquivos são meus e quais pertencem a outra mudança/sessão.
- [ ] Classifiquei a ação em A/B/C/D.
- [ ] Tenho teste/medida de antes e critério de aceite.

### 7.2 Antes de alterar banco

- [ ] Há aprovação Classe D específica para esta migration/operação.
- [ ] Project ref é exatamente `tnnnlkbymytvtqngbbqh`.
- [ ] `current_database`, `current_user` e versão foram conferidos.
- [ ] Paridade da etapa 061 está verde.
- [ ] `max(version)` foi consultado imediatamente antes.
- [ ] Prefixo local é único e estritamente válido segundo a regra vigente.
- [ ] SQL foi revisado para lock, timeout, volume, RLS, grants e rollback.
- [ ] Migration é backward-compatible ou tem sequência expand/contract.
- [ ] Existe arquivo local, ledger/registro planejado, catálogo/tipos/guard atualizados.
- [ ] Teste local/staging e backup aplicável estão comprovados.
- [ ] Verificação pós-mudança é um SELECT separado e sanitizado.

### 7.3 Antes de deploy Vercel/Edge/VPS

- [ ] Há aprovação Classe C/D contemporânea.
- [ ] Projeto/host/ambiente e commit SHA foram reconfirmados.
- [ ] Required checks e auditoria da release candidata estão verdes.
- [ ] Env/secrets necessários existem por nome; nenhum valor foi impresso.
- [ ] Migration compatível já está aplicada ou não é necessária.
- [ ] Deployment/release anterior está identificado.
- [ ] Smoke, SLOs, dashboards e critérios de rollback estão prontos.
- [ ] Responsável acompanha toda a janela.

### 7.4 Antes de marcar uma etapa como `VERIFIED`

- [ ] Critério de aceite passou no commit atual.
- [ ] Teste focado e gate amplo aplicável passaram.
- [ ] `git diff --check` passou e o diff foi lido integralmente.
- [ ] Não há secret, PII, arquivo gerado ou alteração fora do escopo.
- [ ] Docs/ADR/runbook foram atualizados quando o comportamento mudou.
- [ ] Evidências e risco residual estão no diário.
- [ ] Rollback está descrito para mudanças de risco médio/alto.

---

## 8. Formato obrigatório de atualização do Cline

Ao terminar uma etapa ou grupo pequeno, o Cline deve responder:

```text
Etapas: 0XX–0YY
Estado: VERIFIED | SKIPPED_WITH_EVIDENCE | BLOCKED | ROLLED_BACK
Base: <branch> @ <sha>

Evidência anterior:
- <comando/medida e resultado>

Mudanças:
- <arquivo>: <causa raiz corrigida>

Verificações:
- <comando>: PASS/FAIL, <contagem/duração relevante>

Riscos residuais:
- <risco, owner, prazo ou “nenhum novo”>

Ações externas:
- nenhuma | aprovação necessária para <ação exata/alvo/rollback>

Próxima etapa:
- 0ZZ — <título>
```

Não usar “feito”, “resolvido” ou “100%” sem anexar evidência.

---

## 9. Critérios globais de qualidade

### Segurança

- zero segredo real versionado ou enviado ao browser;
- zero vulnerabilidade crítica conhecida sem mitigação aprovada;
- entradas externas validadas, autenticadas e limitadas;
- testes negativos de tenant/RLS/grants;
- logs sem conteúdo de mensagens, tokens ou PII desnecessária.

### Correção

- instalação e CI reproduzíveis no SHA declarado;
- testes não escondem warnings, unhandled rejections ou mocks incompletos;
- nenhuma migration histórica reescrita;
- idempotência e retries não duplicam efeitos.

### Performance

- budgets executáveis e comparáveis;
- Core Web Vitals por p75, device e versão;
- otimização baseada em traces/plans, não em contagens isoladas;
- cache tem escopo, TTL, invalidação e fallback.

### Acessibilidade e UX

- WCAG 2.2 AA nos fluxos críticos;
- teclado, foco, leitores de tela, zoom/reflow e reduced motion testados;
- loading/empty/error/offline não são estados implícitos.

### Operação

- release ligada a commit e observável;
- alertas com runbook/owner;
- backup só conta quando restore é provado;
- deploy e replay só com rollback e autorização.

### Manutenibilidade

- dívida nunca cresce silenciosamente;
- ADRs têm IDs únicos e status;
- modularidade é reforçada incrementalmente;
- ownership não depende de uma única pessoa.

---

## 10. Definição de conclusão do handoff

O Cline concluiu este handoff apenas quando entregar:

1. diário das 100 etapas com estados e evidências;
2. lista de branches, commits e PRs, sem confundir alteração local com produção;
3. relatório antes/depois de CI, segurança, testes, coverage, bundle, Web Vitals, WCAG, banco e SLO;
4. inventário de riscos/decisões ainda abertos com owner e data;
5. runbooks de deploy, rollback, incidente, replay e disaster recovery validados;
6. relatório final da etapa 100 sem secrets ou dados pessoais.

“Perfeição” não é um estado tecnicamente demonstrável. O critério profissional deste programa é: riscos conhecidos explícitos, controles testados, regressões bloqueadas, recuperação exercitada e melhoria contínua com métricas.
