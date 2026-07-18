import { ApiConfig } from './types';

export interface ConnectionTestRequest {
  type: 'TEST_CONNECTION';
  payload: {
    apiConfig: ApiConfig;
    apiKey: string;
  };
}

export function buildConnectionTestRequest(apiConfig: ApiConfig, apiKey: string): ConnectionTestRequest {
  return {
    type: 'TEST_CONNECTION',
    payload: {
      apiConfig: { ...apiConfig },
      apiKey,
    },
  };
}
