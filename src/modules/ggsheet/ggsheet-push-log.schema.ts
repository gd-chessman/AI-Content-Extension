import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GgSheetPushLogDocument = HydratedDocument<GgSheetPushLog>;

@Schema({ timestamps: true })
export class GgSheetPushLog {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  sheetId: string;

  @Prop({ default: '' })
  sheetTitle: string;

  @Prop({ required: true })
  targetRow: number;

  @Prop({ default: '' })
  targetRange: string;

  @Prop({ required: true, enum: ['success', 'failed'] })
  status: 'success' | 'failed';

  @Prop({ default: 0 })
  updatedCells: number;

  @Prop({ default: 0 })
  titleLength: number;

  @Prop({ default: 0 })
  shortContentLength: number;

  @Prop({ default: 0 })
  fullContentLength: number;

  @Prop({ default: '' })
  errorMessage: string;
}

export const GgSheetPushLogSchema = SchemaFactory.createForClass(GgSheetPushLog);
