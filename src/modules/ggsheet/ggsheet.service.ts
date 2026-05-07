import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpdateGgSheetDto } from './ggsheet.dto';
import { GgSheetSetting, GgSheetSettingDocument } from './ggsheet.schema';

@Injectable()
export class GgSheetService {
  constructor(
    @InjectModel(GgSheetSetting.name)
    private readonly ggSheetModel: Model<GgSheetSettingDocument>,
  ) {}

  async getMySetting(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const found = await this.ggSheetModel.findOne({ userId: objectId });
    if (found) return found.toObject();

    const created = await this.ggSheetModel.create({
      userId: objectId,
      ggSheetPath: '',
    });
    return created.toObject();
  }

  async updateMySetting(userId: string, dto: UpdateGgSheetDto) {
    if (dto.ggSheetPath === undefined) {
      throw new BadRequestException('Nothing to update.');
    }

    const ggSheetPath = this.normalizeHttpUrl(dto.ggSheetPath);

    const updated = await this.ggSheetModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { ggSheetPath },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return updated.toObject();
  }

  private normalizeHttpUrl(raw: string) {
    const value = (raw || '').trim();
    if (!value) return '';
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('Invalid URL format.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('URL must use http or https.');
    }
    return parsed.toString();
  }
}
