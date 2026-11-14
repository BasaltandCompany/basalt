// @basaltac/ui — one component library, every surface. Solid (Kobalte)
// source ships as .tsx; consuming vite configs compile the JSX (see
// optimizeDeps.exclude + ssr.noExternal in basalt/dashboard vite configs).
export { Button, buttonVariants, type ButtonProps } from "./components/ui/button"
export { Badge, badgeVariants, type BadgeProps } from "./components/ui/badge"
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card"
export { Input } from "./components/ui/input"
export { Label } from "./components/ui/label"
export { Textarea } from "./components/ui/textarea"
export { Separator } from "./components/ui/separator"
export {
  Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectLabel,
  SelectDescription,
  SelectErrorMessage,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select"
export { Checkbox } from "./components/ui/checkbox"
export {
  Switch,
  SwitchControl,
  SwitchThumb,
  SwitchLabel,
  SwitchDescription,
  SwitchErrorMessage,
} from "./components/ui/switch"
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog"
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./components/ui/alert-dialog"
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./components/ui/dropdown-menu"
export { Popover, PopoverTrigger, PopoverContent } from "./components/ui/popover"
export { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip"
export { Toaster, Toast, ToastClose, ToastTitle, ToastDescription } from "./components/ui/toast"
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/ui/table"
export { Tabs, TabsList, TabsTrigger, TabsContent, TabsIndicator } from "./components/ui/tabs"
export { Alert, AlertTitle, AlertDescription } from "./components/ui/alert"
export { Skeleton } from "./components/ui/skeleton"
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "./components/ui/command"
export { toast, dismiss, toasts } from "./lib/toast"
export { cn } from "./lib/utils"
