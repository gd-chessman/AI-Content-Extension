import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GgSheetContentDocument = HydratedDocument<GgSheetContent>;

export enum GgSheetPushStatus {
  PENDING = 'pending',
  PUSHED = 'pushed',
  FAILED = 'failed',
}

export enum GgSheetFbUploadStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class GgSheetContent {
  @Prop({ type: Types.ObjectId, required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ default: '', trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  shortContent: string;

  @Prop({ default: '', trim: true })
  articleLink: string;

  @Prop({ default: '', trim: true })
  fullContent: string;

  @Prop({
    default: GgSheetPushStatus.PENDING,
    enum: Object.values(GgSheetPushStatus),
    index: true,
  })
  sheetPushStatus: GgSheetPushStatus;

  @Prop({ default: '', trim: true })
  publishPage: string;

  @Prop({ default: '', trim: true })
  cta: string;

  @Prop({
    default: GgSheetFbUploadStatus.PENDING,
    enum: Object.values(GgSheetFbUploadStatus),
    index: true,
  })
  fbUploadStatus: GgSheetFbUploadStatus;
}

export const GgSheetContentSchema = SchemaFactory.createForClass(GgSheetContent);
GgSheetContentSchema.index({ userId: 1, createdAt: -1 });
GgSheetContentSchema.index({ sheetPushStatus: 1, updatedAt: -1 });
GgSheetContentSchema.index({ fbUploadStatus: 1, updatedAt: -1 });
