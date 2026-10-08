Especialista: worker (testes)

# AUDITORIA A11Y E CELULAR — Telefonia, E-mail, Multiplix e Talk X (Y15)

- **Data:** 2026-10-07 · **Cartão:** t_414bbbd0 (Y15) · **Área:** testes do produto (`area-testes-do-produto`) · **Plano:** `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo entregue é este relatório.
- **Escopo de telas (15):** Telefonia (discador/histórico e chamada selecionada), módulo E-mail (lista, leitura da conversa, compositor), Multiplix (busca com seleção, compositor de disparo, monitor de disparo) e Talk X (visão geral, segmentos, templates, lista de supressão, analytics, nova campanha/wizard, execução/monitor ao vivo).

## 1. Método (o que foi realmente executado)

| Item | Valor |
|---|---|
| App | build de desenvolvimento do PRÓPRIO workspace (`npx vite`, `127.0.0.1:5199`, `VITE_CRM_INTEGRATION_ENABLED=true`) |
| Sessão | FALSA, injetada no `localStorage` pelo harness (usuário `admin` sintético). Nenhum login real. |
| Backend | 100% mockado por `page.route` (identidade, `feature_flags`, Telefonia/`get-sip-password`, E-mail, `multiplix-*`, Talk X e `supabase/functions/*`). Toda a rede real cai em bloqueio (403). |
| Dados | sintéticos (empresas "Brindes Sintéticos LTDA"/"Transportadora Exemplo", campanhas de demonstração, conversas de e-mail de exemplo). Nenhum dado de cliente, telefone real, CPF/CNPJ ou URL de produção. |
| Viewports | **390×844** e **1280×800** |
| Temas | **claro** e **escuro** (`localStorage.theme` antes do boot) |
| Ferramenta | Playwright (Chromium), axe-core (`axe.run`, `resultTypes: ['violations']`, catálogo completo) |
| Medições por tela | axe; rolagem horizontal; alvos de toque; nome acessível; ordem de tabulação (18 `Tab`) + anel de foco; overlays (caber na viewport); detalhes de evidência (seletor + trecho) |
| Resultado da rodada final | `15 telas × 4 combos = 60` medições de axe, **0 erro de medição** (`nao-abriu: 0`), 400 registros em `.tmp/a11y-audit/dados{2,3,4}.jsonl` |
| Harness | spec/config temporários em `.tmp/a11y-audit/` (`y15.spec.ts`, `y15b.spec.ts`, `y15c.spec.ts`, `playwright.audit.config.ts`, `analisa*.py`) — **fora do git; não foram commitados nem anexados ao cartão**. O diff do cartão traz só este `.md`. |
| Dados brutos | `.tmp/a11y-audit/dados2.jsonl` + `dados3.jsonl` + `dados4.jsonl`; resumos derivados `resumo2.txt`/`resumo3.txt`/`contraste.txt`; 0 registro `nao-abriu` na conta final |

### Desvios declarados (medições fora do que o cartão pediu)

1. **Banco e sessão (desvio principal).** A medição rodou com **backend 100% mockado e sessão FALSA**, e **não** com o **banco LOCAL com admin local** que o cartão pede. Consequência, declarada em cada achado: tudo o que é **estrutura** (nome acessível, ARIA, ordem de foco, tamanho de alvo, hierarquia de títulos, par de cores do tema) vale apesar dos mocks; mas as **contagens de nós** dependem de quantas linhas/campos o mock renderiza.
2. **Duas passadas extras (falha do harness, não do produto).** Na 1ª passada: (a) a tela "leitura do E-mail" clicava o **primeiro botão** do painel de threads — que é o "Nova mensagem" — então media o **compositor**; (b) a busca do Multiplix clicava "Buscar" e o Playwright pegava o botão **homônimo do casco** (`strict mode violation`). Corrigido: o e-mail abre a conversa **pelo assunto** e o Multiplix clica dentro do `main`. Os registros antigos dessas telas foram **descartados da conta** (`dados3`/`dados4` substituem) — o número final é 15 telas × 4 combos, com 0 `nao-abriu`.
3. **Amostra do axe.** `axe.run` devolve TODOS os nós em `violations`; o harness guarda o **total real** (`nos`) e uma **amostra de até 6 nós por regra por tela** (`y15.spec.ts:148`). Os totais deste relatório são os reais; onde a evidência vem da amostra, está dito.

### Limitações honestas (o que NÃO foi medido)

1. **Teclado virtual** cobrindo campos: não é simulável no headless. O que dá para afirmar foi medido: os overlays cabem na viewport (compositor do E-mail 374×489 em 390×844, base 764 < 844) e o formulário do Multiplix usa `ScrollArea`.
2. **Texto cortado por elemento**: o harness mede **estouro do documento** (0 em 60 medições) e elementos fora da viewport (0), não `scrollWidth > clientWidth` de cada nó. O risco citado no achado de P3 vem de inspeção de classe, não de medição.
3. **Contagens que dependem do mock**: nº de linhas de tabela, de campanhas, de conversas e de contatos renderizados.
4. **Toast de erro do provedor de chamadas** aparece em várias telas só porque o mock responde `503` a `get-sip-password` — é o `toast.error` do sonner (CASCO, não o grupo) e está marcado como tal.

## 2. Cobertura

| Tela | 390×844 claro | 390×844 escuro | 1280×800 claro | 1280×800 escuro |
|---|---|---|---|---|
| Telefonia — discador/histórico | ✔ | ✔ | ✔ | ✔ |
| Telefonia — chamada selecionada | ✔ | ✔ | ✔ | ✔ |
| E-mail — lista | ✔ | ✔ | ✔ | ✔ |
| E-mail — leitura (conversa) | ✔ | ✔ | ✔ | ✔ |
| E-mail — compositor (nova mensagem) | ✔ | ✔ | ✔ | ✔ |
| Multiplix — busca com seleção | ✔ | ✔ | ✔ | ✔ |
| Multiplix — compositor de disparo | ✔ | ✔ | ✔ | ✔ |
| Multiplix — monitor de disparo | ✔ | ✔ | ✔ | ✔ |
| Talk X — visão geral | ✔ | ✔ | ✔ | ✔ |
| Talk X — segmentos | ✔ | ✔ | ✔ | ✔ |
| Talk X — templates | ✔ | ✔ | ✔ | ✔ |
| Talk X — lista de supressão | ✔ | ✔ | ✔ | ✔ |
| Talk X — analytics | ✔ | ✔ | ✔ | ✔ |
| Talk X — nova campanha (wizard) | ✔ | ✔ | ✔ | ✔ |
| Talk X — execução (monitor ao vivo) | ✔ | ✔ | ✔ | ✔ |

## 3. Achados

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-01 — `Select`s sem nome acessível nos filtros do Talk X, no monitor do Multiplix e no wizard · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) / 1.3.1 · **axe:** `button-name` [critical] em `role="combobox"`
- **Telas:** Talk X — visão geral, segmentos, execução e wizard (**1 nó por combo cada**) e Multiplix — monitor de disparo (**1 nó por combo**) → **20 nós** nos 4 combos de cada tela.
- **Passos:** abrir a tela; o gatilho do `Select` é um `<button role="combobox">` sem texto, `aria-label`, `aria-labelledby` nem `title`. Ex.: Talk X → tabela de campanhas/segmentos, filtro de itens por página; Talk X — execução e Multiplix — monitor, `SelectTrigger` de "Todos".
- **Evidência (axe):** `.w-auto` → `<button type="button" role="combobox" aria-expanded="false" ... class="flex items-center ju...">` (Talk X — visão geral, segmentos, execução) e `.rounded-md` → mesmo markup (Multiplix — monitor); wizard → `.md\:grid-cols-\[2fr_1fr_1fr\] > div:nth-child(2) > .\[\&\>span\]\:line-clamp-1[role="combobox"]`. Motivo: *"Element does not have inner text that is visible to screen readers / aria-label attribute does not exist or is empty"*.
- **Arquivo provável / TODOS os caminhos do mesmo defeito** (`git grep '<SelectTrigger'`): `src/components/talkx/kit/table.tsx:28` (Talk X — visão geral/segmentos), `src/components/talkx/TalkXLiveMonitor.tsx:225` (execução), `src/components/multiplix/MultiplixMonitor.tsx:202` (monitor), `src/components/talkx/TalkXCampaignWizard.tsx:342` (campanha → campo "Objetivo").
- **Correção sugerida:** o padrão já existe no próprio grupo — `TalkXCampaignWizard.tsx:355` (`aria-label="Conexão WhatsApp"`), `:367` (`"Responsável"`), `:253/259/266` (filtros), `kit/filters.tsx:77` (`aria-label={fd.label}`), `MultiplixView.tsx:198` (`"Público"`). Basta repetir: `aria-label="Itens por página"` (table.tsx:28), `aria-label="Filtrar por status"` (monitor), `aria-label="Objetivo"` (wizard:342). **Esforço: P**
- **Depende do mock:** não (a ausência de nome é do markup).

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-02 — Barra de progresso do monitor do Multiplix sem nome · **P1**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-progressbar-name` [serious]
- **Telas:** Multiplix — monitor de disparo · **1 nó por combo, 4 combos**.
- **Passos:** abrir o monitor de um disparo; a barra é `<div role="progressbar" data-state="indeterminate" class="... bg-secondary h-3 mb-1.5">` sem `aria-label`/`aria-labelledby`/`aria-valuetext`.
- **Evidência (axe):** `.bg-secondary` → `<div aria-valuemax="100" aria-valuemin="0" role="progressbar" data-state="indeterminate" data-max="100" class="relative w-full overflow-hidden rounded-full bg-secondary h-3 mb-1.5">`.
- **Arquivo provável:** chamada em `src/components/multiplix/MultiplixMonitor.tsx:151` (`<Progress value={progress} className="h-3 mb-1.5" />`) sobre o componente compartilhado `src/components/ui/progress.tsx:10-20` (repassa `...props`, então aceita `aria-label` — nenhum chamador do grupo passa).
- **Correção sugerida:** `<Progress aria-label="Progresso do disparo" aria-valuetext={`${progress}% concluído`} ... />`; o texto visível ao lado (`MultiplixMonitor.tsx:153`) já dá o rótulo exato. **Esforço: P**
- **Depende do mock:** a barra aparece nos dois estados (`complete` e `indeterminate`); axe aponta o nó `indeterminate`.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-03 — Contraste do token `--foreground-secondary` no tema CLARO (1,57–1,76:1) em Talk X e Multiplix · **P2**
- **WCAG:** 1.4.3 (Contraste Mínimo) · **axe:** `color-contrast` [serious]
- **Telas:** Talk X — visão geral, segmentos, templates, supressão, analytics, wizard, execução **e** Multiplix — busca/compositor/monitor. No recorte de **111 nós** com motivo preservado na amostra, **67 são este token** — a maior parte das **187** ocorrências de `color-contrast` da rodada (§7).
- **Passos:** abrir qualquer uma dessas telas no **tema claro**; todo texto com `text-foreground-secondary` (subtítulo do cabeçalho, rótulos de KPI, cabeçalhos de tabela, rótulos do wizard, contadores do monitor, "Restantes") fica quase invisível sobre branco/cinza claro.
- **Evidência (axe):** `#b6c4d8` sobre `#ffffff` = **1,76:1** (22 nós), sobre `#f6f7f9` = **1,64:1** (13), sobre `#f1f3f5`/`#f1f2f5` = **1,58:1** (6), sobre `#fafbfc` = **1,70:1** (4), sobre `#fbfcfd` = **1,72:1** (1). Trecho: `<p class="text-2xs text-foreground-secondary">…</p>`, `<Label class="text-xs text-foreground-secondary">` (`TalkXCampaignWizard.tsx:333/340/363/365`), `<span class="text-3xs text-foreground-secondary">Restantes</span>` (`MultiplixMonitor.tsx:183`).
- **Arquivo provável (causa raiz única):** `src/styles/tokens.css:355` — `--foreground-secondary: 215 30% 78%` declarado **dentro do `:root`** (tema claro, bloco `3–375`), um valor pensado para o painel navy escuro. Publicado em `tailwind.config.ts:64` e consumido **154×** só em `src/components/talkx/**`.
- **Correção sugerida:** corrigir no **token**, não nos 154 usos — no bloco `:root`, apontar `--foreground-secondary` para um valor escuro do próprio sistema (o projeto já tem `--muted-foreground: 221 10% 40%` em `tokens.css:137`, usado no claro) ou dar um **override só no claro** mantendo o valor atual no `.dark` (`tokens.css:376+`). **Sem cor nova.** **Esforço: P**
- **Depende do mock:** não (o par de cores é do tema).

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-04 — Contraste abaixo de 4,5:1 em selos, avatares, botões de estado e chips do grupo · **P2**
- **WCAG:** 1.4.3 · **axe:** `color-contrast` [serious]
- **Telas e evidência (amostra, com a razão medida):**
  - **Telefonia (discador/histórico + chamada selecionada):** selo de canal `bg-secondary text-secondary-foreground` = **3,3:1** (8 nós) → `src/components/calls/CallChannelBadge.tsx:38`; avatar de origem `bg-primary/15 text-primary` = **3,91:1** no claro e **2,75:1 / 3,01:1** no escuro (7 nós) → par definido em `src/lib/avatar-colors.ts:6` (`{ bg: 'bg-primary/15', text: 'text-primary' }`), aplicado em `src/components/calls/CallContactCell.tsx:22/34` (mesmo par em `ActiveCallBar.tsx:47`); status **"Perdida"** `text-destructive` `#ef4343` sobre branco = **3,78:1** (3 nós) → `<Badge variant="destructive" className="text-3xs">` em `src/components/calls/TelefoniaView.tsx:177`, com o rótulo no mapa de `:179-182`.
  - **E-mail (leitura da conversa):** chip de horário `text-primary-foreground/60` `#a7c1f7` sobre `#2463eb` = **2,86:1** (4 nós) → `src/components/email/EmailChatBubble.tsx:213`; tamanho do anexo `.opacity-60` `#6a6d75` sobre `#dadddf` = **3,79:1** (2 nós) → `EmailChatBubble.tsx:202`; avatar "Eu" `bg-primary/10 text-primary` = **4,21:1** no claro e **3,46:1** no escuro (4 nós) → `EmailChatBubble.tsx:229`.
  - **Talk X:** `bg-primary/15 text-primary-glow` `#526cef` sobre `#1a233a` = **3,53:1** (5 nós, segmentos — selo de segmento ZAPP); `text-primary-glow` sobre `#251f10` = **3,7:1** (1, supressão); `text-dash-green` `#0bcb75` sobre branco = **2,13:1** (2, supressão); `#c94b57` sobre `#201417` = **3,94:1** (1, segmentos, escuro); `#ef4c4c` sobre `#f5e5e8` = **2,98:1** (1, segmentos, claro).
  - **Multiplix (monitor):** botão "Pausar" `text-dash-amber` `#f3ba12` sobre `bg-dash-amber/10` = **1,67:1** (2 nós) e "Cancelar" `text-dash-red` `#f94851` sobre `bg-dash-red/10` = **3,05:1** (2) → `src/components/multiplix/MultiplixMonitor.tsx:145` e `:147`.
  - **Transversal (CASCO, não é do grupo):** toast de erro "Erro ao conectar ao servidor SIP" `#ef4343` sobre `#f5e5e7` = **3,1:1** aparece em 4 telas do grupo porque o mock devolve `503` em `get-sip-password` (`src/lib/calls/sipProvisioning.ts:31`); fica para o cartão do casco.
- **Correção sugerida:** usar os pares já existentes no sistema — no claro, `text-destructive` → `--destructive-text` e `text-*` de selo → o par `*-foreground` correspondente; nos fundos `bg-*-10/20`, subir o tom do texto em vez de clarear o fundo; no avatar, `text-primary` sobre `bg-primary/15` só passa se o texto for `--primary-text`. **Sem cor nova.** **Esforço: M**
- **Depende do mock:** parcial (os selos existem sempre; a contagem varia com o dado).

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-05 — Compositor do E-mail é um portal fora de qualquer landmark · **P2**
- **WCAG:** 1.3.1 (Informação e Relações) · **axe:** `region` [moderate] — **6 nós por combo, 4 combos (24 nós)**
- **Telas:** E-mail — compositor (nova mensagem).
- **Passos:** E-mail → "Nova mensagem"; o compositor é criado com `createPortal(...)` no `document.body` e não tem `role="dialog"`, `<main>`, `<section aria-label>` nem `<aside>` — quem navega por regiões (leitor de tela, atalho de landmark) não o alcança.
- **Evidência (axe):** nós `…` com `<label class="text-xs text-muted-foreground w-12 shrink-0">Para:</label>`, `<input aria-label="Destinatários" …>`, `Cc/Bcc`, o `<span>Nova mensagem</span>` e a área do editor de texto.
- **Arquivo provável:** `src/components/gmail/EmailComposer.tsx:335` (`return createPortal((` … `motion.div`) — montado por `src/components/email/EmailChatInbox.tsx:206`.
- **Correção sugerida:** envolver o conteúdo do portal em `role="dialog"` + `aria-label="Nova mensagem"` (ou `<section aria-label="Compositor de e-mail">`) **sem** prender o foco (o compositor é minimizável por decisão de produto). **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-06 — Campo de resposta do E-mail só tem nome por `placeholder` · **P2**
- **WCAG:** 3.3.2 (Rótulos ou Instruções) / 2.4.6 · **axe:** `label-title-only` [serious]
- **Telas:** E-mail — leitura (conversa) · **1 nó por combo, 4 combos**.
- **Passos:** abrir uma conversa; a caixa de resposta (`textarea`) tem `placeholder="Digite sua resposta..."` + `aria-describedby="email-reply-shortcut"`, **sem** `aria-label` nem `<label>` associado. O placeholder some ao digitar e o campo perde o rótulo.
- **Evidência (axe):** `textarea[placeholder="Digite sua resposta..."]` → `<textarea … placeholder="Digite sua resposta..." aria-describedby="email-reply-shortcut" class="…resize-none…">` (o `aria-describedby` aponta para o texto `sr-only` de atalho, que não nomeia o campo).
- **Arquivo provável:** `src/components/email/EmailChatReplyBar.tsx:218-222` (campo) e `:257` (`<p id="email-reply-shortcut">`).
- **Correção sugerida:** `aria-label={mode === 'new' ? 'Nova mensagem' : mode === 'forward' ? 'Encaminhar mensagem' : 'Resposta'}` no `textarea` (os botões vizinhos já usam `aria-label` — `:231`, `:252`, `:269`). **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-07 — `aria-controls` das abas de canal da Telefonia aponta para id inexistente · **P2**
- **WCAG:** 4.1.2 · **axe:** `aria-valid-attr-value` [critical]
- **Telas:** Telefonia — discador/histórico **e** chamada selecionada · **1 nó por combo, 8 grupos (2 telas × 4 combos)**.
- **Passos:** abrir a Telefonia; as abas de canal (`Todos`, `VoIP`, `WhatsApp`) usam `Tabs`/`TabsTrigger` do Radix sem nenhum `TabsContent` — o `aria-controls` gerado aponta para um id que não existe no DOM.
- **Evidência (axe):** `[data-testid="tel-channel-tab"]` → `<button role="tab" aria-controls="radix-…-content-…">` com *"Element has a invalid aria-controls attribute"*. O harness lista os **3** gatilhos pendurados: `['Todos','VoIP','WhatsApp']`.
- **Arquivo provável:** `src/components/calls/CallHistoryTabs.tsx:23-42` (a lista de abas filtra o histórico na mesma view; não há painel associado).
- **Correção sugerida:** ou renderizar um `TabsContent` real por aba, ou trocar as abas por um `radiogroup`/grupo de botões com `aria-pressed` — que é o que o componente de fato faz (filtro, não aba). **Esforço: P**
- **Depende do mock:** a contagem de linhas do histórico, sim; o defeito não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-08 — Link "Saiba mais →" distinguido só por cor dentro do texto · **P2**
- **WCAG:** 1.4.1 (Uso de Cor) · **axe:** `link-in-text-block` [serious]
- **Telas:** Talk X — lista de supressão (tema claro e escuro, 1280×800) · **1 nó por combo, 2 grupos**.
- **Passos:** Talk X → Lista de supressão; no rodapé do bloco de aviso, `Saiba mais →` é `text-primary-glow` sem sublinhado, colado ao texto ao redor (`#526cef` sobre `#1a233a` = 3,53:1 no escuro; a diferença para o texto vizinho fica abaixo do exigido).
- **Evidência (axe):** `a.text-primary-glow.hover\:underline` → `<a class="text-primary-glow hover:underline" …>Saiba mais →</a>` (71×15 px).
- **Arquivo provável:** `src/components/talkx/TalkXSuppression.tsx:223`.
- **Correção sugerida:** `underline` permanente (mantendo `hover:`) ou `className` com `underline-offset-2` — o padrão de link do sistema. **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-09 — Alvos de toque abaixo de 24×24 px (WCAG 2.5.8 AA) · **P2**
- **WCAG:** 2.5.8 (Tamanho do Alvo, Mínimo) · medido pelo harness (`getBoundingClientRect` dos clicáveis visíveis)
- **Telas e itens (medidos, 390×844 e 1280×800):**
  - **16×16** — `button.peer.h-4.w-4` **"Selecionar todas"/"Selecionar <empresa>"** na tabela de campanhas do Talk X — visão geral e na lista de empresas do Multiplix — busca com seleção (checkboxes do Radix sem área de toque);
  - **16×16** — `button.text-muted-foreground.hover:text-dash-amber` **"Favoritar"** (estrela) em Talk X — segmentos → `src/components/talkx/TalkXSegments.tsx:144`;
  - **20×20** — `button.rounded.p-1.hover:bg-foreground/10` **"Visualizar"/"Baixar deployment-log.txt"** e **22×22** — `button.p-1.rounded-full.bg-card` **"Responder"/"Encaminhar"** em E-mail — leitura;
  - **24×24** — "Minimizar compositor"/"Fechar e manter rascunho" (E-mail — leitura) e o "Close" do diálogo do Multiplix — compositor (**no limite**, não é violação de 2.5.8);
  - **excluídos de propósito:** os *skip links* (`a.sr-only.focus:not-sr-only`, 1×1 — só existem assim fora de foco) e o "Close toast" (20×20 — sonner, **CASCO**).
- **Evidência:** `alvos.total` por tela + `amostra` (até 30 itens) em `.tmp/a11y-audit/dados{2,3,4}.jsonl`; exemplos: `16x16 button.peer.h-4.w-4 'Selecionar Brindes Sintéticos LTDA'`, `16x16 button.text-muted-foreground.hover:text-dash-amber 'Favoritar'`, `20x20 'Visualizar deployment-log.txt'`.
- **Correção sugerida:** aumentar a **área clicável** (não o ícone): `p-1.5`/`h-6 w-6` nos ícones e um `label`/`span` com `py-1` em volta dos checkboxes. **Esforço: P**
- **Depende do mock:** a contagem (nº de linhas/empresas), não o defeito.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-10 — Região rolável do Talk X inalcançável por teclado em 390×844 · **P2**
- **WCAG:** 2.1.1 (Teclado) · **axe:** `scrollable-region-focusable` [serious]
- **Telas:** Talk X — analytics, **390×844** (claro e escuro) · **1 nó por combo, 2 grupos**.
- **Passos:** abrir Talk X → Comparativo (analytics) no celular; a área `overflow-x-auto` que contém a tabela de comparação rola **só com o dedo** — sem `tabindex="0"`, o teclado não a alcança.
- **Evidência (axe):** `section:nth-child(5) > .overflow-x-auto` → *"Element has scrollable content, but is not focusable"*.
- **Arquivo provável:** `src/components/talkx/TalkXAnalytics.tsx:307`, `:329`, `:407` (`<div className="overflow-x-auto">`).
- **Correção sugerida:** `tabIndex={0}` + `role="region"` + `aria-label` na área rolável (ou `motion-safe` de nada — é foco, não animação). **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-11 — Hierarquia de títulos salta de h1 para h3 no Talk X e no E-mail · **P3**
- **WCAG:** 1.3.1 / 2.4.6 (Cabeçalhos e Rótulos) · **axe:** `heading-order` [moderate] — **18 nós**
- **Telas:** Talk X — visão geral, analytics, wizard e execução (**1 nó por combo cada, 16**) e E-mail — leitura em 390×844 (**2 nós**). Ex.: `<h3 class="text-[15px] font-semibold text-foreground leading-tight">Talk X</h3>` (visão geral e execução), `<h3 class="text-sm font-semibold text-foreground">Insights</h3>` (`TalkXAnalytics.tsx:442`), `<h3 class="font-semibold tracking-tight text-sm flex items-center gap-2">` (wizard) e, no E-mail, o **assunto da conversa** em `<h3>` (`EmailChatThread.tsx:250`) depois de `<h1>Email</h1>` sem `<h2>` no meio.
- **Arquivo provável (um por tela):** `src/components/talkx/kit/rail.tsx:56` — `<h3 className="text-[15px] font-semibold text-foreground leading-tight">` do `RailCard`, que é o "Talk X" de **visão geral** e **execução** (reexportado por `src/components/talkx/talkxShared.ts:11` e usado em `TalkXOverview.tsx:301-319` / `TalkXCampaignRunning.tsx:104`); `src/components/talkx/TalkXAnalytics.tsx:442` (`Insights`); `src/components/talkx/TalkXContactSelector.tsx:120` (`<CardTitle className="text-sm flex items-center gap-2">` → vira `<h3>` em `src/components/ui/card.tsx:80`, no wizard); e `src/components/email/EmailChatThread.tsx:250` (assunto da conversa, 390×844).
- **Correção sugerida:** o título de seção vira `<h2>` (o `<h3>` continua nos itens internos). **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-12 — Duas `<h1>` na mesma tela em todas as 15 telas do grupo · **P3**
- **WCAG:** 1.3.1 / 2.4.6 (axe `page-has-heading-one` passa; o defeito é de estrutura) · medido pelo harness (`headings` de cada tela)
- **Telas:** **todas** — `<h1>Voip</h1>` + `<h1>Telefonia</h1>`; `<h1>Email-chat</h1>` + `<h1>Email</h1>`; `<h1>Talkx</h1>` + `<h1>Campanhas</h1>` (e `+ <h1>Nova campanha</h1>` no wizard); `<h1>Multiplix</h1>` + `<h1>Multiplix</h1>`.
- **Evidência:** `390x844/light Telefonia — discador/histórico H1s: ['H1: Voip', 'H1: Telefonia']`; `… E-mail — lista H1s: ['H1: Email-chat', 'H1: Email']`; `… Multiplix — busca com seleção H1s: ['H1: Multiplix', 'H1: Multiplix']`.
- **Arquivo provável:** o primeiro `<h1>` vem do rótulo da view no cabeçalho do módulo (`breadcrumb`/`PageHeader`) e o segundo do topo de cada view (`TelefoniaView.tsx`, `EmailChatInbox.tsx`, `MultiplixView.tsx`, `TalkXView.tsx`).
- **Correção sugerida:** rebaixar o rótulo da view para `<p>`/`<span>` (`aria-hidden` quando for só visual) e manter um único `<h1>` por tela. **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-13 — Alvos entre 24 e 43 px: a prática móvel de 44 px não é atendida · **P3**
- **WCAG:** 2.5.5 (Tamanho do Alvo, AAA) — **prática** recomendada no celular, não violação de AA
- **Telas/itens medidos (amostra; a lista completa está em `.tmp/a11y-audit/dados*.jsonl`, tipo `alvos`):** Telefonia — `Período` 150×40, `tel-history-scope/direction/result` 40, `tel-history-search` 40, `tel-row-callback` 27×36; E-mail — "Buscar nas conversas" 245×32, "Filtrar conversas" 112×32, "Filtrar por período" 94×28, "Com o anexo" 100×28, "Novo" 82×28, paginação 24×24, barra de formatação 28×28; Talk X — abas 40, "Nova campanha" 157×36, "Ajuda" 80×36, "Lista/Grade" 36×36, "Atualizar" 36×36, "Ações" 32×32, filtros/"Limpar filtros" 36, "8 por página" 117×32, passos do wizard 32×32; Multiplix — "Público" 176×40, "UF" 128×40, "Ramo" 224×40, "Todos" 130×32, "+ Empresa" 94×36, "Criar disparo" 106×40.
- **Correção sugerida:** subir os controles de barra para `h-11` (44 px) no celular e dar `py-2` ao texto clicável das tabelas. **Esforço: M**
- **Depende do mock:** contagem, não estrutura.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-14 — Rótulo visível não é o nome programático do campo (nome só pelo `placeholder`) · **P3**
- **WCAG:** 3.3.2 / 2.4.6 · **nota importante:** a regra `label` do axe **não** dispara (o axe usa `placeholder` como nome — `axe.js:14582`), então isto é risco de uso, não violação de 4.1.2.
- **Telas:** Multiplix — busca (`<span>Buscar por nome</span>` + `<Input placeholder="Nome da empresa...">`), Talk X — filtros/segmentos (inputs com `placeholder` sem rótulo associado), E-mail — "Assunto"/"Destinatários" do compositor (estes têm `Label`, ok) e Telefonia — busca de ligações.
- **Evidência:** `MultiplixView.tsx:237-239` (o `<span>Buscar por nome</span>` não é `<label for>` nem `aria-labelledby`); nos registros `detalhes.semNome` os inputs aparecem sem nome — e, apesar disso, **não** entram como violação de `label` do axe.
- **Correção sugerida:** trocar o `<span>` por `<Label htmlFor={id}>` ou `aria-label` no `Input`. **Esforço: P**
- **Depende do mock:** não.

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-15 — Itens do CASCO medidos nas telas do grupo (fora do escopo deste cartão) · **P3 (para o cartão do casco)**
- **O que foi visto (não é achado do grupo, está registrado para não se perder):** botões de navegação lateral `38×38` (`button.relative.flex.items-center`: Telefonia, Multiplix, Campanhas, Chatbot, …), `w-[38px] h-[38px]` do menu/busca global, `busca global (⌘K)`, grupos de menu `41×30` ("Vendas & CRM — expandir", "Analytics — expandir"), "Abrir menu"/"Buscar"/"Notificações" `40×40`, "Perfil e status" `36×36`, "Modo claro/escuro" `36×36`, e o "Close toast" `20×20` do sonner — todos abaixo de 44 px e presentes em **todas** as telas do grupo.
- **Arquivo provável:** `src/components/layout/**` (sidebar/topbar) e o `Toaster` do sonner.
- **Correção sugerida:** fica para o cartão do casco — **não** corrigir aqui, para não colidir com quem cuida do layout.

## 4. Verificado SEM problema (e como foi verificado)

1. **Rolagem horizontal:** 0 estouro em **60 medições** — `document.scrollWidth == clientWidth` (390/390 e 1280/1280) e **0 elementos fora da viewport** em todas as 15 telas × 4 combos (`rolagem.total = 0`).
2. **Foco visível:** **0 passos sem anel** — 18 `Tab` por tela em 60 medições, com o estilo computado do elemento focado conferido (nenhum `outline: none`).
3. **Ordem de tabulação:** o foco anda no DOM (sem `tabindex` positivo) nas 60 medições; nas telas com diálogo (compositor do E-mail e do Multiplix) o foco entra no overlay ao abrir.
4. **Overlays cabem na tela:** compositor do E-mail **374×489** em 390×844 (topo 275, base 764 < 844) e **520×489** em 1280×800 (base 784 < 800); diálogo do compositor do Multiplix idem. A tabela do histórico da Telefonia (356 px de largura) cresce **na vertical** (base 958/978 → rolagem do documento), sem corte lateral.
5. **Nome acessível dos botões só de ícone:** as regras `button-name` e `link-name` do axe **não** dispararam em Telefonia nem em E-mail — os ícones dessas telas têm `aria-label` (ex.: `EmailChatReplyBar.tsx:231/252/269`, `EmailComposer.tsx:356-360`, `Componentes` do histórico). O que falta está nos achados 01 e 02.
6. **Imagens e campos de formulário:** `image-alt`, `label` e `aria-input-field-name` sem violação em 60 medições.

## 5. Resumo por severidade

| Severidade | Achados | IDs |
|---|---|---|
| **P0** | 0 | — |
| **P1** | 2 | 01, 02 |
| **P2** | 8 | 03, 04, 05, 06, 07, 08, 09, 10 |
| **P3** | 5 | 11, 12, 13, 14, 15 |
| **Total** | **15** | |

## 6. Resumo por tela (nós de violação do axe na rodada final)

| Tela | Nós | Regras (nós) | Achados |
|---|---|---|---|
| Talk X — segmentos | 39 | color-contrast (35), button-name (4) | 01, 03, 04, 09 |
| Talk X — nova campanha (wizard) | 37 | color-contrast (29), button-name (4), heading-order (4) | 01, 03, 04, 09, 11 |
| Multiplix — monitor de disparo | 34 | color-contrast (26), button-name (4), aria-progressbar-name (4) | 01, 02, 03, 04, 09, 13 |
| Talk X — analytics | 30 | color-contrast (24), heading-order (4), scrollable-region-focusable (2) | 03, 04, 09, 10, 11 |
| Talk X — lista de supressão | 22 | color-contrast (20), link-in-text-block (2) | 03, 04, 08, 09 |
| E-mail — compositor | 24 | region (24) | 05, 13, 14 |
| Telefonia — chamada selecionada | 16 | color-contrast (12), aria-valid-attr-value (4) | 04, 07, 09, 13 |
| E-mail — leitura (conversa) | 16 | color-contrast (10), label-title-only (4), heading-order (2) | 04, 06, 09, 11, 13 |
| Talk X — templates | 12 | color-contrast (12) | 03, 04, 09, 13 |
| Talk X — visão geral | 12 | color-contrast (4), button-name (4), heading-order (4) | 01, 03, 09, 11 |
| Talk X — execução (monitor ao vivo) | 12 | color-contrast (4), button-name (4), heading-order (4) | 01, 03, 04, 09, 11, 13 |
| Telefonia — discador/histórico | 10 | color-contrast (6), aria-valid-attr-value (4) | 04, 07, 09, 13 |
| Multiplix — busca com seleção | 3 | color-contrast (3) | 03, 04, 09, 13, 14 |
| Multiplix — compositor de disparo | 2 | color-contrast (2) | 03, 04, 09, 13 |
| E-mail — lista | 0 | — | 09, 13, 14 |
| **Total** | **269** | | |

## 7. Contagem bruta do axe (por regra × tela × combo)

`nos` = total real de nós; `grupos` = tela × combo.

| Regra do axe | Impacto | nos | grupos | Telas (nos) |
|---|---|---|---|---|
| `color-contrast` | serious | **187** | 30 | Talk X segmentos (35), wizard (29), Multiplix monitor (26), analytics (24), supressão (20), Telefonia chamada (12), templates (12), E-mail leitura (10), Telefonia disco (6), visão geral (4), execução (4), Multiplix busca (3), Multiplix compositor (2) |
| `region` | moderate | **24** | 4 | E-mail — compositor (24) |
| `button-name` | critical | **20** | 20 | Talk X visão geral/segmentos/wizard/execução (4 cada), Multiplix monitor (4) |
| `heading-order` | moderate | **18** | 18 | Talk X visão geral/analytics/wizard/execução (4 cada), E-mail leitura (2) |
| `aria-valid-attr-value` | critical | **8** | 8 | Telefonia — disco (4) e chamada (4) |
| `aria-progressbar-name` | serious | **4** | 4 | Multiplix — monitor (4) |
| `label-title-only` | serious | **4** | 4 | E-mail — leitura (4) |
| `scrollable-region-focusable` | serious | **2** | 2 | Talk X — analytics (2) |
| `link-in-text-block` | serious | **2** | 2 | Talk X — supressão (2) |
| **Total** | | **269** | | |

### Atribuição dos 187 nós de `color-contrast`

- **67 dos 111 nós com motivo preservado na amostra são o token `--foreground-secondary` (`#b6c4d8`) sobre superfície CLARA** (1,57–1,76:1) — causa raiz única em `src/styles/tokens.css:355` → achado 03.
- O restante se distribui em: `text-dash-amber` 1,67:1 (2), `text-dash-green` 2,13:1 (2), avatar `bg-primary/15 text-primary` (3,91:1 claro / 2,75–3,01:1 escuro — 7), chip `text-primary-foreground/60` 2,86:1 (4), `text-destructive`/`text-dash-red` 2,98–3,78:1 (10), selo `bg-secondary text-secondary-foreground` 3,3:1 (8), `bg-primary/15 text-primary-glow` 3,53:1 e `text-primary-glow` 3,7:1 (6), `.opacity-60` 3,79:1 (2), avatar "Eu" 4,21:1 (4) → achado 04.
- **Tema escuro:** 6 grupos (Talk X segmentos ×2, supressão ×1, Telefonia chamada ×1, disco ×1, E-mail leitura ×2) — **a maioria absoluta do contraste ruim é no tema CLARO**, ao contrário do grupo do Y14 (cujo escuro concentrava o problema no CRM 360° da conversa).

## 8. O que o cartão de correção deve considerar

1. **Arquivos dos P1 (união, sem repetição):** `src/components/talkx/kit/table.tsx`, `src/components/talkx/TalkXLiveMonitor.tsx`, `src/components/talkx/TalkXCampaignWizard.tsx`, `src/components/multiplix/MultiplixMonitor.tsx`, `src/components/ui/progress.tsx`.
2. **A causa mais barata é um token:** `--foreground-secondary` (`tokens.css:355`) resolve 67 dos 187 nós de contraste de uma vez; corrigir nos 154 usos de `talkx/**` seria o caminho caro e errado. **Use só tokens existentes** (`--muted-foreground`, `--*-text`, `secondary-foreground`) — **sem cor nova**.
3. **Todos os caminhos do mesmo defeito** (rodar `git grep` antes de corrigir): `git grep -n '<SelectTrigger' src/components/talkx src/components/multiplix` (achado 01), `git grep -n '<Progress' src` (02), `git grep -n 'text-foreground-secondary' src/components/talkx` (03), `git grep -n 'bg-primary/1[05] text-primary\|text-secondary-foreground\|text-destructive' src/components/calls src/components/email` (04).
4. **Ordem sugerida:** 01 e 02 (nome acessível, baratos) → 03 (token) → 05, 07, 08, 09, 10 → 04 (pares de cor) → P3.
5. **Não regredir o que já está bom:** 0 rolagem horizontal, 0 foco sem anel e overlays que cabem — qualquer correção de alvo/tamanho deve ser revalidada por estes mesmos três indicadores.
