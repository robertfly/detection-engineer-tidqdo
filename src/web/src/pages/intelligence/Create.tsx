/**
 * Intelligence creation page component implementing Material Design 3.0
 * with comprehensive validation and real-time processing feedback.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';

// Internal imports
import Layout from '../../components/layout/Layout';
import IntelligenceForm from '../../components/intelligence/IntelligenceForm';
import { useIntelligence } from '../../hooks/useIntelligence';
import { IntelligenceSourceType } from '../../types/intelligence';

// Styled components
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  
  @media (max-width: 599px) {
    padding: 16px;
  }
`;

const Header = styled.div`
  margin-bottom: 24px;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.palette.text.primary};
  margin-bottom: 8px;
`;

const Description = styled.p`
  font-size: 1rem;
  color: ${({ theme }) => theme.palette.text.secondary};
  margin-bottom: 24px;
`;

const ProgressContainer = styled.div`
  margin-top: 16px;
  padding: 16px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  border-radius: 8px;
  box-shadow: ${({ theme }) => theme.shadows[1]};
`;

const AccuracyMetrics = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 16px;
`;

const MetricCard = styled.div`
  padding: 16px;
  background-color: ${({ theme }) => theme.palette.background.default};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
`;

/**
 * Intelligence creation page component with real-time processing feedback
 * and comprehensive validation features.
 */
const IntelligenceCreate: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { create, loading, error, metrics } = useIntelligence({
    autoFetch: false
  });

  // Local state for progress tracking
  const [progress, setProgress] = useState(0);

  /**
   * Handles form submission with validation and error handling
   */
  const handleSubmit = useCallback(async (data: {
    name: string;
    description: string;
    source_type: IntelligenceSourceType;
    source_url?: string;
    source_content?: string;
    metadata: Record<string, unknown>;
  }) => {
    try {
      const result = await create(data);
      if (result) {
        navigate(`/intelligence/${result}`);
      }
    } catch (err) {
      console.error('Intelligence creation failed:', err);
    }
  }, [create, navigate]);

  /**
   * Handles form cancellation
   */
  const handleCancel = useCallback(() => {
    navigate('/intelligence');
  }, [navigate]);

  /**
   * Updates progress based on processing status
   */
  const handleProgress = useCallback((value: number) => {
    setProgress(value);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setProgress(0);
    };
  }, []);

  return (
    <Layout>
      <Container>
        <Header>
          <Title>Create Intelligence</Title>
          <Description>
            Create new intelligence by uploading files, providing URLs, or entering text directly.
            Supports PDF documents, URLs, and structured data with real-time processing feedback.
          </Description>
        </Header>

        <IntelligenceForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onProgress={handleProgress}
        />

        {(loading || progress > 0) && (
          <ProgressContainer role="status" aria-live="polite">
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium">Processing Intelligence</span>
              <span>{progress}% Complete</span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div 
                className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {metrics && (
              <AccuracyMetrics>
                <MetricCard>
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Processing Accuracy
                  </div>
                  <div className="text-2xl font-semibold mt-1">
                    {(metrics.processingTime / 1000).toFixed(1)}s
                  </div>
                </MetricCard>

                <MetricCard>
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Success Rate
                  </div>
                  <div className="text-2xl font-semibold mt-1">
                    {metrics.successRate.toFixed(1)}%
                  </div>
                </MetricCard>

                <MetricCard>
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Cache Hit Rate
                  </div>
                  <div className="text-2xl font-semibold mt-1">
                    {metrics.cacheHitRate.toFixed(1)}%
                  </div>
                </MetricCard>
              </AccuracyMetrics>
            )}
          </ProgressContainer>
        )}

        {error && (
          <div 
            className="mt-4 p-4 bg-error-50 text-error-700 rounded-md"
            role="alert"
          >
            {error}
          </div>
        )}
      </Container>
    </Layout>
  );
});

IntelligenceCreate.displayName = 'IntelligenceCreate';

export default IntelligenceCreate;