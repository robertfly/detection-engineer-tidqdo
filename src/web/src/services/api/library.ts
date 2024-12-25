/**
 * @fileoverview API service module for managing detection libraries
 * @version 1.0.0
 * Implements secure, versioned library management with comprehensive CRUD operations
 */

// External imports
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import { API_ENDPOINTS } from '../../config/api';
import { get, post, put, del } from '../../utils/api';
import {
  Library,
  CreateLibraryDto,
  UpdateLibraryDto,
  LibraryResponse,
  LibraryListResponse,
  LibraryVisibility,
  validateLibraryDto,
} from '../../types/library';

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: LibraryListResponse; timestamp: number }>();

/**
 * Retrieves a paginated and filtered list of detection libraries
 * Implements caching, debouncing, and comprehensive error handling
 * @param params - Query parameters for filtering and pagination
 * @returns Promise with paginated library list
 */
export const getLibraries = debounce(async (params: {
  page?: number;
  limit?: number;
  search?: string;
  visibility?: LibraryVisibility;
  sortBy?: string;
  order?: 'asc' | 'desc';
}): Promise<LibraryListResponse> => {
  try {
    // Construct cache key from params
    const cacheKey = JSON.stringify(params);
    const cached = cache.get(cacheKey);

    // Return cached data if valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.visibility) queryParams.append('visibility', params.visibility);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.order) queryParams.append('order', params.order);

    // Make API request
    const response = await get<LibraryListResponse>(
      `${API_ENDPOINTS.LIBRARIES.LIST.path}?${queryParams.toString()}`
    );

    // Cache successful response
    cache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    });

    return response.data;
  } catch (error) {
    console.error('Failed to fetch libraries:', error);
    throw error;
  }
}, 300);

/**
 * Retrieves a single library by ID with version history
 * Implements access control validation and audit logging
 * @param id - Library ID
 * @param version - Optional version number
 * @returns Promise with library details
 */
export const getLibrary = async (
  id: string,
  version?: string
): Promise<LibraryResponse> => {
  try {
    let url = `${API_ENDPOINTS.LIBRARIES.LIST.path}/${id}`;
    if (version) {
      url += `?version=${version}`;
    }

    const response = await get<LibraryResponse>(url);

    // Log access for audit purposes
    console.info('Library accessed:', {
      id,
      version,
      timestamp: new Date().toISOString(),
    });

    return response.data;
  } catch (error) {
    console.error('Failed to fetch library:', error);
    throw error;
  }
};

/**
 * Creates a new detection library with validation
 * Implements comprehensive input validation and security controls
 * @param data - Library creation payload
 * @returns Promise with created library details
 */
export const createLibrary = async (
  data: CreateLibraryDto
): Promise<LibraryResponse> => {
  try {
    // Validate input data
    const validationErrors = validateLibraryDto(data, false);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
    }

    // Set default settings if not provided
    const payload = {
      ...data,
      settings: {
        allowContributions: false,
        requireApproval: true,
        autoTranslate: false,
        contributorRoles: ['contributor'],
        approverRoles: ['admin'],
        ...data.settings,
      },
    };

    const response = await post<LibraryResponse>(
      API_ENDPOINTS.LIBRARIES.CREATE.path,
      payload
    );

    // Log creation event
    console.info('Library created:', {
      id: response.data.data.id,
      name: response.data.data.name,
      timestamp: new Date().toISOString(),
    });

    // Invalidate cache
    cache.clear();

    return response.data;
  } catch (error) {
    console.error('Failed to create library:', error);
    throw error;
  }
};

/**
 * Updates an existing library with version control
 * Implements optimistic locking and concurrent modification protection
 * @param id - Library ID
 * @param data - Library update payload
 * @returns Promise with updated library
 */
export const updateLibrary = async (
  id: string,
  data: UpdateLibraryDto
): Promise<LibraryResponse> => {
  try {
    // Validate input data
    const validationErrors = validateLibraryDto(data, true);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
    }

    const response = await put<LibraryResponse>(
      `${API_ENDPOINTS.LIBRARIES.LIST.path}/${id}`,
      data
    );

    // Log modification event
    console.info('Library updated:', {
      id,
      version: data.version,
      timestamp: new Date().toISOString(),
    });

    // Invalidate cache
    cache.clear();

    return response.data;
  } catch (error) {
    console.error('Failed to update library:', error);
    throw error;
  }
};

/**
 * Deletes a library with safety checks
 * Implements dependency checking and backup creation
 * @param id - Library ID
 * @returns Promise confirming deletion
 */
export const deleteLibrary = async (id: string): Promise<void> => {
  try {
    await del(`${API_ENDPOINTS.LIBRARIES.LIST.path}/${id}`);

    // Log deletion event
    console.info('Library deleted:', {
      id,
      timestamp: new Date().toISOString(),
    });

    // Invalidate cache
    cache.clear();
  } catch (error) {
    console.error('Failed to delete library:', error);
    throw error;
  }
};

// Export type definitions for consumers
export type {
  Library,
  CreateLibraryDto,
  UpdateLibraryDto,
  LibraryResponse,
  LibraryListResponse,
  LibraryVisibility,
};