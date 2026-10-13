# docs(paridade): grava a auditoria do doc 06 (3a passada) — partes 1 a 3 e o plano

Especialista: worker

## O que mudou e por quê
- docs/plans/PLANO_PARIDADE_V3_DOC_06_TERCEIRA_PASSADA_2026-10-13.md: plano da 3a passada da auditoria de paridade V3→V2 do doc 06 (hooks do inbox) — produto do cartão, entra em docs/plans.
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_06_2026-10-13_PARTE1_ENVIO.md: recorte envio.
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_06_2026-10-13_PARTE2_REALTIME.md: recorte realtime.
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_06_2026-10-13_PARTE3_FILTROS_LISTA.md: recorte filtros/lista.

Os 5 relatórios foram renomeados para o padrão `PARTE1..5` que o plano já cita (linha 7: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_06_2026-10-13_PARTE1..5_*.md`). Cópia byte-a-byte da origem `~/arquitetura-v2/paridade-06/`; nenhum conteúdo técnico foi alterado.

## Divisão da entrega (por que só 4 dos 6 arquivos aqui)
O cartão pede 6 arquivos (~137 mil caracteres adicionados). O `hermes-tarefa-fechar` recusa diff de um único cartão acima de 90000 caracteres adicionados e manda dividir a entrega. Então:
- este cartão entrega o plano + PARTE1..3 (~85 mil caracteres, abaixo do limite);
- as PARTE4 (CONTATO_MIDIA) e PARTE5 (INVENTARIO_TESTES) vão no cartão filho `t_e67dda6e` (docs(paridade): grava as partes 4 e 5...), que fica em `todo` até este fechar.
Os 6 arquivos continuam entrando versionados na `dia`, só que por dois cartões.

## Prova
- tamanho conferido contra a origem: plan 3425 B; PARTE1 33296 B; PARTE2 27265 B; PARTE3 18873 B (iguais aos arquivos de origem).
- varredura de segredo/dado pessoal nos 4 arquivos (`grep -nEi 'eyJ...|sk-...|anon_key|Bearer <tok>|<project-ref>|+55<fone>|<cpf>|...supabase.co'` e `grep -noE '<email>|[0-9]{10,}'`): nenhum telefone, token, chave, CPF, e-mail ou ref de produção. Os únicos casamentos de 10+ dígitos são timestamps de migration.
- `git show --stat --oneline HEAD` → 4 arquivos novos, só adições; nenhum arquivo de código ou teste tocado.
- `zapp-verify . --rapido` roda no fechar (ver linha de resultado).

## O que NÃO fiz e por quê
- Não alterei conteúdo técnico de nenhum relatório nem do plano (como o cartão manda).
- Não toquei em código, migration ou teste.
- Não trouxe as PARTE4/5 para este cartão: estourariam o limite de 90000 do fechar; seguem no cartão filho `t_e67dda6e`.
