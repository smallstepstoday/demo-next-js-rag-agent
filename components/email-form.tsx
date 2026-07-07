/**
 * Email Form Component
 *
 * This component handles Step 1-2 of the workflow:
 * 1. User indicates they want to send a link via email
 * 2. UI displays a field to allow the email to be entered
 * 3. User submits the email address
 *
 * When the form is submitted, it creates a new workflow and sends
 * the form link to the recipient via email.
 */

"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Info, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function EmailForm() {
  const [email, setEmail] = useState("");
  const [formLink, setFormLink] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  /**
   * Handles form submission
   * - Validates email
   * - Calls API to create workflow and send email
   * - Shows success message and refreshes page
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFormLink("");

    // Basic email validation
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      // Call API to initiate workflow
      const response = await fetch("/api/workflows/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email }),
      });

      if (!response.ok) {
        throw new Error("Failed to create workflow");
      }

      const data = await response.json();
      const nextFormLink = `/form/${data.workflowId}`;

      // Reset form and refresh page to show new workflow
      setEmail("");
      setFormLink(nextFormLink);
      router.refresh();
    } catch (err) {
      setError("Failed to send email. Please try again.");
      console.error("Error creating workflow:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Send Biography Form Link
        </CardTitle>
        <CardDescription>
          Enter the recipient&apos;s email to send them a form link for
          biography generation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1">
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full"
            />
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              "Sending..."
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Link
              </>
            )}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {formLink && (
          <div className="mt-4 rounded-md border border-blue-500/20 bg-blue-500/10 p-4 text-sm">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
              <div className="space-y-2">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Demo email link ready
                </p>
                <p className="text-blue-900/80 dark:text-blue-100/80">
                  This demo does not send an actual email. In a production
                  system, an email would be sent containing the following link:
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={formLink}>{formLink}</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
