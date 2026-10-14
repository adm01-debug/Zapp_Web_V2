Especialista: worker

## O que mudou e por quê
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE1_SLA_AGENDAMENTO_SEGURANCA.md (novo): copia byte a byte de `.assets/paridade-hooks26/achados_1.md` — PARTE1 da auditoria de paridade V3->V2 do doc 26 (hooks raiz S-Z), fatia SLA/agendamento/segurança.
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE2_SENTIMENTO_TALKX_TEAMCHAT.md (novo): copia byte a byte de `achados_2.md` — PARTE2 (sentimento, Talk X, Team Chat).
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE4_SETTINGS_WEBAUTHN_WARROOM.md (novo): copia byte a byte de `achados_4.md` — PARTE4 (settings, WebAuthn, war room).
Nenhuma linha de conteúdo foi editada; só versiono as 3 fatias que sobraram do cartão pai t_a027865c (que versionou PARTE3, PARTE5 e o plano). A divisão em dois cartões é exigida porque o diff somado dos 6 arquivos passava do teto do fechar.

## Prova
- md5sum dos 3 destinos == valores do cartão, idênticos à origem:
  - PARTE1 a2d4016d5210974888f5a1dc6de05723
  - PARTE2 7fe97157834d3e801215a8241754b3de
  - PARTE4 c91739f872f9b9b04fb4bd4006817ed8
- sem segredo nem dado pessoal: busca de regex (JWT `eyJ`, `sk-`, `ghp_`, hex longo, `tnnnlkbymytvtqngbbqh`, `service_role_key`/`anon_key`/`Bearer`, `+55`/`(DD)9...`) nos 3 arquivos deu 0 ocorrências; o único e-mail é o exemplo `a@x.com` (PARTE1 linha 57).
- verificação: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK).

## O que NÃO fiz e por quê
- Não alterei o SQL/DDL, Edge, nem toquei PARTE3/PARTE5/plano (já versionados no cartão pai).
- Não fiz push/PR/deploy (modo V2 local).
