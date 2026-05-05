import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { CacheService } from './cache.service';

export interface CacheInterceptorOptions {
  ttl?: number;
  prefix?: string;
  key?: string | ((request: any) => string);
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CacheService) private readonly cacheService: CacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Chỉ cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    // Lấy cache options từ metadata hoặc decorator
    const cacheOptions = this.getCacheOptions(context);
    if (!cacheOptions) {
      return next.handle();
    }

    const cacheKey = this.buildCacheKey(request, cacheOptions);
    
    // Thử lấy từ cache trước
    const cachedData = await this.cacheService.get(cacheKey, {
      ttl: cacheOptions.ttl,
      prefix: cacheOptions.prefix,
    });

    if (cachedData !== null) {
      // Trả về dữ liệu từ cache
      return of(cachedData);
    }

    // Nếu không có trong cache, thực hiện request và cache kết quả
    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.cacheService.set(cacheKey, data, {
            ttl: cacheOptions.ttl,
            prefix: cacheOptions.prefix,
          });
        } catch (error) {
          // Log error nhưng không throw để không ảnh hưởng response
          console.error('Cache set error:', error);
        }
      }),
      catchError((error) => {
        // Nếu có lỗi, không cache
        return of(error);
      }),
    );
  }

  private getCacheOptions(context: ExecutionContext): CacheInterceptorOptions | null {
    // Có thể mở rộng để lấy từ metadata, decorator, hoặc config
    // Hiện tại trả về default options
    return {
      ttl: 3600, // 1 hour default
      prefix: 'api',
    };
  }

  private buildCacheKey(request: any, options: CacheInterceptorOptions): string {
    if (typeof options.key === 'function') {
      return options.key(request);
    }

    if (typeof options.key === 'string') {
      return options.key;
    }

    // Tạo key từ URL và query params
    const url = request.url;
    const queryString = JSON.stringify(request.query);
    const paramsString = JSON.stringify(request.params);
    
    return `${url}:${queryString}:${paramsString}`;
  }
}

// Decorator để đánh dấu endpoint cần cache
export const Cacheable = (options?: CacheInterceptorOptions) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    // Có thể mở rộng để lưu metadata
    return descriptor;
  };
};

// Decorator để xóa cache
export const CacheEvict = (pattern?: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      // Xóa cache sau khi thực hiện method
      if (pattern) {
        const cacheService = this.cacheService;
        if (cacheService) {
          await cacheService.deleteByPattern(pattern);
        }
      }
      
      return result;
    };
    
    return descriptor;
  };
};
