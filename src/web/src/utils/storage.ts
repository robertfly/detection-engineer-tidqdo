// External imports
import CryptoJS from 'crypto-js'; // v4.1.1 - Encryption for sensitive storage

// Constants
const ENCRYPTION_KEY = process.env.REACT_APP_STORAGE_ENCRYPTION_KEY || 'default-key';
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // 5MB default quota
const SESSION_KEY_PREFIX = 'session:';

// Types
type StorageError = {
  code: string;
  message: string;
  details?: unknown;
};

interface StorageQuotaInfo {
  used: number;
  available: number;
  total: number;
}

// Error handling utility
const createError = (code: string, message: string, details?: unknown): StorageError => ({
  code,
  message,
  details,
});

/**
 * Enhanced browser storage utility providing secure, type-safe storage operations
 * with encryption, validation, and quota management.
 */
class SecureStorage {
  private cache: Map<string, unknown>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Retrieves and decrypts an item from local storage with type safety and validation
   * @param key - Storage key to retrieve
   * @param encrypt - Whether the value is encrypted
   * @returns Parsed and optionally decrypted value of type T or null if not found
   */
  public getItem<T>(key: string, encrypt = false): T | null {
    try {
      const rawValue = localStorage.getItem(key);
      
      if (!rawValue) {
        return null;
      }

      let parsedValue: T;

      if (encrypt) {
        const decrypted = CryptoJS.AES.decrypt(rawValue, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
        if (!decrypted) {
          throw createError('STORAGE_001', 'Failed to decrypt value');
        }
        parsedValue = JSON.parse(decrypted);
      } else {
        parsedValue = JSON.parse(rawValue);
      }

      // Cache the retrieved value
      this.cache.set(key, parsedValue);

      return parsedValue;
    } catch (error) {
      console.error('Storage getItem error:', createError('STORAGE_002', 'Failed to retrieve item', error));
      return null;
    }
  }

  /**
   * Stores and optionally encrypts a value in local storage with quota management
   * @param key - Storage key to set
   * @param value - Value to store
   * @param encrypt - Whether to encrypt the value
   * @returns Success status of storage operation
   */
  public async setItem<T>(key: string, value: T, encrypt = false): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      const storageValue = encrypt
        ? CryptoJS.AES.encrypt(serialized, ENCRYPTION_KEY).toString()
        : serialized;

      // Check storage quota before saving
      const hasSpace = await this.checkQuota(new Blob([storageValue]).size);
      if (!hasSpace) {
        throw createError('STORAGE_003', 'Storage quota exceeded');
      }

      localStorage.setItem(key, storageValue);
      this.cache.set(key, value);
      
      return true;
    } catch (error) {
      console.error('Storage setItem error:', createError('STORAGE_004', 'Failed to store item', error));
      return false;
    }
  }

  /**
   * Securely removes an item from local storage with logging
   * @param key - Storage key to remove
   */
  public removeItem(key: string): void {
    try {
      // Log removal for audit purposes
      console.info(`Removing storage item: ${key}`);
      
      localStorage.removeItem(key);
      this.cache.delete(key);
    } catch (error) {
      console.error('Storage removeItem error:', createError('STORAGE_005', 'Failed to remove item', error));
    }
  }

  /**
   * Securely clears all items from local storage with confirmation
   * @param preserveSession - Whether to preserve session-related items
   */
  public clear(preserveSession = false): void {
    try {
      // Log clear operation for audit purposes
      console.info('Clearing storage', { preserveSession });

      if (preserveSession) {
        // Store session items temporarily
        const sessionItems = new Map<string, unknown>();
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith(SESSION_KEY_PREFIX)) {
            sessionItems.set(key, this.getItem(key));
          }
        }

        localStorage.clear();
        this.cache.clear();

        // Restore session items
        sessionItems.forEach((value, key) => {
          if (value !== null) {
            this.setItem(key, value);
          }
        });
      } else {
        localStorage.clear();
        this.cache.clear();
      }
    } catch (error) {
      console.error('Storage clear error:', createError('STORAGE_006', 'Failed to clear storage', error));
    }
  }

  /**
   * Checks available storage quota and manages storage cleanup
   * @param requiredBytes - Number of bytes needed for storage
   * @returns Whether required space is available
   */
  public async checkQuota(requiredBytes: number): Promise<boolean> {
    try {
      const quota = await this.getQuotaInfo();
      
      if (quota.available >= requiredBytes) {
        return true;
      }

      // Attempt to free up space by clearing cache
      this.cache.clear();
      
      // Recheck quota after cleanup
      const updatedQuota = await this.getQuotaInfo();
      return updatedQuota.available >= requiredBytes;
    } catch (error) {
      console.error('Storage quota check error:', createError('STORAGE_007', 'Failed to check quota', error));
      return false;
    }
  }

  /**
   * Gets current storage quota information
   * @private
   * @returns Storage quota information
   */
  private async getQuotaInfo(): Promise<StorageQuotaInfo> {
    const estimate = await navigator.storage?.estimate();
    return {
      used: estimate?.usage || 0,
      available: (estimate?.quota || STORAGE_QUOTA_BYTES) - (estimate?.usage || 0),
      total: estimate?.quota || STORAGE_QUOTA_BYTES,
    };
  }
}

// Export singleton instance
export const storage = new SecureStorage();

// Export type definitions for consumers
export type { StorageError, StorageQuotaInfo };