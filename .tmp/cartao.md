Task t_15c578b9: fix(inbox): atalhos de teclado do inbox só agem com foco na lista, sem interceptar Ctrl+A em texto nem abrir sob diálogos
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_15c578b9
  max-retries: 2 (default)
  created:   2026-10-13 09:02 by claude
  started:   2026-10-14 12:07

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 do doc `docs/estado/10-features-inbox-components-raiz-a-m.md` (58 componentes da raiz de `src/features/inbox/components/`, A-M). Já existiam cartões do chat (partes 1-5), PE (docs 10-40) e outros; estes são os ACHADOS QUE ELES DEIXARAM PASSAR (3 leitores, com os mais graves reconferidos no código da branch viva em 13/10/2026). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia sempre `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`: a árvore de trabalho está 99 commits atrás); a V2 costuma estar melhor e NÃO tem `src/features/inbox` (os equivalentes estão em `src/components/inbox`, `src/hooks`, `src/pages`): NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas, exportar/importar/baixar/copiar/imprimir/CSV (nenhuma informação sai do sistema), edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador, /note e /tag em botão interativo, API pública. Antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`RealtimeInboxView.tsx:186-199`: `keydown` na `window` que só ignora INPUT, TEXTAREA e contenteditable: Ctrl+A em QUALQUER lugar do Inbox (texto de mensagem, painel direito) vira 'selecionar todas as conversas' e bloqueia a seleção de texto; Delete/Backspace arquivam o lote e `r` marca o lote como lido, ignorando diálogos e menus Radix abertos. `ChatPanel.tsx:287-291` compara `e.key === 'f'` (falha com Caps Lock) e também ignora diálogo aberto. A regra dos cartões UK-25 e QL4 é 'sem listener global em window'.

O QUE FAZER
1. Atalhos só com foco na lista (ou registro de atalhos com escopo); Ctrl+A em texto não é interceptado; ignore quando houver diálogo/menu aberto; compare `e.key.toLowerCase()`; `r`/Delete só com seleção ativa e confirmação já existente.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/RealtimeInboxView.tsx
- src/components/inbox/ChatPanel.tsx
- src/components/inbox/__tests__/

CRITÉRIO DE PRONTO
1. Teste: Ctrl+A num campo de texto não seleciona conversas.
2. Teste: com diálogo aberto os atalhos não agem.
3. `zapp-verify . --rapido` verde.


Latest summary:
Modo V2 desligado: falta ~/.local/libexec/hermes-guard/MODO_V2 (só há CONGELADO), então `hermes-tarefa-iniciar Zapp_Web_V2 <slug>` recusa com "CONGELADO ... exit 75" (2 tentativas) e não há workspace gravável — ~/projetos é somente leitura pela guarda de git e o workspace scratch do dispatcher está vazio. Nada foi editado e nenhuma proteção foi contornada. Decisão registrada: hermes-pedir-decisao ID 20261014-121052-c0cc-sem-tarefa. Restaurar MODO_V2 (Claude/Joaquim) e reenfileirar o cartão.

Comments (2):
  [2026-10-14 12:11] iris: Bloqueio de ambiente (não é falha de código; nada foi editado).

Estado verificado agora, no WSL, em 14/10/2026 12:10:
- `~/.local/libexec/hermes-guard/MODO_V2` NÃO existe (só `CONGELADO`). Consequência: `hermes-tarefa-iniciar Zapp_Web_V2 <slug>` sai com `CONGELADO: o modo V1 ... está suspenso` e exit 75 (rodei 2x, mesmo resultado). A checagem está nas linhas 5-10 do próprio script (CONGELADO presente + MODO_V2 ausente → exit 75).
- Sem `hermes-tarefa-iniciar` eu não tenho workspace gravável: `~/projetos/Zapp_Web_V2` é somente leitura pela guarda de git (testado: `git branch` lá é recusado com "cópia de referência (SOMENTE LEITURA)"), e as instruções proíbem criar pasta de trabalho à mão / usar `git worktree`.
- O workspace que o dispatcher deu a este cartão é `scratch` no Windows (`C:\Users\...\kanban\boards\zapp-web-v2\workspaces\t_15c578b9`) e está VAZIO (0 bytes) — não serve, e a arquitetura V2 manda ignorar workspace do dispatcher.

Não contornei: não criei MODO_V2, não mexi em arquivo de guarda, não usei worktree de outro cartão.

Decisão registrada para o Joaquim/Claude: `hermes-pedir-decisao` → ID `20261014-121052-c0cc-sem-tarefa`. Enquanto o MODO_V2 não voltar, o cartão não pode ser executado por nenhum especialista.

Se a causa for conhecida e a intenção for que eu siga, é só restaurar `MODO_V2` (Claude/Joaquim) e me reenfileirar: o cartão em si está claro e é da minha área (atalhos de teclado do inbox só com foco na lista; Ctrl+A em texto não interceptado; atalhos inertes sob diálogo/menu Radix; `e.key.toLowerCase()`; `r`/Delete somente com seleção ativa).
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (74):
  [2026-10-15 23:55] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-15 23:55] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-15 23:56] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-15 23:56] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-15 23:56] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-15 23:57] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-15 23:57] [run 19016] claimed {'lock': 'Joaquim:38172', 'expires': 1792120363, 'run_id': 19016}
  [2026-10-15 23:57] [run 19016] spawned {'pid': 45000, 'started_at': '|179211946322'}
  [2026-10-15 23:57] [run 19016] heartbeat
  [2026-10-15 23:58] [run 19016] heartbeat
  [2026-10-15 23:59] [run 19016] heartbeat
  [2026-10-16 00:00] [run 19016] heartbeat
  [2026-10-16 00:01] [run 19016] heartbeat
  [2026-10-16 00:02] [run 19016] heartbeat
  [2026-10-16 00:04] [run 19016] heartbeat
  [2026-10-16 00:05] [run 19016] heartbeat
  [2026-10-16 00:06] [run 19016] heartbeat
  [2026-10-16 00:07] [run 19016] heartbeat
  [2026-10-16 00:08] [run 19016] heartbeat
  [2026-10-16 00:09] [run 19016] heartbeat

Runs (5):
  #16794 blocked      @iris  227s  2026-10-14 12:07
        → Modo V2 desligado: falta ~/.local/libexec/hermes-guard/MODO_V2 (só há CONGELADO), então `hermes-tarefa-iniciar Zapp_Web_V2 <slug>` recusa com "CONGELADO ... exi
  #18796 rate_limited @iris  53s  2026-10-15 22:38
        ! pid 40128 exited rate-limited (quota wall) — requeued without counting a failure
  #18881 rate_limited @iris  45s  2026-10-15 22:44
        ! pid 16920 exited rate-limited (quota wall) — requeued without counting a failure
  #18955 rate_limited @iris  108s  2026-10-15 23:50
        ! pid 43852 exited rate-limited (quota wall) — requeued without counting a failure
  #19016 running      @iris  active  2026-10-15 23:57
