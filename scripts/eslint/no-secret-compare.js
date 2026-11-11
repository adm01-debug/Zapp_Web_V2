/**
 * Z012 — proíbe comparação direta (===|!==) de identificadores que aludam a credenciais.
 * Requer timingSafeStringEqual (_shared/cron-secret-auth.ts) em vez de === direto.
 *
 * Pega: `token !== serviceRole`, `key === expected`, `key !== serviceRole`, etc.
 * Não pega: literais, expressões sem nome legível, os modificadores de teclado/mouse
 * do DOM (ctrlKey/shiftKey/altKey/metaKey, sempre booleanos) e `.key` lido de um
 * objeto de EVENTO (`e.key`, `event.key`, `evt.key`, `keyboardEvent.key`,
 * `e.nativeEvent.key`) — KeyboardEvent.key é a tecla, nunca credencial.
 * Um `key` solto ou de outro objeto (`row.key`, `flag.key`) continua sendo pego.
 */
const CREDENTIAL_RE = /secret|token|key|password/i;

// Propriedades de MouseEvent/KeyboardEvent que casam com /key/i e são sempre booleanas.
const MODIFICADORES_DOM = new Set(['ctrlKey', 'shiftKey', 'altKey', 'metaKey']);

// Nome de objeto que é evento do DOM/React: e, ev, evt, event, *Event (keyboardEvent, nativeEvent...).
const NOME_DE_EVENTO = /^(?:e|ev|evt|event|[A-Za-z]*Event)$/;

function nameOf(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') return node.property.name;
  return null;
}

/** `<evento>.key` (não computado), com <evento> = identificador ou `x.nativeEvent`. */
function ehTeclaDeEvento(node) {
  if (node.type !== 'MemberExpression' || node.computed) return false;
  if (node.property?.type !== 'Identifier' || node.property.name !== 'key') return false;
  const objeto = node.object;
  const nomeObjeto =
    objeto.type === 'Identifier'
      ? objeto.name
      : objeto.type === 'MemberExpression' && !objeto.computed && objeto.property?.type === 'Identifier'
        ? objeto.property.name
        : null;
  return !!nomeObjeto && NOME_DE_EVENTO.test(nomeObjeto);
}

function credencialEm(node) {
  const name = nameOf(node);
  if (!name || !CREDENTIAL_RE.test(name)) return null;
  if (MODIFICADORES_DOM.has(name)) return null;
  if (ehTeclaDeEvento(node)) return null;
  return name;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Proíbe comparação de variáveis de credencial; use timingSafeStringEqual.' },
    messages: {
      noSecretCompare: 'Comparação direta de credencial "{{name}}": use timingSafeStringEqual(_shared/cron-secret-auth.ts).',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator !== '===' && node.operator !== '!==') return;
        const leftName = credencialEm(node.left);
        const rightName = credencialEm(node.right);
        if (leftName) {
          context.report({ node, messageId: 'noSecretCompare', data: { name: leftName } });
        } else if (rightName) {
          context.report({ node, messageId: 'noSecretCompare', data: { name: rightName } });
        }
      },
    };
  },
};
