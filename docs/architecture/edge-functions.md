# Documentação de Edge Functions

## Visão Geral
O projeto possui 40+ Edge Functions deployadas automaticamente pelo Lovable Cloud.

---

## Categorias

### 🤖 IA e Processamento
| Função | Descrição |
|--------|-----------|
| `ai-auto-tag` | Classificação automática de conversas com tags via IA |
| `ai-conversation-analysis` | Análise de sentimento e resumo de conversas |
| `ai-conversation-summary` | Geração de resumos automáticos |
| `ai-enhance-message` | Melhoria de texto de mensagens |
| `ai-suggest-reply` | Sugestão automática de respostas |
| `ai-transcribe-audio` | Transcrição de áudios para texto |
| `sentiment-alert` | Alertas quando sentimento negativo é detectado |

### 📱 WhatsApp / Evolution API
| Função | Descrição |
|--------|-----------|
| `evolution-api` | Proxy para a Evolution API (envio de mensagens, status, etc.) |
| `evolution-sync` | Sincronização de contatos e mensagens |
| `evolution-webhook` | Recebimento de webhooks da Evolution API |
| `whatsapp-webhook` | Processamento de eventos WhatsApp |
| `connection-health-check` | Monitoramento de saúde das conexões WhatsApp |

### 🔐 Autenticação e Segurança
| Função | Descrição |
|--------|-----------|
| `create-user` | Criação de novos usuários com role padrão |
| `approve-password-reset` | Aprovação de solicitações de reset de senha |
| `detect-new-device` | Detecção de login em novo dispositivo |
| `webauthn` | Autenticação biométrica via WebAuthn/Passkeys |
| `cleanup-rate-limit-logs` | Limpeza de logs de rate limiting |
| `send-rate-limit-alert` | Alertas de rate limiting |

### 🔊 ElevenLabs (Áudio/Voz)
| Função | Descrição |
|--------|-----------|
| `elevenlabs-tts` | Text-to-speech |
| `elevenlabs-tts-stream` | Text-to-speech streaming |
| `elevenlabs-sts` | Speech-to-speech |
| `elevenlabs-sfx` | Efeitos sonoros |
| `elevenlabs-dialogue` | Diálogos com IA |
| `elevenlabs-scribe-token` | Token para transcrição |
| `elevenlabs-voice-design` | Design de vozes customizadas |
| `elevenlabs-webhook` | Webhooks do ElevenLabs |

### 🏢 Integrações Externas
| Função | Descrição |
|--------|-----------|
| `bitrix-api` | Integração com Bitrix24 CRM |
| `external-db-bridge` | Bridge para banco de dados externo |
| `sicoob-bridge` | Integração com sistema Sicoob |
| `sicoob-bridge-reply` | Respostas via bridge Sicoob |
| `promogifts-catalog` | Catálogo de produtos PromoGifts |
| `public-api` | Tombstone de segurança: integração legada desativada, responde HTTP 410 sem ler credenciais ou executar efeitos |

### 📧 Comunicação
| Função | Descrição |
|--------|-----------|
| `send-email` | Envio de emails via Resend |
| `send-scheduled-report` | Envio de relatórios agendados |

### 🛠️ Utilitários
| Função | Descrição |
|--------|-----------|
| `batch-fetch-avatars` | Busca de avatares em lote |
| `classify-audio-meme` | Classificação de memes de áudio |
| `classify-emoji` | Classificação de emojis customizados |
| `classify-sticker` | Classificação de stickers |
| `get-mapbox-token` | Token do Mapbox para mapas |
| `get-sip-password` | Credenciais SIP para VoIP |
| `migrate-media-storage` | Migração de mídia entre storages |
| `chatbot-l1` | Chatbot de nível 1 (atendimento inicial) |

---

## Secrets Configurados
| Secret | Uso |
|--------|-----|
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `RESEND_API_KEY` | API key do Resend (emails) |
| `ELEVENLABS_API_KEY` | API key do ElevenLabs (via connector) |
| `SIP_PASSWORD` | Senha SIP para VoIP |
| `MAPBOX_PUBLIC_TOKEN` | Token público do Mapbox |
| `LOVABLE_API_KEY` | Chave da API Lovable (IA) |
| `PROMOGIFTS_SUPABASE_*` | Credenciais do projeto externo |

---

## Testando Edge Functions

```bash
# Exemplo: testar ai-suggest-reply
curl -X POST $SUPABASE_URL/functions/v1/ai-suggest-reply \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Qual o prazo de entrega?"}]}'
```
