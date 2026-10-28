import { randomUUID } from 'node:crypto';

/** 生成带语义前缀的标识，便于在日志与账本中辨认对象种类。 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}
