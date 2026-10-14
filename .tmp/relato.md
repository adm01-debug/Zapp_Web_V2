Especialista: edgar

## Sensibilidade
- O diff toca a escrita em `audit_logs` dentro de `connection-health-check` (Edge). O client `supabase` da função já é service-role no runtime; nenhuma credencial nova, nenhum grant/REVOKE alterado, nenhuma policy tocada. O insert usa o mesmo client que a função JÁ usava para `connection_health_logs`/`whatsapp_connections`.
- Nenhuma proteção afrouxada: o portão de autorização (x-cron-secret / Bearer admin / service key) não foi tocado — os testes N-162 (negado 403 com Bearer sem papel; 429 por usuário) continuam passando.
- Nenhuma referência ao banco/endpoint de produção e nenhum segredo no código ou no teste.
- Para quem chama: NADA muda. A resposta (200, `checked`/`alerts`), o corpo lido, o CAS de status e o alerta de queda são os mesmos; só passou a existir UMA linha por transição em `audit_logs`.
- Dado pessoal: o evento NÃO carrega telefone, token, QR nem payload bruto — provado por asserção no teste.

## O que mudou e por quê (problema do cartão)
- `supabase/functions/connection-health-check/index.ts`:
  - A transição AUTOMÁTICA de status (queda/reconexão detectada pela sonda) só ia para `connection_health_logs`; `audit_logs` ficava vazio e o `ConnectionAuditDialog` (CA2) — que filtra por `details.instance_id` — mostrava tela vazia.
  - Agora, quando o CAS confirma a mudança (`updated?.length`), a transição entra em `statusAuditEvents` e, ao fim do laço, vira uma linha em `audit_logs`: `entity_type: 'connection'`, `entity_id` = uuid da linha de `whatsapp_connections`, `user_id: null` (a tela mostra "Sistema"), `details = { instance_id, previous_status, status, source: 'health-check' }`.
  - `action` = `connection_connected` ou `connection_disconnected` — as MESMAS chaves que o mapa de rótulos pt-BR do diálogo conhece (`src/hooks/inbox/useConnectionAuditLogs.ts`: "Conexão pareada (QR)" / "Conexão desconectada"), então o evento aparece legível e não cai no fallback.
  - Só grava na transição CONFIRMADA pelo CAS (`dbStatus !== conn.status` + `updated.length`): duas checagens iguais da mesma queda produzem UMA linha (mesma garantia que o alerta do E26).
  - Ramo de erro: falha do insert em `audit_logs` é fail-open com `log.warn` (a transição já está gravada e devolver 500 faria parecer que a sonda falhou) — mesma regra do helper compartilhado dos cartões de conexão; o erro é logado, nunca engolido.
- `supabase/functions/connection-health-check/index.test.ts`: o fake passou a capturar `audit_logs` (`insert` → `fake.auditLogs`) e ganhou 3 testes Deno (CA2): queda grava no formato certo; reconexão grava `connection_connected`; checagem SEM transição não grava nada. Os testes existentes não foram afrouxados nem removidos.
- Números reais do commit: 4 arquivos no diff — `supabase/functions/connection-health-check/index.ts`, `supabase/functions/connection-health-check/index.test.ts` (1 arquivo de teste, 3 casos Deno novos) e 2 em `.tmp/` (`relato.md` e `verify.log`, já versionados na base; não são código de produção).

## O que CX0b/CX0b-irmãos entregaram (pedido 1 do cartão)
- Verifiquei o quadro e as branches. O helper `supabase/functions/_shared/connection-audit.ts` (`writeConnectionAuditLog`, do CX0b) NÃO existe na minha base (`dia/2026-10-13`): os cartões `t_799ee332` e `t_82d057ab` estão retidos (não integrados) e vivem na branch `v2/trilha-auditoria-conexao-2610121940d194` da cópia de referência.
- Como `ARQUIVOS QUE PODE TOCAR` é só `connection-health-check/index.ts (+ teste)`, não pude importar nem criar o helper em `_shared/`. Implementei o insert INLINE no MESMO formato do helper (`entity_type 'connection'`, uuid em `entity_id`, `instance_id` textual em `details`, `user_id`/origem, nunca número/token/QR), de propósito, para as duas linhas de trilha ficarem compatíveis quando o CX0b integrar.
- Irmão `t_b7785634` (FECHADO, `connection-health-check` passa a aceitar uma instância só e verificar em paralelo) toca o MESMO arquivo em outra branch e também não está na minha base: minha mudança está sobre a versão anterior. O integrador precisa rebase/merge — o meu insert não colide com o laço em paralelo (é por transição, dentro do mesmo ponto do CAS).

## Prova
- vermelho antes (`git stash` só do index.ts, testes novos mantidos): `deno test ... connection-health-check/index.test.ts` → `CA2: queda ... FAILED`, `CA2: reconexão ... FAILED` (2 falhas; o teste negativo segue ok, como esperado).
- verde depois: `deno test --allow-env --allow-net --allow-read supabase/functions/connection-health-check/index.test.ts` → `ok | 16 passed | 0 failed (33ms)`.
- tipo da Edge: `deno check supabase/functions/connection-health-check/index.ts` → `Check ...` sem erros.
- verificação do projeto: `zapp-verify . --rapido` → `OK tipos` (74s), `OK lint`, `OK db_guard`, `OK migrations`; `VERIFY: VERDE SEM BANCO (79s)`. (As duas primeiras tentativas caíram com `tsc` morto por OOM — máquina em load ~42 — e a mesma verificação, relançada, fechou verde; o log está em `.tmp/verify.log`.)

## O que NÃO fiz e por quê
- Não toquei o front: o rótulo "Conexão pareada (QR)" para `connection_connected` é texto do diálogo (arquivo fora do meu escopo) e a sonda só detecta reconexão, não pareamento por QR. Registro aqui como observação; não afeta o CRITÉRIO (o evento aparece).
- Não alterei nem criei o helper `_shared/connection-audit.ts` (arquivo fora do escopo deste cartão).
- Nada foi para produção; sem push/PR/deploy.
