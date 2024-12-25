// AIChat.tsx
// Version: 1.0.0
// AI-powered chat interface component for the detection engineering workbench
// with real-time WebSocket communication and performance monitoring.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0
import { useWebSocket } from '../../hooks/useWebSocket';
import { Button } from '../common/Button';
import { WebSocketEventType, EventPriority } from '../../services/websocket/events';

// Constants for chat behavior and performance
const MAX_MESSAGE_LENGTH = 1000;
const MESSAGE_RATE_LIMIT = 10;
const MESSAGE_RATE_WINDOW = 60000; // 1 minute
const VIRTUALIZATION_OPTIONS = {
  overscan: 5,
  estimateSize: () => 80,
};

// Interface for chat message structure
interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isError?: boolean;
}

// Props interface for AIChat component
export interface AIChatProps {
  /** Callback when detection is updated */
  onDetectionUpdate?: (detection: any) => void;
  /** Optional CSS class name */
  className?: string;
  /** Error handling callback */
  onError?: (error: Error) => void;
  /** Performance configuration */
  performanceConfig?: {
    messageRateLimit?: number;
    messageWindow?: number;
    loadingTimeout?: number;
  };
}

/**
 * AI-powered chat interface component for detection engineering workbench
 * Implements secure WebSocket communication and performance monitoring
 */
export const AIChat: React.FC<AIChatProps> = ({
  onDetectionUpdate,
  className,
  onError,
  performanceConfig = {},
}) => {
  // State management
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [lastMessageTime, setLastMessageTime] = useState(0);

  // Refs for DOM and performance tracking
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const performanceMetricsRef = useRef({
    messageLatencies: new Map<string, number>(),
    averageLatency: 0,
    errorCount: 0,
  });

  // Initialize WebSocket connection
  const {
    isConnected,
    sendMessage,
    connectionQuality,
  } = useWebSocket(localStorage.getItem('access_token') || '', {
    autoReconnect: true,
    onError: (error) => onError?.(new Error(error.message)),
  });

  // Virtual scroll implementation for performance
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => chatContainerRef.current,
    ...VIRTUALIZATION_OPTIONS,
  });

  /**
   * Handles message submission with rate limiting and validation
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Input validation
    if (!inputValue.trim() || inputValue.length > MAX_MESSAGE_LENGTH) {
      onError?.(new Error('Invalid message length'));
      return;
    }

    // Rate limiting check
    const now = Date.now();
    if (
      messageCount >= (performanceConfig.messageRateLimit || MESSAGE_RATE_LIMIT) &&
      now - lastMessageTime < (performanceConfig.messageWindow || MESSAGE_RATE_WINDOW)
    ) {
      onError?.(new Error('Rate limit exceeded'));
      return;
    }

    try {
      setIsLoading(true);
      const messageId = crypto.randomUUID();
      const startTime = performance.now();

      // Add user message to chat
      const userMessage: ChatMessage = {
        id: messageId,
        content: inputValue,
        sender: 'user',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      // Send message via WebSocket
      const success = await sendMessage(
        WebSocketEventType.DETECTION_CREATED,
        {
          messageId,
          content: inputValue,
          timestamp: new Date().toISOString(),
        },
        EventPriority.HIGH
      );

      if (!success) {
        throw new Error('Failed to send message');
      }

      // Update rate limiting metrics
      setMessageCount((prev) => prev + 1);
      setLastMessageTime(now);

      // Update performance metrics
      performanceMetricsRef.current.messageLatencies.set(messageId, startTime);

    } catch (error) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: 'Failed to send message. Please try again.',
        sender: 'ai',
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      performanceMetricsRef.current.errorCount++;
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, messageCount, lastMessageTime, sendMessage, onError, performanceConfig]);

  /**
   * Handles WebSocket message processing
   */
  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const messageId = data.messageId;

        // Calculate message latency
        if (performanceMetricsRef.current.messageLatencies.has(messageId)) {
          const startTime = performanceMetricsRef.current.messageLatencies.get(messageId)!;
          const latency = performance.now() - startTime;
          performanceMetricsRef.current.averageLatency = 
            (performanceMetricsRef.current.averageLatency + latency) / 2;
          performanceMetricsRef.current.messageLatencies.delete(messageId);
        }

        // Process AI response
        const aiMessage: ChatMessage = {
          id: crypto.randomUUID(),
          content: data.content,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);

        // Handle detection updates
        if (data.detection) {
          onDetectionUpdate?.(data.detection);
        }

      } catch (error) {
        console.error('WebSocket message processing error:', error);
        performanceMetricsRef.current.errorCount++;
      }
    };

    // Add WebSocket message listener
    if (isConnected) {
      window.addEventListener('message', handleWebSocketMessage);
    }

    return () => {
      window.removeEventListener('message', handleWebSocketMessage);
    };
  }, [isConnected, onDetectionUpdate]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Connection status indicator */}
      {!isConnected && (
        <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-sm">
          Connecting to AI service...
        </div>
      )}

      {/* Chat messages container with virtualization */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-auto p-4 space-y-4"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                } ${message.isError ? 'bg-red-100 text-red-800' : ''}`}
              >
                {message.content}
                <div className="text-xs opacity-75 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Message input form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex space-x-4">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 resize-none rounded-lg border p-2 focus:ring-2 focus:ring-primary-500"
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={!isConnected || isLoading}
            rows={3}
          />
          <Button
            type="submit"
            disabled={!isConnected || isLoading || !inputValue.trim()}
            loading={isLoading}
            variant="primary"
            ariaLabel="Send message"
          >
            Send
          </Button>
        </div>
        
        {/* Character count */}
        <div className="text-sm text-gray-500 mt-2">
          {inputValue.length}/{MAX_MESSAGE_LENGTH} characters
        </div>
      </form>
    </div>
  );
};

export default AIChat;