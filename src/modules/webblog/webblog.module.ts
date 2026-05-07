import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { WebBlogController } from './webblog.controller';
import { WebBlogSetting, WebBlogSettingSchema } from './webblog.schema';
import { WebBlogService } from './webblog.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebBlogSetting.name, schema: WebBlogSettingSchema }]),
  ],
  controllers: [WebBlogController],
  providers: [WebBlogService, RolesGuard],
  exports: [WebBlogService],
})
export class WebBlogModule {}
