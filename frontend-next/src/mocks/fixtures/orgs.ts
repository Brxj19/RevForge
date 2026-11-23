// Phase 4B: Organization fixtures for MSW handlers.
import type { Invitation, OrganizationMember } from "~/lib/api/types";

const T0 = "2026-07-13T20:00:00.000Z";

/** Members of "sigma", matching the prototype's member list. */
export const SIGMA_MEMBERS: OrganizationMember[] = [
  {
    id: "mem-001",
    organization_id: "00000000-0000-4000-9000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000001",
    role: "owner",
    created_at: T0,
    updated_at: T0,
    user_email: "brajesh@sigma.dev",
    user_display_name: "Brxj19",
  },
  {
    id: "mem-002",
    organization_id: "00000000-0000-4000-9000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    role: "admin",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    user_email: "tatwa@sigma.dev",
    user_display_name: "Tatwa Prasad",
  },
  {
    id: "mem-003",
    organization_id: "00000000-0000-4000-9000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000003",
    role: "member",
    created_at: "2026-08-15T12:00:00.000Z",
    updated_at: "2026-08-15T12:00:00.000Z",
    user_email: "priya@sigma.dev",
    user_display_name: "Priya Nair",
  },
  {
    id: "mem-004",
    organization_id: "00000000-0000-4000-9000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000004",
    role: "member",
    created_at: "2026-09-01T09:00:00.000Z",
    updated_at: "2026-09-01T09:00:00.000Z",
    user_email: "arun@sigma.dev",
    user_display_name: "Arun Kumar",
  },
  {
    id: "mem-005",
    organization_id: "00000000-0000-4000-9000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000005",
    role: "member",
    created_at: "2026-09-20T14:00:00.000Z",
    updated_at: "2026-09-20T14:00:00.000Z",
    user_email: "kavita@sigma.dev",
    user_display_name: "Kavita Sharma",
  },
];

/** Pending invitations matching the prototype. */
export const SIGMA_INVITATIONS: Invitation[] = [
  {
    id: "inv-001",
    organization_id: "00000000-0000-4000-9000-000000000001",
    email: "sana@sigma.dev",
    role: "member",
    status: "pending",
    invited_by_email: "brajesh@sigma.dev",
    created_at: "2026-10-03T08:00:00.000Z",
    expires_at: "2026-10-10T08:00:00.000Z",
  },
  {
    id: "inv-002",
    organization_id: "00000000-0000-4000-9000-000000000001",
    email: "arjun.nair@outlook.com",
    role: "member",
    status: "pending",
    invited_by_email: "brajesh@sigma.dev",
    created_at: "2026-09-30T08:00:00.000Z",
    expires_at: "2026-10-07T08:00:00.000Z",
  },
];
