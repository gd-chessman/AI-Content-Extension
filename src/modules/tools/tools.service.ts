import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TOOL_REGISTRY } from '../../shared/tools/tools.registry';
import {
  filterToolDefinitions,
  syncToolDefinitions,
  type ToolSyncResult,
} from '../../shared/tools/tools.sync';
import { WorkflowPlatform } from '../workflows/workflow.schema';
import { CreateToolDto, UpdateToolDto } from './tools.dto';
import { ToolStepPhase, normalizeToolStepPhase } from '../../shared/tools/tool-step-phase';
import { Tool, ToolDocument, ToolPlacement } from './tool.schema';

@Injectable()
export class ToolsService implements OnModuleInit {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    @InjectModel(Tool.name)
    private readonly toolModel: Model<ToolDocument>,
  ) {}

  async onModuleInit() {
    try {
      const result = await this.syncFromRegistry();
      this.logger.log(
        `Đồng bộ tool từ shared/tools: ${result.total} mục (${result.created} tạo, ${result.updated} cập nhật)`,
      );
    } catch (error) {
      this.logger.error('Đồng bộ tool thất bại khi khởi động', error);
    }
  }

  async list(platform?: WorkflowPlatform, placement?: ToolPlacement, activeOnly = true) {
    const filter: {
      platform?: WorkflowPlatform;
      placement?: ToolPlacement;
      isActive?: boolean;
    } = {};
    if (platform) {
      filter.platform = platform;
    }
    if (placement) {
      filter.placement = placement;
    }
    if (activeOnly) {
      filter.isActive = true;
    }
    return this.toolModel.find(filter).sort({ sortOrder: 1, code: 1 }).lean();
  }

  async getById(id: string) {
    this.assertObjectId(id, 'Invalid tool id.');
    const found = await this.toolModel.findById(id).lean();
    if (!found) {
      throw new NotFoundException('Tool not found.');
    }
    return found;
  }

  async getByCode(code: string) {
    const normalized = this.normalizeCode(code);
    const found = await this.toolModel.findOne({ code: normalized }).lean();
    if (!found) {
      throw new NotFoundException('Tool not found.');
    }
    return found;
  }

  /** Trả script xử lý từ DB — extension gọi khi user bấm nút. */
  async getHandlerScript(id: string) {
    const tool = await this.getById(id);
    const handlerScript = (tool.handlerScript || '').trim();
    if (!handlerScript) {
      throw new BadRequestException('Tool has no handlerScript.');
    }
    return {
      toolId: String(tool._id),
      code: tool.code,
      handlerScript,
      defaultConfig: tool.defaultConfig || {},
    };
  }

  async create(dto: CreateToolDto) {
    const payload = this.normalizePayload(dto, false);
    try {
      const created = await this.toolModel.create(payload);
      return created.toObject();
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Tool code already exists.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateToolDto) {
    this.assertObjectId(id, 'Invalid tool id.');
    const patch = this.normalizePayload(dto, true);
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    try {
      const updated = await this.toolModel
        .findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true })
        .lean();
      if (!updated) {
        throw new NotFoundException('Tool not found.');
      }
      return updated;
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Tool code already exists.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    this.assertObjectId(id, 'Invalid tool id.');
    const removed = await this.toolModel.findByIdAndDelete(id).lean();
    if (!removed) {
      throw new NotFoundException('Tool not found.');
    }
    return removed;
  }

  /** Đồng bộ toàn bộ tool trong `shared/tools/tools.registry`. */
  async syncFromRegistry(): Promise<ToolSyncResult> {
    return syncToolDefinitions(this.toolModel, TOOL_REGISTRY);
  }

  /** Upsert bộ tool ChatGPT từ registry (idempotent theo `code`). */
  async seedChatgptTools() {
    const definitions = filterToolDefinitions(TOOL_REGISTRY, WorkflowPlatform.CHATGPT);
    return syncToolDefinitions(this.toolModel, definitions);
  }

  serializeTool(tool: Tool & { _id: unknown }) {
    return {
      _id: String(tool._id),
      code: tool.code,
      name: tool.name,
      platform: tool.platform,
      handlerKey: tool.handlerKey,
      handlerScript: tool.handlerScript,
      guardScript: tool.guardScript || '',
      placement: tool.placement,
      stepPhase: tool.stepPhase,
      sortOrder: tool.sortOrder,
      defaultConfig: tool.defaultConfig || {},
      uiConfig: tool.uiConfig || {},
      isActive: tool.isActive,
    };
  }

  private normalizePayload(dto: CreateToolDto | UpdateToolDto, partial: boolean) {
    const patch: Partial<Tool> = {};

    if ('code' in dto && dto.code !== undefined) {
      patch.code = this.normalizeCode(dto.code);
    } else if (!partial) {
      throw new BadRequestException('code is required.');
    }

    if ('name' in dto && dto.name !== undefined) {
      patch.name = dto.name.trim();
    } else if (!partial) {
      throw new BadRequestException('name is required.');
    }

    if ('platform' in dto && dto.platform !== undefined) {
      patch.platform = this.normalizePlatform(dto.platform);
    } else if (!partial) {
      throw new BadRequestException('platform is required.');
    }

    if ('handlerKey' in dto && dto.handlerKey !== undefined) {
      patch.handlerKey = dto.handlerKey.trim();
    } else if (!partial) {
      throw new BadRequestException('handlerKey is required.');
    }

    if ('handlerScript' in dto && dto.handlerScript !== undefined) {
      patch.handlerScript = dto.handlerScript.trim();
    } else if (!partial) {
      throw new BadRequestException('handlerScript is required.');
    }

    if ('guardScript' in dto && dto.guardScript !== undefined) {
      patch.guardScript = dto.guardScript.trim();
    }

    if ('placement' in dto && dto.placement !== undefined) {
      patch.placement = this.normalizePlacement(dto.placement);
    } else if (!partial) {
      patch.placement = ToolPlacement.STEP_PANEL;
    }

    if ('stepPhase' in dto && dto.stepPhase !== undefined) {
      patch.stepPhase = normalizeToolStepPhase(dto.stepPhase);
    } else if (!partial) {
      patch.stepPhase = ToolStepPhase.INDEPENDENT;
    }

    if ('sortOrder' in dto && dto.sortOrder !== undefined) {
      patch.sortOrder = Number(dto.sortOrder);
    } else if (!partial) {
      patch.sortOrder = 0;
    }

    if ('defaultConfig' in dto && dto.defaultConfig !== undefined) {
      patch.defaultConfig = dto.defaultConfig;
    } else if (!partial) {
      patch.defaultConfig = {};
    }

    if ('uiConfig' in dto && dto.uiConfig !== undefined) {
      patch.uiConfig = dto.uiConfig;
    } else if (!partial) {
      patch.uiConfig = {};
    }

    if ('isActive' in dto && dto.isActive !== undefined) {
      patch.isActive = Boolean(dto.isActive);
    } else if (!partial) {
      patch.isActive = true;
    }

    return patch;
  }

  private normalizeCode(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('code is required.');
    }
    return normalized;
  }

  private normalizePlatform(platform: WorkflowPlatform) {
    if (!Object.values(WorkflowPlatform).includes(platform)) {
      throw new BadRequestException('Invalid platform.');
    }
    return platform;
  }

  private normalizePlacement(placement: ToolPlacement) {
    if (!Object.values(ToolPlacement).includes(placement)) {
      throw new BadRequestException('Invalid placement.');
    }
    return placement;
  }

  private assertObjectId(id: string, message: string) {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      throw new BadRequestException(message);
    }
  }

  private isDuplicateKeyError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000;
  }
}
