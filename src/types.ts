export interface MCCProcessStatus {
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
}

export type WSMessageFromClient =
  | { type: 'START_MCC' }
  | { type: 'STOP_MCC' }
  | { type: 'RESTART_MCC' }
  | { type: 'SEND_COMMAND'; command: string }
  | { type: 'SEND_CHAT'; message: string }
  | { type: 'GET_INI' }
  | { type: 'SAVE_INI'; content: string }
  | { type: 'UPDATE_SERVER_ACCOUNT'; host: string; port?: number; username: string; password?: string; accountType?: string; method?: string }
  | { type: 'UPDATE_BOT_SETTING'; section: string; key: string; value: any }
  | { type: 'ENABLE_SILENT_MODE' }
  | { type: 'AUTO_FIX_INI' };

export type WSMessageFromServer =
  | { type: 'MCC_STATUS'; status: MCCProcessStatus }
  | { type: 'LOG_MESSAGE'; log: ChatMessageLog }
  | { type: 'INI_CONTENT'; content: string; parsed?: Record<string, any> }
  | { type: 'POSITION_UPDATE'; position: PlayerPosition }
  | { type: 'ACTION_RESULT'; success: boolean; message: string };
