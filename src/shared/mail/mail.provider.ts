import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

export const MailProvider = {
  provide: 'MAIL_TRANSPORTER',
  useFactory: async (configService: ConfigService) => {
    const host = configService.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = configService.get<number>('SMTP_PORT', 587);
    const user = configService.get<string>('SMTP_USER');
    const pass = configService.get<string>('SMTP_PASS');

    // Nếu không có user hoặc pass, trả về null thay vì ném lỗi
    if (!user || !pass) {
      console.log('⚠️  SMTP_USER and SMTP_PASS not configured. Mail service will be disabled.');
      return null;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: false,
        auth: { user, pass },
      });

      await transporter.verify();
      console.log('📧 Mail server connected successfully');
      return transporter;
    } catch (error) {
      console.error('❌ Failed to connect to mail server:', error.message);
      return null;
    }
  },
  inject: [ConfigService],
}; 