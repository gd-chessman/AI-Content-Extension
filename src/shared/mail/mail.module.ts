import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailProvider } from './mail.provider';

@Module({
  providers: [MailProvider, MailService],
  exports: [MailService],
})
export class MailModule {} 