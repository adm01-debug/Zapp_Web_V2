/**
 * Kit A17 — prévia de mensagem do WhatsApp.
 *
 * X088 (V28/V61) moveu a implementação para `../TalkXMessagePreview`: a bolha do
 * cartão e a moldura do editor saem do MESMO renderizador, com formatação do
 * WhatsApp (`*negrito*`, `_itálico_`, `~tachado~`, listas, link), modo `raw` e
 * `resolved`, mídia por tipo, botões/enquete e tela cheia.
 *
 * Este módulo só reexporta — o wizard, a tela Agendada, a galeria e o editor de
 * template seguem importando `WhatsAppBubble`/`PhoneFrame` daqui (e do barrel
 * `talkxShared`) sem mudar uma linha.
 */
export { PhoneFrame, WhatsAppBubble } from '../TalkXMessagePreview';
