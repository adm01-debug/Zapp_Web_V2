The objective is to perform a deep technical audit and stabilization of the entire system, focusing on fixing redundant logic, improving auth reliability, and enhancing the realtime experience.

### Technical Analysis of Identified Issues

1. **Auth & Onboarding Redundancy**: `Index.tsx` and `useOnboarding` perform overlapping checks, causing multiple "Loading" flashes. `useOnboarding` also redundantely queries the database even when local cache is present.
2. **Realtime Instability**: `useSupabaseRealtime` lacks a retry mechanism for `CHANNEL_ERROR`, which can lead to silent disconnections in unstable networks.
3. **Navigation Architecture**: `useNavigationHistory` uses a custom stack and manual `pushState` for hashes. While functional, it needs to be more resilient to browser-native navigation events (back/forward).
4. **Deferred Loading Complexity**: `App.tsx` uses a complex "ready" state for deferred providers that can be simplified using standard React patterns.
5. **Realtime Inbox Side Effects**: `RealtimeInboxView` has effects that may trigger multiple times during state transitions, leading to inconsistent UI states (e.g., selecting contacts).

### Implementation Steps

#### 1. Authentication & Onboarding Optimization
- **useAuth.tsx**: Implement a singleton/ref guard in `AuthService.getSession` to prevent multiple simultaneous requests during bootstrap.
- **useOnboarding.ts**: Optimize to skip database checks if a valid `localStorage` flag is found. Ensure state transitions are atomic.
- **Index.tsx**: Remove redundant `loading` and `user` checks. Let `ProtectedRoute` handle the gate and `Index` handle the layout.

#### 2. Realtime Reliability
- **useSupabaseRealtime.ts**: Add a backoff retry logic for `CHANNEL_ERROR` status.
- **useRealtimeNotifications.ts**: Ensure notification permissions are requested only once and handled gracefully if denied.

#### 3. Navigation Stabilization
- **useNavigationHistory.ts**: Refine the hash sync logic to avoid race conditions when clicking the browser back button.
- **AppShell.tsx**: Ensure the `navDirectionRef` is correctly updated across all navigation types (keyboard, sidebar, mobile gestures).

#### 4. Frontend Resilience
- **App.tsx**: Simplify `DeferredProviders` and `DeferredHooks` usage. Remove the manual `deferredReady` timer in favor of standard lazy loading and `Suspense`.
- **RealtimeInboxView.tsx**: Consolidate side-effects and ensure `pendingContactId` is handled atomically.

#### 5. System-wide Audit
- Review `ErrorBoundary` implementation to ensure it catches and reports errors without crashing the entire tab.
- Standardize the `LoadingSplash` usage across the app.

### Technical Details (For Developers)

- **Auth**: Use a promise-memoization pattern for `AuthService.getSession`.
- **Realtime**: Implement `setTimeout` based retry with a max-attempt limit in `useSupabaseRealtime`.
- **State**: Use `React.useTransition` where applicable to keep the UI responsive during view swaps.
- **Navigation**: Use `replace: true` in `window.history.pushState` when updating hashes if it's just a view change, to avoid bloating the browser history unless it's a "meaningful" navigation.
