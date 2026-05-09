import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  USER_VIP = 'user-vip',
  ADMIN = 'admin',
}

export enum UserGender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  username: string;

  @Prop({ default: '', trim: true })
  name: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, default: UserRole.USER, enum: Object.values(UserRole) })
  role: UserRole;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ default: '', trim: true })
  telegramId: string;

  @Prop({ default: null })
  birthDate: Date | null;

  @Prop({ default: 'other', enum: ['male', 'female', 'other'] })
  gender: UserGender;
}

export const UserSchema = SchemaFactory.createForClass(User);
