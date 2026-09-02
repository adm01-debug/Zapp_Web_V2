# 🔒 Política de Segurança — ZAPP-WEB

## Versões Suportadas

| Versão | Suportada |
| ------- | --------- |
| main    | ✅ Sim    |
| develop | ✅ Sim    |
| < 1.0   | ❌ Não    |

## Reportando Vulnerabilidades

⚠️ **NÃO abra issues públicas para vulnerabilidades de segurança.**

### Como Reportar

1. **Email:** Envie detalhes para `security@promobrindes.com.br`
2. **Assunto:** `[SECURITY] ZAPP-WEB - Breve descrição`
3. **Inclua:**
   - Descrição da vulnerabilidade
   - Passos para reproduzir
   - Impacto potencial
   - Sugestão de correção (se tiver)

### SLA de Resposta

| Severidade | Tempo de Resposta | Tempo de Correção |
|------------|-------------------|-------------------|
| Crítica    | 24 horas          | 48 horas          |
| Alta       | 48 horas          | 1 semana          |
| Média      | 1 semana          | 2 semanas         |
| Baixa      | 2 semanas         | Próximo release   |

## Boas Práticas de Segurança

### Para Desenvolvedores

- ✅ **NUNCA** commitar secrets, tokens ou senhas
- ✅ Usar `.env` para variáveis sensíveis (já no `.gitignore`)
- ✅ Validar TODAS as entradas do usuário
- ✅ Usar prepared statements para SQL
- ✅ Implementar rate limiting em endpoints sensíveis
- ✅ Manter dependências atualizadas (`npm audit`)

### Autenticação & Autorização

- ✅ MFA/TOTP disponível para todos os usuários
- ✅ WebAuthn/Passkeys suportado
- ✅ RBAC implementado via Supabase RLS
- ✅ Sessões com expiração automática
- ✅ Geo-blocking configurado

### Infraestrutura

- ✅ HTTPS obrigatório em produção
- ✅ Headers de segurança configurados
- ✅ CORS restrito a domínios autorizados
- ✅ Supabase RLS em TODAS as tabelas

## Dependências

Este projeto usa:
- **Supabase** para autenticação e banco de dados
- **Evolution API** para WhatsApp
- **Lovable** para deploy

Verifique regularmente:
```bash
npm audit
npm audit fix
```

### xlsx (SheetJS)

`xlsx` é instalado via tarball fixado em `cdn.sheetjs.com` (não npm registry — a SheetJS parou de publicar lá após `0.18.5`). A versão `0.20.3` é a última release **Community Edition (Apache-2.0)** gratuita da SheetJS; qualquer CVE futuro no `xlsx` não tem correção gratuita garantida — o patch, se vier, pode sair só via SheetJS Pro (pago). Rodar `npm audit`/`bun audit` periodicamente e, se aparecer uma vulnerabilidade nova em `xlsx`, avaliar substituir a lib (não presumir que existe upgrade gratuito disponível).

## Histórico de Segurança

| Data | Descrição | Status |
|------|-----------|--------|
| 2026-04-11 | Removido .env do repositório | ✅ Corrigido |
| 2026-04-11 | Atualizado .gitignore com regras de segurança | ✅ Corrigido |
| 2026-04-11 | Adicionado CI/CD com security audit | ✅ Implementado |
| 2026-09-02 | `xlsx` migrado para CDN oficial SheetJS (0.20.3), fecha 2 vulnerabilidades altas do `^0.18.5` | ✅ Corrigido |

## Contato

- **Responsável:** Joaquim
- **Email:** security@promobrindes.com.br
- **Resposta:** Dentro do SLA acima

---

🛡️ _Segurança é responsabilidade de todos._
