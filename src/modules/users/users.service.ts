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
import { CreateUserDto } from './users.dto';
import { User, UserDocument } from './users.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async findByUsername(username: string) {
    return this.userModel.findOne({ username: username.toLowerCase().trim() });
  }

  async getMe(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      id: String(user._id),
      username: user.username,
      role: user.role,
      isActive: user.isActive,
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

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await this.userModel.create({
      username,
      passwordHash,
      role: 'user',
      isActive: true,
    });

    return {
      id: String(created._id),
      username: created.username,
      role: created.role,
      isActive: created.isActive,
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
      role: 'admin',
      isActive: true,
    });
  }
}
