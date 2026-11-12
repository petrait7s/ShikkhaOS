import * as React from "react";
import { Switch, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as LocalAuth from "expo-local-authentication";
import { changePasswordSchema } from "@shikkhaos/validation";
import { ApiError } from "@shikkhaos/api-client";
import { useApp, useAction, useGet } from "../lib/app";
import { Badge, Btn, Card, Field, Screen, T, fmtDate } from "../components/ui";

export default function Profile() {
  const { api } = useApp(); const [cur, setCur] = React.useState(""); const [next, setNext] = React.useState(""); const [errs, setErrs] = React.useState<Record<string, string>>({}); const [ok, setOk] = React.useState(false);
  const [bio, setBio] = React.useState(false); const devices = useGet<{ id: string; platform: string; lastSeenAt: string; current: boolean }[]>("/auth/devices");
  React.useEffect(() => { void SecureStore.getItemAsync("sos.biometric").then((v) => setBio(v === "1")).catch(() => {}); }, []);
  const toggle = async (v: boolean) => { if (v && !(await LocalAuth.hasHardwareAsync() && await LocalAuth.isEnrolledAsync())) { setErrs({ bio: "No biometrics are set up on this phone." }); return; } setBio(v); await SecureStore.setItemAsync("sos.biometric", v ? "1" : "0"); };
  const change = useAction(async () => { const v = changePasswordSchema.safeParse({ currentPassword: cur, newPassword: next }); if (!v.success) { setErrs(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message]))); return; } setErrs({}); try { await api.post("/auth/change-password", { currentPassword: cur, newPassword: next }); setCur(""); setNext(""); setOk(true); } catch (e) { if (e instanceof ApiError) setErrs(Object.fromEntries(e.fieldErrors.map((f) => [f.field, f.message]))); } });
  const revoke = useAction((id: string) => api.del(`/auth/devices/${id}`), { invalidate: ["/auth"] });
  return <Screen>
    <Card><T size={16} weight="700">Change password</T>{ok ? <Badge text="Password changed. Other devices were signed out." tone="ok" /> : null}
      <Field label="Current password" value={cur} onChangeText={setCur} secureTextEntry error={errs.currentPassword} /><Field label="New password" value={next} onChangeText={setNext} secureTextEntry error={errs.newPassword} /><Btn title="Change password" onPress={() => change.mutate(undefined)} busy={change.isPending} /></Card>
    <Card><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View style={{ flex: 1 }}><T weight="600">Biometric lock</T><T color="text2" size={13}>Ask for fingerprint/face after 5 minutes in the background</T></View><Switch value={bio} onValueChange={(v) => void toggle(v)} accessibilityLabel="Biometric lock" /></View>{errs.bio ? <T color="bad" size={12}>{errs.bio}</T> : null}</Card>
    <Card><T size={16} weight="700">Signed-in devices</T>{devices.data?.map((d) => <View key={d.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}><T>{d.platform} · {fmtDate(d.lastSeenAt)}</T>{d.current ? <Badge text="This device" tone="ok" /> : <Btn title="Sign out" variant="plain" onPress={() => revoke.mutate(d.id)} />}</View>)}</Card>
  </Screen>;
}
