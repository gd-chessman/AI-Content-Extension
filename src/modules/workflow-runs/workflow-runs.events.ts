import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type WorkflowRunEvent = {
  type: 'workflow_run_created' | 'workflow_run_updated';
  userId: string;
  run: Record<string, unknown>;
};

@Injectable()
export class WorkflowRunsEvents {
  private readonly subject = new Subject<WorkflowRunEvent>();

  readonly events$ = this.subject.asObservable();

  publish(event: WorkflowRunEvent) {
    this.subject.next(event);
  }
}
