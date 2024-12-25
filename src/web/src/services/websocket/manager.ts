// TypeScript v5.0+
// events v3.3.0+
// exponential-backoff v3.1.0

import { EventEmitter } from 'events';
import { backOff } from 'exponential-backoff';
import { WebSocketEventType } from './events';
import { handleWebSocketMessage } from './handlers';
import { WEBSOCKET_CONFIG, encryptMessage, getWebSocketUrl } from '../../config/websocket';

/**
 * Interface for WebSocket connection metrics
 */
interface ConnectionMetrics {
    latency: number;
    messageCount: number;
    errorCount: number;
    reconnectCount: number;
    lastHeartbeat: number;
}

/**
 * Manages WebSocket connection lifecycle and message handling with enhanced security and monitoring
 */
export class WebSocketManager {
    private connection: WebSocket | null = null;
    private readonly eventEmitter: EventEmitter;
    private reconnectAttempts: number = 0;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private isConnected: boolean = false;
    private readonly metrics: ConnectionMetrics = {
        latency: 0,
        messageCount: 0,
        errorCount: 0,
        reconnectCount: 0,
        lastHeartbeat: 0
    };
    private readonly messageLatencies: Map<string, number> = new Map();
    private readonly pendingMessages: Set<string> = new Set();

    constructor() {
        this.eventEmitter = new EventEmitter();
        this.setupEventEmitter();
    }

    /**
     * Establishes secure WebSocket connection with authentication and monitoring
     * @param token Authentication token
     */
    public async connect(token: string): Promise<void> {
        try {
            if (this.connection) {
                this.disconnect();
            }

            const clientId = crypto.randomUUID();
            const wsUrl = getWebSocketUrl(token, clientId);
            this.connection = new WebSocket(wsUrl);

            this.setupConnectionHandlers();
            this.startHeartbeat();

            await this.waitForConnection();
            this.isConnected = true;
            this.reconnectAttempts = 0;

        } catch (error) {
            this.metrics.errorCount++;
            throw new Error(`WebSocket connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Closes WebSocket connection gracefully with cleanup
     */
    public disconnect(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (this.connection) {
            this.connection.close(1000, 'Normal closure');
            this.connection = null;
        }

        this.isConnected = false;
        this.pendingMessages.clear();
        this.messageLatencies.clear();
        this.eventEmitter.emit('disconnect');
    }

    /**
     * Sends encrypted message through WebSocket connection with performance tracking
     * @param message Message to send
     * @returns Promise resolving to send success status
     */
    public async sendMessage(message: object): Promise<boolean> {
        if (!this.isConnected || !this.connection) {
            throw new Error('WebSocket not connected');
        }

        try {
            const messageId = crypto.randomUUID();
            const encryptedMessage = encryptMessage({
                id: messageId,
                timestamp: Date.now(),
                data: message
            });

            const startTime = performance.now();
            this.pendingMessages.add(messageId);
            
            this.connection.send(encryptedMessage);
            this.messageLatencies.set(messageId, startTime);
            this.metrics.messageCount++;

            return true;

        } catch (error) {
            this.metrics.errorCount++;
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Attempts to reconnect with exponential backoff strategy
     */
    private async reconnect(): Promise<void> {
        if (this.reconnectAttempts >= WEBSOCKET_CONFIG.reconnectAttempts) {
            throw new Error('Maximum reconnection attempts reached');
        }

        try {
            this.reconnectAttempts++;
            this.metrics.reconnectCount++;

            await backOff(async () => {
                await this.connect(this.getStoredToken());
            }, {
                numOfAttempts: WEBSOCKET_CONFIG.reconnectAttempts,
                startingDelay: WEBSOCKET_CONFIG.reconnectInterval,
                timeMultiple: 2
            });

        } catch (error) {
            this.eventEmitter.emit('error', new Error('Reconnection failed'));
            throw error;
        }
    }

    /**
     * Starts heartbeat mechanism with monitoring
     */
    private startHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.connection) {
                const heartbeatMessage = encryptMessage({
                    type: 'heartbeat',
                    timestamp: Date.now()
                });
                
                this.connection.send(heartbeatMessage);
                this.metrics.lastHeartbeat = Date.now();
            }
        }, WEBSOCKET_CONFIG.heartbeatInterval);
    }

    /**
     * Sets up WebSocket connection event handlers
     */
    private setupConnectionHandlers(): void {
        if (!this.connection) return;

        this.connection.onopen = () => {
            this.eventEmitter.emit('connect');
            this.isConnected = true;
        };

        this.connection.onclose = () => {
            this.isConnected = false;
            this.eventEmitter.emit('disconnect');
            this.attemptReconnection();
        };

        this.connection.onerror = (error) => {
            this.metrics.errorCount++;
            this.eventEmitter.emit('error', error);
        };

        this.connection.onmessage = async (event) => {
            try {
                await handleWebSocketMessage(event);
                this.updateMessageMetrics(event);
            } catch (error) {
                this.metrics.errorCount++;
                this.eventEmitter.emit('error', error);
            }
        };
    }

    /**
     * Sets up event emitter handlers
     */
    private setupEventEmitter(): void {
        this.eventEmitter.on(WebSocketEventType.DETECTION_CREATED, (payload) => {
            this.updateMessageMetrics(payload);
        });

        this.eventEmitter.on(WebSocketEventType.INTELLIGENCE_PROCESSED, (payload) => {
            this.updateMessageMetrics(payload);
        });

        this.eventEmitter.on(WebSocketEventType.COVERAGE_UPDATED, (payload) => {
            this.updateMessageMetrics(payload);
        });

        this.eventEmitter.on(WebSocketEventType.TRANSLATION_COMPLETE, (payload) => {
            this.updateMessageMetrics(payload);
        });
    }

    /**
     * Updates message performance metrics
     */
    private updateMessageMetrics(event: MessageEvent | any): void {
        const messageData = typeof event.data === 'string' ? JSON.parse(event.data) : event;
        
        if (messageData.id && this.messageLatencies.has(messageData.id)) {
            const startTime = this.messageLatencies.get(messageData.id)!;
            const latency = performance.now() - startTime;
            
            this.metrics.latency = (this.metrics.latency + latency) / 2;
            this.messageLatencies.delete(messageData.id);
            this.pendingMessages.delete(messageData.id);
        }
    }

    /**
     * Waits for WebSocket connection to establish
     */
    private waitForConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000);

            this.eventEmitter.once('connect', () => {
                clearTimeout(timeout);
                resolve();
            });

            this.eventEmitter.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Attempts reconnection with error handling
     */
    private async attemptReconnection(): Promise<void> {
        try {
            await this.reconnect();
        } catch (error) {
            this.eventEmitter.emit('error', new Error('Failed to reconnect'));
        }
    }

    /**
     * Retrieves stored authentication token
     */
    private getStoredToken(): string {
        const token = localStorage.getItem('access_token');
        if (!token) {
            throw new Error('Authentication token not found');
        }
        return token;
    }

    /**
     * Returns current connection metrics
     */
    public getMetrics(): ConnectionMetrics {
        return { ...this.metrics };
    }
}