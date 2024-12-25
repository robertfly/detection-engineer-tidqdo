/**
 * Enhanced WebSocket Context Provider for real-time communication
 * Implements secure WebSocket connections, event handling, and performance monitoring
 * @version 1.0.0
 */

import { 
  createContext, 
  useContext, 
  useEffect, 
  useCallback, 
  ReactNode 
} from 'react'; // v18.2.0

// Internal imports
import { WebSocketManager } from '../services/websocket/manager';
import { 
  WebSocketEventType,
  WebSocketEvent,
  WebSocketMetrics,
  WebSocketHealth
} from '../services/websocket/events';
import { useAuth } from '../hooks/useAuth';

// Interface for WebSocket context value
interface WebSocketContextValue {
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (event: WebSocketEvent) => Promise<boolean>;
  metrics: WebSocketMetrics;
  health: WebSocketHealth;
}

// Create context with default values
const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  connect: async () => { throw new Error('WebSocketContext not initialized'); },
  disconnect: () => { throw new Error('WebSocketContext not initialized'); },
  sendMessage: async () => { throw new Error('WebSocketContext not initialized'); },
  metrics: {
    processingTime: 0,
    memoryUsage: 0,
    errorCount: 0,
    lastProcessedEvent: '',
    successRate: 100
  },
  health: {
    status: 'disconnected',
    lastHeartbeat: null,
    reconnectAttempts: 0
  }
});

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * Enhanced WebSocket Provider Component
 * Manages WebSocket connections, event handling, and monitoring
 */
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { isAuthenticated, getAuthToken } = useAuth();
  const wsManager = new WebSocketManager();

  /**
   * Establishes secure WebSocket connection with authentication
   */
  const connect = useCallback(async () => {
    try {
      if (!isAuthenticated) {
        throw new Error('Authentication required for WebSocket connection');
      }

      const token = await getAuthToken();
      await wsManager.connect(token);

    } catch (error) {
      console.error('WebSocket connection error:', error);
      throw error;
    }
  }, [isAuthenticated, getAuthToken]);

  /**
   * Safely disconnects WebSocket connection with cleanup
   */
  const disconnect = useCallback(() => {
    try {
      wsManager.disconnect();
    } catch (error) {
      console.error('WebSocket disconnect error:', error);
    }
  }, []);

  /**
   * Sends message through WebSocket with monitoring
   */
  const sendMessage = useCallback(async (event: WebSocketEvent): Promise<boolean> => {
    try {
      return await wsManager.sendMessage(event);
    } catch (error) {
      console.error('WebSocket send error:', error);
      return false;
    }
  }, []);

  /**
   * Manages WebSocket lifecycle based on authentication state
   */
  useEffect(() => {
    let mounted = true;

    const handleConnection = async () => {
      if (mounted && isAuthenticated) {
        try {
          await connect();
        } catch (error) {
          console.error('WebSocket auto-connect error:', error);
        }
      }
    };

    handleConnection();

    // Cleanup on unmount or auth state change
    return () => {
      mounted = false;
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  /**
   * Monitors WebSocket health and metrics
   */
  useEffect(() => {
    const healthCheck = setInterval(() => {
      wsManager.monitorHealth();
    }, 30000); // 30 second interval

    return () => {
      clearInterval(healthCheck);
    };
  }, []);

  const contextValue: WebSocketContextValue = {
    isConnected: wsManager.isConnected,
    connect,
    disconnect,
    sendMessage,
    metrics: wsManager.getMetrics(),
    health: wsManager.getHealth()
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

/**
 * Custom hook for accessing WebSocket context with validation
 */
export const useWebSocket = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error(
      'useWebSocket must be used within a WebSocketProvider. ' +
      'Please ensure your component is wrapped with WebSocketProvider.'
    );
  }
  
  return context;
};

// Export context for direct usage if needed
export { WebSocketContext };