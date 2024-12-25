/**
 * @fileoverview Coverage visualization component using recharts with accessibility features
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'; // v2.10.0
import { Coverage } from '../../types/coverage';
import { Loading } from '../common/Loading';
import { useTheme } from '../../hooks/useTheme';

/**
 * Props interface for the CoverageChart component
 */
interface CoverageChartProps {
  /** Array of coverage data points to visualize */
  data: Coverage[];
  /** Height of the chart in pixels */
  height?: number;
  /** Additional CSS classes for styling */
  className?: string;
  /** Toggle chart animations */
  showAnimation?: boolean;
  /** Enable zoom/pan capabilities */
  enableZoom?: boolean;
}

/**
 * Formats tooltip values with appropriate units and accessibility context
 */
const formatTooltip = (value: number, name: string, type: string): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'N/A';
  }

  switch (name.toLowerCase()) {
    case 'coverage_percentage':
      return `${value.toFixed(1)}% Coverage`;
    case 'detection_count':
      return `${value} Detection${value !== 1 ? 's' : ''}`;
    default:
      return `${value}`;
  }
};

/**
 * Validates coverage data before rendering
 */
const validateData = (data: Coverage[]): boolean => {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  return data.every(item => (
    item &&
    typeof item.coverage_percentage === 'number' &&
    typeof item.detection_count === 'number' &&
    typeof item.name === 'string'
  ));
};

/**
 * A memoized chart component that visualizes coverage metrics with enhanced features
 */
const CoverageChart: React.FC<CoverageChartProps> = ({
  data,
  height = 400,
  className = '',
  showAnimation = true,
  enableZoom = false,
}) => {
  const { theme, isDarkMode } = useTheme();

  // Memoize chart colors based on theme
  const chartColors = useMemo(() => ({
    coverage: theme.palette.primary.main,
    detections: theme.palette.secondary.main,
    grid: theme.palette.divider,
    text: theme.palette.text.primary,
    background: theme.palette.background.paper,
  }), [theme, isDarkMode]);

  // Validate data before rendering
  if (!validateData(data)) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <Loading 
          size="large"
          label="Loading coverage data..."
          center
        />
      </div>
    );
  }

  return (
    <div 
      className={`coverage-chart-container ${className}`}
      role="region"
      aria-label="MITRE ATT&CK Coverage Chart"
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={chartColors.grid}
            strokeOpacity={0.5}
          />
          
          <XAxis
            dataKey="name"
            stroke={chartColors.text}
            tick={{ fill: chartColors.text }}
            tickLine={{ stroke: chartColors.text }}
            label={{
              value: 'Tactics & Techniques',
              position: 'bottom',
              fill: chartColors.text,
            }}
          />
          
          <YAxis
            yAxisId="percentage"
            stroke={chartColors.text}
            tick={{ fill: chartColors.text }}
            tickLine={{ stroke: chartColors.text }}
            label={{
              value: 'Coverage Percentage',
              angle: -90,
              position: 'insideLeft',
              fill: chartColors.text,
            }}
            domain={[0, 100]}
          />
          
          <YAxis
            yAxisId="count"
            orientation="right"
            stroke={chartColors.text}
            tick={{ fill: chartColors.text }}
            tickLine={{ stroke: chartColors.text }}
            label={{
              value: 'Detection Count',
              angle: 90,
              position: 'insideRight',
              fill: chartColors.text,
            }}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: chartColors.background,
              border: `1px solid ${chartColors.grid}`,
              borderRadius: '4px',
            }}
            formatter={formatTooltip}
            labelStyle={{ color: chartColors.text }}
          />
          
          <Legend
            wrapperStyle={{ color: chartColors.text }}
            formatter={(value) => value.replace(/_/g, ' ')}
          />
          
          <Line
            yAxisId="percentage"
            type="monotone"
            dataKey="coverage_percentage"
            name="Coverage Percentage"
            stroke={chartColors.coverage}
            strokeWidth={2}
            dot={{ fill: chartColors.coverage }}
            activeDot={{ r: 6 }}
            isAnimationActive={showAnimation}
            animationDuration={1000}
            animationEasing="ease-in-out"
          />
          
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="detection_count"
            name="Detection Count"
            stroke={chartColors.detections}
            strokeWidth={2}
            dot={{ fill: chartColors.detections }}
            activeDot={{ r: 6 }}
            isAnimationActive={showAnimation}
            animationDuration={1000}
            animationEasing="ease-in-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default React.memo(CoverageChart);