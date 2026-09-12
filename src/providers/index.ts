import { ApiProfile } from '../types/apiProfile';
import { ILlmProvider } from '../types/provider';
import { openAICompatibleProvider } from './openaiCompatibleProvider';
import { mockLlmProvider, MOCK_PROFILE_ID } from './mockProvider';

export function getProviderForProfile(profile: ApiProfile): ILlmProvider {
  if (profile.id === MOCK_PROFILE_ID || profile.baseUrl.includes('mock.grill-web.local')) {
    return mockLlmProvider;
  }
  return openAICompatibleProvider;
}

export * from './openaiCompatibleProvider';
export * from './mockProvider';
export * from './sseStream';
