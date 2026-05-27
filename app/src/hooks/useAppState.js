import React, { useCallback, useMemo } from 'react';
import { resetAll } from '../db';
import { ThemeProvider, useTheme } from '@core/theme/ThemeContext';
import { RefreshBusProvider, useRefreshBus } from '@core/state/RefreshBus';
import { NotifyBusProvider } from '@core/state/NotifyBus';
import { queryCache } from '@core/state/useQuery';
import { SettingsProvider, useSettings } from '@features/profile/settings.context';
import { PrivacyProvider } from '@core/state/PrivacyContext';
import { ProfileProvider,  useProfile  } from '@features/profile/context';
import { ExpensesProvider, useExpenses } from '@features/expenses/context';
import { IncomeProvider, useIncome } from '@features/income/context';
import { CategoriesProvider, useCategories } from '@features/categories/context';
import { TagsProvider, useTags } from '@features/tags/context';
import { ItemsProvider, useItems } from '@features/items/context';
import { SubsProvider, useSubs } from '@features/subs/context';
import { EmiProvider, useEmi } from '@features/emi/context';
import { FuelProvider, useFuel } from '@features/fuel/context';
import { PantryProvider, usePantry } from '@features/pantry/context';
import { PriceAlertsProvider, usePriceAlerts } from '@features/price_alerts/context';
import { PeopleProvider, usePeople } from '@features/splits/context';
import { UtilitiesProvider, useUtilities } from '@features/utilities/context';
import { GoalsProvider, useGoals } from '@features/goals/context';
import { AccountsProvider, useAccounts } from '@features/accounts/context';
import { InvestmentsProvider, useInvestments } from '@features/investments/context';
import { InsuranceProvider, useInsurance } from '@features/insurance/context';
import { FastagProvider, useFastag } from '@features/fastag/context';
import { TravelProvider, useTravel } from '@features/travel/context';
import { NotificationsProvider, useNotifications } from '@features/notifications/context';

// ── ThemeProvider needs to read dark_mode from SettingsContext, so it sits
//    inside SettingsProvider but outside everything else. Tiny shim component
//    bridges the two without exposing settings to ThemeProvider's prop.
//    PS-21 — PrivacyProvider also reads settings (mask flags) so it lives
//    here, just inside SettingsProvider, before ThemeProvider so theme
//    consumers can also read privacy state if needed.
function ThemedChildren({ children }) {
  const { settings } = useSettings();
  return (
    <ThemeProvider dark={!!settings.dark_mode}>
      <PrivacyProvider>{children}</PrivacyProvider>
    </ThemeProvider>
  );
}

// ── Gates render until every feature provider reports ready. Mirrors the
//    legacy `if (!ready) return null;` behaviour of the old AppProvider so
//    no screen ever sees a half-loaded value.
function ReadyGate({ children }) {
  const flags = [
    useSettings().ready,
    useProfile().ready,
    useExpenses().ready,
    useIncome().ready,
    useCategories().ready,
    useItems().ready,
    useSubs().ready,
    useGoals().ready,
    useAccounts().ready,
    useInvestments().ready,
    useInsurance().ready,
    useFastag().ready,
    useTravel().ready,
    useNotifications().ready,
    useTags().ready,
    useEmi().ready,
    useFuel().ready,
    usePantry().ready,
    usePriceAlerts().ready,
    usePeople().ready,
    useUtilities().ready,
  ];
  if (!flags.every(Boolean)) return null;
  return children;
}

// ── Root composer. Provider order matters:
//    SettingsProvider           → owns dark_mode (ThemedChildren reads it)
//    ThemedChildren             → ThemeProvider, supplies F + dark
//    ProfileProvider            → uses bus.refreshAll on create/update
//    ExpensesProvider           → owns refreshSummary, consumed by Categories
//    CategoriesProvider         → reads useExpenses().refreshSummary
//    Items / Subs / Goals / Accounts / Travel → independent slices
//    ReadyGate                  → blocks render until every ready=true
export function AppRoot({ children }) {
  return (
    <RefreshBusProvider>
     <NotifyBusProvider>
      <SettingsProvider>
        <ThemedChildren>
          <ProfileProvider>
            <ExpensesProvider>
              <IncomeProvider>
                <CategoriesProvider>
                 <TagsProvider>
                  <ItemsProvider>
                    <SubsProvider>
                     <EmiProvider>
                      <FuelProvider>
                      <PantryProvider>
                      <PriceAlertsProvider>
                      <PeopleProvider>
                      <UtilitiesProvider>
                      <GoalsProvider>
                        <AccountsProvider>
                          <InvestmentsProvider>
                            <InsuranceProvider>
                              <FastagProvider>
                                <TravelProvider>
                                  <NotificationsProvider>
                                    <ReadyGate>{children}</ReadyGate>
                                  </NotificationsProvider>
                                </TravelProvider>
                              </FastagProvider>
                            </InsuranceProvider>
                          </InvestmentsProvider>
                        </AccountsProvider>
                      </GoalsProvider>
                      </UtilitiesProvider>
                      </PeopleProvider>
                      </PriceAlertsProvider>
                      </PantryProvider>
                      </FuelProvider>
                     </EmiProvider>
                    </SubsProvider>
                  </ItemsProvider>
                 </TagsProvider>
                </CategoriesProvider>
              </IncomeProvider>
            </ExpensesProvider>
          </ProfileProvider>
        </ThemedChildren>
      </SettingsProvider>
     </NotifyBusProvider>
    </RefreshBusProvider>
  );
}

// Legacy export name kept so App.js's `import { AppProvider } from ...` works.
// Drop once App.js migrates to AppRoot.
export const AppProvider = AppRoot;

// ── Deprecated aggregator hook. Returns a merged object matching the pre-2.9
//    useApp() contract (minus the `repos` key, dropped in 2.10) so existing
//    screens keep working unchanged. New code should call useExpenses() /
//    useCategories() / useItemActions() etc. directly to avoid subscribing
//    to every slice.
export function useApp() {
  const { settings, sym, setSetting } = useSettings();
  const { F } = useTheme();
  const { profile, onboarded, createProfile, updateProfile } = useProfile();
  const { categories, addCategory, updateCategory, removeCategory, restoreCategory } = useCategories();
  const { expenses, pots, totalSpend, monthBudget,
          activeMonth, setActiveMonth, resetActiveMonth,
          addExpense, updateExpense, removeExpense, restoreExpense,
          addExpenseWithItems, updateExpenseWithItems } = useExpenses();
  const { income, totalIncome, addIncome, updateIncome, removeIncome } = useIncome();
  const { subs, addSub, updateSub, cancelSub, reinstateSub, removeSub, restoreSub } = useSubs();
  const { goals, addGoal, updateGoal, contributeGoal, removeGoal, restoreGoal } = useGoals();
  const { accounts, addAccount, updateAccount, removeAccount, restoreAccount } = useAccounts();
  const { trips, addTrip, updateTrip, removeTrip, restoreTrip } = useTravel();
  const bus = useRefreshBus();

  const resetApp = useCallback(async () => {
    await resetAll();
    queryCache.clearForReset();
    await bus.refreshAll();
  }, [bus]);

  const refresh = useCallback(async () => {
    await bus.refreshAll();
  }, [bus]);

  return useMemo(() => ({
    ready: true,
    profile, onboarded, settings,
    categories,
    pots, expenses, income, subs, goals, accounts, trips,
    totalSpend, monthBudget, totalIncome,
    activeMonth, setActiveMonth, resetActiveMonth,
    F, sym,
    createProfile, updateProfile,
    setSetting,
    addCategory, updateCategory, removeCategory, restoreCategory,
    addExpense, updateExpense, removeExpense, restoreExpense, addExpenseWithItems, updateExpenseWithItems,
    addIncome, updateIncome, removeIncome,
    addSub, updateSub, cancelSub, reinstateSub, removeSub, restoreSub,
    addGoal, updateGoal, contributeGoal, removeGoal, restoreGoal,
    addAccount, updateAccount, removeAccount, restoreAccount,
    addTrip, updateTrip, removeTrip, restoreTrip,
    resetApp, refresh,
  }), [
    settings, sym, setSetting, F,
    profile, onboarded, createProfile, updateProfile,
    categories, addCategory, updateCategory, removeCategory, restoreCategory,
    expenses, pots, totalSpend, monthBudget,
    income, totalIncome,
    activeMonth, setActiveMonth, resetActiveMonth,
    addExpense, updateExpense, removeExpense, restoreExpense, addExpenseWithItems, updateExpenseWithItems,
    addIncome, updateIncome, removeIncome,
    subs, addSub, updateSub, cancelSub, reinstateSub, removeSub, restoreSub,
    goals, addGoal, updateGoal, contributeGoal, removeGoal, restoreGoal,
    accounts, addAccount, updateAccount, removeAccount, restoreAccount,
    trips, addTrip, updateTrip, removeTrip, restoreTrip,
    resetApp, refresh,
  ]);
}
