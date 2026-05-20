import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../core/theme/ThemeContext';
import CustomTabBar from './CustomTabBar';

import HomeScreen        from '@features/home/screens/Home';
import ScanScreen        from '@features/scan/screens/Scan';
import TrendsScreen      from '@features/trends/screens/Trends';
import SubsScreen        from '@features/subs/screens/Subs';
import AddScreen         from '@features/expenses/screens/Add';
import DetailScreen      from '@features/expenses/screens/Detail';
import PotDetailScreen   from '@features/categories/screens/PotDetail';
import GoalsScreen       from '@features/goals/screens/Goals';
import ProfileScreen     from '@features/profile/screens/Profile';
import ExportScreen      from '@features/profile/screens/Export';
import NetWorthScreen    from '@features/accounts/screens/NetWorth';
import TravelScreen      from '@features/travel/screens/Travel';
import AllExpensesScreen from '@features/expenses/screens/AllExpenses';
import SearchScreen      from '@features/expenses/screens/Search';
import MerchantsScreen       from '@features/expenses/screens/Merchants';
import MerchantDetailScreen  from '@features/expenses/screens/MerchantDetail';
import ItemsScreen       from '@features/items/screens/Items';
import ItemTrendScreen   from '@features/items/screens/ItemTrend';
import EditExpenseScreen from '@features/expenses/screens/EditExpense';
import EditPotScreen     from '@features/categories/screens/EditPot';
import EditSubScreen     from '@features/subs/screens/EditSub';
import EditGoalScreen    from '@features/goals/screens/EditGoal';
import EditAccountScreen from '@features/accounts/screens/EditAccount';
import EditTripScreen    from '@features/travel/screens/EditTrip';

import { withBoundary } from '../components/ErrorBoundary';

const Home        = withBoundary('Home',        HomeScreen);
const Scan        = withBoundary('Scan',        ScanScreen);
const Trends      = withBoundary('Trends',      TrendsScreen);
const Subs        = withBoundary('Subs',        SubsScreen);
const Add         = withBoundary('Add',         AddScreen);
const Detail      = withBoundary('Detail',      DetailScreen);
const PotDetail   = withBoundary('PotDetail',   PotDetailScreen);
const Goals       = withBoundary('Goals',       GoalsScreen);
const Profile     = withBoundary('Profile',     ProfileScreen);
const Export      = withBoundary('Export',      ExportScreen);
const NetWorth    = withBoundary('NetWorth',    NetWorthScreen);
const Travel      = withBoundary('Travel',      TravelScreen);
const AllExpenses    = withBoundary('AllExpenses',    AllExpensesScreen);
const Search         = withBoundary('Search',         SearchScreen);
const Merchants      = withBoundary('Merchants',      MerchantsScreen);
const MerchantDetail = withBoundary('MerchantDetail', MerchantDetailScreen);
const Items       = withBoundary('Items',       ItemsScreen);
const ItemTrend   = withBoundary('ItemTrend',   ItemTrendScreen);
const EditExpense = withBoundary('EditExpense', EditExpenseScreen);
const EditPot     = withBoundary('EditPot',     EditPotScreen);
const EditSub     = withBoundary('EditSub',     EditSubScreen);
const EditGoal    = withBoundary('EditGoal',    EditGoalScreen);
const EditAccount = withBoundary('EditAccount', EditAccountScreen);
const EditTrip    = withBoundary('EditTrip',    EditTripScreen);

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const renderTabBar = (props) => <CustomTabBar {...props}/>;

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"   component={Home}/>
      <Tab.Screen name="Scan"   component={Scan}/>
      <Tab.Screen name="Trends" component={Trends}/>
      <Tab.Screen name="Subs"   component={Subs}/>
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { F } = useTheme();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: F.surface },
        headerTintColor: F.ink,
        headerTitleStyle: { fontWeight: '400', fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: F.bg },
      }}>
        <Stack.Screen name="Tabs"        component={Tabs}        options={{ headerShown: false }}/>
        <Stack.Screen name="Add"         component={Add}         options={{ presentation: 'modal', headerShown: false }}/>
        <Stack.Screen name="Detail"      component={Detail}      options={{ title: 'Spend detail' }}/>
        <Stack.Screen name="PotDetail"   component={PotDetail}   options={({ route }) => ({
          title: route.params?.potName || 'Pot detail',
        })}/>
        <Stack.Screen name="Goals"       component={Goals}       options={{ title: 'Goals' }}/>
        <Stack.Screen name="Profile"     component={Profile}     options={{ title: 'Profile' }}/>
        <Stack.Screen name="Export"      component={Export}      options={{ presentation: 'modal', headerShown: false }}/>
        <Stack.Screen name="NetWorth"    component={NetWorth}    options={{ title: 'Net Worth' }}/>
        <Stack.Screen name="Travel"      component={Travel}      options={{ title: 'Travel' }}/>
        <Stack.Screen name="AllExpenses" component={AllExpenses} options={{ title: 'All transactions' }}/>
        <Stack.Screen name="Search"      component={Search}      options={{ presentation: 'modal', headerShown: false }}/>
        <Stack.Screen name="Merchants"   component={Merchants}   options={{ title: 'Top merchants' }}/>
        <Stack.Screen name="MerchantDetail" component={MerchantDetail} options={({ route }) => ({
          title: route.params?.displayName || 'Merchant',
        })}/>
        <Stack.Screen name="Items"       component={Items}       options={{ title: 'Tracked items' }}/>
        <Stack.Screen name="ItemTrend"   component={ItemTrend}   options={({ route }) => ({
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
