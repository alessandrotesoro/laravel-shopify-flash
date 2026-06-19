import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	errorHandlers,
	responseHandlers,
	reloadSpy,
	toastShow,
	toastHide,
	cleanupSpy,
	finishHandlers,
} = vi.hoisted(() => ({
	errorHandlers: new Set<(error: unknown) => void>(),
	responseHandlers: new Set<(response: unknown) => unknown>(),
	finishHandlers: new Set<() => void>(),
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
			onResponse: (handler: (response: unknown) => unknown) => {
				responseHandlers.add(handler);
				return () => {
					responseHandlers.delete(handler);
					cleanupSpy();
				};
			},
		},
		router: {
			reload: reloadSpy,
			on: (event: string, callback: () => void) => {
				if (event !== "finish") {
					return () => {};
				}
				finishHandlers.add(callback);
				return () => {
					finishHandlers.delete(callback);
				};
			},
		},
	};
});

vi.mock("@shopify/app-bridge-react", () => {
	const handle = { toast: { show: toastShow, hide: toastHide } };
	return { useAppBridge: () => handle };
});

import { HttpCancelledError, HttpNetworkError, HttpResponseError } from "@inertiajs/core";
import { NoticesProvider } from "../../js/components/NoticesProvider";
import { useNotices } from "../../js/hooks/useNotices";
import {
	__resetSessionReloadGuard,
	DEFAULT_MESSAGES,
	FALLBACK_BY_STATUS,
	type FallbackMessages,
	FlashHttpInterceptor,
} from "../../js/http/FlashHttpInterceptor";

let originalRAF: typeof globalThis.requestAnimationFrame;

beforeEach(() => {
	errorHandlers.clear();
	responseHandlers.clear();
	finishHandlers.clear();
	reloadSpy.mockClear();
	toastShow.mockClear();
	toastShow.mockImplementation(() => "toast-1");
	toastHide.mockClear();
	cleanupSpy.mockClear();
	__resetSessionReloadGuard();
	// rAF: synchronous fake so deferred reload runs in-test without waiting.
	originalRAF = globalThis.requestAnimationFrame;
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
		cb(0);
		return 0;
	}) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
	globalThis.requestAnimationFrame = originalRAF;
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

function fireResponse(body: unknown, status = 200): unknown {
	const data = typeof body === "string" ? body : JSON.stringify(body);
	let result: unknown;
	act(() => {
		for (const handler of Array.from(responseHandlers)) {
			result = handler({ status, data, headers: {} });
		}
	});
	return result;
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
			<div data-testid="last-actions">{items[items.length - 1]?.actions?.length ?? 0}</div>
			{fallbackMessages !== undefined ? (
				<FlashHttpInterceptor fallbackMessages={fallbackMessages} />
			) : (
				<FlashHttpInterceptor />
			)}
		</>
	);
}

describe("<FlashHttpInterceptor /> — success path", () => {
	it("subscribes to both onResponse and onError on mount, unsubscribes on unmount", () => {
		const { unmount } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		expect(errorHandlers.size).toBe(1);
		expect(responseHandlers.size).toBe(1);

		unmount();
		expect(errorHandlers.size).toBe(0);
		expect(responseHandlers.size).toBe(0);
		expect(cleanupSpy).toHaveBeenCalledTimes(2);
	});

	it("success response carrying notice.toast shows the toast and adds no banner", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({ notice: { toast: { message: "File deleted" } } });

		expect(toastShow).toHaveBeenCalledTimes(1);
		expect(toastShow.mock.calls[0]?.[0]).toBe("File deleted");
		expect(screen.getByTestId("count").textContent).toBe("0");
	});

	it("success response carrying notice.banner adds the banner and shows no toast", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({
			notice: { banner: { heading: "Synced", tone: "success", description: "All good." } },
		});

		expect(toastShow).not.toHaveBeenCalled();
		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.getByTestId("last-heading").textContent).toBe("Synced");
		expect(screen.getByTestId("last-tone").textContent).toBe("success");
	});

	it("success response carrying both dispatches each exactly once", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({
			notice: {
				toast: { message: "Product created" },
				banner: { heading: "Heads up", tone: "info" },
			},
		});

		expect(toastShow).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("count").textContent).toBe("1");
	});

	it("toast isError flag is forwarded to the bridge", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({ notice: { toast: { message: "Nope", isError: true } } });

		expect(toastShow.mock.calls[0]?.[1]).toMatchObject({ isError: true });
	});

	it("success response with no notice does nothing and passes the response through", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		const passed = fireResponse({ productId: 42 });

		expect(toastShow).not.toHaveBeenCalled();
		expect(screen.getByTestId("count").textContent).toBe("0");
		expect(passed).toMatchObject({ status: 200 });
	});

	it("success response with non-JSON body is ignored without throwing", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		expect(() => fireResponse("<html>not json</html>")).not.toThrow();
		expect(toastShow).not.toHaveBeenCalled();
		expect(screen.getByTestId("count").textContent).toBe("0");
	});

	it("success response with an empty-message toast is ignored", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({ notice: { toast: { message: "   " } } });

		expect(toastShow).not.toHaveBeenCalled();
	});

	it("toast duration is forwarded to the bridge", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({ notice: { toast: { message: "Done", duration: 3000 } } });

		expect(toastShow.mock.calls[0]?.[1]).toMatchObject({ duration: 3000 });
	});

	it("a non-finite toast duration is dropped", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({ notice: { toast: { message: "Done", duration: Number.NaN } } });

		expect(toastShow.mock.calls[0]?.[1]).not.toHaveProperty("duration");
	});

	it("handles a response body delivered as a pre-parsed object (not a string)", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		let passed: unknown;
		act(() => {
			for (const handler of Array.from(responseHandlers)) {
				passed = handler({
					status: 200,
					data: { notice: { toast: { message: "Object body" } } },
					headers: {},
				});
			}
		});

		expect(toastShow.mock.calls[0]?.[0]).toBe("Object body");
		expect(passed).toMatchObject({ status: 200 });
	});

	it("a malformed banner on success (invalid tone) is dropped, no toast, no throw", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		expect(() =>
			fireResponse({ notice: { banner: { heading: "Bad", tone: "not-a-tone" } } }),
		).not.toThrow();
		expect(screen.getByTestId("count").textContent).toBe("0");
		expect(toastShow).not.toHaveBeenCalled();
	});

	it("a success banner with non-array actions is dropped without throwing (200 stays a success)", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		let passed: unknown;
		expect(() => {
			passed = fireResponse({
				notice: { banner: { heading: "X", tone: "info", actions: "oops" } },
			});
		}).not.toThrow();
		expect(screen.getByTestId("count").textContent).toBe("0");
		expect(passed).toMatchObject({ status: 200 });
	});

	it("a success banner action with a cross-origin URL is stripped; the banner still renders", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireResponse({
			notice: {
				banner: {
					heading: "Saved",
					tone: "success",
					actions: [{ label: "Go", url: "https://evil.example/steal" }],
				},
			},
		});

		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.getByTestId("last-actions").textContent).toBe("0");
	});

	it("a success banner action with a non-string URL is dropped without throwing", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		expect(() =>
			fireResponse({
				notice: {
					banner: {
						heading: "X",
						tone: "info",
						actions: [{ label: "Bad", url: 123 }],
					},
				},
			}),
		).not.toThrow();
		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.getByTestId("last-actions").textContent).toBe("0");
	});
});

describe("<FlashHttpInterceptor /> — error path (preserved)", () => {
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
				notice: { banner: { heading: "Boom", tone: "critical", description: "Server exploded." } },
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

	it.each(
		Object.entries(FALLBACK_BY_STATUS).map(
			([rawStatus, entry]) => [Number(rawStatus), entry.messageKey, entry] as const,
		),
	)("status %i routes to the '%s' fallback banner", (status, _messageKey, entry) => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(status, ""));

		expect(screen.getByTestId("last-heading").textContent).toBe(
			DEFAULT_MESSAGES[entry.messageKey].heading,
		);
		expect(screen.getByTestId("last-tone").textContent).toBe(entry.tone);
		expect(screen.getByTestId("last-dismissible").textContent).toBe(
			entry.dismissible ? "true" : "false",
		);
	});

	it.each([408, 502, 504])(
		"status %i without a special case falls through to the 'unexpected' critical banner",
		(status) => {
			render(
				<NoticesProvider>
					<Harness />
				</NoticesProvider>,
			);

			fireError(makeResponseError(status, ""));

			expect(screen.getByTestId("last-heading").textContent).toBe(
				DEFAULT_MESSAGES.unexpected.heading,
			);
			expect(screen.getByTestId("last-tone").textContent).toBe("critical");
		},
	);

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

	it("concurrent 401s only fire one reload and one banner (stable id dedupe)", () => {
		render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);

		fireError(makeResponseError(401, ""));
		fireError(makeResponseError(401, ""));
		fireError(makeResponseError(401, ""));

		// Single banner because of the stable id; single reload because of the
		// in-flight reload guard.
		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(reloadSpy).toHaveBeenCalledTimes(1);

		// After router fires `finish`, the reload guard resets and a new 401
		// can trigger another reload.
		for (const handler of Array.from(finishHandlers)) {
			handler();
		}
		fireError(makeResponseError(401, ""));
		expect(reloadSpy).toHaveBeenCalledTimes(2);
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
