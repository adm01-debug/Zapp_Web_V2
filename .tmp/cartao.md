Task t_9165e813: feat(aparencia): tamanho do texto do chat escolhido pelo usuário e lembrado
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_9165e813
  max-retries: 2 (default)
  created:   2026-10-12 11:13 by claude
  started:   2026-10-13 05:36

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
A V3 tem `theme/ChatThemeSettings.tsx` (`--chat-font-size`, `--chat-bubble-radius`, `--neon-glow-intensity`) mas nada persiste (volta ao padrão ao recarregar) e só `--chat-font-size` é lido por CSS (`components.css:91`). Na V2 não há `--chat-font-size` em `src/`; só o texto grande do alto contraste. DECISÃO ADOTADA: entregar só o tamanho do texto (não o brilho neon nem o raio), persistido.

O QUE FAZER
1. Controle de tamanho do texto do chat (3 a 5 níveis, com pré-visualização) na aba Aparência, que define `--chat-font-size` e é lido pelo CSS das bolhas; persistência pelas preferências de interface (PD-41/42: leia os cartões; se ainda não integrados, use localStorage com try/catch e deixe o gancho); acessível e sem quebrar o alto contraste; testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/settings/AppearanceSettings.tsx
- src/components/theme/ChatTextSize.tsx (novo)
- src/styles/components.css (somente a variável)
- testes

CRITÉRIO DE PRONTO
1. Usuário ajusta e a escolha permanece.
2. `zapp-verify . --rapido` verde.


Events (21):
  [2026-10-13 05:36] [run 12143] claimed {'lock': 'Joaquim:32040', 'expires': 1791881508, 'run_id': 12143}
  [2026-10-13 05:36] [run 12143] spawned {'pid': 5920, 'started_at': '|179188060824'}
  [2026-10-13 05:36] [run 12143] heartbeat
  [2026-10-13 05:38] [run 12143] heartbeat
  [2026-10-13 05:39] [run 12143] heartbeat
  [2026-10-13 05:40] [run 12143] heartbeat
  [2026-10-13 05:41] [run 12143] heartbeat
  [2026-10-13 05:42] [run 12143] heartbeat
  [2026-10-13 05:43] [run 12143] heartbeat
  [2026-10-13 05:44] [run 12143] heartbeat
  [2026-10-13 05:45] [run 12143] heartbeat
  [2026-10-13 05:46] [run 12143] heartbeat
  [2026-10-13 05:47] [run 12143] heartbeat
  [2026-10-13 05:48] [run 12143] heartbeat
  [2026-10-13 05:49] [run 12143] heartbeat
  [2026-10-13 05:50] [run 12143] heartbeat
  [2026-10-13 05:51] [run 12143] heartbeat
  [2026-10-13 05:52] [run 12143] heartbeat
  [2026-10-13 05:53] [run 12143] heartbeat
  [2026-10-13 05:54] [run 12143] heartbeat

Runs (1):
  #12143 running      @iris  active  2026-10-13 05:36
