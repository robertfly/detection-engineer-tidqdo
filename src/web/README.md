# AI-Driven Detection Engineering Platform Frontend

Enterprise-grade web application for AI-powered security detection creation, management, and collaboration.

## Overview

The AI-Driven Detection Engineering Platform frontend is a React-based web application that provides:

- AI-powered detection authoring and management
- Real-time collaboration features
- Cross-platform detection translation
- Enterprise-grade security controls
- Advanced coverage analysis
- Community-driven detection sharing

## Prerequisites

- Node.js >= 18.0.0 (LTS recommended)
- npm >= 9.0.0
- Docker >= 24.0.0 and Docker Compose >= 2.20.0 (for containerized development)
- Git >= 2.40.0
- Modern web browser (Chrome >= 100, Firefox >= 100, Safari >= 15)
- Minimum 8GB RAM for development
- WSL2 for Windows users

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd src/web
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Required environment variables:
- `VITE_API_BASE_URL` - Backend API base URL (default: http://localhost:8000)
- `VITE_API_VERSION` - API version (default: v1)
- `VITE_WEBSOCKET_PROTOCOL` - WebSocket protocol (default: v1.detection.ai)
- `VITE_AUTH_DOMAIN` - Authentication provider domain
- `VITE_AUTH_CLIENT_ID` - OAuth client identifier

4. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install project dependencies |
| `npm run dev` | Start development server with HMR |
| `npm run build` | Create optimized production build |
| `npm run test` | Run test suite with coverage |
| `npm run lint` | Run ESLint and StyleLint checks |
| `npm run type-check` | Verify TypeScript types |
| `docker-compose up` | Launch containerized development environment |

## Project Structure

```
src/web/
├── src/
│   ├── components/     # Reusable UI components
│   ├── features/       # Feature-specific modules
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Route components
│   ├── services/      # API and external services
│   ├── store/         # Redux state management
│   ├── styles/        # Global styles and Tailwind config
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Helper functions and constants
├── public/            # Static assets
├── tests/             # Test suites
└── config/            # Configuration files
```

## Development

### Technology Stack

- React 18.2.0 - UI framework
- TypeScript 5.0.2 - Type safety
- Redux Toolkit 1.9.7 - State management
- React Query 4.36.1 - Server state management
- TailwindCSS 3.3.5 - Styling
- Socket.io-client 4.7.2 - Real-time communication
- Monaco Editor 0.44.0 - Code editing
- Auth0 React 2.2.1 - Authentication

### Development Environment

#### Local Development

1. Ensure all prerequisites are installed
2. Configure environment variables
3. Install dependencies: `npm install`
4. Start development server: `npm run dev`

#### Docker Development

1. Build and start containers:
```bash
docker-compose up --build
```

2. Access the development server at `http://localhost:3000`

### Code Quality

- ESLint and Prettier for code formatting
- Husky for pre-commit hooks
- TypeScript strict mode enabled
- Jest and React Testing Library for testing
- Cypress for E2E testing

## Testing

### Unit Testing

```bash
# Run unit tests
npm run test

# Run tests with coverage
npm run test:coverage
```

### E2E Testing

```bash
# Run Cypress tests
npm run test:e2e
```

### Test Coverage Requirements

- Minimum 80% code coverage
- Critical paths require 100% coverage
- E2E tests for main user flows

## Deployment

### Production Build

```bash
# Create optimized production build
npm run build

# Preview production build
npm run preview
```

### Deployment Checklist

1. Verify environment variables
2. Run type checking: `npm run type-check`
3. Run tests: `npm run test`
4. Create production build: `npm run build`
5. Verify build output
6. Deploy to target environment

### Performance Optimization

- Route-based code splitting
- Image optimization
- Caching strategies
- Bundle size monitoring
- Performance monitoring with Web Vitals

## Security

### Authentication

- Auth0 integration for enterprise SSO
- JWT token management
- Secure session handling
- MFA support

### Authorization

- Role-based access control (RBAC)
- Feature-based permissions
- API scope validation

### Security Headers

- Content Security Policy (CSP)
- CORS configuration
- XSS protection
- CSRF protection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes with conventional commits
4. Submit pull request
5. Ensure CI checks pass

## License

[License details here]

## Support

[Support contact information]