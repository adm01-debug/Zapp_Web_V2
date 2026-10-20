# AUDITORIA A11Y E CELULAR — Configurações, Administração, Segurança, Notificações e estrutura geral (Y18)

Especialista: worker (testes) (area-testes-do-produto)

- **Data:** 2026-10-07 · **Cartão:** t_cdeacb6d (Y18) · **Plano:** `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo entregue é este relatório.
- **Escopo de telas:** barra lateral expandida e recolhida (com os controles rápidos do rodapé), cabeçalho do celular, painel de menu (drawer), Configurações (abas Horário/Mensagens/Notificações), Administração (aba Usuários), Segurança (11 abas), Aparência/temas (ThemeCustomizer), Notificações (popover no desktop e painel no celular), diálogos globais (boas-vindas) e tour de onboarding.

## 1. Método (o que foi realmente executado)

| Item | Valor |
|---|---|
| App | build de desenvolvimento do PRÓPRIO workspace (`bun run dev`, Vite, `127.0.0.1:5311`, `VITE_CRM_INTEGRATION_ENABLED=true`) |
| Sessão | FALSA, injetada no `localStorage` por `installFakeSession` (usuário `admin` sintético). Nenhum login real. |
| Backend | 100% mockado por `page.route` (`bloquearRedeReal` + `mockAppShell`: identidade, `feature_flags`, conversas, contatos, usuários do admin). Toda a rede real cai em 403. |
| Dados | sintéticos (`Visual E2E` / `visual@test.local`). Nenhum dado de cliente, telefone real, CPF/CNPJ ou URL de produção. |
| Viewports | **390×844** e **1280×800** |
| Temas | **claro**, **escuro** e **alto contraste** (`localStorage.theme` antes do boot) |
| Ferramenta | Playwright 1.63 (Chromium) + axe-core (bundle do repo, `axe.run`, `resultTypes: ['violations']`, catálogo completo) |
| Medições por tela | axe; rolagem horizontal; alvos de toque (largura × altura reais); texto cortado (cliente × conteúdo); ordem de tabulação (16 `Tab`) + anel de foco; diálogos (caber na viewport) |
| Resultado da rodada final | `9 passed (2.4m)` — 48 medições de tela (6 combinações × 8 telas) + diálogos/tour + sonda de arranque, **0 erro de medição** |
| Harness | spec temporário em `.tmp/a11y-audit/` (fora do git; **removido antes do commit** para o diff ficar só neste `.md`). Dados brutos em `.tmp/a11y-audit/dados/*.json` (axe por tela) e resumos `resumo.txt`/`achados.txt`/`alvos.txt` — **existem apenas no workspace do cartão durante a auditoria e foram apagados antes do commit** (o diff fica só com este `.md`); todos os números citados abaixo saem desses arquivos e estão reproduzidos neste relatório. |

### Limitações honestas (o que NÃO foi medido)

1. **Teclado virtual cobrindo campos:** não é simulável no headless. Os diálogos do grupo cabem na viewport (§4.3), e o painel de notificações do celular usa `max-h-[70vh]` (`src/components/mobile/NotificationsPanel.tsx:77`), mas com a viewport reduzida pelo teclado isso **não foi exercitado**.
2. **Modo alto contraste:** medido em 2 combinações extras (390 e 1280, claro). Ele **não** elimina os achados de contraste do grupo — pelo contrário, em alguns pontos piora (§ achado 09).
3. **Tour de onboarding no celular:** o overlay não exibe passo nenhum (achado 05), então no celular não há o que medir do tour; o achado é justamente a ausência.
4. **Contraste durante animação de entrada:** a primeira medição do modal de boas-vindas acusou `color-contrast` no título (`#555658` sobre `#18181b`, 2,41:1). A re-verificação pontual, esperando a animação terminar, mediu `rgb(248,250,252)` sobre `rgb(24,24,27)` (≈17:1) e **zero** violações. O achado foi **invalidado** como artefato de medição e entra em §4 como verificado sem problema.
5. **Foco fora da viewport na barra lateral:** a rodada geral registrou 3 elementos com foco fora da dobra, mas a checagem dedicada (40 `Tab` com a barra expandida, medindo `scrollTop` do scroller) **não reproduziu**. Registrado como não-achado (§4.6).
6. **Popover/drawer fechados:** só foi medido o estado aberto de cada um (é o estado em que o usuário interage). Os painéis aninhados de Segurança (abas Geo/Rate limit/Quarentena) foram percorridos pela aba padrão apenas.

## 2. Cobertura

| Tela | 390 claro | 390 escuro | 1280 claro | 1280 escuro | 390 alto contraste | 1280 alto contraste |
|---|---|---|---|---|---|---|
| Casco do celular (cabeçalho + rodapé) | ✔ | ✔ | — | — | ✔ | — |
| Casco do desktop (barra expandida) | — | — | ✔ | ✔ | — | ✔ |
| Casco do desktop (barra recolhida) | — | — | ✔ | ✔ | — | ✔ |
| Painel de menu (drawer) | ✔ | ✔ | — | — | ✔ | — |
| Notificações | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Configurações | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Administração (Usuários) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Segurança | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Aparência (temas/Skins) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Diálogo de boas-vindas | ✔ | — | ✔ | — | — | — |
| Tour de onboarding | ✔ (sem passo) | — | ✔ (3 passos) | — | — | — |

## 3. Achados

### A11Y-CONFIG_ADMIN_SHELL-01 — Abas de Segurança sem nome acessível abaixo de 640 px · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) / 2.4.6 · **axe:** `button-name` [critical] em `role="tab"` — **11 nós**, nos combos de 390×844 (claro, escuro e alto contraste)
- **Tela:** Segurança · **390×844**, claro/escuro/alto contraste
- **Passos:** `?view=security` → barra de abas (`grid-cols-5 md:grid-cols-11`). Em < 640 px o rótulo de cada aba está em `<span class="hidden sm:inline">` e o botão `role="tab"` não tem `aria-label`: sobra só o ícone.
- **Evidência (axe):** `#radix-_r_66_-trigger-overview` → `<button type="button" role="tab" aria-selected="true" aria-controls="radix-_r_66_-content..." id="radix-_r_66_-trigger-overview">` — "Element does not have inner text that is visible to screen readers / aria-label attribute does not exist or is empty". Idem `-trigger-account`, `-passkeys`, `-devices`, `-notifications`, `-blocked`, `-geo`, `-rate-limit`, `-audit`, `-quarantine`, `-admin`.
- **Arquivo provável / TODOS os caminhos (`git grep -n "hidden sm:inline"`):** `src/components/security/SecurityView.tsx:57-97` (11 ocorrências, uma por aba). Fora do grupo, o mesmo padrão aparece em `contacts/AdvancedCRMSearch.tsx:66`, `contacts/ContactViewSwitcher.tsx:121`, `dashboard/DashboardToolbar.tsx:26,32`, `inbox/BulkActionsToolbar.tsx:77,94,111`, `catalog/CatalogBulkBar.tsx:71` (esses têm `title`/`aria-label` no gatilho — conferir um a um ao corrigir).
- **Correção sugerida:** `aria-label={rótulo}` em cada `TabsTrigger` (ex.: `aria-label="Visão Geral"`), mantendo o texto visível só a partir de `sm`. **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-02 — Controles da tabela de usuários (Admin) sem nome acessível · **P1**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `button-name` [critical] — **3 nós** em **todos os 6 combos** (390 e 1280, claro/escuro/alto contraste)
- **Tela:** Administração — aba Usuários · 390×844 e 1280×800
- **Passos:** `?view=admin` (aba Usuários é a padrão) → tabela `Usuários (1)`; cada linha tem (a) o `Select` de Role, (b) o botão de editar usuário e (c) o `Switch` de status ativo.
- **Evidência (axe):**
  - `.[&>span]:line-clamp-1` → `<button type="button" role="combobox" aria-expanded="false" aria-autocomplete="none" ...>` (Select de Role sem nome; o `SelectValue` mostra "Atendente");
  - `.w-8.h-8.hover:shadow-glow-accent-sm` → `<button class="inline-flex items-ce...">` (botão só de ícone "editar usuário", **32×32**);
  - `.peer` → `<button type="button" role="switch" aria-checked="true" data-state="checked" value="on" class="peer inline-flex h-6...">` (interruptor de usuário ativo sem nome).
- **Arquivo provável / TODOS os caminhos do mesmo defeito:**
  - `src/components/admin/AdminUsersTable.tsx:73` (`<SelectTrigger className="w-32"><SelectValue /></SelectTrigger>`), `:99` (`<Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => onEditUser(user)}>`), `:103` (`<Switch checked={user.is_active !== false} …/>`).
  - **`<Switch>` sem nome (mesmo defeito, por inspeção de código — telas não abertas nesta rodada):** `admin/AdminView.tsx:186,241` (este último embrulhado em `<label>`, que **não** nomeia um `role="switch"`), `notifications/NotificationSettingsPanel.tsx:59,102`, `notifications/NotificationTypeCards.tsx:139,164,251`, `notifications/PushNotificationCard.tsx:89`, `security/RateLimitConfigPanel.tsx:245`, `security/SecurityNotificationsPanel.tsx:126`. Dois já estão corretos: `admin/PlaybooksManager.tsx:188,191` (`aria-label="Editar playbook"` / `"Excluir playbook"`).
  - **Botões só de ícone sem nome (mesmo defeito, por inspeção):** `admin/PlaybooksManager.tsx:259`, `admin/TrainingMode.tsx:314`, `admin/SupervisorCopilot.tsx:112`, `admin/AIUsageDashboard.tsx:38`, `notifications/NotificationTypeCards.tsx:59`.
- **Correção sugerida:** `aria-label` em cada controle: `"Alterar role de <nome>"`, `"Editar <nome>"`, `"Ativar/desativar <nome>"`; no `Switch` usar `aria-label` (ou `Label` com `htmlFor` **somente** se o alvo tiver `id` e for um controle de formulário nativo). **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-03 — Botão "Sair" do painel de menu do celular sem nome acessível · **P1**
- **WCAG:** 4.1.2 · **axe:** `button-name` [critical] — **1 nó**, nos combos de 390×844
- **Tela:** Painel de menu (drawer) · 390×844, claro/escuro/alto contraste
- **Passos:** `?view=inbox` no celular → botão "Abrir menu" → rodapé do painel, ao lado do alternador de tema.
- **Evidência (axe):** `.hover:text-destructive` → `<button class="inline-flex items-ce...">` (`40×40`); é o único controle do rodapé com `LogOut` e **sem** texto nem `aria-label`.
- **Arquivo provável (confirmado):** `src/components/mobile/MobileDrawerMenu.tsx:322-331` — `<Button variant="ghost" size="sm" onClick={onLogout} className="h-10 rounded-xl text-destructive hover:text-destructive …"><LogOut className="w-4 h-4" /></Button>`. Compare com o alternador de tema ao lado (`:311-321`), que tem texto ("Claro"/"Escuro").
- **Correção sugerida:** `aria-label="Sair da conta"` (e, se quiser, `<span className="sr-only">`). **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-04 — Fechar do painel de notificações, fechar do tour e voltar dos temas sem nome acessível · **P1**
- **WCAG:** 4.1.2 · **axe:** `button-name` [critical] — **13 nós** (Aparência 6: 1 por combo dos 6; painel de notificações do celular 3: 1 por combo de 390; tour 4: 1 em cada passo/estado medido)
- **Telas/combos:** Notificações no celular (390, claro/escuro/alto contraste), Aparência (390 e 1280, claro/escuro/alto contraste), Tour no desktop (1280, nos 3 passos medidos)
- **Passos:** (a) 390 → "Notificações" → `X` do cabeçalho do painel; (b) `?view=themes` → seta de voltar ao lado de "Skins"; (c) 1280 → `Iniciar Tour Guiado` → `X` do cartão do tour.
- **Evidência (axe):**
  - `.active\:scale-\[0\.97\].w-7.hover\:shadow-glow-accent-sm` → `<button class="inline-flex items-ce...">` (**28×28**, painel do celular);
  - `.w-8.hover\:shadow-glow-accent-sm.active\:scale-\[0\.97\]` (390) / `.w-8.hover\:shadow-glow-accent-sm.hover\:bg-accent` (1280) → `<button class="inline-flex items-ce...">` (**32×32**, temas);
  - `.-mr-1` → `<button class="inline-flex items-ce...">` (**28×28**, tour) — em todos os passos medidos.
- **Arquivo provável / TODOS os caminhos (confirmados no fonte):**
  - `src/components/mobile/NotificationsPanel.tsx:101-105` (`size="icon" className="w-7 h-7 rounded-lg"` + `<X/>`);
  - `src/components/settings/ThemeCustomizer.tsx:30-38` (`<Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => window.history.back()}>` + `<ChevronLeft/>`);
  - `src/components/onboarding/TourOverlay.tsx:178-180` (`<Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={endTour}>` + `<X/>`);
  - mesmo defeito por inspeção de código (fora das telas medidas): `notifications/NotificationTypeCards.tsx:59` (`className="h-8 w-8"`).
  - Bom exemplo no grupo: `layout/SidebarBackButton.tsx:34` (tem `aria-label="Voltar à tela anterior"`).
- **Correção sugerida:** `aria-label="Fechar notificações"` / `"Fechar tour"` / `"Voltar"`. **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-05 — Tour de onboarding não exibe passo nenhum no celular (0 alvos) · **P1**
- **WCAG:** 2.1.1 / 1.3.1 / 4.1.2 · **não coberto pelo axe** (é ausência de conteúdo, não um nó inválido) — evidência por medição dedicada
- **Tela:** diálogo de boas-vindas → tour · **390×844**
- **Passos:** 390 → "Pular tour"/"Iniciar Tour Guiado" (`WelcomeModal.tsx:139-157`) → o overlay **não** aparece: nenhum `Passo N de M`, nenhum cartão, nenhum botão "Pular tour" de tour.
- **Evidência (medição dedicada, `.tmp/a11y-audit/dados/extra2.json`):** depois de clicar em "Iniciar Tour Guiado" e esperar 3 s → `pularTourExiste: false`, `passoTexto: ""`, `welcomeAindaNoDom: false`, **`alvosDataTour: []`** — o casco do celular não tem **nenhum** elemento `[data-tour]`.
- **Causa (código):** `src/components/onboarding/defaultTourSteps.ts:3-46` — os 6 passos apontam para `[data-tour="inbox"|"contacts"|"dashboard"|"queues"|"notifications"|"theme"]`; esses atributos só existem em `layout/SidebarNavItem.tsx:39` (`data-tour={item.id}`) e no gatilho de notificações/nota de tema do **Sidebar** (desktop). Em ≤ 640 px o `MobileShell` monta `MobileHeader`/`BottomNavigation`/`MobileDrawerMenu`, que **não** carregam `data-tour`. Em `TourOverlay.tsx:24-34`, alvo ausente após 10 tentativas chama `nextStep()` e o `TourOverlay` devolve `null` enquanto `targetRect` for nulo (`:102`) — ou seja, o tour "pula" os 6 passos em silêncio e termina.
- **Correção sugerida:** dar `data-tour` aos alvos do casco do celular (`MobileHeader`/`BottomNavigation`/`MobileDrawerMenu`) ou filtrar os passos por disponibilidade e mostrar um tour próprio do celular (com fallback "sem passos" quando nenhum alvo existir). **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-06 — Tour no desktop: overlay sem papel de diálogo, sem foco preso e conteúdo fora de landmark · **P2**
- **WCAG:** 2.4.3 (Ordem do foco) / 1.3.1 / 4.1.2 · **axe:** `region` [moderate] — **2 nós** em cada passo medido (390 e 1280)
- **Tela:** tour de onboarding · 1280×800 (medidos 3 dos 6 passos: "Passo 1 de 6", "2 de 6", "3 de 6")
- **Passos:** 1280 → `Iniciar Tour Guiado` → pressionar `Tab` 12 vezes → o foco percorre **o menu lateral atrás do overlay**.
- **Evidência (medição de foco, `dados/dialogos-desktop.json`):**
  - passo 1: `Teams > Email > Contatos > Multiplix > Catálogo > Telefonia > Quadro > Tarefas > Conquistas > Dashboard > Busca global (⌘K) > Vendas & CRM — expandir` — nenhum elemento do cartão do tour;
  - axe: `region` ×2 → `<h3 class="font-display font-semibold text-lg text-foreground mb-2">Inbox de Conversas</h3>` e o bloco `div.p-4` do cartão ("All page content should be contained by landmarks").
- **Causa (código):** `src/components/onboarding/TourOverlay.tsx:106-213` — o overlay é um `motion.div` dentro de `createPortal` **sem** `role="dialog"`, `aria-modal`, `aria-labelledby` e **sem** prender/mover o foco; o fundo (barra lateral, cabeçalho, conteúdo) continua tabulável e sem `aria-hidden`/`inert` (as teclas `Enter`/`ArrowRight`/`ArrowLeft` do `:89-96` são atalhos globais, não substituem a ordem de foco).
- **Correção sugerida:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` no cartão, foco inicial no cartão, `inert`/`aria-hidden` no resto enquanto o tour roda. **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-07 — Popover de notificações do desktop é `role="dialog"` sem nome · **P2**
- **WCAG:** 4.1.2 · **axe:** `aria-dialog-name` [serious] — **1 nó** em 1280×800 (claro, escuro e alto contraste)
- **Tela:** Notificações (popover da barra lateral) · 1280×800
- **Passos:** 1280 → botão "Notificações" (barra lateral) → o `PopoverContent` abre como `role="dialog"` sem nome acessível.
- **Evidência (axe):** `#radix-_r_68_` → `<div data-side="right" data-align="start" data-state="open" role="dialog" id="radix-_r_68_" class="z-50 rounded-xl bord..." tabindex="-1">` — "aria-label attribute does not exist or is empty / aria-labelledby … does not exist / Element has no title attribute".
- **Arquivo provável (confirmado):** `src/components/notifications/NotificationsPopover.tsx:59` (`<PopoverContent side="right" align="start" sideOffset={8} className="w-[360px] p-0 overflow-hidden">`), com o título já pronto em `:63` (`<h3 …>Notificações</h3>` — basta dar `id` a ele).
- **Correção sugerida:** `aria-labelledby={<id do h3>}` no `PopoverContent`. **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-08 — Painel de notificações do celular não é anunciado como diálogo, com h3 fora de hierarquia e conteúdo fora de landmark · **P2**
- **WCAG:** 1.3.1 / 2.4.6 / 4.1.2 · **axe:** `heading-order` [moderate] (1 nó) + `region` [moderate] (**3 nós**) nos 4 combos de 390×844
- **Tela:** Notificações no celular · 390×844, claro/escuro/alto contraste
- **Passos:** 390 → botão "Notificações" (cabeçalho) → o painel abre sobre a tela.
- **Evidência (axe):**
  - `h3` → `<h3 class="font-semibold text-sm text-foreground">Notificações</h3>` ("Heading order invalid" — nenhum `h2` antes);
  - `region` ×3 → o mesmo `h3` e os itens da lista ("All page content should be contained by landmarks").
- **Causa (código):** `src/components/mobile/NotificationsPanel.tsx:71-77` — o painel é um `motion.div` fixo (`z-[91]`, `max-h-[70vh]`) **sem** `role="dialog"`/`aria-modal` e **sem** prender o foco (tem `Escape` em `:50`), e o cabeçalho usa `h3` sem `h2` (`:81`). Diferente do painel de menu do celular (`MobileDrawerMenu`, que usa `DialogPrimitive` e por isso tem papel e título).
- **Correção sugerida:** usar o mesmo `Dialog`/`Sheet` (`DialogPrimitive`) do drawer ou aplicar `role="dialog"` + `aria-modal` + `aria-labelledby`, prender o foco e trocar o `h3` por `h2`. **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-09 — Contraste abaixo de 4,5:1 (usuários do Admin, badge das Skins, atalho "Tab" e chip de status no alto contraste) · **P2**
- **WCAG:** 1.4.3 · **axe:** `color-contrast` [serious] — **41 ocorrências** no grupo (`nós × medição`)
- **Telas/combos:** Administração **17** (2–5 nós nos combos de claro, 1–2 no escuro e no alto contraste), Aparência **8** (1–3 nos 4 combos de 390/1280), Painel de menu do celular **8** (5 em 390 claro, 2 em 390 escuro, 1 em alto contraste), Configurações **1** (390 claro — atalho de teclado), diálogo de boas-vindas **1** (medido durante a animação: **invalidado**, §4.5), chip de status do casco/Notificações **4** (só no alto contraste: 1 na barra expandida, 1 na recolhida, 1 no casco do celular, 1 no painel de notificações)
- **Evidência (axe, amostras):**
  - `<span class="font-medium block">Visual E2E</span>` → **3,28:1** (`#8c8e92` sobre `#ffffff`, 14 px); no alto contraste **3,94:1** (`#808080`);
  - `<span class="text-xs text-muted-foreground">visual@test.local</span>` → **2,14:1** claro, **3,3:1** escuro (`#666b74` sobre `#18181b`), **2,84:1** alto contraste (`#999999`);
  - `.[&>span]:line-clamp-1 > span` → `<span style="pointer-events: none;">Atendente</span>` (placeholder do Select de Role) → **3,17:1**;
  - `<span class="rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 text-2xs font-medium text-primary">✓ Padrão</span>` → badge das Skins (2–3 nós por combinação);
  - `<kbd class="px-1.5 py-0.5 bg-background rounded border border-border font-mono">Tab</kbd>` → **1,04:1** (`#f8f8fa` sobre `#fdfdfe`) no aviso "Pressione Tab para navegar" do atalho de pular para o conteúdo;
  - `<button data-testid="status-chip-attending" class="… bg-accent border-primary/50 text-foreground">Em atendimento 0</button>` → **2,39:1** (`#000000` sobre `#4500e6`) **no alto contraste** (tema que deveria melhorar o contraste, e piora esse chip).
  - `span.bg-primary/15.text-primary.text-xs` → `<span class="flex h-full w-full items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">VE</span>` (iniciais do avatar no cabeçalho do painel de menu do celular) → **4,2:1** (`#2463eb` sobre `#dee8fc`);
  - `<p class="px-3 py-1.5 text-3xs font-bold uppercase tracking-wider text-muted-foreground/70">Principal</p>` (e "Vendas & CRM", "Automação & IA" — títulos de seção do painel de menu) → **3,15:1** (`#8d919b` sobre `#ffffff`) — **3 nós**;
  - `<span class="flex-1 text-left truncate">Chat</span>` (item ativo do painel) → **4,49:1** (`#2463eb` sobre `#e9effd`, no limite do 4,5:1).
- **Arquivo provável:** `src/components/admin/AdminUsersTable.tsx:58-59` (nome/e-mail do usuário), `:73` (placeholder do Select), `src/components/settings/ThemeCustomizer.tsx` (badge `✓ {activeName}`, ~`:43-45`), `src/components/mobile/MobileDrawerMenu.tsx` (iniciais do avatar e títulos de seção `text-muted-foreground/70`), `src/components/ui/skip-link.tsx:114` (atalho `Tab`), `src/components/inbox/*` (chip `status-chip-attending`, herdado do Inbox — citado aqui porque aparece no casco).
- **Correção sugerida:** trocar `text-muted-foreground`/`text-muted-foreground/70` por token sólido nos textos de 12–14 px do Admin; no badge das Skins usar `text-primary` sobre fundo sólido (`bg-primary text-primary-foreground`) ou reduzir a opacidade só do fundo; no `kbd` do atalho usar fundo contrastante (`bg-muted`/`bg-card`) em vez de `bg-background`; revisar o multiplicador do alto contraste para o chip `bg-accent` (é o único ponto em que o modo piora). **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-10 — Alvos de toque abaixo de 24×24 px (WCAG 2.5.8 AA) no casco e nos diálogos · **P2**
- **WCAG:** 2.5.8 (Tamanho do alvo — mínimo, AA) · medição própria (`getBoundingClientRect`)
- **Telas:** casco (desktop e celular), Notificações, Aparência, Configurações, Admin, diálogo/tour
- **Evidência (excertos medidos):**
  - `button.w-[28px].h-[28px].rounded-md` → **28×28** — "Recolher menu" (barra lateral, 18 medições)
  - `button.relative.flex.items-center` → **28×28** — "Notificações" da barra lateral recolhida/expandida (18 medições)
  - `button.flex.items-center.justify-center` → **28×28** — "Voltar à tela anterior" (`SidebarBackButton.tsx:34`, 12 medições)
  - fechar do painel de notificações do celular → **28×28** (`NotificationsPanel.tsx:101-105`)
  - fechar do tour → **28×28** (`TourOverlay.tsx:178`)
  - `button.inline-flex…` → **32×32** — "Atualizar" (cabeçalho da lista, 18 medições), "Fechar menu" (drawer, `MobileDrawerMenu.tsx:213`)
  - botão só de ícone "editar usuário" → **32×32** (`AdminUsersTable.tsx:99`)
- **Correção sugerida:** área mínima de 24×24 (de preferência 44×44) via `min-h`/`min-w` ou pseudo-elemento com área estendida, mantendo o desenho atual. **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-11 — Item do menu lateral com botão de favorito aninhado (`nested-interactive`) · **P2**
- **WCAG:** 4.1.2 · **axe:** `nested-interactive` [serious] — **7 nós** nos 4 combos do desktop e nos 2 do alto contraste (quando a barra está **expandida**)
- **Tela:** barra lateral expandida (visível em Configurações, Administração, Segurança e Aparência) · 1280×800
- **Passos:** 1280 → "Expandir menu" (a barra abre **recolhida** por padrão em 1280) → abrir um grupo (ex.: "Sistema") → o item de menu (`button[data-tour]`) contém o botão de favorito.
- **Evidência (axe):** `button[data-tour="agents"]` → `<button data-tour="agents" aria-label="Equipe" class="relative flex transi...">` — "Element has focusable descendants"; idem `[data-tour="security"]` ("Segurança") e `[data-tour="privacy"]` ("LGPD").
- **Evidência (ordem de tabulação, `dados/desktop-claro.json`):** em Administração a sequência é `… Equipe > Adicionar aos favoritos > Segurança > Adicionar aos favoritos > …` — ou seja, o botão interno **é** tabulável (não é decorativo), diferente do caso `CRM-08` (lá havia `aria-hidden`/`tabIndex=-1`).
- **Arquivo provável (confirmado, recorte do DOM medido):** `src/components/layout/SidebarNavItem.tsx:39-50` (o `<button data-tour={item.id}>` do item) + `:84-94` (o `<button aria-label="Adicionar aos favoritos">` **dentro** dele; `opacity-0` fora do hover não o retira da ordem de foco).
- **Correção sugerida:** tirar o botão de favorito de dentro do botão do item (irmão posicionado sobre ele, com o item deixando de ser o container) ou trocar o item por `<a>` + botão irmão. **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-12 — Foco cai no `body` no meio da tabulação da tela Configurações no celular · **P2**
- **WCAG:** 2.4.3 / 2.4.7 · **não coberto pelo axe** — medição de tabulação
- **Tela:** Configurações · 390×844 (claro, escuro e alto contraste — **mesmo padrão nos 3**)
- **Passos:** 390 → `?view=settings` → pressionar `Tab` repetidamente.
- **Evidência (medição de foco):** sequência registrada: `Ações rápidas > Chat > Equipe > Email > Contatos > Mais > Salvar Alterações > Horário > Horário de Atendimento > Selecione a conexão > (corpo) > Pular para conteúdo principal > Senha SIP não configurada > Close toast > …` — o 11º `Tab` deixa `document.activeElement === document.body` (`semAnel=1`, nome `body:(corpo)`) e o `Tab` seguinte reinicia no primeiro elemento do documento. Nas outras telas do grupo (Admin, Segurança, Aparência, Notificações, drawer) `semAnel=0`.
- **Interpretação:** o foco é perdido quando o elemento que estava focado sai do DOM (o trecho logo após "Selecione a conexão" é o fim da seção montada) — o navegador devolve o foco ao corpo. Não é possível provar qual elemento sai sem instrumentar o React, por isso o achado fica com a evidência da medição.
- **Arquivo provável:** `src/components/settings/SettingsView.tsx` (troca de aba/conteúdo ao tabular; a aba "Horário" é a ativa em 390) — investigar qual subcomponente desmonta ao perder o foco.
- **Correção sugerida:** garantir que o conteúdo trocado permaneça montado (ou mover o foco de forma explícita ao trocar de aba/seção). **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-13 — Barra de progresso da Segurança sem nome acessível · **P2**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-progressbar-name` [serious] — **1 nó** em **todos os 6 combos**
- **Tela:** Segurança (aba Visão Geral → cartão "Pontuação de Segurança") · 390×844 e 1280×800, claro/escuro/alto contraste
- **Passos:** `?view=security` → primeiro cartão da aba padrão.
- **Evidência (axe):** `.bg-secondary` → `<div aria-valuemax="100" aria-valuemin="0" aria-valuenow="0" aria-valuetext="0%" role="progressbar" data-state="loading" data-value="0">` — "aria-label attribute does not exist or is empty / aria-labelledby … does not exist".
- **Arquivo provável (confirmado):** `src/components/security/SecurityOverview.tsx:230` (`<Progress value={…} />` do `@/components/ui/progress`, sem `aria-label`), dentro do cartão cujo título está em `:212`.
- **Correção sugerida:** `aria-label="Pontuação de segurança"` (ou `aria-labelledby` apontando para o `h3` do cartão). **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-14 — Hierarquia de títulos e ausência de `h1` nas telas do grupo · **P3**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `heading-order` [moderate] (Administração, Segurança, Aparência) + `page-has-heading-one` [moderate] (Aparência, 1280)
- **Evidência (axe):**
  - `<h3 class="font-semibold tracking-tight text-lg">Usuários</h3>` (Administração, 1 nó em cada combo) — vem de `CardTitle`, sem `h2` antes;
  - `<h3 class="text-lg font-semibold mb-1">Pontuação de Segurança</h3>` (Segurança) — vem de `SecurityOverview`, sem `h2`;
  - `<h3 class="text-lg font-semibold text-foreground flex items-center gap-2">Skins…</h3>` (Aparência, 390) e `page-has-heading-one` em `html.light`/`html.dark` (Aparência, 1280) — a tela não tem `h1`.
- **Arquivo provável:** `src/components/admin/AdminUsersTable.tsx:31` (`<CardTitle className="text-lg">Usuários</CardTitle>`), `src/components/security/SecurityOverview.tsx:212`, `src/components/settings/ThemeCustomizer.tsx:40` (o `h3` "Skins" é o título da tela).
- **Correção sugerida:** `CardTitle` como `h2`; na Aparência, promover "Skins" a `h1` (ou envolver a tela no `h1` do `ViewContainer`). **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-15 — Alvos entre 24 e 43 px: a prática móvel de 44 px não é atendida no casco e nos diálogos · **P3**
- **WCAG:** 2.5.5 (AAA) / guia móvel de 44 px · medição própria
- **Evidência (agrupada por seletor, com telas em que aparece):**
  - controles rápidos do rodapé da barra (`button.relative.inline-flex.items-center`) → **36×36** — `Volume dos alertas: 70%`, `Volume dos áudios e vídeos`, `Desativar proteção de tela`, `Configurações de acessibilidade`, `Modo escuro/claro` (`w-[36px] h-[36px]`), `Desativar todas as notificações`, `Perfil e status` (`flex items-center rounded-lg`, só na barra recolhida) — 24 medições cada
  - itens de navegação da barra recolhida e "Expandir menu" → **38×38** (`w-[38px] h-[38px]`), 6 medições
  - "Busca global (⌘K)" recolhido → **38×38**
  - cabeçalho do celular: "Abrir menu", "Buscar", "Notificações" → **40×40** (18 medições cada)
  - aba de Configurações (`#radix-…-trigger-schedule/-messages/-notifications`) → **95×32 / 123×32 / 131×32**; Aparência: "Claro/Escuro/Sistema" **75–110×36**, `theme-save` **91×36**, `theme-reset` **103×36**; Admin: "Forçar logout" **40×36**; diálogo de boas-vindas: "Iniciar Tour Guiado" `292×36`, "Pular tour" `292×38`; tour: "Anterior"/"Próximo" `100×36`
  - `button.peer.inline-flex.h-6` (Switch) → **44×24** — atende o mínimo AA de 24 px, mas fica abaixo da prática de 44
- **Correção sugerida:** elevar para 44 px de altura os controles do rodapé da barra, o cabeçalho do celular e as barras de aba de Configurações/Aparência (as alturas já variam entre 32 e 40 no mesmo rodapé). **Esforço: M**

### A11Y-CONFIG_ADMIN_SHELL-16 — Texto cortado por CSS nas Skins (descrição dos presets e rótulos de tema) · **P3**
- **WCAG:** 1.4.4 (Redimensionar texto) / 1.4.10 (Reflow) · medição própria (largura do cliente × largura do conteúdo)
- **Tela:** Aparência (Skins) · 1280×800 e 390×844, claro/escuro/alto contraste
- **Evidência (medição de texto cortado):**
  - `p.truncate.text-2xs.italic` → `Pride 🏳️‍🌈 — celebrando a comunidade L…` **cliente 133 px × conteúdo 243–260 px**; `Vermelho neon assinatura do Opera GX` 133 × 194–209; `Azul-petróleo do fundo do mar` 133 × 152–164; `Roxo profundo e psicodélico` 133 × 146–155; `Verde RGB Razer Chroma` 133 × 136; `Amarelo neon de Night City` 133 × 136–146 (nos 3 combos de 1280)
  - `button.inline-flex.items-center.justify-center` → `Claro` 75 × 81, `Escuro` 82 × 89, `Sistema` 90 × 98 (390)
  - os `div#aria-route-announcer` aparecem na mesma medição e são **esperados** (é o anúncio `sr-only` de rota) — não são achado.
- **Arquivo provável:** `src/components/settings/ThemeCustomizer.tsx` (descrições dos presets com `truncate`; botões de tema com rótulo curto no mesmo container flex).
- **Correção sugerida:** permitir 2 linhas (`line-clamp-2`) ou `title` com o texto completo nas descrições; dar largura mínima aos botões de tema. **Esforço: P**

### A11Y-CONFIG_ADMIN_SHELL-17 — Bolinhas de passo do tour só funcionam com ponteiro · **P3**
- **WCAG:** 2.1.1 (Teclado) / 4.1.2 · **não coberto pelo axe** (não é elemento focável)
- **Tela:** tour de onboarding · 1280×800
- **Evidência (código):** `src/components/onboarding/TourOverlay.tsx:189-201` — o indicador de passos é uma lista de `motion.div` com `onClick={() => goToStep(index)}` e `cursor-pointer`, **sem** `role`, `tabIndex` ou `onKeyDown`: quem usa teclado só tem "Anterior"/"Próximo" (não dá para pular direto para um passo).
- **Correção sugerida:** trocar por `<button>` (ou `role="tab"` com navegação por setas) com `aria-label="Passo N"`. **Esforço: P**

## 4. Verificado SEM problema (e como foi verificado)

1. **Rolagem horizontal:** 0 estouros nas 48 medições de tela (`document.documentElement.scrollWidth == clientWidth`; 390/390 e 1280/1280) e 0 elementos com largura acima da viewport sem ancestral que recorta. Vale para barra lateral (expandida/recolhida), cabeçalho, drawer, Notificações, Configurações, Administração, Segurança e Aparência nos 6 combos.
2. **Anel de foco:** 16 `Tab` por medição — **0 elementos focados sem anel visível** em todas as telas do grupo, exceto o caso do achado 12 (Configurações no celular, onde o foco sai para o `body`, não um controle sem anel).
3. **Diálogos cabem na viewport:** boas-vindas **358×576** em 390×844 (canto 16,134; não rolável) e **512×523** em 1280×800 (canto 384,139); popover de notificações **360 px** de largura (`NotificationsPopover.tsx:59`); painel de notificações do celular `top-14 right-2 left-2` + `max-h-[70vh]`. Nenhum diálogo do grupo estourou largura ou altura.
4. **Contraste nas telas de Configurações e Segurança:** nenhuma violação `color-contrast` em Configurações (fora do `kbd` do atalho, achado 09) e nenhuma em Segurança nos 6 combos — os problemas de contraste do grupo estão em Administração, Aparência e no chip de status em alto contraste.
5. **Contraste do diálogo de boas-vindas:** a única violação que apareceu (título `#555658` sobre `#18181b`, 2,41:1) foi **invalidada**: medida com a animação de entrada em curso. Na re-verificação após 2,5 s, o título é `rgb(248,250,252)` sobre `rgb(24,24,27)` (≈17:1) e o axe volta **0 violações** naquele diálogo.
6. **Foco fora da viewport na barra lateral:** não reproduzido (40 `Tab` com a barra expandida a partir de `?view=inbox`, conferindo também o `scrollTop` do scroller: nenhum elemento focado fora da dobra). Registrado aqui para não virar achado falso.
7. **Rede real:** nenhuma requisição escapou dos mocks nas 48 medições (o guarda bloquearia com 403) — a auditoria rodou 100% em dados sintéticos, sem tocar em banco ou serviço real.
8. **Sem erro de medição:** `9 passed (2.4m)`, com 0 exceção no harness (a sonda de arranque passou isoladamente antes da rodada completa).

## 5. Resumo por severidade

| Severidade | Qtde | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 5 | SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05 |
| P2 | 8 | SHELL-06, SHELL-07, SHELL-08, SHELL-09, SHELL-10, SHELL-11, SHELL-12, SHELL-13 |
| P3 | 4 | SHELL-14, SHELL-15, SHELL-16, SHELL-17 |
| **Total** | **17** | |

Critérios: **P0** bloquearia o uso da tela; **P1** barra o uso por leitor de tela/teclado (ou uma funcionalidade inteira no celular); **P2** barra ou degrada em condição específica (tema, tamanho de alvo, papel ARIA errado, foco perdido); **P3** melhoria de conformidade/prática, sem bloquear.

## 6. Resumo por tela

| Tela | Achados |
|---|---|
| Casco do desktop — barra expandida | 10 (P2), 11 (P2), 09 (P2, chip em alto contraste), 15 (P3) |
| Casco do desktop — barra recolhida | 10 (P2), 15 (P3) |
| Cabeçalho do celular | 10 (P2), 15 (P3) |
| Painel de menu (drawer) | 03 (P1), 09 (P2), 15 (P3) |
| Notificações (popover desktop) | 07 (P2), 09 (P2) |
| Notificações (painel celular) | 04 (P1), 08 (P2), 09 (P2), 10 (P2) |
| Configurações | 09 (P2), 12 (P2), 15 (P3) |
| Administração (Usuários) | 02 (P1), 09 (P2), 10 (P2), 14 (P3), 15 (P3) |
| Segurança | 01 (P1), 13 (P2), 14 (P3) |
| Aparência (Skins) | 04 (P1), 09 (P2), 14 (P3), 15 (P3), 16 (P3) |
| Diálogo de boas-vindas | 15 (P3) |
| Tour de onboarding | 05 (P1), 06 (P2), 10 (P2), 17 (P3) |

## 7. Contagem bruta do axe (por regra × tela × viewport/tema)

Total: **239 nós** em 8 regras, somando as 48 medições de tela + as medições de diálogo/tour (`desktop-claro` 45, `desktop-escuro` 41, `hc-desktop` 46, `mobile-claro` 35, `mobile-escuro` 29, `hc-mobile` 30, `dialogos-desktop` 12, `dialogos-mobile` 1).

| Regra | impacto | nós | telas (nós por medição) |
|---|---|---|---|
| `nested-interactive` | serious | **84** | barra lateral expandida em Configurações/Administração/Segurança/Aparência — **7 nós em cada** (4 telas × 3 combos de 1280) |
| `button-name` | critical | **67** | Segurança **33** (11 em cada um dos 3 combos de 390), Administração **18** (3 × 6 combos), Aparência **6** (1 × 6 combos), tour **4** (1 em cada passo/estado medido), painel de notificações do celular **3** (1 × 3 combos de 390), drawer **3** (1 × 3 combos de 390) |
| `color-contrast` | serious | **41** | Administração **17**, Aparência **8**, drawer **8**, Configurações **1** (390 claro), diálogo de boas-vindas **1** (durante a animação — invalidado), chip de status (barra expandida, recolhida, casco do celular e painel de notificações) **4** (só alto contraste) |
| `heading-order` | moderate | **18** | Administração **6**, Segurança **6**, Aparência **3**, painel de notificações do celular **3** |
| `region` | moderate | **17** | painel de notificações do celular **9** (3 × 3 combos de 390), tour **8** (2 em cada passo/estado medido) |
| `aria-progressbar-name` | serious | **6** | Segurança **1 em cada combo** |
| `aria-dialog-name` | serious | **3** | popover de notificações **1 em cada combo de 1280** |
| `page-has-heading-one` | moderate | **3** | Aparência **1 em cada combo de 1280** |

## 8. O que o cartão de correção deve considerar

- **Os cinco P1 são nome acessível (4 deles) + funcionalidade no celular (1)** e se resolvem em 6 arquivos: `security/SecurityView.tsx`, `admin/AdminUsersTable.tsx`, `mobile/MobileDrawerMenu.tsx`, `mobile/NotificationsPanel.tsx`, `settings/ThemeCustomizer.tsx`, `onboarding/TourOverlay.tsx` — cabe **um** cartão de correção para os P1, com o `aria-label` em cada controle.
- **O tour no celular (SHELL-05) não é só `aria-label`:** exige dar `data-tour` aos alvos do casco móvel (ou passos próprios) — se for para separar, este é o único P1 que precisa de decisão de produto.
- **O contraste (SHELL-09) precisa de decisão de token** (claro/escuro **e** alto contraste: o chip `bg-accent` piora no alto contraste) antes de abrir o cartão — muda cor em 4 telas.
- **SHELL-11 (barra lateral)** é o mesmo componente do cartão **Y14** (`SidebarNavItem`): lá foi citado o alvo de 38 px; aqui fica o `nested-interactive` do botão de favorito. Não duplicar: um cartão só para `SidebarNavItem.tsx`.
- **SHELL-10 e SHELL-15** tocam os mesmos controles do casco (barra lateral, cabeçalho, rodapé de controles rápidos): vale um cartão só de alvos de toque do casco + diálogos.
- **Os itens do `<Switch>` sem nome** aparecem também em `notifications/*` e `security/RateLimitConfigPanel.tsx`/`SecurityNotificationsPanel.tsx` (por inspeção de código, telas não medidas nesta rodada) — quem corrigir o padrão deve varrer esses arquivos de uma vez.
