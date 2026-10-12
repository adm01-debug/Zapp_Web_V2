Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca INSERT em `audit_logs` por client service-role e o gate `requireAdminOnly` do
  `delete-instance` (este herdado do CX0 via cherry-pick, seção abaixo). Nenhuma proteção foi
  afrouxada: a matriz de autorização continua idêntica (create-connection/connect/disconnect seguem
  exigindo admin/supervisor).
- Nada de número, token ou QR vai para a trilha — há asserção negativa no JSON gravado.
- Nenhuma referência a banco/endpoint de produção.
- Para quem chama: as respostas de `create-connection`/`connect`/`disconnect` não mudam;
  `delete-instance` deixa de devolver 500 quando o que falha é só a auditoria (ver "Ramo de erro").

## Linha herdada (por que o diff é maior que o título)
- O cartão manda reaproveitar o mesmo helper de auditoria do CX0 e traz a linha do pai. Cherry-pick,
  já commitados antes do meu commit: `2200003d6` (pai t_890bceea: agenda/conversas/mídia + leitura de
  instância) e `f601930f0` (CX0: exclusão admin-only, com migration + `scripts/db-audit/...test.sh`).
  Eles não são meus nem foram reescritos; segui com eles intactos.

## O que mudou e por quê
- `supabase/functions/_shared/connection-audit.ts` (novo): `writeConnectionAuditLog` grava UMA linha em
  `audit_logs` (user_id, action, entity_type='connection', entity_id, details, ip_address, user_agent)
  e NUNCA lança — falha é só logada. É o formato único das ações de conexão.
- `supabase/functions/evolution-api/index.ts`:
  - create-connection → `connection_created` (entity_id = id da conexão; details: instance_id/name/flavor);
  - connect → `connection_connect` (no máximo 1 por invocação, via `auditConnectOnce`, pois o fluxo tem
    vários retornos de sucesso);
  - disconnect → `connection_disconnect`;
  - recriação de sessão órfã (GO) → `connection_session_recreated` e, quando devolve QR novo, também o
    `connection_connect` daquela invocação;
  - delete-instance (do CX0) passou a usar o MESMO helper — não há dois formatos de trilha.
- `supabase/functions/evolution-api/index.test.ts`: bloco CA1 com 5 testes.

## Ramo de erro que mudou (antes × depois)
- delete-instance, insert de auditoria: ANTES (CX0) o insert era inline e, se retornasse erro, a Edge
  respondia 500 — embora a exclusão já tivesse acontecido. DEPOIS usa `writeConnectionAuditLog`, que
  engole o erro e só loga estruturado; a resposta é a do caminho de sucesso (200 com o corpo do
  provedor). Efeito pretendido: a trilha não pode fazer uma exclusão já concluída parecer falha. O gate
  admin-only e o `delete()` ficaram idênticos — os dois testes do CX0 (supervisor 403 / admin apaga e
  registra) seguem verdes.
- create-connection/connect/disconnect: não tinham auditoria antes; os retornos de erro do provedor
  seguem como estavam.

## Prova
- vermelho antes (index.ts revertido ao commit do CX0, sem as chamadas de trilha):
  `deno test --allow-net --allow-env --filter CA1 supabase/functions/evolution-api/index.test.ts`
  → `FAILED | 1 passed | 4 failed` (nenhuma das 4 ações gravava trilha).
- verde depois: `deno test --allow-net --allow-env --filter CA1 supabase/functions/evolution-api/index.test.ts`
  → `ok | 5 passed | 0 failed`.
- suíte inteira da Edge: `deno test --allow-net --allow-env --allow-read supabase/functions/evolution-api/index.test.ts`
  → `ok | 42 passed | 0 failed` (inclui CX0, R2EXT e a exaustividade E45).
- authz: `deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`
  → `ok | 10 passed | 0 failed`.
- migration herdada do CX0: `bash scripts/db-audit/connections-delete-admin-only.test.sh`
  → `[OK] contrato de exclusao de conexao (admin-only) verificado`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK).

## O que os testes provam
- create-connection: exatamente 1 linha — action `connection_created`, entity_id = id da conexão,
  entity_type `connection`, user_id do ator, IP preenchido; o JSON da trilha NÃO contém o número
  (5511999990000), nem "token", nem "2@" (QR).
- connect (v2): 1 linha `connection_connect` no caminho do QR.
- disconnect (v2): 1 linha `connection_disconnect`.
- recriação de sessão órfã (go): 1 linha `connection_session_recreated` + 1 `connection_connect`
  (recovered) — nenhuma duplicada.
- fail-open: com o insert de `audit_logs` devolvendo erro, disconnect ainda responde 200.

## O que NÃO fiz e por quê
- Não gravei trilha nos caminhos de ERRO do connect/disconnect/create (token ausente, 403 do provedor):
  auditar a ação bem-sucedida espelha o CX0; o cartão pede a trilha da ação que aconteceu.
- Não mexi nas outras ações de conexão (status/instance-info/list-instances): fora do que o cartão lista.
- `entity_id` de connect/disconnect fica nulo (a ação não recebe a linha da conexão); o `instance_id` vai
  em `details`, como o cartão pede.
- Ressalva honesta: o teste de fail-open também passa na base (lá não existe insert) — o valor dele é
  travar a propriedade agora que a trilha existe; os outros 4 são os que nascem vermelhos.
