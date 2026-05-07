import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpdateWebBlogDto } from './webblog.dto';
import { WebBlogSetting, WebBlogSettingDocument } from './webblog.schema';

@Injectable()
export class WebBlogService {
  constructor(
    @InjectModel(WebBlogSetting.name)
    private readonly webBlogModel: Model<WebBlogSettingDocument>,
  ) {}

  async getMySetting(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const found = await this.webBlogModel.findOne({ userId: objectId });
    if (found) return found.toObject();

    const created = await this.webBlogModel.create({
      userId: objectId,
      adminPath: '',
    });
    return created.toObject();
  }

  async updateMySetting(userId: string, dto: UpdateWebBlogDto) {
    if (dto.adminPath === undefined) {
      throw new BadRequestException('Nothing to update.');
    }

    const adminPath = this.normalizeHttpUrl(dto.adminPath);

    const updated = await this.webBlogModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { adminPath },
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
