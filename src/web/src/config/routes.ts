// React v18.2.0
import { lazy } from 'react';
import { RouteObject } from 'react-router-dom';
import { performance } from 'web-vitals';

// Internal layouts
import AuthLayout from '../layouts/AuthLayout';
import WorkbenchLayout from '../layouts/WorkbenchLayout';

/**
 * Enhanced interface for type-safe route configuration
 * Extends base RouteObject with additional enterprise features
 */
export interface RouteConfig extends RouteObject {
  /** Layout type identifier */
  layout?: keyof typeof LAYOUTS;
  /** Whether route requires authentication */
  protected?: boolean;
  /** Required user roles for access */
  roles?: string[];
  /** Route metadata for SEO and analytics */
  meta?: {
    title: string;
    description?: string;
    analytics?: Record<string, any>;
  };
  /** Component loading strategy */
  loadingStrategy?: 'eager' | 'lazy';
  /** Whether to wrap with error boundary */
  errorBoundary?: boolean;
  /** Nested routes configuration */
  children?: RouteConfig[];
}

/**
 * Layout components with code splitting
 */
const LAYOUTS = {
  auth: () => import('../layouts/AuthLayout'),
  dashboard: () => import('../layouts/DashboardLayout'),
  workbench: () => import('../layouts/WorkbenchLayout'),
  team: () => import('../layouts/TeamLayout')
} as const;

/**
 * Public routes accessible without authentication
 */
const PUBLIC_ROUTES: RouteConfig[] = [
  {
    path: '/auth/login',
    element: lazy(() => import('../pages/auth/Login')),
    layout: 'auth',
    meta: {
      title: 'Login - AI Detection Platform',
      description: 'Secure login to the AI Detection Platform',
      analytics: { page: 'login' }
    }
  },
  {
    path: '/auth/register',
    element: lazy(() => import('../pages/auth/Register')),
    layout: 'auth',
    meta: {
      title: 'Register - AI Detection Platform',
      description: 'Create a new account on the AI Detection Platform',
      analytics: { page: 'register' }
    }
  }
];

/**
 * Protected routes requiring authentication
 */
const PROTECTED_ROUTES: RouteConfig[] = [
  {
    path: '/dashboard',
    element: lazy(() => import('../pages/Dashboard')),
    layout: 'dashboard',
    protected: true,
    roles: ['user', 'admin'],
    meta: {
      title: 'Dashboard - AI Detection Platform',
      analytics: { page: 'dashboard' }
    }
  },
  {
    path: '/workbench',
    element: lazy(() => import('../pages/Workbench')),
    layout: 'workbench',
    protected: true,
    roles: ['user', 'admin'],
    meta: {
      title: 'AI Workbench - AI Detection Platform',
      analytics: { page: 'workbench' }
    }
  },
  {
    path: '/intelligence',
    element: lazy(() => import('../pages/Intelligence')),
    layout: 'dashboard',
    protected: true,
    roles: ['user', 'admin'],
    meta: {
      title: 'Intelligence - AI Detection Platform',
      analytics: { page: 'intelligence' }
    }
  },
  {
    path: '/libraries',
    element: lazy(() => import('../pages/Libraries')),
    layout: 'dashboard',
    protected: true,
    roles: ['user', 'admin'],
    meta: {
      title: 'Detection Libraries - AI Detection Platform',
      analytics: { page: 'libraries' }
    }
  }
];

/**
 * Enhanced HOC that wraps route elements with layouts, error boundaries,
 * and performance monitoring
 */
const withLayout = (Component: React.ComponentType, config: RouteConfig) => {
  return React.memo(() => {
    // Start performance measurement
    const routeStart = performance.now();

    // Load layout component
    const Layout = config.layout ? LAYOUTS[config.layout] : null;

    // Setup error boundary if specified
    const WrappedComponent = config.errorBoundary ? (
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>
    ) : (
      <Component />
    );

    // Track route performance
    React.useEffect(() => {
      const loadTime = performance.now() - routeStart;
      // Report to analytics
      if (config.meta?.analytics) {
        window.gtag?.('event', 'route_load', {
          page: config.meta.analytics.page,
          loadTime
        });
      }
    }, []);

    // Apply layout if specified
    return Layout ? (
      <Layout>
        {WrappedComponent}
      </Layout>
    ) : WrappedComponent;
  });
};

/**
 * Generates enterprise-grade route configuration with security and monitoring features
 */
const generateRoutes = (routes: RouteConfig[]): RouteObject[] => {
  return routes.map(route => {
    // Apply code splitting based on loading strategy
    const element = route.loadingStrategy === 'eager' ? 
      route.element :
      lazy(() => Promise.resolve({ default: route.element as React.ComponentType }));

    // Process route configuration
    const processedRoute: RouteObject = {
      path: route.path,
      element: withLayout(element as React.ComponentType, route),
      children: route.children ? generateRoutes(route.children) : undefined
    };

    return processedRoute;
  });
};

// Generate final route configuration
const routes = [
  ...generateRoutes(PUBLIC_ROUTES),
  ...generateRoutes(PROTECTED_ROUTES)
];

export default routes;