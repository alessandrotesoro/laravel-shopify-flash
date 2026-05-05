import { NoticeBanner } from "./NoticeBanner";
import { useNoticesContext } from "./NoticesProvider";

/**
 * Render the active notices as a stack. Returns `null` when empty.
 */
export function NoticesContainer() {
	const { items } = useNoticesContext();

	if (items.length === 0) {
		return null;
	}

	return (
		<s-box padding="base" paddingBlockEnd="none">
			<s-stack gap="base">
				{items.map((notice) => (
					<NoticeBanner key={notice.id} notice={notice} />
				))}
			</s-stack>
		</s-box>
	);
}
