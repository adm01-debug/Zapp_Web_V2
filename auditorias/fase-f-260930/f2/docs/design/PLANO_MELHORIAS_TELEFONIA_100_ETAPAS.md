# PROMPT DE EXECUÇÃO — MELHORIAS DO MÓDULO TELEFONIA (`?view=voip`) | ZAPP WEB V2 — 100 ETAPAS

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR) — em **duas sessões** `claude -p` (ver seção 3.4 e os comandos de disparo no fim)
> **Repo:** `adm01-debug/Zapp_Web_V2` (branch base `main` @ `c660ff96` ou posterior)
> **Deploy:** Vercel `zapp_web_v2` (team `juca1`) — preview automático por branch; merge em `main` = produção
> **Tela alvo:** `https://zapp-web-v2.vercel.app/?view=voip` (item "Telefonia" da sidebar)
> **Referência visual:** `ZAPP_WEB_V2_TELEFONIA_SUGESTAO.png` (1672×941). **Ela define estrutura, densidade, hierarquia e comportamento. NÃO define cores.** As cores são as do sistema atual (paleta carvão, `src/styles/tokens.css`) — nenhum token muda, nenhuma cor nova entra. Toda cor do mockup já está mapeada para um token na seção 2.2.
> **Base de trabalho:** `ZAPP_WEB_V2_TELEFONIA_AUDITORIA_E_60_MELHORIAS.md` (auditoria estática de 26/09/2026, itens TEL-001…TEL-060). Este plano converte os 60 itens em 100 etapas executáveis, na ordem em que precisam acontecer, e acrescenta o que a auditoria deixou em aberto (provedor real, gravação, QA).
> **Ledger de progresso (obrigatório):** `docs/design/TELEFONIA_STATUS.md`
> **Destino deste arquivo no repo:** `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`
> **Versão:** 1.0 — 26/09/2026

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 O que este plano é — e o que não é

- É um plano de **funcionalidade + layout**. Não é redesign de paleta. Se em algum momento parecer necessário mudar `tokens.css`, `presets.ts`, `tailwind.config.ts` (cores) ou fontes: **pare, registre no ledger e não faça.**
- O mockup tem dados ilustrativos (Mariana Costa, Rafael Martins, "128", "3m 42s", rodapé "Dados ilustrativos"). **Nada disso entra no código.** Sem dado real, a UI mostra estado vazio honesto.
- Um ícone de WhatsApp na tela **não é** uma ligação por WhatsApp. Canal só aparece como "disponível para ligar" quando o transporte foi comprovado (seção 2.7 e Fase 4). Nada de simular.
- Este módulo é a **central pessoal** do agente ("Minhas ligações"). Configuração administrativa (servidor SIP, usuário, porta, gravação automática) **sai da tela** — vira provisionamento no backend.

### 0.2 Regras invioláveis (anti-falha)

1. **Nenhum checkpoint fecha sem evidência.** Evidência = caminho de screenshot + saída de script/teste + SHA do commit no ledger. "Feito" sem arquivo não existe.
2. **Ordem é lei: contrato → banco → motor → tela.** Não abra `VoIPPanel.tsx` para layout antes do CP4. Tela bonita em cima de estado errado foi exatamente o problema do módulo hoje.
3. **Nunca afirme "validado", "testado", "funcionando"** sem o comando rodado. Escreva o número: `search_my_calls p2 = 8 linhas, total 131`, `row h = 56.5px (alvo 57 ±3)`.
4. **Diff mínimo por arquivo.** Reescrita autorizada **apenas** em: `VoIPPanel.tsx` (vira `TelefoniaView.tsx` + alias), `DialPad.tsx` (extração do `Keypad`), `IncomingCallAlert.tsx`, `CallDialog.tsx`, `voip-security-gaps.test.ts`, `VoIPPanel.test.tsx`. Todo o resto é edição cirúrgica.
5. **Zero regressão funcional.** A seção 4 é contrato.
6. **Banco só aditivo.** `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, índices novos. Nunca `DROP`, nunca `ALTER TYPE`, nunca reescrever histórico. Backfill só com evidência (seção 2.7).
7. **DDL em produção nunca é aplicado pela sessão `claude -p`.** A migration vai em PR própria (PR-A), fica **aberta** e a sessão encerra. Joaquim aprova; a aplicação acontece pelo chat (MCP Supabase). Sessão 2 só começa depois disso.
8. **Componentes compartilhados** (`PageHeader`, `Button`, `Badge`, `Tabs`, `Select`, `AppShell`, `AppProviders`) mudam só por prop/variante nova com default = comportamento atual.
9. **Zero cor hardcoded.** Proibido `#hex`, `hsl(...)`, `rgb(...)` em `src/components/calls`, `src/providers`, `src/components/layout`. Só classes de token (`bg-card`, `border-border`, `text-primary`, `bg-success/15`, …). O script E.3 audita isso.
10. **Ratchets são gates.** Após cada fase: `npm run typecheck` (baseline **zero**), `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `npm run implicit-any-check`, `npx vitest run src/components/calls src/hooks src/lib/calls src/providers`. Baseline só muda conforme `scripts/ci/README.md`, com justificativa no commit.
11. **Armadilha do lint-ratchet:** ele casa violações legadas por `contextHash` das linhas vizinhas. Inserir código *antes* de uma violação antiga acusa dívida nova → mova a inserção para depois do trecho legado.
12. **Fluxo Git:** worktree próprio, branch **nova com carimbo** (`claude/<tipo>-<slug>-<AAMMDD-HHMM>`), nunca `main`, nunca branch alheia. Um commit por fase, mensagem `feat(telefonia): fase N — <o que>`. Push com `git push --no-verify` (o hook pre-push trava sessões `-p`). Antes de cada push, `git log -1 --format=%an` na branch tem que ser você.
13. **Sem bibliotecas novas no repo.** `sip.js`, `framer-motion`, `@tanstack/react-query`, `date-fns`, `lucide-react` já existem e bastam. Em `/workspace/qa` (fora do repo) pode: `playwright`, `pngjs`, `pixelmatch`, `@axe-core/playwright`.
14. **Máximo 3 iterações por loop visual/medida.** Na 3ª, registre o resíduo e siga.
15. **Se o plano contradisser o código real, o código real vence** — e a divergência entra no ledger antes da decisão.
16. **Escopo é escopo.** Bug fora de `calls/telefonia` encontrado no caminho → linha em "Pendências" do ledger, não fix.

### 0.3 Regras da sessão `claude -p` (armadilhas já pagas neste repo)

- Nunca `pkill -f <padrão genérico>` (porta, vite, node): o argv contém o prompt e mata a própria sessão. Matar preview pelo PID em arquivo `.pid` ou `fuser -k <porta>/tcp`.
- `claude -p` é one-shot. **Nunca termine o turno com comando em background pendente** dizendo que "vai retomar": não vai. Faça polling (`sleep`/checar `.done`) no mesmo turno até terminar, por mais que demore.
- Shell dos containers é `dash`: sem `[[ ]]`, arrays, `source`. Sem `python3`: QA em Node.
- Segredos: `/workspace/.secrets/zapp-v2.env` (volume persistente). `/root/.secrets` some quando o container é recriado.
- Repo instala com **bun** (`bun install --frozen-lockfile`, `bun.lock`); scripts rodam com `npm run`/`npx` normalmente.
- Modal de onboarding ("Bem-vindo, QA! 🎉") intercepta cliques na primeira visita do usuário de QA — dispensar antes de interagir (E.1 já trata).
- URL de preview: obter pelo deployment real (`vercel ls`/MCP Vercel/`github_list_deployments`), não chutar o slug.
- Cota semanal do Claude Code é compartilhada por todas as sessões `-p` do container. Se acabar, a sessão morre; o ledger é o mecanismo de retomada: **ao iniciar, leia o ledger e continue da primeira etapa sem `[x]`.**

---

## 1. CONTEXTO VERIFICADO (26/09/2026)

### 1.1 Arquivos reais do módulo

`src/components/calls/`: `VoIPPanel.tsx` (14,5 KB, tela inteira) · `DialPad.tsx` · `CallDialog.tsx` · `IncomingCallAlert.tsx` · `__tests__/{VoIPPanel.test.tsx, voip-security-gaps.test.ts}`.
Hooks: `src/hooks/communication/useSipClient.ts` (saída SIP, mídia, DTMF, timer, insert final) · `src/hooks/sip/useSipConnection.ts` (registro, reconexão por `setTimeout` sem handle) · `src/hooks/communication/useCalls.ts` (CRUD: `startCall`, `endCall`, `addCallNotes`, `getContactCalls`) · `src/hooks/communication/useIncomingCallListener.ts` (notificações `incoming_call`, dedupe por `notification.id`) · `src/hooks/__tests__/useSipClient.test.ts`.
Integração: `supabase/functions/get-sip-password/index.ts` (JWT + perfil ativo + rate limit → devolve **um** `SIP_PASSWORD` comum a todos) · `supabase/functions/_shared/evolution-webhook-handlers.ts` (`handleCallEvent` → RPC) · `src/components/inbox/contact-details/{ContactHeaderSection,ContactActionButtons}.tsx` (click-to-call do inbox; emitem `start-voip-call`) · `src/pages/ViewRouter.tsx` (rota `voip`; `voip` **não** está no conjunto de gutters compactos) · `src/providers/AppProviders.tsx` · `src/App.tsx` (monta `IncomingCallAlert` global).
Já disponível e reutilizável: `PageHeader` com `variant="plain"` e `topRight` (usado em Contatos/Dashboard) · `Card/Badge/Tabs/Select/Input/Button/Textarea/Sheet` (shadcn) · `search_contacts` RPC via `src/services/contact.service.ts` · `getInitials/getAvatarColor` em `@/lib/avatar-colors` · `animate-shimmer` em `tailwind.config.ts` · classes `bg-kpi-*` (tiles) se ainda presentes após o redesign de Contatos (confirmar na etapa 5).

### 1.2 O que a tela faz hoje (`VoIPPanel.tsx`, lido linha a linha)

- Título "VoIP & Chamadas", subtítulo "Click-to-call, histórico de chamadas e gravações", `max-w-4xl mx-auto` (a tela ocupa ~55% do desktop).
- 5 KPIs (`Total, Recebidas, Realizadas, Perdidas, Duração Média`) calculados **sobre o array da query** — que tem `.limit(50)` e **não filtra agente nem período**. "Duração Média" arredonda para minutos (`0min`).
- 3 abas: **Discador** (inicial), Histórico, **Configurações** (servidor `ip.b24-9441-1552764901.bitrixphone.com`, usuário `phone1`, porta `8089`, switches "Habilitar VoIP" e "Gravação automática" — tudo em `localStorage['voip_sip_settings']`).
- Discador exige clique em "Conectar SIP"; `handleSipConnect` chama `get-sip-password` e mostra erro técnico ("Adicione o segredo SIP_PASSWORD no Supabase").
- Histórico: cards por linha com "Chamada recebida/realizada" + data + duração + badge de status (`completed/missed/busy/ringing/ongoing` — **`ended`/`answered`/`failed`, que são os status realmente gravados pela RPC, caem no fallback "status cru"**). Botão de gravação aparece se `recording_url` mas **não tem handler**. Sem nome, telefone, canal, busca, filtro, paginação ou detalhe.
- `useSipClient` é instanciado **dentro da view**: trocar de módulo desmonta a sessão SIP.

### 1.3 Banco — estado a partir das migrations (verificar aplicação real na etapa 18)

- `public.calls`: `id, contact_id, whatsapp_connection_id, agent_id, direction ('inbound'|'outbound'), status, started_at, answered_at, ended_at, duration_seconds, recording_url, notes, provider_event_id` (+ unique parcial `(whatsapp_connection_id, provider_event_id)`).
- RPC `record_incoming_call_event(...)` (service_role, migration `20260922220000`): só `inbound` WhatsApp; status aceitos `ringing|answered|ended|missed|busy|failed`; **`agent_id` deriva de `contacts.assigned_to` e é regravado no `ON CONFLICT`**; **`notes` é sobrescrito** com "Chamada de voz/vídeo"; notificação `incoming_call` com `metadata.call_id`.
- RLS de leitura (migration `20260317223223`): próprias (`agent_id` = perfil do usuário) ou admin/supervisor via `has_role`. Policies de `insert/update` para o agente: **a confirmar**.
- Índices simples em `agent_id`, `contact_id`, `whatsapp_connection_id` (migration `20260827120000`).

### 1.4 Motor e fluxos (auditoria S02–S07, S11)

- SIP só de saída (`Inviter`); **não há `onInvite`** → nenhuma ligação VoIP recebida chega ao navegador.
- `sessionRef` só recebe o `Inviter` **depois** do `await invite()`; `hangUp` seta `idle` **antes** da confirmação e o handler `Terminated` decide `ended|missed` lendo esse estado → chamada atendida pode ser gravada como perdida.
- Insert do log SIP acontece **uma vez, no fim**, e **ignora `error`** do retorno.
- Timer da UI começa em `Established`; `duration_seconds` persistido mede do início da discagem → dois números diferentes para a mesma chamada.
- `IncomingCallAlert`: "Atender" só abre `CallDialog` (que faz **outro `insert`** ao abrir), "Recusar" só chama `dismissCall()`; timeout de 30 s não sabe se a chamada foi atendida.
- `useIncomingCallListener` identifica pela `notification.id`, não pelo `metadata.call_id` que a RPC já manda.
- `findContactByPhone` casa igualdade **ou sufixo de 8 dígitos** com `limit(1)` → vínculo errado é possível.
- `ContactHeaderSection` recebe o tipo do canal e **ignora**; `ContactActionButtons` emite `start-voip-call` e a busca não achou consumidor (confirmar na etapa 4/5).
- `voip-security-gaps.test.ts` usa `expect(true).toBe(true)`.

### 1.5 Provedores reais (a confirmar na etapa 6 — o plano tem ramo para cada resposta)

| Pergunta | Indício | Consequência |
|---|---|---|
| O servidor SIP é o **SIP Connector do Bitrix24**? | host `*.bitrixphone.com`, porta WSS 8089 (Asterisk) | Se sim: gravação, duração e resultado oficiais existem em `voximplant.statistic.get` (`CALL_RECORD_URL`, `CALL_DURATION`, `CALL_FAILED_CODE`) → Fase 9 reconcilia sem inventar nada. |
| A linha `wpp2` (Evolution) é **Baileys** ou **Cloud API**? | `whatsapp_connections.integration` | Baileys: recebe **eventos** de chamada (tocando/perdida/encerrada), **não transporta áudio nem origina**. Cloud API: só com aprovação de Calling da Meta + WebRTC próprio — P2, fora desta entrega. |
| Há endpoint de **recusar** chamada no Evolution? | docs/MCP EVO | Se não: "Recusar" vira "Ignorar" (registro local `declined`), rótulo honesto. |
| O ramal `phone1` é **compartilhado** por todos os agentes? | `get-sip-password` devolve um segredo único | Sim, hoje. Dois agentes registrados ao mesmo tempo disputam a linha. Detecção de conflito entra (etapa 31); ramal por agente é decisão de custo (seção 5). |

---

## 2. ESPECIFICAÇÃO DE PRODUTO E UI

### 2.1 Princípios

1. **Histórico é o conteúdo inicial.** Abrir Telefonia mostra as minhas ligações do período. Discar fica sempre à mão, no painel lateral.
2. **Escopo explícito:** "Minhas ligações" + período visível. Admin/supervisor pode trocar para "Todas as ligações". Nunca "todas" silenciosamente.
3. **Canal ≠ transporte.** Filtro de canal do histórico e canal de discagem são estados independentes. Cada canal exibe sua disponibilidade real.
4. **Linguagem operacional.** "Telefone indisponível", "Reconectando…", "Microfone bloqueado". Nada de SIP, WSS, segredo, Supabase na tela do agente.
5. **Uma ligação = uma linha em `calls`**, do primeiro evento ao fim, atualizada no mesmo `id`.
6. **Sessão sobrevive à navegação.** Barra compacta de chamada ativa em qualquer módulo.
7. **Nada prometido sem dado:** gravação, transcrição, espera, transferência, conferência, vídeo não aparecem.

### 2.2 Mapa cor/estado → token (nenhuma cor nova; o script E.3 confere)

| Elemento do mockup | Classe (token atual) |
|---|---|
| Fundo da página / cards / painéis | `bg-background` / `bg-card border border-border` |
| Inputs, selects, busca | `bg-input border-border` |
| Tile KPI "Total", "Recebidas", "Duração média" (azul) | `bg-primary/15 text-primary` |
| Tile KPI "Realizadas" (verde) | `bg-success/15 text-success` |
| Tile KPI "Perdidas" (vermelho) | `bg-destructive/15 text-destructive` |
| Chip "VoIP disponível" / "WhatsApp disponível" | `bg-card border-border text-foreground` + dot `bg-success` (ok) / `bg-warning animate-pulse` (reconectando) / `bg-destructive` (indisponível) |
| Badge canal WhatsApp | `bg-success/10 border-success/30 text-success` |
| Badge canal VoIP | `bg-primary/10 border-primary/30 text-primary` |
| Direção Recebida / Realizada / Perdida | `text-primary` (↓) / `text-success` (↑) / `text-destructive` (↓) |
| Resultado Concluída / Perdida / Ocupado / Falhou-Cancelada-Recusada / Em andamento | dot `bg-success` / `bg-destructive`+`text-destructive` / `bg-warning`+`text-warning` / `bg-muted-foreground` / `bg-primary animate-pulse` |
| Aba de canal ativa (sublinhado) | `text-primary border-b-2 border-primary` |
| Linha selecionada da tabela | `bg-primary/5 border-l-2 border-l-primary` |
| Hover de linha | `hover:bg-muted/30` |
| Avatar iniciais | `getAvatarColor(nome)` (util do módulo Contatos) |
| Segmentado VoIP/WhatsApp ativo | `bg-primary text-primary-foreground` |
| Teclas do teclado | `bg-muted/50 border-border hover:bg-muted` |
| CTA "Ligar via VoIP" | `bg-primary text-primary-foreground hover:bg-primary/90` |
| CTA "Cancelar"/"Encerrar" · "Atender" | `bg-destructive` · `bg-success` |
| "Ouvir gravação" | `bg-card border-border hover:bg-muted` |
| Paginação ativa | `bg-primary text-primary-foreground border-primary` |
| Foco | `focus-visible:ring-2 ring-ring` |

Modo claro e as 19 skins Opera GX **continuam funcionando sem nenhuma alteração** porque só tokens são usados (verificar na etapa 95).

### 2.3 Tipografia (família e tokens atuais; escala do padrão já usado em Contatos/Dashboard)

| Elemento | Classe |
|---|---|
| Título "Telefonia" | `PageHeader variant="plain"` (36px/800 — o mockup mostra ~28px; **padrão do sistema vence**) |
| Subtítulo | `text-lg text-muted-foreground` (do `PageHeader`) |
| Chips/período do topo | `text-sm font-medium` |
| KPI valor / label | `text-[26px] font-bold tabular-nums` / `text-[13px] text-muted-foreground` |
| Título do card de histórico | `text-xl font-bold` · badge contagem `text-xs font-semibold tabular-nums` · "Minhas ligações" `text-sm text-muted-foreground` |
| Abas de canal | `text-sm font-medium` (ativa `text-primary`) |
| Cabeçalho da tabela | `text-[13px] font-medium text-muted-foreground` |
| Nome / número na linha | `text-sm font-medium text-foreground` / `text-[13px] text-muted-foreground` |
| Badges de canal/resultado | `text-[13px] font-medium` |
| Painel: título | `text-lg font-semibold` |
| Teclas | dígito `text-lg font-semibold`, letras `text-[10px] tracking-wider text-muted-foreground` |
| Timer da chamada ativa | `text-3xl font-bold tabular-nums` |
| Hint sob o CTA | `text-xs text-muted-foreground text-center` |

### 2.4 Geometria (medida na referência 1672×941; sidebar 254 + gutter compacto)

| Bloco | Alvo | Tol. |
|---|---|---|
| Início do conteúdo (x) | 278 (sidebar + gutter compacto já usado por inbox/pipeline) | ±6 |
| Linha do topo: chips + período | h **40**; chip VoIP w≈146, chip WhatsApp w≈206, período w≈224; gap 12 | ±4 |
| KPI card | h **78**, radius 14, 5 colunas, gap 12 | ±4 |
| KPI tile | **44×44**, radius 12 (mockup usa círculo; padrão do sistema é `rounded-xl`) | ±2 |
| Card Histórico | w = viewport − painel(408) − gaps; min-h 600; padding 16 | — |
| Abas de canal | h **40**, sublinhado 2px | ±2 |
| Toolbar (busca, Direção, Resultado) | h **40**, radius 12; busca flex-1; Direção w 180; Resultado w 196 | ±4 |
| Cabeçalho da tabela | h 32 | ±4 |
| Linha da tabela | h **57** | ±3 |
| Avatar da linha | 40 | ±2 |
| Botões de ação da linha | 32×32 | ±2 |
| Paginação | botões **36×36**, radius 10 | ±2 |
| Painel lateral | w **408** | ±8 |
| Segmentado VoIP/WhatsApp | h 40 (grupo 48 com padding 4) | ±2 |
| Busca de contato | h 40 | ±2 |
| Chip do contato selecionado | h 60 | ±4 |
| Tecla | **112×46**, radius 10, gap 10 | ±3 |
| CTA "Ligar via…" | h **44**, full width, radius 12 | ±2 |
| Card "Ligação selecionada" | min-h 175 | — |
| Barra de chamada ativa (outros módulos) | h 48 | ±2 |

### 2.5 Wireframe (desktop ≥ 1280)

```
┌ 278px ───────────────────────────────────────────────────────────────────────────────┐
│ ☎ Telefonia                              [☎ VoIP disponível ●] [WA WhatsApp… ●] [📅 Últimos 7 dias ▾] │
│   Suas ligações por VoIP e WhatsApp                                                                    │
│ ┌KPI──────┐ ┌KPI──────┐ ┌KPI──────┐ ┌KPI──────┐ ┌KPI──────┐                                   h78  │
│ │[☎] 128  │ │[↗] 76   │ │[↓] 52   │ │[✕] 7    │ │[◷] 3m42s│                                        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘                                        │
│ ┌Histórico de ligações (128)  Minhas ligações ▾ ─────────────┐ ┌Nova ligação ───────────────┐ 408  │
│ │ Todos os canais │ VoIP │ WhatsApp                          │ │ [ VoIP ] [ WhatsApp ]       │      │
│ │ [🔍 Buscar por nome ou número…] [Direção: Todas▾] [Resultado: Todos▾] │ │ [🔍 Nome ou número…     ✕] │      │
│ │ Contato · Canal · Direção · Resultado · Data e hora ↓ · Duração · Ações│ │ (RM) Rafael… +55 (11)… ✕    │      │
│ │ (MC) Mariana Costa  WhatsApp  ↓Recebida  ●Concluída 25 set·16:42 04:18 ☎ ▶ │ │ [1][2][3]                  │      │
│ │▌(RM) Rafael Martins VoIP     ↑Realizada ●Concluída 25 set·16:25 02:36 ☎ ▶ │ │ [4][5][6]                  │      │
│ │ …8 linhas…                                                                │ │ [7][8][9]                  │      │
│ │ 1–8 de 128 ligações                     [‹][1][2][3][…][16][›]           │ │ [*][0][#]                  │      │
│ └───────────────────────────────────────────────────────────────────────────┘ │ [   ☎ Ligar via VoIP     ] │      │
│                                                                               │ Confira o número antes…    │      │
│                                                                               └────────────────────────────┘      │
│                                                                               ┌Ligação selecionada ─────────┐      │
│                                                                               │ (RM) Rafael Martins ●Concluída│    │
│                                                                               │ VoIP · Realizada 25 set 02:36 │    │
│                                                                               │ [▶ Ouvir gravação]  (se houver)│   │
│                                                                               └────────────────────────────┘      │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Durante uma chamada, o card "Nova ligação" é substituído por "Chamada ativa" no mesmo slot. Em outros módulos, aparece a barra compacta no topo do `main`.

### 2.6 Matriz de estados da tela

| Situação | Chips do topo | Painel lateral | Histórico |
|---|---|---|---|
| Tudo ok, ocioso | VoIP ● verde · WhatsApp ● verde (ou "só recebidas") | Nova ligação | Lista |
| SIP reconectando | VoIP ● amarelo pulsando "Reconectando…" | CTA "Reconectando…" desabilitado | Lista (não bloqueia) |
| SIP indisponível (sem provisionamento, 403, rede) | VoIP ● vermelho "Telefone indisponível" + tooltip motivo | CTA desabilitado + hint | Lista |
| Microfone bloqueado | VoIP ● amarelo "Microfone bloqueado" | hint com instrução curta | Lista |
| Discando / tocando (saída) | — | Chamada ativa: "Chamando…" + Cancelar | linha nova `ringing` aparece no topo |
| Recebendo (VoIP ou WhatsApp) | — | Chamada ativa: Atender / Recusar-Ignorar (+ alerta global) | — |
| Em ligação | — | timer, Mute, Teclado (DTMF), Encerrar | — |
| Pós-chamada (3 s) | — | resumo + anotação rápida + "Ligar novamente" | linha atualizada (resultado/duração) |
| Linha WhatsApp Baileys | WhatsApp "só recebidas" ● verde | opção WhatsApp desabilitada com motivo | badge normal |
| Sem ligações no período | — | Nova ligação | "Suas ligações aparecem aqui" + CTA |
| Filtro sem resultado | — | — | "Nenhuma ligação com esses filtros" + Limpar |
| Erro ao carregar | — | — | "Não foi possível carregar" + Tentar novamente |

### 2.7 Contrato de dados

**Canal (`calls.channel`):** `'voip' | 'whatsapp'`. Backfill: `whatsapp_connection_id IS NOT NULL → 'whatsapp'`, senão `'voip'` — evidência: a única trilha que preenche `whatsapp_connection_id` é o webhook Evolution; o SIP nunca preenche. Registrar a contagem por lado no ledger antes de aplicar.

**Status persistido (`calls.status`)** — união do que existe hoje, sem apagar legado: `ringing | answered | ended | missed | busy | failed | cancelled | declined`. Legados `completed`→lê-se como `ended`, `ongoing`→`answered` (tradução na leitura, nunca `UPDATE` em massa).

**Resultado exibido** (`toResult(row)` em `src/lib/calls/callStatus.ts`):

| Persistido + contexto | Resultado | Rótulo |
|---|---|---|
| `ended` com `answered_at` | `completed` | Concluída |
| `ended` sem `answered_at`, inbound | `missed` | Perdida |
| `ended` sem `answered_at`, outbound | `no_answer` | Não atendida |
| `missed` | `missed` | Perdida |
| `busy` | `busy` | Ocupado |
| `failed` | `failed` | Falhou |
| `cancelled` (local, antes de atender) | `cancelled` | Cancelada |
| `declined` (recusada por nós) | `declined` | Recusada |
| `answered` sem `ended_at` | `in_progress` | Em andamento |
| `ringing` sem `ended_at` | `ringing` | Tocando |

**Duração:** `talk_seconds` (atendimento→término) é o que aparece como "Duração" e entra na média. `duration_seconds` legado permanece, mas não é exibido. Formatos: tabela `mm:ss`/`h:mm:ss`; KPI `3m 42s`/`1h 02m`.

**Identidade:** `provider_call_id` (SIP `Call-ID` / Evolution `data.id` / Bitrix `CALL_ID`) único por canal; `provider_event_id` existente fica como está. O front gera `id` (uuid) antes de discar e atualiza sempre o mesmo.

**Autoria:** `agent_id` = responsável no momento do evento (não regravar depois); `answered_by` = quem atendeu de fato. `notes` = metadado do provedor (automático, somente leitura); `agent_notes` = anotação humana.

**Escopo:** `mine` = `agent_id = (perfil do auth.uid())`; `all` só para `has_role(auth.uid(),'admin')` ou `'supervisor'` — decidido **dentro** da RPC, nunca pelo front.

**KPIs** seguem escopo + período + canal. **Não** seguem busca/direção/resultado (o rótulo "Minhas ligações · Últimos 7 dias" deixa isso visível).

### 2.8 Motion (comedido; tudo sob `useReducedMotion`)

- KPIs: fade 150 ms, `delay: i*0.03` (máx 5). Sem count-up.
- Troca Nova ligação ↔ Chamada ativa: `AnimatePresence mode="wait"`, 120 ms.
- Linha selecionada: transição de `background-color` 120 ms.
- Dot "Em andamento"/"Tocando" e chip "Reconectando…": `animate-pulse`.
- Botões de ação principais: `whileTap={{ scale: 0.98 }}`.
- **Remover:** stagger por linha do histórico (`delay: i*0.03` sobre 50 itens), `motion.div` no título.

---

## 3. ARQUITETURA DA MUDANÇA

### 3.1 Arquivos alterados (diff cirúrgico salvo onde marcado)

| Arquivo | Mudança |
|---|---|
| `src/pages/ViewRouter.tsx` | `voip` entra no conjunto de gutters compactos (só a chave) |
| `src/providers/AppProviders.tsx` | monta `CallSessionProvider` |
| `src/App.tsx` | `IncomingCallAlert` passa a consumir o provider (mesma posição) |
| `src/components/layout/AppShell.tsx` | slot da `ActiveCallBar` no topo do `main` (render condicional, default = nada) |
| `src/components/layout/PageHeader.tsx` | prop opcional `icon?: ReactNode` (default `undefined` → markup atual) |
| `src/components/calls/VoIPPanel.tsx` | **reescrita**: vira `export { TelefoniaView as VoIPPanel }` |
| `src/components/calls/DialPad.tsx` | **reescrita parcial**: extrai `Keypad`, mantém export |
| `src/components/calls/CallDialog.tsx` | **reescrita**: sem insert ao abrir, sem estado local de mídia; consome provider |
| `src/components/calls/IncomingCallAlert.tsx` | **reescrita**: canal, Atender/Recusar/Ignorar reais, toque |
| `src/hooks/communication/useSipClient.ts` | criação do UA sai para o provider; `onInvite`; upserts idempotentes; `end_reason` |
| `src/hooks/sip/useSipConnection.ts` | handle de reconexão, backoff, UA único |
| `src/hooks/communication/useIncomingCallListener.ts` | identidade por `metadata.call_id`; ignora chamadas já encerradas |
| `src/hooks/communication/useCalls.ts` | `findContactByPhone` → correspondência exata normalizada; `addCallNotes` → `agent_notes` |
| `src/components/inbox/contact-details/{ContactHeaderSection,ContactActionButtons}.tsx` | disparam `zapp:start-call` tipado com canal e conexão |
| `supabase/functions/get-sip-password/index.ts` | devolve também `server/user/wsPort` (env); mesma autorização |
| `supabase/functions/_shared/evolution-webhook-handlers.ts` | `handleCallEvent` cobre todos os eventos, `provider_call_id`, timestamps do provedor |
| `src/integrations/supabase/types.ts` | colunas/RPCs novas (aditivo) |
| `src/components/calls/__tests__/*` | testes reais no lugar dos tautológicos |

### 3.2 Arquivos novos

| Arquivo | Conteúdo |
|---|---|
| `src/lib/calls/{callStatus,duration,phone,capabilities,session,events}.ts` (+ `__tests__/`) | contrato de domínio puro (Fase 1) |
| `src/lib/calls/adapters/{CallAdapter.ts,SipCallAdapter.ts,WhatsAppCallAdapter.ts}` | interface única de transporte |
| `src/providers/CallSessionProvider.tsx` (+ `useCallSession`) | sessão persistente, máquina de estados, líder entre abas |
| `src/hooks/calls/{useTelefoniaFilters,useMyCalls,useCallsKpi,useCallChannels,useCallRecording}.ts` | dados e capacidades |
| `src/components/calls/{TelefoniaView,TelefoniaTopActions,PeriodSelect,CallKpiCard,CallHistoryCard,CallHistoryToolbar,CallHistoryTable,CallChannelBadge,CallDirectionCell,CallResultCell,CallsPagination,NewCallPanel,ContactPicker,Keypad,ActiveCallPanel,SelectedCallPanel,RecordingPlayer,ActiveCallBar}.tsx` | tela |
| `supabase/migrations/<ts>_calls_telefonia_v2.sql` | Apêndice A |
| `supabase/tests/calls_rls.sql` | prova de RLS (Apêndice B.5) |
| `supabase/functions/{get-call-recording,sync-call-records}/index.ts` | Fase 9 (condicional) |
| `docs/telefonia/{CONTRATO.md,CAPACIDADES.md,HOMOLOGACAO.md}` | contrato, matriz real, roteiro |
| `docs/design/TELEFONIA_STATUS.md` | ledger (Apêndice F) |
| `/workspace/qa/tel/{shot,measure,colors,func}.mjs` (fora do repo) | QA (Apêndice E) |

### 3.3 O que NÃO tocar

`src/styles/*` (tokens, base, components, sidebar) · `tailwind.config.ts` (cores) · `src/components/settings/theme/*` · `index.html` · `sidebarNavConfig` · módulos Contatos/Dashboard/Inbox além dos 2 arquivos de click-to-call · `record_incoming_call_event` além das linhas listadas na etapa 23 · qualquer `DROP`/`ALTER TYPE` · `deployment-manifest` · `vite.config.ts` · `eslint.config.js`.

### 3.4 Estratégia de entrega: duas PRs, um gate humano, duas sessões

```
Sessão 1 (claude -p)  ─ Fases 0–2 ─►  PR-A "infra(telefonia): contrato de dados"  ─► [ABERTA] ─► para.
                                                                                          │
                       Joaquim: APROVADO ─► migration aplicada pelo chat (MCP Supabase) ─► PR-A mergeada
                                                                                          │
Sessão 2 (claude -p)  ─ rebase em main ─ Fases 3–11 ─► PR-B "feat(telefonia): central de ligações" ─► [ABERTA] ─► para.
                                                                                          │
                       Joaquim: APROVADO ─► merge ─► Fase 12 (verificação de produção + homologação de áudio, pelo chat)
```
Por quê: DDL em produção e mudança de `AppProviders`/`App.tsx`/Edge Functions estão na lista "PR aberta e me chame" do fluxo Git. A sessão `-p` não tem como esperar aprovação.

---

## 4. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP11/CP12)

Discar VoIP por teclado e por contato · DTMF durante a chamada · mute · encerrar · histórico das próprias ligações (agora completo) · notas em ligação (agora `agent_notes`, com salvar) · click-to-call a partir do inbox (`ContactHeaderSection`, `ContactActionButtons`) · alerta global de chamada recebida (`App.tsx`) · notificação `incoming_call` por usuário · webhook Evolution gravando eventos de chamada · `get-sip-password` com JWT + perfil ativo + rate limit · RLS de chamadas próprias/admin/supervisor · rota `?view=voip` e item "Telefonia" da sidebar · permissões de rota · responsivo/mobile · modo claro e skins.

---

## 5. DECISÕES DE NEGÓCIO PENDENTES (para Joaquim — o plano já tem o ramo de cada resposta)

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Ramal SIP | (a) manter `phone1` compartilhado + detectar conflito de registro · (b) 1 ramal por agente (custo mensal por linha no SIP Connector do Bitrix24 + tabela `sip_lines`) | **(a) agora**, (b) como P2 após medir quantos agentes ligam ao mesmo tempo |
| D2 | Ligação **de saída** por WhatsApp | (a) só receber eventos (Baileys, custo zero) · (b) migrar linha para Cloud API + aprovação de Calling na Meta + WebRTC próprio (projeto separado, semanas) | **(a)** nesta entrega, com a opção visível e desabilitada com motivo honesto |
| D3 | Gravações | (a) reconciliar com Bitrix24 (`voximplant.statistic.get`) se confirmado · (b) sem gravação (botão nunca aparece) | **(a)** se a etapa 6 confirmar; senão (b) sem enrolar |
| D4 | Escopo "Todas as ligações" | (a) admin/supervisor têm o seletor · (b) só "Minhas" para todos | **(a)** — a RLS já permite, só falta a UI |
| D5 | Linhas por página | 8 (cabe em 941 px sem rolar) · 10 · 20 | **8** |
| D6 | KPIs respondem à busca/filtros de direção/resultado? | sim · não | **Não** (escopo+período+canal), rótulo explícito |
| D7 | Recusar chamada WhatsApp | (a) rejeição real se o Evolution expuser · (b) "Ignorar" (registro local) | o que a etapa 6 encontrar; nunca fingir |

Se nenhuma resposta vier antes da Sessão 1, ela executa com as recomendações e registra isso no ledger.

---

## 6. O PLANO — 100 ETAPAS · 12 FASES · 13 CHECKPOINTS

Formato: `[ ] N. Ação — arquivo — DoD`. Marque `[x]` **só** com a evidência no ledger.

### FASE 0 — Preparação e diagnóstico (etapas 1–9) → CP0

- [ ] **1.** Worktree e branch: `cd /workspace/repos/Zapp_Web_V2 && git fetch origin && git worktree add /workspace/repos/Zapp_Web_V2-telefonia -b claude/feat-telefonia-v2-<AAMMDD-HHMM> origin/main` (carimbo = `date +%y%m%d-%H%M`). Não usar o checkout principal. — DoD: caminho, nome da branch e `git rev-parse HEAD` no ledger.
- [ ] **2.** PRs abertas: liste (MCP GitHub do container ou `git ls-remote origin 'refs/pull/*/head'` + API). Se alguma toca `src/components/calls/`, `src/hooks/communication/`, `src/hooks/sip/`, `supabase/functions/_shared/evolution-webhook-handlers.ts`, `supabase/functions/get-sip-password/` → **pare e avise** (linha `BLOQUEIO` no ledger). — DoD: lista de PRs no ledger.
- [ ] **3.** Crie `docs/design/TELEFONIA_STATUS.md` a partir do Apêndice F. Commit `chore(telefonia): ledger do plano de melhorias`. Push `--no-verify`. — DoD: arquivo commitado.
- [ ] **4.** Grafo: se `graphify-out/GRAPH_REPORT.md` existir, confira frescura (commit do report = HEAD, senão `graphify update . --force`), depois `graphify explain "VoIPPanel"`, `graphify explain "useSipClient"`, `graphify path "ContactActionButtons" "useSipClient"` (confirma se `start-voip-call` tem consumidor). — DoD: divergências com a seção 1 anotadas.
- [ ] **5.** Inventário de consumidores e reutilizáveis: `grep -rn "start-voip-call\|useSipClient\|IncomingCallAlert\|useIncomingCallListener\|CallDialog\|useCalls(\|findContactByPhone" src/` e `grep -rln "KpiCard\|kpi-tile\|bg-kpi-" src/components` e `grep -rn "normalizePhone\|toE164\|formatPhone" src/lib src/utils src/services`. Tabela "quem chama o quê" + "o que já existe" no ledger. — DoD: tabela.
- [ ] **6.** Provedores reais (seção 1.5): (a) `whatsapp_connections` — colunas e valor de `integration`/provider da linha `wpp2` (MCP Supabase do container ou `psql` com `DATABASE_URL` do env); (b) Bitrix: `grep -i bitrix /workspace/.secrets/*.env`; se houver webhook REST, `voximplant.statistic.get` com `FILTER[>CALL_START_DATE]=<7 dias>` → há registros? têm `CALL_RECORD_URL`? (c) Evolution: existe endpoint de rejeição de chamada? (`EVO - MCP`/docs). Escrever `docs/telefonia/CAPACIDADES.md` com a matriz real (canal × discar × receber × gravar × recusar) e o **motivo** de cada "não". — DoD: arquivo commitado com evidência (saídas resumidas, sem segredos).
- [ ] **7.** QA tooling: `/workspace/qa` já tem Playwright dos redesigns anteriores — `node -e "require('playwright')"`; adicionar `@axe-core/playwright` (`npm i` em `/workspace/qa`). Credenciais `ZAPP_QA_EMAIL/ZAPP_QA_PASSWORD` em `/workspace/.secrets/zapp-v2.env`; confirmar que `qa.visual` tem role `supervisor` ou `admin` em `user_roles` (precisa ver "Todas as ligações" para a tabela ter linhas). Se for `agent`, **registrar e avisar** — não alterar papel sem `APROVADO`. — DoD: linhas no ledger.
- [ ] **8.** Baseline: `bun install --frozen-lockfile` → `npm run typecheck && node scripts/ci/lint-ratchet.mjs && node scripts/ci/typecheck-ratchet.mjs && npm run implicit-any-check && npx vitest run src/components/calls src/hooks/__tests__/useSipClient.test.ts`. Tudo verde antes de mexer. (Regressão conhecida do job "Contrato DB offline" em `main` não é deste escopo — se aparecer, registrar e seguir.) — DoD: 5 comandos exit 0, saída resumida.
- [ ] **9.** Screenshot ANTES: copiar `/workspace/qa/shot.mjs` para `/workspace/qa/tel/shot.mjs` com os ajustes do Apêndice E.1 (aceita `view`, dispensa modal de onboarding, espera `text=/ligações|chamada/i`) → `node /workspace/qa/tel/shot.mjs https://zapp-web-v2.vercel.app out/tel/00-before.png dark 1672 941 voip`. — DoD: arquivo + `consoleErrors` no ledger.

**CP0 — Ambiente pronto.** Gate: etapas 1–9 com evidência; `00-before.png` existe; `CAPACIDADES.md` responde às 4 perguntas da seção 1.5.

---

### FASE 1 — Contrato de domínio (etapas 10–17) → CP1

- [ ] **10.** `src/lib/calls/callStatus.ts`: tipos `CallChannel`, `CallDirection`, `PersistedStatus`, `CallResult`, `EndReason`; `normalizeStatus(raw)` (legado `completed→ended`, `ongoing→answered`); `toResult(row)` conforme a tabela 2.7; `RESULT_LABEL` (PT-BR) e `RESULT_TONE` (`'success'|'destructive'|'warning'|'muted'|'primary'` → resolvido em classe **no componente**, não aqui); `sipCodeToEndReason(code)` (486→busy, 480/408→no_answer, 487→cancelled, 603→declined, 5xx→failed, 200→completed). — DoD: `__tests__/callStatus.test.ts` com os 10 casos da tabela + 8 códigos SIP.
- [ ] **11.** `src/lib/calls/duration.ts`: `talkSeconds(row)` = `talk_seconds ?? (answered_at && ended_at ? diff : null)`; `formatClock(s)` → `04:18`/`1:02:36`; `formatTalk(s)` → `3m 42s`/`1h 02m`/`45s`; `null|0` → `—`. — DoD: testes (6 valores + null).
- [ ] **12.** `src/lib/calls/phone.ts`: reutilizar util achado na etapa 5 (re-export) ou criar `normalizeE164BR` (aceita `0`, DDD, sem 9, `+55`, máscara), `formatPhoneBR` (`+55 (11) 99999-2048`), `phonesMatchExact(a,b)`. **Sem** correspondência por sufixo. — DoD: testes com 10 formatos de entrada.
- [ ] **13.** `src/lib/calls/capabilities.ts`: tipo `ChannelCapability = { channel; canDial; canReceive; canRecord; canReject; reason?: CapabilityReason }` e `describeReason(reason)` em linguagem operacional ("Linha VoIP indisponível", "Reconectando…", "Microfone bloqueado", "Ligação por WhatsApp não disponível nesta linha", "Linha em uso por outro usuário"). — DoD: testes de rótulo.
- [ ] **14.** `src/lib/calls/session.ts`: máquina de estados pura (Apêndice C): `reduce(state, event)`; `sessionId` fixado no `DIAL`/`INVITE_RECEIVED`; transição inválida → estado inalterado + `warn` com `sessionId`; `endReasonFor(state, event)`. — DoD: teste tabular cobrindo todas as transições válidas e 10 inválidas.
- [ ] **15.** `src/lib/calls/events.ts`: contrato `zapp:start-call` (Apêndice D) com `dispatchStartCall(payload)` e `onStartCall(handler)` tipados; compat: o handler também aceita o evento antigo `start-voip-call` até a etapa 47 remover os emissores. — DoD: testes de round-trip.
- [ ] **16.** `docs/telefonia/CONTRATO.md`: seção 2.7 na íntegra + decisões D4–D6 tomadas + glossário de rótulos. — DoD: commitado.
- [ ] **17.** Commit `feat(telefonia): fase 1 — contrato de domínio (status, duração, telefone, sessão, eventos)`. Push `--no-verify`. — DoD: typecheck 0; `npx vitest run src/lib/calls` verde; contagem de testes no ledger.

**CP1 — Contrato.** Gate: 5 módulos em `src/lib/calls` com teste; nenhuma dependência de React ou Supabase neles (`grep -c "from 'react'\|supabase" src/lib/calls/*.ts` = 0).

---

### FASE 2 — Banco: migration aditiva, RPCs e prova de RLS (etapas 18–28) → CP2 (GATE HUMANO)

- [ ] **18.** Schema **efetivo** (não a migration): `\d+ public.calls`, `select policyname, cmd, qual, with_check from pg_policies where tablename='calls'`, `select * from pg_publication_tables where tablename='calls'`, buckets de Storage com "record"/"call" no nome. Contagem: `select count(*) filter (where whatsapp_connection_id is not null), count(*) from calls` (evidência do backfill de `channel`). — DoD: tudo no ledger, seção "Schema efetivo".
- [ ] **19.** Migration `supabase/migrations/<ts>_calls_telefonia_v2.sql` (Apêndice A): 9 colunas aditivas, 2 índices, backfill de `channel` e `talk_seconds` (só onde `answered_at` e `ended_at` existem), `CHECK`s `NOT VALID` + `VALIDATE`. — DoD: arquivo; validado no Postgres descartável do CI ("Contrato DB offline") ou em `docker run postgres:16` local com as migrations do repo em ordem — saída no ledger.
- [ ] **20.** RPC `search_my_calls(...)` (Apêndice B.1): `SECURITY INVOKER`, escopo decidido por `has_role`, busca normalizada em `peer_number/peer_name/contacts.name/contacts.phone`, `total_count` por `count(*) over()`, ordem `started_at desc, id desc`, `p_limit ≤ 50`. `GRANT EXECUTE TO authenticated`. — DoD: 6 consultas de exemplo com resultado no Postgres descartável.
- [ ] **21.** RPC `my_calls_kpi(p_scope, p_channel, p_from, p_to)` (B.2): `total, outbound, inbound, missed_inbound, answered, avg_talk_seconds` sobre o mesmo universo de escopo/período/canal. — DoD: bate com `search_my_calls` no mesmo filtro (teste SQL).
- [ ] **22.** RPC `upsert_my_call(...)` (B.3): insere/atualiza **só** linha cujo `agent_id` = perfil do chamador, `channel='voip'`, `direction` do payload; se faltar policy de `INSERT`/`UPDATE` para agente em `calls` (etapa 18), criar `calls_insert_own` / `calls_update_own` (`agent_id = profile of auth.uid()`). — DoD: policies e RPC no arquivo.
- [ ] **23.** RPC `set_call_agent_notes(p_call_id, p_notes)` (B.4): dono ou admin/supervisor; grava só `agent_notes`. `CREATE OR REPLACE` de `record_incoming_call_event` com **apenas** estas mudanças: `channel='whatsapp'`, `provider_call_id = v_event_id`, `peer_number = v_contact_phone`, `peer_name = v_contact_name`; no `ON CONFLICT`: `agent_id = COALESCE(public.calls.agent_id, EXCLUDED.agent_id)`, `notes = COALESCE(public.calls.notes, EXCLUDED.notes)`, `talk_seconds` calculado quando `ended_at` chega com `answered_at` presente. — DoD: diff da função ≤ 15 linhas; teste SQL: 2 eventos (ringing→ended) não regravam `agent_id` nem `notes`.
- [ ] **24.** Realtime: se `calls` não está em `supabase_realtime` (etapa 18): `ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;` na mesma migration. — DoD: linha na migration ou "já publicada" no ledger.
- [ ] **25.** Gravações — decisão de armazenamento registrada (D3): se bucket existir, policy de `SELECT` no Storage por dono/admin (`storage.objects` com `bucket_id` e `name like '<call_id>%'`); se Bitrix, nada no banco (proxy na Fase 9). — DoD: decisão + policy (se aplicável) na migration.
- [ ] **26.** Prova de RLS `supabase/tests/calls_rls.sql` (B.5): perfis A, B, supervisor simulados via `set local role authenticated; set local request.jwt.claims`; asserts: A vê só as suas · B não vê A · supervisor vê todas · `search_my_calls(p_scope=>'all')` como A devolve só as de A · `set_call_agent_notes` de B em chamada de A → exceção · `upsert_my_call` com `agent_id` alheio → exceção · `select` de chamada sem dono (`agent_id null`) só para admin/supervisor. Rodar no Postgres descartável. — DoD: saída do script (todas `PASS`) no ledger.
- [ ] **27.** `src/integrations/supabase/types.ts`: regenerar (`supabase gen types typescript` contra o Postgres descartável) **ou** edição aditiva manual das 9 colunas + 4 RPCs, sem tocar o resto. — DoD: `npm run typecheck` = 0.
- [ ] **28.** **PR-A** `infra(telefonia): contrato de dados — colunas aditivas, RPCs e prova de RLS` em branch própria `claude/infra-calls-contract-<carimbo>` (só os arquivos de `supabase/`, `types.ts` e `docs/telefonia/`). Corpo: Apêndice A resumido, contagens da etapa 18, saída da etapa 26, "o que muda para o usuário: nada ainda". **PARAR AQUI.** Ledger: `CP2: PR-A #<n> AGUARDANDO APROVAÇÃO`. Encerrar a sessão com o relatório (link + 3 próximos passos). — DoD: URL do PR no ledger. **Nada de `apply_migration`.**

**CP2 — Gate humano.** Joaquim: `APROVADO` → migration aplicada pelo chat (MCP Supabase Cloud, projeto `tnnnlkbymytvtqngbbqh`), `types.ts` conferido, PR-A mergeada. **Sessão 2 começa na etapa 29** com `git fetch && git rebase origin/main` na branch de front.

---

### FASE 3 — Motor: sessão persistente, entrada SIP, corridas, persistência (etapas 29–41) → CP3

- [ ] **29.** `src/lib/calls/adapters/CallAdapter.ts`: interface `{ channel; dial(target); accept(); reject(); hangup(); setMuted(bool): Promise<bool>; sendDTMF(k); on(event, cb) }`. `SipCallAdapter.ts` encapsula o que hoje está em `useSipClient` (UA, Inviter, mídia) **sem** reescrever a lógica de mídia — mover blocos, não reescrever. — DoD: `useSipClient.test.ts` continua verde após o move.
- [ ] **30.** `src/providers/CallSessionProvider.tsx`: estado da máquina (Apêndice C) + `adapters` + `sipStatus` + `capabilities`; API `dial/accept/reject/hangup/toggleMute/sendDTMF/openDialer(payload)`; montado em `AppProviders.tsx` dentro de Auth e QueryClient. `useSipClient` deixa de criar UA por view: a view consome `useCallSession()`. — DoD: teste do provider: `dial` → navegar (`MemoryRouter`) → estado mantido.
- [ ] **31.** Provisionamento sem editor: `get-sip-password` passa a devolver `{ server, user, wsPort, password }` lendo `SIP_SERVER`, `SIP_USER`, `SIP_WS_PORT` (defaults = valores atuais hardcoded, para não quebrar). Front remove `voip_sip_settings`/`localStorage`. Registro automático ao autenticar se `capabilities.voip.canDial !== 'never'`. Conflito de registro (403/`Registration failed`) → `reason='line_in_use'`. — DoD: função responde 4 campos (`curl` com JWT do QA); `grep -rn voip_sip_settings src/` = 0.
- [ ] **32.** `useSipConnection.ts`: `reconnectTimerRef` cancelado em `disconnect()`, logout e unmount; backoff 2→4→8→16→30 s, máx 5 tentativas, depois `unavailable`; guard `if (uaRef.current) return` (UA único); status `idle|connecting|registered|reconnecting|unavailable`. — DoD: teste com `vi.useFakeTimers()`: unmount durante backoff não cria UA.
- [ ] **33.** Corridas: `dial()` gera `sessionId` e faz `reduce(DIAL)` **antes** de `inviter.invite()`; `sessionRef` atribuído síncrono; comandos serializados por `pendingRef` (segundo `dial` em `dialing|ringing|active` → no-op + toast "Já existe uma ligação em andamento"); `hangup` em `dialing` → `inviter.cancel()`, em `active` → `session.bye()`. — DoD: testes de 4 corridas.
- [ ] **34.** Resultado no encerramento: handler `Terminated` lê `state.answeredAt` (não `callStatus`); `end_reason` por `sipCodeToEndReason(lastResponse?.statusCode)` ou `hangup_local|hangup_remote`; persiste (etapa 35) **antes** de `RESET`. — DoD: testes: atendida+bye local → `completed`; 486 → `busy`; cancel local → `cancelled`; remoto após atendida → `completed` com `end_reason='hangup_remote'`.
- [ ] **35.** Persistência durável (VoIP saída): `upsert_my_call` em `DIAL` (`status='ringing'`, `peer_number`, `contact_id` via `phonesMatchExact`, `channel='voip'`, `provider_call_id = Call-ID`), em `ESTABLISHED` (`answered`, `answered_at`, `answered_by`), no fim (`status`, `ended_at`, `end_reason`, `talk_seconds`); cada retorno checa `error` → toast "Não foi possível salvar a ligação" + retry idempotente ×3 (mesmo `id`) + log com `sessionId`. Remove o `insert` único de `useSipClient`. — DoD: teste observa 3 chamadas de RPC no mesmo `id`; um `error` simulado gera toast e retry.
- [ ] **36.** Recebimento SIP: `userAgent.delegate = { onInvite }` → `INVITE_RECEIVED` com `peer_number` (From URI), `sessionId`, `provider_call_id`; `accept()` → `invitation.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })`; `reject()` → `invitation.reject()`; `CANCEL` remoto → `missed` (`end_reason='cancelled_remote'`); mídia remota anexada em `Established` igual à saída; `upsert_my_call` com `direction='inbound'`. — DoD: teste com `Invitation` mock (accept/reject/cancel); homologação real na etapa 100.
- [ ] **37.** Microfone: antes de `dial/accept`, `getUserMedia({audio:true})` com tratamento `NotAllowedError` → "Microfone bloqueado — libere no navegador" · `NotFoundError` → "Nenhum microfone encontrado" · `NotReadableError` → "Microfone em uso por outro programa"; `navigator.mediaDevices.ondevicechange` reavalia; sem seletor de dispositivo (P2). — DoD: 3 mensagens em teste.
- [ ] **38.** Mute e áudio efetivos: `setMuted` atua nas tracks locais do adapter ativo e devolve o estado **lido** das tracks; `CallDialog` deixa de manter `isMuted/isSpeaker` locais e consome o provider (botão de alto-falante só se `setSinkId` existir; senão não renderiza). — DoD: teste: `toggleMute` → `track.enabled === false`.
- [ ] **39.** DTMF contextual: `sendDTMF` só em `active` (senão no-op + warn); teclado físico só quando o foco está no painel de discagem (`data-keypad-scope`), nunca em `textarea`/`input` de notas. — DoD: teste de foco.
- [ ] **40.** `ActiveCallBar.tsx` em `AppShell` (topo do `main`, `h-12 bg-card border-b border-border px-4 flex items-center gap-3`): visível quando `state.kind !== 'idle' && currentView !== 'voip'`; avatar/iniciais 28, nome ou número, `CallChannelBadge`, timer, Mute, Encerrar (`bg-destructive`), clique na área → `?view=voip`. — DoD: screenshot `03-activebar.png` no inbox durante `dialing` (número de teste).
- [ ] **41.** `useIncomingCallListener` + `IncomingCallAlert` + `CallDialog`: identidade por `metadata.call_id`; notificação cuja chamada já está `ended|missed` é ignorada (consulta por `id` via RLS); Atender → `accept()` (uma ação), Recusar → `reject()` (persiste `declined`), Ignorar → só silencia; `CallDialog` recebe `callId` e **não insere**; timeout de toque vive na máquina (`TIMEOUT` só em `ringing_in`) e é cancelado no `ACCEPT`. Commit `feat(telefonia): fase 3 — sessão persistente, entrada SIP, corridas e persistência idempotente`. Push. — DoD: teste: 2 notificações do mesmo `call_id` → 1 alerta, 0 inserts; typecheck 0; preview READY.

**CP3 — Motor.** Gate: `npx vitest run src/hooks src/providers src/lib/calls` verde; ledger com a tabela "cenário → status/end_reason persistido" (8 linhas) obtida dos testes; `03-activebar.png`.

---

### FASE 4 — WhatsApp: capacidade real, adaptador, click-to-call unificado (etapas 42–50) → CP4

- [ ] **42.** `src/hooks/calls/useCallChannels.ts`: VoIP = `sipStatus==='registered' && mic !== 'blocked'` (+ `reason`); WhatsApp = a partir de `whatsapp_connections` da linha do usuário: `WHATSAPP-BAILEYS` → `{ canDial:false, canReceive:true, canReject: <etapa 6>, reason:'whatsapp_no_outbound' }`; `WHATSAPP-BUSINESS` → `canDial` só se a conexão tiver flag de Calling homologada (`metadata->>'calling_enabled' = 'true'`, jsonb já existente; se não houver jsonb, `false` e registrar) — nunca `true` por padrão. — DoD: hook testado com 3 fixtures de conexão.
- [ ] **43.** `WhatsAppCallAdapter.ts`: `dial` → `NotSupported` (rótulo honesto) enquanto `canDial=false`; `accept` (Baileys) → registra `answered_by` + abre a conversa do contato no inbox (o áudio acontece no aparelho da linha) — texto na UI: "Atenda no aparelho da linha; a conversa foi aberta aqui"; `reject` → rejeição real via Evolution se a etapa 6 encontrou endpoint, senão `declined` local com rótulo "Ignorar". — DoD: adapter testado nos 2 ramos.
- [ ] **44.** Webhook `handleCallEvent`: mapear **todos** os eventos Evolution vistos em payload real (`offer/ringing→ringing`, `accept→answered`, `reject|timeout→missed`, `terminate→ended`), `p_provider_event_id = data.id`, direção real se o payload trouxer `isOutgoing/fromMe`, timestamp do provedor (`data.date`) quando presente. Fixture anonimizada em `supabase/functions/_shared/__fixtures__/evolution-call-*.json` (a partir de um evento real gravado: `webhook_events`/logs — se não existir nenhum, registrar e manter mapeamento defensivo). — DoD: teste da função com as fixtures.
- [ ] **45.** Alerta global: `IncomingCallAlert` mostra canal (`CallChannelBadge`), nome/número, botões conforme `capabilities` (Atender/Recusar/Ignorar), toque via WebAudio (2 tons, 1 s on / 2 s off, sem asset), respeitando a preferência de silêncio dos controles rápidos da sidebar (`grep -rn "sound\|silenc\|mute" src/components/layout src/contexts src/hooks/ui` → reutilizar). Toque para em `ACCEPT|REJECT|TIMEOUT|HANGUP_REMOTE`. — DoD: teste: toque inicia em `INVITE_RECEIVED` e para nos 4 eventos.
- [ ] **46.** Término sincronizado: evento `terminate`/`timeout` do webhook (Realtime em `calls` do próprio agente ou nova notificação) → `HANGUP_REMOTE` para a `call_id` em curso; alerta fecha sozinho. — DoD: teste com fake timers + evento.
- [ ] **47.** Click-to-call unificado: `ContactActionButtons` e `ContactHeaderSection` chamam `dispatchStartCall({ contactId, phone, name, channel, connectionId, source })`; **único consumidor** = `CallSessionProvider.openDialer` → navega para `?view=voip`, painel "Nova ligação" pré-preenchido com contato e canal; `canDial=false` → painel aberto com o motivo, sem discar. Remover emissão de `start-voip-call`; `CallDialog` só permanece se a etapa 5 achou outro consumidor (senão remover import morto). — DoD: 2 origens testadas (inbox header + botões).
- [ ] **48.** Linha de origem: `connectionId` da conversa prevalece; fora do inbox, conexão padrão do usuário; painel mostra "pela linha <nome da conexão>" (`whatsapp_connections.name`), sem id/host. — DoD: texto correto nos 2 casos.
- [ ] **49.** Abas e segunda chamada: `BroadcastChannel('zapp-call-session')` — a aba que registrou SIP é líder; as outras mostram na `ActiveCallBar` "Ligação em andamento em outra aba" e não registram UA; `INVITE_RECEIVED` durante `active` → `missed` + `end_reason='busy_here'` + toast "Você já está em uma ligação". — DoD: teste unitário do eleitor; teste E2E com 2 contextos na etapa 96.
- [ ] **50.** Commit `feat(telefonia): fase 4 — capacidades por canal, adaptador WhatsApp, click-to-call unificado`. Push. — DoD: typecheck 0; preview READY; `CAPACIDADES.md` atualizado com o que o código faz de verdade.

**CP4 — Canais.** Gate: matriz de capacidades no ledger igual à do código; inventário da etapa 5 mostra 0 emissores de `start-voip-call`.

---

### FASE 5 — Tela: shell, header, disponibilidade, período, KPIs (etapas 51–59) → CP5

- [ ] **51.** `ViewRouter.tsx`: adicionar `'voip'` ao conjunto de gutters compactos (só a chave). Criar `TelefoniaView.tsx` (container `flex flex-col gap-4 min-w-0`, sem `max-w`); `VoIPPanel.tsx` → `export { TelefoniaView as VoIPPanel } from './TelefoniaView'`. — DoD: E.2 `contentX = 278 ±6`; `ViewRouter` sem outra alteração.
- [ ] **52.** `PageHeader.tsx`: prop `icon?: ReactNode` (renderiza antes do `h1` só quando presente). `TelefoniaView`: `<PageHeader variant="plain" icon={<Phone className="w-7 h-7 text-primary"/>} title="Telefonia" subtitle="Suas ligações por VoIP e WhatsApp" breadcrumbs={...igual às outras views} topRight={<TelefoniaTopActions/>}/>`. — DoD: snapshot de Contatos/Dashboard inalterado; título 36px.
- [ ] **53.** `TelefoniaTopActions.tsx` + `PeriodSelect.tsx`: chips `h-10 px-3 rounded-xl bg-card border border-border text-sm font-medium gap-2` (VoIP: `Phone` 16 + rótulo + dot 8px; WhatsApp: ícone já usado no inbox + rótulo; `Tooltip` com `describeReason`) e `Select` de período (`Calendar` 16 + rótulo, opções Hoje / Ontem / Últimos 7 dias / Últimos 30 dias / Este mês / Mês passado; sem intervalo customizado nesta entrega). — DoD: 3 controles h 40 ±2; rótulos refletem `useCallChannels`.
- [ ] **54.** `src/hooks/calls/useTelefoniaFilters.ts`: `period|channel|dir|result|q|page|scope|call` em `useSearchParams` (defaults `7d|all|all|all||1|mine|`); `setFilter` reseta `page=1` exceto em `page/call`; `from/to` derivados do período em fuso do navegador. — DoD: reload mantém filtros; teste do hook.
- [ ] **55.** `src/hooks/calls/useCallsKpi.ts`: `useQuery(['calls-kpi', scope, channel, from, to])` → `my_calls_kpi`, `staleTime 30_000`; invalidação: fim de qualquer sessão (provider) + Realtime `calls` filtrado `agent_id=eq.<meu perfil>` (canal único, cleanup no unmount). — DoD: teste: evento realtime → refetch.
- [ ] **56.** `CallKpiCard.tsx` (ou reutilizar o `KpiCard` genérico achado na etapa 5 com prop nova `size="sm"`, default = atual): `h-[78px] rounded-[14px] border border-border bg-card px-4 flex items-center gap-3`; tile 44×44 `rounded-xl` + ícone 20; valor `text-[26px] font-bold tabular-nums leading-none`; label `text-[13px] text-muted-foreground mt-1`; `data-testid="tel-kpi-card"`/`"tel-kpi-tile"`/`"tel-kpi-value"`. Mapa: Total (`Phone`, primary) · Realizadas (`PhoneOutgoing`, success) · Recebidas (`PhoneIncoming`, primary) · Perdidas (`PhoneMissed`, destructive; = `missed_inbound`) · Duração média (`Clock`, primary; `formatTalk(avg_talk_seconds)`, "—" sem atendidas). Números `toLocaleString('pt-BR')`. — DoD: 5 cards h 78 ±4 em 1672.
- [ ] **57.** Grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`; skeleton 5×`h-[78px] animate-shimmer`; erro → um card `bg-card border-destructive/30` "Não foi possível carregar os indicadores" + "Tentar novamente". — DoD: sem CLS (skeleton e card mesma altura).
- [ ] **58.** Remover da view: aba/`TabsContent` Configurações, `SipSettings`, `loadSipSettings`, `saveSipSettings`, `Switch`/`Label`/`Input` da configuração, `handleSipConnect` (conexão é automática, etapa 31). Atualizar `__tests__/VoIPPanel.test.tsx` (contrato de 3 abas) para o contrato novo (header, chips, 5 KPIs). — DoD: `grep -c "Configurações\|Conectar SIP\|sipServer" src/components/calls/*.tsx` = 0; vitest verde.
- [ ] **59.** Commit `feat(telefonia): fase 5 — shell, header, disponibilidade por canal, período e KPIs do servidor`. Push. — DoD: preview READY; `05-after.png`.

**CP5 — Shell.** Gate: E.2 → `contentX 278±6 · chips h 40±2 · kpi h 78±4 · kpiTile 44±2 · 5 colunas` · KPI Total (QA supervisor, `scope=all`, 30 dias) == `total_count` de `search_my_calls` no mesmo filtro (assert).

---

### FASE 6 — Histórico: card, abas, toolbar, tabela, paginação (etapas 60–71) → CP6

- [ ] **60.** `CallHistoryCard.tsx`: `rounded-[14px] border border-border bg-card p-4 flex flex-col gap-3 min-h-[600px]`; cabeçalho: título "Histórico de ligações" `text-xl font-bold` + `Badge` contagem (`bg-muted text-foreground rounded-full h-6 px-2.5 text-xs font-semibold tabular-nums`, `total_count`) + escopo: texto "Minhas ligações" (`text-sm text-muted-foreground`) ou, para admin/supervisor (`useAuth` roles), `Select` inline Minhas/Todas (`h-8 bg-transparent border-0 text-sm`). — DoD: seletor só aparece com role; muda `scope` na URL.
- [ ] **61.** Abas de canal: Radix `Tabs value={channel}`: `TabsList className="bg-transparent p-0 h-10 gap-6 border-b border-border rounded-none justify-start"`; `TabsTrigger className="rounded-none h-10 px-1 text-sm font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-primary -mb-px"`; rótulos "Todos os canais" / "VoIP" / "WhatsApp"; `data-testid="tel-channel-tab"`. — DoD: ativa h 40 ±2, sublinhado 2px `primary` (computed `border-bottom-color` == `--primary`).
- [ ] **62.** `CallHistoryToolbar.tsx`: busca `flex-1 min-w-[280px] h-10 rounded-xl bg-input border-border pl-10 text-sm` + `Search` 16 absoluto; placeholder "Buscar por nome ou número…"; debounce 300 ms → `q`; `Select` Direção (`Todas/Recebidas/Realizadas`) `w-[180px] h-10 rounded-xl bg-input` com `SelectValue` prefixado "Direção: "; `Select` Resultado (`Todos/Concluída/Perdida/Não atendida/Ocupado/Falhou/Cancelada/Recusada`) `w-[196px]` "Resultado: ". — DoD: 3 controles h 40 ±2, mesma linha em 1672 (`offsetTop` igual ±2).
- [ ] **63.** `src/hooks/calls/useMyCalls.ts`: `useQuery(['calls', scope, channel, dir, result, from, to, q, page])` → `search_my_calls(p_limit=8, p_offset=(page-1)*8)`; `placeholderData: keepPreviousData`; retorna `{ rows, total, pages }`; `page > pages` após filtro → `setFilter('page', 1)`. — DoD: teste do hook com mock da RPC; no preview, página 2 mostra ids diferentes da 1.
- [ ] **64.** `CallHistoryTable.tsx`: `Table` do ui (ou `<table className="w-full text-sm">` se o `Table` impuser estilos incompatíveis — registrar); `thead` `text-[13px] font-medium text-muted-foreground h-8`; colunas Contato · Canal · Direção · Resultado · Data e hora (ícone `ArrowDown` 14 — ordem desc fixa) · Duração · Ações; `tr` `h-[57px] border-b border-border/60 hover:bg-muted/30 cursor-pointer transition-colors`; selecionada `bg-primary/5 border-l-2 border-l-primary` + `aria-selected`; container `overflow-x-auto`; `data-testid="tel-row"`. — DoD: linhas 57 ±3.
- [ ] **65.** Célula Contato: avatar 40 (`getAvatarColor` + `getInitials` do módulo Contatos; foto se `contacts.avatar_url`), nome = `peer_name ?? contact.name ?? formatPhoneBR(peer_number)` `font-medium text-foreground truncate`, número `text-[13px] text-muted-foreground`; sem nome e sem número → "Número não identificado". — DoD: 3 variantes em teste.
- [ ] **66.** `CallChannelBadge.tsx`: `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium`; WhatsApp `border-success/30 bg-success/10 text-success` + ícone de WhatsApp já usado no inbox (14px); VoIP `border-primary/30 bg-primary/10 text-primary` + `Phone` 14. — DoD: componente testado; reutilizado nos painéis.
- [ ] **67.** `CallDirectionCell.tsx` (Recebida `ArrowDown text-primary` · Realizada `ArrowUp text-success` · recebida perdida `ArrowDown text-destructive`) e `CallResultCell.tsx` (dot 8px + `RESULT_LABEL`; tons da seção 2.2; `in_progress|ringing` com `animate-pulse` sob reduced-motion). — DoD: matriz completa (10 resultados × 2 direções) em teste de snapshot.
- [ ] **68.** Data e duração: `format(started_at, "dd MMM · HH:mm", { locale: ptBR })` (`25 set · 16:42`, mês minúsculo — `toLowerCase()` no token do mês); Duração `formatClock(talkSeconds(row))` `tabular-nums`, `—` quando não atendida. — DoD: 4 casos testados.
- [ ] **69.** Ações: `Button variant="ghost" size="icon" className="w-8 h-8"` `Phone` 16 `aria-label="Ligar de volta"` → `openDialer({ phone: peer_number, contactId, channel: row.channel })` (respeita capacidade: WhatsApp sem discagem → `disabled` + `Tooltip` com motivo); `Play` em `w-8 h-8 rounded-full border border-border` `aria-label="Ouvir gravação"` **só** se `recording_status==='available'` → seleciona a linha e expande o player no painel. — DoD: botões 32 ±2; Play ausente sem gravação.
- [ ] **70.** `CallsPagination.tsx` + estados: esquerda "`{de}–{ate}` de `{total}` ligações" (`text-sm text-muted-foreground`, números `text-foreground`); direita `‹`, páginas com janela (1 … p−1 p p+1 … N, máx 7 itens), `›`; botões `w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted disabled:opacity-40`, ativa `bg-primary text-primary-foreground border-primary`, `aria-label="Página anterior|Próxima página"`, `aria-current="page"`. Estados do corpo: loading (8 × `h-[57px] animate-shimmer`), vazio por filtro ("Nenhuma ligação com esses filtros" + botão "Limpar filtros"), vazio total ("Suas ligações aparecem aqui" + "Fazer uma ligação" → foca o painel), erro ("Não foi possível carregar o histórico" + "Tentar novamente"); indisponibilidade do SIP **não** afeta o histórico. — DoD: pager 36 ±2; teste dos 4 estados.
- [ ] **71.** Commit `feat(telefonia): fase 6 — histórico com abas, filtros, busca, tabela e paginação no servidor`. Push. — DoD: preview READY; `06-after.png`.

**CP6 — Histórico.** Gate: E.2 → `tab 40±2 · toolbar 40±2 (3 controles, mesma linha) · row 57±3 · pager 36±2`; E.5 parcial: busca por nome, aba VoIP, Direção, Resultado, página 2/volta → `OK`.

---

### FASE 7 — Painel lateral: Nova ligação (etapas 72–78) → CP7

- [ ] **72.** Layout: `grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_408px]`; abaixo de `xl` a coluna do painel vem **depois** do histórico (mobile vira `Sheet` na etapa 94). `aside` com `flex flex-col gap-4 sticky top-4` (só ≥ xl). — DoD: painel w 408 ±8 em 1672; sem overflow em 1366.
- [ ] **73.** `NewCallPanel.tsx`: `rounded-[14px] border border-border bg-card p-4 flex flex-col gap-3`; título `PhoneCall` 20 `text-primary` + "Nova ligação" `text-lg font-semibold`; segmentado (`role="radiogroup"`) grupo `bg-muted/40 p-1 rounded-xl grid grid-cols-2 gap-1`, botões `h-10 rounded-[10px] text-sm font-medium gap-2` ativo `bg-primary text-primary-foreground` inativo `text-muted-foreground hover:text-foreground`; canal **independente** das abas do histórico, persistido em `localStorage['tel:new-call-channel']`; opção sem `canDial` → `disabled` + `Tooltip` (não some). — DoD: trocar aba do histórico não muda o segmentado (teste).
- [ ] **74.** `ContactPicker.tsx`: `Input h-10 rounded-xl bg-input pl-10` placeholder "Nome ou número…" + `X` limpar; entrada com letras → debounce 300 ms → `search_contacts` (via `contact.service.ts`) limit 6, lista inline `max-h-56 overflow-auto rounded-xl border border-border bg-popover` com avatar 32 + nome + `formatPhoneBR`, navegável por ↑↓/Enter; seleção → chip `h-[60px] rounded-xl border border-border bg-muted/30 px-3 flex items-center gap-3` (avatar 40, nome `font-medium`, número muted, `X` remove) e preenche o número; entrada só dígitos → sem busca, vira número direto. Pré-preenchido pelo `openDialer` (etapa 47). — DoD: h 40 / chip 60 ±4; busca funciona (E.5).
- [ ] **75.** `Keypad.tsx`: extrair de `DialPad.tsx` a grade 3×4 como componente puro `({ onKey, disabled, mode: 'edit'|'dtmf' })`; `DialPad` passa a compor `Keypad` (diff mínimo, mantém export e props). Teclas `h-[46px] rounded-[10px] bg-muted/50 border border-border hover:bg-muted active:bg-muted/80 flex flex-col items-center justify-center` (dígito `text-lg font-semibold`, letras `text-[10px] tracking-wider text-muted-foreground`); gap 10; teclado físico (0–9 * #, Backspace, Enter = ligar) sob `data-keypad-scope`. — DoD: 12 teclas 46 ±2; `DialPad.test` (se houver) verde.
- [ ] **76.** Display do número: `Input h-11 rounded-xl bg-input text-base tracking-wide` (sem monospace), `formatPhoneBR` ao vivo, botão `Delete` 32 à direita; `normalizeE164BR` inválido → CTA `disabled` + hint "Número incompleto". — DoD: 3 entradas testadas.
- [ ] **77.** CTA: `Button className="h-11 w-full rounded-xl bg-primary text-primary-foreground font-semibold gap-2"` rótulo "Ligar via VoIP" | "Ligar via WhatsApp" (`Phone` 18); estados: `canDial=false` → `disabled` + hint com `describeReason` · `sipStatus='reconnecting'` → "Reconectando…" + `Loader2 animate-spin` · `dialing` → "Cancelar" `bg-destructive` · padrão: hint "Confira o número antes de ligar." (`text-xs text-muted-foreground text-center`). `whileTap 0.98` sob reduced-motion. — DoD: 4 estados em teste.
- [ ] **78.** Commit `feat(telefonia): fase 7 — painel Nova ligação com busca de contato, teclado e canal independente`. Push. — DoD: preview READY; `07-after.png`.

**CP7 — Discador.** Gate: E.2 → `panel 408±8 · segmented 40±2 · picker 40±2 · key 46±2 · cta 44±2`; E.5: buscar/selecionar/limpar contato, teclado físico, CTA desabilitado sem número → `OK`.

---

### FASE 8 — Painel lateral: Chamada ativa e Ligação selecionada (etapas 79–86) → CP8

- [ ] **79.** `ActiveCallPanel.tsx` no slot de `NewCallPanel` quando `state.kind !== 'idle'` (`AnimatePresence mode="wait"` 120 ms): cabeçalho com estado (`Chamando…` / `Tocando` / `Conectando…` / `Em ligação` / `Encerrando…`, `aria-live="polite"`), contato (avatar 56, nome, número, `CallChannelBadge`), timer `text-3xl font-bold tabular-nums` (só a partir de `active`, `formatClock`), linha de origem (etapa 48). — DoD: 5 estados renderizam (teste).
- [ ] **80.** Controles: Mute (`Mic/MicOff`, `aria-pressed`, estado vindo do provider), Teclado (toggle `Keypad mode="dtmf"`), Encerrar (`bg-destructive`, `PhoneOff`); em `ringing_in`: Atender (`bg-success`) + Recusar/Ignorar (`bg-destructive`/outline conforme `canReject`). Botões `h-11 rounded-xl`, Encerrar full width. — DoD: teste: clique → ação do provider (spy).
- [ ] **81.** Pós-chamada (3 s ou até interação): resumo "Ligação encerrada · 02:36" + `Textarea` "Anotação rápida" (salva em `agent_notes` via `set_call_agent_notes`) + "Ligar novamente" (`openDialer` com o mesmo destino) + "Fechar". — DoD: salvar → toast + linha atualizada.
- [ ] **82.** `SelectedCallPanel.tsx`: `rounded-[14px] border border-border bg-card p-4 min-h-[175px]`; vazio → "Selecione uma ligação para ver os detalhes" (`text-sm text-muted-foreground`); com seleção: título "Ligação selecionada"; contato (avatar 40, nome, `CallChannelBadge` + direção); coluna direita: resultado (dot + rótulo), `dd MMM, HH:mm`, `Clock` + `formatClock`; `end_reason` humano quando ≠ completed ("Não atendida", "Ocupado", "Cancelada por você", "Recusada", "Falhou"). — DoD: `data-testid="tel-selected-panel"` presente; 3 estados em teste.
- [ ] **83.** Notas: `agent_notes` em `Textarea bg-input rounded-xl` + "Salvar" (`Save` 16, só quando sujo) → `set_call_agent_notes` → toast + `invalidateQueries(['calls'])`; `notes` (provedor) exibida como metadado `text-xs text-muted-foreground`, nunca editável; campo só para dono/admin/supervisor (UI esconde; RPC garante). — DoD: teste: salvar → RPC chamada com `agent_notes`, `notes` intocado.
- [ ] **84.** `RecordingPlayer.tsx` (+ `useCallRecording(callId)`): botão `h-10 w-full rounded-xl border border-border bg-card hover:bg-muted gap-2` "Ouvir gravação" (`Play` 16) só se `recording_status==='available'` → chama `get-call-recording` (etapa 89) → `<audio controls preload="none">` nativo (progresso/seek/velocidade do navegador; sem autoplay); erro → "Gravação indisponível no momento"; `pending` → texto "Gravação em processamento"; `none|failed` → nada. Pausa ao iniciar outra ligação. — DoD: 4 estados em teste; em produção só após Fase 9.
- [ ] **85.** Seleção: clique/Enter na linha → `call=<id>` na URL → painel; `Esc` limpa; deep link `?view=voip&call=<id>` carrega a linha por `calls.select('*, contacts(name, phone, avatar_url)').eq('id', id)` (RLS) mesmo fora da página atual. — DoD: E.5 deep link `OK`.
- [ ] **86.** Commit `feat(telefonia): fase 8 — chamada ativa, detalhe da ligação, notas e player`. Push. — DoD: preview READY; `08-after.png` (linha selecionada + painel).

**CP8 — Painéis.** Gate: E.2 → `selectedPanel presente`, `activePanel` durante `dialing` (número de teste); E.5: selecionar linha, Esc, deep link, notas → `OK`.

---

### FASE 9 — Gravações e reconciliação com o provedor (etapas 87–91) → CP9 (condicional)

- [ ] **87.** Ramo: se a etapa 6 **confirmou** Bitrix24 SIP Connector com `voximplant.statistic.get` acessível → seguir 88–90. Senão → `recording_status` permanece `none`, nenhum botão de gravação aparece, ledger `F9: pulado (sem fonte de gravação comprovada)`, pular para 91. — DoD: decisão registrada.
- [ ] **88.** Edge Function `sync-call-records` (Deno): disparada por workflow N8N a cada 5 min (sem `pg_cron`/DDL); `voximplant.statistic.get` com `FILTER[>CALL_START_DATE] = now − 30 min`; para cada registro, casa **uma** linha `calls` VoIP com `peer_number` normalizado igual e `started_at` em ±90 s (se ambíguo, não casa e loga); preenche `provider_call_id`, `recording_url` (`CALL_RECORD_URL`), `talk_seconds` (`CALL_DURATION`), `end_reason` (`CALL_FAILED_CODE`: 200→completed, 486→busy, 480/487→no_answer, 603→declined, outros→failed), `recording_status` (`available` se URL, senão `none`); **nunca cria** chamada; segredo `BITRIX_WEBHOOK_URL` do env da função. — DoD: 1 chamada real reconciliada (ids no ledger) ou "0 registros no período" com a resposta crua resumida.
- [ ] **89.** Edge Function `get-call-recording`: JWT do usuário → `select id, recording_url from calls where id = $1` com o JWT (RLS decide) → se Storage: `createSignedUrl` 10 min; se URL Bitrix: stream com `Range` e `Content-Type` de áudio, sem expor a URL; rate limit igual ao de `get-sip-password`. — DoD: `curl` como A → 200; como B → 403/404; sem JWT → 401.
- [ ] **90.** Realtime já assinado (etapa 55): mudança em `recording_status` → `invalidateQueries(['calls'])` → botão "Ouvir" aparece sem reload. — DoD: teste de invalidação.
- [ ] **91.** Commit `feat(telefonia): fase 9 — reconciliação com o provedor e gravações autorizadas` (ou `chore(telefonia): fase 9 pulada — sem fonte de gravação`). Push. — DoD: preview READY.

**CP9 — Gravações.** Gate: ou 1 gravação real ouvida via player no preview (screenshot `09-player.png`) ou o ledger diz `pulado` com o motivo.

---

### FASE 10 — Motion, acessibilidade, responsivo (etapas 92–94) → CP10

- [ ] **92.** Motion (seção 2.8): aplicar; remover stagger por linha do histórico e `motion.div` do título; `useReducedMotion` em todos os pontos (KPI fade, troca de painel, pulse, `whileTap`). — DoD: com `emulateMedia({ reducedMotion:'reduce' })`, `transitionDuration==='0s'` em KPIs, linhas e painéis (E.2).
- [ ] **93.** A11y: `aria-label` em todo ícone-botão; `<caption className="sr-only">Histórico de ligações</caption>`; linhas `tabIndex=0`, Enter seleciona, ↑↓ navega; `focus-visible:ring-2 ring-ring ring-offset-0`; `aria-live` no estado da chamada; contraste dos textos muted sobre `bg-card` ≥ 4.5:1 (medido em E.3 nos tokens atuais — se um token não atingir, registrar, **não** trocar cor). `@axe-core/playwright` no preview. — DoD: 0 violações `serious/critical` (relatório no ledger).
- [ ] **94.** Responsivo: 1366×768 → 5 KPIs em 5 colunas, painel 360 (`xl:grid-cols-[minmax(0,1fr)_360px]` em `xl`, 408 em `2xl` — decidir pela medida e registrar), toolbar em uma linha; < 1280 → painel vira `Sheet` lateral aberto pelo botão "Nova ligação" no `topRight` (e pela `ActiveCallBar`); 390×844 → tabela vira lista (`CallRowMobile`: avatar, nome, badges de canal/resultado, hora, duração, ações), KPIs 2 colunas, chips em linha rolável; sem `scrollWidth > innerWidth`. — DoD: `10-1366.png`, `10-1024.png`, `10-mobile.png` sem overflow.

**CP10 — Motion/A11y/Responsivo.** Gate: 3 screenshots + axe + reduced-motion no ledger.

---

### FASE 11 — QA visual e funcional automatizado (etapas 95–97) → CP11

- [ ] **95.** Visual: `shot.mjs` → `11-final.png` (1672×941, `?view=voip&scope=all&period=30d`, QA supervisor, skin limpo, dark); `measure.mjs` (E.2) → todos `OK` (máx 3 iterações, cada uma no ledger); `colors.mjs` (E.3) → **anti-drift**: amostras de página/card/sidebar/input/primary/success/destructive com ΔE ≤ 2 dos valores **computados dos próprios tokens** da página (`getComputedStyle(root).getPropertyValue('--card')` etc.) + `git diff origin/main -- src ':!src/lib' | grep -cE "#[0-9a-fA-F]{6}|hsl\(|rgb\("` = 0; modo claro (`11-light.png`) e 1 skin GX (`11-skin.png`) renderizam sem cor estranha. — DoD: tabelas no ledger.
- [ ] **96.** Funcional (`func.mjs`, E.5 — 20 checks, cada um `OK|FAIL` com motivo): período muda KPIs · aba VoIP filtra · busca por nome · busca por número parcial · Direção Recebidas · Resultado Perdida · página 2 e volta · deep link `&call=` · selecionar linha → painel · Esc limpa · buscar/selecionar/limpar contato · teclado físico · WhatsApp desabilitado com motivo (Baileys) ou habilitado (Cloud) · CTA desabilitado sem número · discar `+5511000000000` → `dialing` → Cancelar → linha `cancelled` **real** na conta QA (1 registro legítimo) · `ActiveCallBar` visível em `?view=inbox` durante `dialing` · notas salvam · 2 abas: líder/seguidora · seletor Minhas/Todas (supervisor) · console sem `error`. — DoD: JSON `{ ok, fail, consoleErrors }` no ledger.
- [ ] **97.** Testes de código: `voip-security-gaps.test.ts` → apagado e substituído por `calls-access.test.ts` (contrato: hook nunca envia `scope=all` sem role; `useMyCalls` passa `p_scope` da URL; RPC mockada rejeita) + inventário de lacunas movido para `docs/telefonia/CONTRATO.md`; `useSipClient.test.ts` cobre invite pendente+cancel, established+bye, remoto 486/480/603, reconexão cancelada no unmount, mute nas tracks, DTMF só ativo; provider mantém sessão na navegação; `lib/calls` 100% de branches (`vitest --coverage` só nessa pasta); tabela 4 estados; `NewCallPanel` 4 estados de CTA; `IncomingCallAlert` 3 combinações de capacidade. `npx vitest run` **suíte inteira** verde. — DoD: contagem de testes antes/depois e cobertura de `src/lib/calls` no ledger.

**CP11 — Fidelidade e regressão.** Gate: E.2 100% OK · E.3 anti-drift OK · E.5 20/20 · vitest inteiro verde.

---

### FASE 12 — Gates, PR-B, deploy e homologação (etapas 98–100) → CP12

- [ ] **98.** Gates completos: `npm run typecheck` · `node scripts/ci/lint-ratchet.mjs` · `node scripts/ci/typecheck-ratchet.mjs` · `npm run implicit-any-check` · `npm run lint` · `npx vitest run` · `npm run build` · `node scripts/ci/bundle-budget.mjs` (se aplicável; chunk de `calls` Δ ≤ +12 KB gz vs `main` — número no ledger). Remover o alias `VoIPPanel` se `grep -rn "VoIPPanel" src/` só apontar para o próprio arquivo. — DoD: 8 saídas exit 0.
- [ ] **99.** **PR-B** `feat(telefonia): central de ligações — sessão persistente, histórico completo, painel de discagem e detalhe` para `main`. Corpo = seção "Entrega" do ledger: resumo, arquivos novos/alterados, `CAPACIDADES.md` (o que cada canal faz de verdade), funcionalidades preservadas (seção 4), gates, `00-before.png` vs `11-final.png`, **"O que NÃO está prometido"** (saída por WhatsApp, gravação se F9 pulada, ramal por agente, dispositivos de áudio), decisões D1–D7 aplicadas. **Deixar aberta** (toca `AppProviders`/`App.tsx`/`AppShell` + Edge Functions com segredo) e chamar Joaquim. — DoD: URL + status dos checks no ledger. Sessão 2 termina aqui.
- [ ] **100.** (Pelo chat, após `APROVADO` e merge.) Verificar deployment Vercel `READY` com `target: production` para o SHA do merge; `12-prod.png` + `measure.mjs` + `colors.mjs` contra produção; **homologação de áudio** (Apêndice G) com um agente real ao telefone enquanto o Claude lê `calls` e os logs das Edge Functions em tempo real: VoIP saída atendida / não atendida / ocupada · VoIP entrada atendida / recusada / perdida · WhatsApp entrada (evento) tocando / perdida · navegação durante a chamada · 2 abas. Cada cenário = 1 linha real em `calls` (id, status, `end_reason`, `talk_seconds`, `recording_status` se F9). **Só então** escrever "concluído". — DoD: tabela de 9 cenários com ids reais no ledger.

**CP12 — Entregue.** Gate: PR-A e PR-B mergeadas, produção verificada, 9 cenários homologados, ledger com as 13 seções e o bloco "Pendências/resíduos" honesto.

---

## 7. CRITÉRIOS DE ACEITAÇÃO FINAIS

**Produto:** abrir Telefonia mostra minhas ligações do período, com KPIs do universo autorizado (não da página); histórico completo, paginado, buscável e filtrável; canal de discagem independente do filtro; disponibilidade real por canal; discar e receber VoIP com áudio; navegar sem perder a chamada; detalhe com notas e (se comprovada) gravação.
**Dados:** uma identidade por chamada; resultado correto no encerramento; `talk_seconds` honesto; `agent_id` histórico preservado; `agent_notes` separado de `notes`; nenhuma chamada criada por abrir diálogo.
**Visual:** referência respeitada em estrutura/densidade/geometria (tabela 2.4); **zero token alterado, zero cor nova** (E.3 anti-drift); modo claro e skins intactos.
**Funcional:** seção 4 verde; E.5 20/20.
**Técnico:** typecheck 0, ratchets verdes, vitest inteiro verde, build ok, bundle dentro do limite, reduced-motion respeitado, axe sem `serious/critical`, mobile sem overflow.
**Honestidade:** `CAPACIDADES.md` e o corpo da PR-B dizem o que **não** funciona; nada simulado.

---

## APÊNDICE A — Migration aditiva (rascunho; a etapa 18 pode ajustar nomes ao schema real)

```sql
-- calls: telefonia v2 (aditivo, idempotente)
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS peer_number text,
  ADD COLUMN IF NOT EXISTS peer_name text,
  ADD COLUMN IF NOT EXISTS answered_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS agent_notes text,
  ADD COLUMN IF NOT EXISTS recording_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS talk_seconds integer;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_channel_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_channel_check
  CHECK (channel IS NULL OR channel IN ('voip','whatsapp')) NOT VALID;
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_recording_status_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_recording_status_check
  CHECK (recording_status IN ('none','pending','available','failed')) NOT VALID;
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_end_reason_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN (
    'completed','hangup_local','hangup_remote','no_answer','busy','busy_here',
    'cancelled','cancelled_remote','declined','failed','timeout')) NOT VALID;

-- backfill com evidência (contagens registradas na etapa 18)
UPDATE public.calls SET channel = CASE WHEN whatsapp_connection_id IS NOT NULL THEN 'whatsapp' ELSE 'voip' END
 WHERE channel IS NULL;
UPDATE public.calls SET talk_seconds = GREATEST(0, EXTRACT(EPOCH FROM (ended_at - answered_at))::int)
 WHERE talk_seconds IS NULL AND answered_at IS NOT NULL AND ended_at IS NOT NULL;

ALTER TABLE public.calls VALIDATE CONSTRAINT calls_channel_check;
ALTER TABLE public.calls VALIDATE CONSTRAINT calls_recording_status_check;
ALTER TABLE public.calls VALIDATE CONSTRAINT calls_end_reason_check;

CREATE INDEX IF NOT EXISTS calls_agent_started_idx ON public.calls (agent_id, started_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS calls_channel_provider_call_unique
  ON public.calls (channel, provider_call_id) WHERE provider_call_id IS NOT NULL;

-- policies de escrita do agente (só se a etapa 18 mostrar que faltam)
-- CREATE POLICY calls_insert_own ON public.calls FOR INSERT TO authenticated
--   WITH CHECK (agent_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
-- CREATE POLICY calls_update_own ON public.calls FOR UPDATE TO authenticated
--   USING (agent_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
--   WITH CHECK (agent_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;  -- só se não publicada
```

## APÊNDICE B — RPCs (assinaturas; corpo esboçado na migration)

**B.1** `search_my_calls(p_scope text DEFAULT 'mine', p_channel text DEFAULT NULL, p_direction text DEFAULT NULL, p_result text DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL, p_q text DEFAULT NULL, p_limit int DEFAULT 8, p_offset int DEFAULT 0)` → `TABLE (id, channel, direction, status, end_reason, started_at, answered_at, ended_at, talk_seconds, peer_number, peer_name, contact_id, contact_name, contact_phone, contact_avatar_url, company_name, agent_id, answered_by, recording_status, agent_notes, notes, total_count bigint)`. `SECURITY INVOKER`. Escopo efetivo: `CASE WHEN p_scope='all' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor')) THEN 'all' ELSE 'mine' END`. `p_result` traduzido no SQL pela mesma tabela 2.7 (`completed` = `status in ('ended','completed') and answered_at is not null`, etc.). Busca: `p_q` normalizado (só dígitos se houver ≥ 4 dígitos → `peer_number/contacts.phone ILIKE '%dig%'`; senão `peer_name/contacts.name ILIKE`). `p_limit` limitado a 50.

**B.2** `my_calls_kpi(p_scope text, p_channel text, p_from timestamptz, p_to timestamptz)` → `TABLE (total int, outbound int, inbound int, missed_inbound int, answered int, avg_talk_seconds numeric)`. Mesmo escopo efetivo de B.1.

**B.3** `upsert_my_call(p_id uuid, p_direction text, p_status text, p_channel text, p_peer_number text, p_peer_name text, p_contact_id uuid, p_provider_call_id text, p_answered_at timestamptz, p_ended_at timestamptz, p_end_reason text, p_talk_seconds int)` → `uuid`. `SECURITY INVOKER`; `INSERT … ON CONFLICT (id) DO UPDATE` só com campos não nulos (`COALESCE(EXCLUDED.x, calls.x)` onde faz sentido); `agent_id` = perfil de `auth.uid()` no insert e **nunca** alterado no update; `answered_by` = mesmo perfil quando `p_answered_at` chega.

**B.4** `set_call_agent_notes(p_call_id uuid, p_notes text)` → `void`. Dono (`agent_id`) ou admin/supervisor; senão `RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'`.

**B.5** `supabase/tests/calls_rls.sql`: cria 3 usuários/perfis temporários (`zz_tel_*`), 4 chamadas (2 de A, 1 de B, 1 sem dono), roda os 7 asserts da etapa 26 com `DO $$ … ASSERT … $$`, e remove tudo ao final (`DELETE` só dos `zz_tel_*`). Nunca rodar em produção.

## APÊNDICE C — Máquina de estados da sessão (`src/lib/calls/session.ts`)

Estados: `idle` · `dialing` (INVITE enviado) · `ringing_out` (180/183) · `ringing_in` (INVITE recebido) · `connecting` (200 OK / accept enviado, mídia negociando) · `active` (mídia estabelecida, `answeredAt`) · `ending` · `ended` (transitório, 3 s → `idle`).

| De | Evento | Para | `end_reason` |
|---|---|---|---|
| idle | DIAL | dialing | — |
| dialing | RINGING | ringing_out | — |
| dialing/ringing_out | ESTABLISHED | active | — |
| dialing/ringing_out | HANGUP_LOCAL | ending→ended | `cancelled` |
| dialing/ringing_out | FAILED(code) | ended | `sipCodeToEndReason(code)` |
| dialing/ringing_out | HANGUP_REMOTE | ended | `no_answer`/`declined` por código |
| idle | INVITE_RECEIVED | ringing_in | — |
| ringing_in | ACCEPT | connecting | — |
| connecting | ESTABLISHED | active | — |
| ringing_in | REJECT | ended | `declined` |
| ringing_in | CANCEL_REMOTE | ended | `cancelled_remote` (status `missed`) |
| ringing_in | TIMEOUT | ended | `timeout` (status `missed`) |
| active | HANGUP_LOCAL | ending→ended | `completed` (`hangup_local`) |
| active | HANGUP_REMOTE | ended | `completed` (`hangup_remote`) |
| active | FAILED | ended | `failed` |
| qualquer ≠ idle | INVITE_RECEIVED | (inalterado; segunda chamada → `missed` com `busy_here`) | — |
| ended | RESET | idle | — |

Invariantes: `sessionId` só é definido em `DIAL`/`INVITE_RECEIVED` e nunca muda até `RESET`; `answeredAt` só em `ESTABLISHED`; `TIMEOUT` só em `ringing_in`; persistência acontece em `DIAL|INVITE_RECEIVED`, `ESTABLISHED` e na entrada de `ended` — **antes** de `RESET`.

## APÊNDICE D — Evento `zapp:start-call`

```ts
type StartCallPayload = {
  channel: 'voip' | 'whatsapp';
  phone: string;                // como veio; o provider normaliza
  contactId?: string;
  name?: string;
  connectionId?: string;        // linha WhatsApp da conversa (inbox)
  source: 'inbox' | 'contacts' | 'history' | 'other';
  autoDial?: boolean;           // default false: abre o painel preenchido, não disca sozinho
};
document.dispatchEvent(new CustomEvent<StartCallPayload>('zapp:start-call', { detail }));
```
`autoDial` só é `true` no botão "Ligar de volta" do histórico (o usuário já viu o número). Do inbox, abre preenchido e o agente confirma — "Confira o número antes de ligar".

## APÊNDICE E — Scripts de QA (`/workspace/qa/tel/`, fora do repo)

**E.1 `shot.mjs`** — cópia do `shot.mjs` dos redesigns anteriores com: 6º argumento `view` (default `voip`); após login, `await page.goto(url + '/?view=' + view + extraQuery)`; dispensar onboarding: `const dlg = page.getByRole('dialog').filter({ hasText: /Bem-vindo/ }); if (await dlg.count()) await dlg.getByRole('button').last().click();`; esperar `page.waitForSelector('[data-testid="tel-kpi-card"]')`; `document.fonts.ready`; salvar `out/tel/<nome>.png` + `.console.json`.

**E.2 `measure.mjs`** — após navegar (E.1), `page.evaluate` medindo: `contentX` (rect de `[data-testid="tel-view"]`.x), `chips` (h dos 3 controles do topo), `kpi` (h de cada `tel-kpi-card`), `kpiTile` (w), `kpiCols` (x distintos), `tab` (h de `[data-testid="tel-channel-tab"][data-state="active"]`), `toolbar` (h e `offsetTop` de busca/Direção/Resultado), `rows` (h das 8 `tel-row`), `pager` (h de `button[aria-label="Próxima página"]`), `panel` (w de `[data-testid="tel-side-panel"]`), `segmented` (h do botão ativo), `picker` (h do input), `key` (h de `[data-testid="tel-key"]`), `cta` (h de `[data-testid="tel-cta"]`), `selectedPanel` (existe), `kpiTotal` vs `historyCount` (badge), `scrollW/innerW`, `reducedMotion` (após `emulateMedia`, `transitionDuration` de kpi/row/panel). Asserts com as tolerâncias da tabela 2.4.

**E.3 `colors.mjs`** — anti-drift: lê no DOM `getComputedStyle(document.documentElement).getPropertyValue('--background'|'--card'|'--sidebar-background'|'--input'|'--primary'|'--success'|'--destructive')`, converte HSL→RGB→Lab; amostra 9×9 (mediana) do screenshot em: página `(900,500)`, card do histórico `(700,600)`, sidebar `(100,300)`, busca `(500,317)`, CTA `(1446,660)`, chip WhatsApp dot `(1387,44)`, tile Perdidas `(1128,128)`; ΔE76 ≤ 2 (fundos) / ≤ 6 (tiles com alpha). Mais: `git diff origin/main -- src ':!src/lib' | grep -cE "#[0-9a-fA-F]{6}|hsl\(|rgb\("` deve ser `0`. Contraste: `text-muted-foreground` sobre `bg-card` ≥ 4.5 (calculado dos tokens).

**E.4 `func.mjs`** — os 20 checks da etapa 96, cada um `try { … ok.push(nome) } catch (e) { fail.push(nome + ': ' + e.message) }`, `page.on('console')` acumulando `error`; segundo contexto (`browser.newContext`) para o teste de 2 abas; imprime JSON final.

**E.5 `axe.mjs`** — `new AxeBuilder({ page }).analyze()` na tela ociosa e com painel de chamada ativa; imprime violações por impacto.

## APÊNDICE F — Template do ledger `docs/design/TELEFONIA_STATUS.md`

```md
# Telefonia — Plano de melhorias — STATUS
Branch front: claude/feat-telefonia-v2-<carimbo> · Branch infra: claude/infra-calls-contract-<carimbo> · Base: <sha>
Worktree: /workspace/repos/Zapp_Web_V2-telefonia · Preview: <url> · Playwright: ok|bloqueado · QA user: ok (role=<x>)
Provedores (etapa 6): SIP=<Bitrix SIP Connector|outro|?> · WhatsApp wpp2=<BAILEYS|BUSINESS> · Evolution reject=<sim|não> · gravação=<Bitrix|Storage|nenhuma>
Decisões D1–D7 aplicadas: D1=a D2=a D3=<> D4=a D5=8 D6=não D7=<>

## CP0 Ambiente        [ ] sha= · before=out/tel/00-before.png · consoleErrors=_ · gates baseline ok
## CP1 Contrato        [ ] sha= · testes lib/calls=_ · deps react/supabase=0
## CP2 Banco (gate)    [ ] PR-A=<url> · schema efetivo: cols=_ policies=_ realtime=_ · backfill: wa=_ voip=_ · rls_test=PASS n/n · APROVADO em <data> · aplicado=<sha migration>
## CP3 Motor           [ ] sha= · cenários persistidos: 8/8 · activebar=03-activebar.png
## CP4 Canais          [ ] sha= · matriz=CAPACIDADES.md · emissores start-voip-call=0
## CP5 Shell           [ ] sha= · shot=05-after.png · contentX=_ chips=_ kpi=[_,_,_,_,_] tile=_ · kpiTotal==total_count: _
## CP6 Histórico       [ ] sha= · shot=06-after.png · tab=_ toolbar=[_,_,_] rows=_ pager=_
## CP7 Discador        [ ] sha= · shot=07-after.png · panel=_ seg=_ picker=_ key=_ cta=_
## CP8 Painéis         [ ] sha= · shot=08-after.png · selected ok · active(dialing) ok · notas ok
## CP9 Gravações       [ ] sha= · ramo=<bitrix|pulado> · reconciliado id=_ provider_call_id=_ · 09-player.png
## CP10 Motion/A11y    [ ] sha= · reduced=0s · axe serious=0 · 10-1366/1024/mobile ok
## CP11 QA             [ ] final=11-final.png · geometria n/n · anti-drift ΔE≤2 n/n · hex novos=0 · light/skin ok · func 20/20 · vitest total=_ (antes=_) · cobertura lib/calls=_%
## CP12 Entrega        [ ] PR-B=<url> · CI=_ · merge=<sha> · prod=12-prod.png · homologação 9/9 (ids abaixo)

## Homologação (etapa 100) — id · canal · direção · cenário · status · end_reason · talk_seconds · recording_status
-
## Divergências plano × código
-
## Iterações do loop visual (máx 3 por fase)
-
## Bloqueios
-
## Pendências / resíduos (honestos)
- Saída por WhatsApp: não disponível (linha <BAILEYS|sem Calling>)
- Ramal SIP compartilhado (D1=a): conflito detectado e sinalizado, não resolvido
- Gravação: <fonte|nenhuma>
- Seletor de dispositivo de áudio: não implementado
-
```

## APÊNDICE G — Roteiro de homologação de áudio (etapa 100, pelo chat, com um agente real)

Pré: PR-B em produção; agente logado em `?view=voip` com chip VoIP verde; Claude com `select id, channel, direction, status, end_reason, answered_at, ended_at, talk_seconds, recording_status from calls where agent_id=<perfil> order by started_at desc limit 5` pronto para rodar após cada cenário.

| # | Cenário | Ação do agente | Esperado em `calls` | Esperado na tela |
|---|---|---|---|---|
| 1 | VoIP saída atendida | liga para celular de teste, atende, fala 20 s, desliga pelo ZAPP | `outbound/ended/completed`, `talk_seconds≈20` | timer contou; linha "Concluída 00:20" |
| 2 | VoIP saída não atendida | liga, deixa tocar até cair | `outbound/ended`, `end_reason=no_answer`, `talk_seconds=null` | "Não atendida —" |
| 3 | VoIP saída cancelada | liga e cancela em 3 s | `end_reason=cancelled` | "Cancelada" |
| 4 | VoIP saída ocupado | liga para número ocupado | `busy` | "Ocupado" |
| 5 | VoIP entrada atendida | celular liga para a linha; agente atende no ZAPP | `inbound/ended/completed`, `answered_by=<perfil>` | alerta → Atender → timer |
| 6 | VoIP entrada recusada | agente clica Recusar | `declined` | alerta some |
| 7 | VoIP entrada perdida | ninguém atende 30 s | `missed`, `end_reason=timeout` | KPI Perdidas +1 |
| 8 | WhatsApp entrada (evento) | celular liga por WhatsApp para a linha `wpp2` | `whatsapp/inbound/ringing→missed|ended` via webhook, `provider_call_id` preenchido | alerta com badge WhatsApp e ações conforme capacidade |
| 9 | Navegação + 2 abas | durante o cenário 1: abre `?view=inbox`, abre 2ª aba | nada novo | barra ativa no inbox; 2ª aba "em outra aba" |

Qualquer cenário fora do esperado → linha em "Bloqueios" com o log correlacionado (`sessionId`), sem "concluído".

---

## COMANDOS DE DISPARO (Joaquim, via Portainer → container `claude-code`)

**Sessão 1 — Fases 0–2 (termina na PR-A aberta):**
```sh
cd /workspace/repos/Zapp_Web_V2 && git fetch origin && git checkout main && git pull && \
claude -p 'Leia docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md por completo. Execute as FASES 0, 1 e 2 (etapas 1 a 28) na ordem, em worktree próprio como a etapa 1 manda, fechando cada checkpoint SOMENTE com a evidência exigida escrita em docs/design/TELEFONIA_STATUS.md. Na etapa 28 abra a PR-A, escreva CP2 AGUARDANDO APROVAÇÃO no ledger e ENCERRE — não aplique DDL, não avance para a fase 3. Nunca termine um turno com comando em background pendente: faça polling no mesmo turno até acabar. Push sempre com --no-verify. Se um gate falhar 3 vezes, registre o resíduo e siga. Se um bloqueio impedir de continuar, registre em Bloqueios e pare.' --model sonnet
```

**Sessão 2 — Fases 3–11 (só depois de PR-A mergeada e migration aplicada; termina na PR-B aberta):**
```sh
cd /workspace/repos/Zapp_Web_V2-telefonia && git fetch origin && git rebase origin/main && \
claude -p 'Leia docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md e docs/design/TELEFONIA_STATUS.md. CP2 está aprovado e a migration aplicada. Execute as FASES 3 a 11 (etapas 29 a 97) e a etapa 98/99 na ordem, fechando cada checkpoint SOMENTE com a evidência exigida no ledger. Nenhum token de cor ou fonte pode mudar — o script E.3 anti-drift tem que passar. Na etapa 99 abra a PR-B e ENCERRE sem mergear. Nunca termine um turno com comando em background pendente: faça polling no mesmo turno até acabar. Push sempre com --no-verify. Se um gate falhar 3 vezes, registre o resíduo e siga. Ao retomar após queda de sessão, continue da primeira etapa sem [x] no ledger.' --model sonnet
```

**Etapa 100** é feita pelo chat (MCP Supabase/Vercel + Playwright no container), com o agente ao telefone.
