# ADR-007 — Multiplix: ponte Singu, canal não oficial, aptidão sem consentimento e destino de empresa

**Status:** Aceito — D1, D2 e D4 confirmados por Joaquim conforme recomendado; **D3 divergiu da recomendação** (ver nota na seção D3).
**Data:** 2026-09-26 (decisões confirmadas em sessão separada, mesma data)
**Contexto:** Plano `docs/multiplix/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md` (E003–E006) · Evidências em `docs/multiplix/ESTADO_INICIAL.md` e `docs/multiplix/CANAL.md`.

Quatro decisões bloqueiam a Fase 1 do Multiplix. Cada uma abaixo traz o problema medido, as opções, a recomendação e o que ela custa.

---

## D1 (E003) — Caminho de acesso ao Singu

**Problema.** O público do Multiplix (fornecedores, transportadoras, ramo, UF) só existe no Singu (`pgxfvjmuubtbowutlide`). O ZAPP hoje chega lá por 5 RPCs com `GRANT EXECUTE TO anon` (GATE C aberto — `docs/crm-external-grants.md`): qualquer portador da anon key lê 57 mil empresas.

| Opção | Prazo | Risco | Efeito |
|---|---|---|---|
| **A — Edge function do ZAPP com chave de serviço do Singu** | ~2 dias (RPCs + edge) | Baixo. Chave fica em secret; RPCs novas sem GRANT a `anon`. Dependência do Singu online (mitigada em E188). | Destrava o módulo agora e cria o caminho para fechar o GATE C (E195). |
| B — Esperar o banco único | Indefinido | Zero técnico, alto de negócio: módulo parado. | Nada muda até a unificação. |
| C — Reusar as RPCs `anon` atuais | 0 | Amplia a superfície já insegura. | Multiplix nasce em cima do GATE C. |

**Decisão recomendada: A.**
- Secret `SINGU_SERVICE_KEY` nas edge functions do ZAPP (via `deploy-functions.yml`); nunca no front.
- RPCs novas no Singu (`multiplix_search_audience`, `multiplix_count_audience`, `multiplix_resolve_recipients`, `multiplix_list_ramos`, `multiplix_list_ufs`) são `SECURITY DEFINER`, recebem o escopo do usuário ZAPP como parâmetro assinado pela edge e **não** têm GRANT para `anon`.
- Escopo (carteira/departamento) é decidido na edge a partir do JWT do ZAPP e aplicado dentro da RPC (E015). O front nunca manda escopo.
- Quando o banco único chegar, a edge vira chamada local; as RPCs permanecem.

## D2 (E004) — Política do canal não oficial (Evolution GO)

**Problema.** A conexão de produção é Evolution GO (não oficial). Não existe "modelo aprovado" nem "janela de 24 h". O risco real é bloqueio da conexão por ritmo/volume, não rejeição por template.

**O que já existe e vale reaproveitar (medido):**
- `talkx_settings`: `daily_limit_per_connection = 500`, `default_speed_profile = balanced`, `reply_window_hours = 72`, `optout_autoreply = "PARE para sair"`.
- `talkx_campaigns` (defaults): intervalo entre envios 5–15 s, digitação simulada 1,5–4 s, janela de horário opcional, `schedule_timezone = America/Sao_Paulo`.
- `talkx-send` já faz: presença `composing` antes do texto, claim com lease de 90 s, backoff 30 s/2 min/10 min, `outcome_unknown` em timeout, pausa automática por conexão perdida ou fora da janela.

**Decisão recomendada: uma política só, compartilhada com Campanhas, com 4 acréscimos do Multiplix.**
1. Ritmo e teto diário vêm de `talkx_settings` e dos mesmos parâmetros de `talkx_campaigns` (copiados para `multiplix_dispatches` na confirmação). Nada de segunda tabela de política.
2. **Teto por envio:** 200 destinatários por dispatch no padrão; acima disso a revisão exige confirmação explícita e mostra o tempo estimado (200 × ~10 s ≈ 35 min).
3. **Presença `recording`** (GO: `isAudio: true`) antes de bloco de voz; `composing` antes de texto — já suportado no tradutor.
4. **Conexão em risco:** 3 falhas permanentes consecutivas na mesma conexão, ou evento `TemporaryBan`/`ConnectFailure` no webhook → pausa automática de **todos** os dispatches daquela conexão + alerta (E185). Retomada manual.
- Rótulo "Exigem modelo aprovado" sai da UI. O enum guarda `exige_modelo` para um futuro canal oficial.

## D3 (E005) — O que é "apto" sem dado de consentimento

**Problema.** Consentimento não existe como dado: ZAPP `consent_status = unknown` em 3.099/3.099; Singu `contact_preferences` = 0 linhas; `contacts.last_interaction_at` no Singu = **0 contatos nos últimos 180 dias** (campo não é alimentado). `talkx_blacklist` = 0 (mas o mecanismo de "PARE" já existe).

**Decidido por Joaquim: todos aptos por padrão, sem trava de interação prévia — divergiu da recomendação abaixo.**

A recomendação original propunha duas classes (B2B operacional apto direto; Cliente exigindo interação real recente — ver "Alternativas rejeitadas"). Joaquim optou pela opção mais ampla, ciente do risco: os ~55 mil `is_customer` (incluindo importação fria do Bitrix, sem qualquer relação registrada) entram como aptos exatamente como fornecedor/transportadora.

- Único gate real: não estar em `talkx_blacklist` (`talkx_recipient_is_suppressed`) **e** destino válido no WhatsApp (`/user/check`).
- Opt-out inbound ("PARE"/"STOP") continua indo para `talkx_blacklist` — compartilhado com Campanhas.
- Revalidação imediatamente antes de cada POST ao provedor (mesmo padrão do `talkx-send`).
- Isto é política operacional, não parecer jurídico — e é risco aceito deliberadamente, não ausência de análise. Registrado aqui para a auditoria de histórico (Fase 14/15) saber que o alcance foi deliberado, não um bug.

## D4 (E006) — Telefone da empresa como destino

**Problema (medido no Singu):**

| Papel | Empresas | Com pessoa + WhatsApp | Com telefone de empresa (qualquer) | Telefone de empresa marcado WhatsApp |
|---|---|---|---|---|
| Fornecedor | 754 | **84 (11%)** | 285 (38%) | 30 |
| Transportadora | 114 | **58 (51%)** | 53 | — |

Sem telefone de empresa, Compras alcança 1 em cada 9 fornecedores.

**Decisão recomendada: Sim, com rótulo e só para B2B.**
- Ordem de resolução do destino (E014): `contact_phones` (`is_whatsapp AND is_primary`) → `contacts.whatsapp` → **`company_phones`** (`is_whatsapp`, ou verificado via `/user/check` na resolução) → `destino_invalido`.
- Destinatário resolvido por telefone de empresa aparece na lista como **"Empresa · sem pessoa cadastrada"**, com `{{nome}}` vazio → política de campo ausente (substituição aprovada, ex.: "Olá!", ou exclusão). Nunca inventar nome.
- Vale só para `is_supplier`/`is_carrier`. Cliente nunca recebe por telefone genérico da empresa.
- `/user/check` (GO `Users[{IsInWhatsapp}]`) roda na resolução do público e grava o resultado em `company_phones.is_whatsapp` — o Singu ganha o dado como efeito colateral.

---

## Consequências

- Fase 1 do plano (Ponte Singu) começa com D1 aceito; DDL no Singu continua 🔒 PARA por PR aberta.
- `talkx_settings` ganha 1 chave: `multiplix_max_recipients_default` (200). (`multiplix_customer_window_days` não é mais necessária — ver D3.)
- O GATE C (`docs/crm-external-grants.md`) tem caminho de fechamento (E195) e deixa de ser risco aberto sem dono.
- Painel "Pronto para sair?" mostra: Aptos · Sem destino WhatsApp · Suprimidos · Fora do escopo · **Empresa sem pessoa** (subgrupo dos aptos).

## Alternativas rejeitadas

- Criar tabela própria de política de ritmo para o Multiplix — duplicaria `talkx_settings` e divergiria de Campanhas.
- Exigir interação real recente (`messages.sender = 'contact'` via `crm_contact_links`, janela de 180 dias) antes de aptar cliente — era a recomendação inicial deste ADR para a classe "Cliente"; Joaquim decidiu por todos aptos (D3), assumindo o risco de alcançar a base fria em vez de restringir o alcance. Se o risco se materializar (reclamação, bloqueio de conexão), este é o mecanismo a reativar.
- Bloquear todo cliente até existir opt-in formal — inviabiliza o caso "Comercial" da especificação.
