import type { LifecycleInput, LifecycleResult } from '../../memory-core/contracts.js';
import type { MemoryService } from '../../memory-core/service.js';

export class LifecycleRuntime {
  constructor(private readonly service: MemoryService) {}
  handle(input: LifecycleInput): LifecycleResult { return this.service.lifecycle(input); }
}
