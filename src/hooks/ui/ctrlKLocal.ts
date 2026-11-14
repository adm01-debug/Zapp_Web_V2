/**
 * Marca a tela que trata o Ctrl/Cmd+K sozinha (ex.: a Ajuda do Talk X foca a
 * propria busca). Enquanto um elemento com este atributo estiver montado, o
 * atalho global da paleta (`global-search`) cede o K.
 */
export const CTRL_K_LOCAL_ATTRIBUTE = 'data-ctrl-k-local';
