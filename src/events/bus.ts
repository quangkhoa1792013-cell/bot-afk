/**
 * Event bus đơn giản (EventEmitter) để nối các module:
 *  - SMTP server emit 'new-mail' sau khi lưu mail
 *  - SSE endpoint lắng nghe để đẩy realtime
 *  - Telegram notification cũng lắng nghe cùng sự kiện (song song, không block)
 */
import { EventEmitter } from 'node:events';

export type BusEvents = {
  'new-mail': (payload: { id: string }) => void;
  'mail-updated': (payload: { id: string }) => void;
  'mail-deleted': (payload: { id: string }) => void;
  'mails-cleared': () => void;
  /** Danh sách Profile thay đổi (tạo/sửa/xóa) — dashboard cần refresh */
  'profiles-changed': () => void;
};

class EventBus extends EventEmitter {
  emit<K extends keyof BusEvents>(event: K, ...args: Parameters<BusEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof BusEvents>(event: K, listener: BusEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}

/** Export singleton để mọi module dùng chung một bus. */
export const bus = new EventBus();