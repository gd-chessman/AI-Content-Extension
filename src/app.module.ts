import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { databaseConfig } from './config/database.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { SharedModule } from './shared/shared.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { FanpagesModule } from './modules/fanpages/fanpages.module';
import { WebBlogModule } from './modules/webblog/webblog.module';
import { GgSheetModule } from './modules/ggsheet/ggsheet.module';
import { StepsModule } from './modules/steps/steps.module';
import { ToolsModule } from './modules/tools/tools.module';
import { StepToolsModule } from './modules/step-tools/step-tools.module';
import { StepRunsModule } from './modules/step-runs/step-runs.module';
import { WorkflowRunsModule } from './modules/workflow-runs/workflow-runs.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';
import { StoriesModule } from './modules/stories/stories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    SharedModule,
    UsersModule,
    AuthModule,
    FanpagesModule,
    WebBlogModule,
    GgSheetModule,
    StepsModule,
    ToolsModule,
    StepToolsModule,
    StepRunsModule,
    WorkflowRunsModule,
    WorkflowsModule,
    TelegramBotModule,
    StoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    appConfig(consumer);
  }
}
