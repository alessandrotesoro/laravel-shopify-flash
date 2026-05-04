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
  // @inertiajs/core MUST be external alongside @inertiajs/react. The package
  // imports HttpResponseError/HttpNetworkError/HttpCancelledError from core for
  // instanceof checks — bundling them creates a second class identity, so the
  // checks return false against the consumer's errors and the handler no-ops.
  external: [
    "react",
    "@inertiajs/core",
    "@inertiajs/react",
    "@shopify/app-bridge-react",
  ],
  esbuildOptions(options) {
    // React 17+ automatic JSX transform — emits `import { jsx } from "react/jsx-runtime"`
    // instead of `React.createElement(...)`. Without this, the built output references
    // `React` globally but the source doesn't import it, throwing
    // `ReferenceError: React is not defined` at runtime.
    options.jsx = "automatic";
  },
});
