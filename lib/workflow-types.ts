/**
 * Workflow Types and Interfaces
 *
 * This module defines all the TypeScript types and interfaces used throughout
 * the multi-step RAG workflow. These types ensure type safety and provide
 * clear documentation of data structures used in the workflow.
 */

/**
 * Workflow Status - Represents the current state of the workflow
 */
export type WorkflowStatus =
  | "pending_recipient_info" // Step 1-3: Waiting for recipient to fill form
  | "generating_bio" // Step 5: AI is generating the biography
  | "pending_approval" // Step 6: Waiting for user to approve/disapprove
  | "approved" // Step 8: User approved, email sent to recipient
  | "disapproved" // Step 9: User disapproved, rejection email sent
  | "completed" // Workflow fully completed

/**
 * Recipient Information - Data collected from the recipient's form
 */
export interface RecipientInfo {
  name: string
  email: string
  occupation: string
  yearsOfExperience: number
  skills: string[]
  achievements: string
  interests: string
}

/**
 * Biography Data - Generated biographical description from AI
 */
export interface BiographyData {
  description: string
  generatedAt: Date
}

/**
 * Workflow State - Complete state of the workflow stored in database
 */
export interface WorkflowState {
  id: string
  recipientEmail: string
  status: WorkflowStatus
  recipientInfo?: RecipientInfo
  biography?: BiographyData
  disapprovalReason?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Workflow list component props
 */
export interface WorkflowListProps {
  workflows: WorkflowState[]
}

/**
 * Email Template Types - Different types of emails sent during workflow
 */
export type EmailType =
  | "recipient_form_link" // Step 3: Initial form link to recipient
  | "approved_biography" // Step 8: Biography sent after approval
  | "disapproved_notice" // Step 9: Rejection notice with reason
