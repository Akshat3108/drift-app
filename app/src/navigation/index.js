import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../core/theme/ThemeContext';
import CustomTabBar from './CustomTabBar';

// PS-15 — Deep-link config. Static launcher shortcuts dispatch
//   drift://add    → Tabs > Home, then push Add as a modal
//   drift://scan   → Tabs > Capture
//   drift://search → Tabs > Home, then push Search as a modal
// The `Tabs.screens` shape is required by the bottom-tab navigator
// inside the linking config so React Navigation knows the route lives
// nested inside Tabs.
const LINKING = {
  prefixes: ['drift://'],
  config: {
    initialRouteName: 'Tabs',
    screens: {
      Tabs: {
        screens: {
          // 'drift://scan' → Capture tab (renamed in 6.21; component is still Scan).
          // Query-string parsing forwards `?image=…` to route.params.image,
          // which the Scan screen uses for the PS-16 share-target flow.
          Capture: {
            path: 'scan',
            parse: { image: (v) => v },
          },
          Home:    'home',
        },
      },
      Add:    'add',
      Search: 'search',
    },
  },
};

import HomeScreen        from '@features/home/screens/Home';
import ScanScreen        from '@features/scan/screens/Scan';
import ReviewQueueScreen from '@features/scan/screens/ReviewQueue';
import CashflowCalendarScreen from '@features/analytics/screens/CashflowCalendar';
import PendingScreen from '@features/expenses/screens/Pending';
import TrendsScreen      from '@features/trends/screens/Trends';
import SubsScreen        from '@features/subs/screens/Subs';
import AddScreen         from '@features/expenses/screens/Add';
import DetailScreen      from '@features/expenses/screens/Detail';
import PotDetailScreen   from '@features/categories/screens/PotDetail';
import BudgetSetupScreen from '@features/categories/screens/BudgetSetup';
import QuickTemplatesScreen from '@features/expenses/screens/QuickTemplates';
import GoalsScreen       from '@features/goals/screens/Goals';
import ProfileScreen     from '@features/profile/screens/Profile';
import DiagnosticsScreen from '@features/profile/screens/Diagnostics';
import ExportScreen      from '@features/profile/screens/Export';
import EditThemeScreen   from '@features/profile/screens/EditTheme';
import IncomeBreakdownScreen from '@features/income/screens/IncomeBreakdown';
import NetWorthScreen    from '@features/accounts/screens/NetWorth';
import TravelScreen      from '@features/travel/screens/Travel';
import TripDetailScreen  from '@features/travel/screens/TripDetail';
import ActivityScreen    from '@features/notifications/screens/Activity';
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
import TaxBenefitScreen  from '@features/emi/screens/TaxBenefit';
import VehiclesScreen      from '@features/fuel/screens/Vehicles';
import VehicleDetailScreen from '@features/fuel/screens/VehicleDetail';
import EditVehicleScreen   from '@features/fuel/screens/EditVehicle';
import EditFillupScreen    from '@features/fuel/screens/EditFillup';
import PantryScreen        from '@features/pantry/screens/Pantry';
import EditPantryItemScreen from '@features/pantry/screens/EditPantryItem';
import PriceAlertsScreen      from '@features/price_alerts/screens/PriceAlerts';
import EditPriceAlertScreen   from '@features/price_alerts/screens/EditPriceAlert';
import PeopleScreen           from '@features/splits/screens/People';
import EditPersonScreen       from '@features/splits/screens/EditPerson';
import BalancesScreen         from '@features/splits/screens/Balances';
import UtilitiesScreen        from '@features/utilities/screens/Utilities';
import UtilityDetailScreen    from '@features/utilities/screens/UtilityDetail';
import EditUtilityScreen      from '@features/utilities/screens/EditUtility';
import EditBillScreen         from '@features/utilities/screens/EditBill';
import CsvImportScreen        from '@features/csv_import/screens/CsvImport';
import CsvReviewScreen        from '@features/csv_import/screens/CsvReview';
import HoldingsScreen         from '@features/investments/screens/Holdings';
import EditHoldingScreen      from '@features/investments/screens/EditHolding';
import InsuranceScreen        from '@features/insurance/screens/Insurance';
import EditInsuranceScreen    from '@features/insurance/screens/EditInsurance';
import FASTagScreen           from '@features/fastag/screens/FASTag';
import EditFastagScreen       from '@features/fastag/screens/EditFastag';
import EditGoalScreen    from '@features/goals/screens/EditGoal';
import EditAccountScreen from '@features/accounts/screens/EditAccount';
import EditTripScreen    from '@features/travel/screens/EditTrip';

// 6.12 + 6.13 + 6.15 + 6.16 + 6.17 + 6.18 + 6.19 — new analytics screens.
import AnalyticsHubScreen     from '@features/analytics/screens/Hub';
import MoneyFlowScreen        from '@features/analytics/screens/MoneyFlow';
import MoodSpendScreen        from '@features/analytics/screens/MoodSpend';
import CarbonDashboardScreen  from '@features/analytics/screens/CarbonDashboard';
import HealthDetailScreen     from '@features/analytics/screens/HealthDetail';
import YearInReviewScreen     from '@features/analytics/screens/YearInReview';
import InflationIndexScreen   from '@features/trends/screens/InflationIndex';
import LifestyleInflationScreen from '@features/trends/screens/LifestyleInflation';
import ForecastScreen         from '@features/trends/screens/Forecast';
import CalendarScreen         from '@features/trends/screens/Calendar';
import VarianceScreen         from '@features/trends/screens/Variance';
import ReorderQueueScreen     from '@features/items/screens/ReorderQueue';

import { withBoundary } from '../components/ErrorBoundary';

const Home        = withBoundary('Home',        HomeScreen);
const Scan        = withBoundary('Scan',        ScanScreen);
const ReviewQueue = withBoundary('ReviewQueue', ReviewQueueScreen);
const CashflowCalendar = withBoundary('CashflowCalendar', CashflowCalendarScreen);
const Pending = withBoundary('Pending', PendingScreen);
const Trends      = withBoundary('Trends',      TrendsScreen);
const Subs        = withBoundary('Subs',        SubsScreen);
const Add         = withBoundary('Add',         AddScreen);
const Detail      = withBoundary('Detail',      DetailScreen);
const PotDetail   = withBoundary('PotDetail',   PotDetailScreen);
const BudgetSetup = withBoundary('BudgetSetup', BudgetSetupScreen);
const QuickTemplates = withBoundary('QuickTemplates', QuickTemplatesScreen);
const Goals       = withBoundary('Goals',       GoalsScreen);
const Profile     = withBoundary('Profile',     ProfileScreen);
const Diagnostics = withBoundary('Diagnostics', DiagnosticsScreen);
const Export      = withBoundary('Export',      ExportScreen);
const EditTheme   = withBoundary('EditTheme',   EditThemeScreen);
const IncomeBreakdown = withBoundary('IncomeBreakdown', IncomeBreakdownScreen);
const NetWorth    = withBoundary('NetWorth',    NetWorthScreen);
const Travel      = withBoundary('Travel',      TravelScreen);
const TripDetail  = withBoundary('TripDetail',  TripDetailScreen);
const Activity    = withBoundary('Activity',    ActivityScreen);
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
const TaxBenefit  = withBoundary('TaxBenefit',  TaxBenefitScreen);
const Vehicles      = withBoundary('Vehicles',      VehiclesScreen);
const VehicleDetail = withBoundary('VehicleDetail', VehicleDetailScreen);
const EditVehicle   = withBoundary('EditVehicle',   EditVehicleScreen);
const EditFillup    = withBoundary('EditFillup',    EditFillupScreen);
const Pantry         = withBoundary('Pantry',         PantryScreen);
const EditPantryItem = withBoundary('EditPantryItem', EditPantryItemScreen);
const PriceAlerts      = withBoundary('PriceAlerts',      PriceAlertsScreen);
const EditPriceAlert   = withBoundary('EditPriceAlert',   EditPriceAlertScreen);
const People           = withBoundary('People',           PeopleScreen);
const EditPerson       = withBoundary('EditPerson',       EditPersonScreen);
const Balances         = withBoundary('Balances',         BalancesScreen);
const Utilities        = withBoundary('Utilities',        UtilitiesScreen);
const UtilityDetail    = withBoundary('UtilityDetail',    UtilityDetailScreen);
const EditUtility      = withBoundary('EditUtility',      EditUtilityScreen);
const EditBill         = withBoundary('EditBill',         EditBillScreen);
const CsvImport        = withBoundary('CsvImport',        CsvImportScreen);
const CsvReview        = withBoundary('CsvReview',        CsvReviewScreen);
const Holdings         = withBoundary('Holdings',         HoldingsScreen);
const EditHolding      = withBoundary('EditHolding',      EditHoldingScreen);
const Insurance        = withBoundary('Insurance',        InsuranceScreen);
const EditInsurance    = withBoundary('EditInsurance',    EditInsuranceScreen);
const FASTag           = withBoundary('FASTag',           FASTagScreen);
const EditFastag       = withBoundary('EditFastag',       EditFastagScreen);
const EditGoal    = withBoundary('EditGoal',    EditGoalScreen);
const EditAccount = withBoundary('EditAccount', EditAccountScreen);
const EditTrip    = withBoundary('EditTrip',    EditTripScreen);
const AnalyticsHub      = withBoundary('AnalyticsHub',      AnalyticsHubScreen);
const MoneyFlow         = withBoundary('MoneyFlow',         MoneyFlowScreen);
const MoodSpend         = withBoundary('MoodSpend',         MoodSpendScreen);
const CarbonDashboard   = withBoundary('CarbonDashboard',   CarbonDashboardScreen);
const HealthDetail      = withBoundary('HealthDetail',      HealthDetailScreen);
const YearInReview      = withBoundary('YearInReview',      YearInReviewScreen);
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
    <NavigationContainer linking={LINKING}>
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
        <Stack.Screen name="BudgetSetup" component={BudgetSetup} options={{ title: 'Budget setup' }}/>
        <Stack.Screen name="QuickTemplates" component={QuickTemplates} options={{ title: 'Quick templates' }}/>
        <Stack.Screen name="Goals"       component={Goals}       options={{ title: 'Goals' }}/>
        <Stack.Screen name="Profile"     component={Profile}     options={{ title: 'Profile' }}/>
        <Stack.Screen name="Diagnostics" component={Diagnostics} options={{ title: 'Diagnostics' }}/>
        <Stack.Screen name="Export"      component={Export}      options={{ presentation: 'modal', headerShown: false }}/>
        {/* PS-49 — accent colour picker. */}
        <Stack.Screen name="EditTheme"   component={EditTheme}   options={{ title: 'Theme' }}/>
        {/* PS-43 — income source breakdown. */}
        <Stack.Screen name="IncomeBreakdown" component={IncomeBreakdown} options={{ title: 'Income mix' }}/>
        <Stack.Screen name="NetWorth"    component={NetWorth}    options={{ title: 'Net Worth' }}/>
        <Stack.Screen name="Travel"      component={Travel}      options={{ title: 'Travel' }}/>
        <Stack.Screen name="TripDetail"  component={TripDetail}  options={{ title: 'Trip detail' }}/>
        <Stack.Screen name="Activity"    component={Activity}    options={{ title: 'Activity' }}/>
        <Stack.Screen name="AllExpenses" component={AllExpenses} options={{ title: 'All transactions' }}/>
        <Stack.Screen name="Search"      component={Search}      options={{ presentation: 'modal', headerShown: false }}/>
        <Stack.Screen name="Merchants"   component={Merchants}   options={{ title: 'Top merchants' }}/>
        {/* PS-38 — OCR review queue. */}
        <Stack.Screen name="ReviewQueue" component={ReviewQueue} options={{ title: 'Scans to review' }}/>
        {/* PS-27 — unified forward outflow calendar. */}
        <Stack.Screen name="CashflowCalendar" component={CashflowCalendar} options={{ title: 'Upcoming outflow' }}/>
        {/* PS-30 — pending recurring-debit confirm queue. */}
        <Stack.Screen name="Pending" component={Pending} options={{ title: 'To confirm' }}/>
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
        <Stack.Screen name="MoneyFlow"          component={MoneyFlow}
          options={{ title: 'Money flow' }}/>
        <Stack.Screen name="MoodSpend"          component={MoodSpend}
          options={{ title: 'Mood × spend' }}/>
        <Stack.Screen name="CarbonDashboard"    component={CarbonDashboard}
          options={{ title: 'Carbon footprint' }}/>
        {/* PS-22 — Financial Health Score breakdown. */}
        <Stack.Screen name="HealthDetail"       component={HealthDetail}
          options={{ title: 'Financial health' }}/>
        {/* PS-24 — Year-in-Review (Oct-gated entry from Analytics Hub). */}
        <Stack.Screen name="YearInReview"       component={YearInReview}
          options={{ title: 'Year in Review' }}/>
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
        {/* PS-12 — Tax-benefit dashboard + prepayment simulator. */}
        <Stack.Screen name="TaxBenefit"         component={TaxBenefit}
          options={{ title: 'Tax benefit' }}/>

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

        {/* 7.8 — Item price alerts: list + create/edit. */}
        <Stack.Screen name="PriceAlerts"        component={PriceAlerts}
          options={{ title: 'Price alerts' }}/>
        <Stack.Screen name="EditPriceAlert"     component={EditPriceAlert}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit alert' : 'Watch price' })}/>

        {/* 7.9 — People + splits + balances. */}
        <Stack.Screen name="People"             component={People}
          options={{ title: 'People' }}/>
        <Stack.Screen name="EditPerson"         component={EditPerson}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit person' : 'Add person' })}/>
        <Stack.Screen name="Balances"           component={Balances}
          options={{ title: 'Balances' }}/>

        {/* 7.12 — Utility bill tracking. */}
        <Stack.Screen name="Utilities"          component={Utilities}
          options={{ title: 'Utilities & bills' }}/>
        <Stack.Screen name="UtilityDetail"      component={UtilityDetail}
          options={{ title: 'Utility' }}/>
        <Stack.Screen name="EditUtility"        component={EditUtility}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit utility' : 'Add utility' })}/>
        <Stack.Screen name="EditBill"           component={EditBill}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit bill' : 'Log bill' })}/>

        {/* 7.15 — CSV statement import. */}
        <Stack.Screen name="CsvImport"          component={CsvImport}
          options={{ title: 'Import CSV' }}/>
        <Stack.Screen name="CsvReview"          component={CsvReview}
          options={{ title: 'Review import' }}/>

        {/* PS-10 — Investment holdings + manual NAV tracker. */}
        <Stack.Screen name="Holdings"           component={Holdings}
          options={{ title: 'Investments' }}/>
        <Stack.Screen name="EditHolding"        component={EditHolding}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit holding' : 'Add holding' })}/>

        {/* PS-11 — Insurance policy tracker. */}
        <Stack.Screen name="Insurance"          component={Insurance}
          options={{ title: 'Insurance' }}/>
        <Stack.Screen name="EditInsurance"      component={EditInsurance}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit policy' : 'Add policy' })}/>

        {/* PS-13 — FASTag tracking. */}
        <Stack.Screen name="FASTag"             component={FASTag}
          options={{ title: 'FASTag' }}/>
        <Stack.Screen name="EditFastag"         component={EditFastag}
          options={({ route }) => ({ title: route?.params?.id ? 'Edit FASTag' : 'Add FASTag' })}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
