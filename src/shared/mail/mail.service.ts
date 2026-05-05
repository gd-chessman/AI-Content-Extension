import { Injectable, Inject } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(
    @Inject('MAIL_TRANSPORTER') private transporter: nodemailer.Transporter,
    private configService: ConfigService,
  ) {
    this.fromEmail = this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('SMTP_USER');
    this.fromName = this.configService.get<string>('SMTP_FROM_NAME', 'NestJS App');
  }

  async sendEmail(options: EmailOptions): Promise<nodemailer.SentMessageInfo> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const result = await this.transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to: ${options.to}`);
    return result;
  }

  async sendWelcomeEmail(to: string, username: string): Promise<nodemailer.SentMessageInfo> {
    return this.sendEmail({
      to,
      subject: 'Chào mừng bạn!',
      html: `
        <h2>Chào mừng ${username}!</h2>
        <p>Cảm ơn bạn đã đăng ký tài khoản.</p>
        <p>Email: ${to}</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, resetToken: string, username: string): Promise<nodemailer.SentMessageInfo> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    
    return this.sendEmail({
      to,
      subject: 'Đặt lại mật khẩu',
      html: `
        <h2>Xin chào ${username}!</h2>
        <p>Click vào link sau để đặt lại mật khẩu:</p>
        <a href="${resetUrl}">Đặt lại mật khẩu</a>
        <p>Link: ${resetUrl}</p>
      `,
    });
  }

  async sendNotificationEmail(to: string | string[], title: string, message: string): Promise<nodemailer.SentMessageInfo> {
    return this.sendEmail({
      to,
      subject: title,
      html: `
        <h2>${title}</h2>
        <p>${message}</p>
      `,
    });
  }
} 