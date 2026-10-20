Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 621s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 19:25, gerados por máquina: valem mais que números escritos à mão)
```
 .../alerts/EvolutionDisconnectBanner.tsx           |   9 +-
 .../EvolutionDisconnectBanner.a11y.test.tsx        |  23 +-
 .../EvolutionDisconnectBanner.behavior.test.tsx    |  21 +-
 ...tionDisconnectBanner.janela-manutencao.test.tsx |  22 +-
 .../EvolutionDisconnectBanner.preferencia.test.tsx |  76 ++++++
 .../settings/ConnectionAlertPreferences.tsx        | 160 +++++++++++
 .../__tests__/ConnectionAlertPreferences.test.tsx  | 141 ++++++++++
 .../useConnectionAlertPreferences.test.tsx         | 182 +++++++++++++
 src/hooks/system/useConnectionAlertPreferences.ts  | 122 +++++++++
 src/integrations/supabase/types.ts                 |  33 +++
 ...20261013044440_connection_alert_preferences.sql |  74 ++++++
 .../tests/connection_alert_preferences_rls.sql     | 291 +++++++++++++++++++++
 12 files changed, 1140 insertions(+), 14 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 30 passed (30)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013044440_connection_alert_preferences.sql, supabase/tests/connection_alert_preferences_rls.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:DISABLE ROW LEVEL, padrão:SECURITY DEFINER, padrão:WITH CHECK, padrão:\.delete\(\)|\bDELET


## O que mudou e por quê
- src/components/settings/ConnectionAlertPreferences.tsx (novo): seção em Card com as QUATRO preferências por usuário — canais (Notificação do navegador / E-mail) e tipos (Conexão instável / Conexão desconectada). Cada interruptor grava na hora pelo hook `useConnectionAlertPreferences` (linhas 98-107), com `aria-label` refletindo o estado e `aria-describedby` para o texto. O texto de cada opção explica o efeito; o do e-mail registra que depende do PK-15 (linha 46). Estado "Salvando…" em região `aria-live` (148-150) e erro de gravação em `role="alert"` (152-156). Nenhum controle que exporte, baixe, copie ou imprima.
- src/components/settings/__tests__/ConnectionAlertPreferences.test.tsx (novo): 8 testes sobre o componente REAL (só o hook é mockado) — as quatro preferências refletindo o estado atual, a gravação de cada uma com campo e valor certos, erro anunciado sem esconder o interruptor, estado de salvando, carregando desabilita os quatro, texto do PK-15, ausência de controle de exportar e axe zerado.

## FAIXA DO PAI
FAIXA DO PAI: commits bd68b528f8 (t_e8b312e0) e 337143c890 (t_6bf2d93f) — não são deste cartão; vieram por cherry-pick porque o próprio cartão manda ler esses dois cartões e esta tela não compila sem o hook. Arquivos que o diff traz deles (e que este cartão só CONSOME, sem editar):
- supabase/migrations/20261013044440_connection_alert_preferences.sql — tabela + RLS (PD-38).
- supabase/tests/connection_alert_preferences_rls.sql — prova de RLS da tabela (PD-38).
- src/integrations/supabase/types.ts — tipos da tabela (PD-38).
- src/hooks/system/useConnectionAlertPreferences.ts — hook lido por esta tela.
- src/hooks/system/__tests__/useConnectionAlertPreferences.test.tsx — testes do hook.
- src/components/alerts/EvolutionDisconnectBanner.tsx — gate do banner lê a preferência.
- src/components/alerts/__tests__/EvolutionDisconnectBanner.a11y.test.tsx, .behavior.test.tsx, .janela-manutencao.test.tsx e .preferencia.test.tsx — testes do banner ajustados ao gate.
Os dois arquivos DESTE cartão: src/components/settings/ConnectionAlertPreferences.tsx e src/components/settings/__tests__/ConnectionAlertPreferences.test.tsx. O juiz barato marca os demais como "fora de ARQUIVOS QUE PODE TOCAR" — eles são da faixa do pai (cherry-pick), não foram editados por este cartão: os commits DESTE cartão (4a5ce74fd8, d8fb2b2f74) mudam exatamente os 2 arquivos acima.

## Prova
- vermelho antes: `npx vitest run src/components/settings/__tests__/ConnectionAlertPreferences.test.tsx` com o componente ausente → `Test Files 1 failed (1); Tests no tests` (erro ao resolver o import).
- verde depois: `npx vitest run src/components/settings/__tests__/ConnectionAlertPreferences.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`.

## Critério de pronto
1. Usuário edita as quatro preferências — ConnectionAlertPreferences.tsx:98-107 (quatro interruptores ligados ao hook) + testes "mostra as quatro preferências refletindo o estado atual" e "grava cada uma das quatro preferências com o campo e o valor certos".
2. `zapp-verify . --rapido` verde — roda no fechar.

## O que NÃO fiz e por quê
- Não montei a seção em nenhuma aba de Configurações: `SettingsView.tsx` está FORA de ARQUIVOS QUE PODE TOCAR (só o arquivo novo + testes). O componente entregue é a seção pronta para o integrador montar.
- Captura de tela: não produzi porque o componente ainda não está montado em rota/aba (item acima); sem montagem não há tela para capturar.
