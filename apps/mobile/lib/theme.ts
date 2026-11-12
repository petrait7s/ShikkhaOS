import { useColorScheme } from "react-native";
const light = { bg: "#f5f5f7", surface: "#ffffff", border: "#e2e2e7", text: "#1d1d1f", text2: "#5b5b63", text3: "#8a8a93", accent: "#0a64ff", ok: "#1a7f37", okBg: "#e3f6e8", warn: "#9a6700", warnBg: "#fff4d6", bad: "#c4261d", badBg: "#fde9e7", info: "#0a50cc", infoBg: "#e7f0ff", neutral: "#eeeef1" };
const dark: typeof light = { bg: "#1c1c1e", surface: "#2a2a2d", border: "#3a3a3f", text: "#f2f2f4", text2: "#b4b4bc", text3: "#85858f", accent: "#4d94ff", ok: "#4cc56b", okBg: "#173323", warn: "#e3b341", warnBg: "#3a2f10", bad: "#ff7b72", badBg: "#40191a", info: "#8ab8ff", infoBg: "#1d2f4d", neutral: "#38383d" };
export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
