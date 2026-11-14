import { Show, createSignal, type JSX } from "solid-js";
import { toast } from "~/lib/toast";
import { Button } from "@basaltac/ui";
import { Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle, } from "@basaltac/ui";

/** Result contract for onSubmit: `error` keeps the dialog open and shows the
 *  message inline (inputs preserved); anything else is success. */
export type CreateResult = { error?: string; success?: string } & Record<string, unknown> | undefined;

/** The one creation pattern everywhere: trigger button → <Dialog> (ESC / ✕ /
 *  Cancel / backdrop close) → success toast + close, or renderSuccess(result)
 *  for one-time secrets that must be copied. Same props contract as the old
 *  native-<dialog> version; triggerClass still lands on the trigger. */
export default function CreateDialog(props: {
	label: string;
	title: string;
	submitLabel?: string;
	/** extra classes for the trigger (default primary Button) */
	triggerClass?: string;
	/** overrides result.success in the toast (for redirect-only actions) */
	successMessage?: string;
	/** live submit-button text — e.g. a busy/progress accessor */
	submitText?: () => string;
	onSubmit: (fd: FormData, form: HTMLFormElement) => Promise<CreateResult>;
	renderSuccess?: (result: NonNullable<CreateResult>) => JSX.Element;
	children?: JSX.Element;
}) {
	const [open, setOpen] = createSignal(false);
	const [error, setError] = createSignal("");
	// success payload once renderSuccess has taken over the body
	const [done, setDone] = createSignal<NonNullable<CreateResult> | null>(null);
	const [pending, setPending] = createSignal(false);

	function close() {
		setOpen(false);
		setDone(null);
		setError("");
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		if (pending()) return;
		setError("");
		setPending(true);
		let result: CreateResult;
		try {
			result = await props.onSubmit(new FormData(form), form);
		} catch (err) {
			setPending(false);
			setError(err instanceof Error ? err.message : "Something went wrong.");
			return;
		}
		setPending(false);
		if (result && result.error) {
			setError(result.error);
			return;
		}
		if (props.renderSuccess) {
			setDone(result ?? {});
			return;
		}
		toast(props.successMessage ?? result?.success ?? "Created.", "success");
		form.reset();
		close();
	}

	return (
		<Dialog
			open={open()}
			onOpenChange={(o: boolean) => {
				if (o) {
					setError("");
					setDone(null);
					setOpen(true);
				} else {
					close();
				}
			}}
		>
			<Button type="button" class={props.triggerClass ?? undefined} onClick={() => setOpen(true)}>
				{props.label}
			</Button>
			<DialogContent>
				<Show
					when={done() && props.renderSuccess ? props.renderSuccess : null}
					fallback={
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>{props.title}</DialogTitle>
							</DialogHeader>
							<div class="modal-body">
								{props.children}
								<Show when={error()}>
									<p class="login-error" style={{ margin: "12px 0 0" }}>{error()}</p>
								</Show>
							</div>
							<DialogFooter>
								<Button type="button" variant="outline" onClick={close}>Cancel</Button>
								<Button type="submit" disabled={pending()}>
									{props.submitText ? props.submitText() : pending() ? "Saving…" : props.submitLabel ?? "Create"}
								</Button>
							</DialogFooter>
						</form>
					}
				>
					{(render) => (
						<>
							<DialogHeader>
								<DialogTitle>{props.title}</DialogTitle>
							</DialogHeader>
							<div class="modal-body">{render()(done()!)}</div>
							<DialogFooter>
								<Button type="button" onClick={close}>Close</Button>
							</DialogFooter>
						</>
					)}
				</Show>
			</DialogContent>
		</Dialog>
	);
}
