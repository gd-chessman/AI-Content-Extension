import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Story, StorySchema } from './story.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Story.name, schema: StorySchema }])],
  exports: [MongooseModule],
})
export class StoriesModule {}
