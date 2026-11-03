import { SetMetadata } from '@nestjs/common';

/** 路由元数据键：标记端点豁免登录校验 */
export const IS_PUBLIC_KEY = 'isPublic';

/** 声明该端点为公开端点（注册/登录/刷新/登出与状态探测） */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
