// QR-Code als SVG (z. B. für die Adresse der Weboberfläche am Desktop).
import QRCode from 'qrcode';

export function qrCodeSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
}
