import { Show, createSignal } from "solid-js";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
	buttonVariants,
} from "@basaltac/ui";

type ConfirmRequest = {
	title: string;
	description?: string;
	confirmLabel: string;
	resolve: (ok: boolean) => void;
};

const [pending, setPending] = createSignal<ConfirmRequest | null>(null);

let hostMounted = false;

/**
 * In-app replacement for `window.confirm`, which is a silent no-op in the
 * Tauri desktop webview. Resolves true only when the confirm button is
 * pressed; Cancel, Escape and overlay dismiss resolve false. Requires a
 * <ConfirmHost /> mounted in the layout (Layout + PortalLayout have one).
 */
export function appConfirm(opts: {
	title: string;
	description?: string;
	confirmLabel?: string;
}): Promise<boolean> {
	return new Promise((resolve) => {
		const prev = pending();
		if (prev) prev.resolve(false); // one ask at a time: an earlier one loses
		if (!hostMounted) {
			console.warn("appConfirm: no <ConfirmHost /> mounted; resolving false");
			return resolve(false);
		}
		setPending({
			title: opts.title,
			description: opts.description,
			confirmLabel: opts.confirmLabel ?? "Confirm",
			resolve,
		});
	});
}

/** Mount once per layout (next to <Toaster />) so appConfirm() has a dialog. */
export function ConfirmHost() {
	hostMounted = true;
	const settle = (ok: boolean) => {
		const p = pending();
		setPending(null);
		p?.resolve(ok);
	};
	return (
		<Show when={pending()}>
			{(p) => (
				<AlertDialog
					open
					onOpenChange={(o: boolean) => {
						if (!o) settle(false);
					}}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{p().title}</AlertDialogTitle>
							<Show when={p().description}>
								<AlertDialogDescription>{p().description}</AlertDialogDescription>
							</Show>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<Button variant="outline" onClick={() => settle(false)}>
								Cancel
							</Button>
							<AlertDialogAction
								class={buttonVariants({ variant: "destructive" })}
								onClick={() => settle(true)}
							>
								{p().confirmLabel}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</Show>
	);
}
