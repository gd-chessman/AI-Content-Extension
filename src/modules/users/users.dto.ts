export class CreateUserDto {
  username: string;
  password: string;
  name?: string;
  avatarUrl?: string;
  telegramId?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
}

export class UpdateMeDto {
  name?: string;
  avatarUrl?: string;
  telegramId?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
}
