import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from './src/hooks/useAppState';
import Navigation from './src/navigation';
import Onboarding from './src/features/profile/screens/Onboarding';
import Orientation from './src/features/profile/screens/Orientation';
import { ToastProvider } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';

// 2.D.15 — Three-state root gate:
//   !onboarded                          → Onboarding (collects profile + pots)
//   onboarded && !orientation_seen      → Orientation (Day-0 tour)
//   else                                → Navigation (main app)
function AppWithTheme() {
  const { settings, onboarded } = useApp();
  let root;
  if (!onboarded) root = <Onboarding/>;
  else if (!settings.orientation_seen) root = <Orientation/>;
  else root = <Navigation/>;
  return (
    <>
      <StatusBar style={settings.dark_mode ? 'light' : 'dark'}/>
      {root}
    </>
  );
}

export default function App() {
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
