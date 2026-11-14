import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/ban-ts-comment": "error",
    // Static export (output: "export") has no image optimizer; the two <img> uses are small fixed logos.
    "@next/next/no-img-element": "off" } },
];
