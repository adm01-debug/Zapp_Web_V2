Task t_66ca47a5: fix(ia): `ai-transcribe-audio` registra consumo no ledger, tem timeouts, confere o tamanho antes de baixar e não vaza erro interno
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_66ca47a5
  max-retries: 2 (default)
  created:   2026-10-13 09:05 by claude
  started:   2026-10-14 08:58

Body:
ESPECIALISTA DA ÁREA: edgar (Edge Functions). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: edgar`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/11-features-inbox-components-raiz-m-z.md` (inbox/components raiz M-Z). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_11_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-11/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
LEIA O ITEM INTEIRO no relatório `~/hermes-workspaces/.assets/paridade-11/achados_2_ia_voz.md` (evidência arquivo:linha, o que implementar, critério de pronto e o que o Claude conferiu): item G4. Coordene com o cartão PK-01 (mesma Edge): se ele ainda estiver aberto, parta da versão dele.

O QUE FAZER
1. Registrar uma linha por chamada em `ai_usage_logs` com `logAiUsageDetached` (função `ai-transcribe-audio`, unidade segundo, `usage_unknown` quando preciso) e tirar a função de `PENDENTES_DECLARADAS` em `_shared/__tests__/consumo-pago-no-ledger.test.ts`.
2. `AbortSignal.timeout`: download 20 s e STT 60 s, respondendo 504 claro.
3. Conferir `metadata.size` do objeto ANTES de baixar (teto 25 MB).
4. 500 sem `error.message` interno; mensagens em português.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/ai-transcribe-audio/index.ts
- supabase/functions/ai-transcribe-audio/index.test.ts
- supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts

CRITÉRIO DE PRONTO
1. Teste prova a linha no ledger por chamada e 504 com fetch pendurado.
2. Guarda de consumo verde.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-13 09:07] default: Esclarecimento (13/10): a referência 'cartão PK-01' no corpo é o DK-01 desta série = t_26f07b15 (mesma Edge ai-transcribe-audio). Não confundir com a série PK do doc 06.

Events (25):
  [2026-10-14 08:58] [run 16431] spawned {'pid': 14100, 'started_at': '|179197908044'}
  [2026-10-14 08:58] [run 16431] heartbeat
  [2026-10-14 08:59] [run 16431] heartbeat
  [2026-10-14 09:00] [run 16431] heartbeat
  [2026-10-14 09:01] [run 16431] heartbeat
  [2026-10-14 09:02] [run 16431] heartbeat
  [2026-10-14 09:03] [run 16431] heartbeat
  [2026-10-14 09:04] [run 16431] heartbeat
  [2026-10-14 09:05] [run 16431] heartbeat
  [2026-10-14 09:07] [run 16431] heartbeat
  [2026-10-14 09:08] [run 16431] heartbeat
  [2026-10-14 09:09] [run 16431] heartbeat
  [2026-10-14 09:11] [run 16431] heartbeat
  [2026-10-14 09:12] [run 16431] heartbeat
  [2026-10-14 09:13] [run 16431] heartbeat
  [2026-10-14 09:14] [run 16431] heartbeat
  [2026-10-14 09:15] [run 16431] heartbeat
  [2026-10-14 09:16] [run 16431] heartbeat
  [2026-10-14 09:17] [run 16431] heartbeat
  [2026-10-14 09:18] [run 16431] heartbeat

Runs (1):
  #16431 running      @edgar  active  2026-10-14 08:58
