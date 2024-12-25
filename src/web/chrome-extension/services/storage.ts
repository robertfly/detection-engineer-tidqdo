// @ts-check
import type { Storage } from 'chrome-types'; // v0.1.0

/**
 * Constants for storage key names
 */
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_PROFILE: 'user_profile',
  PREFERENCES: 'user_preferences',
  CACHED_INTELLIGENCE: 'cached_intelligence',
  LAST_SYNC: 'last_sync_timestamp'
} as const;

/**
 * Time-to-live for cached data in milliseconds (24 hours)
 */
const CACHE_TTL = 86400000;

/**
 * Maximum number of cached intelligence items
 */
const MAX_CACHE_SIZE = 50;

/**
 * Keys that contain sensitive data requiring encryption
 */
const SENSITIVE_KEYS = ['AUTH_TOKEN', 'USER_PROFILE'] as const;

/**
 * Type for storage keys
 */
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Interface for user profile data
 */
interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Interface for user preferences
 */
interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  autoSync: boolean;
}

/**
 * Interface for cached intelligence data
 */
interface CachedIntelligence {
  id: string;
  data: unknown;
  timestamp: number;
  source: string;
}

/**
 * Type definition for storage data structure
 */
interface StorageData {
  auth_token: string | null;
  user_profile: UserProfile | null;
  user_preferences: UserPreferences;
  cached_intelligence: CachedIntelligence[];
  last_sync_timestamp: number;
}

/**
 * Interface for storage change events
 */
export interface StorageEvent {
  key: StorageKey;
  oldValue: any;
  newValue: any;
}

/**
 * Interface for storage operation errors
 */
export interface StorageError {
  code: string;
  message: string;
  details: object;
}

/**
 * Service class for managing Chrome extension storage operations with encryption and type safety
 */
export class StorageService {
  private storage: Storage.LocalStorageArea;
  private changeListeners: Set<(event: StorageEvent) => void>;
  private encoder: TextEncoder;
  private decoder: TextDecoder;

  constructor() {
    this.storage = chrome.storage.local;
    this.changeListeners = new Set();
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();

    // Setup storage change listener
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        this.handleStorageChanges(changes);
      }
    });
  }

  /**
   * Retrieves data from storage by key with type safety
   * @param key Storage key to retrieve
   * @returns Promise resolving to typed data or null
   */
  public async get<K extends StorageKey>(key: K): Promise<StorageData[K]> {
    try {
      const result = await this.storage.get(key);
      const value = result[key];

      if (SENSITIVE_KEYS.includes(key as any)) {
        return value ? await this.decrypt(value) : null;
      }

      return value || null;
    } catch (error) {
      throw this.createError('STORAGE_GET_ERROR', `Failed to get ${key}`, error);
    }
  }

  /**
   * Stores data in chrome.storage.local with encryption for sensitive data
   * @param key Storage key
   * @param value Data to store
   * @returns Promise resolving on completion
   */
  public async set<K extends StorageKey>(key: K, value: StorageData[K]): Promise<void> {
    try {
      const oldValue = await this.get(key);
      const valueToStore = SENSITIVE_KEYS.includes(key as any)
        ? await this.encrypt(value)
        : value;

      await this.storage.set({ [key]: valueToStore });
      this.emitChangeEvent(key, oldValue, value);
    } catch (error) {
      throw this.createError('STORAGE_SET_ERROR', `Failed to set ${key}`, error);
    }
  }

  /**
   * Adds a listener for storage changes
   * @param listener Function to call on storage changes
   */
  public addChangeListener(listener: (event: StorageEvent) => void): void {
    this.changeListeners.add(listener);
  }

  /**
   * Removes a storage change listener
   * @param listener Function to remove from listeners
   */
  public removeChangeListener(listener: (event: StorageEvent) => void): void {
    this.changeListeners.delete(listener);
  }

  /**
   * Caches intelligence data with TTL and size limits
   * @param intelligence Intelligence data to cache
   * @returns Promise resolving on completion
   */
  public async cacheIntelligence(intelligence: Omit<CachedIntelligence, 'timestamp'>): Promise<void> {
    try {
      const cached = await this.get(STORAGE_KEYS.CACHED_INTELLIGENCE) || [];
      const now = Date.now();

      // Remove expired items
      const validCache = cached.filter(item => 
        (now - item.timestamp) < CACHE_TTL
      );

      // Add new intelligence
      const newCache = [
        {
          ...intelligence,
          timestamp: now
        },
        ...validCache
      ].slice(0, MAX_CACHE_SIZE);

      await this.set(STORAGE_KEYS.CACHED_INTELLIGENCE, newCache);
    } catch (error) {
      throw this.createError('CACHE_ERROR', 'Failed to cache intelligence', error);
    }
  }

  /**
   * Handles storage change events from chrome.storage
   * @param changes Storage changes object
   */
  private handleStorageChanges(changes: { [key: string]: Storage.StorageChange }): void {
    Object.entries(changes).forEach(([key, change]) => {
      const storageKey = key as StorageKey;
      this.emitChangeEvent(storageKey, change.oldValue, change.newValue);
    });
  }

  /**
   * Emits a storage change event to all listeners
   * @param key Changed storage key
   * @param oldValue Previous value
   * @param newValue New value
   */
  private emitChangeEvent(key: StorageKey, oldValue: any, newValue: any): void {
    const event: StorageEvent = { key, oldValue, newValue };
    this.changeListeners.forEach(listener => listener(event));
  }

  /**
   * Creates a standardized error object
   * @param code Error code
   * @param message Error message
   * @param details Error details
   * @returns StorageError object
   */
  private createError(code: string, message: string, details: unknown): StorageError {
    return {
      code,
      message,
      details: details instanceof Error ? { message: details.message } : { details }
    };
  }

  /**
   * Encrypts sensitive data before storage
   * @param data Data to encrypt
   * @returns Encrypted data string
   */
  private async encrypt(data: any): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedData = this.encoder.encode(JSON.stringify(data));

      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
      );

      const encryptedArray = new Uint8Array(encryptedData);
      const combined = new Uint8Array(iv.length + encryptedArray.length);
      combined.set(iv);
      combined.set(encryptedArray, iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      throw this.createError('ENCRYPTION_ERROR', 'Failed to encrypt data', error);
    }
  }

  /**
   * Decrypts sensitive data from storage
   * @param encryptedData Encrypted data string
   * @returns Decrypted data
   */
  private async decrypt(encryptedData: string): Promise<any> {
    try {
      const key = await this.getEncryptionKey();
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      const decodedData = this.decoder.decode(decryptedData);
      return JSON.parse(decodedData);
    } catch (error) {
      throw this.createError('DECRYPTION_ERROR', 'Failed to decrypt data', error);
    }
  }

  /**
   * Gets or generates the encryption key for sensitive data
   * @returns CryptoKey for encryption/decryption
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(chrome.runtime.id),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.encoder.encode('ai-detection-platform'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
}