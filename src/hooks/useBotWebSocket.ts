import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MCCProcessStatus,
  ChatMessageLog,
  PlayerPosition,
  WSMessageFromClient,
  WSMessageFromServer,
  AccountSummary,
  AccountProfile,
  CommandShortcut,
} from '../types';
import { getAuthToken, setAuthToken, authQueryString, authHeaders } from '../lib/auth';

export interface LoginScriptInfo {
  name: string;
  content: string;
}

export function useBotWebSocket() {
  const [wsConnected, setWsConnected] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const activeAccountIdRef = useRef<string>('');
  const [scripts, setScripts] = useState<LoginScriptInfo[]>([]);

  const [mccStatus, setMccStatus] = useState<MCCProcessStatus>({
    running: false,
    pid: null,
    uptimeSeconds: 0,
    serverHost: '-',
    serverPort: 25565,
    username: '-',
    accountType: 'mojang',
    minecraftVersion: 'auto',
  });

  const [logs, setLogs] = useState<ChatMessageLog[]>([]);
  const [iniContent, setIniContent] = useState<string>('');
  const [parsedIni, setParsedIni] = useState<Record<string, any>>({});
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);
  const [autoRelog, setAutoRelogState] = useState(false);
  const [shortcuts, setShortcuts] = useState<{ global: CommandShortcut[]; local: CommandShortcut[] }>({
    global: [],
    local: [],
  });

  const wsRef = useRef<WebSocket | null>(null);

  // Keep ref updated
  useEffect(() => {
    activeAccountIdRef.current = activeAccountId;
  }, [activeAccountId]);

  useEffect(() => {
    let isComponentMounted = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    // Fetch available login scripts for bot creation
    fetch('/api/scripts', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.scripts) && isComponentMounted) {
          setScripts(data.scripts);
        }
      })
      .catch(() => {});

    // Check whether the server requires an AUTH_TOKEN; if so ask the user once
    // and remember it before opening the WebSocket.
    function ensureAuthReady(cb: () => void) {
      fetch('/api/health')
        .then((res) => res.json())
        .then((data) => {
          if (isComponentMounted && data && data.authRequired && !getAuthToken()) {
            const token = window.prompt('Server yêu cầu AUTH_TOKEN. Nhập token để tiếp tục:');
            if (token) setAuthToken(token.trim());
            else setAuthToken('');
          }
          cb();
        })
        .catch(() => cb());
    }

    function connectWs() {
      if (!isComponentMounted) return;

      const socket = new WebSocket(wsUrl + authQueryString());
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isComponentMounted) {
          socket.close();
          return;
        }
        setWsConnected(true);
        send({ type: 'GET_SHORTCUTS' });
      };

      socket.onmessage = (event) => {
        if (!isComponentMounted) return;
        try {
          const message: WSMessageFromServer = JSON.parse(event.data);
          switch (message.type) {
            case 'ACCOUNTS_LIST':
              setAccounts(message.accounts);
              if (message.activeAccountId) {
                setActiveAccountId(message.activeAccountId);
                activeAccountIdRef.current = message.activeAccountId;
              }
              break;
            case 'MCC_STATUS':
              if (!message.accountId || message.accountId === activeAccountIdRef.current) {
                setMccStatus(message.status);
                if (typeof message.status.autoRelog === 'boolean') setAutoRelogState(message.status.autoRelog);
              }
              // Update running state in accounts summary list
              if (message.accountId) {
                setAccounts((prev) =>
                  prev.map((acc) =>
                    acc.id === message.accountId
                      ? {
                          ...acc,
                          running: message.status.running,
                          pid: message.status.pid,
                          uptimeSeconds: message.status.uptimeSeconds,
                          serverHost: message.status.serverHost,
                          serverPort: message.status.serverPort,
                          username: message.status.username,
                          autoRelog: message.status.autoRelog,
                        }
                      : acc
                  )
                );
              }
              break;
            case 'LOG_MESSAGE':
              if (!message.accountId || message.accountId === activeAccountIdRef.current) {
                setLogs((prev) => [...prev.slice(-999), message.log]);
              }
              break;
            case 'INI_CONTENT':
              if (!message.accountId || message.accountId === activeAccountIdRef.current) {
                setIniContent(message.content);
                if (message.parsed) setParsedIni(message.parsed);
              }
              break;
            case 'POSITION_UPDATE':
              if (!message.accountId || message.accountId === activeAccountIdRef.current) {
                setPlayerPosition(message.position);
              }
              break;
            case 'SHORTCUTS_LIST':
              if (!message.accountId || message.accountId === activeAccountIdRef.current) {
                setShortcuts({ global: message.global, local: message.local });
              }
              break;
          }
        } catch (e) {
          console.error('WS client parse error:', e);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        if (isComponentMounted) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    ensureAuthReady(() => {
      if (isComponentMounted) connectWs();
    });

    return () => {
      isComponentMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const send = useCallback((msg: WSMessageFromClient) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const selectAccount = useCallback(
    (accountId: string) => {
      setActiveAccountId(accountId);
      activeAccountIdRef.current = accountId;
      setLogs([]); // Clear logs when switching views
      send({ type: 'SELECT_ACCOUNT', accountId });
      send({ type: 'GET_SHORTCUTS' });
    },
    [send]
  );

  const addAccount = useCallback(
    (profile: Omit<AccountProfile, 'id'>) => {
      send({ type: 'ADD_ACCOUNT', profile });
    },
    [send]
  );

  const updateAccount = useCallback(
    (accountId: string, profile: Partial<AccountProfile>) => {
      send({ type: 'UPDATE_ACCOUNT', accountId, profile });
    },
    [send]
  );

  const deleteAccount = useCallback(
    (accountId: string) => {
      send({ type: 'DELETE_ACCOUNT', accountId });
    },
    [send]
  );

  const startMCC = useCallback(() => {
    send({ type: 'START_MCC', accountId: activeAccountIdRef.current });
  }, [send]);

  const startMccFor = useCallback(
    (accountId: string) => {
      send({ type: 'START_MCC', accountId });
    },
    [send]
  );

  const stopMccFor = useCallback(
    (accountId: string) => {
      send({ type: 'STOP_MCC', accountId });
    },
    [send]
  );

  const setAutoRelogFor = useCallback(
    (accountId: string, enabled: boolean) => {
      send({ type: 'SET_AUTORELOG', enabled, accountId });
    },
    [send]
  );

  const stopMCC = useCallback(() => {
    send({ type: 'STOP_MCC', accountId: activeAccountIdRef.current });
  }, [send]);

  const restartMCC = useCallback(() => {
    send({ type: 'RESTART_MCC', accountId: activeAccountIdRef.current });
  }, [send]);

  const sendCommand = useCallback(
    (command: string) => {
      send({ type: 'SEND_COMMAND', command, accountId: activeAccountIdRef.current });
    },
    [send]
  );

  const sendChat = useCallback(
    (message: string) => {
      send({ type: 'SEND_CHAT', message, accountId: activeAccountIdRef.current });
    },
    [send]
  );

  /** Gửi cùng 1 lệnh cho nhiều bot, giãn cách staggerMs giữa các bot để tránh kick rate-limit */
  const broadcastCommand = useCallback(
    (accountIds: string[], command: string, staggerMs = 5000) => {
      send({ type: 'BROADCAST_COMMAND', command, accountIds, staggerMs });
    },
    [send]
  );

  const broadcastStart = useCallback(
    (accountIds: string[], staggerMs = 5000) => {
      send({ type: 'BROADCAST_START', accountIds, staggerMs });
    },
    [send]
  );

  const broadcastStop = useCallback(
    (accountIds: string[]) => {
      send({ type: 'BROADCAST_STOP', accountIds });
    },
    [send]
  );

  const saveIni = useCallback(
    (content: string) => {
      send({ type: 'SAVE_INI', content, accountId: activeAccountIdRef.current });
    },
    [send]
  );

  const autoFixIni = useCallback(() => {
    send({ type: 'AUTO_FIX_INI', accountId: activeAccountIdRef.current });
  }, [send]);

  const enableSilentMode = useCallback(() => {
    send({ type: 'ENABLE_SILENT_MODE', accountId: activeAccountIdRef.current });
  }, [send]);

  const setAutoRelog = useCallback(
    (enabled: boolean) => {
      send({ type: 'SET_AUTORELOG', enabled, accountId: activeAccountIdRef.current });
    },
    [send]
  );

  const updateServerAccount = useCallback(
    (
      host: string,
      port: number,
      username: string,
      password?: string,
      accountType: string = 'mojang',
      minecraftVersion?: string
    ) => {
      send({
        type: 'UPDATE_SERVER_ACCOUNT',
        host,
        port,
        username,
        password,
        accountType,
        minecraftVersion,
        accountId: activeAccountIdRef.current,
      });
    },
    [send]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const addShortcut = useCallback(
    (scope: 'global' | 'local', label: string, command: string) => {
      if (scope === 'global') {
        send({ type: 'ADD_SHORTCUT', scope, label, command });
      } else {
        send({ type: 'ADD_SHORTCUT', scope, accountId: activeAccountIdRef.current, label, command });
      }
    },
    [send]
  );

  const deleteShortcut = useCallback(
    (scope: 'global' | 'local', shortcutId: string) => {
      if (scope === 'global') {
        send({ type: 'DELETE_SHORTCUT', scope, shortcutId });
      } else {
        send({ type: 'DELETE_SHORTCUT', scope, accountId: activeAccountIdRef.current, shortcutId });
      }
    },
    [send]
  );

  return {
    wsConnected,
    accounts,
    activeAccountId,
    scripts,
    selectAccount,
    addAccount,
    updateAccount,
    deleteAccount,
    mccStatus,
    logs,
    iniContent,
    parsedIni,
    playerPosition,
    startMCC,
    stopMCC,
    restartMCC,
    startMccFor,
    stopMccFor,
    setAutoRelogFor,
    sendCommand,
    sendChat,
    broadcastCommand,
    broadcastStart,
    broadcastStop,
    saveIni,
    autoFixIni,
    enableSilentMode,
    setAutoRelog,
    autoRelog,
    updateServerAccount,
    clearLogs,
    shortcuts,
    addShortcut,
    deleteShortcut,
  };
}

