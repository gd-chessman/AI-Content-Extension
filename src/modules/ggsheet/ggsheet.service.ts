import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google } from 'googleapis';
import { PushGgSheetDto, UpdateGgSheetDto } from './ggsheet.dto';
import { GgSheetSetting, GgSheetSettingDocument } from './ggsheet.schema';

@Injectable()
export class GgSheetService {
  constructor(
    private readonly configService: ConfigService,
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

  async previewPush(userId: string, dto: PushGgSheetDto) {
    const data = this.normalizePayload(dto);
    const setting = await this.getMySetting(userId);
    const ggSheetPath = (setting?.ggSheetPath || '').trim();
    const sheetId = this.extractSheetId(ggSheetPath);
    if (!sheetId) {
      throw new BadRequestException('Google Sheet path is not configured.');
    }

    const sheets = this.createSheetsClient();
    const nextRow = await this.getNextRow(sheets, sheetId);

    return {
      sheetId,
      targetRow: nextRow,
      targetRange: `B${nextRow}:G${nextRow}`,
      sheetUrl: ggSheetPath,
      data,
    };
  }

  async push(userId: string, dto: PushGgSheetDto) {
    const preview = await this.previewPush(userId, dto);
    const sheets = this.createSheetsClient();
    const values = [[preview.data.title, preview.data.shortContent, '', '', '', preview.data.fullContent]];
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: preview.sheetId,
      range: preview.targetRange,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    return {
      ok: true,
      targetRow: preview.targetRow,
      updatedRange: updateResult.data.updatedRange || preview.targetRange,
      updatedCells: updateResult.data.updatedCells || 0,
    };
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

  private normalizePayload(dto: PushGgSheetDto) {
    const title = (dto.title || '').trim();
    const shortContent = (dto.shortContent || '').trim();
    const fullContent = (dto.fullContent || '').trim();

    if (!title && !shortContent && !fullContent) {
      throw new BadRequestException('No data to push.');
    }

    return { title, shortContent, fullContent };
  }

  private extractSheetId(url: string) {
    const value = (url || '').trim();
    const matched = value.match(/\/spreadsheets\/d\/([^/]+)/);
    return matched?.[1] || '';
  }

  private createSheetsClient() {
    const clientEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL', '').trim();
    const privateKey = this.configService
      .get<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '')
      .replace(/\\n/g, '\n')
      .trim();

    if (!clientEmail || !privateKey) {
      throw new BadRequestException('Google service account is not configured.');
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return google.sheets({ version: 'v4', auth });
  }

  private async getNextRow(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'B:B',
    });
    const rows = response.data.values || [];
    const nonEmptyCount = rows.filter((row) => String(row?.[0] || '').trim().length > 0).length;
    return Math.max(2, nonEmptyCount + 1);
  }
}
