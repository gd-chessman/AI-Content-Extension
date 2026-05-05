import { Module } from '@nestjs/common';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { MailModule } from './mail/mail.module';
import { SharedCacheModule } from './cache/cache.module';

@Module({
  imports: [CloudinaryModule, MailModule, SharedCacheModule.forRoot()],
  exports: [CloudinaryModule, MailModule, SharedCacheModule],
})
export class SharedModule {} 