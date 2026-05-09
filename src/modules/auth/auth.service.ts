import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/users.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private cookieOpts(maxAge: number) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      maxAge,
    };
  }

  private buildPayload(user: { _id: unknown; username: string; role: UserRole }) {
    return {
      sub: String(user._id),
      username: user.username,
      role: user.role,
    };
  }

  private async setAuthCookies(
    res: Response,
    user: { _id: unknown; username: string; role: UserRole },
  ) {
    const accessExp =
      this.configService.get<string>('JWT_ACCESS_EXPIRES') || '15m';
    const refreshExp =
      this.configService.get<string>('JWT_REFRESH_EXPIRES') || '7d';
    const payload = this.buildPayload(user);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: accessExp }),
      this.jwtService.signAsync(payload, { expiresIn: refreshExp }),
    ]);

    res.cookie('access_token', accessToken, this.cookieOpts(15 * 60 * 1000));
    res.cookie(
      'refresh_token',
      refreshToken,
      this.cookieOpts(7 * 24 * 60 * 60 * 1000),
    );
  }

  async login(username: string, password: string, res: Response) {
    const normalizedUsername = (username || '').toLowerCase().trim();
    const normalizedPassword = (password || '').trim();
    if (!normalizedUsername || !normalizedPassword) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const user = await this.usersService.findByUsername(normalizedUsername);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const ok = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    await this.setAuthCookies(res, user);

    return {
      user: {
        id: String(user._id),
        username: user.username,
        role: user.role,
      },
    };
  }

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing.');
    }

    try {
      const payload = this.jwtService.verify<{
        sub: string;
        username: string;
        role: UserRole;
      }>(refreshToken);
      const user = await this.usersService.findByUsername(payload.username);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      const accessExp =
        this.configService.get<string>('JWT_ACCESS_EXPIRES') || '15m';
      const accessToken = await this.jwtService.signAsync(
        this.buildPayload(user),
        { expiresIn: accessExp },
      );
      res.cookie('access_token', accessToken, this.cookieOpts(15 * 60 * 1000));

      return {
        user: {
          id: String(user._id),
          username: user.username,
          role: user.role,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }
  }

  logout(res: Response) {
    const opts = { ...this.cookieOpts(0), maxAge: 0 };
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    return { message: 'Logged out.' };
  }
}
