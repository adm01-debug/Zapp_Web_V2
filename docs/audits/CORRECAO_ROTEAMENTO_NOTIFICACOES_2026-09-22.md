# Correção de roteamento Realtime e alertas — 2026-09-22

## 1. Veredito

Os alertas globais de sentimento e de chamadas recebidas estavam ligados a
tabelas que **não pertencem** à publicação `supabase_realtime` do banco
canônico. O código aguardava eventos de `audit_logs` e `calls`; o runtime
oficial publica `notifications`, mas não publica essas duas tabelas. A falha
era, portanto, determinística: os registros podiam existir no banco sem que o
frontend recebesse o evento.

A correção usa `public.notifications`, já publicada, protegida por RLS e
filtrada por `user_id = auth.uid()`. Nenhuma tabela, policy ou migration nova é
necessária para o fluxo funcional. Além do reparo, a CI passa a impedir que uma
subscription seja criada para uma tabela fora da publicação revisada.

## 2. Evidência do banco canônico

- Projeto: `tnnnlkbymytvtqngbbqh`.
- PostgreSQL: major 17.
- Coleta: workflow DB Live Guard, somente leitura, após o merge
  `0a8e1dea21945c1b5e6322a2c7db9bb83932d1c8`.
- Publicação `supabase_realtime`: presente, com 20 tabelas.
- `public.notifications`: publicada.
- `public.audit_logs`, `public.calls`, `public.rate_limit_logs` e
  `public.connection_health_logs`: não publicadas.
- `notifications`: RLS habilitado; leitura/alteração do usuário restrita à
  própria identidade e inserção autenticada comum bloqueada no runtime
  canônico. As Edge Functions escrevem com o papel de serviço.

O baseline exato das 20 tabelas fica versionado em
`scripts/db-audit/realtime-publication-baseline.json`. O Live Guard compara o
conjunto remoto completo com esse arquivo; ausência, expansão não revisada,
duplicata ou publicação inexistente falham a esteira.

## 3. Mudanças funcionais

### 3.1 Sentimento

1. `sentiment-alert` continua registrando o evento histórico em `audit_logs`.
2. Quando existe agente atribuído, a função cria também uma notificação
   direcionada ao `profiles.user_id`.
3. Antes de usar `service_role`, a Edge Function autentica o chamador e prova,
   via RLS, que ele enxerga exatamente o par `analysisId`/`contactId`.
4. Score, limiar, quantidade consecutiva, nome, telefone e agente são lidos de
   fontes canônicas; valores equivalentes enviados pelo cliente não autorizam
   nem fabricam um alerta.
5. IDs estáveis no banco e detecção do histórico tornam o processamento
   idempotente por `analysisId`, impedindo repetição de notificação e e-mail.
6. Nome inserido no HTML do e-mail é escapado e quebras de linha são removidas
   do assunto.
7. O provider global assina somente `notifications`, filtrada pelo usuário
   autenticado, e aceita apenas `type = sentiment_alert`.
8. A identidade estável `analysis_id` elimina a corrida entre a resposta HTTP
   do alerta local e o evento Realtime. O primeiro consumidor exibe; o segundo
   é descartado no mesmo runtime do navegador.
9. Logs do browser registram apenas o ID da notificação, sem payload, nome ou
   telefone do contato.

### 3.2 Chamadas recebidas

1. O webhook Evolution continua persistindo o histórico em `calls`.
2. Apenas os estados brutos `offer` e `ringing` criam uma notificação
   `incoming_call`; estados terminais são persistidos, mas não acionam toque.
3. O alerta é dirigido ao `user_id` do agente atribuído e inclui metadados
   mínimos para renderização. Registros antigos sem nome continuam suportados
   por consulta de fallback ao contato.
4. `isVideo` é normalizado explicitamente: somente `true` e a string `"true"`
   significam vídeo. A string `"false"` não pode mais virar vídeo por coerção
   booleana do JavaScript.
5. Replay do mesmo ID e repetição curta do mesmo evento de chamada são
   deduplicados no cliente.

### 3.3 Contrato e deploy de Edge Functions

O helper `parseVersioned` foi separado em ramos V1/V2 tipados. A alteração
remove um erro real do `deno check` sem mudar a seleção de versão nem
enfraquecer a validação. Como esse helper é compartilhado, o manifesto aponta
mudança de bundle em exatamente três funções:

- `evolution-webhook`;
- `sentiment-alert`;
- `elevenlabs-webhook`.

Manifesto determinístico: 67 funções, 92 fontes, digest
`2b0b8a386982e9ec5ade7b4e05e616cfde68c75412c25ccf79f1ea2f3159a69b`.

## 4. Prevenção de recorrência

O novo `check-realtime-subscriptions.mjs` usa a AST do TypeScript, não grep,
para localizar:

- chamadas diretas `.on('postgres_changes', ...)`;
- usos do wrapper `useSupabaseRealtime({...})`;
- tabelas e schemas literais;
- bindings dinâmicos não comprováveis, que falham fechados.

Resultado atual: 19 tabelas assinadas pelo frontend, todas contidas nas 20
tabelas do baseline canônico. O wrapper central é a única assinatura dinâmica
permitida, pois seus call sites literais são avaliados pelo mesmo gate.

## 5. Matriz de simulação e validação

| Camada | Cenários / resultado |
| --- | --- |
| Regressão frontend | 241 arquivos; 3.174 testes aprovados; 35 `todo`; zero falha |
| Contratos | 7 arquivos; 195 testes aprovados; inclui fluxo de chamada e segurança/IDOR do sentimento |
| Edge executável Deno | 24 testes aprovados com config e lock congelados da CI |
| DB units | 227 testes Node aprovados |
| PostgreSQL 17 | runtime audit em container descartável aprovado |
| Transporte DB | libpq/pgpass/TLS com cliente e servidor reais aprovado |
| Realtime negativo | tabela ausente, extra, duplicada e publicação ausente falham fechado |
| Chamada tocando | `offer/ringing` persiste `ringing` e cria alerta direcionado |
| Chamada terminal | `answered/terminate/reject/timeout/busy/failed` persiste sem alerta |
| Vídeo ambíguo | boolean/string `true` aceitos; `false`, `"false"`, `"0"`, número e nulos rejeitados |
| Dedupe sentimento | corrida HTTP × Realtime exibe um único alerta por `analysis_id` |
| Segurança sentimento | método, autenticação antes do body, prova RLS, valores canônicos, análise atual e escape de HTML |
| TypeScript | `tsc -b --force` aprovado |
| Lint ratchet | baseline 1.107; atual 1.101; removidas 6; novas 0 |
| Uso Supabase | 144 tabelas, 8 views, 92 funções; zero violação |
| Build | Vite aprovado |
| Bundle | inicial JS 325,5/340 KB; CSS 35,7/80 KB; maior 486/550 KB; total 3.962,7/4.000 KB |
| Manifesto Edge | geração/check determinísticos e 28 testes aprovados |
| Whitespace | `git diff --check` aprovado |

Os avisos do jsdom sobre navegação/canvas são limitações conhecidas do ambiente
de teste e não produziram falhas. O budget total permanece aprovado, porém com
margem estreita de aproximadamente 37,3 KB; novas dependências no carregamento
inicial devem ser evitadas.

## 6. Rollout seguro

1. Integrar a PR somente após os checks obrigatórios e a revisão externa.
2. Confirmar que o SHA da `main` está publicado no `version.json` da Vercel.
3. Executar o workflow protegido `Deploy Edge Functions`, na `main`, de forma
   sequencial para `elevenlabs-webhook`, `evolution-webhook` e
   `sentiment-alert`.
4. Exigir attestation estável, inventário sem drift e smoke seguro de cada
   execução. Webhooks públicos não recebem POST sintético do smoke genérico.
5. Reexecutar DB Live Guard e confirmar o baseline Realtime de 20 tabelas.
6. Fazer E2E autenticado somente com usuário/dados sintéticos previamente
   autorizados: um alerta de sentimento direcionado e uma chamada controlada.
   Não usar contato, campanha ou mensagem real como teste.

Rollback: reimplantar os bundles anteriores das três funções e reverter o
commit do frontend. Não há rollback de schema, pois esta correção não cria nem
altera objetos SQL.

## 7. Limites honestos e pendências residuais

- O teste automatizado não realiza chamada WhatsApp real nem dispara mensagem
  para cliente; isso exigiria efeito externo e dados sintéticos autorizados.
- A deduplicação de replay do webhook é garantida no runtime do cliente, não
  por índice idempotente no servidor. Um retry tardio do provedor pode criar
  outra linha de notificação. Uma chave idempotente persistente exige desenho
  de schema/índice e rollout forward-only separado.
- Notificação de browser em segundo plano depende das capacidades/permissões do
  navegador; não substitui push service.
- `backups` continua `NOT_VERIFIED_RESTORE_REQUIRED`; prova de restauração é um
  exercício operacional separado.
- Cron e Storage continuam com cobertura agregada, não paridade integral de
  configuração.
- O build está dentro do budget, mas o total de assets está próximo do limite.

Esses limites impedem declarar “perfeição” absoluta. O escopo desta correção,
entretanto, fica coberto por código, contratos, PostgreSQL descartável,
inventário canônico somente leitura e gates preventivos de CI.
