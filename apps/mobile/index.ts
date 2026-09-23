import "fast-text-encoding";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { registerRootComponent } from "expo";
import { registerGlobals } from "@livekit/react-native";
import App from "./App";

registerGlobals();
registerRootComponent(App);
