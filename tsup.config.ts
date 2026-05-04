import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "js/index.ts",
    types: "js/types.d.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  external: ["react", "@inertiajs/react", "@shopify/app-bridge-react"],
});
