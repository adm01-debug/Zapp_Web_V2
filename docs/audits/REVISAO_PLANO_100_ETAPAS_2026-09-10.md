# Revisão do plano de excelência — 100 etapas

Data: 10/09/2026. Projeto: ZAPP WEB V2. Banco declarado canônico: `tnnnlkbymytvtqngbbqh`.

## 1. Veredito

**Não: não há evidência de que todas as correções e melhorias estejam concluídas, integradas e validadas.** Há implementações reais e uma suíte ampla verde, mas também divergência no ledger, proteção de branch ausente, testes críticos desativados e funcionalidades demonstrativas.

**Atualização de fechamento:** a PR351 foi mergeada durante a auditoria, às 15:53:43 UTC, em `f194c74a2d3acec3d52a234473e8ba2300b5e68d`. Os seis cenários extras inicialmente falhavam; reexecutados na nova main, **cinco passaram e JSON null continua falhando**. O DB Live Guard voltou a falhar pela mesma migration e a main continua sem proteção. As menções a PR351 aberta e aos seis testes falhos nas seções de baseline abaixo são históricas do SHA `2a42b5e1`; a seção 10 e a matriz incorporam a atualização. Merge não comprova deploy na VPS/Edge.

Esta é uma auditoria de critérios/evidências de **100/100 etapas do handoff canônico**, não uma certificação de execução integral de cada funcionalidade. Itens sem acesso ou evidência suficiente foram explicitamente marcados. Não se atribui nota “10/10” nem percentual artificial de implementação.

A revisão não fez merge, push, deploy, alteração de configuração externa ou SQL de produção. Nenhuma rotação foi presumida. Testes novos são repros de auditoria em worktree isolado, não correções publicadas.

## 2. Escopo, versões e limites

- Plano canônico: [handoff de 100 etapas](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/docs/handoffs/handoff_cline_100_etapas_2026_08_30.md).
- Diário confrontado: [diário Cline](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/docs/handoffs/cline_execution_log_2026_08_30.md).
- SHA de origin/main auditado: `2a42b5e1b390692450d42b2e156e0cbfbb1578eb` (#350).
- Worktree de testes: `/tmp/zapp-plan-audit-20260910`, inicialmente detached nesse SHA; avançado de forma controlada para `f194c74a` somente para revalidar o delta da PR351, preservando os dois arquivos de repro.
- Checkout principal: `7f3bcc4475437f844c42a7b697001eb969079545`, 0 commits exclusivos / 29 atrás no baseline, 30 atrás após o merge da PR351. `.claude/settings.json` já estava modificado e foi preservado.
- Ambiente local: Node 24.19.0, Bun 1.4.0, Deno 2.9.5. Testes Go em container `golang:1.24-alpine`, sem rede externa, montagem do código read-only.
- Snapshot remoto continuava nesse SHA na conferência durante a revisão. O estado pode mudar após o relatório.
- Banco: evidência atual por logs do DB Live Guard ligado ao mesmo commit. **Não houve consulta administrativa direta ao catálogo/runtime canônico nesta rodada.** Não afirmar RLS/schema íntegros nem vulnerabilidade ativa apenas pelo ledger.
- VPS: somente health HTTPS consultado. Não revalidamos container digest, volumes, firewall, secrets, restart ou backups internos.
- Browser: não houve nova sessão autenticada, testes visuais contra referências, nem envio de mensagem/ação de negócio real.
- Nenhuma coleta de PII ou impressão de secrets. O risco antigo de credenciais expostas exige confirmação de rotação, não uso da credencial no chat.

Planos adicionais — `docs/IMPROVEMENT_PLAN.md`, fidelidade carvão, paridade V1/V3 e TalkX — foram confrontados por amostragem de alegações e pendências. **Não são a mesma lista de 100 etapas**: esta matriz não certifica cada item desses planos independentes. A conservação do design carvão permanece requisito; sem comparação visual não se declara fidelidade concluída.

## 3. Resultados realmente executados — baseline 2a42b5e1

| Verificação | Resultado | Alcance / ressalva |
|---|---|---|
| Instalação Bun frozen | PASS | 637 pacotes; lockfile sem alteração |
| Vitest com coverage | 226 arquivos; 3020 PASS; 35 TODO | TODO não conta como teste executado |
| Coverage | linhas 44,05%; statements 42,64%; funções 50,36%; branches 39,52% | **Somente src/lib e src/services**; não representa hooks/componentes/aplicação inteira |
| Typecheck normal | PASS | Não equivale a strict integral |
| Lint ratchet | PASS | Baseline 1189; atual 1129; removidas 60; novas 0; dívida continua |
| Build | PASS, 21,89 s locais | Aviso de chunks acima de 1200 kB minificados |
| Budget inicial | PASS | JS 335,1 KB gzip / teto 350; CSS 36,1 KB / teto 80 |
| Guards CI/deploy Node | 90 PASS | Sem chamadas de negócio de produção |
| Contratos outbox CRM Node | 10 PASS | Incluídos também no total DB abaixo; não somar duas vezes |
| Guards DB Node | 133 PASS | Parte são contratos estruturais, não execução PostgreSQL de todas as migrations |
| Deno: cinco arquivos selecionados pela CI | 20 PASS | SSRF, egress, CRM e message-delivery |
| Go: suíte existente do proxy | 5 PASS | Rodada antes de adicionar repros |
| **Go: novos cenários de auditoria** | **2 FAIL** | IP público bloqueado e replay temporal |
| **Deno: novos cenários de auditoria** | **4 FAIL** | JSON null, status 204, status 205, stream de erro sem cancelamento |
| Simulação grep com entrada inexistente | **Erro convertido em sucesso** | Negação de exit 2 do grep resulta em exit 0 |
| Simulação budgets secundários | **Nenhuma violação retornada** | evaluate() ignora largest-chunk e total-assets mesmo com tetos zero |
| Health HTTPS do proxy | HTTP 200, TLS verify 0 | Resposta status ok; não é prova de todas as propriedades de segurança |

A primeira execução Deno falhou por dependências ainda não instaladas no worktree; após `bun install --frozen-lockfile`, a execução com checagem de tipos passou. Não foi necessário remover typecheck nem usar `--no-check`. Vitest mostrou avisos Canvas não implementado no jsdom; não classificá-los como falha de negócio nem ocultá-los.

CI remota no SHA auditado:

- [CI/CD Pipeline: SUCCESS](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34497235847).
- [DB Guard offline: SUCCESS](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34497235846).
- [CodeQL: SUCCESS](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34497235823) — a antiga alegação “CodeQL ausente” já não se aplica.
- [DB Live Guard: FAILURE](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34497235978).
- CRM Sync Worker desse commit foi SKIPPED; isso não comprova processamento bem-sucedido de uma sincronização.

## 4. Achados prioritários e critérios de encerramento

### R01 — P1: main sem proteção efetiva

**Evidência atual:** endpoint branches/main retorna `protected:false`; branch protection retorna 404 “Branch not protected”; regras aplicáveis e rulesets vazios. Contradiz [ADR-004](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/docs/adr/ADR-004-branch-protection-solo-maintainer.md), que registra proteção restaurada em 07/09. Não inferimos autor ou motivo da remoção.

**Impacto:** checks verdes/vermelhos não são por si um bloqueio obrigatório de merge. Um mantenedor pode integrar mudanças sem os controles documentados.

**Como começar:** reconciliar política aprovada e estado efetivo; restaurar via autorização específica, sem impor aprovação humana impossível para autor único. Verificar nomes exatos dos contextos, proteção contra force push/deleção, resolução de conversas e política de bypass. Aceite: PR de teste com gate propositalmente falho impedido de merge; PR legítimo com todos os checks passa. [Referência de proteção do GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

### R02 — P1: 410/410 migrations, mas conteúdo divergente

Guard vivo de 10/09, 15:41 UTC: migration `20260910080000`, ledger_name `talkx_blacklist_audit`.

- SQL normalizado local: `6e56ff4d973d527767d65c18dcb6598c41ff2d5793196d4aa91d2ca2fa0291e2`.
- SQL normalizado ledger: `50ce7118357cbc201959563aef4beab34e47bb2aa41e2544e891c056afb166fa`.
- Ledger statements SHA-256: `0458cf869dd81052f3dc8a1b37f68a3fa5e444d310edd91175c5a47a82d1fd96`.

**Impacto:** paridade por quantidade/versão não prova paridade de conteúdo. Isso não demonstra, isoladamente, diferença no schema efetivo ou acesso indevido.

**Como começar:** confirmar identidade canônica, exportar evidência mínima em leitura, comparar SQL e objetos/grants envolvidos. Se arquivo histórico divergiu, recuperar fonte autorizada; se estado desejado exige alteração, migration nova forward-only com ensaio e aceite. Não inserir/alterar ledger manualmente, não fabricar hash nem usar no-op para disfarçar drift. Aceite: guard vivo e replay limpo aprovados no mesmo candidato, diferenças explicadas e comportamento validado. As seis migrations históricas sem SQL/hash são uma ressalva distinta; não justificam este mismatch novo.

### R03 — Baseline: defeitos do proxy e PR351 então aberta; correções de código revalidadas na seção 10

A [PR351](https://github.com/adm01-debug/Zapp_Web_V2/pull/351), head `c4404aee07c4cbc98ab408e8316f0799ca8577c5`, estava OPEN. O merge/deploy de #346 não contém automaticamente suas correções.

Falhas reproduzidas contra main:

1. **Bloqueio excessivo:** `192.0.78.9` é rejeitado porque código bloqueia todo `192.0.0.0/16`. Afeta disponibilidade de previews públicos. Teste sem DNS real.
2. **Replay:** assinatura válida com timestamp em `t+89s` é aceita em `t` e novamente em `t+91s`; nonce expirou em 90s, enquanto timestamp continua válido. Simulação injeta tempo, não espera. **Pré-condição:** requisição validamente assinada; não é quebra de HMAC nem prova de ataque anônimo. Deve-se reter nonce pela janela total de aceitação, incluindo limites de segundos.
3. **204/205:** criação de Response com body nesses status lança TypeError em vez de falhar de modo controlado.
4. **503/erro do proxy:** corpo não é cancelado; teste de stream confirma falta de cancelamento.

A PR propunha correções para esses casos e teste de SNI. Após o merge externo, revalidamos independentemente os casos no código novo (seção 10). Nós não fizemos merge nem deploy dessa PR; publicação/runtime permanecem separados do aceite de código.

### R04 — P2 novo: JSON null ainda lança exceção, inclusive no código proposto pela PR351

[secure-egress.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/supabase/functions/_shared/secure-egress.ts), leitura de `payload.url` após `response.json()` com cast TypeScript. `null` passa pelo parse, mas não é objeto. O teste falha em linha 145 na main. Inspeção do head351 mostra o mesmo acesso sem guarda de objeto.

**Impacto:** quebra do contrato da função “falha = miss/null”. O chamador `fetch-link-preview` possui catch externo que responde 500; não alegar bypass SSRF ou acesso a dados a partir desse erro.

**Como começar:** parse para unknown, validar objeto não nulo/não array antes de propriedades; limitar envelope antes de JSON/base64, tratar construção de Headers/Response e status sem corpo. Testar null, arrays, JSON inválido, CR/LF em headers, corpo grande e interrupção de stream. Aceite: respostas adversariais falham controladamente, sem leaks nem fallback de fetch direto.

### R05 — P1 de controle: secret scanner da CI não cumpre o plano

[ci.yml](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/.github/workflows/ci.yml) ainda usa grep negado em TS/TSX/JS de `src/`. Não cobre Go, Edge, YAML, docs, histórico ou outros formatos. Em erro de leitura, grep retorna 2 e `!` produz 0. **Reproduzido com caminho inexistente e padrão sintético, sem segredo real.**

Como começar: scanner especializado fail-closed e pinado, regras/allowlist revisadas, testes de detecção sintética, arquivo ilegível e scanner indisponível. Tratar findings antigos como incidentes/risco aceito, nunca somente ignorá-los. CodeQL não substitui scanner de secrets.

### R06 — P1 de recuperabilidade: runbook de backup incorreto e DR não provado

[BACKUP-RECOVERY-STRATEGY.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/docs/BACKUP-RECOVERY-STRATEGY.md) usa service_role como senha do PostgreSQL em exemplos de pg_dump, além de citar contagens/repositório antigos. API key não é a senha de conexão nativa PostgreSQL. [Documentação Supabase de conexão](https://supabase.com/docs/guides/database/connecting-to-postgres).

Como começar: corrigir documentação, inventariar backup disponível e executar restore isolado com credencial PostgreSQL apropriada e segura. Validar também **objetos Storage**, pois backup do banco não é backup do conteúdo dos objetos. [Limites dos backups Supabase](https://supabase.com/docs/guides/platform/backups). Não executar os comandos antigos por cópia. Aceite: relatório com origem, integridade, RPO/RTO medidos, arquivos restaurados e aplicação funcional.

### R07 — P2: cobertura e automação de aceitação insuficientes

- Coverage restringe-se a lib/services. 35 TODO em Vitest.
- E2E: 6 testes de login; 4 fluxos críticos desativados (envio texto, anexo, resolver e filtrar conversas).
- Playwright não executa na CI observada; tampouco gate Lighthouse/axe autenticado.
- Pisos de coverage são fixos; comentário “ratchet” não implementa comparação monotônica.
- Budget realmente bloqueia JS/CSS iniciais, não largest-chunk/total-assets.

Como começar: fixtures autenticadas multi-tenant, E2E sem envio externo real, guard de skips, limites por risco e contratos dos próprios gates. Aceite: regressão sintética causa falha no gate correspondente.

### R08 — P2: telas demonstrativas não equivalem a integração real

- [GoogleCalendarIntegration](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/src/components/integrations/GoogleCalendarIntegration.tsx): banner de demonstração e OAuth ainda não implementado.
- [N8nIntegrationView](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/src/components/integrations/N8nIntegrationView.tsx): demonstração, sem persistência real completa.
- [SentryIntegrationView](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/src/components/integrations/SentryIntegrationView.tsx): mockErrors em estado local; não prova coleta real.
- Ações com “em breve” ainda existem em lista virtualizada.

Como começar: decidir entre completar função ou manter explicitamente indisponível. Não exibir sucesso de operação sem backend. Aceite: ação persiste e sobrevive reload, autorização verificada, erro upstream tratado, logs/evento de teste comprovados. Para Sentry, erro sintético precisa aparecer na release e linha corretas.

### R09 — P2: observabilidade e Web Vitals parcialmente implementados

[web-vitals.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/src/lib/web-vitals.ts) mantém agregações manuais. CLS usa soma sem session windows; INP usa máximo de duração de eventos. Não é substituição fiel da biblioteca mantida pelo Chrome. A [biblioteca oficial](https://github.com/GoogleChrome/web-vitals) oferece coleta compatível; a [definição de CLS](https://web.dev/articles/cls) usa janelas de sessão.

[slo.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/2a42b5e1b390692450d42b2e156e0cbfbb1578eb/docs/runbooks/slo.md) admite ausência de monitor externo/alerta de desconexão automatizado e lista jobs/views como próximos passos. Não achamos migrations pelos nomes propostos; isso não exclui configuração manual externa. Não declarar inexistência em produção sem inspeção.

Como começar: medição oficial com privacidade e amostragem, cron/monitor inventariados, alerta sintético e dashboard com fonte e janela conhecidas. Timestamp do provedor não deve ser confundido com relógio de ingestão/latência interna sem tratar clock skew.

### R10 — P1 a confirmar / P2 de hardening: modos de segurança e uso do proxy

- Evolution: default no código é `shadow`; modo `token` existe. Não verificamos o modo runtime nesta rodada.
- Limite distribuído possui fallback local; webhook Evolution chama contador local.
- fetch-link-preview não faz validação explícita de usuário nem rate limit interno no handler. A configuração efetiva do gateway deve integrar a prova de autorização. Public anon key não equivale a sessão de usuário.
- Cliente do proxy segue comportamento padrão de redirect e lê JSON completo antes do limite de base64.
- Compose não documenta completamente o ingress real por subcaminho usado no hostname da Evolution.

Como começar: coletar apenas metadados sanitizados de modos/secrets, decidir autorização e quotas por identidade, exigir redirect error/manual ao proxy confiável, limitar envelope, testar concorrência e registrar ingresso/TLS reproduzíveis. **Não houve tentativa de exploração, carga ou POST de webhook real.**

### R11 — P2: registro de conclusão está desatualizado

Diário: 4 VERIFIED; 1 BLOCKED; 2 IN_PROGRESS; 93 NOT_STARTED. Essa tabela não foi reconciliada com avanços presentes no código. Também há documento antigo anunciando “100% completo” com aceites não assinalados, ADR de proteção incorreto no estado atual e descrições antigas de login que divergem do código fail-closed.

Como começar: uma matriz fonte da verdade; preservar histórico, mas distinguir declaração, código, teste, merge, deploy e runtime. Evitar novo ciclo de auditorias que apenas atualiza prose sem encerrar aceites reais.

## 5. Matriz canônica de 100 etapas

Legenda:

- **V:** critério delimitado comprovado nesta rodada, sem generalizar para operação inteira.
- **P:** evidência de implementação parcial ou validação/publicação/aceite incompletos.
- **F:** condição exigida contradita por evidência atual ou teste reproduzido.
- **A:** artefato/gate/candidato exigido não localizado no escopo indicado.
- **N:** não certificado; depende de evidência externa, exercício ou inspeção específica adicional. Não significa ausente.

Distribuição: **3 V, 69 P, 9 F, 3 A, 16 N = 100**. Isso classifica **suficiência de evidência de encerramento**, não estima percentual de código pronto. O relatório não converte uma lacuna de prova em bug confirmado.

As referências de arquivos sem URL nesta matriz são relativas ao SHA auditado, disponível no worktree isolado. Fontes centrais: handoff/diário, ci.yml, vitest.config.ts, e2e/, scripts/ci/, scripts/db-audit/, supabase/functions/, docs/adr/, docs/decisions/ e docs/runbooks/.

| ID | Etapa canônica | Estado | Evidência / lacuna | Próximo aceite concreto |
|---|---|---|---|---|
| 001 | Ler as regras e declarar entendimento | V | Regras de segurança fornecidas e aplicadas nesta auditoria; nenhum segredo ou dado de cliente usado nos repros. | Manter regras como gate de toda execução; não confundir com conclusão das demais etapas. |
| 002 | Sincronizar a base de trabalho sem destruir alterações | P | Checkout principal está 29 commits atrás do origin/main observado; alteração preexistente em .claude/settings.json preservada. Auditoria executada em worktree isolado no SHA fixado. | Sincronizar o checkout de desenvolvimento sem descartar trabalho, em tarefa de implementação separada. |
| 003 | Fixar e registrar o ambiente de ferramentas | V | Node 24.19.0, Bun 1.4.0, Deno 2.9.5; instalação frozen concluída. Go 1.24 em container isolado. | Guardar versões junto a cada nova execução; versões futuras exigem novo baseline. |
| 004 | Criar o diário de execução e a matriz de decisões | P | Diário contém as 100 etapas, mas tabela ainda mostra só 001–004 VERIFIED, 005 BLOCKED, 006–007 IN_PROGRESS e 008–100 NOT_STARTED. | Reconciliar tabela com provas por SHA, ambiente, data e critério de aceite; preservar histórico. |
| 005 | Verificar identidades de todos os alvos sem mutação | N | GitHub confirmado; endpoint HTTPS do proxy responde. Identidade administrativa e catálogo atual do Supabase não foram revalidados diretamente nesta rodada. | Provar identidade canônica antes de SQL; anexar metadados sanitizados de Supabase, Vercel e VPS. |
| 006 | Tratar o URL autenticado do MCP como credencial exposta | N | Diário registra aceite temporário da credencial MCP até 06/09/2026, data vencida. Não foi localizada prova atual de revogação nesta revisão. | Confirmar revogação/rotação pelo proprietário sem revelar valores; não testar credenciais expostas. |
| 007 | Inventariar superfícies de segredo e dados sensíveis | P | Inventário e achados F-01…F-11 existem; documento não comprova o encerramento das rotações pendentes. | Conferir inventário com metadados de secret stores e registrar responsável, rotação e revogação. |
| 008 | Capturar o baseline completo da revisão atual | P | Baseline novo de testes, coverage, build, lint e typecheck produzido; runtime autenticado e browser não incluídos. | Vincular todos os artefatos ao mesmo SHA e completar evidências de execução real. |
| 009 | Capturar baseline de UX, bundle e rede | P | Bundle inicial medido nesta rodada; não há nova captura de rede/UX autenticada nas sete abas. | Capturar desktop/mobile, chamadas e navegação reais com fixtures sanitizadas. |
| 010 | Reconciliar migrations do repositório e do banco em modo leitura | F | DB Live Guard: 410 arquivos/410 registros, mas SQL de 20260910080000 diverge. | Inspecionar o conteúdo remoto e estado estrutural em leitura; separar erro de arquivo, ledger e schema. |
| 011 | Transformar o audit de dependências em backlog verificável | P | Dependabot, audit-prod e histórico de upgrades presentes; baseline corrente de todas as vulnerabilidades não foi refeito independentemente. | Gerar inventário por advisory, dependência, alcance, versão corrigida e aceite de risco. |
| 012 | Corrigir vulnerabilidades diretas em lotes pequenos | P | Há upgrades na main e CI de dependências passando; isso não certifica toda cadeia transitiva ou integrações após major. | Tratar cada advisory com teste de regressão; não mergear majors por lote automaticamente. |
| 013 | Isolar ou substituir a cadeia de planilhas vulnerável | N | Não há nesta rodada prova específica de encerramento da cadeia de planilhas com análise completa do lockfile. | Inspecionar importação/exportação, transitivas, CSV injection e fixtures de arquivos hostis. |
| 014 | Fixar a toolchain de forma explícita | P | Node 24/Bun 1.4.0 alinhados; actions fixadas por SHA. Deno v2.x e imagens do proxy usam seletores móveis. | Fixar e documentar política de atualização de runtime/imagens, com digest e rollback. |
| 015 | Habilitar coverage de fato | V | Coverage V8 realmente executado e bloqueante: linhas 44,05%, statements 42,64%, funções 50,36%, branches 39,52% no recorte configurado. | Manter o gate; não divulgar esses números como cobertura da aplicação inteira. |
| 016 | Criar ratchet bloqueante para vulnerabilidades | P | audit-prod bloqueia HIGH/CRITICAL em produção; audit geral de devDependencies é informativo. | Documentar exceções e testar falha de coleta, advisories novos e risco de ferramentas de build. |
| 017 | Substituir o grep de secrets por scanner fail-closed | F | ci.yml ainda usa grep restrito a src e TS/TSX/JS. Simulação: erro de leitura retorna sucesso após negação. | Substituir por scanner fail-closed, com alcance de diff/histórico e allowlist revisada; scanner indisponível deve falhar. |
| 018 | Tornar budgets de bundle executáveis | P | Budget inicial JS/CSS executável e aprovado; largest-chunk/total-assets não são avaliados por evaluate(). | Implementar os dois budgets faltantes e erro em configuração ausente/malformada; usar fixtures que ultrapassem cada limite. |
| 019 | Otimizar a CI sem reduzir os gates | P | CI paralela com instalação frozen e guards; pipeline do SHA passou. | Medir duração/cache/flakiness e garantir que otimizações não removam gates; proteção remota continua ausente. |
| 020 | Formalizar checks obrigatórios e proteção da main | F | API: main.protected=false; branch protection retorna 404 e rulesets/regras aplicáveis vazios, contrariando ADR-004. | Restabelecer política aprovada via tarefa autorizada; comprovar bloqueio de PR com check falho e sem bypass indevido. |
| 021 | Definir a taxonomia e os contratos da suíte | P | Vitest, contratos Deno, guards Node e testes PostgreSQL coexistem; 35 TODO na suíte ampla. | Publicar taxonomia, owners e seleção de suítes por risco; TODO não é teste executado. |
| 022 | Eliminar avisos React `act(...)` pela causa raiz | P | Não apareceu aviso act na execução ampla desta rodada; houve avisos Canvas não implementado no jsdom. | Criar gate de warnings relevantes e validar a causa dos avisos; não esconder console para tornar a suíte verde. |
| 023 | Padronizar mocks Supabase e contratos de erro | P | Mocks e contratos de erro existem; Deno verifica recusa anônima e payload de CRM. | Auditar mocks contra respostas reais e adicionar contratos para erros, timeouts e troca de sessão. |
| 024 | Medir coverage por risco, não apenas média global | P | Coverage inclui somente src/lib e src/services; hooks e componentes ficam fora do relatório. | Adicionar mapa de fronteiras P0/P1 e medição de auth, realtime, composer, contatos e mutações. |
| 025 | Implantar coverage ratchet incremental | P | Pisos globais fixos existem, mas comentário de ratchet não cria comparação monotônica automática. | Persistir baseline revisado, impedir redução e incluir arquivos novos; não subir metas sem medição. |
| 026 | Cobrir autenticação, sessão, RBAC e troca de usuário | P | Auth server-side e testes presentes; serverLogin atual falha fechado, ao contrário de descrição antiga de fallback no ADR. | Revalidar sessão expirada, refresh, logout/login de outro usuário, RBAC e acesso direto ao provedor com identidades de teste. |
| 027 | Expandir testes de contrato das Edge Functions | P | 20 testes Deno passaram, selecionados em cinco arquivos; não equivalem a contrato positivo de todas as funções. | Matriz por função: anônimo, autorizado, proibido, payload inválido, timeout e idempotência. |
| 028 | Criar testes locais de migrations, RLS e grants | P | 133 testes Node de DB passaram; DB Guard offline passou no GitHub. Node inclui testes de estrutura/guard, não todos executam SQL real. | Executar/reter suíte PostgreSQL com roles reais e replay limpo; não equiparar regex a RLS runtime. |
| 029 | Implantar Playwright nos fluxos críticos | P | Playwright: seis testes de tela de login; quatro fluxos críticos test.skip; sem execução Playwright na CI. | Criar usuários/tenant sintéticos, retirar skips e tornar fluxos reais um gate. |
| 030 | Automatizar smoke de acessibilidade | A | Não localizado gate automático de acessibilidade na CI; dependência axe instalada não basta. | Adicionar axe em páginas autenticadas e testes de teclado/foco; exigir ausência de violações graves. |
| 031 | Produzir mapa do débito TypeScript estrito | P | Config strict e baselines existem; typecheck normal passou, mas não é strict integral. | Produzir contagem corrente por classe/arquivo com tsconfig.strict e registrar dívida rastreável. |
| 032 | Criar ilhas estritas e ratchet de TypeScript | P | Ratchets TS/implicit-any presentes; tsconfig.app mantém strict=false/noImplicitAny=false. | Definir ilhas estritas com include explícito e impedir regressão na fronteira escolhida. |
| 033 | Sincronizar e confiar nos tipos gerados do Supabase | P | types-sync e guards existem; tipo gerado não elimina o drift SQL atual. | Associar tipos, catálogo e migrations ao mesmo fingerprint remoto e commit de origem. |
| 034 | Remover `any` de fronteiras P0 | N | Typecheck verde não demonstra eliminação de any nas fronteiras P0; não houve inventário integral novo. | Listar any/casts em auth, RPC, webhook e parsers; substituir por unknown e validação runtime testada. |
| 035 | Endurecer nullability e acesso a coleções | P | strictNullChecks e outras opções habilitadas; flags mais fortes e provas de todas as coleções não certificadas. | Tratar índices ausentes, datas inválidas, null de APIs e arrays vazios; começar pelos parsers externos. |
| 036 | Classificar a dívida ESLint e limpar configuração | P | Lint ratchet: baseline 1189, atual 1129, novas 0, removidas 60. | Classificar os 1129 itens remanescentes por regra/risco; não chamar de lint sem dívida. |
| 037 | Reduzir lint por ondas sem churn | P | Há redução mensurável de 60 itens contra baseline, sem novos itens. | Dividir dívida restante em ondas pequenas e confirmar comportamento após cada onda. |
| 038 | Mapear ciclos, god modules e dependências cruzadas | N | Grafo consultado não trouxe vocabulário relevante; não há neste relatório mapa atualizado completo de ciclos/god modules. | Gerar análise determinística de dependências no SHA corrente e classificar ciclos reais. |
| 039 | Formalizar arquitetura modular orientada a features | P | Organização modular híbrida existe; não foi comprovado enforcement de fronteiras para todo o código. | Definir dependências permitidas e teste de arquitetura, evitando refatoração global cosmética. |
| 040 | Corrigir governança de ADRs e documentação conflitante | P | ADRs existem em docs/adr e docs/decisions; há índices/descrições desatualizados e números duplicados entre coleções. | Escolher índice canônico, marcar superseded e reconciliar decisões com comportamento atual. |
| 041 | Gerar mapa de bundle por rota e dependência | P | Build e orçamento inicial medidos; mapa completo por rota não refeito. | Gerar relatório de imports por rota e distinguir inicial, lazy, CSS e bibliotecas compartilhadas. |
| 042 | Reduzir JavaScript realmente inicial | P | JS inicial gzip 335,1 KB ante teto 350 KB; gate aprovado com pouca folga. | Identificar maiores contribuintes e comparar navegação fria/quente antes de alterar chunks. |
| 043 | Reduzir CSS inicial e duplicação de estilos | P | CSS inicial gzip 36,1 KB ante teto 80 KB; isso não prova ausência de duplicação ou regressão visual. | Medir cobertura CSS e regressão visual do tema carvão antes de eliminar estilos. |
| 044 | Carregar Mapbox, PDF, charts e planilhas apenas sob demanda | P | Code splitting existe; build ainda alerta chunks acima de 1200 kB minificados. | Verificar downloads iniciais de Mapbox/PDF/charts/planilhas em cada rota e imports transitivos. |
| 045 | Otimizar ícones, UI e renderização de listas | P | Listas virtualizadas e chunk de ícones presentes; perfil de renderização do Inbox não capturado nesta rodada. | Medir 1k/10k conversas, scroll, troca rápida, teclas e acessibilidade com dados sintéticos. |
| 046 | Resolver estratégia de source maps e Sentry | P | Build com source maps; tela Sentry usa mockErrors e não prova ingestão/upload de mapas. | Decidir fornecedor, proteger mapas e produzir erro sintético ligado à release correta. |
| 047 | Substituir Web Vitals manual por telemetria correta | F | Web Vitals continua manual: INP usa máximo de eventos e CLS acumula sem session windows. | Migrar para medição oficial e endpoint de coleta, com privacidade, amostragem e teste BFCache/visibilidade. |
| 048 | Auditar React Query, chamadas redundantes e cache | P | React Query/cache e ADR de whatsapp_connections presentes; sem nova medição de requests/invalidations por usuário. | Instrumentar deduplicação, staleTime, logout, invalidation e storm de reconexões. |
| 049 | Executar auditoria manual WCAG 2.2 AA | N | Não foi executada auditoria WCAG manual autenticada nesta rodada. | Testar teclado, leitor de tela, contraste, foco, zoom e mensagens de erro no design carvão. |
| 050 | Instituir gate Lighthouse e matriz responsiva | A | Não localizado gate Lighthouse/Playwright responsivo na CI. | Criar orçamentos e capturas por viewport; separar laboratório de Web Vitals de campo. |
| 051 | Inventariar APIs, consumidores e trust boundaries | P | Inventário/manifesto de Edge Functions existe; cobertura de trust boundaries não certificada para cada consumidor. | Relacionar endpoint, role, fonte de segredo, efeito externo, timeout e contrato. |
| 052 | Auditar toda exceção `verify_jwt = false` | P | Há testes de auth e inventário; flags verify_jwt=false dependem de validação interna. | Para cada exceção, provar controles equivalentes com tokens inválidos, expirados, role errada e sem sessão. |
| 053 | Endurecer o webhook Evolution contra spoofing e replay | P | Webhook Evolution tem modo token, mas default no código é shadow; runtime do secret não foi lido. | Confirmar modo efetivo por metadado sanitizado e testar spoof/replay isoladamente; não inferir vulnerabilidade ativa sem prova. |
| 054 | Endurecer Gmail, ElevenLabs, cron e public API | P | Contratos e kill switches parciais existem; Gmail/voz/cron completos não foram exercitados com integrações sandbox. | Smoke funcional por provedor, limites, callbacks duplicados, credencial inválida e erro upstream. |
| 055 | Implementar rate limiting distribuído | P | Rate limit por RPC existe com fallback local; Evolution usa contador local. | Definir fail-open/fail-closed por risco; testar concorrência entre instâncias e indisponibilidade do contador. |
| 056 | Validar payloads e normalizar erros em todas as fronteiras | P | Validações compartilhadas existem; JSON null do proxy causa TypeError reproduzido. | Normalizar objetos unknown e erros em toda fronteira; limitar tamanho antes de parse e testar payloads adversariais. |
| 057 | Restringir CORS e métodos por endpoint | P | Smokes/gates verificam CORS/métodos em parte do inventário. | Completar allowlists por endpoint e testar origem ausente, não permitida, preflight e método inesperado. |
| 058 | Fechar SSRF, redirects e processamento de URLs | F | No baseline seis repros falharam; após merge da PR351 cinco passaram, mas JSON null continua lançando TypeError. Deploy do delta não certificado. | Corrigir null e revalidar limites/redirects/DNS misto; comprovar versões coordenadas em runtime. |
| 059 | Reduzir privilégios e sanitizar logs | P | ACLs e sanitização receberam correções; não houve varredura atual completa de logs/segredos de todas as integrações. | Provar least privilege por identidade e redaction com fixtures sem PII/segredos reais. |
| 060 | Aplicar headers de segurança e CSP por etapas | P | Config de headers/CSP existe, com partes report-only; não houve teste browser completo de recursos permitidos/bloqueados. | Validar nonce/origins, CSP reports, frames e regressões antes de enforcement. |
| 061 | Resolver qualquer drift de migrations | F | Divergência SQL ativa no guard vivo do SHA auditado. | Resolver evidencialmente sem editar ledger para mascarar diferença; manter exceções históricas separadas. |
| 062 | Automatizar paridade de schema, catálogo e tipos | P | Automação de catálogo/types/migrations e guard offline presentes; vivo falha. | Manter snapshot/fingerprint comum e testar drift artificial, metadata ausente e conexão ao projeto errado. |
| 063 | Construir matriz RLS multi-tenant com testes negativos | P | Há suítes ACL/RLS, inclusive autorização Inbox/CRM; não certificadas todas as combinações runtime. | Matriz anon/agente/supervisor/admin/service entre tenants, owner e não owner, funções/tabelas/storage/realtime. |
| 064 | Auditar `SECURITY DEFINER`, grants e `search_path` | P | Guard de ACL e testes SECURITY DEFINER presentes; nenhum novo inventário runtime integral nesta revisão. | Catalogar todas as funções overloads, owner, grants, search_path e identidade efetiva. |
| 065 | Medir queries reais com `pg_stat_statements` | N | Nenhuma coleta nova de pg_stat_statements canônico nesta rodada. | Coletar somente agregados, janela conhecida e top queries por tempo/chamadas; não expor literais pessoais. |
| 066 | Corrigir a tempestade em `whatsapp_connections` | P | ADR/cache e código de connections existem; não medido efeito atual no tráfego. | Medir consultas/assinaturas em múltiplas abas, foco, reconnect e logout; comparar baseline. |
| 067 | Otimizar queries e índices com planos comprovados | N | Não há nova bateria EXPLAIN com distribuição atual anexada a esta auditoria. | Selecionar queries por custo medido; testar índices em réplica/local com dados representativos e planos antes/depois. |
| 068 | Auditar Realtime, replica identity e lifecycle de subscriptions | P | useSupabaseRealtime e testes existem; cenário browser de lifecycle/carga não foi reexecutado. | Testar mount/unmount, reconexão, canal duplicado, troca de usuário e eventos fora de ordem. |
| 069 | Implementar retenção, minimização e limpeza LGPD | P | Política de retenção existe, mas é antiga e não prova jobs canônicos nem exclusão de Storage/CRM. | Reconciliar retenção aprovada com jobs efetivos, dry-run, proteção legal e dados de teste. |
| 070 | Provar backup, restore e RPO/RTO do banco | F | Runbook de backup instrui usar service_role como senha PostgreSQL; restore/RPO/RTO atuais sem evidência nesta rodada. | Corrigir autenticação/documentação e executar restore isolado de DB+Storage medindo perda/tempo. |
| 071 | Definir arquitetura de observabilidade e taxonomia | P | Logger, runbooks e sinais existem; catálogo operacional fim a fim não comprovado. | Definir eventos, labels de baixa cardinalidade, retenção e dashboards por serviço. |
| 072 | Padronizar correlation e causation IDs | P | Há mecanismos de rastreio parciais; cadeia browser→Edge→fila→Evolution/CRM não foi demonstrada. | Propagar IDs sem PII e demonstrar um fluxo completo com retry e dead letter. |
| 073 | Instrumentar erros e releases do frontend | P | Tela Sentry usa dados simulados; nenhum evento remoto da release auditada foi provado. | Instrumentar erro sintético e comprovar recebimento, sourcemap e alerta ao responsável. |
| 074 | Instrumentar Edge Functions e dependências externas | P | Logs de funções e guards existem; smokes genéricos não são métricas de negócio. | Medir taxa de erro, p95, timeout, retry, backlog e falhas por dependência. |
| 075 | Monitorar Evolution GO e a VPS Hostinger | P | Health HTTPS do proxy 200/TLS válido; não comprova supervisão, volume, imagem ou restart na VPS. | Obter evidência administrativa sanitizada de imagens/digest, restart policy, recursos e alertas reais. |
| 076 | Consolidar idempotência, DLQ e replay de webhooks | P | Outbox/claim/backoff/dead letter de CRM têm contratos; não houve replay end-to-end em provedor real. | Testar entrega duplicada, worker concorrente, lease vencido, retry e DLQ com transações sintéticas. |
| 077 | Definir SLOs, SLIs e alertas acionáveis | P | slo.md lista SLOs propostos e admite ausência de monitor externo/alerta automático; não achada migration com os nomes propostos. | Confirmar cron/monitor externo e simular alerta de ponta a ponta; calcular disponibilidade com amostragem real. |
| 078 | Atualizar runbooks por sintoma e decisão | P | Runbooks presentes; backup incorreto e ingress do proxy incompletamente reproduzível no compose. | Atualizar por sintoma e testar cada procedimento em sandbox; dono, rollback e limites explícitos. |
| 079 | Executar game days controlados | N | Não localizado relatório atual de game day com evidência suficiente nesta revisão. | Simular queda do proxy, Supabase, Evolution, fila e rate limiter sem tocar usuários reais. |
| 080 | Instituir post-mortem sem culpa e métricas DORA | N | Não comprovado processo corrente com DORA/post-mortems e janela comparável. | Definir métricas de equipe, incidentes, lead time e recuperação; evitar ranking individual. |
| 081 | Formalizar ambientes e identity guards | P | Identity guards no código e testes existem; checagem de todos os provedores não completa nesta rodada. | Amarrar projeto/tenant/environment em todos os scripts de deploy e falhar em mismatch. |
| 082 | Criar preview seguro e dados determinísticos | P | Há cenários sintéticos unitários; fixtures autenticadas determinísticas de browser ainda faltam. | Criar ambiente isolado sem envio externo e seeds multi-tenant; nunca clonar PII sem tratamento. |
| 083 | Endurecer deploy e rollback Vercel | P | CI/build Vercel presentes; SHA da produção atual e rollback não foram certificados nesta rodada. | Comparar deployment/release SHA e testar rollback de preview antes de produção. |
| 084 | Endurecer deploy de Edge Functions e migrations | P | Manifesto e guards presentes; PR351 integrada no fechamento, mas deploy não certificado e guard DB vivo continua falhando. | Promover manifesto exato com smoke positivo e negativo por função e plano de rollback compatível. |
| 085 | Governar Evolution GO como serviço crítico | P | Proxy e Evolution compartilham VPS; health público não comprova governança administrativa. | Versionar ingress, TLS, hardening, atualização, backups e monitoramento com acesso do responsável. |
| 086 | Instituir ciclo de vida de secrets | N | Não há prova corrente das rotações F-01…F-04 e credenciais expostas; prazo de aceite MCP expirou. | Inventário com owner/escopo/última rotação, revogar antigas e testar continuidade sem imprimir valores. |
| 087 | Criar orçamento e observabilidade de custos | N | Não foram obtidas métricas atuais de custos ou alarmes configurados. | Medir custos por função/tenant, storage/egress/IA e definir limites/alertas com responsáveis. |
| 088 | Reconciliar documentação técnica com o sistema atual | F | Diário, ADR de proteção, backup e plano antigo 100% concluído conflitam com estado observado. | Reconciliar um único registro de aceite por etapa, preservando histórico e data/ambiente de cada afirmação. |
| 089 | Definir ownership, ADR/RFC e review baseado em risco | P | CODEOWNERS/ADRs existem, mas proteção ausente retira enforcement remoto. | Definir ownership por domínio, decisão por risco e gates obrigatórios sem exigir aprovação impossível de autor único. |
| 090 | Tornar onboarding e ambiente local reproduzíveis | P | Instalação frozen reproduzida; dependências ausentes inicialmente impediram Deno, resolvido com instalação. | Documentar setup completo, portas, dados sintéticos, runtime e sequência de testes sem secrets de produção. |
| 091 | Decidir e concluir a estratégia PWA | N | Decisão/validação atual de PWA não certificada nesta revisão. | Decidir escopo e testar atualização SW, cache privado, logout, offline e recuperação de versão. |
| 092 | Fechar matriz de browsers, dispositivos e conectividade | P | Config Playwright contempla Chromium; não há prova corrente cross-browser/conectividade autenticada. | Adicionar Firefox/WebKit e cenários lento/offline/retorno, sem duplicar envios. |
| 093 | Ratificar modular monolith vs microsserviços | N | Não localizada ratificação arquitetural atual suficiente para fechar essa etapa. | Registrar ADR de monólito modular/serviços por necessidade medida; não migrar por preferência abstrata. |
| 094 | Definir versionamento e compatibilidade de contratos | P | Contratos existem, mas compatibilidade entre todas as versões de consumidores/provedores não provada. | Matriz produtor/consumidor N e N-1, schema versionado, depreciação e testes de compatibilidade. |
| 095 | Executar exercício completo de disaster recovery | N | Sem exercício completo atual de disaster recovery com tempo e integridade verificados. | Restaurar DB, objetos, funções, secrets e infraestrutura em ambiente isolado; medir RPO/RTO. |
| 096 | Rodar auditoria da release candidata | P | Esta revisão fornece evidências por SHA, mas candidato falha nos critérios de segurança e paridade. | Rodar auditoria integral novamente após correções, com runtime/browser e critérios pendentes. |
| 097 | Fechar P0/P1 e consolidar o registro de dívida | F | Há falha residual reproduzida, main sem proteção e drift confirmado também após merge da PR351. | Fechar bloqueadores por teste; backlog residual com dono, prazo e risco aceito explicitamente. |
| 098 | Congelar o candidato e obter aprovação de release | A | Não há candidato congelado/aprovação evidenciada; novas PRs de funcionalidades continuam abertas. | Escolher SHA imutável somente após gates e decisões; definir abort/rollback e responsáveis. |
| 099 | Fazer canary, promover e observar | N | Health do proxy não prova canary/promote/observação de toda a release. | Canary com janela e SLIs definidos; parar por erro, atraso, replay ou quebra de autorização. |
| 100 | Publicar relatório final e iniciar ciclo contínuo | P | Relatórios anteriores existem, mas 100%/10 de 10 não sustentados; esta matriz cobre as 100 etapas sem certificar o que não foi testado. | Publicar fechamento apenas após aceites; manter ciclo e evidências vivas por versão. |

## 6. Integração, publicação e planos paralelos

| Frente | O que pode ser afirmado | O que não pode ser afirmado |
|---|---|---|
| main GitHub | Baseline #350 com CI aprovada; fechamento f194c74a incorpora #351 | main protegida; DB completamente sincronizado; suíte ampla reexecutada integralmente no novo SHA |
| Proxy #346/#351 | Pinning integrado; cinco regressões corrigidas no código novo e revalidadas | Segurança exaustivamente concluída; #351 implantada na VPS/Edge |
| PR351 | MERGED no fechamento; oito testes Go e revalidação Deno do delta | Caso null resolvido; prova de publicação/runtime |
| PR349 | OPEN: taxa de resposta, detalhe de campanha, CSV/paginação segundo título | Funcionalidades disponíveis na main; revisão independente de toda PR concluída |
| PR352 | OPEN: view de campanhas agendadas launch/edit/cancel | Funcionalidade integrada/implantada e aceita |
| Banco | Guard comparou 410/410 e detectou uma divergência SQL | Schema/RLS integralmente íntegros ou vulneráveis apenas pelo ledger |
| Chat Panel carvão | Plano visual existe e tema carvão continua requisito | Fidelidade pixel a pixel, sete abas, responsividade ou todos os botões funcionando sem teste browser |
| Integrações CRM/catálogo | Existem código e contratos de outbox/CRM; 20 Deno aprovados | Secret correto, sincronização bidirecional corrente, produtos/empresas/contatos reais consistentes |
| Dependências | Upgrades e scanner de prod na CI | Todos os upgrades independentes/majors revisados e aceitos |

Links: [PR349](https://github.com/adm01-debug/Zapp_Web_V2/pull/349), [PR351](https://github.com/adm01-debug/Zapp_Web_V2/pull/351), [PR352](https://github.com/adm01-debug/Zapp_Web_V2/pull/352).

No plano de fidelidade carvão, conferir especialmente grids, sete abas, atalhos, edição de contato, anexos/downloads, estados vazios, loading/erro, keyboard/focus e contraste. Critérios propostos pelo próprio plano incluem desktop 1672×941 e mobile 390×844; nenhuma captura desta auditoria comprova esses aceites. Não trocar carvão por azul para aproximar referências.

## 7. Ordem recomendada para encerrar, sem retrabalho

1. **Fixar candidato e donos de trabalho:** evitar duas sessões alterando migrations/proxy/manifesto ao mesmo tempo. Preservar o checkout principal sujo.
2. **Restabelecer controle de merge e esclarecer drift:** leitura do banco canônico antes de decidir qualquer migration; proteção com política já acordada.
3. **Completar pacote do proxy:** preservar correções já integradas pela PR351 e corrigir o novo caso null; testar limites, redirects, SNI, DNS misto, timeout e cancelamento.
4. **Fechar entrega coordenada:** manifesto ligado ao SHA, imagem/digest da VPS, endpoint/secrets conferidos sem imprimir valores; smoke positivo autorizado e negativo por função, rollback ensaiado. Não publicar correções só em um dos lados.
5. **Scanner/credenciais/recuperabilidade:** scanner fail-closed, encerramento evidencial das rotações pendentes e runbook de backup corrigido antes de exercício de restore.
6. **Fluxos reais:** E2E autenticado multi-tenant de login, conversa, mensagem, anexo, contato/empresa, catálogo e tarefas. Isolar sandbox de WhatsApp e provedores pagos.
7. **Observabilidade e resiliência:** erro sintético por release, SLO/alerta efetivo, rate limiter entre instâncias, replay/DLQ e backup/restore completo.
8. **Desempenho/design:** budgets completos, vitals oficiais, Lighthouse, acessibilidade e comparação visual carvão.
9. **Fechamento documental:** atualizar cada etapa com testes, SHA, deployment e evidência runtime; não promover P/N a V só porque houve commit.
10. **Nova auditoria de release:** reexecutar guards e cenários após última mudança. Aceite final depende de P0/P1 fechados ou decisão explícita de risco, nunca de arredondar nota.

Cada lote deve produzir: escopo → hipótese → teste que falha → correção → teste aprovado → revisão → merge → deploy identificado → validação operacional. Esta ordem é recomendação, **não execução/autorização de mutações nesta rodada**.

## 8. Reprodução e artefatos locais

Logs:

- `/tmp/zapp-review-install.log`
- `/tmp/zapp-review-coverage.log`
- `/tmp/zapp-review-typecheck.log`
- `/tmp/zapp-review-lint.log`
- `/tmp/zapp-review-build.log`
- `/tmp/zapp-review-node-tests.log`
- `/tmp/zapp-review-db-node.log`
- `/tmp/zapp-review-deno-tests.log`
- `/tmp/zapp-review-go-regressions.log`
- `/tmp/zapp-review-deno-regressions.log`

Repros adicionados **apenas** ao worktree isolado:

- `/tmp/zapp-plan-audit-20260910/infrastructure/preview-egress-proxy/audit_regression_test.go`
- `/tmp/zapp-plan-audit-20260910/supabase/functions/_shared/__tests__/audit-egress.test.ts`

Comandos de reexecução a partir do worktree:

~~~bash
bun install --frozen-lockfile
bun run typecheck
bun run test:coverage
node scripts/ci/lint-ratchet.mjs
bun run build
node scripts/ci/bundle-budget.mjs
node --test scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs
node --test scripts/db-audit/*.test.mjs
deno test --allow-env supabase/functions/_shared/__tests__/audit-egress.test.ts
docker run --rm --network none \
  -v /tmp/zapp-plan-audit-20260910/infrastructure/preview-egress-proxy:/app:ro \
  -w /app golang:1.24-alpine go test -run TestAudit -v ./...
~~~

Os dois últimos comandos falham contra o baseline `2a42b5e1`. No checkout final `f194c74a`, Go passa e Deno mantém somente o caso null falhando. Para reproduzir o baseline novamente, selecionar o SHA antigo no worktree isolado, preservando os dois repros. Não enfraquecer os testes para aceitar o bug. Os testes não usam credenciais nem sites de produção. Paths em /tmp são temporários; preservar os repros/logs antes de limpar o ambiente.

Graphify foi consultado como apoio, mas o vocabulário disponível não trouxe correspondência relevante para plano/handoff/auditoria; nenhum veredito deriva desse grafo. Convenções locais foram inspecionadas; este relatório não altera arquitetura, código produtivo ou histórico.

## 9. Critério para afirmar conclusão

Só afirmar “todas implementadas” quando cada etapa tiver seu aceite demonstrado, os planos paralelos forem reconciliados, as PRs pretendidas estiverem integradas, os deploys apontarem para os artefatos auditados e o comportamento esperado for demonstrado no ambiente correto. Nesta data, **isso ainda não está comprovado e há falhas confirmadas que impedem tal conclusão**.

## 10. Revalidação de fechamento — f194c74a após merge da PR351

A main avançou apenas pelo merge da PR351 durante a preparação do relatório. Delta: cinco arquivos, 79 inserções/13 remoções, restritos ao proxy Go, testes, cliente secure-egress e manifesto. O frontend e a migration divergente não mudaram nesse delta. Não atribuímos ao novo SHA a execução local completa de Vitest/build do SHA anterior; reexecutamos a superfície alterada.

| Verificação no novo SHA | Resultado |
|---|---|
| Suíte Go completa, incluindo dois repros de auditoria | **8/8 PASS** |
| IP público 192.0.78.9 | PASS, bloqueio excessivo corrigido |
| Replay com timestamp futuro e nonce expirado | PASS, repetição rejeitada |
| Deno: cinco arquivos selecionados pela CI | **20/20 PASS** |
| Repros status 204, 205 e cancelamento de stream 503 | **3/3 PASS** |
| Repro JSON null | **FAIL**, TypeError em secure-egress.ts:149 |
| main.protected | **false**, reconfirmado após merge |
| DB Live Guard do novo SHA | **FAIL**, mesma migration 20260910080000 e mesmos hashes |
| Deploy-functions mais recente visível | Run 34493173022, anterior ao merge; não comprova publicação de #351 |

Novo guard: [run 34498621893](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34498621893), coleta às 15:54 UTC. Nova CI: [run 34498621814](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34498621814), ainda em andamento na primeira consulta do fechamento; não substitui o resultado do guard vivo.

Logs da revalidação: `/tmp/zapp-review-go-final.log`, `/tmp/zapp-review-deno-final.log`, `/tmp/zapp-review-deno-regressions-final.log`. Código residual: [secure-egress.ts no SHA final](https://github.com/adm01-debug/Zapp_Web_V2/blob/f194c74a2d3acec3d52a234473e8ba2300b5e68d/supabase/functions/_shared/secure-egress.ts#L149).

**Conclusão atualizada:** não há mais pendência de merge da PR351. Cinco dos seis defeitos detectados inicialmente foram encerrados no código e nos testes locais do delta. Resta JSON null, além dos demais gaps do plano e da prova de deploy/runtime. Esta distinção evita cobrar novamente uma correção integrada ou confundir integração com publicação.

## 11. Onda corretiva local — 10/09/2026

Após a revisão, a branch `fix/excellence-wave-security-db` implementou as seguintes correções ainda pendentes de revisão, CI remota e publicação controlada:

- `secure-egress.ts` valida o JSON como `unknown` antes de acessar propriedades. Os cenários `null`, array e objeto incompleto agora retornam miss (`null`) sem TypeError; os contratos Deno passam.
- O conteúdo histórico de `20260910080000` voltou ao corpo que foi aplicado e registrado no ledger. A nova `20260910100000` restringe `talkx_blacklist_update` apenas por migration forward-only. Harness PostgreSQL 17 aplica ambas duas vezes, prova o estado anterior, rejeita atualização por agente e aceita atualização por admin.
- `DB Migrate (production)` ganhou contrato runtime pré/pós para a versão `20260910100000`; o processo continua exigindo dry-run, project-ref, hash do runtime e execução explícita do workflow.
- A CI deixou de usar grep negado como scanner de segredos. Usa Gitleaks v3 fixado por SHA, sem segredo privilegiado em PR, com histórico disponível para o intervalo do evento. A ação precisa passar em uma PR real antes de ser considerada publicada.
- O budget passou a verificar o maior chunk JavaScript inclusive lazy e todos os assets sem sourcemaps. O maior atual é 508,5 KB gzip (`vendor-maps`) e o teto inicial de 700 KB é um ratchet explícito; fatiar esse fornecedor continua pendência de performance. O teto de assets tornou-se ratchet mensurável de 4.200 KB gzip, acima do baseline local de 3.945 KB gzip; o antigo teto de 2.000 KB não era executado e não possuía semântica de compressão.
- O lint ratchet exclui explicitamente `coverage/**`: relatórios de teste são artefatos gerados e não podem criar dívida fictícia entre duas execuções. A baseline foi preservada; a execução posterior reportou 0 novas ocorrências.

Validações locais da onda: guards Node (225), contratos Deno (20), typecheck, build, budget, drift estrutural local e harness PostgreSQL 17. Não houve push, merge, deploy, alteração no GitHub, acesso a segredos ou SQL canônico nesta onda.
