import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest config has `globals: false`, so RTL's auto-cleanup hook is not
// installed automatically. Wire it up manually so each test starts with an
// empty document.
afterEach(() => {
	cleanup();
});
