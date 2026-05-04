import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { errorHandlers, reloadSpy, toastShow, toastHide, cleanupSpy } = vi.hoisted(() => ({
	errorHandlers: new Set<(error: unknown) => void>(),
	reloadSpy: vi.fn(),
	toastShow: vi.fn(() => "toast-1"),
	toastHide: vi.fn(),
	cleanupSpy: vi.fn(),
}));

vi.mock("@inertiajs/react", () => {
	return {
		http: {
			onError: (handler: (error: unknown) => void) => {
				errorHandlers.add(handler);
				return () => {
					errorHandlers.delete(handler);
					cleanupSpy();
				};
			},
		},
		router: {
			reload: reloadSpy,
		},
	};
});

vi.mock("@shopify/app-bridge-react", () => ({
	useAppBridge: () => ({ toast: { show: toastShow, hide: toastHide } }),
}));

import { HttpCancelledError, HttpNetworkError, HttpResponseError } from "@inertiajs/core";
import { NoticesProvider } from "../../js/components/NoticesProvider";
import { useNotices } from "../../js/hooks/useNotices";
import {
	type FallbackMessages,
	HttpErrorInterceptor,
} from "../../js/http/HttpErrorInterceptor";

beforeEach(() => {
	errorHandlers.clear();
	reloadSpy.mockClear();
	toastShow.mockClear();
	toastShow.mockImplementation(() => "toast-1");
	toastHide.mockClear();
	cleanupSpy.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

function makeResponseError(status: number, body: unknown): HttpResponseError {
	const data = typeof body === "string" ? body : JSON.stringify(body);
	return new HttpResponseError("HTTP error", { status, data, headers: {} }, "/x");
}

function fireError(error: unknown): void {
	act(() => {
		for (const handler of Array.from(errorHandlers)) {
			handler(error);
		}
	});
}

interface HarnessProps {
	fallbackMessages?: FallbackMessages;
}

function Harness({ fallbackMessages }: HarnessProps = {}) {
	const { items } = useNotices();
	return (
		<>
			<div data-testid="count">{items.length}</div>
			<div data-testid="last-heading">{items[items.length - 1]?.heading ?? ""}</div>
			<div data-testid="last-tone">{items[items.length - 1]?.tone ?? ""}</div>
			<div data-testid="last-dismissible">
				{items[items.length - 1]?.dismissible === false ? "false" : "true"}
			</div>
			{fallbackMessages !== undefined ? (
				<HttpErrorInterceptor fallbackMessages={fallbackMessages} />
			) : (
				<HttpErrorInterceptor />
			)}
		</>
	);
}

describe("<HttpErrorInterceptor />", () => {
	it("subscribes on mount, unsubscribes on unmount", () => {
		const { unmount } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		expect(errorHandlers.size).toBe(1);

		unmount();
		expect(errorHandlers.size).toBe(0);
		expect(cleanupSpy).toHaveBeenCalledTimes(1);
	});

	it("HttpCancelledError is silently ignored", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(new HttpCancelledError());

		expect(screen.getByTestId("count").textContent).toBe("0");
		expect(toastShow).not.toHaveBeenCalled();
		expect(reloadSpy).not.toHaveBeenCalled();
	});

	it("422 response is silently ignored (Inertia owns form errors)", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(422, { errors: { name: ["required"] } }));

		expect(screen.getByTestId("count").textContent).toBe("0");
		expect(toastShow).not.toHaveBeenCalled();
	});

	it("500 with envelope routes the banner into context with a client-assigned id", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(
			makeResponseError(500, {
				banner: {
					heading: "Boom",
					tone: "critical",
					description: "Server exploded.",
				},
			}),
		);

		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.getByTestId("last-heading").textContent).toBe("Boom");
		expect(screen.getByTestId("last-tone").textContent).toBe("critical");
	});

	it("500 without an envelope falls back to the generic 'unexpected' banner", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(500, "<html>not json</html>"));

		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.getByTestId("last-heading").textContent).toBe("Something went wrong");
		expect(screen.getByTestId("last-tone").textContent).toBe("critical");
	});

	it("403 falls back to the 'forbidden' banner", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(403, ""));

		expect(screen.getByTestId("last-heading").textContent).toContain("permission");
		expect(screen.getByTestId("last-tone").textContent).toBe("critical");
	});

	it("429 falls back to the 'rateLimited' banner with warning tone", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(429, ""));

		expect(screen.getByTestId("last-heading").textContent).toBe("Too many requests");
		expect(screen.getByTestId("last-tone").textContent).toBe("warning");
	});

	it("413 falls back to the 'fileTooLarge' banner with warning tone", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(413, ""));

		expect(screen.getByTestId("last-heading").textContent).toBe("File too large");
		expect(screen.getByTestId("last-tone").textContent).toBe("warning");
	});

	it("401 surfaces a non-dismissable critical banner and triggers router.reload()", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(401, ""));

		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.getByTestId("last-tone").textContent).toBe("critical");
		expect(screen.getByTestId("last-dismissible").textContent).toBe("false");
		expect(reloadSpy).toHaveBeenCalledTimes(1);
	});

	it("419 surfaces the same session-expired banner + router.reload()", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(419, ""));

		expect(reloadSpy).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("last-dismissible").textContent).toBe("false");
	});

	it("HttpNetworkError calls the toast bridge once with isError and adds no banner", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(new HttpNetworkError("offline", "/x"));

		expect(screen.getByTestId("count").textContent).toBe("0");
		expect(toastShow).toHaveBeenCalledTimes(1);
		const [message, opts] = toastShow.mock.calls[0] ?? [];
		expect(typeof message).toBe("string");
		expect(opts).toMatchObject({ isError: true });
	});

	it("custom fallbackMessages override the package defaults", () => {
		render(
			<NoticesProvider>
				<Harness
					fallbackMessages={{
						unexpected: { heading: "Oups", description: "Riprova." },
						networkError: "Rete non disponibile.",
					}}
				/>
			</NoticesProvider>,
		);

		fireError(makeResponseError(500, ""));
		expect(screen.getByTestId("last-heading").textContent).toBe("Oups");

		fireError(new HttpNetworkError("offline", "/x"));
		const [message] = toastShow.mock.calls[0] ?? [];
		expect(message).toBe("Rete non disponibile.");
	});
});
