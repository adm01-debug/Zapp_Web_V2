# Paridade V3 → V2: documento 02-features-batch1 (12/10/2026)

Documento auditado: `Zapp_Web_V3/docs/estado/02-features-batch1.md`, com 7 módulos e cerca de 3.100 linhas:
- `business-logic`: A/B de campanha, envio de catálogo e pipeline;
- `dashboard`: indicadores diários, widgets, metas, ranking e sala de crise;
- `email`: modelos de e-mail;
- `emojis`;
- `integrations`: credenciais da Evolution;
- `queues`: regras de roteamento.

Código V2: branch viva `.integrador`.

## Método

Busquei cada tabela, hook e componente por nome no código, nas migrations e nas Edge Functions da V2. Depois procurei cada **função** por comportamento, porque a V2 costuma ter o equivalente com outro nome. Também cruzei as telas que só existem na V3 com a reconciliação, para pegar o que tinha escapado da primeira passada.

## Lacunas, com cartão criado e delegado (faixa N)

| Cartões | Lacuna |
|---|---|
| ET1 (workersql), ET2 (hugo), ET3 (iris) | **Não existem modelos de e-mail na V2.** Não há tabela, tela nem uso, embora a caixa de e-mail tenha resposta. Os cartões criam a tabela com RLS (meus e compartilhados), o hook com variáveis ({{nome}}, {{empresa}}, {{atendente}}), o gerenciador e o botão "Modelos" na resposta. |
| RR1 (workersql), RR2 (iris) | **As regras de roteamento não são executadas.** A tela da V2 grava as regras e avisa "Regras registradas sem executor" (R2-API-065). A V3 roteava por palavra-chave, etiqueta, departamento e horário. Os cartões validam a condição por tipo, aplicam as regras na entrada da conversa e trocam o JSON livre por campos próprios. |

## Conferido: equivalente ou decidido

- **Teste A/B de campanhas:** as campanhas da V2 são o Talk X, que já tem variantes A/B de modelo (migration `talkx_template_variants_ab`) e plano próprio.
- **Envio de catálogo:** equivalente (`SendProductDialog`, `sendProductUtils`).
- **Pipeline de vendas:** decisão da fusão Quadro → Tarefas; os negócios são tratados no CRM360 do contato.
- **Indicadores diários (`evolution_daily_metrics`):** view da infraestrutura da V3; o painel da V2 tem os próprios indicadores.
- **Widgets, metas, ranking e sala de crise:** equivalentes (`WidgetConfigSheet`, `GoalsConfigDialog`, `AchievementsSystem`/`agent_stats`, `WarRoom`). Os valores fixos em zero que a V3 tinha não existem na V2.
- **Emojis personalizados:** equivalente (`useCustomEmojis`: envio, favorito, categoria, contador e exclusão).
- **Credenciais da Evolution:** a V2 guarda por departamento (`DepartmentWhatsAppView`). Esse painel fica acessível pelo cartão DP2.

## Totais da frente

- 194 cartões.
- Reconciliação com 158 achados: 114 com cartão e 44 descartados com motivo.
