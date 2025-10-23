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
import fetch from 'node-fetch';

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
  fetch: async (url, init) => {
    try {
      const urlString = typeof url === 'string' ? url : url.toString();
      const isHttps = urlString.startsWith('https://');

      logger.debug('Making OpenAI API request', {
        url: urlString,
        method: init?.method || 'GET',
      });

      // Use node-fetch with explicit agent to force IPv4
      const response = await fetch(url as any, {
        ...init,
        headers: {
          ...init?.headers,
          'User-Agent': 'dnd-session-recorder',
        },
        // Force IPv4 by using custom agent - node-fetch respects this properly
        agent: isHttps ? httpsAgent : httpAgent,
        // Add signal for timeout handling if not already present
        signal: init?.signal,
      } as any);

      logger.debug('OpenAI API request completed', {
        url: urlString,
        status: response.status,
      });

      return response as any;
    } catch (error) {
      logger.error('OpenAI API request failed', error as Error, {
        url: typeof url === 'string' ? url : url.toString(),
      });
      throw error;
    }
  },
});
