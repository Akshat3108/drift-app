import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from './src/hooks/useAppState';
import Navigation from './src/navigation';
import Onboarding from './src/screens/Onboarding';

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
        <AppProvider>
          <AppWithTheme/>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
