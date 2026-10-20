ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`conversation_closures.closed_by` e `conversation_events.performed_by` não são ligados ao chamador; `calls`/`email_messages` têm UPDATE sem `WITH CHECK`; as funções de papel (`has_role`, `is_admin_or_supervisor`, `get_profile_role_for_check` etc.) são chamáveis com id arbitrário (oráculo de papel: qualquer um descobre se outro usuário é admin).

O QUE FAZER
1. Prenda os campos de autoria por gatilho/`WITH CHECK` ao `auth.uid()`; acrescente `WITH CHECK` nas políticas de UPDATE citadas; restrinja o parâmetro `_user_id` das funções de papel ao próprio chamador para `authenticated` (o service role e as políticas internas continuam), mantendo as variantes usadas em políticas.
2. Prova no banco local: não forja autor; não consulta papel alheio; as políticas existentes continuam funcionando (suíte de RLS verde). `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_autoria_e_oraculo_de_papel.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Autoria garantida.
2. Papel alheio não consultável.
3. `zapp-verify . --rapido` verde.
