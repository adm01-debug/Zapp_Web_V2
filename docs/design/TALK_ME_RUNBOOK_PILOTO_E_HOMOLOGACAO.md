# TALK ME — Runbook de homologação, piloto e expansão

**Uso:** o que falta do plano de 70 etapas depende de decisão/presença do Joaquim. Este documento é o roteiro pronto: cada bloco tem o que decidir, o comando exato e o critério de aceite. Nada aqui foi executado ainda.

**Estado atual (20/10/2026):** flag `inbox.talk-me` = **ligada para todos**; 31 atendimentos elegíveis em 1 fila ("Fila Geral"); **3 aceites** registrados desde 30/09.

---

## 1. Homologação nominal (etapa 057)

**Quem:** Joaquim + 1 atendente da Fila Geral. **Onde:** ambiente com dados sintéticos (nunca cliente real). **Tempo:** 15 min.

| # | O que olhar | Como | Aprovado? |
|---|---|---|---|
| 1 | Posição do botão no topo direito, acima dos favoritos | abrir Inbox, conferir que não cobre abas nem avatares | ☐ |
| 2 | Botão Zen continua ao lado de "Conversas" | clicar Zen e voltar | ☐ |
| 3 | Aparência metal líquido + fallback | abrir com WebGL e depois com GPU desativada (chrome://gpu) | ☐ |
| 4 | Seletor de departamento e contagem | trocar de fila e conferir número | ☐ |
| 5 | Cartão: foto, nome, empresa, cargo, espera, posição | conferir com contato sem foto e sem empresa | ☐ |
| 6 | Prévia de mídia (nova) | abrir imagem, ouvir áudio, trocar de contato e confirmar que o áudio parou | ☐ |
| 7 | Histórico antes do aceite | abrir histórico, conferir rótulos Cliente/Saída/Nota interna, Escape fecha só o histórico | ☐ |
| 8 | Ordem da fila | o mais antigo está em #1 | ☐ |
| 9 | Aceite | "Aceitar e conversar" abre a conversa certa; foco volta ao botão ao fechar | ☐ |
| 10 | Conflito | duas abas aceitando o mesmo contato: uma vence, a outra recebe aviso | ☐ |

**Aceite:** os 10 itens marcados. Qualquer "não" vira item de correção antes do piloto.

---

## 2. Piloto controlado (etapas 059 e 062)

**Decisão necessária:** a flag hoje é global. Duas opções:

| Opção | Efeito | Custo | Recomendação |
|---|---|---|---|
| A — manter global e só observar | todos continuam vendo; telemetria mede uso | zero | se o volume de aceites continuar baixo, não resolve adoção |
| B — piloto por fila | só a fila escolhida mostra o botão | exige coluna/flag por fila (DDL aditivo) + ajuste no hook | **recomendado**, se o objetivo é medir adoção sem expor todo mundo |

**Se B:** uma migration aditiva (`inbox.talk-me.queues` em `feature_flags.metadata` ou tabela de escopo), aplicada pelo fluxo `db-migrate.yml` com aprovação, e o hook passa a considerar a fila. Fila piloto sugerida: "Fila Geral" (única com espera hoje).

**Critério de sucesso (definir antes de começar):**
- tempo até aceite (p50) menor que o do fluxo atual de "Aguardando" na mesma fila;
- ≥ 30% dos atendimentos elegíveis aceitos pelo TALK ME em 14 dias;
- zero conflito não tratado;
- zero erro de fila na telemetria.

**Janela de observação:** 14 dias (`062`). Ao fim, comparar com o baseline medido antes do piloto.

---

## 3. Como medir (etapa 097 — telemetria já instrumentada)

Os eventos saem pelo logger `talkMeTelemetry`: `abertura`, `aceite_ok` (com `ms_desde_abertura`), `conflito`, `resultado_desconhecido`, `offline`, `erro_fila`, `erro_shader`. Sem conteúdo de mensagem e sem PII.

Consulta de acompanhamento (somente leitura):

```sql
-- aceites por dia (fonte oficial, independente de telemetria)
SELECT date_trunc('day', created_at) AS dia, count(*) AS aceites
FROM public.audit_logs
WHERE action = 'talk_me_claim'
GROUP BY 1 ORDER BY 1 DESC LIMIT 30;

-- fila atual por departamento
SELECT q.name AS fila, count(*) AS elegiveis
FROM public.talk_me_eligible_waiting_contacts(NULL, NULL) e
JOIN public.queues q ON q.id = e.queue_id
GROUP BY 1 ORDER BY 2 DESC;
```

---

## 4. Ensaio de reversão (etapa 063)

**Efeito:** desligar a flag remove o botão e a tela; **não** devolve à fila contatos já aceitos e **não** apaga auditoria.

```sql
-- desligar (janela de 5 minutos, fora do horário de pico)
UPDATE public.feature_flags SET enabled = false WHERE key = 'inbox.talk-me';

-- religar
UPDATE public.feature_flags SET enabled = true WHERE key = 'inbox.talk-me';
```

**Conferir depois de desligar:** botão ausente no desktop e no mobile; nenhum erro no console; fila de "Aguardando" intacta. Depois de religar: botão volta com a contagem correta.

**Nunca** fazer isso enquanto houver atendente no meio de um aceite.

---

## 5. Expansão (etapas 065 e 066)

1. cumprir o critério da seção 2;
2. liberar fila a fila, uma por semana, registrando data/fila/resultado;
3. manter a telemetria por fila durante toda a expansão;
4. problema em uma fila não derruba as outras (possível só com o recorte por fila da seção 2, opção B).

---

## 6. Correções que estão em PR aguardando aprovação

| PR | O que é | Por que não foi mergeada |
|---|---|---|
| #2136 | endurece busca do TALK ME (escape de `%`/`_`, limite de 80 caracteres) + contrato SQL | é DDL: exige `db-migrate.yml` com aprovação e regeneração do manifesto depois do apply |

Depois do apply: regenerar `supabase/schema-manifest.json` a partir da produção no mesmo turno (o hash da função `talk_me_list_waiting` muda).
