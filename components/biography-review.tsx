/**
 * Biography Review Component
 *
 * Displays the generated biography with approve/disapprove actions.
 * This component handles Step 7-9 of the workflow.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowState } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, User, Mail, Briefcase } from "lucide-react";

interface BiographyReviewProps {
  workflow: WorkflowState;
}

export function BiographyReview({ workflow }: BiographyReviewProps) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [isDisapproving, setIsDisapproving] = useState(false);
  const [showDisapprovalForm, setShowDisapprovalForm] = useState(false);
  const [disapprovalReason, setDisapprovalReason] = useState("");
  const [error, setError] = useState("");

  const { recipientInfo, biography } = workflow;

  /**
   * Handles approval (Step 8)
   * Sends approval to API which triggers email to recipient
   */
  const handleApprove = async () => {
    setIsApproving(true);
    setError("");

    try {
      const response = await fetch(`/api/workflows/${workflow.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to approve");
      }

      alert("Biography approved! Email sent to recipient.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("Failed to approve. Please try again.");
      console.error("Error approving:", err);
    } finally {
      setIsApproving(false);
    }
  };

  /**
   * Handles disapproval (Step 9)
   * Sends disapproval with reason to API which triggers email to recipient
   */
  const handleDisapprove = async () => {
    if (!disapprovalReason.trim()) {
      setError("Please provide a reason for disapproval");
      return;
    }

    setIsDisapproving(true);
    setError("");

    try {
      // The route reads `rejectionReason`. This sent `reason`, so every
      // disapproval stored an undefined reason and emailed an empty one. The
      // mismatch was silent until the body gained a schema; it now fails
      // validation loudly instead.
      const response = await fetch(`/api/workflows/${workflow.id}/disapprove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: disapprovalReason }),
      });

      if (!response.ok) {
        throw new Error("Failed to disapprove");
      }

      alert("Biography disapproved. Email sent to recipient with feedback.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("Failed to disapprove. Please try again.");
      console.error("Error disapproving:", err);
    } finally {
      setIsDisapproving(false);
    }
  };

  if (!recipientInfo || !biography) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Recipient Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Recipient Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{recipientInfo.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{recipientInfo.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span>{recipientInfo.occupation}</span>
            <Badge variant="secondary">
              {recipientInfo.yearsOfExperience} years
            </Badge>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              Skills:
            </p>
            <div className="flex flex-wrap gap-2">
              {recipientInfo.skills.map((skill, index) => (
                <Badge key={index} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generated Biography Card */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Biography</CardTitle>
          <CardDescription>
            Review the AI-generated biographical description below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-6">
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">
              {biography.description}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {!showDisapprovalForm ? (
        <div className="flex gap-3">
          <Button
            onClick={handleApprove}
            disabled={isApproving}
            className="flex-1"
            size="lg"
          >
            <CheckCircle className="mr-2 h-5 w-5" />
            {isApproving ? "Approving..." : "Approve Biography"}
          </Button>
          <Button
            onClick={() => setShowDisapprovalForm(true)}
            disabled={isApproving}
            variant="destructive"
            className="flex-1"
            size="lg"
          >
            <XCircle className="mr-2 h-5 w-5" />
            Disapprove
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Disapproval Reason</CardTitle>
            <CardDescription>
              Please provide a reason for disapproving this biography
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                value={disapprovalReason}
                onChange={(e) => setDisapprovalReason(e.target.value)}
                placeholder="Explain what needs to be changed..."
                rows={4}
                disabled={isDisapproving}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button
                onClick={handleDisapprove}
                disabled={isDisapproving}
                variant="destructive"
                className="flex-1"
              >
                {isDisapproving ? "Submitting..." : "Submit Disapproval"}
              </Button>
              <Button
                onClick={() => {
                  setShowDisapprovalForm(false);
                  setDisapprovalReason("");
                  setError("");
                }}
                disabled={isDisapproving}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BiographyReview;
