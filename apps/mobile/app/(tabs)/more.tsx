import { useRouter } from "expo-router";
import { useApp } from "../../lib/app";
import { Btn, Card, Screen, T } from "../../components/ui";

export default function More() {
  const router = useRouter(); const { auth, logout } = useApp();
  const items: [string, string, string][] = [["Homework", "Assignments and submissions", "/homework"], ["Class tests", "Marks shared by your teachers", "/class-tests"], ["Notices", "School noticeboard", "/notices"], ["Notifications", "Updates for you", "/notifications"], ["Profile & security", "Password, devices, biometric lock", "/profile"]];
  return (
    <Screen>
      <T color="text2">{auth?.user.displayName} · {auth?.user.username}</T>
      {items.map(([t, s, p]) => <Card key={p} onPress={() => router.push(p as never)}><T size={16} weight="600">{t}</T><T color="text2" size={13}>{s}</T></Card>)}
      <Btn title="Sign out" variant="plain" onPress={() => void logout()} />
    </Screen>
  );
}
