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
import ItemsScreen       from '../screens/Items';
import ItemTrendScreen   from '../screens/ItemTrend';
import EditExpense       from '../screens/EditExpense';
import EditPot           from '../screens/EditPot';
import EditSub           from '../screens/EditSub';
import EditGoal          from '../screens/EditGoal';
import EditAccount       from '../screens/EditAccount';
import EditTrip          from '../screens/EditTrip';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = { Home: '🏠', Scan: '📷', Trends: '📊', Subs: '🔄' };

function CustomTabBar({ state, navigation }) {
  const { F } = useApp();
  const insets = useSafeAreaInsets();

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
      {state.routes.map((route, index) => {
        const focused = state.index === index;

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
        <Stack.Screen name="Tabs"        component={Tabs}            options={{ headerShown: false }}/>
        <Stack.Screen name="Detail"      component={DetailScreen}    options={{ title: 'Spend detail' }}/>
        <Stack.Screen name="PotDetail"   component={PotDetailScreen} options={({ route }) => ({
          title: route.params?.potName || 'Pot detail',
        })}/>
        <Stack.Screen name="Goals"       component={GoalsScreen}     options={{ title: 'Goals' }}/>
        <Stack.Screen name="Profile"     component={ProfileScreen}   options={{ title: 'Profile' }}/>
        <Stack.Screen name="NetWorth"    component={NetWorthScreen}  options={{ title: 'Net Worth' }}/>
        <Stack.Screen name="Travel"      component={TravelScreen}    options={{ title: 'Travel' }}/>
        <Stack.Screen name="AllExpenses" component={AllExpensesScreen} options={{ title: 'All transactions' }}/>
        <Stack.Screen name="Items"       component={ItemsScreen}     options={{ title: 'Tracked items' }}/>
        <Stack.Screen name="ItemTrend"   component={ItemTrendScreen} options={({ route }) => ({
          title: route.params?.displayName ? route.params.displayName.replace(/^./, c => c.toUpperCase()) : 'Item',
        })}/>
        <Stack.Screen name="EditExpense" component={EditExpense} options={{ title: 'Edit expense' }}/>
        <Stack.Screen name="EditPot"     component={EditPot}     options={{ title: 'Categories' }}/>
        <Stack.Screen name="EditSub"     component={EditSub}     options={{ title: 'Subscription' }}/>
        <Stack.Screen name="EditGoal"    component={EditGoal}    options={{ title: 'Goal' }}/>
        <Stack.Screen name="EditAccount" component={EditAccount} options={{ title: 'Account' }}/>
        <Stack.Screen name="EditTrip"    component={EditTrip}    options={{ title: 'Trip' }}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
