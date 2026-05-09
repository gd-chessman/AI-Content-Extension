import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/users.schema';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const cookieExtractor = (req: Request): string | null => {
      if (!req?.cookies) return null;
      return (req.cookies.access_token as string) || null;
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev_jwt_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const row = await this.usersService.findByIdForAuth(payload.sub);
    if (!row || !row.isActive) {
      throw new UnauthorizedException();
    }
    return {
      sub: payload.sub,
      username: row.username,
      role: row.role,
    };
  }
}
