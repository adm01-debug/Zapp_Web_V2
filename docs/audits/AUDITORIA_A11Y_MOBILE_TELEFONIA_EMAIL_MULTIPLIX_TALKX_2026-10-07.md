Especialista: worker (testes)

# AUDITORIA A11Y E CELULAR — Telefonia, E-mail, Multiplix e Talk X (Y15)

- **Data:** 2026-10-07 · **Cartão:** t_8f3b5387 / refazer Y15 · **Área:** testes do produto (`area-testes-do-produto`).
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo entregue é este relatório.
- **Escopo pedido:** Telefonia (discador e histórico), módulo E-mail (lista, leitura, compositor), Multiplix (campanhas/execução) e Talk X (campanhas, execução e subtelas).

## 1. Método corrigido nesta rodada (LOCAL + banco LOCAL + admin local)

Esta rodada corrige a recusa da entrega anterior: a auditoria agora foi executada contra a pré-visualização local do próprio workspace, apontada explicitamente para o Supabase local da tarefa e autenticada com usuário admin local.

| Item | Valor executado |
|---|---|
| Workspace | `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/y15-auditoria-a11y-telefonia-email-multi-2610072126449e` |
| Banco | `zapp-db-local up <workspace> y15a11y8f3b` → Supabase local em `127.0.0.1`, com seed local, travas de DNS/cron/pg_net conferidas |
| Usuário | `admin.local@promobrindes.com.br` do seed local (`profiles.role = admin`, `user_roles = admin`); senha sintética ajustada só no Auth local e não registrada no relatório |
| Pré-visualização | Vite local com `VITE_ZAPP_LOCAL_SUPABASE_URL=http://127.0.0.1:20058` e `VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY` do conjunto local; servidor em `http://127.0.0.1:5200/` |
| Ferramenta | Playwright Chromium + `axe-core` injetado em página real; sem produção, sem `chromium-authenticated`, sem sessão salva e sem `e2e/.auth/*` |
| Viewports | `390×844` e `1280×800` |
| Temas | claro e escuro (`localStorage.theme`) |
| Cobertura | 15 telas/estados × 2 viewports × 2 temas = **60 medições** |
| Dados brutos | `.tmp/a11y-audit-local/resultados.jsonl` (60 linhas) e `.tmp/a11y-audit-local/git-grep-caminhos.txt`; temporários, fora do git |
| Comando verde | `bunx playwright test -c .tmp/a11y-audit-local/playwright.local.config.ts --project=chromium-local-admin` → **1 passed (4.3m)** |

### O que ficou fora da auditoria real local

1. **Não ficou backend 100% mockado.** A medição principal desta rodada usou o app real contra o Supabase local, com Auth local e seed local. A ressalva da entrega anterior (“backend 100% mockado/sessão falsa”) foi reclassificada: a rodada anterior serve só como comparação histórica para alguns seletores; **as contagens e o critério de pronto desta entrega vêm da rodada local**.
2. **Dados de negócio são os do seed local.** Isso muda quantidades de linhas/campanhas/conversas em relação ao harness sintético anterior; por isso os totais de nós do axe abaixo são menores. Os achados estruturais (ARIA, contraste, foco, landmarks, tamanho de alvo) não dependem de dado real de cliente.
3. **Teclado virtual físico não é simulável no Chromium headless.** Foi verificado o que é mensurável no headless: overlays/menus não geraram rolagem horizontal, foco visível foi exercitado pelo navegador real, e campos/controles foram medidos em 390×844.
4. **Ações destrutivas/envios reais não foram executados.** Em Multiplix/Talk X a auditoria abriu telas e estados de UI, mas não disparou campanha, e-mail, telefonia ou mensagem real.

## 2. Cobertura local executada

| Tela | 390×844 claro | 390×844 escuro | 1280×800 claro | 1280×800 escuro |
|---|---|---|---|---|
| Telefonia — discador/histórico | ✔ | ✔ | ✔ | ✔ |
| Telefonia — chamada selecionada | ✔ | ✔ | ✔ | ✔ |
| E-mail — lista | ✔ | ✔ | ✔ | ✔ |
| E-mail — leitura (conversa) | ✔ | ✔ | ✔ | ✔ |
| E-mail — compositor | ✔ | ✔ | ✔ | ✔ |
| Multiplix — busca com seleção | ✔ | ✔ | ✔ | ✔ |
| Multiplix — compositor de disparo | ✔ | ✔ | ✔ | ✔ |
| Multiplix — monitor de disparo | ✔ | ✔ | ✔ | ✔ |
| Talk X — visão geral | ✔ | ✔ | ✔ | ✔ |
| Talk X — segmentos | ✔ | ✔ | ✔ | ✔ |
| Talk X — templates | ✔ | ✔ | ✔ | ✔ |
| Talk X — lista de supressão | ✔ | ✔ | ✔ | ✔ |
| Talk X — analytics | ✔ | ✔ | ✔ | ✔ |
| Talk X — nova campanha (wizard) | ✔ | ✔ | ✔ | ✔ |
| Talk X — execução/monitor ao vivo | ✔ | ✔ | ✔ | ✔ |

## 3. Resultado bruto do axe na rodada local

`nos` = total real de nós reportados pelo `axe-core` nas 60 medições locais.

| Regra axe | Impacto | Nós | Telas principais |
|---|---:|---:|---|
| `color-contrast` | serious | **53** | Talk X templates/analytics/supressão/wizard/execução, Multiplix busca/compositor/monitor |
| `aria-hidden-focus` | serious | **32** | Talk X templates/analytics/supressão e estados com menu/popup aberto |
| `page-has-heading-one` | moderate | **10** | Talk X templates/analytics/supressão e algumas subtelas sem `<h1>` visível no estado medido |
| `aria-valid-attr-value` | critical | **8** | Telefonia — abas de canal |
| `region` | moderate | **4** | Conteúdo de popup/portal fora de landmark em Talk X |
| `button-name` | critical | **2** | Talk X — wizard |
| `heading-order` | moderate | **2** | Talk X — wizard |
| `link-in-text-block` | serious | **2** | Talk X — lista de supressão |
| **Total** |  | **113** |  |

## 4. Verificado sem problema na rodada local

1. **Rolagem horizontal:** 0/60 medições com `documentElement.scrollWidth > clientWidth`; nenhum estouro lateral do documento em 390×844 ou 1280×800.
2. **Botões sem nome acessível:** 0 observações no medidor próprio (`unnamedButtons = 0`) fora das violações específicas de `button-name` do wizard.
3. **Navegação real e login:** o login local abriu o app real e a auditoria navegou por `?view=voip`, `?view=email-chat`, `?view=multiplix` e `?view=talkx`, sem sessão falsa.
4. **Produção isolada:** o Supabase local foi validado por `zapp-db-local`: seed ok e travas “DNS da produção preso, agendador desligado, pg_net sem envio”.

## 5. Achados

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-01 — Abas de canal da Telefonia têm `aria-controls` apontando para painel inexistente · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) · **axe:** `aria-valid-attr-value` [critical]
- **Tela:** Telefonia — discador/histórico e chamada selecionada, nos 4 combos de viewport/tema de cada tela (**8 nós**).
- **Passos para reproduzir:** login local como admin → `/?view=voip` → observar as abas `Todos`, `VoIP`, `WhatsApp`.
- **Evidência local:** alvo `#radix-...-trigger-all`, HTML amostrado: `<button type="button" role="tab" aria-selected="true" aria-controls="radix-...-content-all" ... data-testid="tel-channel-tab">`; o axe reportou `Invalid ARIA attribute value: aria-controls="...-content-all"`.
- **Arquivo provável:** `src/components/calls/CallHistoryTabs.tsx:25-32` (`TabsTrigger` com `data-testid="tel-channel-tab"`, sem `TabsContent` correspondente).
- **Correção sugerida:** se for filtro, trocar por `radiogroup`/grupo de botões com `aria-pressed`; se for aba real, renderizar `TabsContent` com ids válidos. **Esforço: P**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-02 — Contraste insuficiente do token `text-foreground-secondary` no tema claro · **P1**
- **WCAG:** 1.4.3 (Contraste mínimo) · **axe:** `color-contrast` [serious]
- **Telas:** Talk X (templates, analytics, supressão, wizard, execução) e Multiplix (busca/compositor/monitor). **53 nós** locais de contraste, com maior concentração em Talk X templates (24), analytics (24) e supressão (20 nós de tela na soma por tela; a regra soma por nó nas 60 medições).
- **Passos para reproduzir:** login local → abrir `/?view=talkx` ou `/?view=multiplix` no tema claro → textos secundários de cabeçalho, filtros e descrições ficam muito claros sobre superfícies claras.
- **Evidência local:** exemplo `Multiplix — busca com seleção`, alvo `.text-[13px]`, HTML `<p class="text-[13px] text-foreground-secondary mt-0.5">Envio em massa para fornecedores, transportadoras e clientes</p>`; contraste medido **1,64:1** (`#b6c4d8` sobre `#f6f7f9`), esperado 4,5:1.
- **Arquivo provável:** causa raiz em `src/styles/tokens.css` (`--foreground-secondary` do tema claro) publicado no Tailwind e consumido amplamente em `src/components/talkx/**`; caminhos confirmados por `git grep -n 'text-foreground-secondary' src/components/talkx`.
- **Correção sugerida:** corrigir o token no tema claro usando token existente escuro (`muted-foreground`/equivalente já existente), mantendo o valor claro só no `.dark` se necessário. Não criar cor nova. **Esforço: P/M**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-03 — Skip links/popup ficam focáveis dentro de região `aria-hidden` em estados do Talk X · **P1**
- **WCAG:** 4.1.2 / 2.4.3 · **axe:** `aria-hidden-focus` [serious]
- **Telas:** Talk X — templates, lista de supressão e analytics, principalmente após abrir subtelas/menus; **32 nós** locais.
- **Passos para reproduzir:** login local → `/?view=talkx` → navegar para Templates/Supressão/Analytics → executar axe.
- **Evidência local:** alvo `.skip-links-container`, HTML `<nav class="skip-links-container" aria-label="Links de navegação rápida" role="navigation" data-aria-hidden="true" aria-hidden="true">`; falha: `Focusable content should have tabindex="-1" or be removed from the DOM`.
- **Arquivo provável:** shell/layout que aplica `aria-hidden` durante overlay/popup e mantém skip links focáveis (`src/components/layout/**` / container de skip links), com efeito observado nas telas Talk X.
- **Correção sugerida:** quando uma raiz ficar `aria-hidden`, remover foco dos links internos (`tabIndex={-1}`) ou mover os skip links para fora da região ocultada. **Esforço: M**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-04 — Estados de Talk X ficam sem `<h1>` visível na subtela medida · **P2**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `page-has-heading-one` [moderate]
- **Telas:** Talk X — templates, supressão, analytics e estados correlatos; **10 nós** locais.
- **Passos para reproduzir:** login local → `/?view=talkx` → abrir Templates/Analytics/Supressão → executar axe.
- **Evidência local:** alvo `html`, falha `Page must have a level-one heading` nos estados em que a subtela/popup domina a superfície.
- **Arquivo provável:** cabeçalhos das subtelas Talk X (`src/components/talkx/TalkXTemplateEditor.tsx`, `TalkXAnalytics.tsx`, `TalkXSuppression.tsx`) e integração com o cabeçalho do módulo.
- **Correção sugerida:** manter um `<h1>` único e visível/programático por estado de tela; subtítulos internos podem ser `<h2>/<h3>`. **Esforço: P/M**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-05 — `SelectTrigger` do wizard Talk X sem nome acessível · **P1**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `button-name` [critical]
- **Tela:** Talk X — nova campanha (wizard), nos combos móveis claro/escuro (**2 nós** locais).
- **Passos para reproduzir:** login local → `/?view=talkx` → “Nova campanha” → etapa de configuração → executar axe.
- **Evidência local:** alvo `.md:grid-cols-[2fr_1fr_1fr] > div:nth-child(2) > ...[role="combobox"]`, HTML `<button type="button" role="combobox" ...>` sem texto legível por leitor de tela e sem `aria-label`/`aria-labelledby`.
- **Arquivo provável / todos os caminhos próximos:** `git grep '<SelectTrigger' src/components/talkx src/components/multiplix` apontou, entre outros, `src/components/talkx/TalkXCampaignWizard.tsx:342`, `TalkXLiveMonitor.tsx:225`, `TalkXSegments.tsx:332/415/419/425`, `TalkXSuppression.tsx:253`, `TalkXTemplateEditor.tsx:391/398` e `src/components/multiplix/MultiplixMonitor.tsx:202`.
- **Correção sugerida:** repetir o padrão já existente no próprio wizard (`aria-label="Conexão WhatsApp"`, `aria-label="Responsável"`) e nomear cada trigger pelo rótulo visível. **Esforço: P**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-06 — Ordem de cabeçalhos inválida no wizard Talk X · **P3**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `heading-order` [moderate]
- **Tela:** Talk X — nova campanha (wizard), nos combos móveis (**2 nós** locais).
- **Passos para reproduzir:** login local → `/?view=talkx` → “Nova campanha” → executar axe.
- **Evidência local:** alvo `h3`, HTML `<h3 class="font-semibold tracking-tight text-sm flex items-center gap-2">`; falha `Heading order invalid`.
- **Arquivo provável:** cards/títulos internos do wizard, especialmente `src/components/talkx/TalkXCampaignWizard.tsx` e `src/components/talkx/TalkXContactSelector.tsx` (via `CardTitle` do `src/components/ui/card.tsx`).
- **Correção sugerida:** organizar a hierarquia como `h1` da tela → `h2` da seção/etapa → `h3` dos cards internos. **Esforço: P**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-07 — Link “Saiba mais →” distinguido só por cor na lista de supressão · **P2**
- **WCAG:** 1.4.1 (Uso de cor) · **axe:** `link-in-text-block` [serious]
- **Tela:** Talk X — lista de supressão, viewport 1280×800 claro/escuro (**2 nós** locais).
- **Passos para reproduzir:** login local → `/?view=talkx` → lista de supressão → observar o link no texto informativo.
- **Evidência local:** alvo `.text-primary-glow`, HTML `<a href="#" class="text-primary-glow hover:underline">Saiba mais →</a>`; o axe reportou contraste insuficiente com o texto ao redor e ausência de estilo permanente que não dependa só da cor.
- **Arquivo provável:** `src/components/talkx/TalkXSuppression.tsx` (link “Saiba mais →”).
- **Correção sugerida:** sublinhado permanente (`underline underline-offset-2`) ou outro marcador visual não baseado só em cor. **Esforço: P**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-08 — Conteúdo de popup/portal em Talk X fora de landmark · **P2**
- **WCAG:** 1.3.1 · **axe:** `region` [moderate]
- **Tela:** Talk X — templates/estados com conteúdo Radix em portal; **4 nós** locais.
- **Passos para reproduzir:** login local → `/?view=talkx` → abrir Templates/menus relacionados → executar axe.
- **Evidência local:** alvo `div[data-radix-popper-content-wrapper=""]`; falha `Some page content is not contained by landmarks`.
- **Arquivo provável:** componentes Talk X que usam `SelectContent`, dropdown ou popper em portal (`src/components/talkx/TalkXTemplateEditor.tsx`, `TalkXCampaignWizard.tsx`, `TalkXSuppression.tsx`) e composição Radix compartilhada.
- **Correção sugerida:** garantir `aria-label`/landmark ou associação correta no conteúdo em portal; quando for menu/listbox, confirmar que o papel semântico do Radix basta e que o wrapper externo não vira conteúdo solto. **Esforço: M**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-09 — Alvos de toque abaixo da prática móvel de 44 px no grupo e no casco das telas · **P3**
- **WCAG:** 2.5.5 (Tamanho do alvo, AAA/prática móvel) e referência de usabilidade móvel pedida no cartão.
- **Telas:** todas as telas em 390×844 tiveram controles abaixo de 44 px; parte é do casco (menu, notificações, modo claro/escuro), parte é do grupo.
- **Passos para reproduzir:** login local em 390×844 → abrir qualquer tela do grupo → medir `getBoundingClientRect()` dos focáveis/clicáveis visíveis.
- **Evidência local (grupo):** Telefonia: filtros/abas `VoIP` e `Período` com 40 px de altura; Multiplix: `Buscar` e inputs/filtros com 40 px; Talk X: `Templates`, `Adicionar contato`, `Salvar rascunho`, alternadores e filtros com 36–40 px; link `Saiba mais →` 76×15.
- **Evidência local (casco, fora do grupo):** `Abrir menu` 40×40, `Notificações` 38×38, `Modo escuro/claro` 36×36, `Expandir menu` 38×38 e botões da navegação lateral 38×38.
- **Arquivo provável:** grupo: `src/components/calls/**`, `src/components/multiplix/**`, `src/components/talkx/**`; casco: `src/components/layout/**`.
- **Correção sugerida:** em mobile, elevar controles de barra para `h-11`/44 px ou aumentar área clicável com padding sem aumentar ícone; tratar casco em cartão próprio para evitar colisão. **Esforço: M**

### A11Y-TELEFONIA_EMAIL_MULTIPLIX_TALKX-10 — Risco residual do compositor de E-mail em portal fora da árvore principal · **P3**
- **WCAG:** 1.3.1 / 2.4.3 (landmarks e foco). Nesta rodada local o estado de compositor foi aberto contra banco local, mas não reproduziu os 24 nós `region` da rodada sintética anterior; por isso fica como risco residual, não como nó local confirmado.
- **Tela:** E-mail — compositor.
- **Passos:** login local → `/?view=email-chat` → “Novo/Nova mensagem” quando a conta local expõe o controle → conferir landmark/foco do portal.
- **Evidência de código:** `src/components/gmail/EmailComposer.tsx:335` usa `createPortal((...)` e a resposta rápida usa `src/components/email/EmailChatReplyBar.tsx:221` com `placeholder="Digite sua resposta..."`.
- **Correção sugerida:** se o compositor for modal flutuante, dar `role="dialog"` + nome acessível; se for painel não modal, envolver em `<section aria-label="Compositor de e-mail">` e manter ordem de foco previsível. **Esforço: P**
- **Classificação do método:** não entra na contagem local de nós; mantido para o cartão de correção não perder um caminho que o código ainda permite.

## 6. Resumo por severidade

| Severidade | Achados | IDs |
|---|---:|---|
| **P0** | 0 | — |
| **P1** | 4 | 01, 02, 03, 05 |
| **P2** | 3 | 04, 07, 08 |
| **P3** | 3 | 06, 09, 10 |
| **Total** | **10** |  |

## 7. Resumo por tela (nós de violação do axe na rodada local)

| Tela | Nós axe locais | Regras principais | Achados |
|---|---:|---|---|
| Talk X — templates | 24 | `color-contrast`, `aria-hidden-focus`, `page-has-heading-one`, `region` | 02, 03, 04, 08, 09 |
| Talk X — analytics | 24 | `color-contrast`, `aria-hidden-focus`, `page-has-heading-one` | 02, 03, 04, 09 |
| Talk X — lista de supressão | 22 | `color-contrast`, `aria-hidden-focus`, `page-has-heading-one`, `link-in-text-block` | 02, 03, 04, 07, 09 |
| Talk X — nova campanha | 12 | `color-contrast`, `button-name`, `heading-order` | 02, 05, 06, 09 |
| Talk X — execução/monitor | 5 | `color-contrast` | 02, 09 |
| Telefonia — discador/histórico | 4 | `aria-valid-attr-value` | 01, 09 |
| Telefonia — chamada selecionada | 4 | `aria-valid-attr-value` | 01, 09 |
| Talk X — visão geral | 4 | `color-contrast` | 02, 09 |
| Talk X — segmentos | 4 | `color-contrast` | 02, 09 |
| Multiplix — busca com seleção | 2 | `color-contrast` | 02, 09 |
| Multiplix — compositor de disparo | 2 | `color-contrast` | 02, 09 |
| Multiplix — monitor de disparo | 2 | `color-contrast` | 02, 09 |
| E-mail — lista | 2 | `aria-hidden-focus`/casco no estado medido | 03, 09 |
| E-mail — leitura | 2 | `aria-hidden-focus`/casco no estado medido | 03, 09 |
| E-mail — compositor | 0 | — | 09, 10 |
| **Total** | **113** |  |  |

## 8. Todos os caminhos pesquisados no código atual

Comandos rodados nesta rodada e guardados em `.tmp/a11y-audit-local/git-grep-caminhos.txt`:

- `git grep -n '<SelectTrigger' -- src/components/talkx src/components/multiplix` — encontrou triggers sem `aria-label` em Talk X wizard/live/segments/suppression/templates e Multiplix monitor, além de exemplos já corretos com `aria-label`.
- `git grep -n '<Progress' -- src` — confirmou que o componente compartilhado aceita props e que `MultiplixMonitor.tsx:151` / `TalkXLiveMonitor.tsx:165` chamam `<Progress>` sem nome local.
- `git grep -n 'text-foreground-secondary' -- src/components/talkx` — confirmou que o contraste ruim vem de uso massivo do mesmo token.
- `git grep -n 'data-testid="tel-channel-tab"\|TabsTrigger' -- src/components/calls` — confirmou o caminho de Telefonia.
- `git grep -n 'createPortal\|Digite sua resposta' -- src/components/email src/components/gmail` — confirmou o caminho residual do compositor/resposta de E-mail.

## 9. Provas executadas nesta rodada

1. `zapp-db-local up "$PWD" y15a11y8f3b` → `migrations: 775 ok, 21 falha(s) de 798 (esperadas), seed: ok`, estrutura local comparada e `TRAVAS: conferidas (DNS da produção preso, agendador desligado, pg_net sem envio)`.
2. Login local via Auth API local: `admin.local@promobrindes.com.br` retornou token local (`http_code=200`).
3. Vite local iniciado com `VITE_ZAPP_LOCAL_SUPABASE_URL=http://127.0.0.1:20058` e chave local; porta efetiva `http://127.0.0.1:5200/`.
4. Playwright/axe local: `bunx playwright test -c .tmp/a11y-audit-local/playwright.local.config.ts --project=chromium-local-admin` → **1 passed (4.3m)**; `resultados.jsonl` tem **60** linhas.
5. `python3` sobre `resultados.jsonl` → `total 60`, `telas 15`, `viewports ['1280x800', '390x844']`, `temas ['dark', 'light']`, `overflow combos 0`, `unnamedButtons total observations 0`.
