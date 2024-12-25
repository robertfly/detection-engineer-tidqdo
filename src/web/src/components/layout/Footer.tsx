// Footer.tsx
// Version: 1.0.0
// Material Design 3.0 compliant footer component with enhanced accessibility and responsive design

import React, { memo } from 'react'; // v18.2+
import classnames from 'classnames'; // v2.3+
import { Button } from '../common/Button';

// Interface for footer link configuration
export interface FooterLink {
  label: string;
  href: string;
  icon?: string;
  ariaLabel: string;
}

// Props interface for the Footer component
export interface FooterProps {
  /** Additional CSS classes */
  className?: string;
  /** Toggle social media icons display */
  showSocial?: boolean;
  /** Custom footer links */
  customLinks?: FooterLink[];
  /** Copyright year override */
  year?: number;
}

// Default footer navigation links
const FOOTER_LINKS: FooterLink[] = [
  {
    label: 'Documentation',
    href: '/docs',
    ariaLabel: 'View documentation'
  },
  {
    label: 'Community',
    href: '/community',
    ariaLabel: 'Join our community'
  },
  {
    label: 'Support',
    href: '/support',
    ariaLabel: 'Get support'
  }
];

// Social media links
const SOCIAL_LINKS: FooterLink[] = [
  {
    label: 'GitHub',
    href: 'https://github.com',
    icon: 'github',
    ariaLabel: 'Visit our GitHub repository'
  },
  {
    label: 'Twitter',
    href: 'https://twitter.com',
    icon: 'twitter',
    ariaLabel: 'Follow us on Twitter'
  }
];

/**
 * Footer component implementing Material Design 3.0 specifications
 * with responsive layout and accessibility features
 */
const Footer = memo(({
  className,
  showSocial = true,
  customLinks,
  year
}: FooterProps) => {
  const currentYear = year || new Date().getFullYear();
  const links = customLinks || FOOTER_LINKS;

  // Combine classes following Material Design 3.0 specifications
  const footerClasses = classnames(
    // Base styles
    'footer',
    'w-full',
    'bg-white',
    'dark:bg-gray-900',
    'border-t',
    'border-gray-200',
    'dark:border-gray-800',
    'py-8',
    'font-inter',
    
    // Responsive padding
    'px-4',
    'sm:px-6',
    'lg:px-8',
    
    // Custom classes
    className
  );

  const containerClasses = classnames(
    'max-w-7xl',
    'mx-auto',
    'grid',
    'gap-8',
    'grid-cols-1',
    'md:grid-cols-2',
    'lg:grid-cols-3',
    'items-start'
  );

  return (
    <footer 
      className={footerClasses}
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className={containerClasses}>
        {/* Navigation Links Section */}
        <nav 
          className="flex flex-col space-y-4"
          aria-label="Footer navigation"
        >
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Navigation
          </h2>
          <ul className="space-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Button
                  variant="text"
                  size="small"
                  className="text-gray-600 hover:text-primary-600 dark:text-gray-400"
                  ariaLabel={link.ariaLabel}
                  onClick={() => window.location.href = link.href}
                >
                  {link.label}
                </Button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Social Media Section */}
        {showSocial && (
          <div className="flex flex-col space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Connect With Us
            </h2>
            <ul className="flex space-x-4">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.href}>
                  <Button
                    variant="text"
                    size="small"
                    className="text-gray-600 hover:text-primary-600 dark:text-gray-400"
                    ariaLabel={social.ariaLabel}
                    onClick={() => window.open(social.href, '_blank', 'noopener noreferrer')}
                  >
                    <span className="sr-only">{social.label}</span>
                    <i className={`icon icon-${social.icon}`} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Copyright Section */}
        <div className="flex flex-col space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Legal
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            © {currentYear} AI Detection Platform.
            <br />
            All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
});

// Display name for debugging
Footer.displayName = 'Footer';

export default Footer;