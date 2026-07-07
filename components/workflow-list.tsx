/**
 * Workflow List Component
 *
 * Displays all workflows and their current statuses (Step 6).
 * Each workflow card shows:
 * - Recipient email
 * - Current status with color coding
 * - Timestamp
 * - Action button if approval is needed
 *
 * Users can click on pending approval cards to review the biography.
 */

"use client";

import type { WorkflowState, WorkflowListProps } from "@/lib/workflow-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  Trash2,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Maps workflow status to display information
 */
function getStatusDisplay(status: WorkflowState["status"]) {
  const statusMap = {
    pending_recipient_info: {
      label: "Waiting for Recipient",
      icon: Clock,
      color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" as const,
    },
    generating_bio: {
      label: "Generating Biography",
      icon: Loader2,
      color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" as const,
    },
    pending_approval: {
      label: "Pending Your Approval",
      icon: FileText,
      color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" as const,
    },
    approved: {
      label: "Approved",
      icon: CheckCircle,
      color: "bg-green-500/10 text-green-700 dark:text-green-400" as const,
    },
    disapproved: {
      label: "Disapproved",
      icon: XCircle,
      color: "bg-red-500/10 text-red-700 dark:text-red-400" as const,
    },
    completed: {
      label: "Completed",
      icon: CheckCircle,
      color: "bg-gray-500/10 text-gray-700 dark:text-gray-400" as const,
    },
  };

  return statusMap[status];
}

/**
 * Formats date to readable string
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function WorkflowList({ workflows }: WorkflowListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Show message if no workflows exist
  if (workflows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-center text-muted-foreground">
            No workflows yet. Send a form link to get started!
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleDelete = async (workflowId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this workflow? This action cannot be undone.",
      )
    ) {
      return;
    }

    setDeletingId(workflowId);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/delete`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete workflow");
      }

      // Refresh the page to show updated list
      window.location.reload();
    } catch (error) {
      console.error("Error deleting workflow:", error);
      alert("Failed to delete workflow. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {workflows.map((workflow) => {
        const statusDisplay = getStatusDisplay(workflow.status);
        const StatusIcon = statusDisplay.icon;

        return (
          <Card key={workflow.id} className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">
                    {workflow.recipientInfo?.name || workflow.recipientEmail}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {workflow.recipientEmail}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className={statusDisplay.color}>
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {statusDisplay.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Created {formatDate(workflow.createdAt)}
                </p>

                <div className="flex gap-2">
                  {/* Show review button if pending approval */}
                  {workflow.status === "pending_approval" && (
                    <Button size="sm" asChild>
                      <Link href={`/review/${workflow.id}`}>
                        Review Biography
                      </Link>
                    </Button>
                  )}

                  {/* Show view button if approved */}
                  {workflow.status === "approved" && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/biography/${workflow.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Biography
                      </Link>
                    </Button>
                  )}

                  {/* Show delete button for all workflows */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(workflow.id)}
                    disabled={deletingId === workflow.id}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
