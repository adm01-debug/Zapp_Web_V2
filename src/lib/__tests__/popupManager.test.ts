import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openChatPopup,
  isPopupOpen,
  closePopup,
  closeAllPopups,
} from '@/lib/popupManager';

// ── helpers ───────────────────────────────────────────────────────────────────

type FakePopup = {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  document: { title: string };
};

function makeFakePopup(closed = false): FakePopup {
  return {
    closed,
    focus: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    document: { title: '' },
  };
}

let openSpy: ReturnType<typeof vi.fn>;
let defaultPopup: FakePopup;

beforeEach(() => {
  // Reset module singleton by closing all tracked popups
  closeAllPopups();
  // Provide a fresh default popup for most tests
  defaultPopup = makeFakePopup(false);
  openSpy = vi.fn().mockReturnValue(defaultPopup);
  vi.stubGlobal('open', openSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── openChatPopup ─────────────────────────────────────────────────────────────

describe('openChatPopup — window.open call', () => {
  it('calls window.open with the correct URL path', () => {
    openChatPopup('c1', 'Alice');
    const [url] = openSpy.mock.calls[0];
    expect(url).toBe('/chat-popup/c1');
  });

  it('calls window.open with a target name derived from contactId', () => {
    openChatPopup('c1', 'Alice');
    const [, target] = openSpy.mock.calls[0];
    expect(target).toBe('chat_popup_c1');
  });

  it('passes a features string containing width and height', () => {
    openChatPopup('c1', 'Alice');
    const [, , features] = openSpy.mock.calls[0];
    expect(features).toContain('width=420');
    expect(features).toContain('height=650');
  });

  it('returns the popup window returned by window.open', () => {
    const result = openChatPopup('c1', 'Alice');
    expect(result).toBe(defaultPopup);
  });

  it('returns null when window.open returns null', () => {
    openSpy.mockReturnValue(null);
    const result = openChatPopup('c1', 'Alice');
    expect(result).toBeNull();
  });

  it('returns falsy when window.open returns undefined (popup blocked)', () => {
    openSpy.mockReturnValue(undefined);
    const result = openChatPopup('c1', 'Alice');
    expect(result).toBeFalsy();
  });
});

describe('openChatPopup — load event listener', () => {
  it('attaches a load listener on the popup', () => {
    openChatPopup('c1', 'Alice');
    expect(defaultPopup.addEventListener).toHaveBeenCalledWith(
      'load',
      expect.any(Function)
    );
  });

  it('sets document.title when the load listener fires', () => {
    openChatPopup('c1', 'Bob');
    const [, loadFn] = defaultPopup.addEventListener.mock.calls[0];
    loadFn(); // simulate load event
    expect(defaultPopup.document.title).toBe('Chat — Bob');
  });

  it('does not throw when document.title access fails (cross-origin guard)', () => {
    openChatPopup('c1', 'Alice');
    const [, loadFn] = defaultPopup.addEventListener.mock.calls[0];
    Object.defineProperty(defaultPopup, 'document', {
      get() { throw new Error('cross-origin'); },
      configurable: true,
    });
    expect(() => loadFn()).not.toThrow();
  });
});

describe('openChatPopup — duplicate / focus behaviour', () => {
  it('focuses an already-open popup instead of calling window.open again', () => {
    openChatPopup('c1', 'Alice');
    openChatPopup('c1', 'Alice');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(defaultPopup.focus).toHaveBeenCalledTimes(1);
  });

  it('returns the existing popup when it is already open', () => {
    const first = openChatPopup('c1', 'Alice');
    const second = openChatPopup('c1', 'Alice');
    expect(second).toBe(first);
  });

  it('opens a new popup if the existing one was closed externally', () => {
    openChatPopup('c1', 'Alice');
    defaultPopup.closed = true;

    const newPopup = makeFakePopup(false);
    openSpy.mockReturnValue(newPopup);
    const result = openChatPopup('c1', 'Alice');

    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(result).toBe(newPopup);
  });

  it('tracks multiple contacts independently', () => {
    const p1 = makeFakePopup();
    const p2 = makeFakePopup();
    openSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2);

    openChatPopup('c1', 'Alice');
    openChatPopup('c2', 'Bob');

    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(isPopupOpen('c1')).toBe(true);
    expect(isPopupOpen('c2')).toBe(true);
  });
});

// ── isPopupOpen ───────────────────────────────────────────────────────────────

describe('isPopupOpen', () => {
  it('returns false when no popup has been opened for the given contactId', () => {
    expect(isPopupOpen('unknown')).toBe(false);
  });

  it('returns true after openChatPopup succeeds', () => {
    openChatPopup('c1', 'Alice');
    expect(isPopupOpen('c1')).toBe(true);
  });

  it('returns false when the tracked popup has been closed externally', () => {
    openChatPopup('c1', 'Alice');
    defaultPopup.closed = true;
    expect(isPopupOpen('c1')).toBe(false);
  });

  it('returns false after closePopup is called', () => {
    openChatPopup('c1', 'Alice');
    closePopup('c1');
    expect(isPopupOpen('c1')).toBe(false);
  });

  it('returns false when window.open returned null (popup blocked)', () => {
    openSpy.mockReturnValue(null);
    openChatPopup('c1', 'Alice');
    expect(isPopupOpen('c1')).toBe(false);
  });
});

// ── closePopup ────────────────────────────────────────────────────────────────

describe('closePopup', () => {
  it('calls close() on the open popup', () => {
    openChatPopup('c1', 'Alice');
    closePopup('c1');
    expect(defaultPopup.close).toHaveBeenCalledTimes(1);
  });

  it('removes the popup from tracking after closing', () => {
    openChatPopup('c1', 'Alice');
    closePopup('c1');
    expect(isPopupOpen('c1')).toBe(false);
  });

  it('does not call close() when the popup is already closed', () => {
    openChatPopup('c1', 'Alice');
    defaultPopup.closed = true;
    closePopup('c1');
    expect(defaultPopup.close).not.toHaveBeenCalled();
  });

  it('still removes already-closed popup from tracking', () => {
    openChatPopup('c1', 'Alice');
    defaultPopup.closed = true;
    closePopup('c1');
    expect(isPopupOpen('c1')).toBe(false);
  });

  it('does not throw when contactId is not tracked', () => {
    expect(() => closePopup('not-tracked')).not.toThrow();
  });

  it('only closes the targeted contact, leaving others open', () => {
    const p2 = makeFakePopup();
    openSpy.mockReturnValueOnce(defaultPopup).mockReturnValueOnce(p2);
    openChatPopup('c1', 'Alice');
    openChatPopup('c2', 'Bob');

    closePopup('c1');

    expect(isPopupOpen('c1')).toBe(false);
    expect(isPopupOpen('c2')).toBe(true);
    expect(p2.close).not.toHaveBeenCalled();
  });
});

// ── closeAllPopups ────────────────────────────────────────────────────────────

describe('closeAllPopups', () => {
  it('calls close() on every open popup', () => {
    const p1 = makeFakePopup();
    const p2 = makeFakePopup();
    openSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2);
    openChatPopup('c1', 'Alice');
    openChatPopup('c2', 'Bob');

    closeAllPopups();

    expect(p1.close).toHaveBeenCalledTimes(1);
    expect(p2.close).toHaveBeenCalledTimes(1);
  });

  it('makes isPopupOpen return false for all contacts afterwards', () => {
    const p1 = makeFakePopup();
    const p2 = makeFakePopup();
    openSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2);
    openChatPopup('c1', 'Alice');
    openChatPopup('c2', 'Bob');

    closeAllPopups();

    expect(isPopupOpen('c1')).toBe(false);
    expect(isPopupOpen('c2')).toBe(false);
  });

  it('skips calling close() on already-closed popups', () => {
    openChatPopup('c1', 'Alice');
    defaultPopup.closed = true;
    closeAllPopups();
    expect(defaultPopup.close).not.toHaveBeenCalled();
  });

  it('does not throw when no popups are tracked', () => {
    expect(() => closeAllPopups()).not.toThrow();
  });

  it('allows new popups to be tracked after clearing all', () => {
    openChatPopup('c1', 'Alice');
    closeAllPopups();

    const fresh = makeFakePopup();
    openSpy.mockReturnValue(fresh);
    openChatPopup('c1', 'Alice');

    expect(isPopupOpen('c1')).toBe(true);
  });
});
