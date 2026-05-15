import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from './src/hooks/useAppState';
import Navigation from './src/navigation';

function AppWithTheme() {
  const { settings } = useApp();
  return (
    <>
      <StatusBar style={settings.dark ? 'light' : 'dark'}/>
      <Navigation/>
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
