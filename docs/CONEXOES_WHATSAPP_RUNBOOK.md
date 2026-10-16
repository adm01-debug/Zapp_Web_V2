# Runbook — Conexões de WhatsApp (V2)

- **Última atualização:** 2026-10-13
- **Público:** quem opera/on-call no ZAPP Web V2 (adm01-debug).
- **Escopo:** ciclo de vida de uma conexão de WhatsApp na V2 — criação, QR,
  pareamento, reconexão, monitor automático de saúde e o que fazer quando a
  conexão cai ou a Edge responde 401.
- **Fora de escopo:** token/segredo de produção em texto (ver
  `docs/runbooks/cron-secret-rotation.md`) e o bloqueio da Meta em si
  (ver `docs/runbooks/bloqueio-meta.md`).

Peças envolvidas:

| Peça | Onde | Papel |
| --- | --- | --- |
| Evolution GO | serviço externo | orquestra a sessão do WhatsApp (Baileys) |
| Edge `evolution-api` | `supabase/functions/evolution-api/index.ts` | único caminho do front para a Evolution |
| Edge `connection-health-check` | `supabase/functions/connection-health-check/index.ts` | monitor automático (cron de 5 em 5 min) |
| Front | `src/hooks/inbox/useConnectionsManager.ts`, `src/components/connections/ConnectionsView.tsx` | cadastro, QR, reconexão |
| Banner global | `src/components/alerts/EvolutionDisconnectBanner.tsx` | avisa a queda em qualquer tela |
| Painel de diagnóstico | `src/components/diagnostics/ConnectionHealthPanel.tsx` | mostra os últimos resultados salvos |

## 1. Criação da conexão (atômica)

O front usa a action `create-connection` da Edge `evolution-api`
(`supabase/functions/evolution-api/index.ts:302`), que é admin-only (`:303`).

A ordem é: **reservar a linha no banco, depois criar na Evolution GO, depois
guardar o token**. Motivo registrado no código (`:320-334`): se a linha fosse
inserida depois de criar na GO, um erro no insert deixaria a instância nascendo
na GO sem registro no banco.

1. **Trava de feature**: `global_settings.multi_connection_enabled` precisa ser
   `'true'`, senão a criação é recusada com mensagem própria (`:305-311`).
2. **Validação**: nome de instância `^[a-z0-9_]{3,40}$` e `name` +
   `phone_number` obrigatórios (`:312-319`).
3. **Reserva**: `INSERT` em `whatsapp_connections` com `status = 'disconnected'`
   (`:335-338`). O índice `UNIQUE` em `instance_id`
   (`supabase/migrations/20260827201500_unique_whatsapp_connections_instance_id.sql`)
   é a trava real contra duas criações concorrentes com o mesmo nome; quem perde
   o `INSERT` (erro `23505`) sai antes de tocar a GO (`:339-356`). Existe também
   o índice parcial `whatsapp_connections_one_default`, e a mensagem de erro
   distingue os dois casos (`:349-351`).
4. **Criação na GO**: `POST /instance/create` (`:415`).
5. **Token no Vault**: `set_instance_token(p_connection_id, p_token)` (`:445`).
   Se falhar, a Edge **compensa na GO primeiro e só então apaga a linha**
   (`:446-461`) — a ordem é proposital (`:449-456`).
6. **Webhook na criação** (best-effort): `POST /instance/connect` com
   `webhookUrl` apontando para `evolution-webhook` (`:470-481`). Falhar aqui
   **não** desfaz a conexão; o log avisa "reconectar manualmente".

### Linha fantasma (risco conhecido e aceito)

Se o processo morrer entre o passo 3 e o passo 4/5, sobra uma linha em
`whatsapp_connections` **sem token e sem instância na GO** (`:329-334`). Não há
limpeza automática: a linha só sai pela ação de excluir conexão do front
(`handleDelete`). O impacto é baixo porque o nome da instância leva sufixo de
timestamp (`generateInstanceName`), então ela bloqueia só aquele nome exato.
**Sintoma em campo:** conexão listada que nunca conecta e cujo token não existe
no Vault → excluir a linha e recriar.

## 2. Leitura do QR Code e pareamento

- A ação de conexão é a `connect` (`supabase/functions/evolution-api/index.ts:490`).
  Ela resolve a sessão por *flavor*: no GO usa as rotas nativas (`/instance/connect`,
  poll de `/instance/qr`, recriação de sessão órfã — `:492-495`); no flavor v2 o
  pareamento vem no corpo do `/instance/connect/{instance}` (`:496-517`).
- Quando a GO devolve QR, a Edge grava `qr_code` e `status = 'qr_pending'` em
  `whatsapp_connections` (`:515-516`).
- No front, `useConnectionsManager` abre o diálogo e faz **poll de 3 em 3
  segundos** (`src/hooks/inbox/useConnectionsManager.ts:198-215`).
- A sessão do QR é identificada por `{ generation, connectionId }`
  (`useConnectionsManager.ts:65`): respostas de um QR antigo são descartadas
  (`:238-246`). O botão "atualizar QR" incrementa a geração
  (`handleRefreshQrCode`, `:255-276`).
- **Rede de segurança do spinner**: se o diálogo ficar 30 s em `loading`, ele
  vira `error` com aviso de que a sessão pode estar pendente na GO
  (`useConnectionsManager.ts:75-80`).
- Quando a linha vira `connected`, o diálogo fecha o QR
  (`useConnectionsManager.ts:121-123`) — há também um canal realtime
  `whatsapp-connections-changes` (`:105`).
- `handleDisconnect` grava `status = 'disconnected', qr_code = null` direto na
  tabela (`:290-296`).

### Trava de multiconexão no front

O botão "Nova conexão" só abre o diálogo quando
`global_settings.multi_connection_enabled = 'true'`
(`src/components/connections/ConnectionsView.tsx:46`, `:184`). O estado vazio
("Nenhuma conexão configurada") **não** pode abrir o mesmo diálogo por outro
caminho — é exatamente o que o teste
`src/components/connections/__tests__/ConnectionsView.trava-multiconexao.test.tsx`
protege.

## 3. Reconexão

### Pelo banner global (qualquer tela)

`EvolutionDisconnectBanner` mostra as conexões não saudáveis
(`src/components/alerts/EvolutionDisconnectBanner.tsx:80`) e o botão chama a Edge
`evolution-api/instance/connect` (`:53-56`).

**Armadilha real (R2-API-042):** a Edge responde **HTTP 200 também nas falhas
lógicas** — o erro vem no corpo (`{ error: true, message }`), não no campo
`error` do `invoke`. O banner precisa ler o corpo (`:66-71`), senão anuncia
"Reconectando..." quando nada aconteceu. O motivo do bloqueio da Meta chega por
esse mesmo corpo (`:58-65`).

### Pelo store de saúde

`useConnectionsHealth` mantém uma **instância global** compartilhada por todos
os consumidores (`src/hooks/connections/useConnectionsHealth.ts:334`) e guarda o
histórico de quedas (`:171-180`). Ele expõe `reconnect` e `reconnectAll`
(`:284`, `:299`) e marca a conexão não saudável quando o `status` deixa de ser
`connected` (`:118-126`).

## 4. Monitor automático de saúde (cron de 5 min)

### Agendamento

- Job pg_cron `connection-health-check`, a cada 5 minutos, via `net.http_post`
  (`supabase/migrations/20260924100800_schedule_connection_health_check_cron.sql`).
- O job atual **não** usa a anon key: manda `x-cron-secret` com o segredo
  dedicado do Vault (`supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql:49-59`).
  A função `public.apply_zapp_cron_secrets_l5()` reaplica o agendamento de forma
  idempotente. Ver `docs/runbooks/cron-secret-rotation.md`.

### Autenticação da Edge

`verify_jwt = false` no `supabase/config.toml:23-24` porque o cron não carrega
JWT de usuário. A função então aceita (`connection-health-check/index.ts:40-79`):

- `x-cron-secret` conferido com comparação de tempo constante
  (`timingSafeStringEqual`) contra o segredo lido por
  `get_connection_health_check_cron_secret()` (`:40`, `:49`); **ou**
- um usuário autenticado real, com limite de **6 chamadas por 60 s** por usuário
  (`:70-79`).

Qualquer outro caso recebe **401** (`unauthorizedResponse`).

### O que ele faz

- Varre **todas** as conexões, em série (`:102`). Não existe (ainda) varredura
  por instância isolada — ver *Lacunas*.
- Lê o token **da própria instância** no Vault via `get_instance_token` (`:120`);
  se a leitura falha, o resultado é `no_credentials` (`:141-143`).
- Chama `GET /instance/connectionState/{instance}` com timeout de 10 s (`:148-149`).
- Mapeia o estado (`:155`): `open → healthy`, `close → disconnected`,
  qualquer outro → `degraded`.
- **401/403 da Evolution → `no_credentials`** (`:181-185`): a instância não
  autentica com a credencial guardada. Isso evita alerta falso de "desconectada"
  a cada 5 min e preserva a credencial para a reconexão — **trate como aviso de
  credencial, não como sessão caída.**
- Atualiza a linha (CAS pelo estado lido, `:166-203`) com `last_health_check`,
  `health_status` e `health_response_ms`.
- Grava o resultado em `connection_health_logs` (`:195`).
- Para cada queda **nova**, cria alerta em `warroom_alerts`
  (`alert_type/title/message/source`, `:207-216`) e manda e-mail para os admins
  via Resend (`:219-250`) — porque o `warroom_alerts` só aparece com o painel
  aberto, e conexão caída significa "não entra nem sai mensagem" (`:218`).
- Apaga logs com mais de 7 dias (`:257-259`).

### Colunas e onde olhar

`whatsapp_connections` ganhou `last_health_check`, `health_status` (default
`'unknown'`) e `health_response_ms`
(`supabase/migrations/20260319134046_ca0c2740-67fa-495d-be04-62114b42b479.sql:48-52`),
e a tabela `connection_health_logs` (`:3-15`) guarda o histórico.

O card de conexão mostra o resultado: rótulos "Saudável / Degradado / Timeout /
Erro / Desconectado" e o tempo de resposta em ms
(`src/components/connections/ConnectionCard.tsx:110-123`).
O painel de diagnóstico **não** dispara o health-check sozinho — só relê o que
está salvo (`src/components/diagnostics/ConnectionHealthPanel.tsx:72-78`).

## 5. Janela de manutenção da Meta

- A chave é `global_settings.whatsapp_maintenance_until`. Enquanto ela estiver
  no futuro, as ações que fazem a instância se reconectar ficam bloqueadas:
  `connect`, `restart-instance`, `disconnect`, `create-instance` e
  `create-connection` (`supabase/functions/evolution-api/index.ts:195`).
- Quem lê a chave é a **Edge**, não o front (`:190-197`); o `SELECT` dessa tabela
  é admin/supervisor. O banner, por isso, mostra a mensagem que a Edge devolve
  (`src/components/alerts/EvolutionDisconnectBanner.tsx:58-69`).
- **Por que isso existe:** insistir no login durante um bloqueio da Meta
  *estende* o bloqueio. Ver `docs/runbooks/bloqueio-meta.md`. O teste de
  regressão é
  `src/components/alerts/__tests__/EvolutionDisconnectBanner.janela-manutencao.test.tsx`.

## 6. O que fazer em caso de 401

Há **dois 401 diferentes** — não confunda:

| Cenário | Sintoma | Causa | Ação |
| --- | --- | --- | --- |
| 401 da **nossa Edge** | resposta `Unauthorized` sem corpo útil | o cron não mandou `x-cron-secret` válido (ou segredo trocado) | rotacionar/reaplicar o segredo: `docs/runbooks/cron-secret-rotation.md` e `public.apply_zapp_cron_secrets_l5()` |
| **Evolution** devolve 401/403 na checagem | `health_status = 'no_credentials'` | o token guardado não autentica na instância | **não** é sessão caída; reconectar/reaplicar o token da instância (ação de conexão) e conferir o Vault |

Regra prática: 401 **na porta de entrada** (cron → Edge) = segredo; 401
**do outro lado** (Edge → Evolution) = credencial da instância.

## 7. Roteiro curto de incidente ("a conexão caiu")

1. Confirme o sinal: `whatsapp_connections.status` / `health_status` e a linha
   mais recente em `connection_health_logs`.
2. Cheque se há janela de manutenção ativa (`whatsapp_maintenance_until`) — se
   houver, **não** insista na reconexão (seção 5).
3. `health_status = 'no_credentials'` → problema de credencial (seção 6, linha 2).
4. Sessão realmente caída (`disconnected`) → reconectar pelo banner ou pela tela
   de Conexões e escanear o QR.
5. Nada reconecta e a linha parece fantasma (sem token no Vault) → excluir e
   recriar a conexão (seção 1).

## 8. Lacunas conhecidas (documentadas, não corrigidas aqui)

- **L1 — varredura sem alvo:** o health-check varre todas as conexões a cada
  tick (`connection-health-check/index.ts:102`); não há endpoint/param para
  checar uma instância isolada sob demanda.
- **L2 — linha fantasma:** sem limpeza automática (seção 1).
- **L3 — `warroom_alerts` não deduplica por instância** neste fluxo: cada queda
  nova gera alerta + e-mail; a base de dedupe (`dedupe_key`) existe em
  `supabase/migrations/20261006155408_warroom_alerts_dedupe_key_sla_monitor.sql`,
  mas é do monitor de SLA.
- **L4 — banner:** o front não lê a janela de manutenção; depende da mensagem
  devolvida pela Edge.

## 9. Verificação rápida (testes que existem hoje)

```bash
npx vitest run src/components/connections/__tests__/ConnectionsView.trava-multiconexao.test.tsx
npx vitest run src/components/alerts/__tests__/EvolutionDisconnectBanner.janela-manutencao.test.tsx
npx vitest run src/hooks/connections/__tests__/useConnectionsHealth.test.ts
deno test supabase/functions/connection-health-check/index.test.ts
```
