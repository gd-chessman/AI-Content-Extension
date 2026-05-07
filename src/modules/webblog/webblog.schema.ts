import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebBlogSettingDocument = HydratedDocument<WebBlogSetting>;

@Schema({ timestamps: true })
export class WebBlogSetting {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '' })
  adminPath: string;
}

export const WebBlogSettingSchema = SchemaFactory.createForClass(WebBlogSetting);
