import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from './src/hooks/useAppState';
import Navigation from './src/navigation';
import Onboarding from './src/features/profile/screens/Onboarding';
import { ToastProvider } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AppWithTheme() {
  const { settings, onboarded } = useApp();
  return (
    <>
      <StatusBar style={settings.dark_mode ? 'light' : 'dark'}/>
      {onboarded ? <Navigation/> : <Onboarding/>}
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
