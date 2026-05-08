import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebBlogDocument = HydratedDocument<WebBlog>;

@Schema({ timestamps: true })
export class WebBlog {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '' })
  adminPath: string;
}

export const WebBlogSchema = SchemaFactory.createForClass(WebBlog);
