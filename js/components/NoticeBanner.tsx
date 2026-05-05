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
// JSX namespace augmentation lives in `js/jsx-polaris.d.ts` so this file (and
// every other consumer) just gets the `s-*` intrinsic-element typing for free.

import { router } from "@inertiajs/react";
import { useEffect, useRef, useState } from "react";
import type { Notice } from "../hooks/useNotices";
import type { BannerAction } from "../types";
import { useNoticesContext } from "./NoticesProvider";

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
			{notice.actions?.map((action, index) => (
				<NoticeBannerAction key={`${notice.id}-action-${index}`} action={action} />
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

	const onClick = action.onClick;
	return <NoticeBannerInlineAction label={action.label} onClick={onClick} />;
}

interface NoticeBannerInlineActionProps {
	label: string;
	onClick: () => void | Promise<void>;
}

function NoticeBannerInlineAction({ label, onClick }: NoticeBannerInlineActionProps) {
	// Guard against double-clicks while the previous invocation is in flight,
	// and capture rejections so they don't escape into the global unhandled
	// rejection stream.
	const isExecutingRef = useRef(false);

	const handleClick = (): void => {
		if (isExecutingRef.current) {
			return;
		}
		isExecutingRef.current = true;
		let result: void | Promise<void>;
		try {
			result = onClick();
		} catch (error) {
			isExecutingRef.current = false;
			console.error("[shopify-flash] Banner action onClick threw:", error);
			return;
		}
		if (result && typeof (result as Promise<void>).then === "function") {
			(result as Promise<void>).then(
				() => {
					isExecutingRef.current = false;
				},
				(error) => {
					isExecutingRef.current = false;
					console.error("[shopify-flash] Banner action onClick rejected:", error);
				},
			);
			return;
		}
		isExecutingRef.current = false;
	};

	return (
		<s-button slot="secondary-actions" variant="secondary" onClick={handleClick}>
			{label}
		</s-button>
	);
}
