/**
 * 04 - Pairing with TanStack Query (React Query)
 *
 * Demonstrates:
 * 1. Configuring react-native-fetch-client as the HTTP transport layer for TanStack Query
 * 2. Setting `cache: false` to avoid double-caching (TanStack Query manages in-memory caching)
 * 3. Leveraging single-flight 401 token refresh mutex under concurrent queries
 * 4. Wiring TanStack Query's AbortSignal into api.get() for automatic request cancellation
 * 5. Clean useQuery and useMutation recipes
 */

import { createClient } from 'react-native-fetch-client';

// Simulated auth storage
let currentAccessToken = 'valid-token';

// 1. Create client configured as transport layer
export const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10000,
  // Disable client-level caching so TanStack Query manages query cache and stale times
  cache: false,
  // 401 Single-Flight Mutex coordinates all simultaneous TanStack queries seamlessly
  auth: {
    getToken: async () => currentAccessToken,
    refreshToken: async () => {
      // Called ONCE even if 10 queries fail simultaneously with 401
      const res = await fetch('https://api.example.com/v1/auth/refresh', { method: 'POST' });
      const data = (await res.json()) as { accessToken: string };
      currentAccessToken = data.accessToken;
      return currentAccessToken;
    },
    refreshExcludeUrls: ['/auth/login', '/auth/refresh'],
  },
});

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface UpdateUserDto {
  name: string;
}

/**
 * Recipe 1: Query Function with AbortSignal Pass-Through & unwrap: true
 *
 * TanStack Query provides an AbortSignal in QueryFunctionContext.
 * Passing this signal into api.get() ensures that when a component unmounts
 * or the query key changes, in-flight requests are immediately aborted.
 */
export async function fetchUserById(userId: string, signal?: AbortSignal): Promise<User> {
  return api.get<User>(`/users/${userId}`, {
    unwrap: true,
    signal,
  });
}

/**
 * Recipe 2: Mutation Function
 */
export async function updateUserProfile(userId: string, data: UpdateUserDto): Promise<User> {
  return api.patch<User>(`/users/${userId}`, data, {
    unwrap: true,
  });
}

/**
 * Example React Component usage with TanStack Query:
 *
 * ```typescript
 * import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 * import { fetchUserById, updateUserProfile, type User } from './api';
 *
 * export function UserProfileScreen({ userId }: { userId: string }) {
 *   const queryClient = useQueryClient();
 *
 *   const { data: user, isLoading, error } = useQuery({
 *     queryKey: ['users', userId],
 *     queryFn: ({ signal }) => fetchUserById(userId, signal),
 *   });
 *
 *   const mutation = useMutation({
 *     mutationFn: (newName: string) => updateUserProfile(userId, { name: newName }),
 *     onSuccess: (updated) => {
 *       queryClient.setQueryData(['users', userId], updated);
 *     },
 *   });
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *   return <ProfileView user={user} onRename={(name) => mutation.mutate(name)} />;
 * }
 * ```
 */
