export interface AccountProfile {
  id: string;
  name: string;
  username: string;
  password?: string;
  accountType: string;
  serverHost: string;
  serverPort: number;
  minecraftVersion: string;
  method?: string;
  script?: string;
  isDefault?: boolean;
}

export interface AccountSummary {
  id: string;
  name: string;
  username: string;
  serverHost: string;
  serverPort: number;
  accountType: string;
  running: boolean;
  pid: number | null;
  uptimeSeconds: number;
  autoRelog?: boolean;
}

export interface MCCProcessStatus {
  accountId?: string;
  running: boolean;
  pid: number | null;
  uptimeSeconds: number;
  serverHost: string;
  serverPort: number;
  username: string;
  accountType: string;
  minecraftVersion: string;
  lastLog?: string;
  error?: string | null;
  autoRelog?: boolean;
}

export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  dimension?: string;
}

export interface ChatMessageLog {
  id: string;
  timestamp: string;
  text: string;
  ansiHtml?: string;
  type: 'chat' | 'system' | 'action' | 'error' | 'kicked' | 'info' | 'mcc';
  sender?: string;
  accountId?: string;
}

export interface CommandShortcut {
  id: string;
  label: string;
  command: string;
}

export type WSMessageFromClient =
  | { type: 'SELECT_ACCOUNT'; accountId: string }
  | { type: 'ADD_ACCOUNT'; profile: Omit<AccountProfile, 'id'> }
  | { type: 'UPDATE_ACCOUNT'; accountId: string; profile: Partial<AccountProfile> }
  | { type: 'DELETE_ACCOUNT'; accountId: string }
  | { type: 'START_MCC'; accountId?: string }
  | { type: 'STOP_MCC'; accountId?: string }
  | { type: 'RESTART_MCC'; accountId?: string }
  | { type: 'SEND_COMMAND'; command: string; accountId?: string }
  | { type: 'SEND_CHAT'; message: string; accountId?: string }
  | { type: 'BROADCAST_COMMAND'; command: string; accountIds: string[]; staggerMs?: number }
  | { type: 'BROADCAST_START'; accountIds: string[]; staggerMs?: number }
  | { type: 'BROADCAST_STOP'; accountIds: string[] }
  | { type: 'GET_INI'; accountId?: string }
  | { type: 'SAVE_INI'; content: string; accountId?: string }
  | { type: 'UPDATE_SERVER_ACCOUNT'; host: string; port?: number; username: string; password?: string; accountType?: string; method?: string; minecraftVersion?: string; accountId?: string }
  | { type: 'UPDATE_BOT_SETTING'; section: string; key: string; value: any; accountId?: string }
  | { type: 'ENABLE_SILENT_MODE'; accountId?: string }
  | { type: 'SET_AUTORELOG'; enabled: boolean; accountId?: string }
  | { type: 'AUTO_FIX_INI'; accountId?: string }
  | { type: 'UPDATE_MAP_COLORS'; colors: number[]; width?: number; height?: number; accountId?: string }
  | { type: 'GET_SHORTCUTS' }
  | { type: 'ADD_SHORTCUT'; scope: 'global' | 'local'; accountId?: string; label: string; command: string }
  | { type: 'DELETE_SHORTCUT'; scope: 'global' | 'local'; accountId?: string; shortcutId: string };

export type WSMessageFromServer =
  | { type: 'ACCOUNTS_LIST'; accounts: AccountSummary[]; activeAccountId: string }
  | { type: 'MCC_STATUS'; status: MCCProcessStatus; accountId?: string }
  | { type: 'LOG_MESSAGE'; log: ChatMessageLog; accountId?: string }
  | { type: 'INI_CONTENT'; content: string; parsed?: Record<string, any>; accountId?: string }
  | { type: 'POSITION_UPDATE'; position: PlayerPosition; accountId?: string }
  | { type: 'ACTION_RESULT'; success: boolean; message: string }
  | { type: 'SHORTCUTS_LIST'; global: CommandShortcut[]; local: CommandShortcut[]; accountId?: string };

