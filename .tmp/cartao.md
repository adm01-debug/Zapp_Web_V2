Task t_156cb1ae: fix(a11y): ações que só aparecem no hover ficam alcançáveis por teclado e toque (21 pontos do inbox) + nomes acessíveis que faltam
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_156cb1ae
  max-retries: 2 (default)
  created:   2026-10-13 09:06 by claude
  started:   2026-10-14 12:14

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/11-features-inbox-components-raiz-m-z.md` (inbox/components raiz M-Z). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_11_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-11/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
LEIA O ITEM INTEIRO no relatório `~/hermes-workspaces/.assets/paridade-11/achados_4_upload_inventario_testes.md` (evidência arquivo:linha, o que implementar, critério de pronto e o que o Claude conferiu): item U1. A lista dos 21 pontos está na seção 4 do relatório.

O QUE FAZER
1. Aplicar o padrão único `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100` (ou classe utilitária em `src/styles/`), alvo de toque mínimo de 40 px em ponteiro grosso.
2. `aria-label` pt-BR nos botões só-ícone de `TemplatesWithVariables.tsx` e `ObjectionDetector.tsx` (os demais nomes já são do PE-60/PE-03/PD-43: não duplique).
3. Teste parametrizado: `userEvent.tab()` foca o botão com opacidade 1 e `getByRole('button',{name})` o encontra; axe sem violação.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/ (os 21 pontos do relatório)
- src/styles/ (opcional)
- testes

CRITÉRIO DE PRONTO
1. Nenhuma ação de hover inalcançável por Tab ou toque.
2. Teste + axe verdes.
3. `zapp-verify . --rapido` verde.


Latest summary:
Infra: o modo V2 está desligado no host — o marcador ~/.local/libexec/hermes-guard/MODO_V2 está ausente, então `hermes-tarefa-iniciar` (e `hermes-tarefa-fechar`) respondem "CONGELADO ... estacione e pare" (exit 75) e não consigo criar o workspace do cartão. Não contornei a guarda: não criei o MODO_V2 nem o workspace à mão. Detalhe e evidência no comentário 14045; decisão registrada 20261014-121823-80dd-sem-tarefa. Repor o MODO_V2 (infra/Claude) e reenfileirar que eu executo. Cartões deste perfil fecharam hoje às 09:44–11:01, ou seja o V2 caiu depois das 10:45.

Comments (2):
  [2026-10-14 12:18] iris: BLOQUEIO DE INFRA (não é do cartão) — modo V2 desligado no host.

AO INICIAR: `hermes-tarefa-iniciar Zapp_Web_V2 a11y-hover-21-pontos-inbox` (workdir `/home/joaquim_ataides/projetos/Zapp_Web_V2`) devolve exit 75:

```
CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.
```

CAUSA (checada, read-only): o marcador `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` está AUSENTE (`test -e` → AUSENTE; `find ~/.local -maxdepth 4 -name 'MODO_V2*'` → vazio). O `CONGELADO` existe desde 04/10 e é o normal; o anômalo é o `MODO_V2` ter sumido (mtime do diretório `hermes-guard` = 14/10 10:45). A mesma checagem (linhas 5–7) está em `hermes-tarefa-fechar`, então o fechar também recusaria. Sem `hermes-tarefa-iniciar` eu não tenho workspace (não há symlink em `.por-cartao/` para este cartão) e não posso criá-lo por conta própria.

NÃO CONTORNEI: não criei/removi `MODO_V2`, não passei por cima da guarda, não criei workspace à mão. Cartões irmãos deste perfil fecharam hoje até 09:44–11:01, ou seja o V2 estava de pé de manhã; quebrou depois.

PEDIDO: repor o marcador `MODO_V2` (é do infra/Claude, não meu) em `~/.local/libexec/hermes-guard/`. Feito isso, reenfileirar este cartão que eu executo de imediato.

Obs: registrei a decisão `20261014-121728-ff56-sem-tarefa`; uma chamada anterior sem argumento criou uma decisão vazia (`…-ff56-sem-tarefa`) que pode ser ignorada.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (138):
  [2026-10-16 01:32] [run 19157] heartbeat
  [2026-10-16 01:33] [run 19157] heartbeat
  [2026-10-16 01:34] [run 19157] heartbeat
  [2026-10-16 01:34] [run 19157] rate_limited {'pid': 40964, 'claimer': 'Joaquim:38172', 'exit_code': 75, 'retry_status': 'ready'}
  [2026-10-16 01:34] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:35] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:35] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:35] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:35] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:36] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:36] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:37] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:38] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:39] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:40] [run 19187] claimed {'lock': 'Joaquim:38172', 'expires': 1792126501, 'run_id': 19187}
  [2026-10-16 01:40] [run 19187] spawned {'pid': 35384, 'started_at': '|179212560124'}
  [2026-10-16 01:40] [run 19187] heartbeat
  [2026-10-16 01:41] [run 19187] heartbeat
  [2026-10-16 01:42] [run 19187] heartbeat
  [2026-10-16 01:43] [run 19187] heartbeat

Runs (8):
  #16831 blocked      @iris  254s  2026-10-14 12:14
        → Infra: o modo V2 está desligado no host — o marcador ~/.local/libexec/hermes-guard/MODO_V2 está ausente, então `hermes-tarefa-iniciar` (e `hermes-tarefa-fechar`
  #18816 rate_limited @iris  33s  2026-10-15 22:40
        ! pid 48964 exited rate-limited (quota wall) — requeued without counting a failure
  #18966 rate_limited @iris  32s  2026-10-15 23:51
        ! pid 3176 exited rate-limited (quota wall) — requeued without counting a failure
  #19015 rate_limited @iris  1644s  2026-10-15 23:57
        ! pid 29920 exited rate-limited (quota wall) — requeued without counting a failure
  #19054 rate_limited @iris  64s  2026-10-16 00:30
        ! pid 29680 exited rate-limited (quota wall) — requeued without counting a failure
  #19106 rate_limited @iris  84s  2026-10-16 01:02
        ! pid 43004 exited rate-limited (quota wall) — requeued without counting a failure
  #19157 rate_limited @iris  464s  2026-10-16 01:27
        ! pid 40964 exited rate-limited (quota wall) — requeued without counting a failure
  #19187 running      @iris  active  2026-10-16 01:40
