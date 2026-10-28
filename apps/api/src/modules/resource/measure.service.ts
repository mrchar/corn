import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** 资源数量的四个口径，全部由流转记录派生，不允许直接赋值。 */
export interface Measures {
  total: number;
  reserved: number;
  consumed: number;
  available: number;
}

export const EMPTY_MEASURES: Measures = { total: 0, reserved: 0, consumed: 0, available: 0 };

@Injectable()
export class MeasureService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 一次聚合取回多个资源的口径，避免列表页按资源逐个查询。
   * 总量 = Σ 创建流动；已占用 = Σ 活跃占用；已消耗 = Σ 花费流动；可用量 = 总量 − 已占用 − 已消耗。
   */
  async forResources(spaceId: string, resourceIds: string[]): Promise<Map<string, Measures>> {
    const result = new Map<string, Measures>();
    if (resourceIds.length === 0) return result;

    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['resourceId'],
      where: { spaceId, resourceId: { in: resourceIds } },
      _sum: { totalDelta: true, reservedDelta: true, consumedDelta: true },
    });

    for (const row of rows) {
      const total = row._sum.totalDelta ?? 0;
      const reserved = row._sum.reservedDelta ?? 0;
      const consumed = row._sum.consumedDelta ?? 0;
      result.set(row.resourceId, { total, reserved, consumed, available: total - reserved - consumed });
    }
    for (const id of resourceIds) {
      if (!result.has(id)) result.set(id, { ...EMPTY_MEASURES });
    }
    return result;
  }

  async forResource(spaceId: string, resourceId: string): Promise<Measures> {
    const map = await this.forResources(spaceId, [resourceId]);
    return map.get(resourceId) ?? { ...EMPTY_MEASURES };
  }
}
