/// <reference types="vite/client" />

// Type definitions for image assets
interface ImageAsset {
  src: string;
}

// Type definitions for SVG files as React components
interface SVGComponent {
  ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
}

// Type declarations for Vite environment variables
interface ImportMetaEnv {
  /**
   * API base URL for backend service communication
   */
  readonly VITE_API_URL: string;

  /**
   * WebSocket server URL for real-time communication
   */
  readonly VITE_WS_URL: string;

  /**
   * Current environment identifier (development/staging/production)
   */
  readonly VITE_ENV: string;
}

// Extend ImportMeta interface to include env
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Type declarations for static asset imports
declare module '*.svg' {
  import React from 'react';
  const content: SVGComponent;
  export default content;
}

declare module '*.png' {
  const content: ImageAsset;
  export default content;
}

declare module '*.jpg' {
  const content: ImageAsset;
  export default content;
}

declare module '*.jpeg' {
  const content: ImageAsset;
  export default content;
}

declare module '*.gif' {
  const content: ImageAsset;
  export default content;
}

declare module '*.webp' {
  const content: ImageAsset;
  export default content;
}

declare module '*.ico' {
  const content: ImageAsset;
  export default content;
}

declare module '*.bmp' {
  const content: ImageAsset;
  export default content;
}