# Runbook — Auth pendurado por saturação do Postgres (loop de requisições negadas)

> Referência para quando o **Auth do Supabase (password grant) para de completar** —
> logins penduram ou devolvem `504` — **enquanto o PostgREST continua respondendo**.
> O quadro não é lock nem senha errada: é **saturação do banco** causada por um cliente
> em **loop de retry com credencial inválida**. Investigado em 02/10/2026, só com leitura
> (API de logs + gateway RO); nenhuma alteração foi feita durante o diagnóstico.

## Sintomas

- Login (`POST /auth/v1/token?grant_type=password`) **pendura** e termina em `504` ou `500`;
  em geral `context deadline exceeded` ou `error finding user: context canceled`.
- `/auth/v1/user` — endpoint **barato** (só valida JWT) — também demora ~10 s e devolve
  `403 bad_jwt` / `missing sub claim`. **Esse é o sinal que separa saturação de problema de credencial.**
- **Operações que dão certo também ficam lentas**: um `refresh_token` bem-sucedido levando
  ~10 s indica que o problema é o banco, não o fluxo de login.
- **O PostgREST responde normalmente** — e é isso que confunde o diagnóstico (ver "Causa provável").
- Fora do Auth: CI de banco falhando com `authentication did not complete within 15000ms`;
  gateway de leitura devolvendo `504`; contagem trivial levando segundos.

## Sinais no log (e o que cada um significa)

| Sinal | Onde | Significado |
|---|---|---|
| `57014` (`query_canceled`) | `postgres_logs` → `parsed.sql_state_code` | Query estourou `statement_timeout`. **O sintoma central.** |
| `42501` (`insufficient_privilege`) | `postgres_logs` | `permission denied` — RLS/policy negando. **O combustível**, quando em volume alto. |
| `401` | `edge_logs` → `response.status_code` | Cliente chamando com credencial inválida. É o **indicador de quem está no loop**. |
| `53300` (`too_many_connections`) | `postgres_logs` (FATAL) | Saturação de conexões — consequência, não causa. |
| `57P03` (`cannot_connect_now`) / `57P01` / `08006` | `postgres_logs` (FATAL) | Banco indisponível/reiniciando. Explica janelas de erro total. |
| `PGRST`/`Supavisor (auth_query)` com `57014` | `postgres_logs` | **A peça que explica o "só o Auth cai"** — ver abaixo. |

## Causa provável

Um cliente faz **retry em loop** de `GET /rest/v1/catalog_send_events` (e `INSERT` em
`notifications`) **com credencial inválida**, recebendo `401`. A assinatura observada:
**`user-agent: node`** (script/automação, não navegador), originado de **rede de datacenter
(Azure)** e de **operadora brasileira**, com dezenas de milhares de requisições ao longo de
~24 h. Os `401` de borda casam com os `42501` de banco: o PostgREST autentica o pedido,
o RLS nega, e o erro é logado.

O mecanismo, em ordem:

1. O loop gera **carga constante de parse/plan + volume de log** (dezenas de milhares de
   `permission denied` por dia).
2. O banco satura e o `statement_timeout` passa a cortar **até queries triviais** —
   introspecção do PostgREST, `pg_timezone_names`, `pg_publication_tables`.
3. **O `auth_query` do Supavisor entra na lista dos que estouram** (aparece com `57014`).
4. Quem **abre conexão nova** paga o `auth_query`. O **GoTrue abre conexão por requisição**
   → pendura → `context deadline exceeded`. O **PostgREST reaproveita conexões já
   estabelecidas** no pool → **continua respondendo**.
5. Resultado: **Auth pendurado, PostgREST de pé** — exatamente o sintoma relatado.

**O que NÃO é causa:** lock em `auth.users` (as queries do Auth não estão bloqueadas, estão
**canceladas por tempo**); senha/JWT dos usuários; RLS do Auth; limite de `max_connections`
(o teto apareceu, mas o gargalo medido é recurso/timeout — subir `max_connections` aumenta a
concorrência no mesmo IO e tende a piorar).

## Linha do tempo (02/10/2026, horários em UTC; BRT = UTC−3)

| Quando | O que se mediu |
|---|---|
| **01/10 ~23:55** | Primeiras requisições `node` → `catalog_send_events` com `401`. Início do loop. |
| 01/10 23:54 → 02/10 23:51 | Acúmulo: ~69.700 `permission denied`, ~98% deles em `catalog_send_events` (2 SELECTs) e `notifications` (1 INSERT), como `authenticator`. |
| 02/10 14:50 – 18:11 | `57P03 cannot_connect_now` (78×) — banco indisponível em janelas. |
| 02/10 18:09 | `53300 too_many_connections` (8×). |
| 02/10 até ~22:52 | Auth **saudável** — centenas de `200` por minuto. |
| **02/10 ~22:52** | **Virada**: `200` do Auth caem a **zero** e não voltam; volume de requisições despenca (clientes desistem). Coincide com o "~20:02 BRT" relatado. |
| 02/10 23:20 – 23:52 | `57014` contínuo (~1–12/min) em Realtime, introspecção do PostgREST, Storage, Auth (`supabase_auth_admin`), `Supavisor (auth_query)`. |
| diagnóstico | Feito **só com leitura**; nenhum restart/alteração. |

> Observação: o relato inicial ("desde ~20:02") e a medição (~19:52 BRT) são o mesmo evento,
> dentro da margem de quando os clientes começam a falhar em massa.

## Passos de resposta (na ordem)

1. **Cortar a fonte — é o único passo que resolve.** Localizar a automação que chama
   `catalog_send_events` em loop (procurar no n8n / Azure Functions / App Service por um nó
   que use o endpoint de catálogo) e **pausar/desativar o nó**. Pelo sintoma, o autor é um
   cliente **`node`** recebendo **`401`** desde **01/10 ~23:55 UTC**.
2. **Corrigir a credencial antes de religar.** Os `401` apontam para anon key/URL erradas,
   token expirado ou projeto trocado (na casa há mais de um ambiente — V2 × V3). Religar sem
   corrigir **recria o incidente**.
3. **Aguardar a recuperação espontânea (~10 min)** com o loop cortado, e **medir** (seção
   seguinte). Cortar a carga costuma bastar — o banco não precisa de intervenção.
4. **Só se não recuperar:** reiniciar o projeto (Supabase → Settings → Restart).
   **Reiniciar antes do passo 1 faz o Auth voltar a pendurar em minutos.**
5. **Se precisar de alívio imediato e o passo 1 ainda não estiver feito:** bloquear a origem
   do loop na borda (WAF do Cloudflare, por ASN/range do datacenter) — reversível e não toca
   o banco. Registrar o bloqueio com data para remover depois.
6. **Depois do incidente:** verificar **por que** `catalog_send_events` e `notifications`
   negam para `anon` — se for policy faltando, um cliente **legítimo** pode estar caindo nesse
   erro; e o volume de `permission denied` está inflando o log pago e a auditoria.

## Como confirmar a recuperação

1. **Auth completa login de novo** — o sinal mais direto:
   ```bash
   curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' -X POST \
     "https://<PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password" \
     -H "apikey: <ANON_KEY>" -H 'Content-Type: application/json' \
     -d '{"email":"<USUARIO_DE_TESTE>","password":"<SENHA_DE_TESTE>"}'
   ```
   Esperado: `200` em **menos de ~2 s**. (Use um usuário de teste; não use conta de cliente.)
2. **Os `57014` somem no log do banco** (janela de 15 min):
   ```sql
   select toStartOfMinute(timestamp) as minuto,
          countIf(log_attributes['parsed.sql_state_code'] = '57014') as timeouts
   from logs
   where source = 'postgres_logs' and timestamp >= now() - interval 15 minute
   group by minuto order by minuto desc;
   ```
3. **Os `42501` caem** (o loop parou) e **os `401` de borda desaparecem** para o caminho de
   catálogo.
4. **Um endpoint barato responde rápido**: `GET /auth/v1/user` com um JWT válido deve
   responder em **menos de ~1 s** (era ~10 s durante o incidente).
5. **Sinais indiretos**: os jobs de CI que falam com o banco param de falhar por
   `authentication did not complete within 15000ms` e o gateway de leitura para de devolver `504`.

## Sinais de que NÃO recuperou (e o que checar)

- Auth volta a `504`/`500` com `context deadline exceeded` → o loop **não** foi cortado, ou
  foi religado sem corrigir a credencial (volte ao passo 1–2).
- Login OK, mas lento (>5 s) → a carga caiu, o banco ainda está drenando; aguardar e medir.
- `57P03`/`53000` recorrente → instabilidade do provedor; checar o status oficial da Supabase.
- `53300` de novo → reavaliar concorrência dos serviços, não aumentar `max_connections` no calor do incidente.

## Ferramentas de diagnóstico (só leitura)

| Objetivo | Como |
|---|---|
| Descobrir os sources de log do projeto | `select source, count(*) from logs group by source` |
| Erros do Postgres por código | `select log_attributes['parsed.sql_state_code'], log_attributes['parsed.user_name'], count(*) from logs where source='postgres_logs' group by 1,2 order by 3 desc` |
| Quem estoura timeout | idem, filtrando `= '57014'`, agrupando por `parsed.application_name` e `parsed.query` |
| Quem está no loop (borda) | `source='edge_logs'`, agrupando por `request.path`, `request.headers.user_agent` e `response.status_code` |
| Estado do Auth | `source='auth_logs'`, campos `grant_type`, `status`, `error`, `error_code`, `duration` |

*(Campos aninhados ficam em `log_attributes['<chave>']`; o `source` de cada serviço separa os sinais.)*

## O que NÃO fazer

- **Não reiniciar o Auth nem o projeto antes de cortar o loop** — a carga continua e o
  sintoma volta em minutos.
- **Não aumentar `max_connections`/pool** como primeira medida: mais concorrência no mesmo
  IO tende a agravar.
- **Não tratar como problema de senha/usuário** — o `/user` lento com JWT válido descarta isso.
- **Não bloquear em massa na borda** sem antes identificar a origem: há tráfego legítimo
  (inclusive automação) nos mesmos intervalos.
- **Não deixar o bloqueio temporário sem data de remoção.**

---

**Origem:** diagnóstico de incidente de 02/10/2026 (só leitura). **Relacionados:**
`docs/INCIDENT-RUNBOOK.md`, `docs/ops/runbook-pg-cron-capacidade.md`.

---

**AUTORIA FECHADA em 03/10/2026 — o "cliente `node` em loop" é a suíte de testes DESTE repositório.**
O cliente Supabase do app tem a URL e a anon key de **produção** fixas no código; teste que monta
componente sem mockar o cliente faz request real, recebe `401` por RLS (`catalog_send_events` só tem
policy para `authenticated`) e **passa mesmo assim**. Medido: **408 requests a produção por execução**
da suíte. Corrigido com guarda de rede em `src/test/setup.ts` (ver
`docs/audits/incidente-testes-vazando-producao-2026-10-03.md`). Consequência para este runbook:
o **passo 1** ("localizar a automação") e o **passo 5** (bloqueio na borda) **não se aplicam mais** a
este incidente — a fonte é interna e foi cortada no repo.
