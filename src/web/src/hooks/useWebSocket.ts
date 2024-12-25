// React v18.2.0
// TypeScript v5.0+

import { useState, useEffect, useCallback } from 'react';
import { WebSocketManager } from '../services/websocket/manager';
import { 
    WebSocketEvent, 
    WebSocketEventType,
    EventPriority,
    ErrorCode 
} from '../services/websocket/events';

/**
 * Connection quality levels based on metrics
 */
export enum ConnectionQuality {
    EXCELLENT = 'excellent',
    GOOD = 'good',
    POOR = 'poor',
    DISCONNECTED = 'disconnected'
}

/**
 * WebSocket error interface
 */
interface WebSocketError {
    code: ErrorCode;
    message: string;
    timestamp: string;
    retryable: boolean;
}

/**
 * WebSocket metrics interface
 */
interface WebSocketMetrics {
    latency: number;
    messageCount: number;
    errorCount: number;
    reconnectCount: number;
    lastHeartbeat: number;
    successRate: number;
}

/**
 * WebSocket hook options interface
 */
interface UseWebSocketOptions {
    autoReconnect?: boolean;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    onMessage?: (event: WebSocketEvent) => void;
    onError?: (error: WebSocketError) => void;
    onConnectionChange?: (connected: boolean) => void;
}

/**
 * Advanced React hook for managing secure WebSocket connections with monitoring
 * and error recovery capabilities.
 * 
 * @param token - Authentication token for WebSocket connection
 * @param options - Configuration options for WebSocket behavior
 * @returns WebSocket connection state and control methods
 */
export const useWebSocket = (
    token: string,
    options: UseWebSocketOptions = {}
) => {
    // Initialize WebSocket manager instance
    const [wsManager] = useState(() => new WebSocketManager());
    
    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<WebSocketError | null>(null);
    const [metrics, setMetrics] = useState<WebSocketMetrics>({
        latency: 0,
        messageCount: 0,
        errorCount: 0,
        reconnectCount: 0,
        lastHeartbeat: 0,
        successRate: 100
    });

    /**
     * Calculates connection quality based on current metrics
     */
    const calculateConnectionQuality = useCallback((): ConnectionQuality => {
        if (!isConnected) return ConnectionQuality.DISCONNECTED;
        
        const { latency, successRate, errorCount } = metrics;
        
        if (latency < 100 && successRate > 98 && errorCount === 0) {
            return ConnectionQuality.EXCELLENT;
        } else if (latency < 300 && successRate > 95) {
            return ConnectionQuality.GOOD;
        }
        return ConnectionQuality.POOR;
    }, [isConnected, metrics]);

    /**
     * Establishes WebSocket connection with error handling
     */
    const connect = useCallback(async () => {
        try {
            await wsManager.connect(token);
            setIsConnected(true);
            setError(null);
            options.onConnectionChange?.(true);
        } catch (err) {
            const wsError: WebSocketError = {
                code: ErrorCode.SYSTEM_ERROR,
                message: err instanceof Error ? err.message : 'Connection failed',
                timestamp: new Date().toISOString(),
                retryable: true
            };
            setError(wsError);
            options.onError?.(wsError);
        }
    }, [token, wsManager, options]);

    /**
     * Gracefully disconnects WebSocket connection
     */
    const disconnect = useCallback(() => {
        wsManager.disconnect();
        setIsConnected(false);
        options.onConnectionChange?.(false);
    }, [wsManager, options]);

    /**
     * Sends encrypted message through WebSocket connection
     */
    const sendMessage = useCallback(async (
        type: WebSocketEventType,
        payload: any,
        priority: EventPriority = EventPriority.MEDIUM
    ) => {
        try {
            const message: WebSocketEvent = {
                type,
                payload,
                version: '1.0',
                priority
            };
            
            await wsManager.sendMessage(message);
            return true;
        } catch (err) {
            const wsError: WebSocketError = {
                code: ErrorCode.PROCESSING_ERROR,
                message: err instanceof Error ? err.message : 'Send failed',
                timestamp: new Date().toISOString(),
                retryable: true
            };
            setError(wsError);
            options.onError?.(wsError);
            return false;
        }
    }, [wsManager, options]);

    /**
     * Updates metrics state with latest WebSocket metrics
     */
    const updateMetrics = useCallback(() => {
        const currentMetrics = wsManager.getMetrics();
        setMetrics(currentMetrics);
    }, [wsManager]);

    // Set up WebSocket event listeners and monitoring
    useEffect(() => {
        const metricsInterval = setInterval(updateMetrics, 5000);
        
        // Attempt initial connection
        if (options.autoReconnect !== false) {
            connect();
        }

        // Cleanup on unmount
        return () => {
            clearInterval(metricsInterval);
            disconnect();
        };
    }, [connect, disconnect, updateMetrics, options.autoReconnect]);

    return {
        isConnected,
        error,
        metrics,
        connect,
        disconnect,
        sendMessage,
        connectionQuality: calculateConnectionQuality()
    };
};

export type UseWebSocketReturn = ReturnType<typeof useWebSocket>;