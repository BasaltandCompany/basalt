// #/ui — the component gallery. Every library component renders here at
// least once; smoke.tsx asserts on this page's DOM. Same hash-view mechanism
// as #footage.
import { createSignal } from "solid-js"
import { For } from "solid-js"

import { Button } from "@basaltac/ui"
import { Badge } from "@basaltac/ui"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@basaltac/ui"
import { Input } from "@basaltac/ui"
import { Label } from "@basaltac/ui"
import { Textarea } from "@basaltac/ui"
import { Separator } from "@basaltac/ui"
import { Select, SelectContent, SelectHiddenSelect, SelectItem, SelectTrigger, SelectValue } from "@basaltac/ui"
import { Checkbox } from "@basaltac/ui"
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from "@basaltac/ui"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@basaltac/ui"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@basaltac/ui"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@basaltac/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@basaltac/ui"
import { Tooltip, TooltipContent, TooltipTrigger } from "@basaltac/ui"
import { Toaster } from "@basaltac/ui"
import { toast } from "@basaltac/ui"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@basaltac/ui"
import { Alert, AlertDescription, AlertTitle } from "@basaltac/ui"
import { Skeleton } from "@basaltac/ui"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@basaltac/ui"

function Section(props: { title: string; children: any }) {
  return (
    <section class="space-y-3">
      <h2 class="font-serif text-xl">{props.title}</h2>
      {props.children}
    </section>
  )
}

// Select inside a real <form>: the HiddenSelect must feed new FormData(form)
// or dialogs built on it break invisibly. smoke.tsx submits this form.
function SelectForm() {
  return (
    <form
      id="gallery-select-form"
      onSubmit={(e) => e.preventDefault()}
      class="max-w-xs space-y-2"
    >
      <Select
        options={["Landing", "Writing", "Careers"]}
        placeholder="Pick a page…"
        itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
      >
        <SelectHiddenSelect />
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent />
      </Select>
    </form>
  )
}

export default function UiGallery() {
  const [dialogOpen, setDialogOpen] = createSignal(false)
  return (
    <div class="mx-auto max-w-3xl space-y-10 bg-background p-8 text-foreground">
      <header class="space-y-1">
        <h1 class="font-serif text-3xl">Basalt UI</h1>
        <p class="text-sm text-muted-foreground">Every component, ink-themed, radius zero.</p>
      </header>

      <Section title="Button">
        <div class="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button variant="outline" size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badge">
        <div class="flex gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description line.</CardDescription>
          </CardHeader>
          <CardContent>Card body content.</CardContent>
          <CardFooter>
            <Button size="sm">Act</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Input / Label / Textarea">
        <div class="max-w-xs space-y-3">
          <div class="space-y-1">
            <Label for="g-name">Name</Label>
            <Input id="g-name" placeholder="e.g. basalt" />
          </div>
          <div class="space-y-1">
            <Label for="g-msg">Message</Label>
            <Textarea id="g-msg" placeholder="Tell us…" />
          </div>
        </div>
      </Section>

      <Section title="Separator">
        <p>above</p>
        <Separator />
        <p>below</p>
      </Section>

      <Section title="Select">
        <SelectForm />
      </Section>

      <Section title="Checkbox / Switch">
        <div class="flex items-center gap-6">
          <Checkbox>Accept</Checkbox>
          <Switch>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
            <SwitchLabel>Autopilot</SwitchLabel>
          </Switch>
        </div>
      </Section>

      <Section title="Dialog / AlertDialog">
        <div class="flex gap-3">
          <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
            <DialogTrigger as={Button} variant="outline">Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create thing</DialogTitle>
                <DialogDescription>Dialogs read FormData from their form.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setDialogOpen(false)}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger as={Button} variant="destructive">Delete</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete forever?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Section>

      <Section title="DropdownMenu / Popover / Tooltip">
        <div class="flex gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline">Menu</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger as={Button} variant="outline">Popover</PopoverTrigger>
            <PopoverContent class="w-56 text-sm">Popover body copy.</PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost">Hover</TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section title="Toast">
        <div class="flex gap-2">
          <Button size="sm" onClick={() => toast("Saved.")}>toast info</Button>
          <Button size="sm" variant="destructive" onClick={() => toast("Failed to save.", "error")}>
            toast error
          </Button>
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <For each={[["Landing", "live"], ["Writing", "draft"]]}>
              {([page, status]) => (
                <TableRow>
                  <TableCell>{page}</TableCell>
                  <TableCell>{status}</TableCell>
                </TableRow>
              )}
            </For>
          </TableBody>
        </Table>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First tab body.</TabsContent>
          <TabsContent value="two">Second tab body.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Alert / Skeleton">
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Alert description text.</AlertDescription>
        </Alert>
        <div class="flex items-center gap-4">
          <Skeleton class="size-10 rounded-full" />
          <div class="space-y-2">
            <Skeleton class="h-4 w-52" />
            <Skeleton class="h-4 w-36" />
          </div>
        </div>
      </Section>

      <Section title="Command">
        <Command class="max-w-md rounded-md border">
          <CommandInput placeholder="Type a command…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Pages">
              <CommandItem>Landing</CommandItem>
              <CommandItem>Writing</CommandItem>
              <CommandItem>Careers</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Section>

      <Toaster />
    </div>
  )
}
