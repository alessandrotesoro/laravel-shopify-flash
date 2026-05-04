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
  esbuildOptions(options) {
    // React 17+ automatic JSX transform — emits `import { jsx } from "react/jsx-runtime"`
    // instead of `React.createElement(...)`. Without this, the built output references
    // `React` globally but the source doesn't import it, throwing
    // `ReferenceError: React is not defined` at runtime.
    options.jsx = "automatic";
  },
});
