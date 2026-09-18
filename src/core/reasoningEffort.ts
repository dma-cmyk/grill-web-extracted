export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

// This list is the valid string vocabulary only; it must not determine UI candidates.
export const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
] as const;

export type ReasoningEffortSelection = 'auto' | ReasoningEffort;

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string'
    && REASONING_EFFORT_VALUES.includes(value as ReasoningEffort);
}

export function parseSupportedReasoningEfforts(model: unknown): ReasoningEffort[] | undefined {
  if (typeof model !== 'object' || model === null) {
    return undefined;
  }

  const modelRecord = model as Record<string, unknown>;
  const capabilities = modelRecord.capabilities;
  const capabilitiesRecord = typeof capabilities === 'object' && capabilities !== null
    ? capabilities as Record<string, unknown>
    : undefined;
  const reasoningEffort = capabilitiesRecord?.reasoning_effort;
  const reasoningEffortRecord = typeof reasoningEffort === 'object' && reasoningEffort !== null
    ? reasoningEffort as Record<string, unknown>
    : undefined;
  const declarations = [
    modelRecord.supported_reasoning_efforts,
    capabilitiesRecord?.supported_reasoning_efforts,
    reasoningEffortRecord?.values,
  ];

  const declaredValues = declarations.flatMap((declaration) => (
    Array.isArray(declaration) ? declaration : []
  ));
  const supported = REASONING_EFFORT_VALUES.filter((effort) => (
    declaredValues.some((value) => value === effort)
  ));

  return supported.length > 0 ? supported : undefined;
}

export function reasoningEffortOptions(supported?: ReasoningEffort[]): ReasoningEffortSelection[] {
  if (supported === undefined || supported.length === 0) {
    return ['auto'];
  }

  const orderedSupported = REASONING_EFFORT_VALUES.filter((effort) => supported.includes(effort));
  return ['auto', ...orderedSupported];
}

function allowedReasoningEffortText(supported?: ReasoningEffort[]): string {
  return reasoningEffortOptions(supported)
    .map((selection) => selection.toUpperCase())
    .join('、');
}


export function validateReasoningEffort(
  value: unknown,
  supported?: ReasoningEffort[],
): { valid: boolean; effort?: ReasoningEffort; error?: string } {
  if (value === undefined || value === null || value === 'auto') {
    return { valid: true };
  }

  if (!isReasoningEffort(value)) {
    return {
      valid: false,
      error: `推論努力値が不正です。許容される候補は ${allowedReasoningEffortText(supported)} です。`,
    };
  }

  if (supported === undefined || supported.length === 0 || !supported.includes(value)) {
    if (supported !== undefined && supported.length > 0) {
      return {
        valid: false,
        error: `指定された推論努力値「${value.toUpperCase()}」は対応していません。許容される候補は ${allowedReasoningEffortText(supported)} です。未申告時は AUTO のみです。`,
      };
    }

    return {
      valid: false,
      error: '推論努力値が不正です。許容される候補は AUTO のみです。',
    };
  }

  return { valid: true, effort: value };
}

export function describeReasoningEffort(effort?: ReasoningEffort): string {
  return effort === undefined ? 'AUTO' : effort.toUpperCase();
}
