/**
 * T33: o painel de VoIP virou a view de Telefonia (`TelefoniaView`), que agora
 * e o shell da tela (header, filtros, KPIs e historico entram nas etapas seguintes).
 *
 * Este arquivo fica como ALIAS de proposito: `CallSessionProvider`, `ViewRouter`
 * e `lazyViews` importam `VoIPPanel` e nao precisam mudar por causa do shell.
 */
export { TelefoniaView as VoIPPanel } from './TelefoniaView';
