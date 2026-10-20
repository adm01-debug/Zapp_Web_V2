Task t_17d91156: fix(ui): alvos de toque de 44px em ponteiro grosso (fechar de dialog/sheet, checkbox, radio, icon-sm, reações) e 2 cores literais em tokens
  status:    running
  assignee:  designer
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_17d91156
  max-retries: 2 (default)
  created:   2026-10-13 08:20 by claude
  started:   2026-10-13 12:54

Body:
ESPECIALISTA DA ÁREA: designer (visual, tokens, contraste). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: designer`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
Alvos abaixo de 44px na V2: botão fechar de `ui/dialog.tsx:67` e `ui/sheet.tsx:60` (~24px), `checkbox` e `radio-group` (`h-4 w-4`), `button` `icon-sm` (32px) e `sm` (36px), `icon-button` `sm` (32px). Nenhum CSS usa `@media (pointer: coarse)` para ampliar. O ícone do X usa `opacity-70` (contraste do ícone a medir). Cores literais em ui/: `micro-interactions/buttons.tsx:26` `rgba(255,255,255,0.3)` e `micro-interactions/feedback.tsx:74` `hsl(142 76% 36%)` (deveria ser `hsl(var(--success))`). Relatórios: U4-15/U4-17.

O QUE FAZER
1. Camada de área de toque: com `@media (pointer: coarse)` os primitivos acima ganham `min-h/min-w` de 44px sem mudar o visual no desktop (ex.: pseudo-elemento `after:-inset-3` no X do dialog/sheet; label clicável ≥44px em checkbox/radio).
2. Meça o contraste do X do dialog (`opacity-70`) contra o fundo, sombra e tema escuro; suba para o token adequado se < 4.5:1 (ou 3:1 para ícone) e registre os números no relato.
3. Troque os dois literais por tokens do sistema.
4. Teste de regressão visual/Playwright em emulação touch medindo ≥44x44 no fechar do dialog e no checkbox (use os utilitários existentes de e2e).

ARQUIVOS QUE PODE TOCAR
- src/components/ui/dialog.tsx
- src/components/ui/sheet.tsx
- src/components/ui/checkbox.tsx
- src/components/ui/radio-group.tsx
- src/components/ui/button.tsx
- src/components/ui/icon-button.tsx
- src/components/ui/micro-interactions/buttons.tsx
- src/components/ui/micro-interactions/feedback.tsx
- CSS global de utilitários (só a regra coarse)
- teste de medição

CRITÉRIO DE PRONTO
1. Alvos ≥44px em touch, medidos por teste.
2. grep de cor literal em components/ui vazio.
3. Contraste do X registrado.
4. `zapp-verify . --rapido` verde.


Events (64):
  [2026-10-13 13:37] [run 12518] heartbeat
  [2026-10-13 13:38] [run 12518] heartbeat
  [2026-10-13 13:39] [run 12518] heartbeat
  [2026-10-13 13:40] [run 12518] heartbeat
  [2026-10-13 13:41] [run 12518] heartbeat
  [2026-10-13 13:42] [run 12518] heartbeat
  [2026-10-13 13:43] [run 12518] heartbeat
  [2026-10-13 13:44] [run 12518] heartbeat
  [2026-10-13 13:45] [run 12518] heartbeat
  [2026-10-13 13:46] [run 12518] heartbeat
  [2026-10-13 13:47] [run 12518] heartbeat
  [2026-10-13 13:48] [run 12518] heartbeat
  [2026-10-13 13:49] [run 12518] heartbeat
  [2026-10-13 13:51] [run 12518] heartbeat
  [2026-10-13 13:52] [run 12518] heartbeat
  [2026-10-13 13:53] [run 12518] heartbeat
  [2026-10-13 13:54] [run 12518] heartbeat
  [2026-10-13 13:55] [run 12518] heartbeat
  [2026-10-13 13:56] [run 12518] heartbeat
  [2026-10-13 13:57] [run 12518] heartbeat

Runs (1):
  #12518 running      @designer  active  2026-10-13 12:54
