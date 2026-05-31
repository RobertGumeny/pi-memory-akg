// Node type identifiers (PRD §6.5)
export const NODE_TYPES = [
	"project",
	"session",
	"decision",
	"constraint",
	"preference",
	"task",
	"artifact",
	"file",
	"concept",
	"pattern",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

// Relation type identifiers (PRD §6.5)
export const RELATION_TYPES = [
	"affects",
	"depends_on",
	"blocks",
	"implements",
	"documents",
	"derived_from",
	"supersedes",
	"relevant_to",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

// Standard tag identifiers (PRD §6.5)
export const MEMORY_TAGS = [
	"durable",
	"active",
	"user_pref",
	"repo_fact",
	"workflow",
	"bug",
	"design",
] as const;

export type MemoryTag = (typeof MEMORY_TAGS)[number];

// Metadata field name constants (PRD §6.5)
export const META_CWD = "cwd" as const;
export const META_SESSION_ID = "session_id" as const;
export const META_ENTRY_IDS = "entry_ids" as const;
export const META_SOURCE = "source" as const;
export const META_STATUS = "status" as const;
export const META_CONFIDENCE_REASON = "confidence_reason" as const;
export const META_LAST_SEEN_AT = "last_seen_at" as const;

// Status values written to a node's `status` metadata field.
// Auto-captured (Phase 2) memories land as "unreviewed" until a human or
// the review surface promotes them to "active" (or reverts them).
export const STATUS_ACTIVE = "active" as const;
export const STATUS_INACTIVE = "inactive" as const;
export const STATUS_SUPERSEDED = "superseded" as const;
export const STATUS_UNREVIEWED = "unreviewed" as const;

export const METADATA_FIELDS = [
	META_CWD,
	META_SESSION_ID,
	META_ENTRY_IDS,
	META_SOURCE,
	META_STATUS,
	META_CONFIDENCE_REASON,
	META_LAST_SEEN_AT,
] as const;

export type MetadataField = (typeof METADATA_FIELDS)[number];
