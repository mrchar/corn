/**
 * 由注解生成的 OpenAPI 基础文档（应用启动时由 SwaggerModule 一次性产出）。
 * 空间文档 = 基础文档按空间裁剪 + 数据库元数据补充的动态资源类型。
 */
let document: Record<string, unknown> | null = null;

export function setBaseDocument(doc: Record<string, unknown>): void {
  document = doc;
}

export function baseDocument(): Record<string, unknown> {
  if (!document) throw new Error('OpenAPI 基础文档尚未生成');
  return document;
}
