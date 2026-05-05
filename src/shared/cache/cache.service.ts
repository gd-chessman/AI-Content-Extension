import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MemoryCacheService } from './memory-cache.service';

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTTL: number;
  private readonly maxKeys: number;

  private memoryCache: MemoryCacheService | null = null;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis | null,
    private readonly configService: ConfigService,
  ) {
    this.defaultTTL = this.configService.get<number>('REDIS_TTL', 3600);
    this.maxKeys = this.configService.get<number>('REDIS_MAX', 100);
  }

  /**
   * Initialize memory cache when needed
   */
  private async initMemoryCache(): Promise<MemoryCacheService> {
    if (!this.memoryCache) {
      console.log('🔄 Redis unavailable, using Memory Cache as fallback');
      this.memoryCache = new MemoryCacheService();
    }
    return this.memoryCache;
  }

  /**
   * Lưu dữ liệu vào cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const ttl = options?.ttl || this.defaultTTL;
      const cacheKey = this.buildKey(key, options?.prefix);
      
      // Kiểm tra số lượng keys hiện tại
      await this.checkMaxKeys();
      
      const serializedValue = JSON.stringify(value);
      await this.redis.setex(cacheKey, ttl, serializedValue);
      

    } catch (error) {
      const memoryCache = await this.initMemoryCache();
      await memoryCache.set(key, value, options);
    }
  }

  /**
   * Lấy dữ liệu từ cache
   */
  async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const value = await this.redis.get(cacheKey);
      
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value);
    } catch (error) {
      const memoryCache = await this.initMemoryCache();
      return await memoryCache.get<T>(key, options);
    }
  }

  /**
   * Xóa dữ liệu khỏi cache
   */
  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const result = await this.redis.del(cacheKey);
      
      return result > 0;
    } catch (error) {
      const memoryCache = await this.initMemoryCache();
      return await memoryCache.delete(key, options);
    }
  }

  /**
   * Xóa tất cả cache với prefix
   */
  async deleteByPattern(pattern: string): Promise<number> {
    if (!this.redis) {
      return 0;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      const result = await this.redis.del(...keys);
      return result;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Kiểm tra key có tồn tại trong cache không
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const result = await this.redis.exists(cacheKey);
      return result === 1;
    } catch (error) {
      const memoryCache = await this.initMemoryCache();
      return await memoryCache.exists(key, options);
    }
  }

  /**
   * Lấy TTL của key
   */
  async getTTL(key: string, options?: CacheOptions): Promise<number> {
    if (!this.redis) {
      return -1;
    }

    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      return await this.redis.ttl(cacheKey);
    } catch (error) {
      const memoryCache = await this.initMemoryCache();
      return await memoryCache.getTTL(key, options);
    }
  }

  /**
   * Gia hạn TTL cho key
   */
  async extendTTL(key: string, ttl: number, options?: CacheOptions): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, options?.prefix);
      const result = await this.redis.expire(cacheKey, ttl);
      return result === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Lấy tất cả keys với pattern
   */
  async getKeys(pattern: string): Promise<string[]> {
    if (!this.redis) {
      return [];
    }

    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      return [];
    }
  }

  /**
   * Xóa tất cả cache
   */
  async flushAll(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.flushall();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Lấy thông tin cache stats
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    connectedClients: number;
  }> {
    if (!this.redis) {
      return {
        totalKeys: 0,
        memoryUsage: 'N/A',
        connectedClients: 0,
      };
    }

    try {
      const info = await this.redis.info();
      const keys = await this.redis.dbsize();
      
      // Parse memory usage từ info
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'Unknown';
      
      // Parse connected clients từ info
      const clientsMatch = info.match(/connected_clients:(\d+)/);
      const connectedClients = clientsMatch ? parseInt(clientsMatch[1]) : 0;
      
      return {
        totalKeys: keys,
        memoryUsage,
        connectedClients,
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
   * Xây dựng cache key với prefix
   */
  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * Kiểm tra và xóa keys cũ nếu vượt quá giới hạn
   */
  private async checkMaxKeys(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const currentKeys = await this.redis.dbsize();
      if (currentKeys >= this.maxKeys) {
        // Lấy tất cả keys và sắp xếp theo thời gian tạo
        const keys = await this.redis.keys('*');
        const keyInfos = await Promise.all(
          keys.map(async (key) => {
            const ttl = await this.redis.ttl(key);
            return { key, ttl };
          })
        );
        
        // Sắp xếp theo TTL (keys có TTL thấp hơn sẽ bị xóa trước)
        keyInfos.sort((a, b) => a.ttl - b.ttl);
        
        // Xóa 10% keys cũ nhất
        const keysToDelete = Math.ceil(this.maxKeys * 0.1);
        const keysToRemove = keyInfos.slice(0, keysToDelete).map(k => k.key);
        
        if (keysToRemove.length > 0) {
          await this.redis.del(...keysToRemove);
        }
      }
    } catch (error) {
      // Silently ignore Redis connection errors in checkMaxKeys
    }
  }
}
