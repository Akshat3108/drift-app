import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

import HomeScreen        from '../screens/Home';
import ScanScreen        from '../screens/Scan';
import TrendsScreen      from '../screens/Trends';
import SubsScreen        from '../screens/Subs';
import AddScreen         from '../screens/Add';
import DetailScreen      from '../screens/Detail';
import PotDetailScreen   from '../screens/PotDetail';
import GoalsScreen       from '../screens/Goals';
import ProfileScreen     from '../screens/Profile';
import NetWorthScreen    from '../screens/NetWorth';
import TravelScreen      from '../screens/Travel';
import AllExpensesScreen from '../screens/AllExpenses';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  Home:   '🏠',
  Scan:   '📷',
  Trends: '📊',
  Subs:   '🔄',
};

// ── Custom tab bar — fixes Samsung S26 Ultra gesture bar overlap ──
function CustomTabBar({ state, navigation }) {
  const { F } = useApp();
  // insets.bottom = height of the gesture navigation bar (0 on older Androids,
  // ~24-34px on edge-to-edge gesture nav phones like Samsung S-series)
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: F.surface,
      borderTopWidth: 1,
      borderTopColor: F.line,
      paddingTop: 10,
      paddingHorizontal: 8,
      // This is the critical fix: pad by the actual gesture bar height
      paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
      // Subtle shadow so it lifts off the page
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 12,
    }}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;

        // Floating + button in the centre
        if (route.name === 'Add') {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate('Add')}
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
          );
        }

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
      })}
    </View>
  );
}

// ── Tabs ──────────────────────────────────────────────────────
function Tabs() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props}/>}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"   component={HomeScreen}/>
      <Tab.Screen name="Scan"   component={ScanScreen}/>
      <Tab.Screen name="Add"    component={AddScreen}/>
      <Tab.Screen name="Trends" component={TrendsScreen}/>
      <Tab.Screen name="Subs"   component={SubsScreen}/>
    </Tab.Navigator>
  );
}

// ── Root stack ────────────────────────────────────────────────
export default function Navigation() {
  const { F } = useApp();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: F.surface },
        headerTintColor: F.ink,
        headerTitleStyle: { fontWeight: '400', fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: F.bg },
      }}>
        <Stack.Screen name="Tabs"      component={Tabs}            options={{ headerShown: false }}/>
        <Stack.Screen name="Detail"    component={DetailScreen}    options={{ title: 'Spend detail' }}/>
        <Stack.Screen name="PotDetail" component={PotDetailScreen} options={({ route }) => ({
          title: route.params?.potName || 'Pot detail',
        })}/>
        <Stack.Screen name="Goals"     component={GoalsScreen}     options={{ title: 'Goals' }}/>
        <Stack.Screen name="Profile"   component={ProfileScreen}   options={{ title: 'Profile' }}/>
        <Stack.Screen name="NetWorth"  component={NetWorthScreen}  options={{ title: 'Net Worth' }}/>
        <Stack.Screen name="Travel"    component={TravelScreen}    options={{ title: 'Travel Mode' }}/>
        <Stack.Screen name="AllExpenses" component={AllExpensesScreen}
          options={{ title: 'All transactions' }}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
