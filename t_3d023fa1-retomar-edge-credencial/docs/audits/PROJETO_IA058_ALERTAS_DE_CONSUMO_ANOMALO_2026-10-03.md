# IA-058 — Projeto: alertas de consumo anômalo

**Etapa:** `[M] Alertar sobre consumo anômalo` (Bloco 06 do `PLANO_IA_200_ETAPAS_2026-09-29.md`).

**O que o plano pede:** *"Projetar alertas por usuário, departamento e capacidade para aumento de gasto, erros e concorrência, com limiares e deduplicação."*

**Aceite:** *"O futuro mecanismo alerta uma vez por incidente e permite bloquear apenas a capacidade afetada."*

Este documento é a **projeção** — como o próprio aceite diz, o mecanismo é futuro. Aqui ficam decididos: os escopos, os sinais, os limiares, a identidade do incidente (deduplicação) e o formato do bloqueio. Nada aqui é implementado nesta etapa.

---

## 1. O que já existe (medido, para não projetar no vazio)

| Peça | Onde | Serve para |
|---|---|---|
| `ai_budget_reservations` | `20261002361230_ia043_ia044_rate_limit_e_orcamento.sql:99` | orçamento com reserva/consumo: **a base do sinal de gasto** |
| `ai_usage_logs` (+ `request_id`, `job_id`, `attempt`) | IA-051 | origem do consumo por função, usuário e modelo |
| `ai_model_prices` | IA-055 (#1796) | preço vigente — é o que transforma token em **gasto** |
| `ai_usage_cost_summary` | IA-055/aceite (#1824) | custo por período, já separando interno de reconciliado |
| `edge_rate_limits` | `20260905020000` | contagem por janela: **a base do sinal de concorrência** |
| **capacidades da conexão + risco (F60)** | `20261002671230_f60_conexao_capacidades_e_risco.sql` | **o padrão de bloqueio com escopo**: a conexão em risco é **pausada com motivo** (`pause_reason='connection_at_risk'`), a retomada é **manual**, e o resto do sistema segue |
| cron de alerta de orçamento | `20261002601230_searchbox_budget_alert_cron.sql` | precedente de cron de alerta — **medido: não cria tabela nenhuma** (0 `create table`) e **não tem nenhuma marca de deduplicação** (0 `unique`/`on conflict`/`last_alert`). Sem estado de incidente, deduplicar é impossível, não apenas ausente: é o buraco que este projeto fecha |

**Consequência de projeto:** o "bloquear apenas a capacidade afetada" **não precisa ser inventado**. O F60 já estabeleceu o formato no projeto: *pausar o alvo com motivo registrado, retomada manual, sem derrubar o resto*. O que falta é o mesmo formato aplicado às **capacidades de IA**.

---

## 2. Os três escopos

| Escopo | Chave | Por que este escopo existe |
|---|---|---|
| **Usuário** | `user_id` | um agente em loop de copilot queima orçamento sem que ninguém veja; o alerta precisa chegar a quem opera |
| **Departamento** | `department_id` | o consumo é compartilhado por equipe: o limite é do time, não do indivíduo |
| **Capacidade** | `(modality, purpose)` | `text/vision/audio_*` × `copilot/analysis/summary/tagging/auto_reply` — é a granularidade que **permite bloquear só o que está doente** |

A capacidade é a chave do escopo mais fino porque é **onde o bloqueio acontece** (§5). Usuário e departamento são escopos de **aviso**; capacidade é escopo de **ação**.

---

## 3. Os três sinais

| Sinal | Medida | Fonte | Anomalia |
|---|---|---|---|
| **Gasto** | custo do período (por vigência) | `ai_usage_cost_summary` | acima do limiar do escopo, **ou** fora da faixa histórica do próprio escopo |
| **Erros** | `taxa de erro = falhas / chamadas com desfecho` | `ai_usage_logs.status` | acima do limiar **desde que a amostra mínima exista** |
| **Concorrência** | chamadas simultâneas / recusas por limite | `edge_rate_limits`, `ai_budget_reservations` | saturação sustentada do limite, não pico isolado |

**Regra herdada das etapas anteriores (IA-053/055/056/057), e que vale para todos os sinais:** amostra insuficiente **não é anomalia**. Sem `n` mínimo, o sinal não dispara — porque "não observei o suficiente" e "está tudo bem" não são a mesma afirmação. É a mesma decisão do aceite da IA-057 (nada de 100% por ausência de observação) levada para o lado do alerta: nada de alarme por ausência de observação.

---

## 4. Deduplicação: a identidade do incidente

O aceite é explícito — **uma vez por incidente**. Projeto da chave:

```
incidente = (escopo, alvo_id, sinal, janela)
```

- **`escopo`** ∈ {usuario, departamento, capacidade}; **`alvo_id`** é o id do alvo.
- **`sinal`** ∈ {gasto, erros, concorrencia}.
- **`janela`** é o **balde** de tempo da avaliação (ex.: hora), **não** o instante da checagem.

O ponto sensível está na última componente. Se a janela fosse o instante, cada execução do cron criaria um "incidente" novo e o alerta viraria spam — que é o defeito clássico deste tipo de mecanismo. Com o balde, **o mesmo alvo, no mesmo sinal, na mesma hora, é o mesmo incidente**: a segunda detecção **atualiza** o incidente (piora o valor, conta a recorrência) em vez de alertar de novo.

Ciclo de vida: `aberto → reconhecido → resolvido`. "Reconhecido" existe para o operador poder dizer "eu vi, estou cuidando" sem que o alerta cale para sempre — se o valor voltar a subir, o incidente **reabre** (volta a notificar) em vez de ficar silenciado pelo reconhecimento.

Restrição de banco que materializa a dedup: **índice único** em `(escopo, alvo_id, sinal, janela)` na tabela de incidentes. A deduplicação deixa de ser disciplina de código e passa a ser **impossibilidade de duplicar**.

---

## 5. Bloquear apenas a capacidade afetada

Formato, copiado do F60 (que já provou o padrão):

1. **Escopo do bloqueio = a capacidade**, nunca o provedor inteiro e nunca a instalação. `(modality, purpose)` afetados são marcados como indisponíveis; todo o resto continua atendendo.
2. **Pausa com motivo**, registrada na trilha (`pause_reason` equivalente: ex. `ai_capability_blocked`, com o id do incidente que motivou). Bloqueio sem motivo registrado é bloqueio que ninguém consegue auditar nem reverter com segurança.
3. **Retomada manual**, como no F60 — nenhuma auto-liberação por tempo. Um mecanismo que se desbloqueia sozinho transforma uma anomalia de gasto em anomalia recorrente.
4. **Degradação declarada, não silenciosa:** a chamada para a capacidade bloqueada devolve **recusa explícita com o motivo e o incidente**, em vez de cair para outro provedor por baixo do pano. O fallback silencioso é justamente o que tornaria o bloqueio inútil (o gasto continuaria, em outro lugar).

**Limite do próprio bloqueio (o que ele NÃO faz):** bloquear capacidade **não** estorna consumo já reservado nem apaga histórico — o gasto do período continua verdadeiro. Bloqueio contém o dano futuro; ele não reescreve o passado.

---

## 6. Limiares

Três camadas, da mais previsível à mais informativa:

1. **Absoluto** (por escopo): teto de custo na janela (para gasto) e teto de taxa de erro (para erros). Simples, explicável, e é o que o operador entende de imediato.
2. **Relativo ao próprio escopo**: desvio da faixa histórica do alvo (mediana e dispersão das últimas N janelas). Pega o "dobrou de repente" que um teto absoluto deixa passar.
3. **Saturação** (para concorrência): tempo sustentado no limite, não um pico.

Os números **não** ficam fixos no código: cada escopo carrega seu limiar, ajustável sem deploy — e a mudança de limiar é auditada. Um limiar fixo em código torna o mecanismo inútil no dia em que o padrão de uso mudar, e é a razão pela qual este projeto propõe a tabela de limiares desde o início.

---

## 7. Como o aceite se prova (planejado para a etapa de implementação)

1. **Uma vez por incidente:** gerar duas detecções do mesmo (escopo, alvo, sinal, janela) ⇒ **um** incidente e **uma** notificação; tentar inserir a segunda linha ⇒ recusa pelo índice único.
2. **Reabertura:** reconhecer, o valor voltar a subir ⇒ volta a notificar (reconhecimento não é silenciador permanente).
3. **Escopo do bloqueio:** bloquear `(vision, tagging)` ⇒ `(text, copilot)` **continua atendendo** (prova por chamada real).
4. **Motivo e auditoria:** todo bloqueio tem motivo e incidente de origem; e existe retomada manual.
5. **Sem amostra não há alarme:** abaixo do `n` mínimo, o sinal **não** dispara — o inverso exato do defeito corrigido na IA-057.

---

## 8. Fora do escopo desta etapa

- **Implementar** o mecanismo: este documento é a projeção; a implementação é etapa própria.
- **Canais de notificação** (e-mail, WhatsApp, Slack) e escalonamento por turno: a projeção define o evento, não o canal.
- **Custo real de provedor como fonte de anomalia**: depende da ingestão de extrato (declarada como pendência na IA-055).
- **Orçamento por departamento**: depende de decidir se o teto é por time, por soma dos membros ou ambos — decisão de produto, não técnica.
