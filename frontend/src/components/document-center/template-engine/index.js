/**
 * 模板引擎主入口
 * 导出所有核心组件
 */

// Parser
export { Tokenizer } from './parser/tokenizer.js';
export { ASTBuilder } from './parser/ast-builder.js';
export { TemplateParser } from './parser/template-parser.js';

// Resolver
export { VariableResolver } from './resolver/variable-resolver.js';
export { FilterRegistry } from './resolver/filter-registry.js';
export { DataAccessor } from './resolver/data-accessor.js';

// Binder (阶段二)
export { DataBinderV2 } from './binder/data-binder-v2.js';
export { LoopProcessor } from './binder/loop-processor.js';
export { ConditionProcessor } from './binder/condition-processor.js';

// Utils
export { TemplateCache, globalCache } from './utils/cache.js';
export {
  VariableNotFoundError,
  FilterNotFoundError,
  SyntaxError,
  StructureError,
  ErrorFormatter
} from './utils/error-handler.js';

