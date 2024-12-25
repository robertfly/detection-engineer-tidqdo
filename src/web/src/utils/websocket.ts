/**
 * @fileoverview Advanced WebSocket utility functions for secure real-time communication
 * @version 1.0.0
 */

import { WEBSOCKET_CONFIG } from '../config/websocket';
import { WebSocketEventType, WebSocketEvent, EventPriority } from '../services/websocket/events';
import pako from 'pako'; // v2.1.0

/**
 * Interface for WebSocket connection options
 */
interface WebSocketOptions {
  clientId?: string;
  version?: string;
  compression?: boolean;
  priority?: EventPriority;
}

/**
 * Interface for message formatting options
 */
interface MessageOptions {
  compress?: boolean;
  priority?: EventPriority;
  encrypted?: boolean;
}

/**
 * Interface for connection status details
 */
interface ConnectionStatus {
  connected: boolean;
  latency: number;
  lastHeartbeat: number;
  queueSize: number;
  secure: boolean;
  readyState: number;
}

/**
 * Creates a secure WebSocket URL with authentication token and optional parameters
 * @param token - Authentication token for WebSocket connection
 * @param options - Optional connection parameters
 * @returns Formatted WebSocket URL with security parameters
 */
export const createWebSocketUrl = (token: string, options?: WebSocketOptions): string => {
  if (!token) {
    throw new Error('Authentication token is required');
  }

  const baseUrl = new URL(WEBSOCKET_CONFIG.baseUrl);
  const params = new URLSearchParams();

  // Add required parameters
  params.append('token', encodeURIComponent(token));
  params.append('timestamp', Date.now().toString());

  // Add optional parameters
  if (options?.clientId) {
    params.append('clientId', encodeURIComponent(options.clientId));
  }
  if (options?.version) {
    params.append('version', options.version);
  }
  if (options?.compression) {
    params.append('compression', 'true');
  }

  return `${baseUrl.toString()}?${params.toString()}`;
};

/**
 * Formats and optionally compresses a message for WebSocket transmission
 * @param type - WebSocket event type
 * @param payload - Event payload data
 * @param options - Message formatting options
 * @returns Formatted and optionally compressed message string
 */
export const formatWebSocketMessage = (
  type: WebSocketEventType,
  payload: any,
  options?: MessageOptions
): string => {
  const message: WebSocketEvent = {
    type,
    payload,
    timestamp: Date.now(),
    version: '1.0',
    priority: options?.priority || EventPriority.MEDIUM
  };

  const messageString = JSON.stringify(message);

  // Apply compression if message size exceeds threshold or explicitly requested
  if (options?.compress || messageString.length > WEBSOCKET_CONFIG.compressionThreshold) {
    const compressed = pako.deflate(messageString, { level: 6 });
    return Buffer.from(compressed).toString('base64');
  }

  return messageString;
};

/**
 * Parses and validates received WebSocket messages
 * @param message - Raw message received from WebSocket
 * @returns Parsed and validated WebSocket event
 * @throws Error if message is invalid or corrupted
 */
export const parseWebSocketMessage = (message: string): WebSocketEvent => {
  try {
    // Check if message is compressed (base64 encoded)
    const isCompressed = /^[A-Za-z0-9+/]+=*$/.test(message);

    let parsedMessage: string;
    if (isCompressed) {
      const compressed = Buffer.from(message, 'base64');
      parsedMessage = pako.inflate(compressed, { to: 'string' });
    } else {
      parsedMessage = message;
    }

    const event: WebSocketEvent = JSON.parse(parsedMessage);

    // Validate required fields
    if (!event.type || !event.payload || !event.version) {
      throw new Error('Invalid message format');
    }

    // Validate event type
    if (!Object.values(WebSocketEventType).includes(event.type)) {
      throw new Error('Invalid event type');
    }

    return event;
  } catch (error) {
    throw new Error(`Failed to parse WebSocket message: ${error.message}`);
  }
};

/**
 * Checks WebSocket connection health and status
 * @param socket - WebSocket instance to check
 * @returns Detailed connection status object
 */
export const isWebSocketConnected = (socket: WebSocket): ConnectionStatus => {
  const now = Date.now();
  const status: ConnectionStatus = {
    connected: socket.readyState === WebSocket.OPEN,
    latency: -1,
    lastHeartbeat: -1,
    queueSize: 0,
    secure: socket.url.startsWith('wss://'),
    readyState: socket.readyState
  };

  // Get last heartbeat timestamp from socket instance
  const lastHeartbeat = (socket as any)._lastHeartbeat;
  if (lastHeartbeat) {
    status.lastHeartbeat = now - lastHeartbeat;
  }

  // Get message queue size if available
  const queue = (socket as any)._messageQueue;
  if (queue && Array.isArray(queue)) {
    status.queueSize = queue.length;
  }

  // Calculate latency if ping time is available
  const pingTime = (socket as any)._lastPingTime;
  if (pingTime) {
    status.latency = now - pingTime;
  }

  return status;
};

/**
 * Type definitions for better TypeScript support
 */
export type { WebSocketOptions, MessageOptions, ConnectionStatus };