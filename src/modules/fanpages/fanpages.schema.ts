import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FanpageDocument = HydratedDocument<Fanpage>;

@Schema({ timestamps: true })
export class Fanpage {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  url: string;
}

export const FanpageSchema = SchemaFactory.createForClass(Fanpage);
FanpageSchema.index({ userId: 1, url: 1 }, { unique: true });
