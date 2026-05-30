import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google } from 'googleapis';
import { normalizeStyledTextToPlain } from '../../shared/text/text-search-normalize';
import { PushGgSheetDto, UpdateGgSheetDto } from './ggsheet.dto';
import { GgSheetPushLog, GgSheetPushLogDocument } from './ggsheet-push-log.schema';
import { GgSheet, GgSheetDocument } from './ggsheet.schema';

@Injectable()
export class GgSheetService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(GgSheet.name)
    private readonly ggSheetModel: Model<GgSheetDocument>,
    @InjectModel(GgSheetPushLog.name)
    private readonly ggSheetPushLogModel: Model<GgSheetPushLogDocument>,
  ) {}

  async getMySetting(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const found = await this.ggSheetModel.findOne({ userId: objectId });
    if (found) return found.toObject();

    const created = await this.ggSheetModel.create({
      userId: objectId,
      ggSheetPath: '',
      titleColumn: '',
      shortContentColumn: '',
      fullContentColumn: '',
    });
    return created.toObject();
  }

  async updateMySetting(userId: string, dto: UpdateGgSheetDto) {
    if (
      dto.ggSheetPath === undefined &&
      dto.titleColumn === undefined &&
      dto.shortContentColumn === undefined &&
      dto.fullContentColumn === undefined
    ) {
      throw new BadRequestException('Nothing to update.');
    }

    const patch: {
      ggSheetPath?: string;
      titleColumn?: string;
      shortContentColumn?: string;
      fullContentColumn?: string;
    } = {};
    if (dto.ggSheetPath !== undefined) {
      patch.ggSheetPath = this.normalizeHttpUrl(dto.ggSheetPath);
    }
    if (dto.titleColumn !== undefined) {
      patch.titleColumn = this.normalizeSheetColumn(dto.titleColumn);
    }
    if (dto.shortContentColumn !== undefined) {
      patch.shortContentColumn = this.normalizeSheetColumn(dto.shortContentColumn);
    }
    if (dto.fullContentColumn !== undefined) {
      patch.fullContentColumn = this.normalizeSheetColumn(dto.fullContentColumn);
    }

    const current = await this.getMySetting(userId);
    const nextSheetPath =
      patch.ggSheetPath !== undefined
        ? patch.ggSheetPath
        : this.normalizeHttpUrl(String(current?.ggSheetPath || ''));
    const nextTitleColumn =
      patch.titleColumn !== undefined
        ? patch.titleColumn
        : this.normalizeSheetColumn(String(current?.titleColumn || ''));
    const nextShortColumn =
      patch.shortContentColumn !== undefined
        ? patch.shortContentColumn
        : this.normalizeSheetColumn(String(current?.shortContentColumn || ''));
    const nextFullColumn =
      patch.fullContentColumn !== undefined
        ? patch.fullContentColumn
        : this.normalizeSheetColumn(String(current?.fullContentColumn || ''));

    if (nextSheetPath && !nextTitleColumn && !nextShortColumn && !nextFullColumn) {
      throw new BadRequestException('At least one target column is required.');
    }

    const updated = await this.ggSheetModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      patch,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return updated.toObject();
  }

  async previewPush(userId: string, dto: PushGgSheetDto) {
    const data = this.normalizePayload(dto);
    const setting = await this.getMySetting(userId);
    const ggSheetPath = (setting?.ggSheetPath || '').trim();
    const sheetId = this.extractSheetId(ggSheetPath);
    const sheetGid = this.extractSheetGidFromUrl(ggSheetPath);
    if (!sheetId) {
      throw new BadRequestException('Google Sheet path is not configured.');
    }

    const sheets = this.createSheetsClient();
    const sheetTitle = await this.getSheetTitle(sheets, sheetId, sheetGid);
    const columns = this.resolveColumns(setting);
    if (!columns.title && !columns.shortContent && !columns.full) {
      throw new BadRequestException('No target columns configured for push.');
    }
    await this.ensureNotDuplicateTitleAndShortContent(
      sheets,
      sheetId,
      sheetTitle,
      columns,
      data.title,
      data.shortContent,
    );
    const nextRow = await this.getNextRow(sheets, sheetId, sheetTitle);
    const targetRange = [columns.title, columns.shortContent, columns.full]
      .filter(Boolean)
      .map((column) => `${sheetTitle}!${column}${nextRow}`)
      .join(', ');

    return {
      sheetId,
      sheetGid,
      sheetTitle,
      targetRow: nextRow,
      targetRange,
      sheetUrl: ggSheetPath,
      columns,
      data,
    };
  }

  async push(userId: string, dto: PushGgSheetDto) {
    const preview = await this.previewPush(userId, dto);
    const sheets = this.createSheetsClient();
    const objectId = new Types.ObjectId(userId);
    let updateResult;
    try {
      updateResult = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: preview.sheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            preview.columns.title
              ? { range: `${preview.sheetTitle}!${preview.columns.title}${preview.targetRow}`, values: [[preview.data.title]] }
              : null,
            preview.columns.shortContent
              ? {
                  range: `${preview.sheetTitle}!${preview.columns.shortContent}${preview.targetRow}`,
                  values: [[preview.data.shortContent]],
                }
              : null,
            preview.columns.full
              ? { range: `${preview.sheetTitle}!${preview.columns.full}${preview.targetRow}`, values: [[preview.data.fullContent]] }
              : null,
          ].filter(Boolean) as Array<{ range: string; values: string[][] }>,
        },
      });
    } catch (error) {
      await this.logPushAttempt({
        userId: objectId,
        sheetId: preview.sheetId,
        sheetTitle: preview.sheetTitle,
        targetRow: preview.targetRow,
        targetRange: preview.targetRange,
        status: 'failed',
        updatedCells: 0,
        titleLength: preview.data.title.length,
        shortContentLength: preview.data.shortContent.length,
        fullContentLength: preview.data.fullContent.length,
        errorMessage: this.extractGoogleErrorMessage(error),
      });
      this.handleGoogleSheetError(error);
    }

    await this.logPushAttempt({
      userId: objectId,
      sheetId: preview.sheetId,
      sheetTitle: preview.sheetTitle,
      targetRow: preview.targetRow,
      targetRange: preview.targetRange,
      status: 'success',
      updatedCells: updateResult.data.totalUpdatedCells || 0,
      titleLength: preview.data.title.length,
      shortContentLength: preview.data.shortContent.length,
      fullContentLength: preview.data.fullContent.length,
      errorMessage: '',
    });

    return {
      ok: true,
      targetRow: preview.targetRow,
      updatedRange: preview.targetRange,
      updatedCells: updateResult.data.totalUpdatedCells || 0,
    };
  }

  async getMyStats(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const [totalPushes, successPushes, failedPushes] = await Promise.all([
      this.ggSheetPushLogModel.countDocuments({ userId: objectId }),
      this.ggSheetPushLogModel.countDocuments({ userId: objectId, status: 'success' }),
      this.ggSheetPushLogModel.countDocuments({ userId: objectId, status: 'failed' }),
    ]);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayPushes, thisMonthPushes] = await Promise.all([
      this.ggSheetPushLogModel.countDocuments({
        userId: objectId,
        createdAt: { $gte: startOfToday },
      }),
      this.ggSheetPushLogModel.countDocuments({
        userId: objectId,
        createdAt: { $gte: startOfMonth },
      }),
    ]);

    return {
      totalPushes,
      successPushes,
      failedPushes,
      todayPushes,
      thisMonthPushes,
    };
  }

  async getPushStatusForStory(
    userId: string,
    title = '',
    shortContent = '',
  ) {
    const map = await this.getPushStatusMapForStories(userId, [
      { storyId: '__single__', title, shortContent },
    ]);
    return map.get('__single__') || { pushed: false };
  }

  async getPushStatusMapForStories(
    userId: string,
    stories: Array<{ storyId: string; title?: string; shortContent?: string }>,
  ) {
    const result = new Map<string, { pushed: boolean; targetRow?: number }>();
    for (const story of stories) {
      result.set(story.storyId, { pushed: false });
    }
    if (!stories.length) return result;

    const sheetRows = await this.loadTitleShortRowsFromUserSheet(userId);
    if (!sheetRows.length) return result;

    for (const story of stories) {
      const storyTitle = (story.title || '').trim();
      const storyShort = (story.shortContent || '').trim();
      if (!storyTitle && !storyShort) continue;

      for (const row of sheetRows) {
        if (
          this.titleMatches(storyTitle, row.title) &&
          this.shortContentMatchesPrefix(storyShort, row.shortContent)
        ) {
          result.set(story.storyId, { pushed: true, targetRow: row.rowNumber });
          break;
        }
      }
    }

    return result;
  }

  private static readonly SHORT_MATCH_LEN = 120;

  private normalizeMatchText(value: string) {
    return normalizeStyledTextToPlain(value).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  }

  private titleMatches(storyTitle: string, sheetTitle: string) {
    const left = this.normalizeMatchText(storyTitle).toLowerCase();
    const right = this.normalizeMatchText(sheetTitle).toLowerCase();
    if (!left) return true;
    if (!right) return false;
    return left === right;
  }

  /** Khớp khi sheet chứa prefix đoạn ngắn của story (hoặc ngược lại nếu sheet ngắn hơn). */
  private shortContentMatchesPrefix(storyShort: string, sheetShort: string) {
    const storyNorm = this.normalizeMatchText(storyShort);
    const sheetNorm = this.normalizeMatchText(sheetShort);
    if (!storyNorm) return true;
    if (!sheetNorm) return false;

    const prefixLen = Math.min(GgSheetService.SHORT_MATCH_LEN, storyNorm.length);
    const storyPrefix = storyNorm.slice(0, prefixLen);
    if (sheetNorm.startsWith(storyPrefix)) return true;

    const sheetPrefixLen = Math.min(GgSheetService.SHORT_MATCH_LEN, sheetNorm.length);
    const sheetPrefix = sheetNorm.slice(0, sheetPrefixLen);
    return storyNorm.startsWith(sheetPrefix);
  }

  private async loadTitleShortRowsFromUserSheet(userId: string) {
    const setting = await this.getMySetting(userId);
    const ggSheetPath = (setting?.ggSheetPath || '').trim();
    const sheetId = this.extractSheetId(ggSheetPath);
    const sheetGid = this.extractSheetGidFromUrl(ggSheetPath);
    if (!sheetId) return [];

    const columns = this.resolveColumns(setting);
    if (!columns.title || !columns.shortContent) return [];

    try {
      const sheets = this.createSheetsClient();
      const sheetTitle = await this.getSheetTitle(sheets, sheetId, sheetGid);
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges: [
          `${sheetTitle}!${columns.title}:${columns.title}`,
          `${sheetTitle}!${columns.shortContent}:${columns.shortContent}`,
        ],
      });

      const titleRows = response.data.valueRanges?.[0]?.values || [];
      const shortRows = response.data.valueRanges?.[1]?.values || [];
      const maxLen = Math.max(titleRows.length, shortRows.length);
      const rows: Array<{ rowNumber: number; title: string; shortContent: string }> = [];

      for (let idx = 0; idx < maxLen; idx += 1) {
        const title = String(titleRows[idx]?.[0] || '').trim();
        const shortContent = String(shortRows[idx]?.[0] || '').trim();
        if (!title && !shortContent) continue;
        rows.push({ rowNumber: idx + 1, title, shortContent });
      }

      return rows;
    } catch {
      return [];
    }
  }

  async extractRow(userId: string, row: number) {
    if (!Number.isFinite(row) || row <= 0) {
      throw new BadRequestException('Row must be a positive number.');
    }

    const setting = await this.getMySetting(userId);
    const ggSheetPath = (setting?.ggSheetPath || '').trim();
    const sheetId = this.extractSheetId(ggSheetPath);
    const sheetGid = this.extractSheetGidFromUrl(ggSheetPath);
    if (!sheetId) {
      throw new BadRequestException('Google Sheet path is not configured.');
    }

    const columns = this.resolveColumns(setting);
    if (!columns.title && !columns.shortContent && !columns.full) {
      throw new BadRequestException('No target columns configured for extract.');
    }

    const sheets = this.createSheetsClient();
    const sheetTitle = await this.getSheetTitle(sheets, sheetId, sheetGid);

    const ranges = [
      columns.title ? `${sheetTitle}!${columns.title}${row}` : '',
      columns.shortContent ? `${sheetTitle}!${columns.shortContent}${row}` : '',
      columns.full ? `${sheetTitle}!${columns.full}${row}` : '',
    ].filter(Boolean);

    let response;
    try {
      response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges,
      });
    } catch (error) {
      this.handleGoogleSheetError(error);
    }

    const valueRanges = response.data.valueRanges || [];
    let idx = 0;
    const title = columns.title ? String(valueRanges[idx++]?.values?.[0]?.[0] || '').trim() : '';
    const shortContent = columns.shortContent ? String(valueRanges[idx++]?.values?.[0]?.[0] || '').trim() : '';
    const fullContent = columns.full ? String(valueRanges[idx++]?.values?.[0]?.[0] || '').trim() : '';

    return {
      sheetId,
      sheetTitle,
      row,
      columns,
      data: {
        title,
        shortContent,
        fullContent,
      },
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

  private normalizeSheetColumn(raw: string) {
    const value = (raw || '').trim().toUpperCase();
    if (!value) return '';
    if (!/^[A-Z]{1,3}$/.test(value)) {
      throw new BadRequestException('Invalid sheet column format. Use A-Z letters only.');
    }
    return value;
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

  /**
   * `null` = URL không chỉ định gid → dùng tab đầu trong file.
   * `0` = gid hợp lệ (tab đầu thường có sheetId 0); không được dùng `!gid` vì 0 là falsy.
   */
  private extractSheetGidFromUrl(url: string): number | null {
    const value = (url || '').trim();
    if (!value) return null;
    try {
      const parsed = new URL(value);
      if (parsed.searchParams.has('gid')) {
        const raw = parsed.searchParams.get('gid');
        if (raw === null || raw === '') return null;
        const gid = Number(raw);
        return Number.isFinite(gid) ? gid : null;
      }
      const hashMatch = parsed.hash.match(/gid=(\d+)/i);
      if (hashMatch) {
        const gid = Number(hashMatch[1]);
        return Number.isFinite(gid) ? gid : null;
      }
      return null;
    } catch {
      const matched = value.match(/[?&#]gid=(\d+)/i);
      if (!matched) return null;
      const gid = Number(matched[1]);
      return Number.isFinite(gid) ? gid : null;
    }
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

  private async getSheetTitle(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetGid: number | null,
  ) {
    let meta;
    try {
      meta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title,index))',
      });
    } catch (error) {
      this.handleGoogleSheetError(error);
    }

    const tabs = meta.data.sheets || [];
    if (tabs.length === 0) {
      throw new BadRequestException('No sheet tab found in this spreadsheet.');
    }
    if (sheetGid === null) {
      return tabs[0]?.properties?.title || 'Sheet1';
    }
    const found = tabs.find((tab) => Number(tab?.properties?.sheetId || 0) === sheetGid);
    if (!found?.properties?.title) {
      throw new BadRequestException('The configured gid does not exist in this spreadsheet.');
    }
    return found.properties.title;
  }

  private async getNextRow(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetTitle: string,
  ) {
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetTitle}!B:B`,
      });
    } catch (error) {
      this.handleGoogleSheetError(error);
    }
    const rows = response.data.values || [];
    const nonEmptyCount = rows.filter((row) => String(row?.[0] || '').trim().length > 0).length;
    return Math.max(2, nonEmptyCount + 1);
  }

  private async ensureNotDuplicateTitleAndShortContent(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetTitle: string,
    columns: { title: string; shortContent: string; full: string },
    title: string,
    shortContent: string,
  ) {
    if (!columns.title || !columns.shortContent) return;
    const normalizedTitle = (title || '').trim();
    const normalizedShort = (shortContent || '').trim();
    if (!normalizedTitle && !normalizedShort) return;

    let response;
    try {
      response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [
          `${sheetTitle}!${columns.title}:${columns.title}`,
          `${sheetTitle}!${columns.shortContent}:${columns.shortContent}`,
        ],
      });
    } catch (error) {
      this.handleGoogleSheetError(error);
    }

    const titleRows = response.data.valueRanges?.[0]?.values || [];
    const shortRows = response.data.valueRanges?.[1]?.values || [];
    const maxLen = Math.max(titleRows.length, shortRows.length);
    let duplicated = false;
    for (let idx = 0; idx < maxLen; idx += 1) {
      const rowTitle = String(titleRows[idx]?.[0] || '').trim();
      const rowShort = String(shortRows[idx]?.[0] || '').trim();
      if (rowTitle === normalizedTitle && rowShort === normalizedShort) {
        duplicated = true;
        break;
      }
    }

    if (duplicated) {
      throw new BadRequestException(
        'Duplicate title and short content found. Data was not written.',
      );
    }
  }

  private resolveColumns(setting: {
    titleColumn?: string;
    shortContentColumn?: string;
    fullContentColumn?: string;
  }) {
    return {
      title: this.normalizeSheetColumn(setting?.titleColumn ?? ''),
      shortContent: this.normalizeSheetColumn(setting?.shortContentColumn ?? ''),
      full: this.normalizeSheetColumn(setting?.fullContentColumn ?? ''),
    };
  }

  private async logPushAttempt(payload: {
    userId: Types.ObjectId;
    sheetId: string;
    sheetTitle: string;
    targetRow: number;
    targetRange: string;
    status: 'success' | 'failed';
    updatedCells: number;
    titleLength: number;
    shortContentLength: number;
    fullContentLength: number;
    errorMessage: string;
  }) {
    try {
      await this.ggSheetPushLogModel.create(payload);
    } catch {
      // Ignore log write errors to avoid breaking push flow.
    }
  }

  private extractGoogleErrorMessage(error: unknown) {
    return (
      (error as { message?: string })?.message ||
      (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
      'Google Sheets request failed.'
    );
  }

  private handleGoogleSheetError(error: unknown): never {
    const status = Number((error as { status?: number })?.status || (error as { response?: { status?: number } })?.response?.status || 0);
    const message =
      (error as { message?: string })?.message ||
      (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
      'Google Sheets request failed.';

    if (status === 403) {
      throw new BadRequestException(
        'Google Sheets permission denied. Please share this sheet with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor.',
      );
    }
    if (status === 404) {
      throw new BadRequestException('Google Sheet not found. Please check ggSheetPath.');
    }

    throw new BadRequestException(`Google Sheets error: ${message}`);
  }
}
