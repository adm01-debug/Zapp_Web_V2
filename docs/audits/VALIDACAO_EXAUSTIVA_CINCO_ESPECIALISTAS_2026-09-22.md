# Validação exaustiva das correções recentes — 2026-09-22

> **Atualização corretiva:** os oito achados P2/P3 deste relatório foram
> tratados na branch `audit/codex-five-specialists-20260922`. A implementação,
> os ensaios adversariais e os limites de rollout estão documentados em
> [IMPLEMENTACAO_ACHADOS_CINCO_ESPECIALISTAS_2026-09-22.md](./IMPLEMENTACAO_ACHADOS_CINCO_ESPECIALISTAS_2026-09-22.md).
> Este documento permanece como registro do estado anterior às correções.

## 1. Veredito executivo

Base auditada: `origin/main` no commit `7761a5704b6745f1d0f91ab22de5f7b006f25432`, correspondente ao merge da PR #520.

Não foram encontrados achados críticos ou de severidade alta. Os gates oficiais, a suíte integral de testes, a matriz PostgreSQL 17, o build e os artefatos de entrega examinados passaram. A auditoria adversarial, porém, reproduziu seis achados de severidade média, dois de severidade baixa e lacunas de cobertura/atestação. Portanto, o estado é funcional e implantado, mas não pode ser classificado como “10/10” nem como prova integral de correção em produção.

Resumo:

| Classe | Quantidade | Resultado |
| --- | ---: | --- |
| Crítico/alto | 0 | Nenhum reproduzido |
| Médio (P2) | 6 | Correção recomendada antes de declarar excelência |
| Baixo (P3) | 2 | Hardening e precisão contratual |
| Gates automatizados | 13/13 | Aprovados |
| Vitest completo | 3.174 passed, 35 todo | Zero falhas |
| Contratos | 195 passed | Zero falhas |
| Deno Edge | 24 passed | Zero falhas |
| Node CI/Edge/DB | 348 passed | Zero falhas |
| PostgreSQL 17 descartável | Matriz integral | Aprovada |
| Cobertura Vitest | 42,94% statements | Insuficiente como prova isolada |

Nenhuma mutação foi feita em produção, no banco canônico ou em dados de clientes durante esta auditoria.

## 2. Coordenação dos cinco especialistas

Foram coordenados cinco escopos independentes:

1. frontend e Realtime;
2. Edge Functions e segurança;
3. banco de dados e migrações;
4. CI/CD, GitHub, Vercel e evidências de deploy;
5. QA adversarial e simulações de falha.

O agente de QA adversarial concluiu e entregou fixtures reproduzíveis. Os outros quatro agentes foram interrompidos por limite externo de uso da plataforma. Para não reduzir a cobertura, o agente principal executou diretamente os quatro escopos interrompidos. Assim, houve coordenação de cinco especialidades, mas não cinco pareceres independentes concluídos; esta distinção é importante para a integridade do relatório.

Todo o trabalho ocorreu no worktree isolado `/tmp/zapp-codex-five-specialists-20260922`, branch `audit/codex-five-specialists-20260922`. O checkout utilizado por outros agentes não foi alterado.

## 3. Escopo das correções examinadas

Foram inspecionadas as correções e entregas recentes associadas às seguintes PRs/commits:

| Entrega | Commit de merge | Escopo principal |
| --- | --- | --- |
| PR #497 | `23d0e295` | Paridade, atestação Edge, runtime e workflows |
| PR #509 | `0933e01b` | Transporte `libpq` |
| PR #515 | `54e7aa00` | Documentação e validação operacional |
| PR #516 | `0a8e1dea` | Polling/refresh dos painéis operacionais |
| PR #520 | `7761a570` | Roteamento de notificações, chamadas e sentimento |

Também foram verificados o estado atual da `main`, o deployment Vercel, três deployments selecionados de Edge Functions e o artefato mais recente do DB Live Guard.

## 4. Matriz de validação executada

### 4.1 Frontend, contratos e cobertura

| Ensaio | Resultado |
| --- | --- |
| Hooks de chamada e sentimento + dedupe | 31 testes aprovados em 4 arquivos |
| Contratos de chamadas, eventos e sentimento | 28 testes aprovados em 3 arquivos |
| Suíte Vitest completa com coverage | 3.174 passed, 35 todo, 0 failed, 241 arquivos |
| Coverage statements | 42,94% |
| Coverage branches | 40,02% |
| Coverage functions | 50,71% |
| Coverage lines | 44,37% |

Warnings conhecidos de navegação/canvas do `jsdom` apareceram sem falhar testes. Eles não foram tratados como defeitos de runtime do navegador.

### 4.2 Edge Functions e contratos

| Ensaio | Resultado |
| --- | --- |
| Suíte Deno usada pela CI | 24 passed, 0 failed |
| Suíte Node de CI/Edge/DB | 348 passed, 0 failed |
| Todos os contratos Vitest | 195 passed, 0 failed |
| Manifesto de Edge Functions | 67 funções inventariadas, digest válido |
| Smoke dos deployments selecionados | 67/67 por execução, 7 amostras estáveis |

Digest observado do manifesto: `2b0b8a386982e9ec5ade7b4e05e616cfde68c75412c25ccf79f1ea2f3159a69b`.

### 4.3 Qualidade, segurança estática e build

| Gate | Resultado |
| --- | --- |
| Workflow pins | 11 workflows aprovados |
| Fronteira de secrets privilegiados | Aprovada |
| Lint ratchet | baseline 1.107; atual 1.101; novas 0 |
| TypeScript | baseline 0; atual 0 |
| `implicit any` | 0 |
| Supabase usage guard | 144 tabelas, 8 views, 92 funções; 0 violações |
| Gitleaks no range da PR | 0 findings |
| Build de produção | Aprovado em 9,42 s |
| Dependências de produção | Nenhum advisory high/critical alcançável |

Budgets do build:

| Medida | Observado | Limite |
| --- | ---: | ---: |
| JS inicial gzip | 325,5 KB | 340 KB |
| CSS gzip | 35,7 KB | 80 KB |
| Maior chunk gzip | 486 KB | 550 KB |
| Total | 3.964 KB | 4.000 KB |

O total dispõe de apenas aproximadamente 36 KB de margem. O chunk `vendor-maps` tem cerca de 1,827 MB sem compressão. O gate passa, mas a folga é pequena e merece acompanhamento.

### 4.4 Banco de dados PostgreSQL 17

A matriz foi executada contra PostgreSQL 17 descartável com transporte real, SCRAM e arquivos de senha, sem tocar produção. Passaram:

- catálogo e manifesto;
- geração de tipos;
- 447 migrations válidas no gate local;
- ACL do MCP, 28 cenários;
- ACL de falhas de webhook, 13 cenários;
- API pública desabilitada;
- CRM outbox;
- autorização e IDOR da Inbox;
- histórico de templates TalkX em múltiplos estados anteriores;
- políticas `saved_by` com `NO ACTION`, `SET NULL` e órfãos;
- blacklist forward-only;
- destinatários de rascunho e persistência de drafts;
- leases de entrega;
- snapshot de mensagem;
- estados e concorrência de campanhas;
- entrega de mensagens fase 1, incluindo autorização, rollback e concorrência;
- reconciliação de ledger em 10 cenários;
- runtime config;
- transporte `psql`, TLS, paridade tripla e drift.

O teste offline de paridade tripla reportou corretamente `PARTIAL 1/3`, e `--require-live` falhou corretamente sem `DESTINO_URL`. Isto comprova que o gate não fabrica sucesso quando a fonte remota não está disponível.

### 4.5 GitHub, Vercel e produção observável

- `main` e o merge da PR #520 convergem no SHA completo `7761a5704b6745f1d0f91ab22de5f7b006f25432`.
- O `/version.json` da produção Vercel apresentou o mesmo SHA.
- A página de produção `?view=inbox` respondeu HTTP 200.
- CI, CodeQL, DB offline/live, type sync e Vercel estavam verdes para a revisão examinada.
- Deployments selecionados:
  - `elevenlabs-webhook`: versão remota 128, ativa;
  - `evolution-webhook`: versão remota 158, ativa;
  - `sentiment-alert`: versão remota 101, ativa.

Execuções auditadas:

- ElevenLabs: <https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35783144650>
- Evolution: <https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35783501186>
- Sentiment: <https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35783764337>
- DB Live Guard: <https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35784128896>

## 5. Achados médios confirmados

### P2-01 — Gate AST de Realtime aceita regressões como aprovadas

Origem: novo na PR #520. Impacto: prevenção de regressão futura.

O gate em `scripts/db-audit/check-realtime-subscriptions.mjs` passou seus quatro testes oficiais, mas fixtures adversariais reproduziram dez falsos positivos de aprovação e um falso bloqueio. Entre os bypasses estão schema dinâmico tratado como `public`, spreads que sobrescrevem table/schema, evento por alias, acesso `['on']`, `.on.bind`, aliases/import namespace do wrapper e exceção por basename. Uma função local sem relação chamada `useSupabaseRealtime` gera falso bloqueio.

Os usos atuais inspecionados utilizam literais válidos; não foi encontrada subscription de produção apontando para tabela indevida. O defeito está na garantia do gate, não no catálogo atualmente observado.

Recomendação: resolver símbolos/imports/aliases ou restringir formalmente a sintaxe aceita; diferenciar propriedade ausente de dinâmica; respeitar ordem e spreads; vincular a exceção ao caminho e símbolo canônicos; promover todas as fixtures adversariais a testes oficiais.

### P2-02 — Segunda chamada legítima pode ser descartada por 35 segundos

Origem: novo na PR #520. Impacto: perda funcional de alerta.

Sem `metadata.event_id`, `useIncomingCallListener` usa apenas `contact_id + whatsapp_connection_id` como identidade. A simulação recebeu uma chamada, descartou o alerta e recebeu outra notificação distinta do mesmo contato/conexão dentro de 35 segundos. A segunda chamada foi suprimida.

Recomendação: exigir/propagar identidade estável do ciclo de chamada ou usar uma composição que diferencie novas chamadas sem transformar retry em alerta duplicado. Adicionar teste com duas notificações legítimas e UUIDs distintos sem ID do provedor.

### P2-03 — Fallback assíncrono pode sobrescrever chamada nova e sobreviver ao cleanup

Origem: dívida preexistente preservada. Impacto: ordenação e isolamento entre sessões.

Dois cenários foram reproduzidos com o corpo real do hook e dependências simuladas:

1. lookup legado da chamada antiga termina depois de uma chamada nova e sobrescreve o estado novo;
2. callback assíncrono termina depois de `removeChannel` e ainda faz `setIncomingCall`.

Recomendação: usar geração/flag de cancelamento por efeito, comparar sequência/tempo antes do commit e zerar estado/dedupe na troca de usuário. Cobrir rerender de identidade com promises controladas.

### P2-04 — Webhook confirma sucesso mesmo se persistência de chamada/notificação falhar

Origem: cegueira de erro preexistente, agora relevante ao novo canal de notificação. Impacto: perda silenciosa de histórico ou alerta.

`handleCallEvent` não verifica o `error` de `calls.insert(...).maybeSingle()` nem o retorno de `notifications.insert(...)`. Simulações do handler provaram:

- falha da gravação em `calls`: a notificação ainda é tentada e o handler resolve;
- falha da gravação em `notifications`: o handler resolve sem lançar erro.

Como o endpoint retorna `{ success: true }` após o handler, o produtor recebe HTTP 200 e pode não repetir o evento.

Recomendação: falhar explicitamente ou persistir por RPC/transação idempotente; impedir notificação sem histórico; registrar métricas/failure queue; testar erros em cada write e retry com a mesma identidade.

### P2-05 — Preferência de sentimento é lida do chamador, mas o destinatário é outro agente

Origem: comportamento atual da correção de segurança. Impacto: preferências do destinatário podem ser ignoradas.

A autorização RLS permite que o agente atribuído e administradores/supervisores vejam a análise. A Edge Function lê `user_settings` de `auth.userId`, mas direciona a notificação/e-mail ao usuário do perfil atribuído ao contato. Assim, um administrador/supervisor pode disparar para outro agente usando o threshold e o estado habilitado do próprio chamador, mesmo se o destinatário desativou alertas.

Recomendação: definir formalmente o principal da preferência. Se a preferência pertence ao destinatário, carregar settings do `agentProfile.user_id` com service role após a prova de autorização; se administradores devem forçar alerta, tornar isso explícito, auditável e separado.

### P2-06 — Notificação e auditoria de sentimento não são atômicas/recuperáveis

Origem: comportamento atual. Impacto: trilha de auditoria incompleta.

A notificação é inserida antes de `audit_logs`. Se a auditoria falha com erro diferente de `23505`, a função apenas registra warning, envia e-mail e responde sucesso. Em retry, o UUID determinístico da notificação pode gerar `23505` e provocar retorno antecipado antes de reparar o `audit_logs` ausente.

Recomendação: RPC transacional para claim, notificação e auditoria; ou state machine/outbox com recuperação explícita. Criar testes executáveis para falha após cada side effect, retry e concorrência.

## 6. Achados baixos confirmados

### P3-01 — Helper de dedupe não garante TTL individual nem “uma vez por runtime”

Origem: novo na PR #520.

Após 251 identidades, a primeira pode ser aceita novamente dentro de 2 ms, apesar do TTL de 120 s. Além disso, uma chamada com TTL curto pode remover uma entrada criada com TTL longo, pois o TTL do chamador corrente governa a limpeza de todas as entradas. Os consumidores atuais usam o TTL default; a interferência entre TTLs é latente.

Recomendação: armazenar `expiresAt` por entrada e documentar capacidade/eviction; isolar namespace por usuário e tipo quando aplicável.

### P3-02 — Status de chamada consulta propriedades herdadas do protótipo

Origem: preexistente e preservado na extração do helper.

`normalizeEvolutionCallStatus('__proto__')` retorna um objeto e `normalizeEvolutionCallStatus('constructor')` retorna uma função, violando o tipo declarado e podendo causar rejeição do `CHECK` do banco.

Recomendação: usar `Map`, objeto criado com `Object.create(null)` ou `Object.hasOwn`; adicionar casos adversariais ao contrato.

## 7. Lacunas de cobertura e de prova operacional

1. Os cinco testes de `sentiment-alert-security` verificam substrings e ordem no fonte; não executam handler, RLS, concorrência, falha intermediária ou recuperação.
2. O artefato de Edge declara corretamente `source_to_bundle_equivalence_proven=false`. O deployment foi observado como ativo, mas a atestação não prova equivalência byte a byte entre fonte e bundle remoto.
3. O smoke genérico cobre OPTIONS/CORS/JWT. Não prova todos os POSTs públicos nem caminhos positivos autenticados de negócio para cada função.
4. O DB Live Guard está verde, mas o próprio artefato reporta `PARTIAL`: autovacuum e Realtime `VERIFIED`; cron e storage `COUNTS_ONLY`; ledger `METADATA_ONLY_NO_HISTORICAL_CONTENT_PROOF`; backups `NOT_VERIFIED_RESTORE_REQUIRED`.
5. O binário `go` não estava instalado no ambiente local; o contrato do proxy Go não pôde ser repetido localmente. A execução oficial da CI correspondente estava aprovada.
6. Não houve E2E autenticado contra dados reais nem teste de restauração de backup, por segurança e ausência de autorização para mutar produção.

Esses itens não significam falha conhecida de produção, mas impedem transformar sinais verdes em uma afirmação de cobertura integral.

## 8. Áreas aprovadas sem regressão reproduzida

- Negociação e validação versionada de webhooks: 10/10 cenários oficiais aprovados.
- Polling operacional da PR #516: testes focados aprovados; nenhuma regressão confirmada.
- Transporte PostgreSQL/libpq: matriz em PG17 aprovada.
- Migrações, ACLs, IDOR, campanha, concorrência e reconciliação: matriz descartável aprovada.
- Build, typecheck, lint ratchet, pins, usage guard, gitleaks e dependências: aprovados.
- SHA de `main`, versão servida pela Vercel e revisão auditada: convergentes.
- Deployments Edge selecionados: ativos e com smokes verdes.

## 9. Priorização recomendada

Ordem sugerida para a próxima rodada de implementação:

1. tornar writes do webhook de chamada observáveis, idempotentes e transacionais;
2. corrigir identidade/dedupe e cancelamento do hook de chamada;
3. definir o principal das preferências de sentimento e atomicidade de seus side effects;
4. endurecer o analisador AST de Realtime com os 14 casos adversariais;
5. corrigir `notificationDedupe` e o mapa de status;
6. converter o contrato textual de sentimento em testes executáveis do handler;
7. ampliar smoke autenticado/positivo e prova de equivalência de deployment;
8. executar restauração periódica de backup e promover cobertura live além de `COUNTS_ONLY`.

Após as correções, repetir integralmente a matriz desta auditoria e exigir que cada reprodução adversarial passe com o comportamento correto, não apenas que o processo termine com exit code zero.

## 10. Conclusão

As correções recentes estão integradas à `main`, a Vercel serve o mesmo commit e as três Edge Functions selecionadas estão ativas. O banco e as migrations demonstraram boa robustez na matriz PostgreSQL 17, e todos os gates existentes passaram. Entretanto, os oito defeitos reproduzidos e as limitações explícitas de evidência mostram que o sistema ainda não atingiu uma condição tecnicamente defensável de perfeição.

Veredito: **aprovado com ressalvas, correções P2 pendentes**. Não há motivo para rollback global com base nesta auditoria, mas os itens P2-02, P2-03 e P2-04 devem ser priorizados por poderem ocultar chamadas reais ou perda de persistência; P2-05 e P2-06 devem ser tratados antes de considerar o fluxo de sentimento plenamente correto.
