Task t_730253ab: [refazer 1] fix(audio): player de áudio com botões nomeados, barra de posição operável por teclado e status anunciado
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_730253ab
  max-retries: 2 (default)
  created:   2026-10-15 21:46 by user
  started:   2026-10-16 03:29

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: O diff cumpre quase todo o cartão: nomes acessíveis, slider com aria-valuemin/max/now e teclado, selo de falha como button, role=status e prefers-reduced-motion, com teste vermelho→verde. Há porém um conflito de atalhos que o próprio diff mostra: o comentário E16 diz que ↑/↓ controlam o volume com o foco em qualquer parte do player, inclusive a barra de progresso. O novo handleSeekKeyDown também usa ↑/↓ e só chama preventDefault, sem stopPropagation, então a mesma tecla pode mover a posição e o volume ao mesmo tempo. Além disso, a região role=status nasce já com o conteúdo, o que deixa o anúncio pouco confiável nos leitores de tela.

O QUE CORRIGIR: 1. Resolver a colisão de ↑/↓ entre o seek (E17) e o atalho de volume do player (E16), que o comentário em playerRef diz valer com o foco na barra de progresso. Há dois caminhos: (a) chamar event.stopPropagation() no handleSeekKeyDown para as teclas tratadas e documentar que, no slider, ↑/↓ movem a posição; ou (b) deixar ↑/↓ para o volume e tratar no slider só ←/→/Home/End. Nos dois casos, acrescente ao AudioMessagePlayer.a11y.test.tsx um caso provando que ↑/↓ com foco no slider fazem só uma das duas coisas, conferindo o volume do <audio> antes e depois. 2. A região role=status está no motion.div que só monta quando o status vira processing ou failed. Uma live region inserida já com o texto costuma não ser anunciada. Deixe um contêiner role=status sempre montado, fora do AnimatePresence condicional, com o indicador entrando e saindo dentro dele. Ajuste o teste para provar que o contêiner existe mesmo sem status e passa a conter 'Transcrevendo...' quando transcriptionStatus muda via rerender.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/audio-player-a11y-2610152109114a` (commit 4689d801d) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 do doc `docs/estado/10-features-inbox-components-raiz-a-m.md` (58 componentes da raiz de `src/features/inbox/components/`, A-M). Já existiam cartões do chat (partes 1-5), PE (docs 10-40) e outros; estes são os ACHADOS QUE ELES DEIXARAM PASSAR (3 leitores, com os mais graves reconferidos no código da branch viva em 13/10/2026). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia sempre `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`: a árvore de trabalho está 99 commits atrás); a V2 costuma estar melhor e NÃO tem `src/features/inbox` (os equivalentes estão em `src/components/inbox`, `src/hooks`, `src/pages`): NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas, exportar/importar/baixar/copiar/imprimir/CSV (nenhuma informação sai do sistema), edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador, /note e /tag em botão interativo, API pública. Antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`components/inbox/AudioMessagePlayer.tsx`: o botão play/pausa/recarregar só tem ícone (sem `aria-label`, ~L137); o seek da waveform é `div onClick` sem `role="slider"`, `aria-valuenow` nem teclado (~L143); o selo 'Falhou - Tentar novamente' é `motion.div onClick`, não `button` (~L102); o botão de transcrição só tem `title`; o status (Transcrevendo/Falhou) não está em `aria-live`; 30 barras com animação infinita por bolha. O PE-56 cobre só o estado verdadeiro da transcrição e o PH-22 uma reprodução por vez.

O QUE FAZER
1. `aria-label` nos botões; seek com `role="slider"`, `aria-valuemin/max/now` e setas; selo de falha como `button`; `role="status"` na transcrição; animação das barras só na bolha tocando; respeitar `prefers-reduced-motion`.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/AudioMessagePlayer.tsx
- src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx (novo)

CRITÉRIO DE PRONTO
1. Teste a11y no padrão `*.a11y.test.tsx` passa.
2. Seek por seta funciona.
3. `zapp-verify . --rapido` verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
SSH do WSL (localhost:2222) com timeout — workspace inacessível; retry quando voltar

Comments (3):
  [2026-10-15 21:47] default: [jev-entrada] rota=designer (conf 0.16 → humano, p_humano=0.00), faixa=components, injeção=0.31, ação externa=0.06 → RETIDO (Jev inseguro)
  [2026-10-15 21:49] default: [revisor-entrada] [jev-entrada] claude liberou → semisenior: Trabalho restrito a corrigir componente React e seu teste a11y no repositório local (conflito de atalhos ↑/↓ e live region sempre montada), sem tocar ferramental da fábrica, chaves, guardas ou ações externas; as menções a relato e hermes-tarefa-fechar são o fluxo normal de entrega.
  [2026-10-16 03:31] semisenior: Semisenior: não consegui iniciar — backend SSH do WSL (joaquim_ataides@localhost:2222) com timeout em 3 tentativas (terminal + leitura do workspace). Sem acesso ao workspace não dá para fazer cherry-pick do commit 4689d801d nem corrigir os 2 pontos da recusa. Devolvo para retry quando o SSH voltar.

Events (25):
  [2026-10-16 03:29] [run 19513] claimed {'lock': 'Joaquim:38172', 'expires': 1792133079, 'run_id': 19513}
  [2026-10-16 03:29] [run 19513] spawned {'pid': 32536, 'started_at': '|179213217965'}
  [2026-10-16 03:30] [run 19513] heartbeat
  [2026-10-16 03:31] [run 19513] heartbeat
  [2026-10-16 03:31] commented {'author': 'semisenior', 'len': 299}
  [2026-10-16 03:31] [run 19513] blocked {'reason': 'SSH do WSL (localhost:2222) com timeout — workspace inacessível; retry quando voltar', 'kind': 'transient', 'recurrences': 1, 'source_status': 'ready'}
  [2026-10-16 07:27] unblocked
  [2026-10-16 15:07] [run 19810] claimed {'lock': 'Joaquim:25096', 'expires': 1792174930, 'run_id': 19810}
  [2026-10-16 15:07] [run 19810] spawned {'pid': 15060, 'started_at': '|179217403047'}
  [2026-10-16 15:07] [run 19810] heartbeat
  [2026-10-16 15:08] [run 19810] heartbeat
  [2026-10-16 15:09] [run 19810] heartbeat
  [2026-10-16 15:10] [run 19810] heartbeat
  [2026-10-16 15:11] [run 19810] heartbeat
  [2026-10-16 15:12] [run 19810] heartbeat
  [2026-10-16 15:13] [run 19810] heartbeat
  [2026-10-16 15:14] [run 19810] heartbeat
  [2026-10-16 15:15] [run 19810] heartbeat
  [2026-10-16 15:16] [run 19810] heartbeat
  [2026-10-16 15:17] [run 19810] heartbeat

Runs (2):
  #19513 blocked      @semisenior  110s  2026-10-16 03:29
        → SSH do WSL (localhost:2222) com timeout — workspace inacessível; retry quando voltar
  #19810 running      @semisenior  active  2026-10-16 15:07
