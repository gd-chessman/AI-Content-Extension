import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { JwtPayload } from '../../modules/auth/jwt.strategy';
import { Roles } from '../../modules/auth/roles.decorator';
import { RolesGuard } from '../../modules/auth/roles.guard';
import { UserRole } from '../../modules/users/users.schema';
import { SignCloudinaryUploadDto } from './cloudinary.dto';
import { CloudinaryService, CloudinarySignedUploadParams } from './cloudinary.service';

/**
 * API upload Cloudinary dùng chung — client direct upload (signed).
 * POST /uploads/cloudinary/signature → chữ ký upload → path ai-content/{subfolder}/{userId}.
 */
@Controller('uploads/cloudinary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('signature')
  createUploadSignature(
    @Req() req: Request,
    @Body() dto: SignCloudinaryUploadDto,
  ): CloudinarySignedUploadParams {
    const user = req.user as JwtPayload;
    return this.cloudinaryService.createSignedUploadParams(user.sub, {
      subfolder: dto.subfolder,
      resourceType: dto.resourceType,
    });
  }
}
