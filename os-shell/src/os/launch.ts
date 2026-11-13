import { appById } from "@/apps/registry";
import { useUI } from "@/store/ui";

export function launch(id: string): void {
  const st = useUI.getState();
  const first = !st.windows[id];
  st.openApp(id);
  const app = appById(id);
  if (first && app?.size) st.moveApp(id, { w: app.size[0], h: app.size[1] });
  if (typeof window !== "undefined" && window.innerWidth < 1024) window.history.pushState({ app: id }, "");
}
