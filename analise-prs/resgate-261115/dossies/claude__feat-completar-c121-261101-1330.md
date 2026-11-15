# claude__feat-completar-c121-261101-1330 — C121 pausa de instância (PR #2469)

- Ref: `origin/claude/feat-completar-c121-261101-1330` · tip `4d77db544` · merge_base `1252bb5a4` (2026-11-01)
- PR #2469 — **CLOSED 2026-11-01T23:49Z**, último comentário: *"Fechada pelo congelamento de features (#2545, decisão do dono em 01/11) … Branch preservada — reabrir quando esta PR destravar um fluxo crítico."*
- Triagem anterior (2026-11-08) marcou `DUPLICATA_PROVAVEL`. **Hipótese refutada**: só a parte de *edges de campanha* entrou na main; o núcleo (UI de pausar/retomar, gate da `evolution-api`, pausa automática no 429, série 24h/7d) **não está na main**.

## Propósito
O IP1 já estava em produção (tabela `instance_pauses` + RPCs `pause_instance` / `resume_instance` / `is_instance_paused` / `auto_pause_instance`) mas **sem chamador no app**. A branch fecha os chamadores: painel staff em Conexões para pausar/retomar envios de um número, bloqueio do envio na `evolution-api`, auto-pausa de 30 min quando o provedor devolve 429, e série 24h/7d (manual × automática). Sem DDL.

Verificação em produção (MCP `SUPABASE - ZAPP WEB V2 - MCP`, somente leitura):
- `pg_proc`: `pause_instance(p_instance text, p_minutes integer, p_reason text)`, `resume_instance(p_instance text)`, `auto_pause_instance(p_instance text, p_minutes integer, p_reason text)`, `is_instance_paused(p_instance text)`, `mark_pause_investigated(uuid,text)` — **todas existem**.
- Colunas de `public.instance_pauses`: `id, instance, paused_until, reason, paused_by, auto, resumed_at, resumed_by, created_at, investigated_at, investigated_by, investigation_notes` — **todas as colunas que o hook da branch lê existem**.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `ESTADO.md` | OBSOLETA (gerado) | main já tem o bloco atualizado com números MAIS novos: `ESTADO.md:65` → `ConnectionsView.tsx:135`; `:81` → `ConnectionsView.tsx:110`. A branch gravava `:131`/`:106`. Arquivo é regerado. |
| `docs/DB-INVENTORY.md` | INCORPORADA (de outra forma) | `origin/main:docs/DB-INVENTORY.md:154` já diz `instance_pauses … ativo`, com consumidores de monitoring. |
| `supabase/deployment-manifest.json` | OBSOLETA (artefato gerado) | manifesto de deploy, regerado por script. |
| `supabase/functions/_shared/instance_pause.ts` | INCORPORADA (idêntico) | `IDENTICAL_TO_MAIN` / `PRESENT_BYTE`; consumidores na main: `message-delivery/index.ts:14`, `multiplix-send/index.ts:13`, `talkx-scheduler/index.ts:25`, `talkx-send/process-recipient.ts:18`. |
| `supabase/functions/talkx-send/process-recipient.ts` | INCORPORADA | `PRESENT_REVERSE_APPLIES`. |
| `supabase/functions/multiplix-send/index.ts` | INCORPORADA | main já tem o guard: `multiplix-send/index.ts:906` (`await isInstancePaused(...)`) e `:916` (`: "instance_paused"`). Falta só o texto de um comentário. |
| `supabase/functions/_shared/talkx-resume-policy.ts` | QUASE INCORPORADA | `AUTO_RESUME_REASONS` com `"instance_paused"` **está** na main (`talkx-resume-policy.ts:35`). Falta apenas o texto do `because` para `instance_paused` — main `:170` mantém o ternário de 2 ramos. Cosmético. |
| `supabase/functions/_shared/instance-pause-actions.ts` | **PERDIDA** | `git grep PAUSE_BLOCKED_ACTIONS origin/main` → nada. |
| `supabase/functions/evolution-api/index.ts` | **PERDIDA** | `git grep -E 'paus\|PAUSE' origin/main -- supabase/functions/evolution-api/index.ts` → só `:63 status: 429` (rate-limit local). Sem gate de pausa, sem auto-pausa. |
| `supabase/functions/evolution-api/index.test.ts` | **PERDIDA** | `git grep -c C121 origin/main -- …/index.test.ts` → 0. |
| `src/components/connections/InstancePausesPanel.tsx` | **PERDIDA** | arquivo ausente na main (`git ls-tree`). A main tem `src/components/monitoring/MonitoringInstancePauses.tsx`, que é **outra coisa**: lista pausas + "Marcar investigada" (RPC `mark_pause_investigated`); **não pausa nem retoma**. |
| `src/hooks/connections/useInstancePauses.ts` | **PERDIDA** | basename igual existe na main (`src/components/monitoring/hooks/useInstancePauses.ts`) mas é o hook de monitoring (`fetchInstancePauses` + `markInvestigated`), sem `pause`/`resume`. |
| `src/lib/instancePauseSeries.ts` + `src/lib/__tests__/instancePauseSeries.test.ts` | **PERDIDA** | ausentes na main. |
| `src/components/connections/ConnectionsView.tsx` | **PERDIDA** (2 linhas) | main `:23` importa `NumberReputationMonitor`; render termina em `:282 <NumberReputationMonitor />`. Nenhuma menção ao painel. |
| 6 testes de `ConnectionsView` / `reduzirMovimentoInboxCrmConexoes` | **PERDIDA** (dependente) | 1 linha de `vi.mock` cada; só fazem sentido junto com o painel. |

### Prova central das duas lacunas de maior valor
```
$ git grep -n "auto_pause_instance" origin/main -- src supabase/functions scripts e2e | grep -v migrations
origin/main:src/integrations/supabase/types.ts:12531:      auto_pause_instance: {
```
→ **A RPC existe em produção e NÃO tem nenhum chamador na main.** A auto-pausa por 429 do provedor é código morto no app.

```
$ git grep -n "pause_instance\|resume_instance" origin/main -- src | grep -v types.ts
(vazio)
```
→ **Nenhuma UI na main chama `pause_instance`/`resume_instance`.** O operador não tem como parar os envios de um número; só dá para listar pausas e marcá-las como investigadas.

## Veredito: PERDIDA_PARCIAL

Entrou na main: o guard de pausa nos motores de campanha/entrega (`message-delivery`, `multiplix-send`, `talkx-send`, `talkx-scheduler`), o helper `_shared/instance_pause.ts`, `AUTO_RESUME_REASONS` com `instance_paused` e o painel de *investigação* em monitoring.

Não entrou (ponta a ponta incompleto):
1. **Ação do operador** — pausar/retomar envios de uma instância. Sem isso o fluxo crítico de WhatsApp não tem freio manual.
2. **Gate na `evolution-api`** — ações de envio dessa edge não consultam a pausa (as outras 4 edges consultam).
3. **Auto-pausa no 429 do provedor** — nenhum chamador de `auto_pause_instance`.
4. **Série 24h/7d** — agregação pura, só visualização.

`apagar_branch_seguro = false`.

---

# Hunks para portar

## 1. `supabase/functions/_shared/instance-pause-actions.ts` (arquivo novo, 10 linhas, íntegro)
```ts
/**
 * C121 — ações da evolution-api que ENTREGAM conteúdo a terceiros e por isso param
 * durante a pausa da instância. Ficam de fora de propósito: mark-read, archive-chat,
 * send-reaction e send-chat-presence (mutações/sinais da conversa, não entregam
 * mensagem). `send-status` entra mesmo sendo classificada como controle na autorização.
 */
export const PAUSE_BLOCKED_ACTIONS: ReadonlySet<string> = new Set([
  'send-text', 'send-media', 'send-audio', 'send-sticker', 'send-location',
  'send-contact', 'send-poll', 'send-list', 'send-buttons', 'send-ptv', 'send-status',
]);
```

## 2. `supabase/functions/evolution-api/index.ts`
Import (após `evolution-control-authz`, antes de `schemas.ts`):
```ts
import { PAUSE_BLOCKED_ACTIONS } from "../_shared/instance-pause-actions.ts";
```
Gate antes da criação do `proxy` (no original, após o bloco de autorização e antes do comentário "E22: chave do circuit breaker"):
```ts
    // C121/IP1: instância em pausa (manual ou automática) não envia. `supabase` aqui é o
    // cliente de serviço (is_instance_paused aceita service_role). Falha de leitura NÃO
    // bloqueia o envio (fail-open): a pausa é proteção, não pré-requisito de entrega.
    if (PAUSE_BLOCKED_ACTIONS.has(action) && instance) {
      const { data: paused, error: pausedError } = await supabase.rpc('is_instance_paused', { p_instance: instance });
      if (pausedError) {
        new Logger('evolution-api').warn('is_instance_paused falhou; envio liberado', { instance, code: pausedError.code });
      } else if (paused === true) {
        return new Response(JSON.stringify({ error: true, paused: true, message: 'Instância pausada: envios suspensos até o fim da pausa ou retomada manual.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
```
`proxy` passa de arrow-expression para bloco, detectando o 429 **no corpo** (o proxy devolve HTTP 200 com `{ error, status }`):
```ts
    const proxy = async (path: string, method = 'POST', body?: unknown) => {
      const res = await proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, body, undefined, instance || '__admin',
        instance ? (await resolveInstanceToken(supabase, instance)) ?? undefined : undefined);
      // C121/IP1: 429 do provedor num envio = limite de envio; pausa a instância sozinha
      // (30 min) para não insistir. Falha ao registrar a pausa não altera a resposta.
      let providerRateLimited = false;
      if (PAUSE_BLOCKED_ACTIONS.has(action) && instance) {
        try {
          const payload = await res.clone().json();
          providerRateLimited = payload?.error === true && payload?.status === 429;
        } catch { /* corpo não-JSON: não é limite de envio */ }
      }
      if (providerRateLimited) {
        const { error: autoPauseError } = await supabase.rpc('auto_pause_instance', { p_instance: instance, p_minutes: 30, p_reason: 'limite de envio (429 do provedor)' });
        if (autoPauseError) new Logger('evolution-api').warn('auto_pause_instance falhou', { instance, code: autoPauseError.code });
      }
      return res;
    };
```
> Atenção ao portar: na main a linha do `proxyToEvolution` pode ter mudado de assinatura — conferir `origin/main:supabase/functions/evolution-api/index.ts` antes de reescrever o bloco.

Testes Deno a portar: diff salvo em
`/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/evoapi-test.diff`
(3 casos: envio bloqueado sem chegar ao provedor; `mark-read` passa e `send-status` bloqueia; 429 chama `auto_pause_instance` com RPC ok e com RPC em erro). Comando para regerar:
`git diff 1252bb5a4 origin/claude/feat-completar-c121-261101-1330 -- supabase/functions/evolution-api/index.test.ts`

## 3. `src/lib/instancePauseSeries.ts` (arquivo novo, íntegro)
```ts
/**
 * C121 / IP2-B — série temporal de pausas de instância (24h por hora, 7d por dia).
 * Agregação pura sobre as linhas de `instance_pauses` (sem DDL): cada pausa conta no
 * balde do instante em que começou (`created_at`), separada em manual × automática.
 */
export type PauseWindow = '24h' | '7d';
export interface PauseRow { created_at: string; paused_until: string; resumed_at: string | null; auto: boolean; }
export interface PauseBucket { start: number; manual: number; auto: number; }

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function buildPauseSeries(rows: PauseRow[], window: PauseWindow, now: number): PauseBucket[] {
  const step = window === '24h' ? HOUR_MS : DAY_MS;
  const count = window === '24h' ? 24 : 7;
  // último balde termina em `now`; cada balde cobre [start, start + step)
  const first = now - count * step;
  const buckets: PauseBucket[] = Array.from({ length: count }, (_, i) => ({ start: first + i * step, manual: 0, auto: 0 }));
  for (const row of rows) {
    const t = Date.parse(row.created_at);
    if (Number.isNaN(t) || t < first || t >= now) continue;
    const bucket = buckets[Math.min(count - 1, Math.floor((t - first) / step))];
    if (row.auto) bucket.auto += 1; else bucket.manual += 1;
  }
  return buckets;
}

/** Pausa em vigor: não retomada e dentro do prazo (mesma regra de `is_instance_paused`). */
export function isPauseActive(row: Pick<PauseRow, 'paused_until' | 'resumed_at'>, now: number): boolean {
  return row.resumed_at === null && Date.parse(row.paused_until) > now;
}
```
Teste: `git show origin/claude/feat-completar-c121-261101-1330:src/lib/__tests__/instancePauseSeries.test.ts` (4 casos, 25 linhas, aplica limpo).

## 4. Hook de pausar/retomar
`git show origin/claude/feat-completar-c121-261101-1330:src/hooks/connections/useInstancePauses.ts` (61 linhas).
Núcleo (as mutations, que é o que a main não tem em lugar nenhum):
```ts
  const pause = useMutation({
    mutationFn: async (input: { instance: string; minutes: number; reason: string }) => {
      const { error } = await supabase.rpc('pause_instance', {
        p_instance: input.instance, p_minutes: input.minutes, p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const resume = useMutation({
    mutationFn: async (instance: string) => {
      const { error } = await supabase.rpc('resume_instance', { p_instance: instance });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
```
A leitura lê as pausas ABERTAS à parte (`.is('resumed_at', null)`) e pagina o histórico de 7 dias (`HISTORY_PAGE = 1000`, `HISTORY_MAX_PAGES = 10`) para a série não perder registro em silêncio.

**CONFLITO A RESOLVER AO PORTAR (não é cosmético):** a branch usa
`export const INSTANCE_PAUSES_KEY = ['instance-pauses']`, **a mesma chave de react-query** de
`origin/main:src/components/monitoring/hooks/useInstancePauses.ts:12` (`INSTANCE_PAUSES_QUERY_KEY = ['instance-pauses']`),
e as duas queries devolvem **shapes diferentes** (monitoring: `investigated_at`/`investigation_notes`; conexões: `paused_by`/`resumed_by`). Se as duas telas montarem, uma sobrescreve o cache da outra. Opções: (a) chave distinta (`['instance-pauses','conexoes']`); (b) melhor — colocar `pauseInstance`/`resumeInstance` em `src/services/instance-pauses.service.ts`, que a própria main declara como *"único ponto do front que fala com essa tabela/RPC"* (`:7-8`), e ampliar `SELECT_COLUMNS` (`:31`) com `paused_by, resumed_by`; as colunas existem em produção.

## 5. Painel + montagem
`git show origin/claude/feat-completar-c121-261101-1330:src/components/connections/InstancePausesPanel.tsx` (180 linhas).
Tem o que o AGENTS.md exige de ponta a ponta: gate `useUserRole().isSupervisor` (retorna `null` para o resto), estados carregando/erro/vazio, diálogo com validação de 5–1440 min + motivo obrigatório, toasts de sucesso/erro, relógio vivo de 15 s (pausa que vence entre leituras deixa de aparecer como ativa), tabela `sr-only` para acessibilidade da série.

Montagem em `src/components/connections/ConnectionsView.tsx` — 2 linhas; âncoras na main:
```
main:23   import { NumberReputationMonitor } from './NumberReputationMonitor';   ← inserir o import depois
main:282        <NumberReputationMonitor />                                      ← inserir <InstancePausesPanel connections={connections} /> antes
```
O shape exigido (`{ id, name, instance_id }`) bate com `origin/main:src/hooks/inbox/useConnectionsManager.ts:12` e o `select` de `:161`.

**TEXTO A CORRIGIR AO PORTAR:** o `DialogDescription` do painel diz *"Campanhas e a fila de entrega ainda não respeitam a pausa."* Isso era verdade em 01/11 e **hoje é falso**: `message-delivery/index.ts:14`, `multiplix-send/index.ts:13`, `talkx-scheduler/index.ts:25` e `talkx-send/process-recipient.ts:18` já consultam `isInstancePaused`. Trocar por algo como *"Envios do atendente, campanhas e a fila de entrega ficam suspensos até o fim da pausa ou até você retomar."*

Testes dependentes (1 linha de `vi.mock` cada, aplicam limpo):
`src/components/connections/__tests__/ConnectionsView.{desconectar,erro-dialogo,sync-historico,telefone-validacao,trava-multiconexao}.test.tsx` →
`vi.mock('../InstancePausesPanel', () => ({ InstancePausesPanel: () => null }));`
`src/components/__tests__/reduzirMovimentoInboxCrmConexoes.test.tsx` →
`vi.mock('@/components/connections/InstancePausesPanel', () => ({ InstancePausesPanel: () => null }));`
Mais o teste próprio do painel: `git show origin/claude/feat-completar-c121-261101-1330:src/components/connections/__tests__/InstancePausesPanel.test.tsx` (56 linhas).

## 6. Cosmético (opcional)
`supabase/functions/_shared/talkx-resume-policy.ts:170` — trocar o ternário de 2 ramos por 3, acrescentando
`pauseReason === "instance_paused" ? "instância pode ter voltado — talkx-send re-pausa se ainda estiver inativa"`.
Só muda o texto explicativo; a decisão de retomar já é idêntica.

## Não portar
`ESTADO.md`, `docs/DB-INVENTORY.md`, `supabase/deployment-manifest.json` — gerados por automação; regerar depois do merge.

## Verificação adversarial

Tentei refutar o veredito PERDIDA_PARCIAL e **não consegui**. `origin/main` em `dac285f62`.
Confirmo as três lacunas; nenhuma está na main, nenhuma foi removida de propósito e todas ainda
encaixam no código atual.

**1. Auto-pausa no 429 é código morto (maior risco)**
- `git grep -n "auto_pause_instance" origin/main -- src supabase/functions scripts e2e` →
  única linha `src/integrations/supabase/types.ts:12531` (tipo gerado). Zero chamadores.
- `git log -S'auto_pause_instance' --oneline origin/main -- supabase/functions src` → só commits de
  regeneração de `types.ts` e o revert `e9da73ad4` (desfez a *migration* IP2, não um chamador que
  existisse). Nunca houve chamador na main: não é remoção deliberada.
- Nenhum substituto: `git grep -n "429" origin/main -- supabase/functions` (fora de rate-limit local
  e IA) mostra que 429 do provedor é tratado apenas como transitório com retentativa
  (`_shared/messaging/errors.ts:183`, `:38`; `_shared/evolution-api-proxy.ts:78` tem 429 em
  `RETRYABLE_STATUSES`). Ou seja: a main **retenta** num número já limitado, exatamente o
  comportamento de risco de ban. Produção tem `auto_pause_instance(p_instance text, p_minutes integer,
  p_reason text)` (pg_proc), assinatura idêntica à chamada da branch.

**2. Gate de pausa na `evolution-api` ausente**
- `git show origin/main:supabase/functions/evolution-api/index.ts | grep -c is_instance_paused` → `0`.
  `git grep -niE "paus" origin/main -- supabase/functions/evolution-api/index.ts` → nada (a linha 63
  é o rate limit local por IP).
- `PAUSE_BLOCKED_ACTIONS` / `_shared/instance-pause-actions.ts` não existem na main
  (`git ls-tree origin/main supabase/functions/_shared/`; `git log -S'PAUSE_BLOCKED_ACTIONS' origin/main`
  vazio).
- A janela de manutenção **não** substitui: `evolution-api/index.ts:272` gate só
  `connect/restart-instance/disconnect/create-instance/create-connection/sync-instance-token`, é global
  (`global_settings.whatsapp_maintenance_until`) e não tem UI (`EvolutionDisconnectBanner.tsx:69`
  registra que o front não lê). Não bloqueia envio nem é por instância.
- Encaixa: a main mantém `action`, `instance`, `supabase` de serviço, `Logger` e o helper
  `const proxy = async (...)` em `evolution-api/index.ts:259-260` com a mesma assinatura de
  `proxyToEvolution` — os dois hunks da branch são rework trivial (envolver o `proxy` em bloco).

**3. Freio manual do operador ausente**
- `git grep -nE "pause_instance|resume_instance" origin/main -- src` (sem `types.ts`) → vazio.
  `git log -S'InstancePausesPanel' origin/main` → vazio.
- O que a main tem (IP2, #2822) é só leitura + investigação: `src/services/instance-pauses.service.ts`
  expõe `fetchInstancePauses` (`:89`) e `markPauseInvestigated` → RPC `mark_pause_investigated` (`:141`);
  `src/components/monitoring/hooks/useInstancePauses.ts` devolve `pauses`, `markInvestigated`,
  nada de pausar/retomar. `git grep -i "pausar|retomar" origin/main -- src/components/monitoring` só
  acha o botão de pausar o *auto-refresh* da timeline (`MonitoringEventTimeline.tsx:137`).
- Encaixa: produção tem `pause_instance(p_instance,p_minutes,p_reason)` e `resume_instance(p_instance)`,
  e `public.instance_pauses` tem todas as colunas que o hook da branch lê (`paused_by`, `resumed_by`,
  `auto`, `resumed_at`, `created_at`).

**Ressalva de reintegração (não muda o veredito):** a branch cria
`src/hooks/connections/useInstancePauses.ts` com `INSTANCE_PAUSES_KEY = ['instance-pauses']`, a **mesma**
query key do hook já existente em `src/components/monitoring/hooks/useInstancePauses.ts`
(`INSTANCE_PAUSES_QUERY_KEY`), e fala com o `supabase` direto, enquanto a main padronizou tudo em
`src/services/instance-pauses.service.ts`. Portar o hook como está cria dois shapes no mesmo cache.
Ao resgatar: estender o service com `pauseInstance`/`resumeInstance` + histórico de 7 dias e fazer o
painel consumir o hook de monitoring, em vez de criar um hook paralelo.

Veredito mantido: **PERDIDA_PARCIAL**. Branch **não** pode ser apagada antes do resgate dos itens 1–3.
