import { Module, Global, DynamicModule } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheInterceptor } from './cache.interceptor';
import { RedisProvider } from './cache.provider';

@Global()
@Module({})
export class SharedCacheModule {
  static forRoot(): DynamicModule {
    return {
      module: SharedCacheModule,
      providers: [
        RedisProvider,
        CacheService,
        CacheInterceptor,
      ],
      exports: [
        CacheService,
        CacheInterceptor,
      ],
    };
  }
}
