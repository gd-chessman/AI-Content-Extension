import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { WebBlogController } from './webblog.controller';
import { WebBlog, WebBlogSchema } from './webblog.schema';
import { WebBlogService } from './webblog.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebBlog.name, schema: WebBlogSchema }]),
  ],
  controllers: [WebBlogController],
  providers: [WebBlogService, RolesGuard],
  exports: [WebBlogService],
})
export class WebBlogModule {}
