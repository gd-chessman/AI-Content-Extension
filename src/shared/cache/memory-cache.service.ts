import { Injectable, Logger } from '@nestjs/common';

export interface MemoryCacheOptions {
  ttl?: number;
  prefix?: string;
}

interface CacheItem {
  value: any;
  expiresAt: number;
}

@Injectable()
export class MemoryCacheService {
  private readonly logger = new Logger(MemoryCacheService.name);
  private readonly cache = new Map<string, CacheItem>();
  private readonly defaultTTL: number = 3600; // 1 hour in seconds
  private readonly maxKeys: number = 1000;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired items every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredItems();
    }, 5 * 60 * 1000);
  }

  /**
   * Store data in memory cache
   */
  async set(key: string, value: any, options?: MemoryCacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || this.defaultTTL;
      const cacheKey = this.buildKey(key, options?.prefix);
      
      // Check max keys limit
      await this.checkMaxKeys();
      
      const expiresAt = Date.now() + (ttl * 1000);
      this.cache.set(cacheKey, { value, expiresAt });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get data from memory cache
   */
  async get<T = any>(key: string, options?: MemoryCacheOptions): Promise<T | null> {
    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const item = this.cache.get(cacheKey);
      
      if (!item) {
        return null;
      }
      
      // Check if item is expired
      if (Date.now() > item.expiresAt) {
        this.cache.delete(cacheKey);
        return null;
      }
      
      return item.value;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete data from memory cache
   */
  async delete(key: string, options?: MemoryCacheOptions): Promise<boolean> {
    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const result = this.cache.delete(cacheKey);
      
      return result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete all cache with pattern
   */
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      let deletedCount = 0;
      
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if key exists in memory cache
   */
  async exists(key: string, options?: MemoryCacheOptions): Promise<boolean> {
    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const item = this.cache.get(cacheKey);
      
      if (!item) return false;
      
      // Check if item is expired
      if (Date.now() > item.expiresAt) {
        this.cache.delete(cacheKey);
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get TTL of key
   */
  async getTTL(key: string, options?: MemoryCacheOptions): Promise<number> {
    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const item = this.cache.get(cacheKey);
      
      if (!item) return -2; // Key doesn't exist
      
      const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -1; // -1 for expired
    } catch (error) {
      return -1;
    }
  }

  /**
   * Extend TTL for key
   */
  async extendTTL(key: string, ttl: number, options?: MemoryCacheOptions): Promise<boolean> {
    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const item = this.cache.get(cacheKey);
      
      if (!item) return false;
      
      item.expiresAt = Date.now() + (ttl * 1000);
      this.cache.set(cacheKey, item);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all keys with pattern
   */
  async getKeys(pattern: string): Promise<string[]> {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const keys: string[] = [];
      
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keys.push(key);
        }
      }
      
      return keys;
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear all memory cache
   */
  async flushAll(): Promise<void> {
    try {
      this.cache.clear();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get memory cache stats
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    connectedClients: number;
  }> {
    try {
      const totalKeys = this.cache.size;
      const memoryUsage = this.getMemoryUsage();
      
      return {
        totalKeys,
        memoryUsage,
        connectedClients: 1, // Always 1 for in-memory
      };
    } catch (error) {
      return {
        totalKeys: 0,
        memoryUsage: 'Unknown',
        connectedClients: 0,
      };
    }
  }

  /**
   * Build cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * Check and remove old keys if exceeding limit
   */
  private async checkMaxKeys(): Promise<void> {
    try {
      if (this.cache.size >= this.maxKeys) {
        // Remove expired items first
        this.cleanupExpiredItems();
        
        // If still over limit, remove oldest items
        if (this.cache.size >= this.maxKeys) {
          const entries = Array.from(this.cache.entries());
          entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
          
          const keysToDelete = Math.ceil(this.maxKeys * 0.1);
          const keysToRemove = entries.slice(0, keysToDelete).map(([key]) => key);
          
          keysToRemove.forEach(key => this.cache.delete(key));
        }
      }
    } catch (error) {
      // Silent error handling
    }
  }

  /**
   * Clean up expired items
   */
  private cleanupExpiredItems(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    

  }

  /**
   * Get memory usage estimation
   */
  private getMemoryUsage(): string {
    try {
      const usage = process.memoryUsage();
      const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
      return `${usedMB}MB`;
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Cleanup on destroy
   */
  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
} 