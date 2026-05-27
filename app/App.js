import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from './src/hooks/useAppState';
import Navigation from './src/navigation';
import Onboarding from './src/features/profile/screens/Onboarding';
import Orientation from './src/features/profile/screens/Orientation';
import { ToastProvider } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { runMaintenanceIfDue } from './src/maintenance';
import LockGate from './src/features/lock/LockGate';

// 2.D.15 — Three-state root gate:
//   !onboarded                          → Onboarding (collects profile + pots)
//   onboarded && !orientation_seen      → Orientation (Day-0 tour)
//   else                                → Navigation (main app, gated by LockGate per 8.11)
function AppWithTheme() {
  const { settings, onboarded } = useApp();
  let root;
  if (!onboarded) root = <Onboarding/>;
  else if (!settings.orientation_seen) root = <Orientation/>;
  else root = <LockGate><Navigation/></LockGate>;
  return (
    <>
      <StatusBar style={settings.dark_mode ? 'light' : 'dark'}/>
      {root}
    </>
  );
}

export default function App() {
  // 8.7 — Maintenance job trigger. Fires on AppState background→active
  // only (cold-start excluded per roadmap). The job itself is internally
  // rate-limited to ≥24h so calling it on every transition is safe.
  const lastStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if (prev === 'background' && next === 'active') {
        // Fire-and-forget. Errors are logged inside runMaintenanceIfDue.
        runMaintenanceIfDue().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary name="Drift">
          <AppProvider>
            <ToastProvider>
              <AppWithTheme/>
            </ToastProvider>
          </AppProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
