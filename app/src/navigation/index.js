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
import SpendCalendarScreen   from '@features/expenses/screens/SpendCalendar';
import ItemsScreen       from '@features/items/screens/Items';
import ItemTrendScreen   from '@features/items/screens/ItemTrend';
import EditExpenseScreen from '@features/expenses/screens/EditExpense';
import EditPotScreen     from '@features/categories/screens/EditPot';
import EditSubScreen     from '@features/subs/screens/EditSub';
import SubCalendarScreen from '@features/subs/screens/SubCalendar';
import ManageTagsScreen  from '@features/tags/screens/ManageTags';
import EMIScreen         from '@features/emi/screens/EMI';
import EditEMIScreen     from '@features/emi/screens/EditEMI';
import VehiclesScreen      from '@features/fuel/screens/Vehicles';
import VehicleDetailScreen from '@features/fuel/screens/VehicleDetail';
import EditVehicleScreen   from '@features/fuel/screens/EditVehicle';
import EditFillupScreen    from '@features/fuel/screens/EditFillup';
import PantryScreen        from '@features/pantry/screens/Pantry';
import EditPantryItemScreen from '@features/pantry/screens/EditPantryItem';
import EditGoalScreen    from '@features/goals/screens/EditGoal';
import EditAccountScreen from '@features/accounts/screens/EditAccount';
import EditTripScreen    from '@features/travel/screens/EditTrip';

// 6.12 + 6.13 + 6.15 + 6.16 + 6.17 + 6.18 + 6.19 — new analytics screens.
import AnalyticsHubScreen     from '@features/analytics/screens/Hub';
import InflationIndexScreen   from '@features/trends/screens/InflationIndex';
import LifestyleInflationScreen from '@features/trends/screens/LifestyleInflation';
import ForecastScreen         from '@features/trends/screens/Forecast';
import CalendarScreen         from '@features/trends/screens/Calendar';
import VarianceScreen         from '@features/trends/screens/Variance';
import ReorderQueueScreen     from '@features/items/screens/ReorderQueue';

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
const SpendCalendar  = withBoundary('SpendCalendar',  SpendCalendarScreen);
const Items       = withBoundary('Items',       ItemsScreen);
const ItemTrend   = withBoundary('ItemTrend',   ItemTrendScreen);
const EditExpense = withBoundary('EditExpense', EditExpenseScreen);
const EditPot     = withBoundary('EditPot',     EditPotScreen);
const EditSub     = withBoundary('EditSub',     EditSubScreen);
const SubCalendar = withBoundary('SubCalendar', SubCalendarScreen);
const ManageTags  = withBoundary('ManageTags',  ManageTagsScreen);
const EMI         = withBoundary('EMI',         EMIScreen);
const EditEMI     = withBoundary('EditEMI',     EditEMIScreen);
const Vehicles      = withBoundary('Vehicles',      VehiclesScreen);
const VehicleDetail = withBoundary('VehicleDetail', VehicleDetailScreen);
const EditVehicle   = withBoundary('EditVehicle',   EditVehicleScreen);
const EditFillup    = withBoundary('EditFillup',    EditFillupScreen);
const Pantry         = withBoundary('Pantry',         PantryScreen);
const EditPantryItem = withBoundary('EditPantryItem', EditPantryItemScreen);
const EditGoal    = withBoundary('EditGoal',    EditGoalScreen);
const EditAccount = withBoundary('EditAccount', EditAccountScreen);
const EditTrip    = withBoundary('EditTrip',    EditTripScreen);
const AnalyticsHub      = withBoundary('AnalyticsHub',      AnalyticsHubScreen);
const InflationIndex    = withBoundary('InflationIndex',    InflationIndexScreen);
const LifestyleInflation= withBoundary('LifestyleInflation',LifestyleInflationScreen);
const Forecast          = withBoundary('Forecast',          ForecastScreen);
const Calendar          = withBoundary('Calendar',          CalendarScreen);
const Variance          = withBoundary('Variance',          VarianceScreen);
const ReorderQueue      = withBoundary('ReorderQueue',      ReorderQueueScreen);

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const renderTabBar = (props) => <CustomTabBar {...props}/>;

// 6.21 — tab bar reshape. Was Home / Scan / [+] / Trends / Subs.
// Now Home / Capture (= Scan) / [+] / Analytics (= AnalyticsHub) / You (= Profile).
// Trends + Subs remain stack routes — reachable from the Analytics Hub's
// Reports section + the Home shortcuts. Scan keeps its component but its
// display label flips to "Capture" via the tab icon map in CustomTabBar.
function Tabs() {
  return (
    <Tab.Navigator
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"      component={Home}/>
      <Tab.Screen name="Capture"   component={Scan}/>
      <Tab.Screen name="Analytics" component={AnalyticsHub}/>
      <Tab.Screen name="You"       component={Profile}/>
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

        {/* 6.21 — Trends + Subs remain stack-routable for direct nav from
            Home or the Analytics Hub's Reports rows, even though neither
            is a tab anymore. */}
        <Stack.Screen name="Trends"      component={Trends}      options={{ title: 'Trends' }}/>
        <Stack.Screen name="Subs"        component={Subs}        options={{ title: 'Subscriptions' }}/>

        {/* Phase 3 UI batch new screens */}
        <Stack.Screen name="InflationIndex"     component={InflationIndex}
          options={{ title: 'Personal inflation' }}/>
        <Stack.Screen name="LifestyleInflation" component={LifestyleInflation}
          options={{ title: 'Lifestyle drift' }}/>
        <Stack.Screen name="Forecast"           component={Forecast}
          options={{ title: 'Forecast' }}/>
        <Stack.Screen name="Calendar"           component={Calendar}
          options={{ title: 'Spending calendar' }}/>
        <Stack.Screen name="Variance"           component={Variance}
          options={{ title: 'Category variance' }}/>
        <Stack.Screen name="ReorderQueue"       component={ReorderQueue}
          options={{ title: 'Reorder queue' }}/>

        {/* 7.2 — Subscription calendar: month grid + per-day callout. */}
        <Stack.Screen name="SubCalendar"        component={SubCalendar}
          options={{ title: 'Subscription calendar' }}/>

        {/* 7.3 — Manage tags: rename + merge + soft-delete. */}
        <Stack.Screen name="ManageTags"         component={ManageTags}
          options={{ title: 'Manage tags' }}/>

        {/* 7.4 — Spending calendar: per-day month grid with tap-day callout.
            Distinct from `Calendar` (6.18 heatmaps) and `SubCalendar` (7.2). */}
        <Stack.Screen name="SpendCalendar"      component={SpendCalendar}
          options={{ title: 'Spending calendar' }}/>

        {/* 7.5 — EMI tracking: list + create/edit + amortization preview. */}
        <Stack.Screen name="EMI"                component={EMI}
          options={{ title: 'EMIs & loans' }}/>
        <Stack.Screen name="EditEMI"            component={EditEMI}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit EMI' : 'Add EMI' })}/>

        {/* 7.6 — Fuel & vehicle tracking. */}
        <Stack.Screen name="Vehicles"           component={Vehicles}
          options={{ title: 'Vehicles & fuel' }}/>
        <Stack.Screen name="VehicleDetail"      component={VehicleDetail}
          options={{ title: 'Vehicle' }}/>
        <Stack.Screen name="EditVehicle"        component={EditVehicle}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit vehicle' : 'Add vehicle' })}/>
        <Stack.Screen name="EditFillup"         component={EditFillup}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit fill-up' : 'Log fill-up' })}/>

        {/* 7.7 — Pantry inventory: list + create/edit + low-stock shopping. */}
        <Stack.Screen name="Pantry"             component={Pantry}
          options={{ title: 'Pantry' }}/>
        <Stack.Screen name="EditPantryItem"     component={EditPantryItem}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit pantry item' : 'Add pantry item' })}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
