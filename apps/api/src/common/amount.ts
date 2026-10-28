import { AppError, ErrorCodes } from './errors';

/** 依赖类型声明的数值形态：按精度收敛，避免浮点误差累积到口径上。 */
export function roundTo(value: number, scale: number): number {
  const factor = 10 ** Math.max(0, scale);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function assertPositiveAmount(amount: unknown, scale = 2): number {
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError(ErrorCodes.INVALID_AMOUNT, '数量必须为正数', { amount: amount ?? null });
  }
  return roundTo(numeric, scale);
}
