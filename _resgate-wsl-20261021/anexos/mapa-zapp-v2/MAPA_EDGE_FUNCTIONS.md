# Mapa das edge functions — Zapp Web V2

Lido em 04/10/2026 ~12:30 UTC pela Management API (token do Joaquim, só leitura usada). Comparado com `origin/main` `2b4dac2d` (`supabase/functions/`, `config.toml`, `deployment-manifest.json`).

## Resumo
| Item | Valor |
|---|---|
| Implantadas | 75 (todas ACTIVE) |
| No repositório / manifest | 73 / 73 |
| Só no vivo | sicoob-bridge, sicoob-bridge-reply — previstas em `orphan_allowlist` do manifest |
| Só no repositório | nenhuma |
| verify_jwt vivo × config.toml | 0 divergências (14 com verify_jwt=false) |
| Bundle vivo × fonte | não comparável byte a byte (`ezbr_sha256` é do bundle) |

## Achado M-INF-01 — reimplantação em massa em curso (04/10)
Desde ~07:00 UTC um ciclo de `workflow_dispatch` do workflow **Deploy Edge Functions**, disparado pela conta `adm01-debug`, reimplanta **uma função por vez, em ordem alfabética, a cada ~2 min** (73 implantadas hoje: 07h=18, 08h=4, 10h=12, 11h=27, 12h=12). Às 12:28 estava em `multiplix-audience`. **Origem identificada pelo Joaquim (04/10): outra sessão do Claude encarregada de fechar todas as PRs abertas** (explica também o merge do #1869). Re-pino final do mapa depois que ela terminar.

## Funções (slug · versão · verify_jwt · última implantação UTC)

| Função | Versão | JWT | Atualizada |
|---|---|---|---|
| ai-auto-tag | 600 | true | 2026-10-04 10:33 |
| ai-churn-analysis | 588 | true | 2026-10-04 10:36 |
| ai-classify-tickets | 587 | true | 2026-10-04 10:38 |
| ai-conversation-analysis | 598 | true | 2026-10-04 10:40 |
| ai-conversation-summary | 597 | true | 2026-10-04 10:42 |
| ai-enhance-message | 595 | true | 2026-10-04 10:45 |
| ai-jobs-worker | 151 | true | 2026-10-04 10:47 |
| ai-proxy | 599 | true | 2026-10-04 10:49 |
| ai-suggest-reply | 596 | true | 2026-10-04 10:51 |
| ai-transcribe-audio | 589 | true | 2026-10-04 10:54 |
| approve-password-reset | 586 | true | 2026-10-04 10:56 |
| auth-login | 552 | false | 2026-10-04 10:58 |
| auto-close-conversations | 584 | true | 2026-10-04 11:01 |
| batch-fetch-avatars | 594 | false | 2026-10-04 11:03 |
| bitrix-api | 583 | true | 2026-10-04 11:05 |
| chatbot-l1 | 596 | true | 2026-10-04 11:07 |
| classify-audio-meme | 591 | true | 2026-10-04 11:10 |
| classify-emoji | 593 | true | 2026-10-04 11:12 |
| classify-sticker | 594 | true | 2026-10-04 11:15 |
| cleanup-rate-limit-logs | 582 | true | 2026-10-04 11:17 |
| connection-health-check | 590 | false | 2026-10-04 11:19 |
| create-user | 582 | true | 2026-10-04 11:22 |
| crm-integration | 543 | false | 2026-10-04 11:24 |
| csp-report | 554 | false | 2026-10-04 11:26 |
| detect-new-device | 585 | true | 2026-10-04 11:28 |
| elevenlabs-agent-token | 580 | true | 2026-10-04 11:30 |
| elevenlabs-dialogue | 583 | true | 2026-10-04 11:33 |
| elevenlabs-scribe-token | 580 | true | 2026-10-04 11:35 |
| elevenlabs-sfx | 583 | true | 2026-10-04 11:37 |
| elevenlabs-sts | 580 | true | 2026-10-04 11:39 |
| elevenlabs-tts | 584 | true | 2026-10-04 11:42 |
| elevenlabs-tts-stream | 584 | true | 2026-10-04 11:44 |
| elevenlabs-voice-design | 583 | true | 2026-10-04 11:46 |
| elevenlabs-webhook | 621 | false | 2026-10-04 11:49 |
| evolution-api | 598 | true | 2026-10-04 11:51 |
| evolution-sync | 590 | true | 2026-10-04 11:52 |
| evolution-webhook | 664 | false | 2026-10-04 11:54 |
| external-db-bridge | 584 | true | 2026-10-04 11:57 |
| external-db-proxy | 588 | true | 2026-10-04 11:59 |
| fetch-link-preview | 584 | true | 2026-10-04 12:01 |
| get-call-recording | 3 | true | 2026-10-04 12:03 |
| get-mapbox-token | 580 | true | 2026-10-04 12:06 |
| get-sip-password | 583 | true | 2026-10-04 12:08 |
| gmail-cron-sync | 599 | false | 2026-10-04 12:10 |
| gmail-oauth | 590 | true | 2026-10-04 12:12 |
| gmail-send | 589 | true | 2026-10-04 12:17 |
| gmail-sync | 588 | true | 2026-10-04 12:19 |
| gmail-webhook | 618 | false | 2026-10-04 12:22 |
| message-delivery | 538 | true | 2026-10-04 12:24 |
| migrate-media-storage | 586 | true | 2026-10-04 12:26 |
| multiplix-audience | 461 | true | 2026-10-04 07:17 |
| multiplix-dispatch | 139 | true | 2026-10-04 07:20 |
| multiplix-send | 475 | true | 2026-10-04 07:22 |
| multiplix-voices | 2 | true | 2026-10-04 07:24 |
| promogifts-catalog | 612 | true | 2026-10-04 07:26 |
| public-api | 625 | false | 2026-10-04 07:29 |
| recover-corrupted-audios | 585 | true | 2026-10-04 07:31 |
| searchbox-budget-alert | 73 | false | 2026-10-04 07:33 |
| send-email | 582 | true | 2026-10-04 07:35 |
| send-rate-limit-alert | 584 | true | 2026-10-04 07:38 |
| send-scheduled-report | 586 | true | 2026-10-04 07:40 |
| sentiment-alert | 589 | true | 2026-10-04 07:43 |
| sicoob-bridge | 580 | true | 2026-09-29 12:57 |
| sicoob-bridge-reply | 580 | true | 2026-09-29 12:57 |
| sync-call-records | 2 | false | 2026-10-04 07:45 |
| talkx-link | 503 | false | 2026-10-04 07:47 |
| talkx-report | 503 | true | 2026-10-04 07:50 |
| talkx-scheduler | 587 | true | 2026-10-04 07:52 |
| talkx-send | 610 | true | 2026-10-04 12:15 |
| voice-agent | 587 | true | 2026-10-04 07:57 |
| voice-changer | 579 | true | 2026-10-04 07:59 |
| voice-copilot-action | 582 | true | 2026-10-04 08:02 |
| webauthn | 584 | true | 2026-10-04 08:04 |
| webhook-diagnostic | 589 | true | 2026-10-04 08:06 |
| whatsapp-webhook | 615 | false | 2026-10-04 08:08 |
