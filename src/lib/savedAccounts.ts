export type SavedAccountType = 'offline' | 'mojang' | 'microsoft' | 'yggdrasil';

export interface SavedAccount {
  id: string;
  username: string;
  password: string;
  accountType: SavedAccountType;
}

const STORAGE_KEY = 'mcc_saved_accounts';

export function loadSavedAccounts(): SavedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is SavedAccount =>
        a && typeof a.username === 'string' && typeof a.accountType === 'string'
    );
  } catch {
    return [];
  }
}

function persist(accounts: SavedAccount[]): SavedAccount[] {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    } catch {
      // storage full / unavailable - ignore
    }
  }
  return accounts;
}

export function saveSavedAccount(
  acc: Omit<SavedAccount, 'id'>
): SavedAccount[] {
  const accounts = loadSavedAccounts();
  const existing = accounts.find((a) => a.username === acc.username);
  if (existing) {
    const updated = accounts.map((a) =>
      a.id === existing.id ? { ...a, ...acc } : a
    );
    return persist(updated);
  }
  return persist([...accounts, { ...acc, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
}

export function deleteSavedAccount(id: string): SavedAccount[] {
  return persist(loadSavedAccounts().filter((a) => a.id !== id));
}

export function resolveAccountCredentials(
  accountType: string,
  password?: string
): { accountType: string; password: string } {
  if (accountType === 'offline') {
    return { accountType: 'mojang', password: '-' };
  }
  const pass = password !== undefined && password.trim() !== '' ? password.trim() : '-';
  return { accountType: accountType || 'mojang', password: pass };
}
