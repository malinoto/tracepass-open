/**
 * Shared types for the TracePass open DPP packages.
 *
 * These model a Digital Product Passport as plain data. Nothing here depends on
 * a database, a web framework, or any runtime — the package ships types only, so
 * it adds zero bytes to your bundle.
 */

/**
 * An opaque identifier.
 *
 * Storage engines disagree about what an id is: MongoDB hands you an ObjectId,
 * Postgres a uuid or bigint, a JSON file a plain string. None of that matters to
 * the passport logic, so ids stay opaque and every package here treats them as
 * values to carry, never to parse.
 */
export type Id = string;

/** The 24 official languages of the European Union. */
export type Locale =
  | "bg" | "cs" | "da" | "de" | "el" | "en" | "es" | "et" | "fi" | "fr"
  | "ga" | "hr" | "hu" | "it" | "lt" | "lv" | "mt" | "nl" | "pl" | "pt"
  | "ro" | "sk" | "sl" | "sv";

/** A string translated into one or more EU languages. `en` is always present. */
export type LocalizedString = { en: string } & Partial<Record<Locale, string>>;

// ─── Template (the field specification for a product category) ──────────────

export type FieldDataType =
  | "string" | "number" | "boolean" | "date"
  | "enum" | "multi_enum" | "url" | "object"
  | "array" | "file_reference";

/**
 * Who may read a field.
 *
 * - `public`    — anyone who scans the product's QR code
 * - `restricted`— holders of a granted access token (e.g. a recycler)
 * - `authority` — market-surveillance bodies
 */
export type AccessLevel = "public" | "restricted" | "authority";

/** Where in an EU instrument a field is mandated. */
export interface RegulationRef {
  article?: string | null;
  annex?: string | null;
  description?: string | null;
}

/** Hints for extracting a field's value from unstructured supplier documents. */
export interface AiHints {
  /** Synonyms a datasheet might use for this field. */
  alternateNames: string[];
  expectedFormat?: string | null;
  /** Higher runs first when extraction budget is limited. */
  extractionPriority: number;
}

/**
 * Constraints on a field's value.
 *
 * Every constraint other than `required` may be `null`, which means "no
 * constraint" — distinct from `0`, which is a real bound. Template JSON stores
 * the absent case as an explicit `null` rather than omitting the key.
 */
export interface FieldValidation {
  required: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  /** ECMAScript regular expression source. */
  pattern?: string | null;
}

export interface EnumOption {
  value: string;
  label: LocalizedString;
}

export interface TemplateField {
  /** Stable machine key, unique within the template. */
  key: string;
  label: LocalizedString;
  description?: LocalizedString;
  placeholder?: LocalizedString;
  dataType: FieldDataType;
  /** Unit of measure, or `null` when the field has no unit. */
  unit?: string | null;
  /** True when the value is free text that should be translated. */
  translatable?: boolean;
  defaultValue?: unknown;
  /** Permitted values for `enum` / `multi_enum`; `null` otherwise. */
  enumOptions?: EnumOption[] | null;
  validation: FieldValidation;
  /** Field-group this field belongs to. */
  category: string;
  categoryLabel: LocalizedString;
  sortOrder: number;
  defaultAccessLevel: AccessLevel;
  regulationRef?: RegulationRef | null;
  aiHints?: AiHints | null;
}

/** A field-group section, in display order. */
export type TemplateSection =
  | string
  | { key: string; label?: LocalizedString; fieldCount?: number; sortOrder?: number };

/** The EU instrument that mandates a category's passport. */
export interface Regulation {
  name: string;
  /** e.g. `"(EU) 2023/1542"` */
  number: string;
  /** ISO 8601 date (`YYYY-MM-DD`). A string, not a timestamp. */
  effectiveDate: string;
  /** ISO 8601 date from which the passport is legally required. */
  mandatoryDate: string;
}

/**
 * The field specification for one product category.
 *
 * This models the shape of the published template JSON. A passport store will
 * typically add its own `_id` and timestamps on top; those are deliberately not
 * part of this type, so `JSON.parse(readFileSync("battery.json"))` type-checks.
 */
export interface Template {
  category: string;
  categoryLabel: LocalizedString;
  version: number;
  isLatest: boolean;
  regulation: Regulation;
  fields: TemplateField[];
  fieldCount: number;
  requiredFieldCount: number;
  categories: TemplateSection[];
  createdBy: string;
  changelog?: string;
}

// ─── Passport (a filled-in template for one physical product) ───────────────

export type FieldSource =
  | "manual" | "ai_suggested" | "ai_approved"
  | "reference_db" | "supplier" | "system" | "company";

export type FieldStatus =
  | "empty" | "pending_review" | "approved" | "flagged" | "rejected";

export type PassportStatus =
  | "draft" | "in_review" | "approved"
  | "published" | "suspended" | "expired" | "archived";

/** One filled-in field of a passport. */
export interface PassportField {
  value: unknown;
  /** Extraction confidence in [0, 1], when the value came from a model. */
  confidence?: number;
  source?: FieldSource;
  status: FieldStatus;
  accessLevel?: AccessLevel;
  lastUpdatedBy?: Id;
  lastUpdatedAt?: string | Date;
  approvedBy?: Id;
  approvedAt?: string | Date;
  /** Locale of `value`; defaults to `"en"`. */
  sourceLocale?: Locale;
}

/**
 * An economic operator the passport identifies.
 *
 * Where the GTIN says *what* the product is, parties say *who* is responsible
 * for it. Each role maps to a regulation-defined obligation.
 */
export type PartyRole =
  | "manufacturer"
  | "importer"
  | "authorisedRepresentative"
  | "distributor"
  | "recycler"
  | "producerResponsibilityOrg";

/** Parties do not have a `flagged` state, unlike fields. */
export type PartyStatus = "approved" | "pending_review";

export interface Party {
  /** GS1 Global Location Number — 13 digits with a mod-10 check digit. */
  gln?: string;
  legalName: string;
  /** ISO 3166-1 alpha-2 country code of registration. */
  country?: string;
  /** Fallback identifier (VAT, EORI, national tax id) for entities lacking a GLN. */
  legacyOperatorId?: string;
  url?: string;
  status?: PartyStatus;
}

/**
 * A battery classification flag.
 *
 * Tri-state by design: `true`, `false`, or absent. Absent means *unknown* — a
 * dependent field is then shown and warned about, never silently hidden. An
 * AI-suggested flag lands as `pending_review` and does not hard-hide anything.
 */
export interface BatteryProfileFlag {
  value: boolean;
  status: PartyStatus;
  source?: string;
}

/**
 * Classifiers that determine which battery fields actually apply to *this*
 * battery. These are not Annex XIII data fields and are kept out of the
 * template, so completion math and field counts stay unchanged.
 */
export interface BatteryProfile {
  /** Has a battery management system. Gates `stateOfHealth`. */
  hasBMS?: BatteryProfileFlag;
  /** Rechargeable. Gates the carbon-footprint fields. */
  rechargeable?: BatteryProfileFlag;
  /** External storage only. Gates the recycled-content fields. */
  externalStorageOnly?: BatteryProfileFlag;
}

export interface Passport {
  gs1?: {
    gtin: string;
    serialNumber: string;
    digitalLinkUri?: string;
  };
  status: PassportStatus;
  fields: Record<string, PassportField>;
  parties?: Partial<Record<PartyRole, Party>>;
  batteryProfile?: BatteryProfile;
  publishedAt?: string | Date;
}

// ─── Traceability events ───────────────────────────────────────────────────

export type ServiceEventType =
  | "repair" | "warranty_claim" | "maintenance"
  | "inspection" | "replacement" | "recall";

export type ServiceEventStatus =
  | "scheduled" | "in_progress" | "completed" | "cancelled";

/**
 * A repair, inspection, or other service performed on a product.
 *
 * `_id` is the event's own identifier — an opaque {@link Id}, not a database
 * type. It is stringified into the EPCIS `eventID`, so it must be unique and
 * stable, but nothing here interprets it.
 */
export interface ServiceEvent {
  _id: Id;
  type: ServiceEventType;
  status?: ServiceEventStatus;
  title: string;
  description?: string;
  performedBy?: string;
  /** When the service happened. Absent for a scheduled-but-not-done event. */
  performedAt?: string | Date;
  scheduledAt?: string | Date;
  warrantyRef?: string;
  location?: string;
  /** When the record was created. Used as the event time when `performedAt` is absent. */
  createdAt: string | Date;
}

export type OwnershipTransferStatus =
  | "pending" | "accepted" | "rejected" | "expired";

/** A change of custody. Only an `accepted` transfer becomes an EPCIS event. */
export interface OwnershipTransfer {
  _id: Id;
  fromName: string;
  fromEmail?: string;
  toName: string;
  toEmail?: string;
  reason: "sale" | "resale" | "donation" | "return" | "recycling" | "other";
  notes?: string;
  transferredAt?: string | Date;
  status: OwnershipTransferStatus;
  createdAt: string | Date;
}
