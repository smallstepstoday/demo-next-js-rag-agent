/**
 * UTILITY FUNCTIONS MODULE
 *
 * This module provides common utility functions used throughout the application.
 * It includes helpers for styling (Tailwind CSS) and ID generation.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Conditionally merges Tailwind CSS class names
 *
 * This function combines clsx (for conditional classes) and tailwind-merge
 * (for handling Tailwind conflicts) to provide a powerful class name utility.
 *
 * USAGE EXAMPLES:
 * ```tsx
 * // Simple conditional
 * cn("text-blue-500", isActive && "font-bold")
 *
 * // Object syntax
 * cn({
 *   "text-blue-500": true,
 *   "font-bold": isActive,
 *   "opacity-50": isDisabled
 * })
 *
 * // Array syntax with conflicts (tailwind-merge handles the conflict)
 * cn("p-4", "p-6") // Returns: "p-6" (last one wins)
 * cn("text-red-500", isError ? "text-red-700" : "text-blue-500")
 * ```
 *
 * WHY USE THIS?
 * - Handles conditional classes elegantly
 * - Resolves Tailwind class conflicts automatically
 * - Cleaner than template literals with conditions
 * - Type-safe with TypeScript
 *
 * @param inputs - Variable number of class name values
 * @returns Merged and deduplicated class name string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a unique workflow ID
 *
 * This function creates collision-resistant IDs for workflows without
 * requiring external dependencies like the nanoid package.
 *
 * ID FORMAT:
 * - Prefix: "wf_" (workflow identifier)
 * - Timestamp: Current time in milliseconds for uniqueness
 * - Random: Base36 random string for collision resistance
 *
 * EXAMPLE OUTPUT:
 * "wf_1766518288447_sk6l984"
 *
 * WHY THIS APPROACH?
 * - No external dependencies needed
 * - URL-safe characters only
 * - Sortable by creation time (timestamp first)
 * - Readable and debuggable
 * - Low collision probability (~50 million possibilities per millisecond)
 *
 * COLLISION RESISTANCE:
 * - Timestamp ensures different IDs per millisecond
 * - Random suffix provides ~50,000,000 combinations (36^7)
 * - Combined probability of collision is extremely low
 *
 * @returns A unique identifier string in format "wf_[timestamp]_[random]"
 */
export function nanoid(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
