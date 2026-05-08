import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { MongooseExceptionFilter } from './exceptions/mongoose-exception.filter';
import { UsersService } from './modules/users/users.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new MongooseExceptionFilter());

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix, { exclude: ['/'] });

  // Lấy danh sách các domain từ biến môi trường, nếu không thì mặc định là localhost
  const frontendUrls = configService
    .get<string>('FRONTEND_URLS', 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean); // Tách các URL nếu có nhiều hơn 1 domain

  const port = configService.get<number>('APP_PORT', 8080);

  // Cấu hình CORS hỗ trợ subdomain
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        // Cho phép các yêu cầu không có origin (các công cụ test như Postman)
        return callback(null, true);
      }

      // Cho phép origin từ extension và localhost/dev
      if (
        origin.startsWith('chrome-extension://') ||
        /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)
      ) {
        return callback(null, true);
      }

      const isAllowed = frontendUrls.some((url) => {
        const regex = new RegExp(`^https?://([a-z0-9-]+\.)?${url.replace('http://', '').replace('https://', '')}$`);
        return regex.test(origin);
      });

      if (isAllowed) {
        callback(null, true); // Yêu cầu được phép
      } else {
        // Từ chối nhẹ nhàng để tránh log stack trace từ ExceptionsHandler
        callback(null, false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true, // Cho phép cookie
  });

  app.use(cookieParser());

  const usersService = app.get(UsersService);
  await usersService.ensureAdminAccount();

  await app.listen(port);
  console.log(`\uD83D\uDE80 Ứng dụng đang chạy tại: http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
