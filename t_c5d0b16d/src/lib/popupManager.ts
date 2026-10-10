/**
 * Popup Manager — tracks open chat popup windows to avoid duplicates
 * and provides utilities to open/focus/close them.
 */

const openPopups = new Map<string, Window>();

// Clean up closed windows periodically
function cleanClosedPopups() {
  for (const [id, win] of openPopups.entries()) {
    if (win.closed) {
      openPopups.delete(id);
    }
  }
}

export function openChatPopup(contactId: string, contactName: string): Window | null {
  cleanClosedPopups();

  // If already open, focus it
  const existing = openPopups.get(contactId);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }

  const width = 420;
  const height = 650;
  const left = window.screenX + window.outerWidth - width - 40;
  const top = window.screenY + 60;

  const popup = window.open(
    `/chat-popup/${contactId}`,
    `chat_popup_${contactId}`,
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
  );

  if (popup) {
    openPopups.set(contactId, popup);
    // Set title after load
    popup.addEventListener('load', () => {
      try {
        popup.document.title = `Chat — ${contactName}`;
      } catch { /* cross-origin */ }
    });
  }

  return popup;
}

export function isPopupOpen(contactId: string): boolean {
  cleanClosedPopups();
  const win = openPopups.get(contactId);
  return !!win && !win.closed;
}

export function closePopup(contactId: string) {
  const win = openPopups.get(contactId);
  if (win && !win.closed) {
    win.close();
  }
  openPopups.delete(contactId);
}

export function closeAllPopups() {
  for (const [id, win] of openPopups.entries()) {
    if (!win.closed) win.close();
    openPopups.delete(id);
  }
}
