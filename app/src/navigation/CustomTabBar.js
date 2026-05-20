import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../core/theme/ThemeContext';

const TAB_ICONS = { Home: '🏠', Scan: '📷', Trends: '📊', Subs: '🔄' };

const CustomTabBar = React.memo(function CustomTabBar({ state, navigation }) {
  const { F } = useTheme();
  const insets = useSafeAreaInsets();

  // Add is a modal Stack.Screen, not a tab — the + button lives between
  // Scan (idx 1) and Trends (idx 2) and pushes onto the parent stack.
  const openAdd = () => navigation.getParent()?.navigate('Add');

  const tab = (route, index) => {
    const focused = state.index === index;
    return (
      <TouchableOpacity
        key={route.key}
        onPress={() => navigation.navigate(route.name)}
        activeOpacity={0.65}
        style={{ flex: 1, alignItems: 'center', gap: 3 }}
      >
        <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>
          {TAB_ICONS[route.name]}
        </Text>
        <Text style={{
          fontSize: 10.5,
          color: focused ? F.coral : F.ink3,
          fontWeight: focused ? '700' : '500',
        }}>
          {route.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: F.surface,
      borderTopWidth: 1,
      borderTopColor: F.line,
      paddingTop: 10,
      paddingHorizontal: 8,
      paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 12,
    }}>
      {state.routes[0] && tab(state.routes[0], 0)}
      {state.routes[1] && tab(state.routes[1], 1)}

      <TouchableOpacity
        key="add-modal"
        onPress={openAdd}
        activeOpacity={0.85}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{
          width: 54, height: 54, borderRadius: 17,
          backgroundColor: F.coral,
          alignItems: 'center', justifyContent: 'center',
          marginTop: -22,
          shadowColor: F.coral,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45,
          shadowRadius: 12,
          elevation: 10,
        }}>
          <Text style={{ fontSize: 30, color: '#fff', lineHeight: 36 }}>+</Text>
        </View>
      </TouchableOpacity>

      {state.routes[2] && tab(state.routes[2], 2)}
      {state.routes[3] && tab(state.routes[3], 3)}
    </View>
  );
});

export default CustomTabBar;
