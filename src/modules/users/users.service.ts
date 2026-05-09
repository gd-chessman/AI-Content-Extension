import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto, PatchUserByAdminDto, UpdateMeDto } from './users.dto';
import { User, UserDocument, UserGender, UserRole } from './users.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async findByUsername(username: string) {
    return this.userModel.findOne({ username: username.toLowerCase().trim() });
  }

  async findByIdForAuth(userId: string) {
    return this.userModel
      .findById(userId)
      .select('username role isActive')
      .lean<{ username: string; role: UserRole; isActive: boolean }>();
  }

  async getMe(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      id: String(user._id),
      username: user.username,
      name: user.name || '',
      role: user.role,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl || '',
      telegramId: user.telegramId || '',
      birthDate: user.birthDate || null,
      gender: user.gender || UserGender.OTHER,
    };
  }

  async createUser(dto: CreateUserDto) {
    const username = (dto.username || '').toLowerCase().trim();
    const password = (dto.password || '').trim();
    if (!username || !password) {
      throw new BadRequestException('Username and password are required.');
    }

    const existed = await this.findByUsername(username);
    if (existed) {
      throw new ConflictException('Username already exists.');
    }

    const avatarUrl = this.normalizeAvatarUrl(dto.avatarUrl);
    const telegramId = this.normalizeTelegramId(dto.telegramId);
    const birthDate = this.normalizeBirthDate(dto.birthDate);
    const gender = this.normalizeGender(dto.gender);
    const name = this.normalizeName(dto.name);

    const passwordHash = await bcrypt.hash(password, 10);
    const role =
      dto.role === 'user-vip' ? UserRole.USER_VIP : UserRole.USER;

    const created = await this.userModel.create({
      username,
      passwordHash,
      role,
      isActive: true,
      name,
      avatarUrl,
      telegramId,
      birthDate,
      gender,
    });

    return {
      id: String(created._id),
      username: created.username,
      name: created.name || '',
      role: created.role,
      isActive: created.isActive,
      avatarUrl: created.avatarUrl || '',
      telegramId: created.telegramId || '',
      birthDate: created.birthDate || null,
      gender: created.gender || UserGender.OTHER,
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    if (
      dto.avatarUrl === undefined &&
      dto.telegramId === undefined &&
      dto.birthDate === undefined &&
      dto.gender === undefined &&
      dto.name === undefined
    ) {
      throw new BadRequestException('Nothing to update.');
    }

    const patch: {
      name?: string;
      avatarUrl?: string;
      telegramId?: string;
      birthDate?: Date | null;
      gender?: UserGender;
    } = {};
    if (dto.name !== undefined) {
      patch.name = this.normalizeName(dto.name);
    }
    if (dto.avatarUrl !== undefined) {
      patch.avatarUrl = this.normalizeAvatarUrl(dto.avatarUrl);
    }
    if (dto.telegramId !== undefined) {
      patch.telegramId = this.normalizeTelegramId(dto.telegramId);
    }
    if (dto.birthDate !== undefined) {
      patch.birthDate = this.normalizeBirthDate(dto.birthDate);
    }
    if (dto.gender !== undefined) {
      patch.gender = this.normalizeGender(dto.gender);
    }

    const updated = await this.userModel.findByIdAndUpdate(userId, patch, {
      new: true,
    });
    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return {
      id: String(updated._id),
      username: updated.username,
      name: updated.name || '',
      role: updated.role,
      isActive: updated.isActive,
      avatarUrl: updated.avatarUrl || '',
      telegramId: updated.telegramId || '',
      birthDate: updated.birthDate || null,
      gender: updated.gender || UserGender.OTHER,
    };
  }

  async patchByAdmin(targetId: string, dto: PatchUserByAdminDto) {
    if (dto.role === undefined) {
      throw new BadRequestException('Nothing to update.');
    }

    let nextRole: UserRole;
    switch (dto.role) {
      case 'admin':
        nextRole = UserRole.ADMIN;
        break;
      case 'user-vip':
        nextRole = UserRole.USER_VIP;
        break;
      case 'user':
        nextRole = UserRole.USER;
        break;
      default:
        throw new BadRequestException('Invalid role.');
    }

    const updated = await this.userModel.findByIdAndUpdate(
      targetId,
      { role: nextRole },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return {
      id: String(updated._id),
      username: updated.username,
      name: updated.name || '',
      role: updated.role,
      isActive: updated.isActive,
      avatarUrl: updated.avatarUrl || '',
      telegramId: updated.telegramId || '',
      birthDate: updated.birthDate || null,
      gender: updated.gender || UserGender.OTHER,
    };
  }

  async ensureAdminAccount() {
    const adminUsername = (
      this.configService.get<string>('ADMIN_USERNAME') || 'admin'
    )
      .toLowerCase()
      .trim();
    const adminPassword =
      this.configService.get<string>('ADMIN_PASSWORD') || 'admin123456';

    const existed = await this.findByUsername(adminUsername);
    if (existed) return;

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await this.userModel.create({
      username: adminUsername,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      name: 'Admin',
      avatarUrl: '',
      telegramId: '',
      birthDate: null,
      gender: UserGender.OTHER,
    });
  }

  private normalizeAvatarUrl(raw?: string) {
    const value = (raw || '').trim();
    if (!value) return '';
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BadRequestException('Avatar URL must use http or https.');
      }
      return parsed.toString();
    } catch {
      throw new BadRequestException('Invalid avatar URL format.');
    }
  }

  private normalizeName(raw?: string) {
    const value = (raw || '').trim();
    if (!value) return '';
    return value.slice(0, 80);
  }

  private normalizeTelegramId(raw?: string) {
    const value = (raw || '').trim();
    if (!value) return '';
    return value.slice(0, 80);
  }

  private normalizeBirthDate(raw?: string) {
    const value = (raw || '').trim();
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid birth date format.');
    }
    return date;
  }

  private normalizeGender(raw?: string): UserGender {
    const value = (raw || '').trim().toLowerCase();
    if (!value) return UserGender.OTHER;
    if (value === UserGender.MALE) return UserGender.MALE;
    if (value === UserGender.FEMALE) return UserGender.FEMALE;
    if (value === UserGender.OTHER) return UserGender.OTHER;
    throw new BadRequestException('Invalid gender.');
  }
}
