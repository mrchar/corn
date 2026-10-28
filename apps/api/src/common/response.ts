export interface ActionResultLike<T = unknown> {
  status: 'success';
  message: string;
  data?: T;
}

export interface ListResult<T> {
  list: T[];
  total: number;
}

/** 写操作的统一返回：与前端 action 协议的 ActionResult 兼容。 */
export function success<T = unknown>(message: string, data?: T): ActionResultLike<T> {
  return data === undefined ? { status: 'success', message } : { status: 'success', message, data };
}

/** 列表的统一返回：裸数组或「数组 + 总数」信封之外的第三种选择，此处采用信封形式。 */
export function listResult<T>(list: T[], total: number): ListResult<T> {
  return { list, total };
}
