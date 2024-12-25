// AIChat.test.tsx
// Version: 1.0.0
// Comprehensive test suite for the AI-powered chat interface component

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AIChat, { AIChatProps } from '../../src/components/workbench/AIChat';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock WebSocket functionality
const mockWebSocket = {
  connect: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  onmessage: null,
  onclose: null,
  onerror: null,
};

// Mock callbacks and observers
const mockOnDetectionUpdate = vi.fn();
const mockPerformanceObserver = vi.fn();
const mockIntersectionObserver = vi.fn();
const mockResizeObserver = vi.fn();

describe('AIChat Component', () => {
  // Default props for component
  const defaultProps: AIChatProps = {
    onDetectionUpdate: mockOnDetectionUpdate,
    className: 'test-chat',
    onError: vi.fn(),
    performanceConfig: {
      messageRateLimit: 10,
      messageWindow: 60000,
      loadingTimeout: 30000,
    },
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock WebSocket
    (global as any).WebSocket = vi.fn(() => mockWebSocket);
    
    // Mock observers
    (global as any).PerformanceObserver = mockPerformanceObserver;
    (global as any).IntersectionObserver = mockIntersectionObserver;
    (global as any).ResizeObserver = mockResizeObserver;
    
    // Mock crypto for UUID generation
    (global as any).crypto = {
      randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
    };
    
    // Mock localStorage
    Storage.prototype.getItem = vi.fn(() => 'mock-token');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('should render the chat interface correctly', () => {
      const { container } = render(<AIChat {...defaultProps} />);
      
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
      expect(container.querySelector('.flex-col')).toBeInTheDocument();
    });

    it('should show connecting state when WebSocket is not connected', () => {
      render(<AIChat {...defaultProps} />);
      
      expect(screen.getByText(/connecting to ai service/i)).toBeInTheDocument();
    });

    it('should pass accessibility audit', async () => {
      const { container } = render(<AIChat {...defaultProps} />);
      const results = await axe(container);
      
      expect(results).toHaveNoViolations();
    });
  });

  describe('User Interaction', () => {
    it('should handle message submission correctly', async () => {
      const user = userEvent.setup();
      render(<AIChat {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await user.type(input, 'Test message');
      await user.click(sendButton);
      
      expect(mockWebSocket.send).toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('should enforce message length limits', async () => {
      const user = userEvent.setup();
      render(<AIChat {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      const longMessage = 'a'.repeat(1001);
      
      await user.type(input, longMessage);
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      expect(defaultProps.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid message length' })
      );
    });

    it('should handle rate limiting correctly', async () => {
      const user = userEvent.setup();
      render(<AIChat {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      // Send messages rapidly
      for (let i = 0; i < 11; i++) {
        await user.type(input, `Message ${i}`);
        await user.click(sendButton);
      }
      
      expect(defaultProps.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Rate limit exceeded' })
      );
    });
  });

  describe('WebSocket Communication', () => {
    it('should establish WebSocket connection on mount', () => {
      render(<AIChat {...defaultProps} />);
      
      expect(WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('ws://localhost:8000/ws')
      );
    });

    it('should handle WebSocket messages correctly', async () => {
      render(<AIChat {...defaultProps} />);
      
      const message = {
        messageId: '123',
        content: 'AI response',
        detection: { id: '456', name: 'Test Detection' },
      };
      
      // Simulate WebSocket message
      const messageEvent = new MessageEvent('message', {
        data: JSON.stringify(message),
      });
      window.dispatchEvent(messageEvent);
      
      await waitFor(() => {
        expect(screen.getByText('AI response')).toBeInTheDocument();
        expect(mockOnDetectionUpdate).toHaveBeenCalledWith(message.detection);
      });
    });

    it('should handle WebSocket errors gracefully', async () => {
      render(<AIChat {...defaultProps} />);
      
      // Simulate WebSocket error
      mockWebSocket.onerror?.(new Event('error'));
      
      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalled();
      });
    });
  });

  describe('Performance', () => {
    it('should virtualize message list for performance', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
        sender: i % 2 === 0 ? 'user' : 'ai',
        timestamp: new Date(),
      }));
      
      const { container } = render(<AIChat {...defaultProps} />);
      
      // Add messages to state
      messages.forEach(message => {
        const messageEvent = new MessageEvent('message', {
          data: JSON.stringify(message),
        });
        window.dispatchEvent(messageEvent);
      });
      
      await waitFor(() => {
        const virtualItems = container.querySelectorAll('[style*="transform"]');
        expect(virtualItems.length).toBeLessThan(messages.length);
      });
    });

    it('should track message latencies', async () => {
      const user = userEvent.setup();
      render(<AIChat {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      await user.type(input, 'Test message');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      // Simulate AI response
      const response = {
        messageId: '123',
        content: 'AI response',
        timestamp: new Date().toISOString(),
      };
      
      const messageEvent = new MessageEvent('message', {
        data: JSON.stringify(response),
      });
      window.dispatchEvent(messageEvent);
      
      await waitFor(() => {
        expect(screen.getByText('AI response')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should maintain focus management', async () => {
      const user = userEvent.setup();
      render(<AIChat {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await user.tab();
      expect(input).toHaveFocus();
      
      await user.tab();
      expect(sendButton).toHaveFocus();
    });

    it('should announce loading states', async () => {
      render(<AIChat {...defaultProps} />);
      
      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);
      
      expect(sendButton).toHaveAttribute('aria-busy', 'true');
    });

    it('should handle keyboard navigation in message list', async () => {
      const user = userEvent.setup();
      render(<AIChat {...defaultProps} />);
      
      // Add test messages
      const messages = ['Message 1', 'Message 2', 'Message 3'];
      messages.forEach(content => {
        const messageEvent = new MessageEvent('message', {
          data: JSON.stringify({ content }),
        });
        window.dispatchEvent(messageEvent);
      });
      
      await user.tab();
      await user.keyboard('{ArrowUp}');
      
      const messageContainer = screen.getByRole('region');
      expect(messageContainer).toHaveAttribute('aria-live', 'polite');
    });
  });
});