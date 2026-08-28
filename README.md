# 🚀 ZAPP-WEB (Pronto Talk Suite)

![CI](https://github.com/adm01-debug/zapp-web/actions/workflows/ci.yml/badge.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss)
![License](https://img.shields.io/badge/license-MIT-green)

> Plataforma omnichannel de atendimento ao cliente com WhatsApp, IA integrada, CRM e automações.

**Deploy**: [pronto-talk-suite.lovable.app](https://pronto-talk-suite.lovable.app)

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológico](#stack-tecnológico)
- [Setup Local](#setup-local)
- [Arquitetura](#arquitetura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Funcionalidades Principais](#funcionalidades-principais)
- [Edge Functions](#edge-functions)
- [Integrações](#integrações)
- [Segurança](#segurança)
- [Testes](#testes)
 - [Auditoria](#-auditoria-e-conformidade)
 - [Deploy](#deploy)
 - [Documentação Adicional](#documentação-adicional)
 - [Contribuição](#contribuição)

---

 ## 🛡️ Auditoria e Conformidade
 
 O sistema passa por auditorias regulares de segurança e funcionalidade.
 - **Relatório em Markdown:** [docs/audit_report.md](docs/audit_report.md)
 - **Relatório em PDF:** [docs/audit_report.pdf](docs/audit_report.pdf)
 
 *O PDF é gerado automaticamente via CI a cada atualização do relatório (commit contendo 'audit').*
 
 ---
 
## Visão Geral

ZAPP-WEB (Pronto Talk Suite) é uma plataforma completa de atendimento ao cliente que centraliza comunicações via WhatsApp, oferece sugestões de IA, CRM integrado, gamificação de agentes, dashboards analíticos e automações de fluxo.

### Público-alvo
- Equipes de atendimento ao cliente
- Gestores de suporte e vendas
- Empresas que usam WhatsApp Business como canal principal

---

## Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18, TypeScript 5, Vite 5 |
| **Estilização** | TailwindCSS 3, shadcn/ui, Framer Motion |
| **Estado** | TanStack React Query, Context API |
| **Backend** | Supabase (Auth, Database, Storage, Edge Functions, Realtime) |
| **IA** | Gemini, GPT via Edge Functions |
| **WhatsApp** | Evolution API v2.3.7+ |
| **CRM** | Bitrix24 API |
| **Áudio** | ElevenLabs (TTS, STT, SFX) |
| **Mapas** | Mapbox GL |
| **Email** | Resend |
| **VoIP** | SIP.js |

---

## Setup Local

```bash
# 1. Clone o repositório
git clone git@github.com:adm01-debug/zapp-web.git
cd zapp-web

# 2. Use a versão correta do Node.js
nvm use

# 3. Instale dependências
bun install  # ou npm install

# 4. Configure variáveis de ambiente
cp .env.example .env.local

# 5. Inicie o servidor de desenvolvimento
bun run dev
```

### Variáveis de ambiente obrigatórias:
- `VITE_SUPABASE_URL` - URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY` - Chave pública do Supabase

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│            React SPA (Vite)             │
│  ┌───────┐ ┌────────┐ ┌──────────────┐ │
│  │ Pages │ │ Hooks  │ │ Components   │ │
│  └───┬───┘ └───┬────┘ └──────┬───────┘ │
│      └─────────┼─────────────┘         │
│            ┌───┴───┐                    │
│            │ Query │ (TanStack)         │
│            └───┬───┘                    │
└────────────────┼────────────────────────┘
                 │ HTTPS
┌────────────────┼────────────────────────┐
│              Supabase                   │
│  ┌──────┐ ┌────┐ ┌─────────┐ ┌──────┐  │
│  │ Auth │ │ DB │ │ Storage │ │ Real │  │
│  └──────┘ └────┘ └─────────┘ │ time │  │
│  ┌────────────────────────┐  └──────┘  │
│  │   Edge Functions (20)  │            │
│  └───────────┬────────────┘            │
└──────────────┼─────────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───┴───┐ ┌───┴───┐ ┌────┴────┐
│Evolut.│ │Bitrix │ │Eleven   │
│ API   │ │  24   │ │ Labs    │
└───────┘ └───────┘ └─────────┘
```

### Decisões Arquiteturais (ADRs)

Veja `docs/decisions/` para decisões documentadas:
- **ADR-001**: React Query como gerenciador de estado do servidor
- **ADR-002**: RLS como camada primária de autorização
- **ADR-003**: Lazy loading de todas as rotas
- **ADR-004**: Evolution API webhook bridge

---

## Estrutura do Projeto

```
src/
├── components/          # Componentes organizados por feature (55+ módulos)
│   ├── auth/           # Autenticação (login, registro, MFA)
│   ├── inbox/          # Caixa de entrada e chat
│   ├── contacts/       # Gestão de contatos
│   ├── dashboard/      # Dashboards e métricas
│   ├── ai/             # Componentes de IA
│   ├── campaigns/      # Campanhas em massa
│   ├── automations/    # Automações e chatbot
│   ├── security/       # Audit logs, rate limiting
│   ├── gamification/   # Gamificação de agentes
│   └── ui/             # shadcn/ui + componentes base
├── hooks/              # 80+ hooks customizados
├── pages/              # Páginas/rotas da aplicação
├── lib/                # Utilitários (logger, helpers)
├── integrations/       # Cliente Supabase (auto-gerado)
├── types/              # Tipos compartilhados
└── i18n/               # Internacionalização

supabase/
├── functions/          # 20 Edge Functions
│   ├── _shared/        # Utilitários compartilhados (validação, CORS, logger)
│   ├── ai-*/           # Funções de IA (suggest-reply, summary, analysis, etc.)
│   ├── evolution-*/    # Integração WhatsApp
│   ├── elevenlabs-*/   # Integração de áudio
│   └── ...
├── migrations/         # 55 Migrations SQL versionadas
└── config.toml         # Configuração do projeto

docs/
├── decisions/          # ADRs (Architecture Decision Records)
├── architecture/       # Documentação de arquitetura
├── runbooks/           # Guias operacionais
├── TECHNICAL_DOCUMENTATION.md
├── EVOLUTION_API_REFERENCE.md
└── ...
```

---

## Funcionalidades Principais

### 💬 Atendimento Omnichannel
- Chat em tempo real via WhatsApp (Evolution API)
- Transferência entre agentes e filas
- Notas internas (whisper messages)
- Presença de digitação em tempo real
- Suporte a mídia (imagens, áudio, documentos, stickers)

### 🤖 IA Integrada
- Sugestão automática de respostas
- Resumo de conversas
- Análise de sentimento
- Auto-tagging de conversas
- Melhoria de tom de mensagens
- Classificação de tickets

### 📊 Analytics & Dashboards
- Dashboard em tempo real
- SLA tracking e alertas
- CSAT (pesquisa de satisfação)
- War room para incidentes
- Relatórios por agente/fila

### 👥 CRM & Contatos
- Gestão de contatos com campos customizáveis
- Pipeline de vendas (Kanban)
- Tags e segmentação
- Integração Bitrix24
- Carteira de clientes

### 🎮 Gamificação
- XP e níveis para agentes
- Achievements e conquistas
- Leaderboard
- Mini-games de treinamento

### 📢 Campanhas
- Disparo em massa via WhatsApp
- Segmentação de contatos
- Tracking de entrega/leitura

### 🔒 Segurança
- MFA (TOTP + WebAuthn/FIDO2)
- Rate limiting com backoff exponencial
- Geo-blocking (whitelist/blacklist)
- Audit logs completos
- 181+ políticas RLS

---

## Edge Functions

| Função | Descrição |
|--------|-----------|
| `ai-suggest-reply` | Sugestão de resposta via IA |
| `ai-conversation-summary` | Resumo automático de conversas |
| `ai-conversation-analysis` | Análise de sentimento e tópicos |
| `ai-enhance-message` | Melhoria de tom de mensagens |
| `ai-auto-tag` | Auto-tagging inteligente |
| `evolution-api` | Proxy seguro para Evolution API |
| `evolution-webhook` | Webhook de eventos WhatsApp |
| `external-db-bridge` | Proxy seguro para DBs externos |
| `chatbot-l1` | Chatbot nível 1 automatizado |
| `elevenlabs-tts` | Text-to-speech |
| `send-email` | Envio de emails via Resend |
| `webauthn` | Autenticação FIDO2/WebAuthn |

---

## Integrações

### WhatsApp (Evolution API)
- Conexão via QR Code
- Envio/recebimento de mensagens (texto, mídia, localização)
- Status de entrega (sent, delivered, read)
- Webhook para eventos em tempo real
- Health check automatizado

### Bitrix24
- Sincronização de contatos
- Pipeline de vendas
- OAuth2 token refresh automático

### ElevenLabs
- Text-to-speech multilíngue
- Speech-to-text (Scribe)
- Voice design customizado
- Sound effects

---

## Segurança

### Autenticação
- Email/senha com verificação HIBP no frontend
- MFA via TOTP e WebAuthn/FIDO2
- Brute force protection (lockout exponencial após 5 tentativas)
- Re-autenticação para ações sensíveis
- Detecção de novos dispositivos

### Autorização (RBAC)
- Roles: `admin`, `supervisor`, `agent`
- Tabela separada `user_roles` com função `has_role()` SECURITY DEFINER
- 181+ políticas RLS no banco de dados
- Trigger anti-escalação de privilégios
- Permissões granulares (role_permissions)

### Proteção de Dados
- CORS restrito por origem (não wildcard)
- Rate limiting em Edge Functions
- IP blocking e geo-blocking
- Audit logs de ações sensíveis
- Credenciais protegidas por RLS (admin only)
- Tabelas sensíveis removidas do Realtime

---

## Testes

```bash
# Executar testes
bun test

# Com cobertura
bun test --coverage

# Em watch mode
bun test --watch

# Testes específicos
bun test src/hooks/
```

**Framework**: Vitest + Testing Library  
**Arquivos**: ~72 arquivos de teste  
**Mock**: Mock centralizado do Supabase em `src/test/mocks/supabase.ts`

---

## Deploy

O deploy é gerenciado automaticamente pelo **Lovable**:
1. Edições no código disparam rebuild automático
2. Edge Functions são deployadas automaticamente
3. Migrations são aplicadas via ferramenta de migração

### URLs
- **Produção**: https://pronto-talk-suite.lovable.app

---

## Documentação Adicional

| Documento | Descrição |
|-----------|-----------|
| [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md) | Documentação técnica (90KB) |
| [`docs/COMPLETE_SYSTEM_FEATURES.md`](docs/COMPLETE_SYSTEM_FEATURES.md) | Funcionalidades do sistema (45KB) |
| [`docs/EVOLUTION_API_REFERENCE.md`](docs/EVOLUTION_API_REFERENCE.md) | Referência de 60+ endpoints |
| [`docs/BACKUP-RECOVERY-STRATEGY.md`](docs/BACKUP-RECOVERY-STRATEGY.md) | Estratégia de backup |
| [`docs/INCIDENT-RUNBOOK.md`](docs/INCIDENT-RUNBOOK.md) | Runbook de incidentes |
| [`docs/decisions/`](docs/decisions/) | Decisões arquiteturais (ADRs) |

---

## Contribuição

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para guia de contribuição.

Para reportar vulnerabilidades, consulte [SECURITY.md](SECURITY.md).

---

## Licença

Este projeto está licenciado sob a [MIT License](LICENSE).

---

*Construído com ❤️ pela equipe Promo Brindes*
