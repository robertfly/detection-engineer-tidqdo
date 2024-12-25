/**
 * @fileoverview WebSocket configuration with enhanced security and monitoring
 * @version 1.0.0
 */

import { WEBSOCKET_CONSTANTS } from './constants';
import { WebSocketEventType } from '../services/websocket/events';
import CryptoJS from 'crypto-js'; // v4.2.0

/**
 * Base WebSocket URL from environment variables with fallback
 */
const WS_BASE_URL = process.env.VITE_WS_BASE_URL || 'ws://localhost:8000/ws';

/**
 * Heartbeat interval in milliseconds
 */
const WS_HEARTBEAT_INTERVAL = 30000;

/**
 * Maximum size of message queue for offline/reconnection scenarios
 */
const WS_MESSAGE_QUEUE_SIZE = 1000;

/**
 * Encryption key for WebSocket messages
 */
const WS_ENCRYPTION_KEY = process.env.VITE_WS_ENCRYPTION_KEY;

/**
 * Interface for WebSocket configuration
 */
interface WebSocketConfig {
  baseUrl: string;
  reconnectAttempts: number;
  reconnectInterval: number;
  heartbeatInterval: number;
  messageQueueSize: number;
  encryptionKey: string;
}

/**
 * Main WebSocket configuration object
 */
export const WEBSOCKET_CONFIG: Readonly<WebSocketConfig> = {
  baseUrl: WS_BASE_URL,
  reconnectAttempts: WEBSOCKET_CONSTANTS.RECONNECT_ATTEMPTS,
  reconnectInterval: WEBSOCKET_CONSTANTS.RECONNECT_INTERVAL,
  heartbeatInterval: WS_HEARTBEAT_INTERVAL,
  messageQueueSize: WS_MESSAGE_QUEUE_SIZE,
  encryptionKey: WS_ENCRYPTION_KEY || ''
} as const;

/**
 * WebSocket connection event types
 */
export const WEBSOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  RECONNECT: 'reconnect',
  MESSAGE_QUEUED: 'message_queued',
  RATE_LIMITED: 'rate_limited',
  // Map application-specific events from WebSocketEventType
  DETECTION_CREATED: WebSocketEventType.DETECTION_CREATED,
  INTELLIGENCE_PROCESSED: WebSocketEventType.INTELLIGENCE_PROCESSED,
  TRANSLATION_COMPLETE: WebSocketEventType.TRANSLATION_COMPLETE,
  COVERAGE_UPDATED: WebSocketEventType.COVERAGE_UPDATED
} as const;

/**
 * Constructs a secure WebSocket URL with authentication and security parameters
 * @param token - Authentication token
 * @param clientId - Unique client identifier
 * @returns Secure WebSocket URL with authentication parameters
 */
export const getWebSocketUrl = (token: string, clientId: string): string => {
  if (!token || !clientId) {
    throw new Error('Invalid WebSocket connection parameters');
  }

  const timestamp = Date.now().toString();
  const baseUrl = new URL(WEBSOCKET_CONFIG.baseUrl);
  
  // Add security parameters
  const params = new URLSearchParams({
    token: encodeURIComponent(token),
    clientId: encodeURIComponent(clientId),
    timestamp,
    version: '1.0'
  });

  // Generate request signature
  const signature = CryptoJS.HmacSHA256(
    `${token}${clientId}${timestamp}`,
    WEBSOCKET_CONFIG.encryptionKey
  ).toString();

  params.append('signature', signature);
  
  // Construct final URL
  return `${baseUrl.toString()}?${params.toString()}`;
};

/**
 * Encrypts WebSocket messages for secure transmission
 * @param message - Message to encrypt
 * @returns Encrypted message with IV
 */
export const encryptMessage = (message: any): string => {
  if (!message) {
    throw new Error('Invalid message for encryption');
  }

  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(16);
  
  // Stringify message if object
  const messageString = typeof message === 'object' ? 
    JSON.stringify(message) : 
    String(message);

  // Encrypt using AES-256-GCM
  const encrypted = CryptoJS.AES.encrypt(
    messageString,
    WEBSOCKET_CONFIG.encryptionKey,
    {
      iv: iv,
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.Pkcs7
    }
  );

  // Return encrypted message with IV
  return JSON.stringify({
    iv: iv.toString(),
    content: encrypted.toString(),
    timestamp: Date.now()
  });
};

/**
 * Type definitions for better TypeScript support
 */
type WebSocketConfigType = typeof WEBSOCKET_CONFIG;
type WebSocketEventsType = typeof WEBSOCKET_EVENTS;

// Ensure immutability at type level
declare const websocketConfig: Readonly<WebSocketConfigType>;
declare const websocketEvents: Readonly<WebSocketEventsType>;