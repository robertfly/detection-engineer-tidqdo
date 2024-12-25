// React 18.2.0+
import React from 'react';
// @emotion/styled 11.11.0+
import styled from '@emotion/styled';
import { Theme } from '../../config/theme';

// Props interface with comprehensive type definitions
interface AvatarProps {
  size?: 'small' | 'medium' | 'large';
  src?: string;
  name: string;
  className?: string;
  onClick?: () => void;
  alt?: string;
  ariaLabel?: string;
}

// Styled components with Material Design 3.0 specifications
const AvatarContainer = styled.div<{ size: string; theme: Theme }>`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background-color: ${({ theme }) => theme.palette.primary.main};
  color: ${({ theme }) => theme.palette.primary.contrastText};
  cursor: ${({ onClick }) => (onClick ? 'pointer' : 'default')};
  user-select: none;
  transition: transform 0.2s ease-in-out;
  position: relative;
  
  ${({ size }) => getSizeStyles(size)}
  
  &:hover {
    transform: ${({ onClick }) => (onClick ? 'scale(1.05)' : 'none')};
  }
  
  &:focus {
    outline: 2px solid ${({ theme }) => theme.palette.primary.light};
    outline-offset: 2px;
  }
  
  /* Ensure WCAG 2.1 AA compliance for focus states */
  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.palette.primary.light};
    outline-offset: 2px;
  }
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  loading: lazy;
`;

const AvatarFallback = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: Inter, -apple-system, system-ui;
  font-weight: 500;
  letter-spacing: 0.1px;
`;

// Size constants following 8px grid system
const sizeMap = {
  small: {
    width: '32px',
    height: '32px',
    fontSize: '14px',
    spacing: '8px',
  },
  medium: {
    width: '40px',
    height: '40px',
    fontSize: '16px',
    spacing: '16px',
  },
  large: {
    width: '48px',
    height: '48px',
    fontSize: '20px',
    spacing: '24px',
  },
};

// Helper function to get initials from name
const getInitials = (name: string): string => {
  if (!name) return '';
  
  const words = name.trim().split(' ');
  if (words.length === 0) return '';
  
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }
  
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
};

// Helper function to get size-specific styles
const getSizeStyles = (size: string) => {
  const sizeConfig = sizeMap[size as keyof typeof sizeMap] || sizeMap.medium;
  
  return `
    width: ${sizeConfig.width};
    height: ${sizeConfig.height};
    font-size: ${sizeConfig.fontSize};
    margin: ${sizeConfig.spacing};
  `;
};

// Main Avatar component
const Avatar: React.FC<AvatarProps> = ({
  size = 'medium',
  src,
  name,
  className,
  onClick,
  alt,
  ariaLabel,
}) => {
  const initials = React.useMemo(() => getInitials(name), [name]);
  
  return (
    <AvatarContainer
      size={size}
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : 'presentation'}
      tabIndex={onClick ? 0 : -1}
      aria-label={ariaLabel || `Avatar for ${name}`}
    >
      {src ? (
        <AvatarImage
          src={src}
          alt={alt || `${name}'s avatar`}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            // Remove src on error to show fallback
            e.currentTarget.src = '';
          }}
        />
      ) : (
        <AvatarFallback aria-hidden="true">
          {initials}
        </AvatarFallback>
      )}
    </AvatarContainer>
  );
};

export default Avatar;