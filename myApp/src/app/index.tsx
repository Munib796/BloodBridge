import { Redirect } from "expo-router";

import WelcomeScreen from "../components/WelcomeScreen";
import { useAuth } from "../context/AuthContext";

export default function Index() {
  const { state } = useAuth();

  if (state.status === "signedIn") {
    return <Redirect href={state.role === "donor" ? "/home" : "/requestor-home"} />;
  }

  return <WelcomeScreen />;
}
