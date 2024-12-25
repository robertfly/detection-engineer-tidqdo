// TypeScript v5.0+
// @reduxjs/toolkit v1.9.0+
// winston v3.8.0+

import { store } from '@reduxjs/toolkit';
import { logger } from 'winston';
import {
    WebSocketEventType,
    WebSocketEvent,
    DetectionCreatedPayload,
    IntelligenceProcessedPayload,
    TranslationCompletePayload,
    CoverageUpdatedPayload,
    ErrorPayload,
    isDetectionCreatedPayload,
    isIntelligenceProcessedPayload,
    isTranslationCompletePayload,
    isCoverageUpdatedPayload,
    isErrorPayload,
    ErrorCode
} from './events';

// Constants for performance monitoring
const PERFORMANCE_THRESHOLDS = {
    PROCESSING_TIME_MS: 500,
    MEMORY_THRESHOLD_MB: 50,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000
};

// Interface for WebSocket metrics
export interface WebSocketMetrics {
    processingTime: number;
    memoryUsage: number;
    errorCount: number;
    lastProcessedEvent: string;
    successRate: number;
}

// Metrics tracking
let metrics: WebSocketMetrics = {
    processingTime: 0,
    memoryUsage: 0,
    errorCount: 0,
    lastProcessedEvent: '',
    successRate: 100
};

/**
 * Main WebSocket message handler with enhanced error handling and performance monitoring
 * @param event MessageEvent containing WebSocket data
 */
export const handleWebSocketMessage = async (event: MessageEvent): Promise<void> => {
    const startTime = performance.now();
    const initialMemory = process.memoryUsage().heapUsed;

    try {
        // Parse and validate message
        const message = parseAndValidateMessage(event);
        if (!message) return;

        // Process message based on event type
        await processWebSocketEvent(message);

        // Update metrics
        updateMetrics(startTime, initialMemory, true);

    } catch (error) {
        handleWebSocketError(error, startTime, initialMemory);
    }
};

/**
 * Parses and validates incoming WebSocket messages
 * @param event Raw MessageEvent
 * @returns Validated WebSocketEvent or null
 */
const parseAndValidateMessage = (event: MessageEvent): WebSocketEvent | null => {
    try {
        const message: WebSocketEvent = JSON.parse(event.data);
        
        if (!message.type || !message.payload || !message.version) {
            throw new Error('Invalid message format');
        }

        return message;
    } catch (error) {
        logger.error('Message parsing failed:', error);
        return null;
    }
};

/**
 * Processes WebSocket events based on type with retry mechanism
 * @param message Validated WebSocket event
 */
const processWebSocketEvent = async (message: WebSocketEvent): Promise<void> => {
    let retries = 0;
    
    while (retries < PERFORMANCE_THRESHOLDS.MAX_RETRIES) {
        try {
            switch (message.type) {
                case WebSocketEventType.DETECTION_CREATED:
                    if (isDetectionCreatedPayload(message.payload)) {
                        await handleDetectionCreated(message.payload);
                    }
                    break;

                case WebSocketEventType.INTELLIGENCE_PROCESSED:
                    if (isIntelligenceProcessedPayload(message.payload)) {
                        await handleIntelligenceProcessed(message.payload);
                    }
                    break;

                case WebSocketEventType.COVERAGE_UPDATED:
                    if (isCoverageUpdatedPayload(message.payload)) {
                        await handleCoverageUpdated(message.payload);
                    }
                    break;

                case WebSocketEventType.TRANSLATION_COMPLETE:
                    if (isTranslationCompletePayload(message.payload)) {
                        await handleTranslationComplete(message.payload);
                    }
                    break;

                default:
                    logger.warn(`Unhandled event type: ${message.type}`);
            }
            return;

        } catch (error) {
            retries++;
            if (retries === PERFORMANCE_THRESHOLDS.MAX_RETRIES) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, PERFORMANCE_THRESHOLDS.RETRY_DELAY_MS));
        }
    }
};

/**
 * Handles detection created events
 * @param payload Detection creation payload
 */
const handleDetectionCreated = async (payload: DetectionCreatedPayload): Promise<void> => {
    logger.info(`Processing detection created: ${payload.id}`);
    
    try {
        await store.dispatch({
            type: 'detections/detectionCreated',
            payload
        });
        
        // Verify state update
        const state = store.getState();
        if (!state.detections[payload.id]) {
            throw new Error('State update verification failed');
        }
        
    } catch (error) {
        logger.error('Detection creation handling failed:', error);
        throw error;
    }
};

/**
 * Handles intelligence processed events
 * @param payload Intelligence processing payload
 */
const handleIntelligenceProcessed = async (payload: IntelligenceProcessedPayload): Promise<void> => {
    logger.info(`Processing intelligence completion: ${payload.id}`);
    
    try {
        await store.dispatch({
            type: 'intelligence/processingComplete',
            payload
        });
        
    } catch (error) {
        logger.error('Intelligence processing handling failed:', error);
        throw error;
    }
};

/**
 * Handles coverage updated events
 * @param payload Coverage update payload
 */
const handleCoverageUpdated = async (payload: CoverageUpdatedPayload): Promise<void> => {
    logger.info(`Processing coverage update: ${payload.coverage}%`);
    
    try {
        await store.dispatch({
            type: 'coverage/coverageUpdated',
            payload
        });
        
    } catch (error) {
        logger.error('Coverage update handling failed:', error);
        throw error;
    }
};

/**
 * Handles translation complete events
 * @param payload Translation completion payload
 */
const handleTranslationComplete = async (payload: TranslationCompletePayload): Promise<void> => {
    logger.info(`Processing translation completion: ${payload.detectionId}`);
    
    try {
        await store.dispatch({
            type: 'translations/translationComplete',
            payload
        });
        
    } catch (error) {
        logger.error('Translation completion handling failed:', error);
        throw error;
    }
};

/**
 * Handles WebSocket errors with standardized error reporting
 * @param error Error object
 * @param startTime Processing start time
 * @param initialMemory Initial memory usage
 */
const handleWebSocketError = (error: unknown, startTime: number, initialMemory: number): void => {
    const errorPayload: ErrorPayload = {
        code: ErrorCode.PROCESSING_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        context: {
            processingTime: performance.now() - startTime,
            memoryUsage: process.memoryUsage().heapUsed - initialMemory
        }
    };

    logger.error('WebSocket error:', errorPayload);
    updateMetrics(startTime, initialMemory, false);

    // Dispatch error to store
    store.dispatch({
        type: 'websocket/error',
        payload: errorPayload
    });
};

/**
 * Updates performance metrics
 * @param startTime Processing start time
 * @param initialMemory Initial memory usage
 * @param success Whether the operation was successful
 */
const updateMetrics = (startTime: number, initialMemory: number, success: boolean): void => {
    const processingTime = performance.now() - startTime;
    const memoryUsage = process.memoryUsage().heapUsed - initialMemory;

    metrics = {
        ...metrics,
        processingTime,
        memoryUsage,
        errorCount: success ? metrics.errorCount : metrics.errorCount + 1,
        lastProcessedEvent: new Date().toISOString(),
        successRate: ((metrics.successRate * 99 + (success ? 100 : 0)) / 100)
    };

    // Log performance warnings
    if (processingTime > PERFORMANCE_THRESHOLDS.PROCESSING_TIME_MS) {
        logger.warn(`High processing time: ${processingTime}ms`);
    }
    if (memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_THRESHOLD_MB * 1024 * 1024) {
        logger.warn(`High memory usage: ${memoryUsage / (1024 * 1024)}MB`);
    }
};

/**
 * Exposes current WebSocket metrics
 * @returns Current metrics
 */
export const getMetrics = (): WebSocketMetrics => ({
    ...metrics
});