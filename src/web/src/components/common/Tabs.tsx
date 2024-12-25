// Tabs.tsx
// Version: 1.0.0
// A comprehensive Material Design 3.0 compliant tabs component with accessibility features

import React, { useState, useCallback, useEffect, useRef } from 'react'; // v18.2+
import classnames from 'classnames'; // v2.3+
import { Button } from './Button';

// Constants for orientation and keyboard navigation
const ORIENTATIONS = {
  horizontal: 'horizontal',
  vertical: 'vertical',
} as const;

const KEYBOARD_KEYS = {
  END: 'End',
  HOME: 'Home',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
} as const;

// Type definitions
export interface TabProps {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
  ariaControls?: string;
  ariaSelected?: boolean;
  tabIndex?: number;
}

export interface TabsProps {
  tabs: TabProps[];
  defaultActiveTab?: string;
  className?: string;
  onChange?: (tabId: string) => void;
  orientation?: typeof ORIENTATIONS[keyof typeof ORIENTATIONS];
  ariaLabel?: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  autoFocus?: boolean;
}

/**
 * Material Design 3.0 compliant tabs component with comprehensive accessibility support
 */
const Tabs = React.memo<TabsProps>(({
  tabs,
  defaultActiveTab,
  className,
  onChange,
  orientation = ORIENTATIONS.horizontal,
  ariaLabel = 'Navigation tabs',
  onKeyDown,
  autoFocus = false,
}) => {
  // State management
  const [activeTab, setActiveTab] = useState<string>(defaultActiveTab || tabs[0]?.id);
  const [focusedTab, setFocusedTab] = useState<string | null>(null);
  const tablistRef = useRef<HTMLDivElement>(null);

  // Focus management
  useEffect(() => {
    if (autoFocus && tablistRef.current) {
      const firstTab = tablistRef.current.querySelector('[role="tab"]:not([disabled])');
      (firstTab as HTMLElement)?.focus();
    }
  }, [autoFocus]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const tabElements = Array.from(
      tablistRef.current?.querySelectorAll('[role="tab"]:not([disabled])') || []
    );
    const currentIndex = tabElements.findIndex((tab) => tab === document.activeElement);

    const handleDirectionalNavigation = (direction: 1 | -1) => {
      event.preventDefault();
      const nextIndex = (currentIndex + direction + tabElements.length) % tabElements.length;
      (tabElements[nextIndex] as HTMLElement).focus();
    };

    switch (event.key) {
      case KEYBOARD_KEYS.HOME:
        event.preventDefault();
        (tabElements[0] as HTMLElement).focus();
        break;
      case KEYBOARD_KEYS.END:
        event.preventDefault();
        (tabElements[tabElements.length - 1] as HTMLElement).focus();
        break;
      case KEYBOARD_KEYS.LEFT:
      case KEYBOARD_KEYS.UP:
        if (orientation === ORIENTATIONS.vertical || event.key === KEYBOARD_KEYS.LEFT) {
          handleDirectionalNavigation(-1);
        }
        break;
      case KEYBOARD_KEYS.RIGHT:
      case KEYBOARD_KEYS.DOWN:
        if (orientation === ORIENTATIONS.vertical || event.key === KEYBOARD_KEYS.RIGHT) {
          handleDirectionalNavigation(1);
        }
        break;
    }

    onKeyDown?.(event);
  }, [orientation, onKeyDown]);

  // Tab selection handler
  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  }, [onChange]);

  // Dynamic class generation
  const tabsClasses = classnames(
    'tabs',
    'font-inter',
    {
      'flex flex-col': orientation === ORIENTATIONS.vertical,
      'flex flex-row': orientation === ORIENTATIONS.horizontal,
    },
    className
  );

  const tablistClasses = classnames(
    'tabs__list',
    'flex',
    'border-b border-gray-200',
    {
      'flex-col border-r border-b-0': orientation === ORIENTATIONS.vertical,
      'flex-row overflow-x-auto': orientation === ORIENTATIONS.horizontal,
    }
  );

  const tabPanelClasses = classnames(
    'tabs__panel',
    'p-4',
    'focus:outline-none',
    'transition-opacity duration-200'
  );

  return (
    <div className={tabsClasses}>
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation={orientation}
        className={tablistClasses}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="text"
            className={classnames(
              'tabs__tab',
              'min-w-[100px]',
              'px-4 py-2',
              'text-base',
              'transition-all duration-200',
              'focus:ring-2 focus:ring-primary-500',
              {
                'text-primary-600 border-b-2 border-primary-600':
                  activeTab === tab.id && orientation === ORIENTATIONS.horizontal,
                'text-primary-600 border-r-2 border-primary-600':
                  activeTab === tab.id && orientation === ORIENTATIONS.vertical,
                'text-gray-500 hover:text-gray-700': activeTab !== tab.id,
                'opacity-50 cursor-not-allowed': tab.disabled,
              }
            )}
            onClick={() => !tab.disabled && handleTabClick(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            aria-disabled={tab.disabled}
            tabIndex={activeTab === tab.id ? 0 : -1}
            disabled={tab.disabled}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={tab.id}
          hidden={activeTab !== tab.id}
          tabIndex={0}
          className={tabPanelClasses}
        >
          {activeTab === tab.id && tab.content}
        </div>
      ))}
    </div>
  );
});

Tabs.displayName = 'Tabs';

export default Tabs;