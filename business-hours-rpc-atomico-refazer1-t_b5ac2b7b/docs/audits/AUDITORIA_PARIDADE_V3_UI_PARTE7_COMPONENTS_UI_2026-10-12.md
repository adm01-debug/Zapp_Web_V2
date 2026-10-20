# Auditoria de paridade V3 → V2, Parte 7: `components/ui` (primitivos de interface)

> Escrita em 12/10/2026 pelo Claude. Documento auditado: `Zapp_Web_V3/docs/estado/13-components-ui.md` (retrato de 09/08/2026, 98 arquivos, runtime NÃO verificado).
> Verificado em: V3 `~/projetos/Zapp_Web_V3` (cópia local idêntica ao `main` do GitHub nos arquivos `docs/estado/13-components-ui.md` e `src/components/ui/`) contra a V2 como os agentes a veem (branch viva `dia/2026-10-11`, worktree `.integrador`) e contra o banco real (somente leitura).
> Reprodução: scripts e dados em `~/arquitetura-v2/paridade-ui/` (`comparacao_comuns.json`, `diferencas_reais.json`, `uso_importadores.json`, `ui_v3.txt`, `ui_v2.txt`).

## 1. Resumo

- O documento da V3 **está desatualizado e erra em pontos centrais**: lista 98 arquivos, mas a pasta real tem **116**; **19 arquivos reais não aparecem nele** (primitivos de chat `bubble`, `message`, `message-reactions`, `attachment`, `marker`, `prompt-kit/`, `chat-shimmer`, `scroll-fade`, `registry.json` e 4 stories); e **arquivos que ele chama de "EM_USO" não têm importador algum na própria V3** (`form`, `resizable`; e o `sidebar.tsx` de 810 linhas só é referenciado por dentro de `ui/`). Sem importador nenhum também estão `pagination`, `hover-card`, `menubar`, `EmptyState.tsx`, `SkeletonList` e `prompt-kit/`.
- Paridade de arquivos: **83 em comum** (7 idênticos, 76 com diferenças), **33 só na V3**, **18 só na V2** (a maioria testes e componentes novos).
- Das 76 diferenças, **cerca de 20 são funcionais ou de acessibilidade** (seção 4); as demais são tokens de estilo (a V2 usa `bg-popover`/`shadow-lg`, a V3 um visual "plano" sem sombra), imports e formatação. Foram lidos os diffs de todos os arquivos pequenos e dos maiores que a V2 usa.
- **Lacunas reais confirmadas: 10.** Duas são grandes (isolamento de falhas por seção; módulo de Etiquetas), uma envolve segurança (gráfico injeta CSS sem saneamento) e as demais são acessibilidade, robustez e experiência. **A V2 é melhor que a V3 em 9 pontos** (seção 6): não devem ser "portados de volta".
- **Cobertura no backlog antes desta auditoria:** 1 de 10 achados tinha cartão (parcial: etiquetas por contato, `CT-081`). Os cartões desta auditoria estão na seção 8.

## 2. Método e limites

1. Lista de arquivos das duas pastas e comparação por conteúdo com normalização (sem comentários, aspas, ponto e vírgula e vírgulas finais) para separar diferença real de estilo.
2. Conjunto de exports/identificadores por arquivo, nas duas versões.
3. **Uso real**: para cada primitivo, número de arquivos que o importam fora de `ui/` (sem testes nem stories), nos dois repositórios. Esse é o filtro que impede "portar o que nem a V3 usava".
4. Conferência dos fluxos de montagem da seção 2 do documento (skip link, barra de carregamento, offline, boundary, paleta, toast) na V2.
5. Cruzamento de cada achado com as 6 auditorias anteriores da série e com o quadro de cartões (todos os status, título e corpo; os acertos por palavra-chave foram lidos um a um).
6. Verificações no banco real (somente leitura): tabelas `*tag*`.

**Limites declarados:** runtime não verificado (nem na V3, nem aqui); nos arquivos `motion/*`, `micro-interactions/*`, `empty-state-illustrations`, `calendar`, `skeleton` e `EmptyState` a comparação foi por identificadores e amostra (nenhum deles tem importador na V2, então o risco é baixo); os 4 componentes de chat citados nas stories são de `features/inbox` e ficam para as auditorias dos documentos 08 a 12 (seção 7).

## 3. Inventário de arquivos

### 3.1 Só na V3 (33 arquivos)

| Arquivo(s) | Uso na V3 | Equivalente na V2 | Veredito |
|---|---|---|---|
| `phone-input.tsx` | 1: `AddConnectionDialog` | diálogo embutido em `ConnectionsView` com `Input` simples | **LACUNA** (UI-07) |
| `supabase-connectivity-banner.tsx` | 1: `IndexContentConnected` | só `offline-indicator` (navegador offline); o hook `useSupabaseConnectivity` não existe | **LACUNA** (UI-05) |
| `bubble.tsx` | 4: `TeamMessageItem`, `ChatMessageBubble`, `AIChatResponseCard`, `messageBubbleParts` | `MessageBubble.tsx` próprio | Equivalente por outro desenho; não é lacuna |
| `message.tsx` | reações de equipe e inbox | `message-reactions.tsx` próprio | Equivalente |
| `chat-shimmer.tsx` | 4 (área de mensagens, fila, transcrição, card de IA) | esqueleto de abertura de conversa planejado em `t_5e0b5d80` (todo) | Coberto por cartão |
| `scroll-fade.tsx` | 1: `ChatScrollerV2` | não existe | Estético; ver UI-12 |
| `chat/index.ts`, `empty-states/index.ts`, `motion/index.ts` | barris | `motion.tsx` faz o papel do barril de movimento | Sem ação |
| `UnifiedEmptyState.tsx` | 0 (órfão) | n/a | Não portar |
| `attachment.tsx`, `marker.tsx` | só reexportados por `chat/index.ts`; nenhum consumidor final | n/a | Não portar |
| `prompt-kit/*` (4) | 0 (órfãos) | n/a | Não portar |
| `registry.json` | 1: página `DesignSystem` | não há página nem gerador | Decisão (UI-11) |
| 12 stories (Storybook) | 0 (sem `.storybook`) | n/a | Não portar |
| 4 testes (`bubble`, `message-reactions`, `variants` e o das stories) | – | `message-reactions` sem teste na V2 | UI-10 |

### 3.2 Só na V2 (18 arquivos): melhorias, não lacunas
`VolumeSliderPopoverContent` e `VolumeTriggerButton` (+ testes), `drawer.tsx` (usado em 2 telas do catálogo), `liquid-metal-button.tsx`, `motion.tsx` (barril; 23 importadores) e 13 testes (os 2 do volume e mais 11: `EmptyState`, `accessible-toast`, `card`, `command-palette` x3, `progress`, `skip-link` x2, `slider`, `liquid-metal-button`).

### 3.3 Em comum (83 arquivos)
7 idênticos; 76 com diferença. Classificação em `diferencas_reais.json`. As diferenças funcionais estão na seção 4; o resto é estilo.

## 4. Lacunas confirmadas

Severidade: **A** alta, **M** média, **B** baixa. "V3 uso" = arquivos que importam o primitivo ou a funcionalidade.

| Id | Sev. | O que a V3 tem e a V2 não | Evidência | Backlog antes | Cartão |
|---|---|---|---|---|---|
| **UI-01** | A | **Isolamento de falha por seção.** A V3 envolve cada bloco em `SectionErrorBoundary`: `DashboardView` (15 blocos), `SLADashboard` (3), `AdvancedReportsView` (4), `TalkXView` (2), `AdminView` (6), `ChatbotFlowsView`, `SLAHistory`. Na V2 esses 7 arquivos existem **sem proteção**: um widget que quebra derruba a tela inteira. A V2 só protege 4 pontos (`AIToolsPopover`, `RealtimeInboxView`, `ConversationTabContent`, `OmnichannelChatPanel`). | usos: V3 16 arquivos, V2 4 | só o chat (`t_df287be9`) | 3 cartões iris |
| **UI-02** | M | **Saneamento de CSS no gráfico.** `chart.tsx` da V3 limpa chaves e valores (`sanitizeCssIdent`, `sanitizeCssValue`) antes de montar o `<style dangerouslySetInnerHTML>`. A V2 interpola `key` e `color` do `ChartConfig` direto no CSS. Hoje a configuração é interna (risco baixo), mas é endurecimento barato e já existia. | V3 `chart.tsx:71-93`; V2 `chart.tsx:60-85` | nenhum | 1 iris |
| **UI-03** | M | **Textos de acessibilidade em português.** A V3 traduz os leitores de tela; a V2 mantém inglês em `dialog` ("Close"), `sheet` ("Close"), `breadcrumb` ("More"), `pagination` ("Go to previous page", "Previous", "Next", "More pages"), `sidebar-primitives` ("Toggle Sidebar"). O botão de fechar do `toast` perdeu o `aria-label` "Fechar". O produto é pt-BR. | diffs de `dialog`, `sheet`, `breadcrumb`, `pagination`, `sidebar-primitives`, `toast` | nenhum (os cartões de a11y não tocam nos primitivos) | 1 iris |
| **UI-04** | M | **Robustez dos primitivos.** (a) `DialogContent` da V3 injeta uma descrição oculta quando falta `aria-describedby` (evita aviso do Radix e melhora leitor de tela); a V2 não. (b) `SkipLink` da V3 põe `tabindex=-1` no destino antes de focar; a V2 pode falhar em alvos não focáveis. (c) `setTimeout` sem limpeza ao desmontar na V2: `offline-indicator`, `visually-hidden` (anúncio) e `skip-link` (indicador). (d) `TableHead` da V3 tem `scope="col"` por padrão. (e) `Sparkline` da V3 marca o SVG como decorativo (`aria-hidden`). (f) `Avatar` da V3 usa chave estável em vez do índice. | diffs dos 6 arquivos | nenhum | 1 iris |
| **UI-05** | M | **Banner de conectividade do Supabase.** A V3 monta `SupabaseConnectivityBanner` com um hook de polling; avisa quando o backend está inacessível, mesmo com o navegador online. A V2 só avisa quando o navegador está offline. | V3 `IndexContentConnected.tsx`; V2 sem hook nem banner | nenhum (a fila offline `SL-070` é outra coisa) | 2 cartões (hugo + iris) |
| **UI-06** | B | **Quick Peek na lista de conversas.** Na V3, passar o mouse 500 ms sobre uma conversa mostra um pré-visualização das últimas mensagens (`ConversationItem` e `ConversationItemComfortable`). O componente existe na V2 (`quick-peek.tsx`), mas **0 importadores**: implementado e morto. | V3 `ConversationItem.tsx:503-711`; V2 0 usos | nenhum | 1 iris |
| **UI-07** | M | **Campo de telefone com máscara no diálogo de nova conexão.** A V3 usa `PhoneInput` (formata `+55 XX XXXXX-XXXX`, aceita internacional), seletor de tipo de API (Evolution ou oficial) e erro honesto dentro do diálogo. A V2 usa um `Input` livre com placeholder, sem máscara, sem tipo e sem erro inline. | V3 `AddConnectionDialog.tsx`, `phone-input.tsx`; V2 `ConnectionsView.tsx:97-104` | nenhum | 1 iris (máscara + erro); o seletor de API fica para a auditoria do doc 16 |
| **UI-08** | B | **Comandos da paleta.** A V3 tem "Nova conversa" (atalho `N`) e "Respostas rápidas" além dos itens de navegação; a V2 só tem "Atalhos de teclado". | `command-palette-data.tsx`, V3 linhas 46-47 | nenhum | 1 iris |
| **UI-09** | **A** (produto) | **Módulo de Etiquetas.** A V3 tem tela própria (`components/tags/TagsView.tsx`, 301 linhas, rota `tags`, item de menu "Etiquetas", `TagsEmptyState`, ilustração e comando na paleta) sobre as tabelas `tags` e `contact_tags`. **A V2 não tem tela nem essas tabelas** (banco real: só `ai_conversation_tags` e `sales_pipeline_stages`); a V2 guarda `contacts.tags` como lista de texto. | V3 `useTags.ts:39,47`; consulta ao banco real | parcial: `CT-081` (tags por contato e filtro; agendado) | **Decisão do Joaquim** (seção 7); sem cartão |
| **UI-10** | B | **Testes e detalhe das reações.** A V3 tem teste de `message-reactions` e o `ReactionBadge` mostra quem reagiu (tooltip); a V2 usa a lista de perfis sem tooltip e **não tem teste** do componente, usado no chat de equipe. | V3 `__tests__/message-reactions.test.tsx`; V2 0 testes | nenhum | 1 workertestes |

Itens classificados como **não lacuna** ou **decisão**: ver seções 5, 6 e 7.

## 5. O que a V3 tem, mas não vale portar
Sem importador nenhum na própria V3 (confirmado por duas buscas independentes, inclusive imports relativos): `form` (portanto o `aria-live` do `FormMessage` não tem onde ser aplicado), `resizable`, `pagination`, `hover-card`, `menubar`, `EmptyState.tsx`, `SkeletonList`, `prompt-kit/*`, `UnifiedEmptyState` (só referenciado por um barril quebrado), os 12 stories e o hook `useScrollToTop`. Sem consumidor final: `sidebar.tsx` com `sidebar/*` (a V3 usa o próprio `components/layout/Sidebar.tsx`), `attachment` e `marker`. A V2 já recebeu cópia de vários deles. **Atenção:** `motion/components`, `motion/effects`, `micro-interactions/*` e `empty-states/*` NÃO são órfãos: são consumidos pelos barris (`ui/motion` tem 338 importadores).

## 6. Onde a V2 está melhor (não devolver para a V3)
1. `error-boundary-retry`: trata falha de carregamento de chunk com recarga única (`isChunkLoadError`); a V3 não trata esse caso.
2. `section-error-boundary`: reporta o erro ao coletor (`reportClientError`) com seção e pilha; a V3 só registra em log.
3. `command-palette`: grupo Talk X, proteção contra resposta de busca atrasada (`searchSeqRef`) e `DialogTitle` oculto para leitor de tela.
4. `sidebar-menu`: usa `secureRandomFloat` no esqueleto em vez de `Math.random`.
5. `popover`: exporta `PopoverAnchor` (usado nos controles de volume).
6. Movimento reduzido: 10 arquivos de `ui/` o respeitam na V2, 4 na V3.
7. `accessible-toast` respeita movimento reduzido e está montado nos provedores (a V3 nunca montou).
8. `skeleton`: variantes `SkeletonAvatar`, `SkeletonButton`, `SkeletonList`.
9. 13 testes novos em `ui/` (paleta, skip link, volume, card, progress, slider) contra 3 que só a V3 tem.

## 7. Decisões e observações para o Joaquim

- **Etiquetas (UI-09):** recomendação: **não recriar as tabelas da V3**. Estender `CT-081` (que já trata `contacts.tags`) com uma tela de gestão que lista, renomeia e conta as etiquetas existentes a partir desse campo, mais `TagsEmptyState` e o comando na paleta. Evita duas fontes de verdade e migration nova. Se você preferir o modelo da V3 (tabelas `tags` e `contact_tags`), é migration com RLS e vira cartão de banco primeiro.
- **Página `/design-system` e `registry.json` (UI-11):** a V3 tem uma vitrine do design system (15 linhas) alimentada por `registry.json` e um gerador (`scripts/generate-component-registry.ts`); a V2 não. Não criei cartão: depende de querer manter esse catálogo.
- **`scroll-fade` (UI-12):** gradiente de borda no rolador do chat, só estético. Não criei cartão.
- **Componentes de `features/inbox` citados nas stories (UI-13):** `AIChatResponseCard`, `AudioTranscription`, `ChatInputQueueDisplay` e `ChatScrollerV2` não são primitivos de `ui/`. A V2 tem `ai-tools/AIResponseCard` (interface diferente) e o resumo de entrega do cartão C2 (`ConversationDeliverySummary`, ainda não integrado) cobre a ideia da fila. Ficam para as auditorias dos documentos 08 a 12; `ChatScrollerV2` já aparece nas auditorias anteriores.
- **`form.tsx` (UI-14):** nem a V3 nem a V2 o importam; o ajuste de `aria-live` não tem onde aplicar. Sem cartão.

## 8. Cartões criados a partir desta auditoria

Ver a tabela de ids em `~/arquitetura-v2/paridade-ui/ids.json` e a nota de memória "Auditoria de paridade UI (12/10)". Cada cartão traz as evidências de V3 e V2 deste relatório, teste próprio e critério de pronto objetivo.

| Id | Perfil | Escopo |
|---|---|---|
| UI-01a, 01b, 01c | iris | `SectionErrorBoundary` em Dashboard; SLA, SLAHistory e Relatórios avançados; Talk X, Admin e Chatbot |
| UI-02 | iris | saneamento de CSS em `ui/chart.tsx` |
| UI-03 | iris | textos de acessibilidade em português nos primitivos |
| UI-04 | iris | robustez dos primitivos (descrição do diálogo, skip link, timers, `scope`, decorativo, chave do avatar) |
| UI-05a, 05b | hugo, iris | hook `useSupabaseConnectivity`; banner montado no layout |
| UI-06 | iris | `QuickPeek` na lista de conversas |
| UI-07 | iris | `PhoneInput` e erro inline no diálogo de nova conexão |
| UI-08 | iris | comandos "Nova conversa" e "Respostas rápidas" na paleta |
| UI-10 | workertestes | testes de `message-reactions` e tooltip de quem reagiu |
