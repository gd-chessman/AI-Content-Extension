import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GgSheetDocument = HydratedDocument<GgSheet>;

@Schema({ timestamps: true })
export class GgSheet {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '' })
  ggSheetPath: string;

  @Prop({ default: '' })
  titleColumn: string;

  @Prop({ default: '' })
  shortContentColumn: string;

  @Prop({ default: '' })
  fullContentColumn: string;
}

export const GgSheetSchema = SchemaFactory.createForClass(GgSheet);
