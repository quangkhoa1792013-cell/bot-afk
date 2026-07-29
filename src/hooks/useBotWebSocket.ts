import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MCCProcessStatus,
  ChatMessageLog,
  PlayerPosition,
  WSMessageFromClient,
  WSMessageFromServer,
} from '../types';

export function useBotWebSocket() {
  const [wsConnected, setWsConnected] = useState(false);
  const [mccStatus, setMccStatus] = useState<MCCProcessStatus>({
    running: false,
    pid: null,
    uptimeSeconds: 0,
    serverHost: 'aquamc.vn',
    serverPort: 25565,
    username: 'geasf',
    accountType: 'mojang',
    minecraftVersion: 'auto',
  });

  const [logs, setLogs] = useState<ChatMessageLog[]>([]);
  const [iniContent, setIniContent] = useState<string>('');
  const [parsedIni, setParsedIni] = useState<Record<string, any>>({});
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isComponentMounted = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    function connectWs() {
      if (!isComponentMounted) return;

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isComponentMounted) {
          socket.close();
          return;
        }
        setWsConnected(true);
      };

      socket.onmessage = (event) => {
        if (!isComponentMounted) return;
        try {
          const message: WSMessageFromServer = JSON.parse(event.data);
          switch (message.type) {
            case 'MCC_STATUS':
              setMccStatus(message.status);
              break;
            case 'LOG_MESSAGE':
              setLogs((prev) => [...prev.slice(-999), message.log]);
              break;
            case 'INI_CONTENT':
              setIniContent(message.content);
              if (message.parsed) setParsedIni(message.parsed);
              break;
            case 'POSITION_UPDATE':
              setPlayerPosition(message.position);
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

    connectWs();

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

  const startMCC = useCallback(() => {
    send({ type: 'START_MCC' });
  }, [send]);

  const stopMCC = useCallback(() => {
    send({ type: 'STOP_MCC' });
  }, [send]);

  const restartMCC = useCallback(() => {
    send({ type: 'RESTART_MCC' });
  }, [send]);

  const sendCommand = useCallback((command: string) => {
    send({ type: 'SEND_COMMAND', command });
  }, [send]);

  const sendChat = useCallback((message: string) => {
    send({ type: 'SEND_CHAT', message });
  }, [send]);

  const saveIni = useCallback((content: string) => {
    send({ type: 'SAVE_INI', content });
  }, [send]);

  const autoFixIni = useCallback(() => {
    send({ type: 'AUTO_FIX_INI' });
  }, [send]);

  const enableSilentMode = useCallback(() => {
    send({ type: 'ENABLE_SILENT_MODE' });
  }, [send]);

  const updateServerAccount = useCallback((
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
    });
  }, [send]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    wsConnected,
    mccStatus,
    logs,
    iniContent,
    parsedIni,
    playerPosition,
    startMCC,
    stopMCC,
    restartMCC,
    sendCommand,
    sendChat,
    saveIni,
    autoFixIni,
    enableSilentMode,
    updateServerAccount,
    clearLogs,
  };
}
