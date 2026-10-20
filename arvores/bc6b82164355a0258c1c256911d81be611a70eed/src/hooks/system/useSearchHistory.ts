import { useState, useEffect, useCallback } from 'react';

const HISTORY_KEY = 'global-search-history';
const MAX_HISTORY = 10;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount?: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  const addToHistory = useCallback((query: string, resultCount?: number) => {
    if (!query.trim() || query.length < 2) return;
    
    setHistory((prev) => {
      // Remove duplicates
      const filtered = prev.filter((item) => item.query.toLowerCase() !== query.toLowerCase());
      
      const newHistory = [
        { query: query.trim(), timestamp: Date.now(), resultCount },
        ...filtered,
      ].slice(0, MAX_HISTORY);
      
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.query !== query);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
      return filtered;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
