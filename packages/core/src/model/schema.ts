// Datenmodell von Steckplan (siehe PLAN.md, Abschnitt 6).
// Alle Maße in Millimetern, Winkel in Grad, jede Entität mit stabiler `id`.
// Jede Änderung hier, die bestehende Dateien betrifft, braucht: schemaVersion erhöhen + Migration + Test.
import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 3;

const id = z.string().min(1);
const isoDate = z.string();
const mm = z.number().finite();

export const PointSchema = z.object({ x: mm, y: mm });
export type Point = z.infer<typeof PointSchema>;

export const LastModifiedSchema = z.object({ at: isoDate, by: z.string() });

export const CheckMarkSchema = z.object({
  at: isoDate,
  by: z.string(),
  status: z.enum(['ok', 'missing', 'damaged']),
  note: z.string().optional(),
});
export type CheckMark = z.infer<typeof CheckMarkSchema>;

export const CheckSchema = z.object({
  out: CheckMarkSchema.optional(),
  in: CheckMarkSchema.optional(),
});

// ---------- Ebenen & Zeichnungsformen ----------

export const LayerSchema = z.object({
  id,
  name: z.string(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  order: z.number().default(0),
});
export type Layer = z.infer<typeof LayerSchema>;

export const ShapeSchema = z.object({
  id,
  layerId: id,
  kind: z.enum(['wall', 'text', 'dimension']),
  points: z.array(PointSchema).default([]),
  text: z.string().optional(),
  rotationDeg: z.number().default(0),
  strokeWidthMm: mm.optional(),
  fontSizeMm: mm.optional(),
});
export type Shape = z.infer<typeof ShapeSchema>;

// ---------- Stammdaten ----------

const masterEntry = { id, name: z.string(), color: z.string().optional(), archived: z.boolean().optional() };
export const CategorySchema = z.object(masterEntry);
export const OwnerSchema = z.object({ ...masterEntry, contact: z.string().optional() });
export const TrailerSchema = z.object({ ...masterEntry, notes: z.string().optional() });
export type Category = z.infer<typeof CategorySchema>;
export type Owner = z.infer<typeof OwnerSchema>;
export type Trailer = z.infer<typeof TrailerSchema>;

export const MasterDataSchema = z.object({
  categories: z.array(CategorySchema).default([]),
  owners: z.array(OwnerSchema).default([]),
  trailers: z.array(TrailerSchema).default([]),
});
export type MasterData = z.infer<typeof MasterDataSchema>;

// ---------- Vorlagen (Bibliothek) ----------

export const PortDefSchema = z.object({
  id,
  label: z.string(),
  connector: z.string(),
  direction: z.enum(['in', 'out', 'bi']),
  signal: z.string(),
  isNetwork: z.boolean().optional(),
});
export type PortDef = z.infer<typeof PortDefSchema>;

/** Ader/Kanal eines Multicore-Kabels: Stecker an beiden Enden und Signalrichtung (seit Format 3) */
export const CableChannelSchema = z.object({
  id,
  label: z.string(),
  connectorA: z.string(),
  connectorB: z.string(),
  /** aToB: Signal geht an Ende A hinein und kommt an Ende B heraus */
  direction: z.enum(['aToB', 'bToA', 'bi']),
  signal: z.string(),
});
export type CableChannel = z.infer<typeof CableChannelSchema>;

export const TemplateKindSchema = z.enum(['device', 'cableType', 'stageElement', 'truss', 'stand']);
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

export const TemplateSchema = z.object({
  id,
  kind: TemplateKindSchema,
  version: z.number().int().nonnegative(),
  updatedAt: isoDate,
  /** Name der Person, die die Vorlage zuletzt geändert hat (seit Format 2) */
  updatedBy: z.string().optional(),
  name: z.string(),
  manufacturer: z.string().optional(),
  categoryId: id.optional(),
  defaultColor: z.string().optional(),
  defaultOwnerId: id.optional(),
  defaultTrailerId: id.optional(),
  shape: z
    .object({
      form: z.enum(['rect', 'circle', 'rounded']),
      widthMm: mm,
      depthMm: mm,
      heightMm: mm.optional(),
    })
    .optional(),
  ports: z.array(PortDefSchema).optional(),
  dmxModes: z.array(z.object({ name: z.string(), channels: z.number().int().positive() })).optional(),
  powerW: z.number().nonnegative().optional(),
  maxMountedDevices: z.number().int().nonnegative().optional(),
  lengthMm: mm.optional(),
  /** Freie Notiz, z. B. Traversen-Querschnitt/Typ (seit Format 2) */
  notes: z.string().optional(),
  // nur Kabeltypen
  connectorA: z.string().optional(),
  connectorB: z.string().optional(),
  signal: z.string().optional(),
  maxLengthMm: mm.optional(),
  availableLengthsMm: z.array(mm).optional(),
  /** Multicore: einzelne Adern/Kanäle (seit Format 3); vorhanden = Multicore */
  channels: z.array(CableChannelSchema).optional(),
  /** Multicore: Namen der Enden, z. B. „Bühne“ und „FOH“ (seit Format 3) */
  endALabel: z.string().optional(),
  endBLabel: z.string().optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

// ---------- Instanzen im Projekt ----------

export const DeviceInstanceSchema = z.object({
  id,
  templateId: id,
  layerId: id,
  label: z.string(),
  colorOverride: z.string().optional(),
  categoryOverride: id.optional(),
  notes: z.string().optional(),
  ownerId: id.optional(),
  trailerId: id.optional(),
  inventoryNo: z.string().optional(),
  stagePlan: z
    .object({
      position: PointSchema,
      rotationDeg: z.number().default(0),
      heightMm: mm.optional(),
      standsOnId: id.optional(),
    })
    .optional(),
  signalFlow: z.object({ position: PointSchema }).optional(),
  mountedOnId: id.optional(),
  dmx: z
    .object({
      modeName: z.string(),
      universe: z.number().int().positive(),
      address: z.number().int().min(1).max(512),
    })
    .optional(),
  network: z
    .array(
      z.object({
        portId: id,
        mode: z.enum(['static', 'dhcp']),
        ip: z.string().optional(),
        subnetId: id.optional(),
        hostname: z.string().optional(),
      }),
    )
    .optional(),
  check: CheckSchema.optional(),
  lastModified: LastModifiedSchema.optional(),
});
export type DeviceInstance = z.infer<typeof DeviceInstanceSchema>;

const cableEnd = z.object({ deviceId: id, portId: id });

export const CableSchema = z.object({
  id,
  templateId: id,
  label: z.string().optional(),
  ownerId: id.optional(),
  trailerId: id.optional(),
  inventoryNo: z.string().optional(),
  categoryOverride: id.optional(),
  from: cableEnd,
  to: cableEnd,
  waypoints: z.array(PointSchema).default([]),
  signalFlowWaypoints: z.array(PointSchema).optional(),
  heightRule: z.enum(['floor', 'direct']).optional(),
  reservePercent: z.number().nonnegative().optional(),
  reservePerEndMm: mm.optional(),
  manualLengthMm: mm.optional(),
  check: CheckSchema.optional(),
  lastModified: LastModifiedSchema.optional(),
});
export type Cable = z.infer<typeof CableSchema>;

// ---------- Netzwerk ----------

export const SubnetSchema = z.object({
  id,
  name: z.string(),
  cidr: z.string(),
  gateway: z.string().optional(),
  vlanNote: z.string().optional(),
});
export type Subnet = z.infer<typeof SubnetSchema>;

export const WifiNetworkSchema = z.object({
  id,
  ssid: z.string(),
  security: z.enum(['WPA2', 'WPA3', 'WPA2/WPA3', 'open']),
  hidden: z.boolean().default(false),
  accessPointDeviceId: id.optional(),
});
export type WifiNetwork = z.infer<typeof WifiNetworkSchema>;

/** Geschützter Bereich: nie im Yjs-Dokument, nur für edit/local. */
export const SecretsSchema = z.object({
  wifiPasswords: z.array(z.object({ wifiId: id, password: z.string() })).default([]),
});
export type Secrets = z.infer<typeof SecretsSchema>;

// ---------- Änderungsprotokoll ----------

export const AccessSchema = z.enum(['local', 'edit', 'read']);

export const ChangeLogEntrySchema = z.object({
  at: isoDate,
  by: z.string(),
  access: AccessSchema,
  via: z.enum(['desktop', 'browser', 'desktopKey']),
  action: z.string(),
  objectIds: z.array(id).default([]),
});
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

// ---------- Projekt ----------

export const ProjectMetaSchema = z.object({
  name: z.string().default(''),
  venue: z.string().default(''),
  date: z.string().default(''),
  planner: z.string().default(''),
  client: z.string().default(''),
  version: z.string().default(''),
  notes: z.string().default(''),
});
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;

export const ProjectSettingsSchema = z.object({
  gridMm: mm.positive().default(500),
  snap: z.boolean().default(true),
  defaultReservePercent: z.number().nonnegative().default(10),
  defaultReservePerEndMm: mm.nonnegative().default(500),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

const viewState = z.object({ zoom: z.number().positive().default(1), pan: PointSchema.default({ x: 0, y: 0 }) });

export const ProjectViewsSchema = z.object({
  stagePlan: viewState.default({ zoom: 1, pan: { x: 0, y: 0 } }),
  signalFlow: viewState.default({ zoom: 1, pan: { x: 0, y: 0 } }),
});
export type ProjectViews = z.infer<typeof ProjectViewsSchema>;

export const BackgroundSchema = z.object({
  image: z.string(),
  calibration: z
    .object({ p1: PointSchema, p2: PointSchema, realDistanceMm: mm.positive() })
    .optional(),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id,
  libraryId: z.string().default(''),
  meta: ProjectMetaSchema.default(ProjectMetaSchema.parse({})),
  settings: ProjectSettingsSchema.default(ProjectSettingsSchema.parse({})),
  layers: z.array(LayerSchema).default([]),
  shapes: z.array(ShapeSchema).default([]),
  devices: z.array(DeviceInstanceSchema).default([]),
  cables: z.array(CableSchema).default([]),
  network: z
    .object({
      subnets: z.array(SubnetSchema).default([]),
      wifi: z.array(WifiNetworkSchema).default([]),
    })
    .default({ subnets: [], wifi: [] }),
  secrets: SecretsSchema.default({ wifiPasswords: [] }),
  templateSnapshot: z.array(TemplateSchema).default([]),
  masterDataSnapshot: MasterDataSchema.default({ categories: [], owners: [], trailers: [] }),
  views: ProjectViewsSchema.default(ProjectViewsSchema.parse({})),
  background: BackgroundSchema.optional(),
  /** Nur im lokalen Modus in der Datei; auf dem Server getrennt gespeichert. */
  changeLog: z.array(ChangeLogEntrySchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;
