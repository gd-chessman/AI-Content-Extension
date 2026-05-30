import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, defer, filter, finalize, interval, map, merge, of } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { ExtensionPresenceService } from './extension-presence.service';
import { CreateWorkflowRunDto, UpdateWorkflowRunDto } from './workflow-runs.dto';
import { WorkflowRunsEvents } from './workflow-runs.events';
import { WorkflowRunsService } from './workflow-runs.service';

@Controller('workflow-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER_VIP, UserRole.ADMIN)
export class WorkflowRunsController {
  constructor(
    private readonly workflowRunsService: WorkflowRunsService,
    private readonly workflowRunsEvents: WorkflowRunsEvents,
    private readonly extensionPresence: ExtensionPresenceService,
  ) {}

  @Get('my')
  listForUser(@Req() req: Request, @Query('workflowId') workflowId?: string) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.listForUser(user.sub, workflowId);
  }

  @Get('my/:id')
  getForUser(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.getForUser(id, user.sub);
  }

  @Post()
  createForUser(@Req() req: Request, @Body() dto: CreateWorkflowRunDto) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  updateForUser(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateWorkflowRunDto) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.updateForUser(id, user.sub, dto);
  }

  @Get('extension-presence')
  getExtensionPresence(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return { online: this.extensionPresence.isOnline(user.sub) };
  }

  @Sse('stream')
  stream(@Req() req: Request): Observable<MessageEvent> {
    const user = req.user as JwtPayload;
    const userId = (user.sub || '').trim();

    return defer(() => {
      this.extensionPresence.register(userId);

      const live$ = this.workflowRunsEvents.events$.pipe(
        filter((event) => event.userId === userId),
        map((event) => ({ type: 'message', data: event })),
      );
      const hello$ = of({
        type: 'message',
        data: { type: 'workflow_run_stream_connected', userId, ts: Date.now() },
      });
      const heartbeat$ = interval(15_000).pipe(
        map(() => ({ type: 'message', data: { type: 'heartbeat', ts: Date.now() } })),
      );

      return merge(hello$, heartbeat$, live$).pipe(
        finalize(() => this.extensionPresence.unregister(userId)),
      );
    });
  }
}
