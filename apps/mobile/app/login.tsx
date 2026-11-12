import * as React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { ApiError } from "@shikkhaos/api-client";
import { useApp } from "../lib/app";
import { Btn, Field, T } from "../components/ui";
import { useTheme } from "../lib/theme";

export default function Login() {
  const { login } = useApp(); const t = useTheme();
  const [id, setId] = React.useState(""); const [pw, setPw] = React.useState(""); const [err, setErr] = React.useState<string>(); const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!id.trim() || !pw) { setErr("Enter your student ID and password."); return; }
    setBusy(true); setErr(undefined);
    try { await login(id.trim(), pw); }
    catch (e) { const x = e as ApiError & { code?: string }; setErr(x.code === "ACCOUNT_LOCKED" ? "Too many attempts. Try again in a few minutes." : x.status === 401 ? "Incorrect ID or password." : x.message); }
    finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center", padding: 24, gap: 16 }}>
      <View style={{ gap: 4 }}><T size={30} weight="700">ShikkhaOS</T><T color="text2">One School. One System. One Connected Community.</T></View>
      {err ? <View accessibilityRole="alert" style={{ backgroundColor: t.badBg, padding: 12, borderRadius: 10 }}><T color="bad">{err}</T></View> : null}
      <Field label="Student ID or username" value={id} onChangeText={setId} autoCapitalize="none" autoCorrect={false} textContentType="username" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry textContentType="password" onSubmitEditing={submit} />
      <Btn title="Sign in" onPress={submit} busy={busy} />
      <T size={13} color="text3">Forgot your password? Ask the school office to reset it.</T>
    </KeyboardAvoidingView>
  );
}
