/**
 * Recipient Form Component
 *
 * This form collects all necessary information from the recipient
 * to generate a biographical description. After submission, it
 * triggers the AI generation step.
 */

"use client";

import type React from "react";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface RecipientFormProps {
  workflowId: string;
  recipientEmail: string;
}

function RecipientForm({ workflowId, recipientEmail }: RecipientFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    occupation: "",
    yearsOfExperience: "",
    skillInput: "",
    skills: [] as string[],
    achievements: "",
    interests: "",
  });

  /**
   * Adds a skill to the skills array
   */
  const addSkill = () => {
    if (formData.skillInput.trim()) {
      setFormData({
        ...formData,
        skills: [...formData.skills, formData.skillInput.trim()],
        skillInput: "",
      });
    }
  };

  /**
   * Removes a skill from the skills array
   */
  const removeSkill = (index: number) => {
    setFormData({
      ...formData,
      skills: formData.skills.filter((_, i) => i !== index),
    });
  };

  /**
   * Handles skill input on Enter key
   */
  const handleSkillKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  };

  /**
   * Handles form submission
   * Validates data and submits to API
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.name || !formData.occupation || !formData.yearsOfExperience) {
      setError("Please fill in all required fields");
      return;
    }

    if (formData.skills.length === 0) {
      setError("Please add at least one skill");
      return;
    }

    setIsLoading(true);

    console.log("Submitting form for workflow:", workflowId);

    try {
      const response = await fetch(`/api/workflows/${workflowId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: recipientEmail,
          occupation: formData.occupation,
          yearsOfExperience: Number.parseInt(formData.yearsOfExperience),
          skills: formData.skills,
          achievements: formData.achievements,
          interests: formData.interests,
        }),
      });

      console.log("Form submission response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Form submission failed:", errorData);
        throw new Error(errorData.error || "Failed to submit form");
      }

      const result = await response.json();
      console.log("Form submitted successfully:", result);

      // Show success page
      router.push(`/form/${workflowId}/success`);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to submit form. Please try again.";
      setError(errorMessage);
      console.error("Error submitting form:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Information</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="John Doe"
              disabled={isLoading}
            />
          </div>

          {/* Occupation Field */}
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation *</Label>
            <Input
              id="occupation"
              value={formData.occupation}
              onChange={(e) =>
                setFormData({ ...formData, occupation: e.target.value })
              }
              placeholder="Software Engineer"
              disabled={isLoading}
            />
          </div>

          {/* Years of Experience Field */}
          <div className="space-y-2">
            <Label htmlFor="experience">Years of Experience *</Label>
            <Input
              id="experience"
              type="number"
              min="0"
              value={formData.yearsOfExperience}
              onChange={(e) =>
                setFormData({ ...formData, yearsOfExperience: e.target.value })
              }
              placeholder="5"
              disabled={isLoading}
            />
          </div>

          {/* Skills Field */}
          <div className="space-y-2">
            <Label htmlFor="skills">Skills * (Press Enter to add)</Label>
            <div className="flex gap-2">
              <Input
                id="skills"
                value={formData.skillInput}
                onChange={(e) =>
                  setFormData({ ...formData, skillInput: e.target.value })
                }
                onKeyPress={handleSkillKeyPress}
                placeholder="e.g., React, TypeScript, Node.js"
                disabled={isLoading}
              />
              <Button type="button" onClick={addSkill} disabled={isLoading}>
                Add
              </Button>
            </div>
            {formData.skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.skills.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(index)}
                      className="ml-1"
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Achievements Field */}
          <div className="space-y-2">
            <Label htmlFor="achievements">Key Achievements</Label>
            <Textarea
              id="achievements"
              value={formData.achievements}
              onChange={(e) =>
                setFormData({ ...formData, achievements: e.target.value })
              }
              placeholder="Describe your notable accomplishments..."
              rows={4}
              disabled={isLoading}
            />
          </div>

          {/* Interests Field */}
          <div className="space-y-2">
            <Label htmlFor="interests">Interests</Label>
            <Textarea
              id="interests"
              value={formData.interests}
              onChange={(e) =>
                setFormData({ ...formData, interests: e.target.value })
              }
              placeholder="What are your professional or personal interests?"
              rows={3}
              disabled={isLoading}
            />
          </div>

          {/* Error Message */}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Submitting..." : "Submit Information"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default RecipientForm;
