# 📝 POP — Procedimento Operacional Padrão
## Fluxo de Atendimento Básico via WhatsApp

**Código:** POP-ATD-001  
**Versão:** 1.0  
**Data:** 2026-04-11  
**Setor:** Atendimento ao Cliente  
**Responsável:** Supervisor de Atendimento

---

## 1. OBJETIVO

Padronizar o processo de atendimento ao cliente via WhatsApp no sistema ZAPP-WEB, garantindo:
- Tempo de primeira resposta < 2 minutos
- Qualidade consistente no atendimento
- Resolução eficiente de demandas
- Satisfação do cliente (CSAT > 90%)

---

## 2. ESCOPO

**Aplica-se a:** Todos os atendentes (agents) do sistema ZAPP-WEB.

**Não se aplica a:**
- Atendimentos automatizados (chatbot)
- Campanhas de broadcast
- Suporte técnico interno

---

## 3. DEFINIÇÕES

| Termo | Definição |
|-------|------------|
| **TMPR** | Tempo Médio de Primeira Resposta |
| **TMR** | Tempo Médio de Resolução |
| **SLA** | Service Level Agreement (acordo de nível de serviço) |
| **CSAT** | Customer Satisfaction Score |
| **Fila** | Agrupamento lógico de conversas por setor/tipo |
| **Tag** | Etiqueta de classificação do atendimento |

---

## 4. RESPONSÁVEIS

| Papel | Responsabilidades |
|-------|--------------------|
| **Atendente** | Executar o atendimento conforme este POP |
| **Supervisor** | Monitorar KPIs, redistribuir filas, escalar casos |
| **Administrador** | Configurar filas, SLAs, automações |

---

## 5. RECURSOS NECESSÁRIOS

- Acesso ao sistema ZAPP-WEB (https://pronto-talk-suite.lovable.app)
- Conta de atendente ativa
- Conexão WhatsApp configurada (QR Code escaneado)
- Headset (para áudios)
- Atalhos de teclado memorizados

---

## 6. PROCEDIMENTO DETALHADO

### 6.1 Início do Expediente

```
┌─────────────────────────────────────────────────────────┐
│ PASSO 1: Fazer login no sistema                        │
├─────────────────────────────────────────────────────────┤
│ - Acessar: https://pronto-talk-suite.lovable.app       │
│ - Inserir e-mail e senha                               │
│ - Completar MFA se solicitado                          │
└─────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────┐
│ PASSO 2: Verificar status da conexão WhatsApp          │
├─────────────────────────────────────────────────────────┤
│ - Acessar menu "Conexões"                              │
│ - Verificar se status = "🟢 Conectado"                │
│ - Se desconectado, escanear QR Code novamente          │
└─────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────┐
│ PASSO 3: Abrir a Inbox                                 │
├─────────────────────────────────────────────────────────┤
│ - Clicar em "Inbox" no menu lateral                    │
│ - Verificar conversas pendentes (badge vermelho)       │
│ - Priorizar conversas com SLA próximo de violar        │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Atendimento de Nova Conversa

| # | Ação | Detalhes | Tempo Máx |
|---|------|----------|----------|
| 1 | **Abrir conversa** | Clicar na conversa pendente | 10 seg |
| 2 | **Ler mensagens** | Entender a demanda do cliente | 30 seg |
| 3 | **Cumprimentar** | Usar saudação padrão | 20 seg |
| 4 | **Identificar tipo** | Classifcar: dúvida, reclamação, pedido, suporte | 15 seg |
| 5 | **Adicionar tag** | Etiquetar conforme o tipo | 5 seg |
| 6 | **Responder** | Resolver ou escalar | Varia |
| 7 | **Encerrar** | Perguntar se pode ajudar em mais algo | 20 seg |
| 8 | **Finalizar** | Marcar como resolvido | 5 seg |

### 6.3 Scripts de Atendimento

#### Saudação Inicial
```
Olá, [NOME]! 👋
Meu nome é [SEU_NOME] e vou te ajudar.
Como posso ajudar você hoje?
```

#### Aguardando Informação
```
Para dar seguimento, preciso de mais algumas informações:
- [INFO 1]
- [INFO 2]
Pode me enviar, por favor?
```

#### Encaminhando para Outro Setor
```
Vou transferir você para nosso setor de [SETOR], 
que poderá te ajudar melhor com isso.
Aguarde só um momento! 🙏
```

#### Encerramento Positivo
```
Que bom que conseguimos resolver! 🎉
Posso ajudar com mais alguma coisa?
Se não, desejo um ótimo dia!
```

#### Encerramento com Pendência
```
Vou deixar esse atendimento aberto para acompanhar.
Assim que tivermos novidades, entro em contato.
Precisando, é só chamar aqui! 👍
```

### 6.4 Transferência de Conversa

1. Clicar no ícone de transferência (seta)
2. Selecionar fila ou atendente de destino
3. Adicionar nota interna explicando o contexto
4. Confirmar transferência
5. Comunicar ao cliente (usar script de encaminhamento)

### 6.5 Escalação para Supervisor

**Quando escalar:**
- Cliente agressivo ou ameaçando
- Demanda fora da alçada do atendente
- Bug ou erro no sistema
- Dúvida técnica complexa
- Reclamação grave

**Como escalar:**
1. Adicionar tag `#urgente` ou `#supervisor`
2. Adicionar nota interna com contexto
3. Notificar supervisor via chat interno ou Slack

---

## 7. ATALHOS DE TECLADO

| Atalho | Ação |
|--------|------|
| `Ctrl + Enter` | Enviar mensagem |
| `Ctrl + K` | Abrir command palette |
| `Ctrl + /` | Inserir resposta rápida |
| `Ctrl + Shift + T` | Adicionar tag |
| `Ctrl + Shift + N` | Nova nota interna |
| `Ctrl + Shift + E` | Encerrar conversa |
| `Esc` | Fechar modais |

---

## 8. INDICADORES (KPIs)

| Indicador | Meta | Frequência de Medição |
|-----------|------|------------------------|
| **TMPR** | < 2 min | Diária |
| **TMR** | < 30 min | Diária |
| **SLA Cumprido** | > 95% | Semanal |
| **CSAT** | > 90% | Semanal |
| **Taxa de Resolução** | > 85% | Semanal |

---

## 9. NÃO-CONFORMIDADES

| Situação | Consequência | Ação Corretiva |
|----------|--------------|----------------|
| TMPR > 5 min | Feedback verbal | Coaching individual |
| TMPR > 10 min | Advertência | Treinamento obrigatório |
| Uso de linguagem inadequada | Advertência escrita | Reciclagem |
| Abandono de atendimento | Advertência escrita | Revisão de carga |

---

## 10. REGISTRO E CONTROLE

| Documento | Local | Retenção |
|-----------|-------|-----------|
| Histórico de mensagens | Tabela `messages` | 2 anos |
| Log de auditoria | Tabela `audit_logs` | 5 anos |
| CSAT surveys | Tabela `csat_surveys` | 2 anos |
| Relatórios | Menu "Relatórios" | Ilimitado |

---

## 11. HISTÓRICO DE REVISÕES

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-04-11 | Claude AI | Versão inicial |

---

## 12. APROVAÇÕES

| Função | Nome | Assinatura | Data |
|--------|------|------------|------|
| Elaboração | Claude AI | — | 2026-04-11 |
| Revisão | [Supervisor] | _______________ | ___/___/___ |
| Aprovação | [Gestor] | _______________ | ___/___/___ |

---

**Documento controlado. Cópias impressas não são controladas.**
