/**
 * 01 - Basic Requests & Safe Tuples
 *
 * Demonstrates basic HTTP verbs, query/path parameters, headers,
 * and the Go/Rust-style Safe Requests API (api.safe.*).
 */

import { createClient } from 'react-native-fetch-client';

const api = createClient({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
  },
});

interface User {
  id: number;
  name: string;
  email: string;
}

interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

async function main() {
  console.log('--- 1. Standard GET Request ---');
  const userRes = await api.get<User>('/users/1');
  console.log('User status:', userRes.status);
  console.log('User name:', userRes.data.name);
  console.log('Latency (ms):', userRes.durationMs);

  console.log('\n--- 2. Path & Query Parameters ---');
  const postsRes = await api.get<Post[]>('/posts', {
    params: { userId: 1, _limit: 2 },
  });
  console.log(`Retrieved ${postsRes.data.length} posts for user 1.`);

  console.log('\n--- 3. POST Mutation ---');
  const newPost = await api.post<Post>('/posts', {
    userId: 1,
    title: 'Hello React Native Fetch Client',
    body: 'Zero-dependency Fetch-native networking for mobile and web.',
  });
  console.log('Created post ID:', newPost.data.id);

  console.log('\n--- 4. Safe Requests API (No try/catch) ---');
  const [data, error] = await api.safe.get<User>('/users/999999');
  if (error) {
    console.log('Safe request handled error gracefully:');
    console.log('Status:', error.status);
    console.log('Message:', error.message);
  } else {
    console.log('User:', data.name);
  }
}

main().catch(console.error);
