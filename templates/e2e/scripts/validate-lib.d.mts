// Hand-written declarations for the shared plain-JS validator, so the typed
// suite (src/contract/validate.ts) consumes the SAME implementation the gate
// corpus and the gates-selftest fixtures prove — one validator, three consumers.

export interface FoundOperation {
  path: string;
  method: string;
  operation: Record<string, unknown>;
}

export interface FoundResponseSchema {
  contentType: string;
  schema: unknown;
}

export interface ContractLocation {
  path: string;
  origin: string;
}

export declare function resolveRef(root: unknown, ref: string): unknown;
export declare function validateAgainstSchema(schema: unknown, value: unknown, root?: unknown, path?: string, depth?: number): string[];
export declare function findOperation(spec: unknown, operationId: string): FoundOperation | undefined;
export declare function listOperationIds(spec: unknown): string[];
export declare function responseSchema(operation: Record<string, unknown>, status: number): FoundResponseSchema | undefined;
export declare function locateContract(options?: { cwd?: string; env?: Record<string, string | undefined> }): ContractLocation;
