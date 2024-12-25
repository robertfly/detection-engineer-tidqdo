import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import axe from '@axe-core/react';

// Component imports
import Dashboard from '../../../../src/pages/dashboard/Dashboard';
import { useDetection } from '../../../../src/hooks/useDetection';
import { useCoverage } from '../../../../src/hooks/useCoverage';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// Mock hooks
const mockUseDetection = jest.fn();
const mockUseCoverage = jest.fn();

jest.mock('../../../../src/hooks/useDetection', () => ({
  useDetection: () => mockUseDetection()
}));

jest.mock('../../../../src/hooks/useCoverage', () => ({
  useCoverage: () => mockUseCoverage()
}));

// Mock data
const mockDetections = [
  {
    id: '1',
    name: 'Test Detection',
    description: 'Test description',
    status: 'active',
    platform: 'sigma',
    mitre_mapping: { 't1055': ['001', '002'] },
    created_at: '2024-01-19T10:00:00Z',
    updated_at: '2024-01-19T10:00:00Z'
  }
];

const mockCoverageData = {
  total: 85,
  mitre: {
    t1055: 90,
    t1003: 80
  },
  trend: [
    { date: '2024-01', value: 82 },
    { date: '2024-02', value: 85 }
  ]
};

describe('Dashboard component', () => {
  beforeEach(() => {
    // Reset mocks
    mockNavigate.mockReset();
    mockUseDetection.mockReset();
    mockUseCoverage.mockReset();

    // Setup default mock implementations
    mockUseDetection.mockImplementation(() => ({
      detections: mockDetections,
      loading: false,
      error: null,
      fetchDetections: jest.fn(),
      createDetection: jest.fn(),
      updateDetection: jest.fn(),
      deleteDetection: jest.fn()
    }));

    mockUseCoverage.mockImplementation(() => ({
      coverageData: mockCoverageData,
      loading: false,
      error: null
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard layout correctly', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Verify header section
    expect(screen.getByText('Detection Engineering Dashboard')).toBeInTheDocument();

    // Verify coverage section
    expect(screen.getByText('MITRE ATT&CK Coverage')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /coverage/i })).toBeInTheDocument();

    // Verify detections section
    expect(screen.getByText('Recent Detections')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /recent detection rules list/i })).toBeInTheDocument();
  });

  it('handles detection interactions correctly', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Click on detection item
    const detectionItem = screen.getByText('Test Detection');
    await userEvent.click(detectionItem);

    // Verify navigation
    expect(mockNavigate).toHaveBeenCalledWith('/detections/1');

    // Test edit action
    const editButton = screen.getByLabelText('Edit detection');
    await userEvent.click(editButton);
    expect(mockNavigate).toHaveBeenCalledWith('/detections/1/edit');

    // Test delete action
    const deleteButton = screen.getByLabelText('Delete detection');
    await userEvent.click(deleteButton);
    expect(mockUseDetection().deleteDetection).toHaveBeenCalledWith('1');
  });

  it('manages coverage visualization correctly', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Verify coverage chart presence
    const coverageSection = screen.getByRole('region', { name: /coverage/i });
    expect(coverageSection).toBeInTheDocument();

    // Verify coverage metrics
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/t1055/i)).toBeInTheDocument();

    // Test chart interaction
    const chartElement = within(coverageSection).getByRole('img', { name: /coverage chart/i });
    await userEvent.click(chartElement);
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/coverage/'));
  });

  it('meets performance requirements', async () => {
    const startTime = performance.now();
    
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    const renderTime = performance.now() - startTime;
    expect(renderTime).toBeLessThan(100); // 100ms threshold

    // Test interaction response time
    const startInteraction = performance.now();
    await userEvent.click(screen.getByText('Test Detection'));
    const interactionTime = performance.now() - startInteraction;
    expect(interactionTime).toBeLessThan(50); // 50ms threshold
  });

  it('maintains accessibility standards', async () => {
    const { container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Run accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify keyboard navigation
    const firstFocusable = screen.getByText('Test Detection');
    firstFocusable.focus();
    expect(document.activeElement).toBe(firstFocusable);

    // Test ARIA attributes
    expect(screen.getByRole('region', { name: /coverage/i })).toHaveAttribute('aria-labelledby');
    expect(screen.getByRole('region', { name: /recent detection rules/i })).toHaveAttribute('aria-labelledby');
  });

  it('handles error states gracefully', async () => {
    mockUseDetection.mockImplementation(() => ({
      detections: [],
      loading: false,
      error: new Error('Failed to fetch detections'),
      fetchDetections: jest.fn()
    }));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Verify error message
    expect(screen.getByText(/failed to fetch detections/i)).toBeInTheDocument();

    // Verify retry functionality
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);
    expect(mockUseDetection().fetchDetections).toHaveBeenCalled();
  });

  it('handles loading states correctly', async () => {
    mockUseDetection.mockImplementation(() => ({
      detections: [],
      loading: true,
      error: null,
      fetchDetections: jest.fn()
    }));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Verify loading indicators
    expect(screen.getByText('Loading recent detections...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Verify skeleton loading UI
    const skeletonElements = screen.getAllByTestId('skeleton-loader');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });
});