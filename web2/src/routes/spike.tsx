import { createSignal } from "solid-js";
import * as Dialog from "@kobalte/core/dialog";
import * as Tabs from "@kobalte/core/tabs";
import * as SwitchPrimitive from "@kobalte/core/switch";
import * as Tooltip from "@kobalte/core/tooltip";
import * as ToastPrimitive from "@kobalte/core/toast";
import { Root as SkeletonRoot } from "@kobalte/core/skeleton";
import { Command } from "cmdk-solid";
import { Button } from "@basaltac/ui2";
import { Dialog as Ui2Dialog, DialogContent, DialogTrigger } from "@basaltac/ui2/dialog";

const spikeStyle = { padding: "32px", "font-family": "system-ui, sans-serif", display: "grid", gap: "20px" } as const;

export default function KobalteSpike() {
	const [dialogOpen, setDialogOpen] = createSignal(false);
	const [on, setOn] = createSignal(false);

	return (
		<div style={spikeStyle}>
			<h1>Kobalte alpha + cmdk rc spike</h1>

			<Dialog.Root open={dialogOpen()} onOpenChange={setDialogOpen}>
				<Dialog.Trigger type="button">Open dialog</Dialog.Trigger>
				<Dialog.Portal>
					<Dialog.Overlay style={{ position: "fixed", inset: "0", background: "rgba(0,0,0,.4)" }} />
					<Dialog.Content style={{ position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)", background: "white", padding: "24px", "border-radius": "8px", color: "black" }}>
						<Dialog.Title>Dialog works</Dialog.Title>
						<Dialog.Description>If you can read this after clicking, Kobalte alpha dialog is alive.</Dialog.Description>
						<Dialog.CloseButton type="button">Close</Dialog.CloseButton>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			<Tabs.Root defaultValue="one">
				<Tabs.List style={{ display: "flex", gap: "8px" }}>
					<Tabs.Trigger value="one">One</Tabs.Trigger>
					<Tabs.Trigger value="two">Two</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="one">tab one content</Tabs.Content>
				<Tabs.Content value="two">tab two content</Tabs.Content>
			</Tabs.Root>

			<SwitchPrimitive.Root checked={on()} onChange={setOn} style={{ display: "inline-flex", gap: "8px", "align-items": "center" }}>
				<SwitchPrimitive.Input />
				<SwitchPrimitive.Control style={{ width: "40px", height: "22px", background: on() ? "#0a0" : "#999", "border-radius": "999px", padding: "2px" }}>
					<SwitchPrimitive.Thumb style={{ display: "block", width: "18px", height: "18px", background: "white", "border-radius": "50%", transform: on() ? "translateX(18px)" : "none" }} />
				</SwitchPrimitive.Control>
				switch is {on() ? "on" : "off"}
			</SwitchPrimitive.Root>

			<Tooltip.Root>
				<Tooltip.Trigger type="button">Hover me</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content style={{ background: "#222", color: "white", padding: "6px 10px", "border-radius": "6px" }}>
						tooltip alive
						<Tooltip.Arrow />
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>

			<SkeletonRoot style={{ width: "200px", height: "16px", background: "#eee", "border-radius": "4px", display: "block" }} />

			<ToastPrimitive.Region>
				<ToastPrimitive.List style={{ position: "fixed", bottom: "16px", right: "16px", display: "grid", gap: "8px" }} />
			</ToastPrimitive.Region>
			<button
				type="button"
				onClick={() =>
					ToastPrimitive.toaster.show((props) => (
						<ToastPrimitive.Root toastId={props.toastId} style={{ background: "#111", color: "white", padding: "12px 16px", "border-radius": "8px" }}>
							<ToastPrimitive.Title>Toast fired</ToastPrimitive.Title>
							<ToastPrimitive.CloseButton type="button">dismiss</ToastPrimitive.CloseButton>
						</ToastPrimitive.Root>
					))
				}
			>
				Fire toast
			</button>

			<Command style={{ border: "1px solid #ccc", "border-radius": "8px", width: "280px" }}>
				<Command.Input placeholder="Type a command…" style={{ width: "100%", padding: "8px" }} />
				<Command.List>
					<Command.Item onSelect={() => console.log("picked alpha")}>alpha item</Command.Item>
					<Command.Item onSelect={() => console.log("picked beta")}>beta item</Command.Item>
				</Command.List>
			</Command>

			<p data-spike-ok="true">spike page rendered without SSR errors</p>

			<Ui2Dialog>
				<DialogTrigger
					class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm ring-offset-background"
					data-ui2-trigger="true"
				>
					ui2 dialog via @basaltac/ui2
				</DialogTrigger>
				<DialogContent>
					<p>ui2 wrapper works on Kobalte alpha</p>
				</DialogContent>
			</Ui2Dialog>
		</div>
	);
}
