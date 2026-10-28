import { AttributeDef, normalizeAttrSchema, pickAttributes, validateAttributes } from './attribute';

describe('attribute', () => {
  describe('normalizeAttrSchema', () => {
    it('接受合法的属性模式定义', () => {
      const { schema, issues } = normalizeAttrSchema([
        { key: 'location', label: '位置', valueType: 'text', required: true },
        { key: 'capacity', label: '容纳人数', valueType: 'number', min: 0 },
        { key: 'category', label: '品类', valueType: 'enum', options: ['办公', '生产'] },
        { key: 'active', label: '在用', valueType: 'boolean' },
      ]);
      expect(issues).toEqual([]);
      expect(schema).toHaveLength(4);
    });

    it('拒绝重复键名', () => {
      const { issues } = normalizeAttrSchema([
        { key: 'a', label: 'A', valueType: 'text' },
        { key: 'a', label: 'A2', valueType: 'text' },
      ]);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('枚举类型必须提供选项', () => {
      const { issues } = normalizeAttrSchema([
        { key: 'color', label: '颜色', valueType: 'enum' },
      ]);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('未知值类型被拒绝', () => {
      const { issues } = normalizeAttrSchema([
        { key: 'x', label: 'X', valueType: 'date' },
      ]);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('空输入返回空模式', () => {
      expect(normalizeAttrSchema(undefined).schema).toEqual([]);
      expect(normalizeAttrSchema(null).schema).toEqual([]);
      expect(normalizeAttrSchema([]).schema).toEqual([]);
    });
  });

  describe('pickAttributes', () => {
    it('只挑出模式声明的键', () => {
      const schema: AttributeDef[] = [
        { key: 'a', label: 'A', valueType: 'text' },
        { key: 'b', label: 'B', valueType: 'number' },
      ];
      const result = pickAttributes(schema, { a: '1', b: 2, c: 'ignored' });
      expect(result).toEqual({ a: '1', b: 2 });
    });
  });

  describe('validateAttributes', () => {
    const schema: AttributeDef[] = [
      { key: 'name', label: '名称', valueType: 'text', required: true, maxLength: 10 },
      { key: 'age', label: '年龄', valueType: 'number', min: 0, max: 150 },
      { key: 'role', label: '角色', valueType: 'enum', options: ['admin', 'user'] },
      { key: 'active', label: '启用', valueType: 'boolean' },
    ];

    it('必填项缺失时报错', () => {
      const issues = validateAttributes(schema, { age: 30 });
      expect(issues.some((i) => i.key === 'name')).toBe(true);
    });

    it('文本超长时报错', () => {
      const issues = validateAttributes(schema, { name: 'a'.repeat(20) });
      expect(issues.some((i) => i.key === 'name')).toBe(true);
    });

    it('数值越界时报错', () => {
      const issues = validateAttributes(schema, { name: 'ok', age: 999 });
      expect(issues.some((i) => i.key === 'age')).toBe(true);
    });

    it('枚举值不在选项内时报错', () => {
      const issues = validateAttributes(schema, { name: 'ok', role: 'superadmin' });
      expect(issues.some((i) => i.key === 'role')).toBe(true);
    });

    it('布尔类型校验', () => {
      const issues = validateAttributes(schema, { name: 'ok', active: 'yes' });
      expect(issues.some((i) => i.key === 'active')).toBe(true);
    });

    it('合法数据无问题', () => {
      const issues = validateAttributes(schema, {
        name: 'ok',
        age: 30,
        role: 'admin',
        active: true,
      });
      expect(issues).toEqual([]);
    });
  });
});
