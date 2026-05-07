import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpdateSettingsDto } from './settings.dto';
import { Setting, SettingDocument } from './settings.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name)
    private readonly settingsModel: Model<SettingDocument>,
  ) {}

  async getMySettings(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const found = await this.settingsModel.findOne({ userId: objectId });
    if (found) return found.toObject();

    const created = await this.settingsModel.create({
      userId: objectId,
      adminPath: '',
      ggSheetPath: '',
    });
    return created.toObject();
  }

  async updateMySettings(userId: string, dto: UpdateSettingsDto) {
    const patch: { adminPath?: string; ggSheetPath?: string } = {};
    if (dto.adminPath !== undefined) patch.adminPath = dto.adminPath.trim();
    if (dto.ggSheetPath !== undefined) patch.ggSheetPath = dto.ggSheetPath.trim();

    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    const updated = await this.settingsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      patch,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return updated.toObject();
  }
}
