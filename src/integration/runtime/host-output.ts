import type {
      HarnessId,
      HostOutputDirective,
      HostOutputMapping,
      HostOutputPurpose,
    } from '../core/types.js';

    export const MAX_HOST_OUTPUT_TEXT_CODE_POINTS = 1_000;
    export const MAX_DELIVERY_MAPPING_ID_CODE_POINTS = 128;

    export type HostOutputRenderer = 'opencode-protocol-output' | 'shared-runner-output';

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isBoundedText(value: unknown): value is string {
      return typeof value === 'string'
        && value.length > 0
        && Array.from(value).length <= MAX_HOST_OUTPUT_TEXT_CODE_POINTS;
    }

    function isDeliveryMappingId(value: unknown): value is string {
      return typeof value === 'string'
        && Array.from(value).length <= MAX_DELIVERY_MAPPING_ID_CODE_POINTS
        && /^[a-z0-9][a-z0-9.-]*$/.test(value);
    }

    function isPurpose(value: unknown): value is HostOutputPurpose {
      return value === 'recovery_context' || value === 'post_compaction_guidance';
    }

    export function validateHostOutputDirective(
      value: unknown,
      expectedMappingId?: string,
    ): HostOutputDirective | undefined {
      if (!isRecord(value)
        || Object.keys(value).length !== 3
        || !Object.hasOwn(value, 'purpose')
        || !Object.hasOwn(value, 'text')
        || !Object.hasOwn(value, 'deliveryMappingId')
        || !isPurpose(value.purpose)
        || !isBoundedText(value.text)
        || !isDeliveryMappingId(value.deliveryMappingId)
        || (expectedMappingId !== undefined && value.deliveryMappingId !== expectedMappingId)) {
        return undefined;
      }

      return {
        purpose: value.purpose,
        text: value.text,
        deliveryMappingId: value.deliveryMappingId,
      };
    }

    export function createHostOutputDirective(
      purpose: HostOutputPurpose,
      text: string,
      mapping: HostOutputMapping,
    ): HostOutputDirective | undefined {
      if (!mapping.ready || mapping.mappingId !== mapping.verifiedMappingId) {
        return undefined;
      }

      return validateHostOutputDirective({
        purpose,
        text,
        deliveryMappingId: mapping.mappingId,
      }, mapping.verifiedMappingId);
    }

    export function selectHostOutputRenderer(harness: HarnessId): HostOutputRenderer {
      return harness === 'opencode' ? 'opencode-protocol-output' : 'shared-runner-output';
    }
