// TypeScript v5.0+
// Defines WebSocket event types and interfaces for real-time communication

/**
 * Enum defining all available WebSocket event types in the system
 */
export enum WebSocketEventType {
    DETECTION_CREATED = 'detection.created',
    INTELLIGENCE_PROCESSED = 'intelligence.processed',
    COVERAGE_UPDATED = 'coverage.updated',
    TRANSLATION_COMPLETE = 'translation.complete',
    ERROR = 'error'
}

/**
 * Enum defining priority levels for event processing
 */
export enum EventPriority {
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3
}

/**
 * Supported detection statuses
 */
export enum DetectionStatus {
    DRAFT = 'draft',
    PENDING_REVIEW = 'pending_review',
    APPROVED = 'approved',
    REJECTED = 'rejected'
}

/**
 * Supported intelligence source types
 */
export enum IntelligenceSource {
    PDF = 'pdf',
    URL = 'url',
    GITHUB = 'github',
    API = 'api'
}

/**
 * Supported security platforms for detection translation
 */
export enum SupportedPlatform {
    SPLUNK = 'splunk',
    ELASTIC = 'elastic',
    SENTINEL = 'sentinel',
    CHRONICLE = 'chronicle'
}

/**
 * Validation status for translated detections
 */
export enum ValidationStatus {
    PASSED = 'passed',
    FAILED = 'failed',
    PENDING = 'pending'
}

/**
 * Type alias for MITRE ATT&CK Technique IDs
 */
export type MitreTechniqueId = string;

/**
 * Type alias for coverage percentage (0-100)
 */
export type CoveragePercentage = number;

/**
 * Error codes for WebSocket error events
 */
export enum ErrorCode {
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    PROCESSING_ERROR = 'PROCESSING_ERROR',
    TRANSLATION_ERROR = 'TRANSLATION_ERROR',
    COVERAGE_ERROR = 'COVERAGE_ERROR',
    SYSTEM_ERROR = 'SYSTEM_ERROR'
}

/**
 * Base interface for all WebSocket events
 */
export interface WebSocketEvent {
    type: WebSocketEventType;
    payload: DetectionCreatedPayload | IntelligenceProcessedPayload | 
             TranslationCompletePayload | CoverageUpdatedPayload | ErrorPayload;
    version: string;
    priority: EventPriority;
}

/**
 * Payload interface for detection creation events
 */
export interface DetectionCreatedPayload {
    id: string;
    name: string;
    creator: string;
    timestamp: ISO8601;
    status: DetectionStatus;
}

/**
 * Payload interface for intelligence processing completion events
 */
export interface IntelligenceProcessedPayload {
    id: string;
    source: IntelligenceSource;
    detectionCount: number;
    timestamp: ISO8601;
    processingTime: number;
}

/**
 * Payload interface for translation completion events
 */
export interface TranslationCompletePayload {
    id: string;
    detectionId: string;
    platform: SupportedPlatform;
    timestamp: ISO8601;
    validationStatus: ValidationStatus;
}

/**
 * Payload interface for coverage update events
 */
export interface CoverageUpdatedPayload {
    techniques: MitreTechniqueId[];
    coverage: CoveragePercentage;
    timestamp: ISO8601;
    delta: number;
}

/**
 * Payload interface for error events
 */
export interface ErrorPayload {
    code: ErrorCode;
    message: string;
    timestamp: ISO8601;
    context: Record<string, unknown>;
}

/**
 * Type guard to check if a payload is a DetectionCreatedPayload
 */
export const isDetectionCreatedPayload = (
    payload: WebSocketEvent['payload']
): payload is DetectionCreatedPayload => {
    return 'creator' in payload && 'status' in payload;
};

/**
 * Type guard to check if a payload is an IntelligenceProcessedPayload
 */
export const isIntelligenceProcessedPayload = (
    payload: WebSocketEvent['payload']
): payload is IntelligenceProcessedPayload => {
    return 'source' in payload && 'detectionCount' in payload;
};

/**
 * Type guard to check if a payload is a TranslationCompletePayload
 */
export const isTranslationCompletePayload = (
    payload: WebSocketEvent['payload']
): payload is TranslationCompletePayload => {
    return 'platform' in payload && 'validationStatus' in payload;
};

/**
 * Type guard to check if a payload is a CoverageUpdatedPayload
 */
export const isCoverageUpdatedPayload = (
    payload: WebSocketEvent['payload']
): payload is CoverageUpdatedPayload => {
    return 'techniques' in payload && 'coverage' in payload;
};

/**
 * Type guard to check if a payload is an ErrorPayload
 */
export const isErrorPayload = (
    payload: WebSocketEvent['payload']
): payload is ErrorPayload => {
    return 'code' in payload && 'message' in payload;
};