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
  /**
   * Record that a person read the cited provision in the official EUR-Lex text
   * and confirmed the field's requirement, scale and unit match. Present only
   * when the primary text was actually consulted; absent means unverified.
   *
   * The schemas repo's citation audit reports the verified share per category
   * and will reject a `verifiedAgainstPrimaryText` whose `on` date, `celex`
   * or `by` field is missing from the schema.
   */
  verifiedAgainstPrimaryText?: {
    /** ISO 8601 date the act was read, e.g. `"2026-09-28"`. */
    on: string;
    /**
     * CELEX id of the consolidated version read, e.g. `"32023R1542"`.
     * Absent when the instrument has no CELEX (a standard, scheme, or
     * national law).
     */
    celex?: string;
    /** Who performed the verification, e.g. `"TracePass"`. */
    by: string;
  } | null;
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
  /**
   * An instrument **in force today** requires this data, so a passport cannot
   * be published without it.
   *
   * When `requiredBy` is present this acts as the category-agnostic fallback,
   * consulted only when no category is set or the category is not a key in
   * `requiredBy`.
   */
  required: boolean;
  /**
   * Per-battery-category applicability (the battery template only, today).
   * Absent means the field is category-agnostic and `required` applies.
   *
   *   `"required"`      — this category's passport must provide the field.
   *   `"conditional"`   — applicable in some cases; does not block publishing.
   *   `"notApplicable"` — must NOT be provided for this category.
   *
   * Keys are `batteryCategory` values (`"EV"`, `"LMT"`, `"industrial_gt_2kwh"`).
   * A field with a `requiredBy` map normally has `required: false`, so an unset
   * category can never block publishing on a field the battery may not need.
   */
  requiredBy?: Partial<Record<string, "required" | "conditional" | "notApplicable">>;
  /**
   * A named future instrument is expected to require this data, but none does
   * yet — typically an ESPR delegated act that has not been adopted. Does not
   * block publishing: it is readiness, not compliance.
   */
  anticipated?: boolean;
  /** CELEX of the instrument expected to impose it, e.g. `"32024R1781"`. */
  anticipatedUnder?: string | null;
  /** Why it is expected, in prose. */
  anticipatedNote?: string | null;
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

/**
 * How much of a regulation date is real.
 *
 * `"day"` — a specific statutory date (e.g. battery, `2027-02-18`, ESPR Art. 77).
 * `"year"` — only the year is known, because the governing delegated or
 * implementing act is not yet adopted. The day and month are filler and must
 * not be shown to end users as a deadline.
 *
 * Absent means `"day"`.
 */
export type DatePrecision = "day" | "year";

/** The EU instrument that mandates a category's passport. */
export interface Regulation {
  name: string;
  /** e.g. `"(EU) 2023/1542"` */
  number: string;
  /**
   * ISO 8601 date (`YYYY-MM-DD`). A string, not a timestamp.
   *
   * The date the DIGITAL PRODUCT PASSPORT obligation begins — NOT the date the
   * instrument enters into force or starts applying. The two can differ by
   * years: PPWR (EU) 2025/40 has applied since 2026-08-12, but its packaging
   * DPP provisions phase in from 2027.
   *
   * Always read alongside {@link Regulation.datePrecision}.
   */
  effectiveDate: string;
  /** Precision of {@link Regulation.effectiveDate}. Absent means `"day"`. */
  datePrecision?: DatePrecision;
  /** ISO 8601 date from which the passport is legally required. */
  mandatoryDate: string;
  /** Precision of {@link Regulation.mandatoryDate}. Absent means `"day"`. */
  mandatoryDatePrecision?: DatePrecision;
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
  /**
   * Typed EN 18219 economic-operator identifier (schemes 6–9). One of `gln`,
   * `legacyOperatorId` or this identifies the party. A `gln`-scheme value also
   * fills `gln`, and the two must match. EPCIS carries the GLN only.
   */
  operatorIdentifier?: OperatorIdentifier;
  /**
   * Typed EN 18219 facility identifier (schemes 6–9).
   * Optional — for parties that play a site role (manufacturer's physical
   * plant, importer's warehouse). Distinct from the operator's own GLN.
   */
  facilityIdentifier?: FacilityIdentifier;
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
  /**
   * Stationary battery energy storage system (BESS).
   *
   * Art. 14(1) of Reg. (EU) 2023/1542 scopes state-of-health and expected-
   * lifetime data (Annex VII Parts A and B) to stationary battery energy
   * storage systems, LMT batteries and electric vehicle batteries. A plain
   * industrial (>2 kWh) battery that is NOT a stationary ESS does not owe
   * this data. Confirming this flag `true` opens the Annex VII Part A and
   * Part B applicability gates for industrial batteries.
   */
  isStationaryBess?: BatteryProfileFlag;
}

/**
 * Generic condition flag — extends `BatteryProfileFlag` with an audit trail.
 * Used by `conditionProfile` (the new canonical location for condition
 * classification flags that generalises `batteryProfile`).
 */
export interface ConditionFlag {
  value: boolean;
  status: PartyStatus;
  source?: string;
  /** Audit trail — each write appends one entry. */
  audit: Array<{
    value: boolean;
    changedBy: string | { toHexString: () => string };
    changedAt: string | Date;
    source: string;
    action: "created" | "updated";
    note?: string;
  }>;
}

/**
 * Generic condition-classification profile. Generalises `batteryProfile` to
 * any product category. Keys are defined per-category in the
 * `CONDITION_FLAGS` registry on the platform.
 *
 * `resolveConditionProfile(passport)` — the canonical accessor — reads
 * `conditionProfile` when present and non-empty, and falls back to
 * `batteryProfile` (adapting BatteryProfileFlag → ConditionFlag with
 * `audit: []`) for pre-migration passports.
 */
export type ConditionProfile = Record<string, ConditionFlag>;

// ─── Scheme-tagged product identifiers (EN 18219) ──────────────────────────

/**
 * GS1 product identifier — EN 18219 scheme 1 using GS1 Application Identifiers
 * (GS1 Digital Link). The GTIN is always stored as 14 digits; GTIN-8/12/13
 * inputs must be left-padded before use here.
 */
export interface Gs1Identifier {
  scheme: "gs1";
  /** GTIN-14 (14 numeric digits). GTIN-8/12/13 normalised by left-padding with zeros. */
  gtin: string;
  serialNumber: string;
  /** GS1 Digital Link URI, e.g. `"https://id.example.com/01/…/21/…"`. */
  digitalLinkUri?: string;
}

/**
 * ISO/IEC 15459 product identifier — EN 18219 scheme 1, non-GS1 issuing agency.
 * The issuingAgencyCode is a code registered under ISO/IEC 15459-2.
 *
 * Battery Regulation Art. 77(3) requires ISO/IEC 15459, so battery passports
 * may only carry `gs1` or `iso15459` product identifiers.
 */
export interface Iso15459Identifier {
  scheme: "iso15459";
  /**
   * Registered issuing agency code — 1–3 upper-case alphanumeric characters.
   * The first character is always a letter: GS1 holds the all-digit code range.
   */
  issuingAgencyCode: string;
  primaryId: string;
  /** Instance-level serial, when present. */
  serial?: string;
  /** The identifier in the issuing agency's canonical string form. */
  raw: string;
  /** The URI form of this identifier, when the agency provides one. */
  uri?: string;
}

/** IEC 61406 Identification Link (EN 18219 scheme 2). An https URL. */
export interface Iec61406Identifier {
  scheme: "iec61406";
  /** The Identification Link URI (an https URL, RFC 3986-valid, ASCII-only). */
  uri: string;
}

/**
 * W3C DID Core identifier (EN 18219 scheme 3).
 * did:web, did:ethr and did:ebsi are examples in EN 18219 5.4.1, not a closed
 * list — any DID Core syntax is accepted. No method allow-list is enforced.
 */
export interface DidIdentifier {
  scheme: "did";
  /** The full DID string, e.g. `"did:web:example.com"`. */
  did: string;
  /** The DID method, e.g. `"web"`, `"ethr"`, `"ebsi"`. */
  method: string;
}

/**
 * DOI (EN 18219 scheme 5; ISO 26324).
 * Stored in bare form: `10.<registrant>/<suffix>`. Accepts `doi:` and
 * `https://doi.org/` prefixes on input; always normalised to bare form here.
 */
export interface DoiIdentifier {
  scheme: "doi";
  /** The DOI in bare form, e.g. `"10.1234/example-suffix"`. Case-insensitive; stored as lower-case. */
  doi: string;
  /**
   * Granularity of the DOI assignment per EN 18219 §5.6.2(b).
   *
   * Required on create/validation — tells the data consumer whether the DOI
   * identifies a model (all identical physical objects share one DOI), a batch
   * (all items in a production run share one DOI), or an individual item
   * (each physical unit has a unique DOI).
   */
  granularity?: "model" | "batch" | "item";
}

/**
 * A scheme-tagged product identifier per EN 18219.
 *
 * Discriminated on `scheme`. EN 18219 scheme 4 ("identification for products
 * and product groups") is not yet modelled — clause 5.4.2 onward is unread.
 *
 * **Battery passports** accept only `gs1` and `iso15459`; Battery Regulation
 * Art. 77(3) requires ISO/IEC 15459 until a delegated act replaces it with
 * EN 18219.
 */
export type ProductIdentifier =
  | Gs1Identifier
  | Iso15459Identifier
  | Iec61406Identifier
  | DidIdentifier
  | DoiIdentifier;

// ─── Scheme-tagged operator and facility identifiers (EN 18219) ─────────────

/**
 * ISO/IEC 6523 economic-operator identifier (EN 18219 scheme 6).
 * Common ICD values: `"0199"` = LEI (ISO 17442), `"0088"` = GLN, `"0060"` = DUNS.
 */
export interface Iso6523Identifier {
  scheme: "iso6523";
  /** 4-digit International Code Designator, e.g. `"0199"` for LEI. */
  icd: string;
  value: string;
}

/**
 * Scheme-tagged economic-operator identifier per EN 18219.
 * Schemes 6 (ISO/IEC 6523), 7 (GLN via ISO/IEC 15418), 8 (DID), 9 (DOI).
 *
 * **LEI** is carried as `{scheme: "iso6523", icd: "0199", value: "<20-char LEI>"}`.
 * LEI is not a product identifier (EN 18219 clause 5.1 limits products to
 * schemes 1–5, none of which is LEI).
 */
export type OperatorIdentifier =
  | Iso6523Identifier
  | { scheme: "gln"; gln: string }
  | { scheme: "did"; did: string }
  | { scheme: "doi"; doi: string };

/**
 * Facility identifier per EN 18219 §6.1–6.5.
 *
 * EN 18219 specifies the same four schemes for facilities as for operators
 * (ISO/IEC 6523, GLN/ISO 15418, DID, DOI). All four are supported here.
 */
export type FacilityIdentifier =
  | { scheme: "iso6523"; icd: string; value: string }
  | { scheme: "gln"; gln: string; extension?: string }
  | { scheme: "did"; did: string }
  | { scheme: "doi"; doi: string };

export interface Passport {
  /**
   * Scheme-tagged product identifier per EN 18219.
   *
   * New code should set this field. `gs1` is kept as a deprecated alias for an
   * existing GS1 identifier and is read by the platform's legacy path.
   */
  identifier?: ProductIdentifier;
  /**
   * @deprecated Use `identifier` with `scheme: "gs1"` instead. Kept
   * indefinitely as a read alias; the platform's v1 API accepts both.
   *
   * **Precedence:** when both `identifier` and `gs1` are present, `identifier`
   * takes precedence. Use `resolveProductIdentifier(passport)` from
   * `@tracepass/dpp-identifiers` to read the canonical identifier without
   * duplicating this precedence logic.
   */
  gs1?: {
    gtin: string;
    serialNumber: string;
    digitalLinkUri?: string;
  };
  status: PassportStatus;
  fields: Record<string, PassportField>;
  parties?: Partial<Record<PartyRole, Party>>;
  batteryProfile?: BatteryProfile;
  /**
   * Generic condition-classification flags (new canonical location).
   * The accessor `resolveConditionProfile(passport)` reads this first,
   * then falls back to `batteryProfile` for pre-migration passports.
   */
  conditionProfile?: ConditionProfile;
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
