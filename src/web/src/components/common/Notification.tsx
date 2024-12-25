import React, { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion'; // v10.0+
import styled from '@emotion/styled'; // v11.0+
import Toast from './Toast';
import { spacing } from '../../config/theme';

// Type definitions
export interface NotificationItem {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  important?: boolean;
  ariaLabel?: string;
  role?: 'alert' | 'status';
}

export interface NotificationProps {
  notifications: NotificationItem[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxVisible?: number;
}

// Styled components
const NotificationContainer = styled.div<{ position: string }>`
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: ${spacing(2)};
  max-height: 100vh;
  overflow: hidden;
  padding: ${spacing(4)};

  ${({ position }) => {
    const [vertical, horizontal] = position.split('-');
    return `
      ${vertical}: 0;
      ${horizontal === 'center' 
        ? `
          left: 50%;
          transform: translateX(-50%);
        `
        : `${horizontal}: 0;`
      }
      ${vertical === 'bottom' ? 'flex-direction: column-reverse;' : ''}
    `;
  }}

  @media (max-width: 600px) {
    width: 100%;
    padding: ${spacing(2)};
    ${({ position }) => position.includes('center') ? 'width: 100%;' : ''}
  }
`;

// Main component
export const Notification: React.FC<NotificationProps> = React.memo(({
  notifications,
  position = 'top-right',
  maxVisible = 5
}) => {
  const activeNotificationsRef = useRef<Set<string>>(new Set());
  const documentDir = typeof document !== 'undefined' ? document.dir : 'ltr';

  // Adjust position for RTL layouts
  const adjustedPosition = useCallback((pos: string) => {
    if (documentDir === 'rtl') {
      return pos.replace('left', 'temp')
        .replace('right', 'left')
        .replace('temp', 'right');
    }
    return pos;
  }, [documentDir]);

  // Handle notification removal
  const handleDismiss = useCallback((id: string) => {
    activeNotificationsRef.current.delete(id);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeNotificationsRef.current.clear();
    };
  }, []);

  // Filter visible notifications
  const visibleNotifications = notifications
    .slice(0, maxVisible)
    .filter(notification => !activeNotificationsRef.current.has(notification.id));

  // Update active notifications ref
  useEffect(() => {
    visibleNotifications.forEach(notification => {
      activeNotificationsRef.current.add(notification.id);
    });
  }, [visibleNotifications]);

  // Error boundary for notification rendering
  class NotificationErrorBoundary extends React.Component<{ children: React.ReactNode }> {
    componentDidCatch(error: Error) {
      console.error('Error rendering notification:', error);
    }

    render() {
      return this.props.children;
    }
  }

  return (
    <NotificationContainer position={adjustedPosition(position)}>
      <AnimatePresence mode="sync">
        <NotificationErrorBoundary>
          {visibleNotifications.map((notification, index) => (
            <Toast
              key={notification.id}
              id={notification.id}
              message={notification.message}
              variant={notification.variant}
              duration={notification.duration}
              important={notification.important}
              ariaLabel={notification.ariaLabel}
              role={notification.role}
              onDismiss={handleDismiss}
            />
          ))}
        </NotificationErrorBoundary>
      </AnimatePresence>
    </NotificationContainer>
  );
});

Notification.displayName = 'Notification';

export default Notification;