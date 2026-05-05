// Polaris web components (`<s-banner>`, `<s-button>`, `<s-box>`, `<s-stack>`, …)
// are HTMLElement-based custom elements. This module augments React's JSX
// namespace with a wildcard so any `s-*` element type-checks as a generic HTML
// element. Consumers that already declare the same wildcard see harmless
// declaration merging.

import type { DetailedHTMLProps, HTMLAttributes, ReactNode } from "react";

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
