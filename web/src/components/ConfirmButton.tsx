import { createSignal, type JSX } from "solid-js";
import { revalidate } from "@solidjs/router";
import { Button } from "@basaltac/ui";
import { AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger, } from "@basaltac/ui";

/**
 * Button that confirms before running a destructive async action and reports
 * the result inline. Used by every delete/revoke call site so mutating buttons
 * never silently fail (no more bare 500s) and always give on-screen feedback.
 *
 * Same props contract as the old inline "Delete? Yes / No" version — the
 * confirm step is now a real <AlertDialog>. `danger` renders the trigger in
 * the destructive variant; class/style land on the trigger.
 */
export default function ConfirmButton(props: {
	label: string;
	/** Async action. Return `{ error }` to signal failure; anything else = success. */
	onConfirm: () => Promise<{ error?: string } | null | undefined>;
	confirmText?: string;
	successText?: string;
	danger?: boolean;
	class?: string;
	style?: JSX.CSSProperties;
}) {
	const [state, setState] = createSignal<"idle" | "busy" | "done" | "error">("idle");
	const [msg, setMsg] = createSignal("");
	const [open, setOpen] = createSignal(false);

	async function run() {
		setMsg("");
		setState("busy");
		try {
			const res = await props.onConfirm();
			if (res?.error) {
				setState("error");
				setMsg(res.error);
				return;
			}
			// Show a brief confirmation, then revert (list revalidates and the row
			// unmounts on its own; this covers actions that don't remove a row).
			setState("done");
			setOpen(false);
			revalidate();
			setTimeout(() => setState("idle"), 1200);
		} catch (e) {
			setState("error");
			setMsg(e instanceof Error ? e.message : "Something went wrong");
		}
	}

	return (
		<span style={{ display: "inline-flex", gap: "6px", "align-items": "center" }}>
			<AlertDialog
				open={open()}
				onOpenChange={(o: boolean) => {
					setOpen(o);
					if (o) setState("idle");
				}}
			>
				<AlertDialogTrigger
					as={Button}
					variant={props.danger ? "destructive" : "outline"}
					size="sm"
					class={props.class}
					style={props.style}
				>
					{props.label}
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{props.confirmText ?? "Delete?"}</AlertDialogTitle>
						<AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={state() === "busy"}
							onClick={run}
						>
							{state() === "busy" ? "…" : "Yes"}
						</AlertDialogAction>
					</div>
				</AlertDialogContent>
			</AlertDialog>
			{state() === "done" && (
				<span style={{ color: "#22c55e", "font-size": "12px" }}>
					✓ {props.successText ?? "Done"}
				</span>
			)}
			{state() === "error" && (
				<span class="login-error" style={{ "font-size": "12px" }}>{msg()}</span>
			)}
		</span>
	);
}
