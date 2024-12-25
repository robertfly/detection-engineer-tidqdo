import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// Component under test
import Workbench from '../../../../src/pages/workbench/Workbench';

// Hooks and utilities
import { useDetection } from '../../../../src/hooks/useDetection';
import { useWebSocket } from '../../../../src/hooks/useWebSocket';

// Mock store configuration
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      detection: (state = initialState) => state,
    },
    preloadedState: initialState,
  });
};

// Mock data
const mockDetection = {
  id: 'test-detection-1',
  name: 'Test Detection',
  description: 'Test detection description',
  logic: { query: 'test query' },
  platform: 'sigma',
  status: 'draft',
  metadata: {},
  validation_results: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock hook implementations
vi.mock('../../../../src/hooks/useDetection', () => ({
  useDetection: vi.fn(() => ({
    selectedDetection: mockDetection,
    loading: {
      validate: false,
      translate: false,
      save: false,
    },
    error: null,
    createDetection: vi.fn(),
    updateDetection: vi.fn(),
    validateDetection: vi.fn(),
  })),
}));

vi.mock('../../../../src/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: true,
    sendMessage: vi.fn(),
    connectionQuality: 'excellent',
  })),
}));

// Helper to render with providers
const renderWithProviders = (ui: React.ReactElement, options = {}) => {
  const store = createMockStore();
  return {
    ...render(
      <Provider store={store}>
        {ui}
      </Provider>
    ),
    store,
  };
};

describe('Workbench Interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders split-pane interface correctly', () => {
    renderWithProviders(<Workbench />);

    // Verify main components are rendered
    expect(screen.getByRole('region', { name: /code editor/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /ai chat/i })).toBeInTheDocument();
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('shows proper loading states during operations', async () => {
    const { validateDetection } = useDetection() as any;
    validateDetection.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    renderWithProviders(<Workbench />);

    // Click validate button
    const validateButton = screen.getByRole('button', { name: /validate/i });
    fireEvent.click(validateButton);

    // Check loading state
    expect(validateButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Wait for loading to complete
    await waitFor(() => {
      expect(validateButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('handles resize operations correctly', async () => {
    renderWithProviders(<Workbench />);

    const resizer = screen.getByRole('separator');
    const initialPosition = resizer.getBoundingClientRect();

    // Simulate drag operation
    fireEvent.mouseDown(resizer);
    fireEvent.mouseMove(document, { clientX: initialPosition.x + 100 });
    fireEvent.mouseUp(document);

    // Verify position changed
    const newPosition = resizer.getBoundingClientRect();
    expect(newPosition.x).not.toBe(initialPosition.x);
  });
});

describe('AI Chat Integration', () => {
  it('establishes WebSocket connection successfully', () => {
    renderWithProviders(<Workbench />);
    
    const { isConnected } = useWebSocket();
    expect(isConnected).toBe(true);
    expect(screen.queryByText(/connecting/i)).not.toBeInTheDocument();
  });

  it('handles message sending and receiving', async () => {
    const { sendMessage } = useWebSocket();
    renderWithProviders(<Workbench />);

    // Type and send message
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Create a detection for suspicious PowerShell commands');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        content: 'Create a detection for suspicious PowerShell commands'
      }),
      expect.any(String)
    );
  });

  it('updates editor content on AI response', async () => {
    const mockResponse = {
      type: 'detection.created',
      content: JSON.stringify({ query: 'process.name: "powershell.exe"' }),
    };

    const { sendMessage } = useWebSocket();
    sendMessage.mockImplementation(() => {
      // Simulate WebSocket response
      window.dispatchEvent(new MessageEvent('message', { data: mockResponse }));
    });

    renderWithProviders(<Workbench />);

    // Send message and verify editor update
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Create PowerShell detection');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      const editor = screen.getByRole('region', { name: /code editor/i });
      expect(editor).toHaveTextContent('process.name: "powershell.exe"');
    });
  });
});

describe('Detection Operations', () => {
  it('loads detection data correctly', async () => {
    renderWithProviders(<Workbench detectionId="test-detection-1" />);

    await waitFor(() => {
      const editor = screen.getByRole('region', { name: /code editor/i });
      expect(editor).toHaveTextContent(mockDetection.logic.query);
    });
  });

  it('handles validation operations', async () => {
    const { validateDetection } = useDetection() as any;
    renderWithProviders(<Workbench detectionId="test-detection-1" />);

    // Trigger validation
    fireEvent.click(screen.getByRole('button', { name: /validate/i }));

    expect(validateDetection).toHaveBeenCalledWith('test-detection-1');
  });

  it('performs cross-platform translation', async () => {
    const { updateDetection } = useDetection() as any;
    renderWithProviders(<Workbench detectionId="test-detection-1" />);

    // Trigger translation
    fireEvent.click(screen.getByRole('button', { name: /translate/i }));

    await waitFor(() => {
      expect(updateDetection).toHaveBeenCalledWith(
        'test-detection-1',
        expect.objectContaining({ platform: expect.any(String) })
      );
    });
  });
});

describe('Performance Monitoring', () => {
  it('validates API response times', async () => {
    const startTime = performance.now();
    renderWithProviders(<Workbench />);

    await waitFor(() => {
      const renderTime = performance.now() - startTime;
      expect(renderTime).toBeLessThan(100); // 100ms threshold
    });
  });

  it('monitors UI responsiveness', async () => {
    renderWithProviders(<Workbench />);

    const startTime = performance.now();
    const editor = screen.getByRole('region', { name: /code editor/i });
    
    // Simulate rapid typing
    await userEvent.type(editor, 'Test content{enter}');
    
    const responseTime = performance.now() - startTime;
    expect(responseTime).toBeLessThan(50); // 50ms threshold
  });

  it('tracks memory usage', async () => {
    const initialMemory = performance.memory?.usedJSHeapSize;
    renderWithProviders(<Workbench />);

    // Simulate heavy operation
    for (let i = 0; i < 1000; i++) {
      await userEvent.type(screen.getByRole('textbox'), 'test');
    }

    const finalMemory = performance.memory?.usedJSHeapSize;
    const memoryIncrease = finalMemory - initialMemory;
    
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB threshold
  });
});