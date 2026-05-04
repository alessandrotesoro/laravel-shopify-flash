import { defineConfig } from "vitest/config";

export default defineConfig({
	oxc: {
		jsx: "react",
	},
	test: {
		environment: "happy-dom",
		globals: false,
		include: ["tests/js/**/*.test.{ts,tsx}"],
		setupFiles: ["./tests/js/setup.ts"],
	},
});
