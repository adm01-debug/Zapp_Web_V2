# Harness de verificação em navegador (Zapp_Web_V2) — validado em 30/09/2026

Use quando o plano pedir **prova visual/comportamental** da interface (barra, painel, tema, foco,
responsividade) e não bastar o teste de componente. Roda Playwright **headless dentro do WSL**,
contra o dev server local (antes do merge) e contra a produção (depois do merge).

## Receita mínima

1. **Servidor**: suba pelo terminal com `background=true` (**nunca** `nohup`/`&` — a ferramenta recusa):
   `bun run dev --host 127.0.0.1 --port 5173`, depois confirme com
   `curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:5173/`.
2. **Playwright resolve do workspace**: o script fica em `/tmp` e o `node_modules` do workspace entra
   por link: `ln -sfn "$PWD/node_modules" /tmp/node_modules; node /tmp/<script>.mjs`.
   Os browsers já estão em `~/.cache/ms-playwright`.
   **Faça isso ANTES de limpar o workspace** — depois do `hermes-tarefa-limpar` o link morre e a guarda
   bloqueia reapontá-lo para `~/projetos/<Projeto>/node_modules` (é território somente-leitura): sem
   workspace aberto não há mais harness de navegador naquele chat.
3. **Credenciais de QA** (nunca imprimir/ecoar/colar):
   `set -a; . /workspace/.secrets/zapp-v2.env; set +a` +
   `export E2E_TEST_EMAIL="$ZAPP_QA_EMAIL" E2E_TEST_PASSWORD="$ZAPP_QA_PASSWORD"`.
   O login é feito **pela UI pelo próprio Playwright** (`/auth` → tab "Entrar" → e-mail → senha → botão).
4. **Rota**: a raiz `/` (não existe `/inbox`). `#main-navigation` visível = login ok.

## Camadas que interceptam clique (a causa nº 1 de timeout)

| Camada | Assinatura no DOM | Tratamento |
| --- | --- | --- |
| `WelcomeModal` (onboarding, **lazy**) | `div.fixed.inset-0.z-[9999]` com "Bem-vindo" | fecha pelo próprio botão X **e** espera; ele monta DEPOIS do primeiro paint, então tente fechar em laço (até ~6x com 1,5 s) |
| `EvolutionDisconnectBanner` | `div.fixed.top-0.z-[90]` ("Conexão PRINCIPAL está desconectada") | esconder por CSS |
| toast de status / nudge MFA | `div[role=status].fixed.bottom-4.z-[80]` | esconder por CSS |

Injete uma vez no `<head>`:
```js
const st = document.createElement('style');
st.textContent = '[class*="z-[9999]"], [class*="z-[90]"], [class*="z-[80]"] { display: none !important; }';
document.head.appendChild(st);
```
Isso é intervenção de **harness** (não muda a app): declare no relatório. Sem esconder o overlay de
onboarding a lista de conversas **nem popula** (0 `conversation-item`).

## Screenshot de elemento sai CHAPADO (1 cor) sem este ajuste

No Chromium headless o wrapper anônimo dentro de `#root` renderiza com **`opacity: 0`**
(`getComputedStyle(document.querySelector('#root > div')).opacity === '0'`). O `element.screenshot()`
então devolve um retângulo uniforme (~400 bytes) mesmo com o DOM correto — e isso **não** é bug do app.
Antes de fotografar, injete:
```js
const st = document.createElement('style');
st.textContent = '#root > div { opacity: 1 !important; }';
document.head.appendChild(st);
```
Confira o resultado contando **cores distintas** do PNG (barra das 8 abas ≈ 460 cores; imagem chapada = 1).
`page.screenshot({ clip })` com a bounding box do elemento dá o mesmo resultado e serve de conferência.

## Seletores que funcionam

- Barra: `[data-testid="conversation-tabs"]`; abas: `[role="tab"]` / `data-testid="conversation-tab-<id>"`.
- Rótulo de texto da aba: `span.whitespace-nowrap` (o **primeiro** `span` do botão pode ser o pill ativo —
mirá-lo dá falso positivo em medição de responsividade).
- Chip de filtro: `[data-testid="status-chip-all"]` / `status-chip-resolved`; o clique nativo às vezes
  estoura timeout → fallback `dispatchEvent(new MouseEvent('click',{bubbles:true}))` (o React escuta no root).
- Item da conversa: **`[data-testid="conversation-item"] [role="button"]`** (o `data-testid` fica no wrapper
  absoluto do virtualizador; clicar nele NÃO abre a conversa).
- "Chat montado" não se prova com `getByRole('log')`: selector por role **ignora elemento com
  `display: none`** (o Chat fica montado e oculto nas outras abas). Use
  `page.locator('textarea[aria-label="Digite sua mensagem"]').count() > 0`.
- O painel central só monta quando a conversa é resolvida (`legacyConversation`) — depois de clicar no
  item, **espere o textarea** antes de medir qualquer coisa (senão você mede a tela vazia).
- Testid do painel por aba: `ai-tab`, `crm360-tab`, `orders-tab`, `history-tab`, `notes-tab`, `files-tab`
  e **`quick-add`** para Tarefas (`tasks-module` é o módulo completo de Tarefas, não a aba do chat).
- Contadores: `[data-testid="conversation-tab-count-<id>"]`; compare com a RPC
  `get_conversation_tab_counts` interceptando `page.on('response')`. Uma conversa com badge de 3 dígitos
  (ex.: 118 arquivos) existe na aba "Resolvidas" do usuário de QA.

## Fatos medidos (30/09/2026)

- Breakpoint dos rótulos: `hidden 2xl:inline` resolve pelos **screens padrão** do Tailwind (**1536 px**),
  **não** pelo `container.screens` (1400 px) do `tailwind.config.ts` — medido: visível em 1536, oculto em 1400.
- Altura real da barra: **53 px** (`h-[53px]`), `overflow-x: auto`, `gap: 4px`, padding 12 px, sem rolagem
  horizontal da página em 1920/1536/1400/1366/768/390.
- Usuário de QA enxerga **1 conversa** no chip "Todas" e ~14 em "Resolvidas".
- Login repetido pode ser **rate-limited**: faça no máximo 3 tentativas com 60-120 s de espera.
- `TasksTab` do chat = `QuickAdd` + lista (usa `useMyWorkItems`), então o contador `tasksOpen` pode ser 0
  mesmo com o painel renderizado.

## Provar "antes" e "depois" em produção mesmo com o deploy já feito

`https://zapp-web-v2.vercel.app` (HTTP 200 — `zappwebv2.vercel.app` dá 404). Além do DOM (ordem dos
`data-testid`), guarde o **nome e o sha256 do chunk** que renderiza a tela (aqui, `RealtimeInboxView-<hash>.js`)
e extraia o array de dados do próprio JS publicado — o chunk antigo passa a devolver 404 depois do deploy,
mas o que você salvou em `/tmp` continua sendo prova do estado anterior. Só leitura: clicar em abas é
permitido; **nunca** enviar mensagem, resolver/reatribuir conversa.

## Vermelho pós-merge que NÃO é seu

- `E2E logado` (roda após merge na `main`) falha em `e2e/reactions.spec.ts`, `e2e/media-volume.spec.ts`,
  `e2e/messaging.spec.ts`/`conversation.spec.ts` no webkit — conjunto **idêntico** em runs anteriores ao
  seu merge. Compare com `gh run list --workflow="E2E logado" --branch main --limit 8` antes de acusar o diff.
- `Deploy Edge Functions` costuma sair `cancelled`: a fila é compartilhada e cada dispatch cancela o pendente
  do outro chat. Se o seu PR não toca `supabase/functions/`, não é seu (o `hermes-tarefa-mergear` reporta
  `DEPLOY=falhou`, mas o deploy do Vercel é o que importa aqui — confirme com
  `gh api repos/<org>/<repo>/commits/<merge_sha>/status` → `Vercel: success`).

## Conferir o mergulho num PR já mergeado

`gh pr comment <n> -R <org>/<repo> --body-file <arquivo>` é permitido pelo protocolo e serve para
registrar correções de rastreabilidade (base efetiva após rebase), o procedimento de reversão (Etapa 20)
e evidências colhidas depois do merge. Confirme a publicação com
`gh pr view <n> -R <org>/<repo> --json comments`.
