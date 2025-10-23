/**
 * OpenAI client configuration
 *
 * Centralized configuration to handle network/SSL issues in production environments
 */

import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@/lib/logger';
import https from 'https';
import http from 'http';
// Use node-fetch v2 which properly supports agent option for IPv4
import fetch, { type RequestInit as NodeFetchRequestInit, type Response as NodeFetchResponse } from 'node-fetch';

// Create custom agents with IPv4 preference to avoid IPv6 issues on Fly.io
const httpsAgent = new https.Agent({
  family: 4, // Force IPv4
  keepAlive: true,
  timeout: 60000, // 60 second timeout
  // Add more aggressive SSL options
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2',
});

const httpAgent = new http.Agent({
  family: 4,
  keepAlive: true,
  timeout: 60000,
});

// Create OpenAI client with explicit configuration
// This helps avoid SSL/network issues in containerized environments like Fly.io
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Explicitly set baseURL to ensure correct endpoint
  baseURL: 'https://api.openai.com/v1',
  // Add custom fetch with better error handling and network configuration
  fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const urlString = typeof url === 'string' ? url : url.toString();
      const isHttps = urlString.startsWith('https://');

      logger.debug('Making OpenAI API request', {
        url: urlString,
        method: init?.method || 'GET',
      });

      // Use node-fetch with explicit agent to force IPv4
      // Convert standard RequestInit to node-fetch RequestInit
      const nodeFetchInit: NodeFetchRequestInit = {
        method: init?.method,
        headers: {
          ...(init?.headers as Record<string, string>),
          'User-Agent': 'dnd-session-recorder',
        },
        body: init?.body as NodeFetchRequestInit['body'],
        // Force IPv4 by using custom agent - node-fetch respects this properly
        agent: isHttps ? httpsAgent : httpAgent,
        signal: init?.signal,
      };

      const response: NodeFetchResponse = await fetch(urlString, nodeFetchInit);

      logger.debug('OpenAI API request completed', {
        url: urlString,
        status: response.status,
      });

      // Convert node-fetch Response to standard Response
      return response as unknown as Response;
    } catch (error) {
      logger.error('OpenAI API request failed', error as Error, {
        url: typeof url === 'string' ? url : url.toString(),
      });
      throw error;
    }
  },
});
