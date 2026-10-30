# Plano: paridade V3 → V2, doc 26 (hooks raiz S–Z) — 13/10/2026

Documento: `Zapp_Web_V3/docs/estado/26-hooks-raiz-4.md` (59 hooks, retrato de 09/08, runtime não verificado; vários pontos defasados: `useSLAMetrics` usa RPC, `useScheduledMessages` da V3 já tem RLS e despachante). Método: 5 leitores somente leitura (4 fatias de hooks + fluxos/tabelas/RPCs/realtime/edge/buckets e achados A1–A10), cada hook procurado na V2 por nome e comportamento (a V2 espalha hooks por subpastas) e cruzado com todos os cartões do quadro (`buscar_todos.py`).

## Resultado
- A V2 é igual ou melhor na maioria: alertas de sentimento (Edge com dedupe), TalkX (RPCs transacionais, supressão append-only), CRM por outbox, ditado (guarda de sessão), War Room (RPCs), WebAuthn (verificação criptográfica), revogação real de sessões, rascunho do Team Chat, presença de digitação com identidade, onboarding derivado.
- Lacunas reais (viram cartões): usuário comum não lê os próprios `security_alerts` (a tela de segurança mente); `passkey_credentials` aceita INSERT/UPDATE do cliente; fila do CRM nunca é drenada; `scheduled_messages` sem máquina de estados; cancelar agendamento falha em silêncio; fila offline não drena na abertura; gráfico de sentimento corta em 1000 linhas; aviso de transcrição depende de REPLICA IDENTITY FULL; `useUserSettings` com 3 cópias e save sobre leitura falha.
- Decisões do dono SEM cartão: scanner de upload (V3 usa VirusTotal → viola "nada sai"; alternativa ClamAV na VPS), análise de buscas (insights), TTS enviado à ElevenLabs (manter / Web Speech local / premium opcional), aniversários do Team Chat (RPC sem ano ou remover as seções), padrões de `user_settings` (`business_hours_enabled`, `auto_transcription_enabled` true na V2, false na V3), CRM externo × "nada sai", `whatsapp_templates` sem consumidor de envio, `voice-copilot-action` sem chamador no front, service worker desligado de propósito (`t_3153f825`).
- Mortos / não portar: `useThemeAudit`, `useVersions` (já `t_e9a1cfe7`), `useSettingsManagement`, `useTags` (função excluída), `useSwipeGesture`, busca por `remote_jid` nos logs (telefone em log), tabelas `security_audit_logs`/`search_*`/`provider_message_log` (nunca ativadas na V3).

## Cartões (prefixo HZ; ids em `ids.json`)
| Id | Perfil | Escopo |
|---|---|---|
| HZ-00 | worker | grava auditorias e plano |
| HZ-01 | workersql | **P0** policy de SELECT do dono em `security_alerts` |
| HZ-02 | workersql | `passkey_credentials` sem INSERT/UPDATE direto |
| HZ-03 | workersql | cron do `crm_sync_outbox` |
| HZ-04 | workersql | máquina de estados de `scheduled_messages` |
| HZ-05 | hugo | cancelar agendamento com erro visível (após `t_7d49637f`) |
| HZ-06 | hugo | dispensar alerta de segurança, `resolved_by`, contador |
| HZ-07 | hugo | painel de auditoria com totais reais |
| HZ-08 / HZ-09 | workersql / hugo | `sentiment_trend` + gráficos |
| HZ-10 | hugo | fila offline drenada na abertura |
| HZ-11 | hugo | ditado avisa erro |
| HZ-12 | hugo | `useUserSettings` compartilhado (após `t_97b45162`) |
| HZ-13a / HZ-13b | workersql / hugo | `transcribed_at` + aviso de transcrição |
| HZ-14a / HZ-14b | workersql / hugo | alerta de saúde do webhook (após integrar `t_069395b8`, `t_38ab6fff`) |
| HZ-15 | hugo | War Room: dispensa, realtime, mortos |
| HZ-16 | hugo | relatórios agendados: validações |
| HZ-17 | hugo | Team Chat: colar imagem, canal, rascunho, membros |
| HZ-18 | workersql | limite do bucket `team-chat-files` |
| HZ-19 | hugo | presença de digitação, notificações, tema entre abas, permissões |
| HZ-20 | hugo | `parseUserAgent` |
| HZ-21 | hugo | TalkX: paginação e onError |
| HZ-22 | iris | tira Importar/Exportar da supressão |
| HZ-23 | hugo | hooks de SLA com UUID |
| HZ-24 | hugo | favoritos da sidebar por usuário |
| HZ-25 | iris | proteção de tela |
| HZ-26 | hugo | push de segurança global (após HZ-01) |

## Validação final (Claude)
Por cartão: relato, diff na branch viva, critério de pronto, integração na `dia`. Casos críticos: HZ-01 e HZ-02 (prova de RLS por papel), HZ-03 (job inócuo com flag desligada), HZ-04 (compatível com a cadeia `t_0f85a8b6`), HZ-10 (sem duplicar envio). Recusas voltam como `[refazer N]` ao senior.
