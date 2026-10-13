# Plano de paridade V3 → V2 — doc 06 (hooks do inbox), terceira passada

Data: 13/10/2026. Pedido do Joaquim: auditar `docs/estado/06-features-inbox-hooks.md` da V3 e achar o que existe lá e falta (ou é pior) na V2.

## 1. Método
- O doc 06 já tinha duas passadas: PD-61..95 (12/10) e PH-01..53 de `paridade-hooks06` (13/10), além de PH-00..15 do doc 07, PE, PF/PG/PI e ~420 cartões antigos.
- Esta é a terceira: 5 leitores em paralelo, somente leitura, sobre o CÓDIGO real da V3 (o doc é de agosto) comparado por comportamento com a V2: envio, realtime, filtros/lista, dados do contato/mídia, inventário/testes/achados A1..A10. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_06_2026-10-13_PARTE1..5_*.md`.
- Só viraram cartão as lacunas SEM cartão. Eu conferi no código da V2 e nas migrations os achados P1 mais pesados (arquivar, sussurro, SLA, transferência, prévia de link, banner de falha). Banco real não foi consultado.
- Resultado dos achados A1..A10 do doc: nenhum é lacuna real na V2 (A9 e A10 têm variações menores, cobertas pelos cartões PK-02 e PH-14).

## 2. Cartões (PK-00..PK-30)
P1: PK-01 arquivar com semântica única (hugo) · PK-02 marcar lido em lote honesto (hugo) · PK-03 RPC de transferência para fila (workersql) · PK-04 front da transferência (hugo) · PK-05 política de UPDATE do sussurro (workersql) · PK-06 contador de sussurros (hugo) · PK-07 SLA com várias linhas (hugo) · PK-08 memória da conversa editável (iris) · PK-09 avisos de mensagem nova em qualquer tela (hugo) · PK-21 compositor não trava (hugo) · PK-22 nova conversa pela conexão do contato (hugo) · PK-23 banner de falha por autor/idade (iris) · PK-24 prévia de link no envio (hugo) · PK-25 áudio idempotente (hugo) · PK-26 limites dos buckets (workersql).
P2: PK-10 permissão no clique e aba líder · PK-11 atalho M · PK-12 indicador de Realtime caído · PK-13 merge de UPDATE e colunas · PK-14 filtro type/busca adiada · PK-15 RLS de compras · PK-16 erro de compra e chamadas · PK-17 menções · PK-18 foto na chamada recebida · PK-19 ADR/inventário/jornada · PK-20 testes · PK-27 progresso de upload · PK-28 citação em mídia e fila entre abas · PK-29 código morto · PK-30 testes do envio · PK-00 documentação.

## 3. Decisões adotadas (o Joaquim pode vetar)
1. Arquivar = `conversation_status='archived'` sem tocar `assigned_to` (a decisão de 06/10 #241 de zerar o responsável produz o defeito da aba Arquivadas).
2. Avisos de mensagem nova só para conversa própria/sem dono; supervisor com opção.
3. Memória da conversa: edição manual, sem IA nesta etapa.
4. Transferir para fila zera o responsável e usa compare-and-set opcional.
Sem cartão por falta de decisão do dono: permissões de visibilidade por canal (`inbox.view_*`), videochamada SIP (depende do tronco), transferir entre departamentos.

## 4. Dependências
PK-04 depois de PK-03; PK-06 depois de PK-05; PK-29 depois de PK-24. Vários tocam os mesmos arquivos de PH-xx de `paridade-hooks06`: cada corpo manda conferir o quadro.

## 5. Validação final
Relato com a linha de resultado dos testes, `zapp-verify . --rapido` verde, prova no banco local com papéis reais nos cartões de migration (PK-03/05/15/26); eu confiro a integração na `dia`. Nada vai para produção sem autorização. Integrador hoje parado por base vermelha (carga): ver `fabrica-sobrecarga-13-10`.
