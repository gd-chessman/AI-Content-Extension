export class CreateUserDto {
  username: string;
  password: string;
  avatarUrl?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
}

export class UpdateMeDto {
  avatarUrl?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
}
