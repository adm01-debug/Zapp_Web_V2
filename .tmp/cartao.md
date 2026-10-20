Task t_7979b2e9: [refazer 1] fix(a11y): movimento reduzido vale para o framer-motion no app inteiro (MotionConfig na raiz) e nas ilustraç
  status:    running
  assignee:  designer
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_7979b2e9
  max-retries: 2 (default)
  created:   2026-10-15 17:26 by user
  started:   2026-10-15 17:30

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: a branch da tarefa andou depois do fechar

O QUE CORRIGIR: Reproduza a falha com `zapp-verify full .`, corrija e feche de novo.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/a11y-motionconfig-raiz-illustracoes-26101516349aad` (commit b68e86aea) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
A regra CSS global de `prefers-reduced-motion` não alcança o framer-motion (JS). 350 arquivos da V2 importam `framer-motion`; só `components/contacts/ContactsView.tsx:122` tem `<MotionConfig reducedMotion="user">`. As 13 ilustrações de `ui/empty-state-illustrations.tsx` e o badge de `GenericEmptyState` têm loops infinitos (`repeat: Infinity`) sem checar `useReducedMotion`. `AnimatedCounter` (`ui/motion`) usa `prevRef` como objeto novo a cada render e anima sempre do zero. Relatórios: U4-14, U2-17, U2-07, U3-02.

O QUE FAZER
1. Envolva a árvore em `<MotionConfig reducedMotion="user">` em `src/providers/AppProviders.tsx` (confirme o local certo) e remova o do ContactsView.
2. Nas ilustrações e no badge pulsante: com movimento reduzido, estado estático (sem loop).
3. Corrija `AnimatedCounter` (valor anterior em `useRef` estável; anima do valor anterior ao novo) e `Typewriter` (mostra o texto completo no modo reduzido; `onComplete` em ref para não reiniciar o efeito).
4. Testes: com `matchMedia('(prefers-reduced-motion: reduce)')` verdadeiro não há animação contínua; um único `MotionConfig` na raiz; AnimatedCounter não reinicia ao re-renderizar com o mesmo valor.

ARQUIVOS QUE PODE TOCAR
- src/providers/AppProviders.tsx
- src/components/contacts/ContactsView.tsx (só remover o MotionConfig)
- src/components/ui/empty-state-illustrations.tsx
- src/components/ui/GenericEmptyState.tsx
- src/components/ui/motion/effects.tsx
- testes

CRITÉRIO DE PRONTO
1. 1 MotionConfig na raiz.
2. Nenhum loop infinito com reduzir movimento.
3. Testes de contador e typewriter verdes.
4. `zapp-verify . --rapido` verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (2):
  [2026-10-15 17:28] default: [jev-entrada] rota=complexo (conf 0.52 → humano, p_humano=0.01), faixa=components, injeção=0.26, ação externa=0.13 → RETIDO (Jev inseguro)
  [2026-10-15 17:29] default: [revisor-entrada] [jev-entrada] claude liberou → designer: Trabalho de a11y restrito ao repositório local (MotionConfig, ilustrações, AnimatedCounter/Typewriter e testes), sem tocar ferramental da fábrica, chaves, regras ou guardas; os arquivos listados são todos código da aplicação. O refazer pede apenas reproduzir a falha do zapp-verify e corrigir.

Events (50):
  [2026-10-15 17:55] [run 18618] heartbeat
  [2026-10-15 17:56] [run 18618] heartbeat
  [2026-10-15 17:57] [run 18618] heartbeat
  [2026-10-15 17:58] [run 18618] heartbeat
  [2026-10-15 17:59] [run 18618] heartbeat
  [2026-10-15 17:59] [run 18618] heartbeat {'note': 'zapp-verify full rodando: tipos/lint/migrations OK; aguardando etapa de testes (suite grande, máquina carregada).'}
  [2026-10-15 18:00] [run 18618] heartbeat
  [2026-10-15 18:01] [run 18618] heartbeat
  [2026-10-15 18:02] [run 18618] heartbeat
  [2026-10-15 18:03] [run 18618] heartbeat
  [2026-10-15 18:04] [run 18618] heartbeat
  [2026-10-15 18:05] [run 18618] heartbeat
  [2026-10-15 18:06] [run 18618] heartbeat
  [2026-10-15 18:07] [run 18618] heartbeat
  [2026-10-15 18:08] [run 18618] heartbeat
  [2026-10-15 18:09] [run 18618] heartbeat
  [2026-10-15 18:10] [run 18618] heartbeat
  [2026-10-15 18:11] [run 18618] heartbeat
  [2026-10-15 18:12] [run 18618] heartbeat
  [2026-10-15 18:13] [run 18618] heartbeat

Runs (1):
  #18618 running      @designer  active  2026-10-15 17:30
