import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SettingDocument = HydratedDocument<Setting>;

@Schema({ timestamps: true })
export class Setting {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '' })
  adminPath: string;

  @Prop({ default: '' })
  ggSheetPath: string;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
