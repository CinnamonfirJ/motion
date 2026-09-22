import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { useEffect } from "react";
import { SessionProvider, useSession } from "./src/session";
import { Loading } from "./src/components/ui";
import { SignIn } from "./src/screens/SignIn";
import { Home } from "./src/screens/Home";
import { Live } from "./src/screens/Live";
import { Moments } from "./src/screens/Moments";
import { MomentDetail } from "./src/screens/MomentDetail";
import { Earnings } from "./src/screens/Earnings";
import { Profile } from "./src/screens/Profile";
import { GoLive } from "./src/screens/GoLive";
import { color, MONO } from "./src/theme";
import { PrivyProvider, type Chain } from "@privy-io/expo";
import { initializeReactionQueue } from "./src/lib/reaction-queue";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: color.night, borderTopColor: color.border, height: 62, paddingTop: 6 },
        tabBarActiveTintColor: color.lime,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: { fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
        // Square indicator (filled lime when active) — text-forward, on-brand.
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              width: 8,
              height: 8,
              backgroundColor: focused ? color.lime : "transparent",
              borderWidth: 1,
              borderColor: focused ? color.lime : color.textMuted,
            }}
          />
        ),
      }}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="MomentsTab" component={Moments} options={{ title: "Moments" }} />
      <Tab.Screen name="Earnings" component={Earnings} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: color.night, card: color.night, text: color.text, border: color.border, primary: color.lime },
};

function Root() {
  const { user, loading } = useSession();
  if (loading) return <Loading />;
  if (!user) return <SignIn />;
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: color.night }, headerTintColor: color.text, contentStyle: { backgroundColor: color.night } }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Live" component={Live} options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="GoLive" component={GoLive} options={{ title: "Go live", presentation: "modal" }} />
      <Stack.Screen name="MomentDetail" component={MomentDetail} options={{ title: "Moment" }} />
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => initializeReactionQueue(), []);
  const appId = process.env.EXPO_PUBLIC_PRIVY_APP_ID?.trim();
  const monadTestnet: Chain = {
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [process.env.EXPO_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
    blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
  };
  const content = (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <SessionProvider>
          <Root />
        </SessionProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
  return appId ? (
    <PrivyProvider
      appId={appId}
      clientId={process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID?.trim() || undefined}
      supportedChains={[monadTestnet]}
      config={{ embedded: { ethereum: { createOnLogin: "off" } } }}
    >
      {content}
    </PrivyProvider>
  ) : content;
}
