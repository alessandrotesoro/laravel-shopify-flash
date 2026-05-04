// Renders a single banner notice via Polaris's `<s-banner>` web component.
//
// Dismissal lifecycle (controlled-component pattern):
//
//   1. User clicks the dismiss icon → `<s-banner>` fires the `dismiss` event.
//   2. We flip local `hidden` state to true → React updates the `hidden`
//      attribute on the underlying element → the banner starts its exit
//      animation.
//   3. When the animation finishes, `<s-banner>` fires `afterhide`.
//   4. We call `remove(notice.id)` on `afterhide`, removing the entry from
//      the notices array.
//
// Removing on `dismiss` directly would cut off the exit animation, so the
// `afterhide`-driven removal is the contract.
//
// `<s-banner>` and `<s-button>` are Polaris web components, not React. The
// JSX namespace augmentation below teaches TypeScript about `s-*` intrinsic
// elements so the file type-checks without per-call casts.

import { router } from "@inertiajs/react";
import {
	type DetailedHTMLProps,
	type HTMLAttributes,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import type { Notice } from "../hooks/useNotices";
import type { BannerAction } from "../types";
import { useNoticesContext } from "./NoticesProvider";

// Polaris web components (`<s-banner>`, `<s-button>`) are HTMLElement-based
// custom elements. We augment React's JSX namespace with a wildcard so any
// `s-*` element type-checks as a generic HTML element. Consumers that already
// declare the same wildcard see harmless declaration merging.
type PolarisWebComponent = Omit<
	DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>,
	"onChange"
> &
	Record<string, unknown> & { children?: ReactNode };

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			[elemName: `s-${string}`]: PolarisWebComponent;
		}
	}
}

export interface NoticeBannerProps {
	notice: Notice;
}

/**
 * Render a single notice as a Polaris `<s-banner>`.
 *
 * The component owns the dismiss/afterhide animation lifecycle. Action
 * buttons are wired to either a URL (via `router.visit`) or an inline click
 * handler.
 */
export function NoticeBanner({ notice }: NoticeBannerProps) {
	const { remove } = useNoticesContext();
	const elementRef = useRef<HTMLElement | null>(null);
	const [hidden, setHidden] = useState(false);

	const dismissible = notice.dismissible !== false;

	// Listen for `dismiss` and `afterhide` on the underlying element via ref +
	// addEventListener. Custom-event names from web components are not part of
	// React's synthetic event map, and React 19's `on*` prop forwarding to
	// custom elements relies on the element exposing a same-named property —
	// which Polaris does at runtime, but tests and SSR do not. The ref-based
	// wiring works the same in every environment.
	useEffect(() => {
		const element = elementRef.current;
		if (!element) {
			return;
		}
		const handleAfterhide = (): void => {
			remove(notice.id);
		};
		const handleDismiss = (): void => {
			// Trigger the exit animation. `afterhide` will remove the entry
			// from context once the animation completes.
			setHidden(true);
		};
		element.addEventListener("afterhide", handleAfterhide);
		if (dismissible) {
			element.addEventListener("dismiss", handleDismiss);
		}
		return () => {
			element.removeEventListener("afterhide", handleAfterhide);
			if (dismissible) {
				element.removeEventListener("dismiss", handleDismiss);
			}
		};
	}, [notice.id, remove, dismissible]);

	return (
		<s-banner
			ref={elementRef}
			heading={notice.heading}
			tone={notice.tone}
			{...(dismissible ? { dismissible: true } : {})}
			{...(hidden ? { hidden: true } : {})}
		>
			{notice.description}
			{notice.actions?.map((action) => (
				<NoticeBannerAction key={`${notice.id}-action-${action.label}`} action={action} />
			))}
		</s-banner>
	);
}

function NoticeBannerAction({ action }: { action: BannerAction }) {
	if ("url" in action) {
		const url = action.url;
		return (
			<s-button
				slot="secondary-actions"
				variant="secondary"
				onClick={() => {
					router.visit(url);
				}}
			>
				{action.label}
			</s-button>
		);
	}

	if ("onClick" in action) {
		const onClick = action.onClick;
		return (
			<s-button
				slot="secondary-actions"
				variant="secondary"
				onClick={() => {
					void onClick();
				}}
			>
				{action.label}
			</s-button>
		);
	}

	// Named-handler banner actions are reserved for future wiring (parity with
	// toasts). Render as a no-op so the structure stays visible.
	return (
		<s-button slot="secondary-actions" variant="secondary">
			{action.label}
		</s-button>
	);
}
