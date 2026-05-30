import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type ExtensionPresenceEvent = {
  userId: string;
  online: boolean;
};

@Injectable()
export class ExtensionPresenceService {
  private readonly connectionCount = new Map<string, number>();
  private readonly subject = new Subject<ExtensionPresenceEvent>();

  readonly connected$ = this.subject.asObservable();

  register(userId: string) {
    const id = userId.trim();
    if (!id) return;

    const prev = this.connectionCount.get(id) || 0;
    this.connectionCount.set(id, prev + 1);
    if (prev === 0) {
      this.subject.next({ userId: id, online: true });
    }
  }

  unregister(userId: string) {
    const id = userId.trim();
    if (!id) return;

    const prev = this.connectionCount.get(id) || 0;
    if (prev <= 1) {
      this.connectionCount.delete(id);
      this.subject.next({ userId: id, online: false });
      return;
    }
    this.connectionCount.set(id, prev - 1);
  }

  isOnline(userId: string): boolean {
    return (this.connectionCount.get(userId.trim()) || 0) > 0;
  }
}
