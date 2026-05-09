export class CreateUserDto {
  username: string;
  password: string;
  name?: string;
  avatarUrl?: string;
  telegramId?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  /** `user` hoặc `user-vip` (không tạo admin qua API). */
  role?: 'user' | 'user-vip';
}

export class PatchUserByAdminDto {
  role?: 'user' | 'user-vip' | 'admin';
}

export class UpdateMeDto {
  name?: string;
  avatarUrl?: string;
  telegramId?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
}
