// Datenmodell von Steckplan (siehe PLAN.md, Abschnitt 6).
// Alle Maße in Millimetern, Winkel in Grad, jede Entität mit stabiler `id`.
// Jede Änderung hier, die bestehende Dateien betrifft, braucht: schemaVersion erhöhen + Migration + Test.
import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 9;

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
/** Case (Kiste): kommt mit seinem Inhalt in einen Anhänger (seit Format 4) */
export const CaseSchema = z.object({ ...masterEntry, defaultTrailerId: id.optional(), notes: z.string().optional() });
export type Case = z.infer<typeof CaseSchema>;

export const MasterDataSchema = z.object({
  categories: z.array(CategorySchema).default([]),
  owners: z.array(OwnerSchema).default([]),
  trailers: z.array(TrailerSchema).default([]),
  cases: z.array(CaseSchema).default([]),
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
  /** Stromanschluss (Eingang = Versorgung, Ausgang = Abgang eines Verteilers) (seit Format 4) */
  isPower: z.boolean().optional(),
  /** Absicherung in Ampere (Abgang bzw. Zuleitung eines Verteilers) */
  fuseA: z.number().positive().optional(),
  /** Phase: L1/L2/L3 oder Drehstrom (3P) */
  phase: z.enum(['L1', 'L2', 'L3', '3P']).optional(),
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

// ---------- Lichtfähigkeiten einer Gerätevorlage (Regie, M11c) ----------

export const COLOR_MIXING = ['none', 'rgb', 'rgbw', 'rgba', 'cmy'] as const;
export type ColorMixing = (typeof COLOR_MIXING)[number];

export const LightCapsSchema = z.object({
  /** Gerät erscheint im Lichtaufbau und in den Lichtszenen */
  showInScenes: z.boolean().default(false),
  dimmer: z.boolean().default(true),
  /** Strobe bis zu … Hz (fehlt = kein Strobe) */
  strobeMaxHz: z.number().positive().optional(),
  /** Farbmischung */
  colorMixing: z.enum(COLOR_MIXING).default('none'),
  /** Farbräder mit benannten Farben */
  colorWheels: z.array(z.object({ name: z.string().default(''), colors: z.array(z.object({ name: z.string(), hex: z.string() })).default([]) })).default([]),
  /** Farbtemperatur-Korrektur (CTO/CTB) */
  cto: z.boolean().optional(),
  /** Gobo-Räder: Name, drehbar, Gobos (nur Namen) */
  goboWheels: z.array(z.object({ name: z.string().default(''), rotating: z.boolean().default(false), gobos: z.array(z.string()).default([]) })).default([]),
  /** Prisma: Facetten (fehlt = kein Prisma) */
  prism: z.object({ facets: z.number().int().positive(), rotating: z.boolean().default(false) }).optional(),
  /** Zoom-Bereich in Grad */
  zoom: z.object({ minDeg: z.number().nonnegative(), maxDeg: z.number().nonnegative() }).optional(),
  focus: z.boolean().optional(),
  iris: z.boolean().optional(),
  frost: z.boolean().optional(),
  /** beweglich (Moving Head / Scanner) mit Schwenk-/Neigebereich in Grad */
  moving: z.object({ panDeg: z.number().nonnegative(), tiltDeg: z.number().nonnegative() }).optional(),
});
export type LightCaps = z.infer<typeof LightCapsSchema>;

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
  /** Standard-Case (seit Format 4) */
  defaultCaseId: id.optional(),
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
  /** Lichtfähigkeiten (Regie: Lichtaufbau und -szenen) */
  light: LightCapsSchema.optional(),
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
  /** Gerät wird von einer Person benutzt (Vorgabe, je Gerät änderbar) (seit Format 4) */
  usedByPerson: z.boolean().optional(),
  /** Lagerbestand (Stück); bei Kabeltypen mit festen Längen stattdessen stockByLength (seit Format 4) */
  stock: z.number().int().nonnegative().optional(),
  stockByLength: z.array(z.object({ lengthMm: mm, count: z.number().int().nonnegative() })).optional(),
  /** Stativ: Länge der T-Bar (seit Format 4) */
  tBarLengthMm: mm.nonnegative().optional(),
  /** Mischpult: Eingänge/Ausgänge bilden Input-/Output-Liste (seit Format 4) */
  mixer: z.boolean().optional(),
  /** Quelle braucht 48 V Phantomspeisung (Vorschlag in der Input-Liste) (seit Format 4) */
  phantomPower: z.boolean().optional(),
  /** Mischpult: Anzahl Kanäle, die über das Netzwerk (z. B. von einer digitalen Stagebox) kommen (seit Format 5) */
  networkChannels: z.number().int().nonnegative().max(512).optional(),
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
      /** Multicore: Lage von Ende B (Ende A = position) und Knickpunkte dazwischen (seit Format 3) */
      endB: PointSchema.optional(),
      waypoints: z.array(PointSchema).optional(),
    })
    .optional(),
  /** Multicore: Länge von Hand statt berechnet (seit Format 3) */
  manualLengthMm: mm.optional(),
  /** Signalfluss: Position und Seite (seit Format 5; ohne Seite = erste Seite) */
  signalFlow: z
    .object({
      position: PointSchema,
      pageId: id.optional(),
      /** von Hand gezogene Größe des Kastens (nie kleiner als die automatische) (seit Format 7) */
      width: z.number().positive().max(4000).optional(),
      height: z.number().positive().max(4000).optional(),
    })
    .optional(),
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
  /** Mischpult: Anzahl Netzwerk-Kanäle, überschreibt die Vorlage (seit Format 5) */
  networkChannels: z.number().int().nonnegative().max(512).optional(),
  /**
   * Quelle: Ausgänge auf Kanälen eines Mischpults (über eine digitale Stagebox), je Ausgang eine Zuordnung (seit Format 6).
   * Ohne portId (aus Format 5 übernommen): der erste Ausgang mit durchgehender Kette zu diesem Pult.
   */
  mixerChannels: z.array(z.object({ portId: z.string().optional(), mixerId: id, channel: z.number().int().positive() })).optional(),
  /**
   * Defekte Anschlüsse dieses Geräts (nur im Projekt, nicht in der Bibliothek) (seit Format 8).
   * portId = Anschluss; bei Multicores die Ader (gilt für beide Enden).
   */
  defectivePorts: z.array(z.object({ portId: z.string().min(1), note: z.string().max(500).optional() })).optional(),
  /** Leistung in Watt, überschreibt die Vorlage (seit Format 4) */
  powerW: z.number().nonnegative().optional(),
  /** Benutzt von Mensch: überschreibt die Vorgabe der Vorlage (seit Format 4) */
  usedByPerson: z.boolean().optional(),
  personId: id.optional(),
  /** Gruppe im Signalfluss (seit Format 4) */
  groupId: id.optional(),
  caseId: id.optional(),
  /** Stativ: Länge der T-Bar, überschreibt die Vorlage (seit Format 4) */
  tBarLengthMm: mm.nonnegative().optional(),
  /** Am Stativ: hängt unten (Standard) oder steht oben auf der T-Bar (seit Format 4) */
  mountSide: z.enum(['bottom', 'top']).optional(),
  check: CheckSchema.optional(),
  lastModified: LastModifiedSchema.optional(),
});
export type DeviceInstance = z.infer<typeof DeviceInstanceSchema>;

const cableEnd = z.object({ deviceId: id, portId: id });

export const CableSchema = z.object({
  id,
  /** Kabeltyp; fehlt bei direkt gesteckten Verbindungen (direct) */
  templateId: id.optional(),
  /** Direkt gesteckt (z. B. Multicore-Fan-out ins Pult): kein eigenes Kabel, erscheint nicht in Pack-/Kabellisten (seit Format 3) */
  direct: z.boolean().optional(),
  label: z.string().optional(),
  ownerId: id.optional(),
  trailerId: id.optional(),
  inventoryNo: z.string().optional(),
  categoryOverride: id.optional(),
  /** Case, in das das Kabel gepackt wird (seit Format 4) */
  caseId: id.optional(),
  /** Notiz (seit Format 3) */
  notes: z.string().optional(),
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

// ---------- Personen, Gruppen, Cases im Projekt (seit Format 4) ----------

export const PersonSchema = z.object({
  id,
  lastName: z.string().default(''),
  firstName: z.string().default(''),
  /** Art, z. B. Musiker, Moderator, Redner (Freitext) */
  kind: z.string().default(''),
});
export type Person = z.infer<typeof PersonSchema>;

export const GroupSchema = z.object({ id, name: z.string(), color: z.string().optional() });
export type Group = z.infer<typeof GroupSchema>;

/** Case → Anhänger in diesem Projekt (id = Case-id); ohne Eintrag gilt der Standard-Anhänger des Cases */
export const CaseTrailerSchema = z.object({ id, trailerId: id.optional() });
export type CaseTrailer = z.infer<typeof CaseTrailerSchema>;

/** Angaben je Pult-Anschluss in Input-/Output-Liste (id = „Pult-Geräte-id:Anschluss-id“) (seit Format 4) */
export const PatchEntrySchema = z.object({
  id,
  name: z.string().optional(),
  phantom: z.boolean().optional(),
  stand: z.string().optional(),
  notes: z.string().optional(),
});
export type PatchEntry = z.infer<typeof PatchEntrySchema>;

/** Seite im Signalfluss, z. B. „Licht“, „Ton“ (seit Format 5) */
export const FlowPageSchema = z.object({ id, name: z.string(), order: z.number().default(0) });
export type FlowPage = z.infer<typeof FlowPageSchema>;

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

export const AccessSchema = z.enum(['local', 'edit', 'read', 'direction']);

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
  /** Kabellinien im Signalfluss: eckig (Standard) oder geschwungen (seit Format 7) */
  cableStyle: z.enum(['square', 'curved']).optional(),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

const viewState = z.object({ zoom: z.number().positive().default(1), pan: PointSchema.default({ x: 0, y: 0 }) });

export const ProjectViewsSchema = z.object({
  stagePlan: viewState.default({ zoom: 1, pan: { x: 0, y: 0 } }),
  signalFlow: viewState.default({ zoom: 1, pan: { x: 0, y: 0 } }),
});
export type ProjectViews = z.infer<typeof ProjectViewsSchema>;

export const BackgroundSchema = z.object({
  /** Bild als data-URL (PDF wird beim Import in ein Bild umgewandelt) */
  image: z.string(),
  /** Bildgröße in Pixeln (seit Format 3) */
  widthPx: z.number().positive().optional(),
  heightPx: z.number().positive().optional(),
  /** Referenzstrecke: zwei Punkte im Bild (Pixel) und ihr echter Abstand */
  calibration: z
    .object({ p1: PointSchema, p2: PointSchema, realDistanceMm: mm.positive() })
    .optional(),
  /** Lage der linken oberen Bildecke im Plan (mm) (seit Format 3) */
  offset: PointSchema.optional(),
  /** Deckkraft 0–1 (seit Format 3) */
  opacity: z.number().min(0).max(1).optional(),
});
export type Background = z.infer<typeof BackgroundSchema>;

// ---------- Regie (seit Format 9) ----------

export const SHOW_ITEM_KINDS = ['song', 'play', 'break', 'announcement'] as const;
export type ShowItemKind = (typeof SHOW_ITEM_KINDS)[number];

export const ShowRoleSchema = z.object({ id, name: z.string(), personId: id.optional() });
export type ShowRole = z.infer<typeof ShowRoleSchema>;

/** Datei im Medienspeicher (nicht in der Projektdatei); das Projekt hält nur den Verweis */
export const MediaRefSchema = z.object({
  id,
  name: z.string(),
  mime: z.string().default(''),
  sizeBytes: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative().optional(),
  sha256: z.string().default(''),
  addedAt: z.string().default(''),
  addedBy: z.string().default(''),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

/** Audiodatei an einem Lied (z. B. Playback, Klick) */
export const ItemMediaSchema = z.object({ mediaId: id, label: z.string().default(''), isDefault: z.boolean().optional() });
export type ItemMedia = z.infer<typeof ItemMediaSchema>;

/** Eintrag im Ablauf: Lied, Schauspiel, Pause, Ansage */
export const ShowItemSchema = z.object({
  id,
  order: z.number(),
  kind: z.enum(SHOW_ITEM_KINDS),
  title: z.string().default(''),
  /** Lied: Interpret/Komponist */
  artist: z.string().optional(),
  durationSec: z.number().nonnegative().optional(),
  personIds: z.array(id).default([]),
  notes: z.string().optional(),
  /** Schauspiel: Rollen, optional mit Person */
  roles: z.array(ShowRoleSchema).optional(),
  /** Lied: Audiodateien (eine davon Standard) */
  media: z.array(ItemMediaSchema).optional(),
});
export type ShowItem = z.infer<typeof ShowItemSchema>;

export const SECTION_KINDS = ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro', 'scene', 'other'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const TextLineSchema = z.object({
  id,
  text: z.string(),
  /** Schauspiel: wer spricht */
  roleId: id.optional(),
  /** Regieanweisung (ohne Rolle) */
  direction: z.boolean().optional(),
  /** Zeitpunkt im Lied (Sekunden) für mitlaufenden Text (ab M11b) */
  atSec: z.number().nonnegative().optional(),
});
export type TextLine = z.infer<typeof TextLineSchema>;

/** Textabschnitt eines Eintrags (Strophe, Refrain, Auftritt …) */
export const TextSectionSchema = z.object({
  id,
  itemId: id,
  order: z.number(),
  kind: z.enum(SECTION_KINDS),
  label: z.string().default(''),
  lines: z.array(TextLineSchema).default([]),
});
export type TextSection = z.infer<typeof TextSectionSchema>;

/** Raster des Lichtaufbaus (je Projekt) */
export const LightGridSchema = z.object({
  cols: z.number().int().min(1).max(48).default(12),
  rows: z.number().int().min(1).max(24).default(6),
  /** Bezeichnungen der Zeilen (z. B. „Traverse hinten“) */
  rowLabels: z.array(z.string()).default([]),
});
export type LightGrid = z.infer<typeof LightGridSchema>;

/** Platz eines Geräts im Raster (id = Kennung des Geräts); ohne col/row = nicht im Raster */
export const LightPlacementSchema = z.object({
  id,
  col: z.number().int().nonnegative().optional(),
  row: z.number().int().nonnegative().optional(),
  /** im Lichtaufbau ausgeblendet */
  hidden: z.boolean().optional(),
});
export type LightPlacement = z.infer<typeof LightPlacementSchema>;

/** Benanntes Ziel für bewegliche Lichter (optional mit Punkt im Bühnenplan, mm) */
export const LightTargetSchema = z.object({
  id,
  order: z.number(),
  name: z.string().default(''),
  color: z.string().optional(),
  stagePoint: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type LightTarget = z.infer<typeof LightTargetSchema>;

/** Lichtszene eines Ablauf-Eintrags; Auslöser: Zeitpunkt im Lied und/oder Textzeile */
export const LightSceneSchema = z.object({
  id,
  itemId: id,
  order: z.number(),
  name: z.string().default(''),
  notes: z.string().optional(),
  atSec: z.number().nonnegative().optional(),
  lineId: id.optional(),
});
export type LightScene = z.infer<typeof LightSceneSchema>;

export const EFFECT_KINDS = ['circle', 'eight', 'pan', 'tilt', 'wave', 'random', 'chase', 'other'] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];
export const EFFECT_SPEEDS = ['slow', 'medium', 'fast'] as const;

/** Werte eines Geräts in einer Szene (id = „Szene:Gerät“); fehlende Angaben = unverändert/egal */
export const FixtureStateSchema = z.object({
  id: z.string().min(1),
  sceneId: id,
  deviceId: id,
  /** Helligkeit 0–100 % */
  dimmer: z.number().min(0).max(100).optional(),
  /** Farbe (Anzeige) und – aus einem Farbrad – ihr Name */
  color: z.object({ hex: z.string(), name: z.string().optional() }).optional(),
  gobo: z.object({ wheel: z.number().int().nonnegative(), name: z.string(), rotate: z.enum(['cw', 'ccw']).optional() }).optional(),
  prism: z.boolean().optional(),
  zoomDeg: z.number().nonnegative().optional(),
  /** Fokus, Iris, Frost in % */
  focus: z.number().min(0).max(100).optional(),
  iris: z.number().min(0).max(100).optional(),
  frost: z.number().min(0).max(100).optional(),
  strobeHz: z.number().nonnegative().optional(),
  targetId: id.optional(),
  effect: z.object({ kind: z.enum(EFFECT_KINDS), speed: z.enum(EFFECT_SPEEDS).optional(), text: z.string().optional() }).optional(),
  notes: z.string().optional(),
});
export type FixtureState = z.infer<typeof FixtureStateSchema>;
/** Die einstellbaren Werte (ohne Kennungen) */
export type FixtureValues = Omit<FixtureState, 'id' | 'sceneId' | 'deviceId'>;

export const ShowSettingsSchema = z.object({
  /** Beginn des Ablaufs „HH:MM“ */
  startTime: z.string().optional(),
});
export type ShowSettings = z.infer<typeof ShowSettingsSchema>;

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
  people: z.array(PersonSchema).default([]),
  groups: z.array(GroupSchema).default([]),
  caseTrailers: z.array(CaseTrailerSchema).default([]),
  patch: z.array(PatchEntrySchema).default([]),
  flowPages: z.array(FlowPageSchema).default([]),
  /** Regie: Ablauf und Texte (seit Format 9) */
  show: z
    .object({
      items: z.array(ShowItemSchema).default([]),
      sections: z.array(TextSectionSchema).default([]),
    })
    .default({ items: [], sections: [] }),
  showSettings: ShowSettingsSchema.default({}),
  /** Verweise auf Dateien im Medienspeicher (seit Format 9) */
  media: z.array(MediaRefSchema).default([]),
  /** Lichtaufbau: Raster, Platz der Geräte, Ziele (seit Format 9) */
  lightGrid: LightGridSchema.default({ cols: 12, rows: 6, rowLabels: [] }),
  lightPlacements: z.array(LightPlacementSchema).default([]),
  lightTargets: z.array(LightTargetSchema).default([]),
  /** Lichtszenen und Werte je Gerät (seit Format 9) */
  lightScenes: z.array(LightSceneSchema).default([]),
  sceneStates: z.array(FixtureStateSchema).default([]),
  network: z
    .object({
      subnets: z.array(SubnetSchema).default([]),
      wifi: z.array(WifiNetworkSchema).default([]),
    })
    .default({ subnets: [], wifi: [] }),
  secrets: SecretsSchema.default({ wifiPasswords: [] }),
  templateSnapshot: z.array(TemplateSchema).default([]),
  masterDataSnapshot: MasterDataSchema.default({ categories: [], owners: [], trailers: [], cases: [] }),
  views: ProjectViewsSchema.default(ProjectViewsSchema.parse({})),
  background: BackgroundSchema.optional(),
  /** Nur im lokalen Modus in der Datei; auf dem Server getrennt gespeichert. */
  changeLog: z.array(ChangeLogEntrySchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;
