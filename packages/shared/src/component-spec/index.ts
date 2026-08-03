export type {
  ComponentParam,
  ComponentSizing,
  ComponentSpecRecord,
  SpecValidationResult,
  ComponentSpecStamp,
} from './types';

export type { ComponentSpecPolicy, SpecNamingRule } from './policy';
export { checkSpecNamingPolicy } from './policy';

export {
  validateComponentSpecHtml,
  isValidSpecName,
  ALLOWED_CSS_PROPS,
  ALLOWED_TAGS,
  CONTAINER_TAGS,
  TEXT_TAGS,
  SLOT_ALLOWED_TAGS,
  SLOT_ALLOWED_CSS_PROPS,
  SPEC_NAME_RE,
  SPEC_HTML_MAX_LENGTH,
} from './validate';
