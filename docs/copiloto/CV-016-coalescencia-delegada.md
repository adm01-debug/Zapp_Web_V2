# CV-016 — Coalescência e cancelamento (delegada a IA-048)

> Status: **DELEGADA** — não implementar no RADAR. Ver plano IA-048.

O RADAR depende do mecanismo de versão de `useAiRequestGeneration` (IA-048) para descartar resultados de versões antigas.
A garantia de aceite desta etapa é que **insight com `state_version` menor que o atual da sessão nunca é exibido no painel**.

## Contrato esperado de IA-048

- Quando chega mensagem nova enquanto o RADAR processa, o job anterior é marcado como obsoleto.
- `copilot-live` recebe o `state_version` atual da sessão no payload; se ao gravar o insight o `state_version` da sessão já é maior, o INSERT é abortado (sem erro, sem exibição).

## Ligação com o painel (CV-018)

O front lê apenas insights com `state_version >= copilot_sessions.state_version - 1`. Insights de versões mais antigas ficam ocultos automaticamente pela query.
