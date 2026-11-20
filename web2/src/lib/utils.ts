import type { ClassValue } from "clsx";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { cva } from "class-variance-authority";

export { cva };
export const cn = (...classLists: ClassValue[]) => twMerge(clsx(classLists));
