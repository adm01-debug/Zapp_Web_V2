# Implementação dos achados da validação — 2026-09-22

## 1. Veredito

Os seis achados P2 e os dois achados P3 da auditoria anterior foram corrigidos
em branch isolada a partir de `origin/main` no SHA
`7761a5704b6745f1d0f91ab22de5f7b006f25432`. A `origin/main` permaneceu no
mesmo SHA durante a implementação; portanto, não houve rebase oculto nem
mistura com o checkout usado por outro agente.

O escopo local está aprovado pelos testes de aplicação, contratos, Deno,
PostgreSQL 17, build, budgets, lint/typecheck ratchets, scanner de secrets e
gates de banco/CI. Isto comprova a implementação na branch; não prova, por si
só, que a migration e os novos bundles já estejam ativos em produção. O
rollout só pode ser declarado concluído depois do merge protegido, migration
controlada, deploy Edge e evidência pós-deploy.

## 2. Rastreabilidade dos achados

| Achado | Correção | Prova principal | Estado local |
| --- | --- | --- | --- |
| P2-01 — bypasses no guard Realtime | AST diferencia ausência/dinamismo, rejeita spread, resolve aliases/import namespace/bracket/bind e restringe a exceção ao wrapper canônico | 10 testes do guard e scan das 19 tabelas assinadas | Resolvido |
| P2-02 — segunda chamada legítima descartada | dedupe curto usa somente `event_id` do provedor; UUID da notificação continua deduplicando replay exato | duas chamadas sem ID são entregues; IDs iguais são deduplicados | Resolvido |
| P2-03 — lookup antigo sobrescreve chamada nova | geração monotônica, flag de lifecycle e estado vinculado ao usuário autenticado | promises controladas provam ordenação e cleanup | Resolvido |
| P2-04 — webhook confirma write falho | RPC transacional `record_incoming_call_event`; qualquer erro de contato/RPC é propagado | falha sintética causa rollback e rejeição do handler | Resolvido |
| P2-05 — preferência lida do chamador | settings pertencem ao destinatário; chamador é fallback apenas sem responsável | contrato de principal e handler atualizado | Resolvido |
| P2-06 — notificação/auditoria não atômicas | RPC `persist_sentiment_alert` grava os dois efeitos na mesma transação, repara estado parcial legado e é idempotente | falha intermediária, retry e reparo em PG17 | Resolvido |
| P3-01 — TTL/capacidade do dedupe | `expiresAt` individual e limite de 2.000 entradas fail-closed, sem expulsar identidade viva | TTL misto, mais de 250 IDs e overflow | Resolvido |
| P3-02 — propriedades herdadas em status | `Map` substitui objeto indexável por string | `__proto__` e `constructor` retornam fallback válido | Resolvido |

## 3. Banco de dados

A migration forward-only
`20260922220000_atomic_call_and_sentiment_notifications.sql` acrescenta:

1. `calls.provider_event_id`, limitado a 1–200 caracteres quando presente;
2. índice único parcial por conexão e evento do provedor;
3. `record_incoming_call_event`, que persiste ciclo de chamada e notificação
   dirigida de forma atômica e idempotente;
4. `persist_sentiment_alert`, que persiste auditoria e notificação de forma
   atômica, detecta conflito de identidade e repara o estado parcial legado;
5. `SECURITY DEFINER` com `search_path = public, pg_temp`;
6. `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`, concedido apenas
   a `service_role`.

O harness PostgreSQL 17 prova estado pré e pós-migration, ACLs, chamada sem ID,
retry com ID estável, rollback se a notificação falhar, idempotência de
sentimento, reparo legado e rollback da auditoria quando o efeito seguinte
falha. O teste foi incorporado ao `DB Guard (offline)`.

O workflow `DB Migrate (production)` recebeu contrato explícito para a nova
versão. O dry-run mede estado estrutural e gera um hash; o apply exige o mesmo
hash para fechar a janela TOCTOU. O pós-flight confirma coluna, constraint,
índice, assinaturas, owner, `search_path` e ACL das RPCs. A versão não pode ser
aplicada pelo workflow se o estado divergir do pré ou pós-estado permitido.

## 4. Edge Functions e frontend

- `evolution-webhook` usa exclusivamente a RPC atômica para histórico e alerta
  de chamada; erros não são convertidos em HTTP 200 silencioso.
- `sentiment-alert` mantém a prova de autorização RLS antes do cliente de
  serviço, resolve responsável/contato canônicos, usa preferências do
  destinatário e chama a RPC atômica. Retry duplicado não reenvia e-mail.
- O handler de sentimento passou a ser exportável e ganhou testes executáveis
  de método, autenticação antes do parsing e CORS antes de autenticação.
- O hook de chamadas impede commit tardio após uma entrega nova, troca de
  identidade ou cleanup.
- Os tipos Supabase incluem a nova coluna e as duas RPCs.
- O lock Deno e o manifesto Edge foram regenerados deterministicamente.

## 5. Matriz final local

| Camada | Resultado |
| --- | --- |
| Vitest com coverage | 241 arquivos; 3.183 passed; 35 todo; 0 failed |
| Cobertura | 43,13% statements; 40,26% branches; 50,71% functions; 44,51% lines |
| Contratos | 7 arquivos; 197 passed; 0 failed |
| Edge Deno congelado | 27 passed; 0 failed |
| CI/Edge/DB Node | 355 passed; 0 failed |
| PostgreSQL 17 | 26 fases do `db-guard`, todas aprovadas |
| Harness de atomicidade | pré/pós-estado, ACL, retry, rollback e reparo aprovados |
| Realtime | 10 testes adversariais; 19 tabelas atuais válidas |
| Lint ratchet | baseline 1.107; atual 1.101; novas 0 |
| Typecheck ratchet | baseline 0; atual 0 |
| Implicit any | 0 |
| Supabase usage guard | 144 tabelas, 8 views, 92 funções; 0 violações |
| Migrations | 448 arquivos válidos; comparação remota reservada ao Live Guard |
| Build | aprovado em 4,71 s |
| Bundle | inicial 325,5/340 KB; maior 486/550 KB; total 3.964/4.000 KB |
| Manifesto Edge | 67 funções, 92 fontes, digest `a8948ca5b407b5189623766ba9e4fe8cfd2c6ad2b904c953f29a0292ce7cf374` |
| Segurança do diff | Gitleaks: 0 findings |
| Workflows | 11 arquivos com Actions fixadas por SHA; fronteira de secrets aprovada |
| Whitespace | `git diff --check`: aprovado |

Os avisos `HTMLCanvasElement` são limitações conhecidas do jsdom e não
produziram falhas. O proxy Go não pôde ser repetido localmente porque o binário
`go` não está instalado; esse item não foi marcado como aprovado localmente.
Nenhuma dependência Go foi alterada por esta correção.

## 6. Simulações adversariais relevantes

1. schema/tabela/evento dinâmicos e spreads não comprováveis falham fechado;
2. alias importado, namespace, acesso por colchetes e `.bind` são detectados;
3. função local homônima não é confundida com o wrapper oficial;
4. duas chamadas legítimas do mesmo contato sem ID não colapsam;
5. replay com o mesmo ID do provedor não duplica chamada/notificação;
6. lookup legado atrasado não substitui alerta mais novo;
7. callback resolvido após unmount não grava estado;
8. falha da notificação reverte a chamada;
9. falha da notificação de sentimento reverte a auditoria;
10. retry repara notificação legada sem audit e não duplica efeitos;
11. conflito de identidade em UUID determinístico falha fechado;
12. `anon` e `authenticated` não executam as RPCs internas;
13. segunda chamada sem ID cria registros distintos;
14. floods do dedupe não expulsam uma identidade ainda viva nem crescem sem
    limite.
15. preferências do supervisor não impedem a avaliação canônica do
    destinatário e a resposta HTTP não exibe o alerta no navegador errado;
16. `offer/ringing` atrasado não regride chamada `answered` ou terminal e não
    recria uma notificação após o encerramento.

## 7. Rollout obrigatório

1. publicar a branch e abrir PR sem bypass de proteção;
2. exigir CI, DB Guard, CodeQL/Security Audit, build e revisão humana verdes;
3. integrar a PR na `main` e confirmar o SHA resultante;
4. executar `DB Migrate (production)` em dry-run para a versão
   `20260922220000`, projeto `tnnnlkbymytvtqngbbqh`;
5. revisar o hash estrutural e repetir com `apply=true` e o mesmo hash;
6. exigir ledger, pós-flight estrutural e paridade integral verdes;
7. executar `Deploy Edge Functions` para `evolution-webhook` e
   `sentiment-alert` no SHA integrado;
8. exigir inventário pós-deploy, attestation estável e smokes negativos;
9. confirmar o SHA da Vercel e rodar DB Live Guard;
10. executar E2E controlado com dados sintéticos autorizados para uma chamada
    e um alerta de sentimento, sem cliente real.

Rollback de frontend/Edge é feito por reimplantação do bundle anterior. A
migration é forward-only; em incidente, desativar os consumidores novos e
preservar os objetos até uma migration corretiva, sem apagar histórico.

## 8. Limites honestos

- Nenhuma migration ou Edge Function foi aplicada diretamente ao banco
  canônico durante os testes locais.
- Não houve chamada WhatsApp real, e-mail real ou mutação de contato de cliente.
- O total de assets permanece com margem estreita de aproximadamente 36 KB.
- Os 35 `todo` históricos não foram renomeados ou removidos para fabricar uma
  taxa melhor.
- Coverage global de 43,13% não equivale a cobertura integral, embora os fluxos
  corrigidos possuam testes focados e simulações de falha.
- Equivalência binária fonte/bundle remoto e restauração de backup continuam
  dependendo das respectivas provas operacionais.

Conclusão local: os oito defeitos reproduzidos foram corrigidos e os controles
preventivos foram incorporados. Conclusão de produção permanece condicionada
ao rollout protegido e às evidências remotas listadas acima.
