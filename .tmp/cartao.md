Task t_6b297314: fix(inbox): agendar mensagem não anuncia sucesso quando o envio ao banco falha
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_6b297314
  max-retries: 2 (default)
  created:   2026-10-11 10:19 by claude
  started:   2026-10-12 21:43
  parents:   t_a7c87dc8

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: iris`.
Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md) e decisão do Joaquim em 11/10/2026 (achado da auditoria funda do documento 08-chat-1; relatório em docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE2_COMPORTAMENTO_2026-10-11.md). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se o defeito/lacuna já estiver resolvido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

DEPENDÊNCIA: este cartão só começa depois dos cartões pai. Se ao abrir você não achar o que eles criam, o pai ainda não integrou: bloqueie dizendo qual.

PROBLEMA
FATO (confirmado na branch dia/2026-10-11): src/components/inbox/ChatPanel.tsx, handleScheduleMessage (~l.311-336), captura o erro de upload/persistência, só faz log.error e NÃO relança. O ScheduleMessageDialog.tsx (~l.58-64) faz `await onSchedule(...)` dentro de try e, como nada é lançado, mostra o toast 'Mensagem agendada!', fecha e limpa o texto mesmo com falha. A V3 devolvia boolean e mantinha o diálogo aberto.

O QUE FAZER
1. Faça handleScheduleMessage RELANÇAR o erro (ou devolver false e o diálogo tratar), de modo que em falha de upload, de referência do anexo ou de gravação: o diálogo FIQUE ABERTO, o texto e o anexo sejam preservados, NÃO apareça 'Mensagem agendada!' e apareça um erro claro.
2. Erro de permissão (403 / violação de RLS) com mensagem específica em português ('Sem permissão para agendar nesta conversa'). Outros erros: 'Não foi possível agendar. Tente de novo.'
3. Mantenha a remoção do anexo órfão que já existe (removeStoredObjectBestEffort).
4. Estado de envio no diálogo: botão com spinner e largura estável enquanto grava, depois check em success ao concluir; em falha, mensagem inline com botão 'Tentar de novo'.
5. Confirme também, lendo useScheduledMessages.ts e a tabela, que o anexo agendado guarda a referência certa. O bucket whatsapp-media é PRIVADO (migration 20260905030000_private_media_buckets.sql), então getPublicUrl só serve como localizador: registre no relato como o envio futuro vai obter uma URL assinada (isso é tratado no cartão do enviador de agendadas; aqui só relate o que achou).
6. Testes: falha de upload, falha de persistência e erro 403 mantêm o diálogo aberto sem toast de sucesso; sucesso fecha e limpa.

DIREÇÃO DE DESIGN (pedido do Joaquim: criativo, moderno e interativo, nas cores do sistema). Regras para TODO cartão de tela: (a) Só tokens do sistema (src/styles/tokens.css): bg-background, bg-card, bg-card-elevated, text-foreground, text-muted-foreground, border-border, primary, accent, success, warning, info, destructive, whatsapp, sombras --shadow-sm/md/lg e --shadow-glow-primary/success, raio var(--radius). NENHUMA cor literal (hex, rgb ou hsl escrito à mão). Tem de funcionar em claro, escuro e nas skins. (b) Movimento com framer-motion (já está no projeto), reaproveitando zappMotion, zappTransition e zappPopoverVariants de src/lib/motion.ts e, quando existir, o kit de microinterações do cartão-base de design (src/components/inbox/chat/motion/). Animar só transform e opacity; molas curtas (180 a 260 ms), escalonamento de no máximo 40 ms por item. useReducedMotion SEMPRE respeitado: com movimento reduzido, nada se desloca, só muda opacidade e cor. (c) Interativo de verdade: hover e foco com resposta visível, alvos de pelo menos 40 px, teclado completo (Tab, setas, Enter, Esc), carregando em skeleton com brilho sutil, vazio com microcopy útil, confirmação com 'Desfazer' quando a ação for reversível. (d) Sem dependência nova (recharts, cmdk, sonner e vaul já existem). (e) Um teste confirma o comportamento com movimento reduzido. Skills de apoio: design-system-zapp, afinar-design, revisao-de-interface-web.
ESPECÍFICO DESTA TELA:
- Diálogo com estados vivos: botão que vira spinner e depois check (success) sem mudar de largura; falha com faixa destructive que entra com mola e botão 'Tentar de novo'.
- Selo de data/hora do agendamento em chip (info) que atualiza ao escolher; foco devolvido ao botão após erro.

ESCOPO DE DESIGN APROVADO (Joaquim, 11/10/2026): a direção de design e as interações descritas neste cartão são PARTE DO ESCOPO; o revisor deve tratá-las como pedidas, não como extra. Regras de qualidade (lição do cartão t_88c7bb75, recusado): (1) nunca reutilize o estado de outro recurso para um efeito novo; crie estado próprio. (2) nada de listener global em window/document para teclas; trate o teclado no próprio elemento com foco; atalho global só com registro e remoção no cleanup. (3) AnimatePresence com o filho condicional DENTRO e key estável. (4) todo setTimeout, intervalo ou assinatura com cleanup e proteção contra setState depois de desmontar. (5) em testes, nomes de mock neutros: nada de 'signature', 'hmac' ou 'token'. (6) cada interação pedida tem teste, e movimento reduzido também.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/ChatPanel.tsx (somente handleScheduleMessage)
- src/components/inbox/ScheduleMessageDialog.tsx
- src/components/inbox/__tests__/ e src/components/inbox/chat/__tests__/ (testes do agendamento)

CRITÉRIO DE PRONTO
1. Falha em qualquer etapa não mostra sucesso e preserva o conteúdo.
2. Erro 403 com mensagem própria.
3. zapp-verify . --rapido verde.


Comments (1):
  [2026-10-12 21:53] iris: achado fora do meu escopo (não corrigi): **a referência do anexo agendado não serve para o futuro remetente.** `ChatPanel.handleScheduleMessage` grava em `media_url` o resultado de `getPublicUrl()` (o "locator" é uma URL pública), mas o bucket `whatsapp-media` é **privado** (`UPDATE storage.buckets SET public = false WHERE id IN ('whatsapp-media', ...)`, `supabase/migrations/20260905030000_private_media_buckets.sql`; o certo é resolver por `createSignedUrl`, como faz `src/hooks/storage/useResolvedStorageUrl.ts`). No envio agendado (Edge) essa URL vai dar 400/403 — arquivo/tipo/legenda ficam gravados, só a referência é inválida. É do worker (edge), junto com o caminho de envio do agendamento.

Events (24):
  [2026-10-11 11:02] dependency_wait {'reason': 'parent_not_done', 'demoted': True, 'parent': 't_a7c87dc8'}
  [2026-10-11 11:02] linked {'parent': 't_a7c87dc8', 'child': 't_6b297314'}
  [2026-10-12 21:35] promoted
  [2026-10-12 21:37] reprioritized {'priority': 9}
  [2026-10-12 21:39] reprioritized {'priority': 5}
  [2026-10-12 21:42] reprioritized {'priority': 9}
  [2026-10-12 21:43] [run 11478] claimed {'lock': 'Joaquim:17672', 'expires': 1791853106, 'run_id': 11478}
  [2026-10-12 21:43] [run 11478] spawned {'pid': 17336, 'started_at': '|179185220700'}
  [2026-10-12 21:43] [run 11478] heartbeat
  [2026-10-12 21:44] [run 11478] heartbeat
  [2026-10-12 21:45] [run 11478] heartbeat
  [2026-10-12 21:46] [run 11478] heartbeat
  [2026-10-12 21:47] [run 11478] heartbeat
  [2026-10-12 21:48] [run 11478] heartbeat
  [2026-10-12 21:49] [run 11478] heartbeat
  [2026-10-12 21:50] [run 11478] heartbeat
  [2026-10-12 21:51] [run 11478] heartbeat
  [2026-10-12 21:52] [run 11478] heartbeat
  [2026-10-12 21:53] commented {'author': 'iris', 'len': 700}
  [2026-10-12 21:53] [run 11478] heartbeat

Runs (1):
  #11478 running      @iris  active  2026-10-12 21:43
