import { catalogCapabilities } from './capability-registry.ts';

export const governanceFunction = 'catalog_transition_capability';
export const governanceSignature = `${governanceFunction}(text,uuid,text,text,text,uuid,text,text)`;
export const governanceParameters = [
  ['p_actor_firebase_uid', 'text'], ['p_subject_id', 'uuid'], ['p_capability', 'text'],
  ['p_scope', 'text'], ['p_action', 'text'], ['p_expected_event_id', 'uuid'],
  ['p_reason', 'text'], ['p_request_id', 'text'],
] as const;
export const governanceLock = [1314214994, 1] as const;
export const delegatedCapabilities: readonly string[] = Object.freeze([
  catalogCapabilities.sourcePermissionReview, catalogCapabilities.nutritionReview,
  catalogCapabilities.publicationPublish, catalogCapabilities.publicationWithdraw,
]);
