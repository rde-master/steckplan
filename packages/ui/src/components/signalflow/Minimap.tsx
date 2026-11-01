// Minikarte: Übersicht aller Kästen, sichtbarer Ausschnitt; Klick holt die Stelle in die Mitte.
import { useEditor } from '../../lib/editor';
import { texts } from '../../texts';
import { bounds, type DeviceBox } from './model';

const W = 168;
const H = 112;

export function Minimap({ boxes, viewport }: { boxes: DeviceBox[]; viewport: { width: number; height: number } }) {
  const view = useEditor((s) => s.view);
  const focus = useEditor((s) => s.focus);
  const area = bounds(boxes);
  if (!area) return null;
  const visible = { x: -view.x / view.zoom, y: -view.y / view.zoom, width: viewport.width / view.zoom, height: viewport.height / view.zoom };
  const minX = Math.min(area.x, visible.x) - 40;
  const minY = Math.min(area.y, visible.y) - 40;
  const maxX = Math.max(area.x + area.width, visible.x + visible.width) + 40;
  const maxY = Math.max(area.y + area.height, visible.y + visible.height) + 40;
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY));
  const tx = (x: number) => (x - minX) * scale;
  const ty = (y: number) => (y - minY) * scale;
  return (
    <svg
      width={W}
      height={H}
      role="img"
      aria-label={texts.signalflow.minimap}
      className="absolute right-3 bottom-3 hidden cursor-pointer md:block rounded-md border border-slate-300 bg-white/90 shadow dark:border-slate-600 dark:bg-slate-900/90"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        focus({ x: (e.clientX - rect.left) / scale + minX, y: (e.clientY - rect.top) / scale + minY });
      }}
    >
      {boxes.map((b) => (
        <rect key={b.device.id} x={tx(b.x)} y={ty(b.y)} width={Math.max(2, b.layout.width * scale)} height={Math.max(2, b.layout.height * scale)} fill={b.fill} stroke="#475569" strokeWidth={0.5} />
      ))}
      <rect x={tx(visible.x)} y={ty(visible.y)} width={visible.width * scale} height={visible.height * scale} fill="rgba(14,165,233,0.12)" stroke="#0284c7" strokeWidth={1} />
    </svg>
  );
}
