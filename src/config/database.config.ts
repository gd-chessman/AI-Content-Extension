import { ConfigService } from '@nestjs/config';

export const databaseConfig = (configService: ConfigService) => {
  const uri = configService.get<string>('DATABASE_URI');

  // Trả về cấu hình MongoDB
  return {
    uri,
  };
};
