export type AttrValueType = 'text' | 'number' | 'enum' | 'boolean';

const VALUE_TYPES: AttrValueType[] = ['text', 'number', 'enum', 'boolean'];

/** 资源类型的属性模式条目：决定资源实例携带哪些业务属性，以及前端表单如何渲染与校验。 */
export interface AttributeDef {
  key: string;
  label: string;
  valueType: AttrValueType;
  required?: boolean;
  /** valueType 为 enum 时的可选值域 */
  options?: string[];
  description?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  unit?: string;
}

export interface AttributeIssue {
  key: string;
  message: string;
}

export function isAttrValueType(value: unknown): value is AttrValueType {
  return typeof value === 'string' && VALUE_TYPES.includes(value as AttrValueType);
}

/**
 * 校验属性模式定义本身是否合法（领域管理员定义类型时使用）。
 * 返回规范化后的模式；非法项以 issues 报告。
 */
export function normalizeAttrSchema(raw: unknown): { schema: AttributeDef[]; issues: AttributeIssue[] } {
  const issues: AttributeIssue[] = [];
  if (raw === undefined || raw === null) return { schema: [], issues };
  if (!Array.isArray(raw)) {
    return { schema: [], issues: [{ key: '', message: '属性模式必须是数组' }] };
  }

  const schema: AttributeDef[] = [];
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      issues.push({ key: String(index), message: '属性定义必须是对象' });
      return;
    }
    const candidate = item as Record<string, unknown>;
    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
    if (!key) {
      issues.push({ key: String(index), message: '属性键名不能为空' });
      return;
    }
    if (seen.has(key)) {
      issues.push({ key, message: '属性键名重复' });
      return;
    }
    if (!isAttrValueType(candidate.valueType)) {
      issues.push({ key, message: '属性值类型必须是 text / number / enum / boolean 之一' });
      return;
    }
    if (candidate.valueType === 'enum' && !Array.isArray(candidate.options)) {
      issues.push({ key, message: '枚举类型必须提供选项列表' });
      return;
    }
    if (candidate.valueType === 'enum' && Array.isArray(candidate.options) && candidate.options.length === 0) {
      issues.push({ key, message: '枚举类型的选项列表不能为空' });
      return;
    }
    seen.add(key);
    const def: AttributeDef = {
      key,
      label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : key,
      valueType: candidate.valueType,
    };
    if (candidate.required === true) def.required = true;
    if (typeof candidate.description === 'string') def.description = candidate.description;
    if (Array.isArray(candidate.options)) def.options = candidate.options.map((option) => String(option));
    if (typeof candidate.min === 'number') def.min = candidate.min;
    if (typeof candidate.max === 'number') def.max = candidate.max;
    if (typeof candidate.maxLength === 'number') def.maxLength = candidate.maxLength;
    if (typeof candidate.unit === 'string') def.unit = candidate.unit;
    schema.push(def);
  });

  return { schema, issues };
}

/** 从任意输入中挑出模式声明的属性，用于创建/更新资源时的入参收敛。 */
export function pickAttributes(schema: AttributeDef[], input: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const def of schema) {
    if (Object.prototype.hasOwnProperty.call(input, def.key)) values[def.key] = input[def.key];
  }
  return values;
}

/** 依属性模式校验取值；语义与前端表单校验规则一致。 */
export function validateAttributes(
  schema: AttributeDef[],
  values: Record<string, unknown>,
): AttributeIssue[] {
  const issues: AttributeIssue[] = [];
  const declared = new Set(schema.map((def) => def.key));

  for (const def of schema) {
    const value = values[def.key];
    const empty = value === undefined || value === null || value === '';
    if (empty) {
      if (def.required) issues.push({ key: def.key, message: `${def.label}为必填项` });
      continue;
    }
    switch (def.valueType) {
      case 'text': {
        if (typeof value !== 'string') {
          issues.push({ key: def.key, message: `${def.label}必须是文本` });
          break;
        }
        if (def.maxLength !== undefined && value.length > def.maxLength) {
          issues.push({ key: def.key, message: `${def.label}长度不得超过 ${def.maxLength}` });
        }
        break;
      }
      case 'number': {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) {
          issues.push({ key: def.key, message: `${def.label}必须是数值` });
          break;
        }
        if (def.min !== undefined && numeric < def.min) {
          issues.push({ key: def.key, message: `${def.label}不得小于 ${def.min}` });
        }
        if (def.max !== undefined && numeric > def.max) {
          issues.push({ key: def.key, message: `${def.label}不得大于 ${def.max}` });
        }
        break;
      }
      case 'enum': {
        const options = def.options ?? [];
        if (typeof value !== 'string' || !options.includes(value)) {
          issues.push({ key: def.key, message: `${def.label}必须是预设选项之一` });
        }
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') issues.push({ key: def.key, message: `${def.label}必须是布尔值` });
        break;
      }
    }
  }

  return issues;
}
