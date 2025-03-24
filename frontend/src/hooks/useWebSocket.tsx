// hooks/useWebSocket.ts
import { useEffect, useState } from 'react';

const useWebSocket = (url: string | undefined) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    setSocket(ws);

    ws.onopen = () => console.log("Connected to server");
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data).progress;
      const progress = Math.floor((data.current / data.total) * 100);
      console.log(`Progress: ${progress}%`);
    };
    ws.onerror = (e) => console.error('WebSocket error:', e);
    ws.onclose = (e) => {
      console.log(e.wasClean ? 'WebSocket closed cleanly' : 'WebSocket closed unexpectedly');
    };

    return () => {
      ws.close();
    };
  }, [url]);

  const sendMessage = (message: object) => {
    if (socket) {
      socket.send(JSON.stringify(message));
    }
  };

  return { socket, sendMessage };
};

export default useWebSocket;
