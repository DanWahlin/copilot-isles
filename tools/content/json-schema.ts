/**
 * A small JSON Schema checker for the course packs' files (docs/content-data.md). It knows the keywords the
 * schemas in `courses/schemas/` use, from draft 2020-12, and throws on any other, so a schema can't
 * ask for a check that silently doesn't happen. Dev-only: the tests and `npm run content:check` use it;
 * the game never imports it (it reads the course packs' JSON, already checked).
 */

export type JsonSchema = boolean | { [keyword: string]: unknown };

export interface SchemaIssue {
  /** Where in the file, like `jobs[2].size` (empty for the root). */
  path: string;
  message: string;
}

const ANNOTATIONS = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  '$defs',
]);
const KEYWORDS = new Set([
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
  'minProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'minLength',
  'pattern',
  '$ref',
  'anyOf',
]);

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

const fits = (actual: string, want: string) => actual === want || (want === 'number' && actual === 'integer');
/** `path` and one step more, as the issues write it: `jobs[2]`, `quotes.cost`, `islands["thousand-bough"]`. */
export const at = (path: string, key: string | number) =>
  typeof key === 'number'
    ? `${path}[${key}]`
    : /^[A-Za-z_$][\w$]*$/.test(key)
      ? path
        ? `${path}.${key}`
        : key
      : `${path}[${JSON.stringify(key)}]`;

/** Every place `value` breaks `schema` (an empty list when it's valid). */
export function validate(schema: JsonSchema, value: unknown, root: JsonSchema = schema): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  check(schema, value, '', root, issues);
  return issues;
}

function resolve(ref: string, root: JsonSchema): JsonSchema {
  const m = /^#\/\$defs\/([\w-]+)$/.exec(ref);
  const defs = typeof root === 'object' ? (root.$defs as Record<string, JsonSchema> | undefined) : undefined;
  const target = m && defs?.[m[1]!];
  if (target === undefined || target === null) throw new Error(`Schema: can't resolve ${ref}`);
  return target;
}

function check(schema: JsonSchema, v: unknown, path: string, root: JsonSchema, out: SchemaIssue[]): void {
  if (schema === true) return;
  if (schema === false) {
    out.push({ path, message: 'isn’t allowed here' });
    return;
  }
  for (const k of Object.keys(schema))
    if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k))
      throw new Error(`Schema: unsupported keyword "${k}" at ${path || 'the root'}`);
  const fail = (message: string) => out.push({ path, message });

  if (typeof schema.$ref === 'string') check(resolve(schema.$ref, root), v, path, root, out);

  // anyOf: valid if one branch is. Otherwise the issues of the branch that came closest (a quiz of
  // type "hotspot" reports what its hotspot shape is missing, not every other shape's complaints).
  if (Array.isArray(schema.anyOf)) {
    let best: SchemaIssue[] | null = null;
    for (const branch of schema.anyOf as JsonSchema[]) {
      const found: SchemaIssue[] = [];
      check(branch, v, path, root, found);
      if (!found.length) {
        best = null;
        break;
      }
      if (!best || found.length < best.length) best = found;
    }
    if (best) out.push(...best);
  }

  const actual = typeOf(v);
  if (schema.type !== undefined) {
    const want = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!want.some((w) => fits(actual, w))) {
      fail(`should be ${want.join(' or ')}, not ${actual}`);
      return;
    }
  }
  if (
    schema.enum !== undefined &&
    !(schema.enum as unknown[]).some((e) => JSON.stringify(e) === JSON.stringify(v))
  )
    fail(`should be one of ${(schema.enum as unknown[]).map((e) => JSON.stringify(e)).join(', ')}`);
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(v))
    fail(`should be ${JSON.stringify(schema.const)}`);

  if (typeof v === 'string') {
    if (typeof schema.minLength === 'number' && v.length < schema.minLength)
      fail(`should be at least ${schema.minLength} characters`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(v))
      fail(`should match ${schema.pattern}`);
  }
  if (typeof v === 'number') {
    if (typeof schema.minimum === 'number' && v < schema.minimum) fail(`should be ≥ ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && v > schema.maximum) fail(`should be ≤ ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === 'number' && v <= schema.exclusiveMinimum)
      fail(`should be > ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(v)) {
    if (typeof schema.minItems === 'number' && v.length < schema.minItems)
      fail(`should have at least ${schema.minItems} items`);
    if (typeof schema.maxItems === 'number' && v.length > schema.maxItems)
      fail(`should have at most ${schema.maxItems} items`);
    if (schema.uniqueItems === true && new Set(v.map((x) => JSON.stringify(x))).size !== v.length)
      fail('should have no repeated items');
    if (schema.items !== undefined)
      v.forEach((x, i) => check(schema.items as JsonSchema, x, at(path, i), root, out));
  }
  if (actual === 'object') {
    const obj = v as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    for (const r of (schema.required ?? []) as string[])
      if (!Object.hasOwn(obj, r)) fail(`is missing "${r}"`);
    if (typeof schema.minProperties === 'number' && Object.keys(obj).length < schema.minProperties)
      fail(`should have at least ${schema.minProperties} entries`);
    for (const [k, x] of Object.entries(obj)) {
      if (schema.propertyNames !== undefined) {
        const names: SchemaIssue[] = [];
        check(schema.propertyNames as JsonSchema, k, at(path, k), root, names);
        for (const n of names) out.push({ path: n.path, message: `key ${n.message}` });
      }
      if (Object.hasOwn(props, k)) check(props[k]!, x, at(path, k), root, out);
      else if (schema.additionalProperties === false)
        out.push({ path: at(path, k), message: 'isn’t a known field' });
      else if (schema.additionalProperties !== undefined)
        check(schema.additionalProperties as JsonSchema, x, at(path, k), root, out);
    }
  }
}
