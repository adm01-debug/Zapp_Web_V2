# Caixa de decisões do Hermes — triagem de 04/10/2026

123 pendentes: **103 vencidas** e **6 técnicas** respondidas pelo Claude (arquivos `.resposta.md`); **13 do Joaquim** e **1 possível incidente** continuam abertas na caixa. Dados completos: `dados/triagem-decisoes-2026-10-04.json`.

## Possível incidente (precisa de leitura do banco)

- `20261002-110741-4fe7-auditoria-prova-orcamento-e-rate-limit` — Provedor de IA padrao (DeepSeek) com credencial recusada (HTTP 401): IA de texto caindo em fallback.

## Cartões técnicos para o backlog da V2 (decididos, executar só depois da Fase M)

- `20261001-114300-7eb1-talkx-parciais-v06-v08-v09-v10` — Opcao (2): nao abrir excecao na guarda para editar migration aplicada; registrar a divergencia de replay do E27 no mapa da Fase M e, se precisar, corrigir depois com migration nova e idempotente.
- `20261002-061824-7c06-sem-tarefa` — Opcao (a): incluir --project=chromium-mapa no job obrigatorio do ci.yml (as specs rodam sem credencial, ~11s). Executar so no modo V2.
- `20261002-100554-ba9f-sync-artefatos-novo` — Manter o rate limit por IP como primeira barreira, checar is_account_locked antes do rate limit por e-mail e fundir as duas chamadas numa so RPC. Medir antes/depois; so no modo V2.
- `20261002-100705-4f9c-sync-artefatos-novo` — Aprovar (B) e (C): fundir as chamadas de rate limit e fixar a edge auth-login na regiao do banco (us-west-2). Medir o p95 em sa-east-1 antes e depois. Mudar a regiao do banco fica fora de escopo.
- `20261002-180650-c92b-talkx-v4-x057-segmentos` — Opcao (A): fatiar em X057a (estrutura aditiva com harness proprio) e X057b (as duas RPCs numa sessao dedicada com teste de paridade). Retomar so depois da Fase M.
- `20261003-104735-0a02-sem-tarefa` — Sim, remover: o E37 entrou pelo #1820 e nao ha PR aberto. Antes, conferir com git status que nao ha commit local unico.

## Só do Joaquim (não travam nada; ficam na fila dele)

- `20261001-102536-dc60-catalogo-parciais` — Catalogo: autorizar DDL no PromoGifts (CT-03/CT-22), um envio real de WhatsApp (CT-10/11/12/18) e confirmar credencial de QA.
- `20261001-111227-30ae-plano-volume-50-etapas-finalizacao` — Plano de volume de midia: aprovar licao no CLAUDE.md e autorizar fixture de audio gravada no banco de producao para o E2E (E45).
- `20261001-145003-5fb0-ia-bloco-04-camada-provedores` — IA-037: definir o texto da politica de sistema (system_prompt) por provedor de IA; hoje esta vazio nas 4 linhas.
- `20261002-132223-320b-sem-tarefa` — Restringir no painel da Mapbox o token publico aos dominios da Vercel (hoje responde a qualquer origem).
- `20261002-132318-c183-telefonia-fase2-canais-click-to-call` — Fazer uma ligacao real no preview para fechar a T11 da Telefonia.
- `20261002-142455-c772-sem-tarefa` — Enviar 1 localizacao real no WhatsApp para numero de teste (E94 do mapa).
- `20261002-144739-bbf6-sem-tarefa` — Criar o segredo searchbox_alert_cron_secret (Vault + CRON_SECRET da edge) para o e-mail do alerta de custo.
- `20261002-161204-9789-plano-contatos-etapas-abertas` — Aprovar a escrita de 6 linhas na secao Contatos do CLAUDE.md (etapa 94).
- `20261002-221910-ccb5-sem-tarefa` — Plano Actions: destino do db-migrate.yml (E62) e teste de rollback automatico com o dono presente (E61).
- `20261003-110826-2ff5-sem-tarefa` — Aprovar a secao "Perimetro do GitHub" no CLAUDE.md e criar um token (PAT/App) com administration:read para o settings-guard.
- `20261003-145654-85d1-telefonia-fase7-reconciliacao-bitrix` — Informar o webhook REST do Bitrix24 (BITRIX_WEBHOOK_URL) e agendar a sync no N8N para trazer gravacoes de chamadas.
- `20261003-155546-8ff3-arquivos-fase9-pr-i` — Fornecer os prints de referencia para comparar o redesign da aba Arquivos (etapa 50), ou aceitar prints proprios.
- `20261004-071951-db20-sem-tarefa` — Escolher a cor do chip de filtro ativo no modo alto-contraste (preto, branco com borda ou roxo com texto branco).
